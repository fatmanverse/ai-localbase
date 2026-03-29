#!/usr/bin/env bash
set -Eeo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${REPO_ROOT}"

source_if_exists() {
  local file="$1"
  if [[ -f "${file}" ]]; then
    set +u
    # shellcheck disable=SC1090
    source "${file}" || true
    set -u
  fi
}

source_if_exists /etc/profile
source_if_exists "$HOME/.bash_profile"
source_if_exists "$HOME/.bashrc"

set -u

UPGRADE_MODE="${UPGRADE_MODE:-git}"
REMOTE="${REMOTE:-origin}"
CURRENT_BRANCH="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
REF="${REF:-${CURRENT_BRANCH:-main}}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
ENV_FILE="${ENV_FILE:-.env}"
EXTRA_COMPOSE_FILE="${EXTRA_COMPOSE_FILE:-}"
IMAGE_OVERRIDE_FILE="${IMAGE_OVERRIDE_FILE:-docker-compose.image.override.yml}"
BACKEND_IMAGE="${BACKEND_IMAGE:-}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-}"
BACKEND_DATA_DIR="${BACKEND_DATA_DIR:-backend/data}"
QDRANT_STORAGE_DIR="${QDRANT_STORAGE_DIR:-qdrant_storage}"
BACKUP_ROOT="${BACKUP_ROOT:-backups/upgrade}"
BACKUP_COMPRESS="${BACKUP_COMPRESS:-0}"
SKIP_BACKUP="${SKIP_BACKUP:-0}"
AUTO_STASH="${AUTO_STASH:-0}"
PULL_QDRANT="${PULL_QDRANT:-1}"
SKIP_IMAGE_PREFLIGHT="${SKIP_IMAGE_PREFLIGHT:-0}"
DRY_RUN="${DRY_RUN:-0}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
STASH_NAME="ai-localbase-upgrade-${TIMESTAMP}"
STASH_CREATED=0
ACTIVE_IMAGE_OVERRIDE_FILE=""
COMPOSE_BIN=()
COMPOSE_CMD=()

log() {
  echo "==> $*"
}

warn() {
  echo "警告: $*" >&2
}

die() {
  echo "错误: $*" >&2
  exit 1
}

run_cmd() {
  if [[ "${DRY_RUN}" == "1" ]]; then
    printf '[DRY RUN]'
    for arg in "$@"; do
      printf ' %q' "$arg"
    done
    printf '
'
    return 0
  fi

  "$@"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "未找到命令：$1"
}

inspect_image() {
  local image="$1"
  local output=""

  if output="$(docker manifest inspect "${image}" 2>&1)"; then
    return 0
  fi

  if output="$(docker pull "${image}" 2>&1)"; then
    return 0
  fi

  echo "${output}"
  return 1
}

preflight_image() {
  local image="$1"
  local output=""

  log "校验镜像是否可用：${image}"
  if output="$(inspect_image "${image}")"; then
    return 0
  fi

  if grep -Eqi 'manifest( unknown| for)|not found' <<<"${output}"; then
    die $'镜像不存在或尚未推送：'"${image}"$'
- 请先确认镜像 tag 是否已推送到仓库
- 当前可先手工检查：docker manifest inspect '"${image}"$'
- 若你是按本仓库已发布稳定版升级，请优先使用已推送的版本号（当前仓库 tag 含 v1.0.0）'
  fi

  die $'镜像校验失败：'"${image}"$'
'"${output}"$'
- 请检查镜像仓库网络、登录状态或仓库地址是否正确
- 如确认仓库可用，也可临时加 SKIP_IMAGE_PREFLIGHT=1 跳过预检，由 compose pull 阶段继续拉取'
}

preflight_image_upgrade() {
  [[ -n "${BACKEND_IMAGE}" ]] || die "镜像升级模式下必须提供 BACKEND_IMAGE"
  [[ -n "${FRONTEND_IMAGE}" ]] || die "镜像升级模式下必须提供 FRONTEND_IMAGE"

  if [[ "${SKIP_IMAGE_PREFLIGHT}" == "1" ]]; then
    warn "已跳过镜像预检（SKIP_IMAGE_PREFLIGHT=1）"
    return 0
  fi

  preflight_image "${BACKEND_IMAGE}"
  preflight_image "${FRONTEND_IMAGE}"
}

init_compose_bin() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_BIN=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_BIN=(docker-compose)
  else
    die "当前环境既不支持 docker compose，也未安装 docker-compose。"
  fi
}

refresh_compose_cmd() {
  COMPOSE_CMD=("${COMPOSE_BIN[@]}")

  if [[ -f "${ENV_FILE}" ]]; then
    COMPOSE_CMD+=(--env-file "${ENV_FILE}")
  fi

  COMPOSE_CMD+=(-f "${COMPOSE_FILE}")
  ACTIVE_IMAGE_OVERRIDE_FILE=""

  if [[ -n "${EXTRA_COMPOSE_FILE}" ]]; then
    COMPOSE_CMD+=(-f "${EXTRA_COMPOSE_FILE}")
    ACTIVE_IMAGE_OVERRIDE_FILE="${EXTRA_COMPOSE_FILE}"
  elif [[ "${UPGRADE_MODE}" == "image" && -f "${IMAGE_OVERRIDE_FILE}" ]]; then
    COMPOSE_CMD+=(-f "${IMAGE_OVERRIDE_FILE}")
    ACTIVE_IMAGE_OVERRIDE_FILE="${IMAGE_OVERRIDE_FILE}"
  fi
}

compose_cmd() {
  if [[ "${DRY_RUN}" == "1" ]]; then
    printf '[DRY RUN]'
    for arg in "${COMPOSE_CMD[@]}"; do
      printf ' %q' "$arg"
    done
    for arg in "$@"; do
      printf ' %q' "$arg"
    done
    printf '
'
    return 0
  fi

  "${COMPOSE_CMD[@]}" "$@"
}

cleanup_on_error() {
  local exit_code=$?
  if [[ ${exit_code} -ne 0 ]]; then
    warn "升级过程中发生错误，现有数据目录未删除：${BACKEND_DATA_DIR} / ${QDRANT_STORAGE_DIR}"
    if [[ "${STASH_CREATED}" == "1" ]]; then
      warn "本次升级前的本地改动已临时保存到 git stash：${STASH_NAME}"
      warn "可执行 git stash list 查看，必要时手动恢复。"
    fi
  fi
  exit ${exit_code}
}
trap cleanup_on_error ERR

compare_env_keys() {
  if [[ ! -f ".env.example" || ! -f "${ENV_FILE}" ]]; then
    return 0
  fi

  python3 - "${ENV_FILE}" <<'PY2'
from pathlib import Path
import sys

def parse_env(path: Path):
    result = []
    for line in path.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith('#') or '=' not in stripped:
            continue
        result.append(stripped.split('=', 1)[0].strip())
    return set(result)

example = parse_env(Path('.env.example'))
actual = parse_env(Path(sys.argv[1]))
missing = sorted(example - actual)
for key in missing:
    print(key)
PY2
}

create_backup() {
  local backup_dir="${BACKUP_ROOT}/${TIMESTAMP}"
  local archive_path="${backup_dir}/ai-localbase-upgrade-${TIMESTAMP}.tar"
  local meta_file="${backup_dir}/upgrade-meta.txt"
  local paths=()

  mkdir -p "${backup_dir}"

  [[ -f "${ENV_FILE}" ]] && paths+=("${ENV_FILE}")
  [[ -f ".env.example" ]] && paths+=(".env.example")
  [[ -f "${COMPOSE_FILE}" ]] && paths+=("${COMPOSE_FILE}")
  [[ -f "docker-compose.override.yml" ]] && paths+=("docker-compose.override.yml")
  [[ -f "${IMAGE_OVERRIDE_FILE}" ]] && paths+=("${IMAGE_OVERRIDE_FILE}")
  if [[ -n "${EXTRA_COMPOSE_FILE}" && -f "${EXTRA_COMPOSE_FILE}" && "${EXTRA_COMPOSE_FILE}" != "${COMPOSE_FILE}" ]]; then
    paths+=("${EXTRA_COMPOSE_FILE}")
  fi
  [[ -d "${BACKEND_DATA_DIR}" ]] && paths+=("${BACKEND_DATA_DIR}")
  [[ -d "${QDRANT_STORAGE_DIR}" ]] && paths+=("${QDRANT_STORAGE_DIR}")

  {
    echo "time=${TIMESTAMP}"
    echo "repo_root=${REPO_ROOT}"
    echo "git_branch=${CURRENT_BRANCH:-detached}"
    echo "git_head=$(git rev-parse HEAD 2>/dev/null || true)"
    echo "target_ref=${REF}"
    echo "upgrade_mode=${UPGRADE_MODE}"
    echo "backend_image=${BACKEND_IMAGE}"
    echo "frontend_image=${FRONTEND_IMAGE}"
    echo "image_override_file=${IMAGE_OVERRIDE_FILE}"
    echo "active_override_file=${ACTIVE_IMAGE_OVERRIDE_FILE}"
    echo "backend_data_dir=${BACKEND_DATA_DIR}"
    echo "qdrant_storage_dir=${QDRANT_STORAGE_DIR}"
    echo "compose_file=${COMPOSE_FILE}"
    echo "env_file=${ENV_FILE}"
  } > "${meta_file}"

  if [[ ${#paths[@]} -eq 0 ]]; then
    warn "未找到可备份的持久化目录，跳过归档。"
    return 0
  fi

  if [[ "${BACKUP_COMPRESS}" == "1" ]]; then
    archive_path+=".gz"
    log "创建压缩备份：${archive_path}"
    run_cmd tar -czf "${archive_path}" "${paths[@]}"
  else
    log "创建备份：${archive_path}"
    run_cmd tar -cf "${archive_path}" "${paths[@]}"
  fi

  log "备份完成：${backup_dir}"
}

stash_git_changes_if_needed() {
  local tracked_changes=""
  tracked_changes="$(git status --porcelain --untracked-files=no)"

  if [[ -n "${tracked_changes}" ]]; then
    if [[ "${AUTO_STASH}" == "1" ]]; then
      log "检测到已跟踪文件有改动，先自动 stash"
      run_cmd git stash push -m "${STASH_NAME}"
      STASH_CREATED=1
    else
      echo "${tracked_changes}" >&2
      die "检测到已跟踪文件存在未提交改动。请先提交/暂存，或使用 AUTO_STASH=1 bash upgrade.sh"
    fi
  fi
}

update_git_code() {
  stash_git_changes_if_needed

  log "获取远端代码：${REMOTE}"
  run_cmd git fetch --tags "${REMOTE}"

  if git show-ref --verify --quiet "refs/remotes/${REMOTE}/${REF}"; then
    if [[ "${CURRENT_BRANCH}" != "${REF}" ]]; then
      if git show-ref --verify --quiet "refs/heads/${REF}"; then
        log "切换到本地分支：${REF}"
        run_cmd git checkout "${REF}"
      else
        log "创建并切换到分支：${REF}"
        run_cmd git checkout -B "${REF}" "${REMOTE}/${REF}"
      fi
    fi

    log "快进升级到 ${REMOTE}/${REF}"
    run_cmd git pull --ff-only "${REMOTE}" "${REF}"
  else
    log "目标 ${REF} 不是远端分支，按 tag/commit checkout"
    run_cmd git checkout "${REF}"
  fi
}

write_image_override_file() {
  [[ -n "${BACKEND_IMAGE}" ]] || die "镜像升级模式下必须提供 BACKEND_IMAGE"
  [[ -n "${FRONTEND_IMAGE}" ]] || die "镜像升级模式下必须提供 FRONTEND_IMAGE"

  log "生成镜像覆盖文件：${IMAGE_OVERRIDE_FILE}"

  if [[ "${DRY_RUN}" == "1" ]]; then
    cat <<EOF
[DRY RUN] 将写入 ${IMAGE_OVERRIDE_FILE}:
services:
  backend:
    image: ${BACKEND_IMAGE}
    build: null
  frontend:
    image: ${FRONTEND_IMAGE}
    build: null
EOF
    return 0
  fi

  cat > "${IMAGE_OVERRIDE_FILE}" <<EOF
services:
  backend:
    image: ${BACKEND_IMAGE}
    build: null
  frontend:
    image: ${FRONTEND_IMAGE}
    build: null
EOF
}

prepare_image_upgrade() {
  preflight_image_upgrade
  write_image_override_file
  refresh_compose_cmd
}

rebuild_services() {
  if [[ "${PULL_QDRANT}" == "1" ]]; then
    log "尝试拉取 qdrant 基础镜像"
    compose_cmd pull qdrant || warn "qdrant 镜像拉取失败，继续使用本地已有镜像。"
  fi

  if [[ "${UPGRADE_MODE}" == "image" ]]; then
    log "开始通过镜像升级 backend / frontend"
    compose_cmd pull backend frontend
    compose_cmd up -d --no-build --remove-orphans
  else
    log "开始重建并升级容器（不会删除数据卷）"
    compose_cmd up -d --build --remove-orphans
  fi

  log "当前容器状态"
  compose_cmd ps
}

print_summary() {
  local missing_keys=""
  missing_keys="$(compare_env_keys || true)"

  echo
  log "升级完成"
  echo "- 升级模式：${UPGRADE_MODE}"
  echo "- 已保留后端数据目录：${BACKEND_DATA_DIR}"
  echo "- 已保留向量数据目录：${QDRANT_STORAGE_DIR}"
  echo "- 已保留上传文档、会话历史、知识库状态（脚本不会执行 down -v）"
  echo "- 使用 Compose 命令：${COMPOSE_BIN[*]}"

  if [[ "${UPGRADE_MODE}" == "image" ]]; then
    echo "- backend 镜像：${BACKEND_IMAGE}"
    echo "- frontend 镜像：${FRONTEND_IMAGE}"
    echo "- 镜像覆盖文件：${IMAGE_OVERRIDE_FILE}"
  fi

  if [[ "${SKIP_BACKUP}" != "1" ]]; then
    echo "- 备份目录：${BACKUP_ROOT}/${TIMESTAMP}"
  fi

  if [[ "${STASH_CREATED}" == "1" ]]; then
    echo "- 升级前的本地代码改动已保存到 stash：${STASH_NAME}"
  fi

  if [[ -n "${missing_keys}" ]]; then
    echo
    warn "检测到 .env 可能缺少以下新变量，请按 .env.example 补充："
    while IFS= read -r key; do
      [[ -n "${key}" ]] && echo "  - ${key}"
    done <<< "${missing_keys}"
  fi
}

usage() {
  cat <<'EOF'
用法：
  bash upgrade.sh

默认模式：
  - 不传 UPGRADE_MODE 时，按“代码升级模式”执行：git pull + compose up --build
  - 传 UPGRADE_MODE=image 时，按“镜像升级模式”执行：pull 指定镜像 + compose up --no-build
  - 脚本会自动兼容 `docker compose` 和老版本 `docker-compose`

常用环境变量：
  UPGRADE_MODE=git|image        升级模式，默认 git
  REMOTE=origin                 远端名称，默认 origin
  REF=main                      代码升级目标分支 / tag / commit，默认当前分支或 main
  AUTO_STASH=1                  若存在已跟踪文件改动，自动 stash 后再升级
  BACKEND_IMAGE=...             镜像升级模式下的后端镜像
  FRONTEND_IMAGE=...            镜像升级模式下的前端镜像
  IMAGE_OVERRIDE_FILE=docker-compose.image.override.yml
                                镜像升级模式下生成的 compose 覆盖文件
  EXTRA_COMPOSE_FILE=...        额外 compose 文件；若不传则自动识别 IMAGE_OVERRIDE_FILE
  SKIP_BACKUP=1                 跳过升级前备份
  BACKUP_COMPRESS=1             备份使用 tar.gz 压缩
  BACKUP_ROOT=backups/upgrade   备份输出目录
  COMPOSE_FILE=docker-compose.yml
  ENV_FILE=.env
  QDRANT_IMAGE=...              覆盖 qdrant 镜像地址（例如私有仓库 / 国内镜像）
  PULL_QDRANT=0                 跳过 qdrant 镜像拉取
  SKIP_IMAGE_PREFLIGHT=1        跳过镜像存在性预检（仅在 registry 特殊环境下使用）
  DRY_RUN=1                     只打印将执行的命令，不真正执行

示例：
  # 代码升级
  REF=main AUTO_STASH=1 bash upgrade.sh

  # 用镜像升级
  UPGRADE_MODE=image   BACKEND_IMAGE=registry.cn-zhangjiakou.aliyuncs.com/ai_localbase/ai-localbase-backend:v1.0.0   FRONTEND_IMAGE=registry.cn-zhangjiakou.aliyuncs.com/ai_localbase/ai-localbase-frontend:v1.0.0   bash upgrade.sh
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

require_cmd git
require_cmd docker
require_cmd tar
require_cmd python3

[[ -d .git ]] || die "当前目录不是 git 仓库根目录：${REPO_ROOT}"
[[ -f "${COMPOSE_FILE}" ]] || die "未找到 compose 文件：${COMPOSE_FILE}"
docker info >/dev/null 2>&1 || die "Docker daemon 不可用，请先启动 Docker。"
init_compose_bin

refresh_compose_cmd

log "准备升级 AI LocalBase"
log "升级模式：${UPGRADE_MODE}"
log "数据目录：${BACKEND_DATA_DIR} / ${QDRANT_STORAGE_DIR}"

if [[ "${SKIP_BACKUP}" != "1" ]]; then
  create_backup
else
  warn "已按要求跳过备份。"
fi

case "${UPGRADE_MODE}" in
  git)
    log "目标远端：${REMOTE}"
    log "目标版本：${REF}"
    update_git_code
    refresh_compose_cmd
    ;;
  image)
    log "backend 镜像：${BACKEND_IMAGE}"
    log "frontend 镜像：${FRONTEND_IMAGE}"
    prepare_image_upgrade
    ;;
  *)
    die "不支持的升级模式：${UPGRADE_MODE}（可选 git / image）"
    ;;
esac

rebuild_services
print_summary

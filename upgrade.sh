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

# 尽量继承服务器已有代理 / PATH 等环境
source_if_exists /etc/profile
source_if_exists "$HOME/.bash_profile"
source_if_exists "$HOME/.bashrc"

set -u

REMOTE="${REMOTE:-origin}"
CURRENT_BRANCH="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
REF="${REF:-${CURRENT_BRANCH:-main}}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
ENV_FILE="${ENV_FILE:-.env}"
BACKEND_DATA_DIR="${BACKEND_DATA_DIR:-backend/data}"
QDRANT_STORAGE_DIR="${QDRANT_STORAGE_DIR:-qdrant_storage}"
BACKUP_ROOT="${BACKUP_ROOT:-backups/upgrade}"
BACKUP_COMPRESS="${BACKUP_COMPRESS:-0}"
SKIP_BACKUP="${SKIP_BACKUP:-0}"
AUTO_STASH="${AUTO_STASH:-0}"
PULL_QDRANT="${PULL_QDRANT:-1}"
DRY_RUN="${DRY_RUN:-0}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
STASH_NAME="ai-localbase-upgrade-${TIMESTAMP}"
STASH_CREATED=0
COMPOSE_CMD=(docker compose -f "${COMPOSE_FILE}")

if [[ -f "${ENV_FILE}" ]]; then
  COMPOSE_CMD+=(--env-file "${ENV_FILE}")
fi

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
    printf '\n'
    return 0
  fi

  "$@"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "未找到命令：$1"
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
    printf '\n'
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
  [[ -d "${BACKEND_DATA_DIR}" ]] && paths+=("${BACKEND_DATA_DIR}")
  [[ -d "${QDRANT_STORAGE_DIR}" ]] && paths+=("${QDRANT_STORAGE_DIR}")

  {
    echo "time=${TIMESTAMP}"
    echo "repo_root=${REPO_ROOT}"
    echo "git_branch=${CURRENT_BRANCH:-detached}"
    echo "git_head=$(git rev-parse HEAD 2>/dev/null || true)"
    echo "target_ref=${REF}"
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

update_git_code() {
  local tracked_changes
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

rebuild_services() {
  if [[ "${PULL_QDRANT}" == "1" ]]; then
    log "尝试拉取 qdrant 基础镜像"
    compose_cmd pull qdrant || warn "qdrant 镜像拉取失败，继续使用本地已有镜像。"
  fi

  log "开始重建并升级容器（不会删除数据卷）"
  compose_cmd up -d --build --remove-orphans

  log "当前容器状态"
  compose_cmd ps
}

print_summary() {
  local missing_keys=""
  missing_keys="$(compare_env_keys || true)"

  echo
  log "升级完成"
  echo "- 已保留后端数据目录：${BACKEND_DATA_DIR}"
  echo "- 已保留向量数据目录：${QDRANT_STORAGE_DIR}"
  echo "- 已保留上传文档、会话历史、知识库状态（脚本不会执行 docker compose down -v）"

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

常用环境变量：
  REMOTE=origin                 远端名称，默认 origin
  REF=main                      升级目标分支 / tag / commit，默认当前分支或 main
  AUTO_STASH=1                  若存在已跟踪文件改动，自动 stash 后再升级
  SKIP_BACKUP=1                 跳过升级前备份
  BACKUP_COMPRESS=1             备份使用 tar.gz 压缩
  BACKUP_ROOT=backups/upgrade   备份输出目录
  COMPOSE_FILE=docker-compose.yml
  ENV_FILE=.env
  PULL_QDRANT=0                 跳过 qdrant 镜像拉取
  DRY_RUN=1                     只打印将执行的命令，不真正执行

示例：
  bash upgrade.sh
  REF=main AUTO_STASH=1 bash upgrade.sh
  REF=v0.2.0 BACKUP_COMPRESS=1 bash upgrade.sh
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
docker compose version >/dev/null 2>&1 || die "当前 Docker 不支持 docker compose。"

log "准备升级 AI LocalBase 代码"
log "目标远端：${REMOTE}"
log "目标版本：${REF}"
log "数据目录：${BACKEND_DATA_DIR} / ${QDRANT_STORAGE_DIR}"

if [[ "${SKIP_BACKUP}" != "1" ]]; then
  create_backup
else
  warn "已按要求跳过备份。"
fi

update_git_code
rebuild_services
print_summary

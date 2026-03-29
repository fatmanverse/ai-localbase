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

TARGET_PATH="${1:-}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
ENV_FILE="${ENV_FILE:-.env}"
EXTRA_COMPOSE_FILE="${EXTRA_COMPOSE_FILE:-}"
IMAGE_OVERRIDE_FILE="${IMAGE_OVERRIDE_FILE:-docker-compose.image.override.yml}"
BACKUP_ROOT="${BACKUP_ROOT:-backups/upgrade}"
BACKUP_DIR="${BACKUP_DIR:-}"
BACKUP_ARCHIVE="${BACKUP_ARCHIVE:-}"
BACKEND_DATA_DIR="${BACKEND_DATA_DIR:-backend/data}"
QDRANT_STORAGE_DIR="${QDRANT_STORAGE_DIR:-qdrant_storage}"
CREATE_SAFETY_BACKUP="${CREATE_SAFETY_BACKUP:-1}"
SAFETY_BACKUP_ROOT="${SAFETY_BACKUP_ROOT:-backups/rollback-safety}"
SAFETY_BACKUP_COMPRESS="${SAFETY_BACKUP_COMPRESS:-0}"
RESTORE_CODE="${RESTORE_CODE:-1}"
RESTORE_BRANCH_MODE="${RESTORE_BRANCH_MODE:-0}"
AUTO_STASH="${AUTO_STASH:-0}"
DRY_RUN="${DRY_RUN:-0}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
STASH_NAME="ai-localbase-rollback-${TIMESTAMP}"
STASH_CREATED=0
SELECTED_BACKUP_DIR=""
SELECTED_BACKUP_ARCHIVE=""
SELECTED_META_FILE=""
RESTORE_GIT_HEAD=""
RESTORE_GIT_BRANCH=""
RESTORE_TARGET_REF=""
ACTIVE_IMAGE_OVERRIDE_FILE=""
COMPOSE_CMD=()

log() { echo "==> $*"; }
warn() { echo "警告: $*" >&2; }
die() { echo "错误: $*" >&2; exit 1; }

run_cmd() {
  if [[ "${DRY_RUN}" == "1" ]]; then
    printf '[DRY RUN]'
    for arg in "$@"; do printf ' %q' "$arg"; done
    printf '
'
    return 0
  fi
  "$@"
}

refresh_compose_cmd() {
  COMPOSE_CMD=(docker compose)
  [[ -f "${ENV_FILE}" ]] && COMPOSE_CMD+=(--env-file "${ENV_FILE}")
  COMPOSE_CMD+=(-f "${COMPOSE_FILE}")
  ACTIVE_IMAGE_OVERRIDE_FILE=""
  if [[ -n "${EXTRA_COMPOSE_FILE}" ]]; then
    COMPOSE_CMD+=(-f "${EXTRA_COMPOSE_FILE}")
    ACTIVE_IMAGE_OVERRIDE_FILE="${EXTRA_COMPOSE_FILE}"
  elif [[ -f "${IMAGE_OVERRIDE_FILE}" ]]; then
    COMPOSE_CMD+=(-f "${IMAGE_OVERRIDE_FILE}")
    ACTIVE_IMAGE_OVERRIDE_FILE="${IMAGE_OVERRIDE_FILE}"
  fi
}

compose_cmd() {
  if [[ "${DRY_RUN}" == "1" ]]; then
    printf '[DRY RUN]'
    for arg in "${COMPOSE_CMD[@]}"; do printf ' %q' "$arg"; done
    for arg in "$@"; do printf ' %q' "$arg"; done
    printf '
'
    return 0
  fi
  "${COMPOSE_CMD[@]}" "$@"
}

require_cmd() { command -v "$1" >/dev/null 2>&1 || die "未找到命令：$1"; }

cleanup_on_error() {
  local exit_code=$?
  if [[ ${exit_code} -ne 0 ]]; then
    warn "回滚过程中发生错误，当前数据目录未自动删除：${BACKEND_DATA_DIR} / ${QDRANT_STORAGE_DIR}"
    [[ -n "${SELECTED_BACKUP_DIR}" ]] && warn "目标回滚备份：${SELECTED_BACKUP_DIR}"
    [[ "${STASH_CREATED}" == "1" ]] && warn "本次回滚前的代码改动已保存到 git stash：${STASH_NAME}"
  fi
  exit ${exit_code}
}
trap cleanup_on_error ERR

usage() {
  cat <<'EOF'
用法：
  bash rollback.sh
  bash rollback.sh backups/upgrade/20250329-120000
  bash rollback.sh backups/upgrade/20250329-120000/ai-localbase-upgrade-20250329-120000.tar.gz

说明：
  - 默认回滚到 backups/upgrade 下最新的一份备份
  - 回滚前默认会先对当前状态做一次保护备份
  - 默认会恢复备份对应的代码版本、配置文件、上传文档和向量数据
  - 若存在 docker-compose.image.override.yml，会自动一并纳入回滚流程

常用环境变量：
  BACKUP_DIR=...                指定备份目录
  BACKUP_ARCHIVE=...            指定备份包（.tar / .tar.gz）
  RESTORE_CODE=0                只恢复数据和配置，不切换代码版本
  RESTORE_BRANCH_MODE=1         恢复代码时尝试切回原分支并 reset 到备份提交
  AUTO_STASH=1                  若存在已跟踪文件改动，自动 stash 后再回滚
  CREATE_SAFETY_BACKUP=0        跳过回滚前保护备份
  SAFETY_BACKUP_COMPRESS=1      保护备份使用 tar.gz
  IMAGE_OVERRIDE_FILE=docker-compose.image.override.yml
  DRY_RUN=1                     只打印将执行的命令，不真正执行
EOF
}

find_latest_backup_dir() {
  [[ -d "${BACKUP_ROOT}" ]] || die "未找到备份根目录：${BACKUP_ROOT}"
  find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d | sort | tail -n 1
}

find_archive_in_dir() {
  local dir="$1"
  local archive=""
  archive="$(find "${dir}" -maxdepth 1 -type f \( -name '*.tar' -o -name '*.tar.gz' -o -name '*.tgz' \) | sort | head -n 1)"
  [[ -n "${archive}" ]] || die "在目录中未找到备份包：${dir}"
  echo "${archive}"
}

resolve_backup_selection() {
  local candidate="${BACKUP_ARCHIVE:-${BACKUP_DIR:-${TARGET_PATH}}}"
  [[ -z "${candidate}" ]] && candidate="$(find_latest_backup_dir)"

  if [[ -f "${candidate}" ]]; then
    SELECTED_BACKUP_ARCHIVE="${candidate}"
    SELECTED_BACKUP_DIR="$(cd "$(dirname "${candidate}")" && pwd)"
  elif [[ -d "${candidate}" ]]; then
    SELECTED_BACKUP_DIR="$(cd "${candidate}" && pwd)"
    SELECTED_BACKUP_ARCHIVE="$(find_archive_in_dir "${SELECTED_BACKUP_DIR}")"
  else
    die "未找到指定备份：${candidate}"
  fi

  SELECTED_META_FILE="${SELECTED_BACKUP_DIR}/upgrade-meta.txt"
}

read_meta_value() {
  local key="$1"
  local file="$2"
  [[ -f "${file}" ]] || return 0
  awk -F= -v target="${key}" '$1 == target {print substr($0, index($0, "=") + 1)}' "${file}" | tail -n 1
}

load_backup_metadata() {
  if [[ ! -f "${SELECTED_META_FILE}" ]]; then
    warn "未找到升级元数据文件：${SELECTED_META_FILE}，将只恢复备份归档内容。"
    return 0
  fi
  RESTORE_GIT_HEAD="$(read_meta_value git_head "${SELECTED_META_FILE}")"
  RESTORE_GIT_BRANCH="$(read_meta_value git_branch "${SELECTED_META_FILE}")"
  RESTORE_TARGET_REF="$(read_meta_value target_ref "${SELECTED_META_FILE}")"
}

create_safety_backup() {
  local backup_dir="${SAFETY_BACKUP_ROOT}/${TIMESTAMP}"
  local archive_path="${backup_dir}/ai-localbase-pre-rollback-${TIMESTAMP}.tar"
  local meta_file="${backup_dir}/rollback-meta.txt"
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
    echo "git_branch=$(git symbolic-ref --quiet --short HEAD 2>/dev/null || echo detached)"
    echo "git_head=$(git rev-parse HEAD 2>/dev/null || true)"
    echo "rollback_from=${SELECTED_BACKUP_DIR}"
    echo "backend_data_dir=${BACKEND_DATA_DIR}"
    echo "qdrant_storage_dir=${QDRANT_STORAGE_DIR}"
  } > "${meta_file}"

  if [[ ${#paths[@]} -eq 0 ]]; then
    warn "未找到可用于保护备份的持久化目录，跳过当前状态备份。"
    return 0
  fi

  if [[ "${SAFETY_BACKUP_COMPRESS}" == "1" ]]; then
    archive_path+=".gz"
    log "创建回滚前保护备份：${archive_path}"
    run_cmd tar -czf "${archive_path}" "${paths[@]}"
  else
    log "创建回滚前保护备份：${archive_path}"
    run_cmd tar -cf "${archive_path}" "${paths[@]}"
  fi
}

prepare_git_for_restore() {
  local tracked_changes="$(git status --porcelain --untracked-files=no)"
  if [[ -n "${tracked_changes}" ]]; then
    if [[ "${AUTO_STASH}" == "1" ]]; then
      log "检测到已跟踪文件有改动，先自动 stash"
      run_cmd git stash push -m "${STASH_NAME}"
      STASH_CREATED=1
    else
      echo "${tracked_changes}" >&2
      die "检测到已跟踪文件存在未提交改动。请先提交/暂存，或使用 AUTO_STASH=1 bash rollback.sh"
    fi
  fi
}

restore_code_version() {
  [[ "${RESTORE_CODE}" == "1" ]] || return 0
  if [[ -z "${RESTORE_GIT_HEAD}" ]]; then
    warn "备份中未记录 git 提交版本，跳过代码恢复。可用 RESTORE_CODE=0 明确关闭此步骤。"
    return 0
  fi

  prepare_git_for_restore

  if ! git cat-file -e "${RESTORE_GIT_HEAD}^{commit}" >/dev/null 2>&1; then
    log "本地未找到目标提交，尝试获取远端代码"
    run_cmd git fetch --all --tags || true
  fi

  git cat-file -e "${RESTORE_GIT_HEAD}^{commit}" >/dev/null 2>&1 || die "无法找到备份对应提交：${RESTORE_GIT_HEAD}"

  if [[ "${RESTORE_BRANCH_MODE}" == "1" && -n "${RESTORE_GIT_BRANCH}" && "${RESTORE_GIT_BRANCH}" != "detached" ]]; then
    log "按分支模式恢复代码：${RESTORE_GIT_BRANCH} -> ${RESTORE_GIT_HEAD}"
    if git show-ref --verify --quiet "refs/heads/${RESTORE_GIT_BRANCH}"; then
      run_cmd git checkout "${RESTORE_GIT_BRANCH}"
    else
      run_cmd git checkout -B "${RESTORE_GIT_BRANCH}" "${RESTORE_GIT_HEAD}"
    fi
    run_cmd git reset --hard "${RESTORE_GIT_HEAD}"
  else
    log "按安全模式恢复代码：checkout 到备份提交（detached HEAD）"
    run_cmd git checkout --detach "${RESTORE_GIT_HEAD}"
  fi
}

remove_restore_targets() {
  local targets=(
    "${ENV_FILE}"
    "${COMPOSE_FILE}"
    "docker-compose.override.yml"
    "${IMAGE_OVERRIDE_FILE}"
    "${BACKEND_DATA_DIR}"
    "${QDRANT_STORAGE_DIR}"
  )

  if [[ -n "${EXTRA_COMPOSE_FILE}" && "${EXTRA_COMPOSE_FILE}" != "${COMPOSE_FILE}" ]]; then
    targets+=("${EXTRA_COMPOSE_FILE}")
  fi

  log "清理将被回滚恢复的配置与数据目录"
  run_cmd rm -rf "${targets[@]}"
}

restore_archive() {
  local archive="$1"
  local tar_args=(-xf)
  case "${archive}" in *.tar.gz|*.tgz) tar_args=(-xzf) ;; esac

  refresh_compose_cmd
  log "停止当前容器（不会删除卷）"
  compose_cmd down --remove-orphans

  remove_restore_targets

  log "从备份恢复文件：${archive}"
  run_cmd tar "${tar_args[@]}" "${archive}" -C "${REPO_ROOT}"

  refresh_compose_cmd
}

restart_services() {
  refresh_compose_cmd
  log "按回滚后的代码和配置重建容器"
  compose_cmd up -d --build --remove-orphans
  log "当前容器状态"
  compose_cmd ps
}

print_summary() {
  echo
  log "回滚完成"
  echo "- 回滚来源：${SELECTED_BACKUP_DIR}"
  echo "- 已恢复数据目录：${BACKEND_DATA_DIR} / ${QDRANT_STORAGE_DIR}"
  echo "- 已恢复上传文档、知识库状态、会话历史和向量数据"
  [[ "${CREATE_SAFETY_BACKUP}" == "1" ]] && echo "- 回滚前保护备份：${SAFETY_BACKUP_ROOT}/${TIMESTAMP}"
  if [[ "${RESTORE_CODE}" == "1" && -n "${RESTORE_GIT_HEAD}" ]]; then
    echo "- 已恢复代码提交：${RESTORE_GIT_HEAD}"
    [[ "${RESTORE_BRANCH_MODE}" != "1" ]] && echo "- 当前仓库处于 detached HEAD，确认无误后可自行切回目标分支"
  fi
  [[ "${STASH_CREATED}" == "1" ]] && echo "- 回滚前本地代码改动已存入 stash：${STASH_NAME}"
  [[ -n "${ACTIVE_IMAGE_OVERRIDE_FILE}" ]] && echo "- 当前生效的 compose 覆盖文件：${ACTIVE_IMAGE_OVERRIDE_FILE}"
}

if [[ "${TARGET_PATH}" == "-h" || "${TARGET_PATH}" == "--help" ]]; then usage; exit 0; fi

require_cmd git
require_cmd docker
require_cmd tar

[[ -d .git ]] || die "当前目录不是 git 仓库根目录：${REPO_ROOT}"
[[ -f "${COMPOSE_FILE}" ]] || die "未找到 compose 文件：${COMPOSE_FILE}"
docker info >/dev/null 2>&1 || die "Docker daemon 不可用，请先启动 Docker。"
docker compose version >/dev/null 2>&1 || die "当前 Docker 不支持 docker compose。"

resolve_backup_selection
load_backup_metadata
refresh_compose_cmd

log "准备执行回滚"
log "回滚备份目录：${SELECTED_BACKUP_DIR}"
log "回滚备份包：${SELECTED_BACKUP_ARCHIVE}"
[[ -n "${RESTORE_GIT_HEAD}" ]] && log "备份对应代码提交：${RESTORE_GIT_HEAD}"

if [[ "${CREATE_SAFETY_BACKUP}" == "1" ]]; then
  create_safety_backup
else
  warn "已按要求跳过回滚前保护备份。"
fi

restore_code_version
restore_archive "${SELECTED_BACKUP_ARCHIVE}"
restart_services
print_summary

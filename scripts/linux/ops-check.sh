#!/usr/bin/env bash
set -Eeo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
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

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
ENV_FILE="${ENV_FILE:-.env}"
EXTRA_COMPOSE_FILE="${EXTRA_COMPOSE_FILE:-}"
IMAGE_OVERRIDE_FILE="${IMAGE_OVERRIDE_FILE:-docker-compose.image.override.yml}"
BACKEND_DATA_DIR="${BACKEND_DATA_DIR:-backend/data}"
QDRANT_STORAGE_DIR="${QDRANT_STORAGE_DIR:-qdrant_storage}"
BACKUP_ROOT="${BACKUP_ROOT:-backups/upgrade}"
SAFETY_BACKUP_ROOT="${SAFETY_BACKUP_ROOT:-backups/rollback-safety}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:4173}"
BACKEND_URL="${BACKEND_URL:-http://localhost:8080}"
QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-5}"
SHOW_COMPOSE_LOGS="${SHOW_COMPOSE_LOGS:-0}"
CHECK_HTTP="${CHECK_HTTP:-1}"
ACTIVE_IMAGE_OVERRIDE_FILE=""
COMPOSE_BIN=()
COMPOSE_CMD=()

log() { echo "==> $*"; }
warn() { echo "警告: $*" >&2; }
die() { echo "错误: $*" >&2; exit 1; }
require_cmd() { command -v "$1" >/dev/null 2>&1 || die "未找到命令：$1"; }
init_compose_bin() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_BIN=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_BIN=(docker-compose)
  else
    die "当前环境既不支持 docker compose，也未安装 docker-compose。"
  fi
}
print_section() { echo; echo "### $*"; }

refresh_compose_cmd() {
  COMPOSE_CMD=("${COMPOSE_BIN[@]}")
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

compose_cmd() { "${COMPOSE_CMD[@]}" "$@"; }

show_dir_status() {
  local label="$1" dir="$2"
  if [[ -d "${dir}" ]]; then
    local size="$(du -sh "${dir}" 2>/dev/null | awk '{print $1}')"
    local count="$(find "${dir}" -mindepth 1 | wc -l | awk '{print $1}')"
    echo "- ${label}: ${dir}（大小：${size:-未知}，条目数：${count:-0}）"
  else
    warn "${label} 不存在：${dir}"
  fi
}

show_latest_backup() {
  local label="$1" root_dir="$2"
  if [[ -d "${root_dir}" ]]; then
    local latest="$(find "${root_dir}" -mindepth 1 -maxdepth 1 -type d | sort | tail -n 1)"
    if [[ -n "${latest}" ]]; then
      echo "- ${label}: ${latest}"
    else
      echo "- ${label}: 当前还没有备份目录"
    fi
  else
    echo "- ${label}: 目录不存在（${root_dir}）"
  fi
}

show_port_status() {
  local port="$1" label="$2"
  if command -v ss >/dev/null 2>&1; then
    if ss -ltn 2>/dev/null | grep -Eq ":${port}\s"; then
      echo "- ${label} 端口 ${port}: 监听中"
    else
      warn "${label} 端口 ${port} 未监听"
    fi
  elif command -v netstat >/dev/null 2>&1; then
    if netstat -ltn 2>/dev/null | grep -Eq ":${port}\s"; then
      echo "- ${label} 端口 ${port}: 监听中"
    else
      warn "${label} 端口 ${port} 未监听"
    fi
  else
    warn "未找到 ss / netstat，跳过端口检查"
  fi
}

check_http_endpoint() {
  local label="$1" url="$2" expected_prefix="${3:-}"
  if [[ "${CHECK_HTTP}" != "1" ]]; then
    echo "- ${label}: 已按参数跳过 HTTP 检查"
    return 0
  fi
  if ! command -v curl >/dev/null 2>&1; then
    warn "未找到 curl，跳过 ${label} HTTP 检查"
    return 0
  fi
  local response="$(curl -fsS -m "${TIMEOUT_SECONDS}" "${url}" 2>/dev/null || true)"
  if [[ -z "${response}" ]]; then
    warn "${label} 不可达：${url}"
    return 0
  fi
  if [[ -n "${expected_prefix}" && "${response}" != ${expected_prefix}* ]]; then
    echo "- ${label}: 可达，但返回内容与预期前缀不同（${url}）"
  else
    echo "- ${label}: 可达（${url}）"
  fi
}

compare_env_keys() {
  if [[ ! -f ".env.example" || ! -f "${ENV_FILE}" ]]; then return 0; fi
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

usage() {
  cat <<'EOF'
用法：
  bash scripts/linux/ops-check.sh

说明：
  - 只做巡检，不修改数据，不启动或停止服务
  - 适合部署后、升级前、升级后、回滚后快速确认环境状态
  - 若存在 docker-compose.image.override.yml，会自动纳入 compose 巡检上下文
  - 脚本会自动兼容 `docker compose` 和老版本 `docker-compose`
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then usage; exit 0; fi

require_cmd git
require_cmd docker
require_cmd tar
require_cmd python3

[[ -d .git ]] || die "当前目录不是 git 仓库根目录：${REPO_ROOT}"
[[ -f "${COMPOSE_FILE}" ]] || die "未找到 compose 文件：${COMPOSE_FILE}"
docker info >/dev/null 2>&1 || die "Docker daemon 不可用，请先启动 Docker。"
init_compose_bin

refresh_compose_cmd

print_section "基础信息"
echo "- 仓库目录：${REPO_ROOT}"
echo "- Compose 文件：${COMPOSE_FILE}"
echo "- 环境文件：${ENV_FILE}"
echo "- 使用 Compose 命令：${COMPOSE_BIN[*]}"
if [[ -n "${ACTIVE_IMAGE_OVERRIDE_FILE}" ]]; then
  echo "- Compose 覆盖文件：${ACTIVE_IMAGE_OVERRIDE_FILE}"
else
  echo "- Compose 覆盖文件：未启用"
fi
echo "- 当前分支：$(git symbolic-ref --quiet --short HEAD 2>/dev/null || echo detached)"
echo "- 当前提交：$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

print_section "容器状态"
if [[ "${SHOW_COMPOSE_LOGS}" == "1" ]]; then
  compose_cmd ps || warn "Compose 状态检查执行失败"
else
  compose_cmd ps || warn "Compose 状态检查执行失败"
fi

print_section "端口监听"
show_port_status 4173 "前端"
show_port_status 8080 "后端"
show_port_status 6333 "Qdrant"

print_section "HTTP 可达性"
check_http_endpoint "前端首页" "${FRONTEND_URL}/" "<!doctype html"
check_http_endpoint "后端健康检查" "${BACKEND_URL}/health"
check_http_endpoint "Qdrant 集合接口" "${QDRANT_URL}/collections" "{"

print_section "数据目录"
show_dir_status "后端数据目录" "${BACKEND_DATA_DIR}"
show_dir_status "Qdrant 存储目录" "${QDRANT_STORAGE_DIR}"

print_section "备份目录"
show_latest_backup "最近升级备份" "${BACKUP_ROOT}"
show_latest_backup "最近回滚保护备份" "${SAFETY_BACKUP_ROOT}"

print_section "环境变量差异"
missing_keys="$(compare_env_keys || true)"
if [[ -n "${missing_keys}" ]]; then
  warn ".env 可能缺少以下变量："
  while IFS= read -r key; do [[ -n "${key}" ]] && echo "- ${key}"; done <<< "${missing_keys}"
else
  echo "- .env 与 .env.example 的关键变量看起来已对齐"
fi

print_section "推荐运维动作"
echo "- 代码升级：REF=main AUTO_STASH=1 bash upgrade.sh"
echo "- 镜像升级：UPGRADE_MODE=image BACKEND_IMAGE=<image> FRONTEND_IMAGE=<image> bash upgrade.sh"
echo "- 快速回滚：bash rollback.sh"
echo "- 指定备份回滚：bash rollback.sh backups/upgrade/<timestamp>"

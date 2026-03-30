#!/usr/bin/env bash
set -Eeo pipefail

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

POSITIONAL_INSTALL_DIR="${1:-}"
POSITIONAL_REGISTRY_PREFIX="${2:-}"

INSTALL_DIR="${INSTALL_DIR:-${POSITIONAL_INSTALL_DIR:-/data/ai-localbase}}"
REGISTRY_PREFIX="${REGISTRY_PREFIX:-${POSITIONAL_REGISTRY_PREFIX:-registry.cn-zhangjiakou.aliyuncs.com/ai_localbase}}"
BACKEND_IMAGE="${BACKEND_IMAGE:-${REGISTRY_PREFIX}/ai-localbase-backend:latest}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-${REGISTRY_PREFIX}/ai-localbase-frontend:latest}"
QDRANT_IMAGE="${QDRANT_IMAGE:-qdrant/qdrant:v1.13.4}"
PULL_QDRANT="${PULL_QDRANT:-0}"
HOST_GATEWAY_IP="${HOST_GATEWAY_IP:-172.17.0.1}"
OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://host.docker.internal:11434}"
QDRANT_URL="${QDRANT_URL:-http://qdrant:6333}"
QDRANT_COLLECTION_PREFIX="${QDRANT_COLLECTION_PREFIX:-kb_}"
QDRANT_VECTOR_SIZE="${QDRANT_VECTOR_SIZE:-768}"
QDRANT_DISTANCE="${QDRANT_DISTANCE:-Cosine}"
QDRANT_TIMEOUT_SECONDS="${QDRANT_TIMEOUT_SECONDS:-5}"
VITE_API_BASE_URL="${VITE_API_BASE_URL:-http://localhost:8080}"
FRONTEND_PORT="${FRONTEND_PORT:-4173}"
BACKEND_PORT="${BACKEND_PORT:-8080}"
QDRANT_HTTP_PORT="${QDRANT_HTTP_PORT:-6333}"
QDRANT_GRPC_PORT="${QDRANT_GRPC_PORT:-6334}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-ai-localbase}"
HTTP_TIMEOUT_SECONDS="${HTTP_TIMEOUT_SECONDS:-5}"
VERIFY_HTTP="${VERIFY_HTTP:-1}"
COMPOSE_BIN=()

usage() {
  cat <<'USAGE'
用法：
  bash upgrade-latest.sh [INSTALL_DIR] [REGISTRY_PREFIX]

说明：
  - 服务器极简升级脚本，不依赖 git
  - 固定拉取 backend / frontend:latest
  - 目录存在则直接升级，不存在则初始化部署

参数：
  INSTALL_DIR      安装目录，默认 /data/ai-localbase
  REGISTRY_PREFIX  镜像仓库前缀，默认 registry.cn-zhangjiakou.aliyuncs.com/ai_localbase

常用环境变量：
  BACKEND_IMAGE=...            自定义 backend 镜像，默认 latest
  FRONTEND_IMAGE=...           自定义 frontend 镜像，默认 latest
  QDRANT_IMAGE=...             自定义 qdrant 镜像
  PULL_QDRANT=0                是否主动 pull qdrant；默认 0
  OLLAMA_BASE_URL=...          模型服务地址
  VITE_API_BASE_URL=...        前端访问后端地址
  HOST_GATEWAY_IP=172.17.0.1   老版本 Docker 的宿主机网关
  VERIFY_HTTP=1                部署后检查 HTTP

示例：
  bash upgrade-latest.sh
  bash upgrade-latest.sh /data/ai-localbase registry.cn-zhangjiakou.aliyuncs.com/ai_localbase
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
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

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "未找到命令：$1"
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

compose_cmd() {
  COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME}" "${COMPOSE_BIN[@]}" -f "${INSTALL_DIR}/docker-compose.yml" "$@"
}

write_compose() {
  cat > "${INSTALL_DIR}/docker-compose.yml" <<COMPOSE
services:
  qdrant:
    image: ${QDRANT_IMAGE}
    restart: unless-stopped
    ports:
      - "${QDRANT_HTTP_PORT}:6333"
      - "${QDRANT_GRPC_PORT}:6334"
    volumes:
      - ./qdrant_storage:/qdrant/storage

  backend:
    image: ${BACKEND_IMAGE}
    restart: unless-stopped
    depends_on:
      - qdrant
    extra_hosts:
      - "host.docker.internal:${HOST_GATEWAY_IP}"
    environment:
      PORT: "8080"
      UPLOAD_DIR: "data/uploads"
      STATE_FILE: "data/app-state.json"
      CHAT_HISTORY_FILE: "data/chat-history.db"
      QDRANT_URL: "${QDRANT_URL}"
      QDRANT_COLLECTION_PREFIX: "${QDRANT_COLLECTION_PREFIX}"
      QDRANT_VECTOR_SIZE: "${QDRANT_VECTOR_SIZE}"
      QDRANT_DISTANCE: "${QDRANT_DISTANCE}"
      QDRANT_TIMEOUT_SECONDS: "${QDRANT_TIMEOUT_SECONDS}"
      OLLAMA_BASE_URL: "${OLLAMA_BASE_URL}"
    ports:
      - "${BACKEND_PORT}:8080"
    volumes:
      - ./backend/data:/app/data

  frontend:
    image: ${FRONTEND_IMAGE}
    restart: unless-stopped
    depends_on:
      - backend
    environment:
      VITE_API_BASE_URL: "${VITE_API_BASE_URL}"
    ports:
      - "${FRONTEND_PORT}:4173"
COMPOSE
}

check_http() {
  if [[ "${VERIFY_HTTP}" != "1" ]]; then
    return 0
  fi
  if ! command -v curl >/dev/null 2>&1; then
    warn "未找到 curl，跳过 HTTP 检查"
    return 0
  fi
  curl -fsS -m "${HTTP_TIMEOUT_SECONDS}" "http://127.0.0.1:${BACKEND_PORT}/health" >/dev/null || warn "后端健康检查失败"
  curl -fsS -m "${HTTP_TIMEOUT_SECONDS}" "http://127.0.0.1:${QDRANT_HTTP_PORT}/collections" >/dev/null || warn "Qdrant 检查失败"
  curl -fsS -m "${HTTP_TIMEOUT_SECONDS}" "http://127.0.0.1:${FRONTEND_PORT}/" >/dev/null || warn "前端首页检查失败"
}

require_cmd docker
init_compose_bin

docker info >/dev/null 2>&1 || die "Docker daemon 不可用，请先启动 Docker。"

mkdir -p "${INSTALL_DIR}/backend/data" "${INSTALL_DIR}/qdrant_storage"
write_compose

log "开始拉取 latest 镜像"
docker pull "${BACKEND_IMAGE}"
docker pull "${FRONTEND_IMAGE}"
if [[ "${PULL_QDRANT}" == "1" ]]; then
  docker pull "${QDRANT_IMAGE}" || warn "qdrant 镜像拉取失败，继续使用本地已有镜像。"
fi

log "启动或升级容器"
compose_cmd up -d --remove-orphans

log "当前容器状态"
compose_cmd ps

check_http

echo
log "latest 部署完成"
echo "- 安装目录：${INSTALL_DIR}"
echo "- backend 镜像：${BACKEND_IMAGE}"
echo "- frontend 镜像：${FRONTEND_IMAGE}"
echo "- 前端地址：http://<服务器IP>:${FRONTEND_PORT}"

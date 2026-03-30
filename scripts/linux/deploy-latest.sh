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
POSITIONAL_TAG="${3:-}"

INSTALL_DIR="${INSTALL_DIR:-${POSITIONAL_INSTALL_DIR:-/data/ai-localbase}}"
REGISTRY_PREFIX="${REGISTRY_PREFIX:-${POSITIONAL_REGISTRY_PREFIX:-registry.cn-zhangjiakou.aliyuncs.com/ai_localbase}}"
TAG="${TAG:-${POSITIONAL_TAG:-latest}}"
BACKEND_REPO_NAME="${BACKEND_REPO_NAME:-ai-localbase-backend}"
FRONTEND_REPO_NAME="${FRONTEND_REPO_NAME:-ai-localbase-frontend}"
BACKEND_IMAGE="${BACKEND_IMAGE:-${REGISTRY_PREFIX}/${BACKEND_REPO_NAME}:${TAG}}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-${REGISTRY_PREFIX}/${FRONTEND_REPO_NAME}:${TAG}}"
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
COMPOSE_FILE_NAME="${COMPOSE_FILE_NAME:-docker-compose.yml}"
HTTP_TIMEOUT_SECONDS="${HTTP_TIMEOUT_SECONDS:-5}"
VERIFY_HTTP="${VERIFY_HTTP:-1}"
FORCE_REWRITE_COMPOSE="${FORCE_REWRITE_COMPOSE:-1}"
COMPOSE_BIN=()

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

usage() {
  cat <<'USAGE'
用法：
  bash deploy-latest.sh [INSTALL_DIR] [REGISTRY_PREFIX] [TAG]

说明：
  - 这是一个 standalone 脚本，不依赖 git 仓库
  - 可直接在服务器上创建或升级 AI LocalBase
  - 默认拉取 latest 镜像，并保留已有数据目录

参数：
  INSTALL_DIR      安装目录，默认 /data/ai-localbase
  REGISTRY_PREFIX  镜像仓库前缀，默认 registry.cn-zhangjiakou.aliyuncs.com/ai_localbase
  TAG              镜像 tag，默认 latest

常用环境变量：
  BACKEND_IMAGE=...            自定义后端镜像地址
  FRONTEND_IMAGE=...           自定义前端镜像地址
  QDRANT_IMAGE=...             自定义 qdrant 镜像地址
  PULL_QDRANT=0                跳过 qdrant 拉取（默认 0）
  OLLAMA_BASE_URL=...          后端访问模型服务地址
  VITE_API_BASE_URL=...        前端访问后端地址
  HOST_GATEWAY_IP=172.17.0.1   老版本 Docker 的宿主机网关地址
  FRONTEND_PORT=4173           前端暴露端口
  BACKEND_PORT=8080            后端暴露端口
  QDRANT_HTTP_PORT=6333        Qdrant HTTP 端口
  QDRANT_GRPC_PORT=6334        Qdrant gRPC 端口
  FORCE_REWRITE_COMPOSE=1      每次重写 compose 文件（默认 1）
  VERIFY_HTTP=1                部署后做 HTTP 检查（默认 1）

示例：
  bash deploy-latest.sh /data/ai-localbase registry.cn-zhangjiakou.aliyuncs.com/ai_localbase latest

  PULL_QDRANT=0 bash deploy-latest.sh /data/ai-localbase registry.cn-zhangjiakou.aliyuncs.com/ai_localbase
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

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
  local compose_file="${INSTALL_DIR}/${COMPOSE_FILE_NAME}"
  COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME}" "${COMPOSE_BIN[@]}" -f "${compose_file}" "$@"
}

write_compose_file() {
  local compose_file="${INSTALL_DIR}/${COMPOSE_FILE_NAME}"
  if [[ "${FORCE_REWRITE_COMPOSE}" != "1" && -f "${compose_file}" ]]; then
    log "保留现有 compose 文件：${compose_file}"
    return 0
  fi

  log "写入 compose 文件：${compose_file}"
  cat > "${compose_file}" <<COMPOSE
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

ensure_directories() {
  mkdir -p "${INSTALL_DIR}"
  mkdir -p "${INSTALL_DIR}/backend/data"
  mkdir -p "${INSTALL_DIR}/qdrant_storage"
}

pull_images() {
  log "拉取 backend 镜像：${BACKEND_IMAGE}"
  docker pull "${BACKEND_IMAGE}"

  log "拉取 frontend 镜像：${FRONTEND_IMAGE}"
  docker pull "${FRONTEND_IMAGE}"

  if [[ "${PULL_QDRANT}" == "1" ]]; then
    log "拉取 qdrant 镜像：${QDRANT_IMAGE}"
    docker pull "${QDRANT_IMAGE}" || warn "qdrant 镜像拉取失败，继续使用本地已有镜像。"
  fi
}

check_http() {
  if [[ "${VERIFY_HTTP}" != "1" ]]; then
    return 0
  fi
  if ! command -v curl >/dev/null 2>&1; then
    warn "未找到 curl，跳过 HTTP 可达性检查"
    return 0
  fi

  local frontend_url="http://127.0.0.1:${FRONTEND_PORT}/"
  local backend_url="http://127.0.0.1:${BACKEND_PORT}/health"
  local qdrant_url="http://127.0.0.1:${QDRANT_HTTP_PORT}/collections"

  log "检查前端：${frontend_url}"
  curl -fsS -m "${HTTP_TIMEOUT_SECONDS}" "${frontend_url}" >/dev/null || warn "前端暂不可达：${frontend_url}"

  log "检查后端：${backend_url}"
  curl -fsS -m "${HTTP_TIMEOUT_SECONDS}" "${backend_url}" >/dev/null || warn "后端暂不可达：${backend_url}"

  log "检查 Qdrant：${qdrant_url}"
  curl -fsS -m "${HTTP_TIMEOUT_SECONDS}" "${qdrant_url}" >/dev/null || warn "Qdrant 暂不可达：${qdrant_url}"
}

require_cmd docker
init_compose_bin

docker info >/dev/null 2>&1 || die "Docker daemon 不可用，请先启动 Docker。"

log "开始部署 / 升级 AI LocalBase"
echo "INSTALL_DIR=${INSTALL_DIR}"
echo "REGISTRY_PREFIX=${REGISTRY_PREFIX}"
echo "TAG=${TAG}"
echo "BACKEND_IMAGE=${BACKEND_IMAGE}"
echo "FRONTEND_IMAGE=${FRONTEND_IMAGE}"
echo "QDRANT_IMAGE=${QDRANT_IMAGE}"
echo "PULL_QDRANT=${PULL_QDRANT}"

ensure_directories
write_compose_file
pull_images

log "启动或升级容器"
compose_cmd up -d --remove-orphans

log "当前容器状态"
compose_cmd ps

check_http

echo
log "部署完成"
echo "- 安装目录：${INSTALL_DIR}"
echo "- compose 文件：${INSTALL_DIR}/${COMPOSE_FILE_NAME}"
echo "- 前端地址：http://<服务器IP>:${FRONTEND_PORT}"
echo "- 后端健康检查：http://<服务器IP>:${BACKEND_PORT}/health"
echo "- Qdrant 地址：http://<服务器IP>:${QDRANT_HTTP_PORT}"

#!/usr/bin/env bash
set -Eeo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${REPO_ROOT}"

POSITIONAL_REGISTRY_PREFIX="${1:-}"
REGISTRY_PREFIX="${REGISTRY_PREFIX:-${POSITIONAL_REGISTRY_PREFIX:-registry.cn-zhangjiakou.aliyuncs.com/ai_localbase}}"
RELEASE_TAG="${RELEASE_TAG:-$(date +%Y%m%d%H%M%S)}"
PUSH_LATEST="${PUSH_LATEST:-1}"
UPDATE_COMPOSE_IMAGE="${UPDATE_COMPOSE_IMAGE:-0}"
VERIFY_PULL="${VERIFY_PULL:-0}"

usage() {
  cat <<'USAGE'
用法：
  bash scripts/linux/publish-latest.sh [REGISTRY_PREFIX]

说明：
  - 打包机一键构建并推送 backend / frontend 镜像
  - 默认每次都会追加推送 latest
  - 默认不会改写 docker-compose.yml

参数：
  REGISTRY_PREFIX  镜像仓库前缀，默认 registry.cn-zhangjiakou.aliyuncs.com/ai_localbase

常用环境变量：
  RELEASE_TAG=20260329123000     本次构建的时间戳 tag；默认当前时间
  PUSH_LATEST=1                  是否同时推送 latest；默认开启
  UPDATE_COMPOSE_IMAGE=0         是否回写 docker-compose.yml；默认关闭
  VERIFY_PULL=1                  推送后自动再 pull 一次 latest 做校验
  REGISTRY_USERNAME=...          仓库用户名（可选）
  REGISTRY_PASSWORD=...          仓库密码（可选）

示例：
  bash scripts/linux/publish-latest.sh
  bash scripts/linux/publish-latest.sh registry.cn-zhangjiakou.aliyuncs.com/ai_localbase
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

log() {
  echo "==> $*"
}

die() {
  echo "错误: $*" >&2
  exit 1
}

[[ -n "${REGISTRY_PREFIX}" ]] || die "缺少 REGISTRY_PREFIX"
[[ -d .git ]] || die "当前目录不是项目仓库根目录：${REPO_ROOT}"

log "开始发布 latest"
echo "REGISTRY_PREFIX=${REGISTRY_PREFIX}"
echo "RELEASE_TAG=${RELEASE_TAG}"

REGISTRY_PREFIX="${REGISTRY_PREFIX}" \
TAG="${RELEASE_TAG}" \
PUSH_LATEST="${PUSH_LATEST}" \
UPDATE_COMPOSE_IMAGE="${UPDATE_COMPOSE_IMAGE}" \
bash scripts/linux/build_and_push.sh

if [[ "${VERIFY_PULL}" == "1" ]]; then
  log "校验 latest 镜像可拉取"
  docker pull "${REGISTRY_PREFIX}/ai-localbase-backend:latest"
  docker pull "${REGISTRY_PREFIX}/ai-localbase-frontend:latest"
fi

echo
log "发布完成"
echo "- backend 版本镜像：${REGISTRY_PREFIX}/ai-localbase-backend:${RELEASE_TAG}"
echo "- frontend 版本镜像：${REGISTRY_PREFIX}/ai-localbase-frontend:${RELEASE_TAG}"
echo "- backend latest：${REGISTRY_PREFIX}/ai-localbase-backend:latest"
echo "- frontend latest：${REGISTRY_PREFIX}/ai-localbase-frontend:latest"

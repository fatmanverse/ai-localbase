#!/usr/bin/env bash
set -Eeo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${REPO_ROOT}"

POSITIONAL_REGISTRY_PREFIX="${1:-}"
POSITIONAL_TAG="${2:-}"

REGISTRY_PREFIX="${REGISTRY_PREFIX:-${POSITIONAL_REGISTRY_PREFIX}}"
TAG="${TAG:-${POSITIONAL_TAG}}"
BACKEND_REPO_NAME="${BACKEND_REPO_NAME:-ai-localbase-backend}"
FRONTEND_REPO_NAME="${FRONTEND_REPO_NAME:-ai-localbase-frontend}"
BACKEND_IMAGE="${BACKEND_IMAGE:-}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-}"

usage() {
  cat <<'EOF'
用法：
  bash scripts/linux/upgrade-by-image.sh <REGISTRY_PREFIX> <TAG>

说明：
  - 这是 upgrade.sh 的镜像升级简化包装
  - 只需要传“镜像仓库前缀 + tag”即可完成镜像升级
  - 内部会自动拼接 backend / frontend 镜像地址，并调用 upgrade.sh

参数：
  REGISTRY_PREFIX   例如 registry.cn-zhangjiakou.aliyuncs.com/ai_localbase
  TAG               例如 v1.0.0 或 latest

可选环境变量：
  BACKEND_REPO_NAME=ai-localbase-backend
  FRONTEND_REPO_NAME=ai-localbase-frontend
  BACKEND_IMAGE=...              若传完整后端镜像地址，则优先使用
  FRONTEND_IMAGE=...             若传完整前端镜像地址，则优先使用
  COMPOSE_FILE=...
  ENV_FILE=...
  IMAGE_OVERRIDE_FILE=...
  PULL_QDRANT=0
  DRY_RUN=1

示例：
  bash scripts/linux/upgrade-by-image.sh registry.cn-zhangjiakou.aliyuncs.com/ai_localbase v1.0.0

  REGISTRY_PREFIX=registry.cn-zhangjiakou.aliyuncs.com/ai_localbase TAG=v1.0.0   bash scripts/linux/upgrade-by-image.sh
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

[[ -n "${REGISTRY_PREFIX}" ]] || {
  echo "错误: 缺少 REGISTRY_PREFIX" >&2
  usage
  exit 1
}

[[ -n "${TAG}" ]] || {
  echo "错误: 缺少 TAG" >&2
  usage
  exit 1
}

if [[ -z "${BACKEND_IMAGE}" ]]; then
  BACKEND_IMAGE="${REGISTRY_PREFIX}/${BACKEND_REPO_NAME}:${TAG}"
fi

if [[ -z "${FRONTEND_IMAGE}" ]]; then
  FRONTEND_IMAGE="${REGISTRY_PREFIX}/${FRONTEND_REPO_NAME}:${TAG}"
fi

echo "==> 镜像升级包装脚本"
echo "REGISTRY_PREFIX=${REGISTRY_PREFIX}"
echo "TAG=${TAG}"
echo "BACKEND_IMAGE=${BACKEND_IMAGE}"
echo "FRONTEND_IMAGE=${FRONTEND_IMAGE}"

UPGRADE_MODE=image BACKEND_IMAGE="${BACKEND_IMAGE}" FRONTEND_IMAGE="${FRONTEND_IMAGE}" bash upgrade.sh

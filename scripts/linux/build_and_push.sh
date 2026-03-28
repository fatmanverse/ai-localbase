#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${REPO_ROOT}"

REGISTRY_PREFIX="${REGISTRY_PREFIX:-}"
TAG="${TAG:-$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}"
PUSH_LATEST="${PUSH_LATEST:-0}"
REGISTRY_USERNAME="${REGISTRY_USERNAME:-}"
REGISTRY_PASSWORD="${REGISTRY_PASSWORD:-}"
REGISTRY_HOST="${REGISTRY_HOST:-${REGISTRY_PREFIX%%/*}}"

if [[ -z "${REGISTRY_PREFIX}" ]]; then
  echo "请先传入 REGISTRY_PREFIX，例如：" >&2
  echo "REGISTRY_PREFIX=registry.cn-zhangjiakou.aliyuncs.com/ai_localbase bash scripts/linux/build_and_push.sh" >&2
  exit 1
fi

command -v docker >/dev/null 2>&1 || { echo "未找到 docker，请先安装 Docker。" >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker daemon 不可用，请先启动 Docker 服务。" >&2; exit 1; }

BACKEND_IMAGE="${BACKEND_IMAGE:-${REGISTRY_PREFIX}/ai-localbase-backend:${TAG}}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-${REGISTRY_PREFIX}/ai-localbase-frontend:${TAG}}"
BACKEND_LATEST_IMAGE="${REGISTRY_PREFIX}/ai-localbase-backend:latest"
FRONTEND_LATEST_IMAGE="${REGISTRY_PREFIX}/ai-localbase-frontend:latest"

if [[ -n "${REGISTRY_USERNAME}" && -n "${REGISTRY_PASSWORD}" ]]; then
  echo "==> 登录镜像仓库 ${REGISTRY_HOST}"
  printf '%s' "${REGISTRY_PASSWORD}" | docker login --username "${REGISTRY_USERNAME}" --password-stdin "${REGISTRY_HOST}"
else
  echo "==> 未提供 REGISTRY_USERNAME / REGISTRY_PASSWORD，默认使用当前 docker 登录状态"
fi

echo "==> 目标镜像地址"
echo "BACKEND_IMAGE=${BACKEND_IMAGE}"
echo "FRONTEND_IMAGE=${FRONTEND_IMAGE}"

export BACKEND_IMAGE FRONTEND_IMAGE
bash scripts/linux/build_images.sh

echo "==> 推送后端镜像"
docker push "${BACKEND_IMAGE}"

echo "==> 推送前端镜像"
docker push "${FRONTEND_IMAGE}"

if [[ "${PUSH_LATEST}" == "1" && "${TAG}" != "latest" ]]; then
  echo "==> 追加 latest 标签"
  docker tag "${BACKEND_IMAGE}" "${BACKEND_LATEST_IMAGE}"
  docker tag "${FRONTEND_IMAGE}" "${FRONTEND_LATEST_IMAGE}"
  docker push "${BACKEND_LATEST_IMAGE}"
  docker push "${FRONTEND_LATEST_IMAGE}"
fi

echo "==> 完成"
echo "后端镜像：${BACKEND_IMAGE}"
echo "前端镜像：${FRONTEND_IMAGE}"
if [[ "${PUSH_LATEST}" == "1" ]]; then
  echo "后端 latest：${BACKEND_LATEST_IMAGE}"
  echo "前端 latest：${FRONTEND_LATEST_IMAGE}"
fi

#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${REPO_ROOT}"

VERSION="${VERSION:-$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}"
BACKEND_IMAGE="${BACKEND_IMAGE:-ai-localbase-backend:${VERSION}}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-ai-localbase-frontend:${VERSION}}"
SAVE_TAR="${SAVE_TAR:-0}"
IMAGE_ARTIFACT_DIR="${IMAGE_ARTIFACT_DIR:-artifacts/images}"

command -v docker >/dev/null 2>&1 || { echo "未找到 docker，请先安装 Docker。" >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker daemon 不可用，请先启动 Docker 服务。" >&2; exit 1; }

BUILD_ARGS=()
for key in HTTP_PROXY HTTPS_PROXY NO_PROXY http_proxy https_proxy no_proxy; do
  value="${!key:-}"
  if [[ -n "${value}" ]]; then
    BUILD_ARGS+=(--build-arg "${key}=${value}")
  fi
done

echo "==> 构建后端镜像 ${BACKEND_IMAGE}"
docker build "${BUILD_ARGS[@]}" -f docker/backend.Dockerfile -t "${BACKEND_IMAGE}" backend

echo "==> 构建前端镜像 ${FRONTEND_IMAGE}"
docker build "${BUILD_ARGS[@]}" -f docker/frontend.Dockerfile -t "${FRONTEND_IMAGE}" .

if [[ "${SAVE_TAR}" == "1" ]]; then
  mkdir -p "${IMAGE_ARTIFACT_DIR}"
  docker save -o "${IMAGE_ARTIFACT_DIR}/$(echo "${BACKEND_IMAGE}" | tr '/:' '__').tar" "${BACKEND_IMAGE}"
  docker save -o "${IMAGE_ARTIFACT_DIR}/$(echo "${FRONTEND_IMAGE}" | tr '/:' '__').tar" "${FRONTEND_IMAGE}"
  echo "镜像 tar 已导出到 ${IMAGE_ARTIFACT_DIR}"
fi

echo "==> 镜像构建完成"
docker images | grep 'ai-localbase-' || true

#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${REPO_ROOT}"

REGISTRY_PREFIX="${REGISTRY_PREFIX:-}"
TAG="${TAG:-$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}"
PUSH_LATEST="${PUSH_LATEST:-0}"
UPDATE_COMPOSE_IMAGE="${UPDATE_COMPOSE_IMAGE:-1}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
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

update_compose_images() {
  local compose_file="$1"
  [[ -f "${compose_file}" ]] || { echo "警告：未找到 ${compose_file}，跳过 compose 镜像回写" >&2; return 0; }

  python3 - "${compose_file}" "${BACKEND_IMAGE}" "${FRONTEND_IMAGE}" <<'PY'
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
backend_image = sys.argv[2]
frontend_image = sys.argv[3]
text = path.read_text()

for service_name, image in (("backend", backend_image), ("frontend", frontend_image)):
    pattern = rf'(^  {service_name}:\n)(?:    image:.*\n)?'
    match = re.search(pattern, text, flags=re.MULTILINE)
    if not match:
        raise SystemExit(f'未找到 service: {service_name}')
    replacement = match.group(1) + f'    image: {image}\n'
    text = text[:match.start()] + replacement + text[match.end():]

path.write_text(text)
PY

  echo "==> 已更新 ${compose_file} 中的镜像地址"
}

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

if [[ "${UPDATE_COMPOSE_IMAGE}" == "1" ]]; then
  update_compose_images "${COMPOSE_FILE}"
fi

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
if [[ "${UPDATE_COMPOSE_IMAGE}" == "1" ]]; then
  echo "compose 文件：${COMPOSE_FILE}"
fi
if [[ "${PUSH_LATEST}" == "1" ]]; then
  echo "后端 latest：${BACKEND_LATEST_IMAGE}"
  echo "前端 latest：${FRONTEND_LATEST_IMAGE}"
fi

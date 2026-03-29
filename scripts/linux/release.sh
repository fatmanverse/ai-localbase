#!/usr/bin/env bash
set -Eeo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${REPO_ROOT}"

POSITIONAL_TAG="${1:-}"
POSITIONAL_REGISTRY_PREFIX="${2:-}"

TAG="${TAG:-${POSITIONAL_TAG}}"
REGISTRY_PREFIX="${REGISTRY_PREFIX:-${POSITIONAL_REGISTRY_PREFIX}}"
PUSH_LATEST="${PUSH_LATEST:-0}"
SYNC_QDRANT="${SYNC_QDRANT:-1}"
QDRANT_SOURCE_IMAGE="${QDRANT_SOURCE_IMAGE:-qdrant/qdrant:v1.13.4}"
QDRANT_TARGET_IMAGE="${QDRANT_TARGET_IMAGE:-}"
CREATE_GIT_TAG="${CREATE_GIT_TAG:-1}"
PUSH_GIT_TAG="${PUSH_GIT_TAG:-1}"
VERIFY_MANIFEST="${VERIFY_MANIFEST:-1}"
GIT_REMOTE="${GIT_REMOTE:-origin}"
UPDATE_COMPOSE_IMAGE="${UPDATE_COMPOSE_IMAGE:-0}"
SKIP_GIT_CLEAN_CHECK="${SKIP_GIT_CLEAN_CHECK:-0}"

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
  bash scripts/linux/release.sh <TAG> <REGISTRY_PREFIX>

说明：
  - 一键完成镜像构建、推送、可选 qdrant 同步、可选 git tag 推送
  - 默认不会改写 docker-compose.yml 中的镜像地址
  - 执行完成后会直接打印服务器升级命令

参数：
  TAG               例如 v1.0.1 / v5.0.0
  REGISTRY_PREFIX   例如 registry.cn-zhangjiakou.aliyuncs.com/ai_localbase

常用环境变量：
  PUSH_LATEST=1                 额外推送 backend/frontend:latest
  SYNC_QDRANT=1                 同步 qdrant 到私有仓库，默认开启
  QDRANT_SOURCE_IMAGE=...       qdrant 源镜像，默认 qdrant/qdrant:v1.13.4
  QDRANT_TARGET_IMAGE=...       qdrant 目标镜像，默认 <REGISTRY_PREFIX>/qdrant:v1.13.4
  CREATE_GIT_TAG=1              自动创建 git tag，默认开启
  PUSH_GIT_TAG=1                自动推送 git tag，默认开启
  VERIFY_MANIFEST=1             发布后校验镜像 manifest，默认开启
  GIT_REMOTE=origin             git tag 推送远端，默认 origin
  UPDATE_COMPOSE_IMAGE=0        是否回写 docker-compose.yml，默认关闭
  SKIP_GIT_CLEAN_CHECK=1        跳过 git 工作区检查
  REGISTRY_USERNAME=...         镜像仓库用户名（可选）
  REGISTRY_PASSWORD=...         镜像仓库密码（可选）

示例：
  bash scripts/linux/release.sh v1.0.1 registry.cn-zhangjiakou.aliyuncs.com/ai_localbase

  PUSH_LATEST=1 bash scripts/linux/release.sh v1.0.1 registry.cn-zhangjiakou.aliyuncs.com/ai_localbase
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

[[ -n "${TAG}" ]] || {
  echo "错误: 缺少 TAG" >&2
  usage
  exit 1
}

[[ -n "${REGISTRY_PREFIX}" ]] || {
  echo "错误: 缺少 REGISTRY_PREFIX" >&2
  usage
  exit 1
}

require_cmd git
require_cmd docker

[[ -d .git ]] || die "当前目录不是 git 仓库根目录：${REPO_ROOT}"
docker info >/dev/null 2>&1 || die "Docker daemon 不可用，请先启动 Docker 服务。"

if [[ "${SKIP_GIT_CLEAN_CHECK}" != "1" ]]; then
  if [[ -n "$(git status --short)" ]]; then
    git status --short >&2
    die "当前工作区存在未提交改动。请先提交/清理后再发布，或加 SKIP_GIT_CLEAN_CHECK=1 跳过检查。"
  fi
fi

if [[ -z "${QDRANT_TARGET_IMAGE}" ]]; then
  qdrant_tag="${QDRANT_SOURCE_IMAGE##*:}"
  QDRANT_TARGET_IMAGE="${REGISTRY_PREFIX}/qdrant:${qdrant_tag}"
fi

BACKEND_IMAGE="${REGISTRY_PREFIX}/ai-localbase-backend:${TAG}"
FRONTEND_IMAGE="${REGISTRY_PREFIX}/ai-localbase-frontend:${TAG}"

log "开始发布 AI LocalBase"
echo "TAG=${TAG}"
echo "REGISTRY_PREFIX=${REGISTRY_PREFIX}"
echo "BACKEND_IMAGE=${BACKEND_IMAGE}"
echo "FRONTEND_IMAGE=${FRONTEND_IMAGE}"
echo "SYNC_QDRANT=${SYNC_QDRANT}"
if [[ "${SYNC_QDRANT}" == "1" ]]; then
  echo "QDRANT_SOURCE_IMAGE=${QDRANT_SOURCE_IMAGE}"
  echo "QDRANT_TARGET_IMAGE=${QDRANT_TARGET_IMAGE}"
fi

auto_push_latest_msg="关闭"
[[ "${PUSH_LATEST}" == "1" ]] && auto_push_latest_msg="开启"
echo "PUSH_LATEST=${auto_push_latest_msg}"

log "构建并推送 backend / frontend 镜像"
REGISTRY_PREFIX="${REGISTRY_PREFIX}" \
TAG="${TAG}" \
PUSH_LATEST="${PUSH_LATEST}" \
UPDATE_COMPOSE_IMAGE="${UPDATE_COMPOSE_IMAGE}" \
BACKEND_IMAGE="${BACKEND_IMAGE}" \
FRONTEND_IMAGE="${FRONTEND_IMAGE}" \
bash scripts/linux/build_and_push.sh

if [[ "${SYNC_QDRANT}" == "1" ]]; then
  log "同步 qdrant 镜像到私有仓库"
  docker pull "${QDRANT_SOURCE_IMAGE}"
  docker tag "${QDRANT_SOURCE_IMAGE}" "${QDRANT_TARGET_IMAGE}"
  docker push "${QDRANT_TARGET_IMAGE}"
fi

if [[ "${VERIFY_MANIFEST}" == "1" ]]; then
  log "校验镜像 manifest"
  docker manifest inspect "${BACKEND_IMAGE}" >/dev/null
  docker manifest inspect "${FRONTEND_IMAGE}" >/dev/null
  if [[ "${SYNC_QDRANT}" == "1" ]]; then
    docker manifest inspect "${QDRANT_TARGET_IMAGE}" >/dev/null
  fi
fi

if [[ "${CREATE_GIT_TAG}" == "1" ]]; then
  if git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null 2>&1; then
    existing_commit="$(git rev-list -n 1 "refs/tags/${TAG}")"
    current_commit="$(git rev-parse HEAD)"
    if [[ "${existing_commit}" != "${current_commit}" ]]; then
      die "git tag ${TAG} 已存在，但不指向当前提交 ${current_commit}。"
    fi
    warn "git tag ${TAG} 已存在且已指向当前提交，跳过创建。"
  else
    log "创建 git tag：${TAG}"
    git tag "${TAG}"
  fi

  if [[ "${PUSH_GIT_TAG}" == "1" ]]; then
    log "推送 git tag 到 ${GIT_REMOTE}"
    git push "${GIT_REMOTE}" "${TAG}"
  fi
fi

echo
log "发布完成"
echo "- backend 镜像：${BACKEND_IMAGE}"
echo "- frontend 镜像：${FRONTEND_IMAGE}"
if [[ "${SYNC_QDRANT}" == "1" ]]; then
  echo "- qdrant 镜像：${QDRANT_TARGET_IMAGE}"
fi
if [[ "${CREATE_GIT_TAG}" == "1" ]]; then
  echo "- git tag：${TAG}"
fi

echo
echo "服务器升级命令："
if [[ "${SYNC_QDRANT}" == "1" ]]; then
  echo "QDRANT_IMAGE=${QDRANT_TARGET_IMAGE} bash scripts/linux/upgrade-by-image.sh ${REGISTRY_PREFIX} ${TAG}"
else
  echo "PULL_QDRANT=0 bash scripts/linux/upgrade-by-image.sh ${REGISTRY_PREFIX} ${TAG}"
fi

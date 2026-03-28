#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${REPO_ROOT}"

VERSION="${VERSION:-$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}"
TARGET_OS="${TARGET_OS:-linux}"
ARTIFACT_ROOT="${ARTIFACT_ROOT:-artifacts}"

command -v go >/dev/null 2>&1 || { echo "未找到 go，请先运行 scripts/linux/install_go_npm_env.sh" >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "未找到 npm，请先运行 scripts/linux/install_go_npm_env.sh" >&2; exit 1; }

TARGET_ARCH="${TARGET_ARCH:-$(go env GOARCH)}"
RELEASE_NAME="ai-localbase-${VERSION}-${TARGET_OS}-${TARGET_ARCH}"
RELEASE_DIR="${ARTIFACT_ROOT}/release/${RELEASE_NAME}"
PACKAGE_PATH="${ARTIFACT_ROOT}/packages/${RELEASE_NAME}.tar.gz"

rm -rf "${RELEASE_DIR}"
mkdir -p "${RELEASE_DIR}/backend" "${RELEASE_DIR}/frontend" "${ARTIFACT_ROOT}/packages"

echo "==> 构建后端二进制"
pushd backend >/dev/null
CGO_ENABLED=0 GOOS="${TARGET_OS}" GOARCH="${TARGET_ARCH}" go build -o "../${RELEASE_DIR}/backend/ai-localbase-backend" .
popd >/dev/null

echo "==> 构建前端静态资源"
pushd frontend >/dev/null
npm ci
npm run build
popd >/dev/null
cp -R frontend/dist "${RELEASE_DIR}/frontend/dist"

mkdir -p "${RELEASE_DIR}/docker" "${RELEASE_DIR}/compose"
cp docker/nginx.conf "${RELEASE_DIR}/docker/nginx.conf"
cp docker/backend.Dockerfile docker/frontend.Dockerfile "${RELEASE_DIR}/docker/"
cp docker-compose.yml docker-compose.qdrant.yml "${RELEASE_DIR}/compose/"
cp README.md DOCKER_DEPLOY.md TROUBLESHOOTING.md .env.example "${RELEASE_DIR}/"

tar -C "${ARTIFACT_ROOT}/release" -czf "${PACKAGE_PATH}" "${RELEASE_NAME}"

echo "==> 打包完成"
echo "Release 目录: ${RELEASE_DIR}"
echo "Tar 包路径 : ${PACKAGE_PATH}"

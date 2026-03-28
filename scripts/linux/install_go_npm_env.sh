#!/usr/bin/env bash
set -euo pipefail

GO_VERSION="${GO_VERSION:-1.25.0}"
NODE_VERSION="${NODE_VERSION:-20.19.5}"
INSTALL_DOCKER="${INSTALL_DOCKER:-0}"

if [[ "${EUID}" -ne 0 ]]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    echo "请使用 root 运行，或先安装 sudo。" >&2
    exit 1
  fi
else
  SUDO=""
fi

ARCH_RAW="$(uname -m)"
case "${ARCH_RAW}" in
  x86_64|amd64)
    GO_ARCH="amd64"
    NODE_ARCH="x64"
    ;;
  aarch64|arm64)
    GO_ARCH="arm64"
    NODE_ARCH="arm64"
    ;;
  *)
    echo "不支持的 CPU 架构: ${ARCH_RAW}" >&2
    exit 1
    ;;
esac

install_base_packages() {
  if command -v apt-get >/dev/null 2>&1; then
    ${SUDO} apt-get update
    ${SUDO} apt-get install -y curl git ca-certificates tar xz-utils build-essential
  elif command -v dnf >/dev/null 2>&1; then
    ${SUDO} dnf install -y curl git ca-certificates tar xz gcc gcc-c++ make
  elif command -v yum >/dev/null 2>&1; then
    ${SUDO} yum install -y curl git ca-certificates tar xz gcc gcc-c++ make
  else
    echo "未识别的包管理器，请手工安装 curl git tar xz make gcc。" >&2
    exit 1
  fi
}

install_go() {
  local go_url="https://dl.google.com/go/go${GO_VERSION}.linux-${GO_ARCH}.tar.gz"
  local go_pkg="/tmp/go${GO_VERSION}.linux-${GO_ARCH}.tar.gz"
  echo "==> 安装 Go ${GO_VERSION} (${GO_ARCH})"
  curl -fsSL "${go_url}" -o "${go_pkg}"
  ${SUDO} rm -rf /usr/local/go
  ${SUDO} tar -C /usr/local -xzf "${go_pkg}"
  ${SUDO} ln -sf /usr/local/go/bin/go /usr/local/bin/go
  ${SUDO} ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt
}

install_node() {
  local node_pkg="node-v${NODE_VERSION}-linux-${NODE_ARCH}"
  local node_url="https://nodejs.org/dist/v${NODE_VERSION}/${node_pkg}.tar.xz"
  local node_tar="/tmp/${node_pkg}.tar.xz"
  echo "==> 安装 Node.js ${NODE_VERSION} (${NODE_ARCH})"
  curl -fsSL "${node_url}" -o "${node_tar}"
  ${SUDO} mkdir -p /usr/local/lib/nodejs
  ${SUDO} rm -rf "/usr/local/lib/nodejs/${node_pkg}"
  ${SUDO} tar -C /usr/local/lib/nodejs -xf "${node_tar}"
  ${SUDO} ln -sf "/usr/local/lib/nodejs/${node_pkg}/bin/node" /usr/local/bin/node
  ${SUDO} ln -sf "/usr/local/lib/nodejs/${node_pkg}/bin/npm" /usr/local/bin/npm
  ${SUDO} ln -sf "/usr/local/lib/nodejs/${node_pkg}/bin/npx" /usr/local/bin/npx
}

install_docker() {
  if [[ "${INSTALL_DOCKER}" != "1" ]]; then
    return
  fi

  if command -v docker >/dev/null 2>&1; then
    echo "==> Docker 已存在，跳过安装"
    return
  fi

  echo "==> 安装 Docker"
  curl -fsSL https://get.docker.com | ${SUDO} sh
  if [[ -n "${SUDO}" ]] && id -u "${USER}" >/dev/null 2>&1; then
    ${SUDO} usermod -aG docker "${USER}" || true
    echo "已将 ${USER} 加入 docker 组，重新登录后生效。"
  fi
}

install_base_packages
install_go
install_node
install_docker

echo "==> 环境版本"
go version
node --version
npm --version
if command -v docker >/dev/null 2>&1; then
  docker --version || true
fi

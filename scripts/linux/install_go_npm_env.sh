#!/usr/bin/env bash
if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi
set -euo pipefail

GO_VERSION="${GO_VERSION:-1.25.0}"
NODE_VERSION="${NODE_VERSION:-20.19.5}"
LEGACY_NODE_VERSION="${LEGACY_NODE_VERSION:-16.20.2}"
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

version_lt() {
  local current="$1"
  local target="$2"
  [[ "${current}" != "${target}" && "$(printf '%s
%s
' "${current}" "${target}" | sort -V | head -n1)" == "${current}" ]]
}

get_glibc_version() {
  if command -v getconf >/dev/null 2>&1; then
    local value
    value="$(getconf GNU_LIBC_VERSION 2>/dev/null | awk '{print $2}')"
    if [[ -n "${value}" ]]; then
      echo "${value}"
      return 0
    fi
  fi

  if command -v ldd >/dev/null 2>&1; then
    ldd --version 2>&1 | head -n1 | grep -oE '[0-9]+\.[0-9]+' | head -n1
    return 0
  fi

  return 1
}

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

resolve_node_package() {
  local glibc_version=""
  glibc_version="$(get_glibc_version || true)"

  local resolved_node_version="${NODE_VERSION}"
  local node_pkg="node-v${resolved_node_version}-linux-${NODE_ARCH}"
  local node_url="https://nodejs.org/dist/v${resolved_node_version}/${node_pkg}.tar.xz"

  if [[ "${NODE_ARCH}" == "x64" && -n "${glibc_version}" ]] && version_lt "${glibc_version}" "2.28"; then
    resolved_node_version="${LEGACY_NODE_VERSION}"
    node_pkg="node-v${resolved_node_version}-linux-${NODE_ARCH}"
    node_url="https://nodejs.org/dist/v${resolved_node_version}/${node_pkg}.tar.xz"
    echo "==> 检测到 glibc ${glibc_version}，自动切换到 Node.js ${resolved_node_version} 兼容包（适用于 CentOS 7 / EL7）" >&2
  elif [[ "${NODE_ARCH}" != "x64" && -n "${glibc_version}" ]] && version_lt "${glibc_version}" "2.28"; then
    echo "当前系统 glibc 版本为 ${glibc_version}，且架构为 ${NODE_ARCH}。官方 Node.js ${NODE_VERSION} 预编译包可能无法运行。" >&2
    echo "建议改用较新的 Linux 发行版，或直接使用 Docker 构建前端。" >&2
    exit 1
  fi

  printf '%s|%s|%s
' "${resolved_node_version}" "${node_pkg}" "${node_url}"
}

install_node() {
  local package_info
  package_info="$(resolve_node_package)"

  local resolved_node_version="${package_info%%|*}"
  local remainder="${package_info#*|}"
  local node_pkg="${remainder%%|*}"
  local node_url="${remainder##*|}"
  local node_tar="/tmp/${node_pkg}.tar.xz"

  echo "==> 安装 Node.js ${resolved_node_version} (${NODE_ARCH})"
  curl -fsSL "${node_url}" -o "${node_tar}"
  ${SUDO} mkdir -p /usr/local/lib/nodejs
  ${SUDO} rm -rf "/usr/local/lib/nodejs/${node_pkg}"
  ${SUDO} tar -C /usr/local/lib/nodejs -xf "${node_tar}"
  ${SUDO} ln -sf "/usr/local/lib/nodejs/${node_pkg}/bin/node" /usr/local/bin/node
  ${SUDO} ln -sf "/usr/local/lib/nodejs/${node_pkg}/bin/npm" /usr/local/bin/npm
  ${SUDO} ln -sf "/usr/local/lib/nodejs/${node_pkg}/bin/npx" /usr/local/bin/npx
  hash -r || true
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

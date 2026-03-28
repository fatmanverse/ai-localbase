# 常见问题排查（最简版）

---

## 1. 模型调用失败

### 处理
```bash
ollama list
ollama pull qwen2.5:7b
ollama pull nomic-embed-text
curl -s http://localhost:8080/api/config | jq .
```

确认：
- `chat.model` 正确
- `embedding.model` 正确
- `baseUrl` 可访问

---

## 2. 向量维度不一致

### 现象
- 报错类似：`expected dim: 768, got 1024`

### 处理
默认推荐：

```bash
QDRANT_VECTOR_SIZE=768
```

如果你换过 Embedding 模型：
- 重建索引
- 或清理旧数据后重新导入

Docker 场景可重启：

```bash
docker compose down
rm -rf qdrant_storage backend/data/app-state.json backend/data/chat-history.db
docker compose up --build -d
```

---

## 3. Docker 容器访问不到 Ollama

优先在 `.env` 中使用：

```bash
HOST_GATEWAY_IP=172.17.0.1
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

如果不确定 `HOST_GATEWAY_IP`，可先查看宿主机 `docker0` 网桥 IP：

```bash
ip addr show docker0 | awk '/inet / {print $2}' | cut -d/ -f1
```

然后重新启动：

```bash
docker compose up --build -d
```

### 如果出现 `invalid IP address in add-host: "host-gateway"`

这说明当前 Docker 版本较旧，不支持 `host-gateway` 占位符。
本仓库已支持通过 `HOST_GATEWAY_IP` 显式指定宿主机网关 IP。
通常默认桥接网络下可直接使用：

```bash
HOST_GATEWAY_IP=172.17.0.1
```

---

## 4. 前端打不开或接口无响应

```bash
curl -I http://localhost:4173
curl -s http://localhost:8080/health
curl -s http://localhost:6333/health
```

如果有服务没起来：

```bash
docker compose down
docker compose up --build -d
```

---
## 5. 文件上传失败，提示 `413`

### 原因
**`413 Request Entity Too Large` 表示上传请求在前置 Nginx / 网关层就被拦截了，请求还没进入 Go 后端解析阶段。**

这也是前端出现“文件上传失败，未进入服务端解析阶段”的典型原因。

### 本仓库默认修复
仓库内置前端 Nginx 已默认放宽为：

```nginx
client_max_body_size 5g;
```

位置：

```text
docker/nginx.conf
```

### 处理方式
如果你使用本仓库自带 Docker 前端镜像：

```bash
docker compose build frontend --no-cache
docker compose up -d frontend
```

如果你前面还有宿主机 Nginx / Ingress / 网关，也要同步放宽，例如：

```nginx
server {
    client_max_body_size 5g;
}
```

### 检查点
1. 浏览器上传时报 `413`
2. 后端没有出现对应上传日志
3. 前置代理默认限制通常过小（常见为 `1m`）

---

## 6. Linux 打包或镜像构建失败

```bash
INSTALL_DOCKER=1 bash scripts/linux/install_go_npm_env.sh
bash scripts/linux/package_release.sh
bash scripts/linux/build_images.sh
```

如果脚本提示 Docker daemon 不可用，请先启动 Docker 服务。

---

## 7. CentOS 7 / EL7 上 Node 启动失败

### 常见报错
- `GLIBC_2.27 not found`
- `GLIBC_2.28 not found`
- `GLIBCXX_3.4.21 not found`

### 原因
CentOS 7 / EL7 的 glibc 和 libstdc++ 太旧，直接运行 Node 18 / 20 容易出现：
- `GLIBC_2.27 not found`
- `GLIBC_2.28 not found`
- `GLIBCXX_3.4.21 not found`

### 现在的处理方式
项目脚本会自动识别老版本 glibc，并在 `x64` 环境切换到 **Node.js 16.20.2 兼容版本**。

请先清理旧链接，再重新执行：

```bash
rm -f /usr/local/bin/node /usr/local/bin/npm /usr/local/bin/npx
rm -rf /usr/local/lib/nodejs/node-v20.19.5-linux-x64
rm -rf /usr/local/lib/nodejs/node-v20.19.5-linux-x64-glibc-217
rm -rf /usr/local/lib/nodejs/node-v16.20.2-linux-x64

bash scripts/linux/install_go_npm_env.sh
which node
readlink -f /usr/local/bin/node
node --version
npm --version
```

如果你不想在宿主机处理 Node 兼容问题，建议直接改用 Docker 完成前端构建。

---

## 8. Docker 构建时无法下载 Go / npm 依赖

### 处理
先给宿主机导出代理变量，再重新构建：

```bash
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890
export NO_PROXY=localhost,127.0.0.1,host.docker.internal,qdrant,backend,frontend

docker compose build --no-cache
```

如果你的系统只配置了小写变量，也可以直接使用：

```bash
export http_proxy=http://127.0.0.1:7890
export https_proxy=http://127.0.0.1:7890
export no_proxy=localhost,127.0.0.1,host.docker.internal,qdrant,backend,frontend

docker compose build --no-cache
```

如果你使用脚本构建镜像：

```bash
HTTP_PROXY=http://127.0.0.1:7890 HTTPS_PROXY=http://127.0.0.1:7890 NO_PROXY=localhost,127.0.0.1,host.docker.internal,qdrant,backend,frontend bash scripts/linux/build_images.sh
```

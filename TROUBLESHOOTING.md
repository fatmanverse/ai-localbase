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

使用：

```bash
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

然后：

```bash
docker compose up --build -d
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

## 5. Linux 打包或镜像构建失败

```bash
INSTALL_DOCKER=1 bash scripts/linux/install_go_npm_env.sh
bash scripts/linux/package_release.sh
bash scripts/linux/build_images.sh
```

如果脚本提示 Docker daemon 不可用，请先启动 Docker 服务。

---

## 6. CentOS 7 / EL7 上 Node 启动失败

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

## 7. Docker 构建时无法下载 Go / npm 依赖

### 处理
先给宿主机导出代理变量，再重新构建：

```bash
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890
export NO_PROXY=localhost,127.0.0.1,host.docker.internal,qdrant,backend,frontend

docker compose build --no-cache
```

如果你使用脚本构建镜像：

```bash
HTTP_PROXY=http://127.0.0.1:7890 HTTPS_PROXY=http://127.0.0.1:7890 NO_PROXY=localhost,127.0.0.1,host.docker.internal,qdrant,backend,frontend bash scripts/linux/build_images.sh
```

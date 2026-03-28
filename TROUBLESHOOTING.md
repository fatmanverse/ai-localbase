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
系统自带的 glibc / libstdc++ 太旧，无法运行官方 Node 20 Linux 二进制。

### 现在的处理方式
项目脚本会自动识别老版本 glibc，并在 `x64` 环境切换到 **glibc-2.17 兼容的 Node.js 包**。

请直接重新执行：

```bash
bash scripts/linux/install_go_npm_env.sh
```

如果仍然失败，建议直接改用 Docker 完成构建。

# 常见问题排查（最简版）

---

## 1. 模型调用失败

### 现象
- 前端提示模型调用失败
- 或后端日志提示 `model not found`

### 处理
1. 查看本地模型：

```bash
ollama list
```

2. 拉取默认模型：

```bash
ollama pull qwen2.5:7b
ollama pull nomic-embed-text
```

3. 查看当前配置：

```bash
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

### 原因
- 当前 Embedding 模型的输出维度，和 Qdrant 里的集合维度不一致

### 处理
1. 默认使用：

```bash
QDRANT_VECTOR_SIZE=768
```

2. 如果你已经切换过 Embedding 模型：
- 重建索引
- 或清理旧数据后重新导入

3. Docker 场景可重启：

```bash
docker compose down
rm -rf qdrant_storage backend/data/app-state.json backend/data/chat-history.db
QDRANT_VECTOR_SIZE=768 docker compose up --build -d
```

---

## 3. Docker 容器访问不到 Ollama

### 现象
- 容器内模型请求超时
- 容器里访问不到 `localhost:11434`

### 处理
默认推荐使用：

```bash
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

然后执行：

```bash
docker compose up --build -d
```

---

## 4. 前端打不开或接口无响应

### 检查前端
```bash
curl -I http://localhost:4173
```

### 检查后端
```bash
curl -s http://localhost:8080/health
```

### 检查 Qdrant
```bash
curl -s http://localhost:6333/health
```

如果其中某个服务没起来，直接重启整套：

```bash
docker compose down
docker compose up --build -d
```

---

## 5. Linux 打包或镜像构建失败

### 安装环境
```bash
INSTALL_DOCKER=1 bash scripts/linux/install_go_npm_env.sh
```

### 打包
```bash
bash scripts/linux/package_release.sh
```

### 构建镜像
```bash
bash scripts/linux/build_images.sh
```

如果脚本提示 Docker daemon 不可用，请先启动 Docker 服务。

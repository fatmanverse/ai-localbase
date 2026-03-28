# Docker 部署说明（最简版）

本文档只保留最常用、最简单的 Docker 启动方式。

---

## 前置要求

### 必需软件
- Docker
- Docker Compose
- Ollama

### 推荐先拉取模型
```bash
ollama pull qwen2.5:7b
ollama pull nomic-embed-text
```

---

## 直接启动完整服务

在项目根目录执行：

```bash
docker compose up --build -d
```

启动后默认地址：
- 前端：`http://localhost:4173`
- 后端：`http://localhost:8080`
- Qdrant：`http://localhost:6333`

停止服务：

```bash
docker compose down
```

---

## 仅启动 Qdrant

适合本地开发时把前后端放在宿主机运行。

```bash
docker compose -f docker-compose.qdrant.yml up -d
```

---

## 使用固定本地镜像名启动

如果你希望 Compose 在本地构建并使用固定镜像名，可以执行：

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

这个文件仍然是**本地构建**，不会从外部 GHCR 拉取镜像。

---

## 常见环境变量

如有需要，可在启动前覆盖：

```bash
export OLLAMA_BASE_URL=http://host.docker.internal:11434
export QDRANT_VECTOR_SIZE=768
```

然后再执行：

```bash
docker compose up --build -d
```

---

## 推荐做法

### 最稳妥的默认组合
- Chat：`qwen2.5:7b`
- Embedding：`nomic-embed-text`
- Qdrant Vector Size：`768`

### 切换 Embedding 模型后
请执行以下任一操作：
1. 前端点击 **重建索引**
2. 删除旧数据后重新上传文档

---

## 相关文件

- `docker-compose.yml`
- `docker-compose.qdrant.yml`
- `docker-compose.app.yml`
- `docker-compose.prod.yml`
- `docker/backend.Dockerfile`
- `docker/frontend.Dockerfile`

# Docker 部署说明（最简版）

当前仓库只保留两种 Docker 入口：
- `docker-compose.yml`：完整应用
- `docker-compose.qdrant.yml`：仅 Qdrant

---

## 启动完整服务

```bash
cp .env.example .env
docker compose up --build -d
```

默认地址：
- 前端：`http://localhost:4173`
- 后端：`http://localhost:8080`
- Qdrant：`http://localhost:6333`

停止服务：

```bash
docker compose down
```

---

## 仅启动 Qdrant

```bash
docker compose -f docker-compose.qdrant.yml up -d
```

---

## 推荐环境变量

```bash
OLLAMA_BASE_URL=http://host.docker.internal:11434
QDRANT_VECTOR_SIZE=768
```

如果你切换了 Embedding 模型，请：
1. 重建索引
2. 或删除旧数据后重新导入文档

# AI LocalBase

> 说明：本仓库代码 **基于他人项目 Fork 而来，并在此基础上做了本地化与可用性优化**。当前仓库独立维护，不向原作者仓库直接推送发布产物。原始参考仓库：`https://github.com/veyliss/ai-localbase`。

一个本地优先的 AI 知识库系统（RAG）。

支持：
- 文档上传与解析：`txt` / `md` / `pdf` / `docx`
- Qdrant 向量检索
- Ollama / OpenAI Compatible 问答
- Web UI、知识库管理、聊天记录持久化

---

## 三条命令启动

### 1. 拉模型
```bash
ollama pull qwen2.5:7b
ollama pull nomic-embed-text
```

### 2. 准备环境变量
```bash
cp .env.example .env
```

### 3. 启动
```bash
docker compose up --build -d
```

访问地址：
- 前端：`http://localhost:4173`
- 后端：`http://localhost:8080`
- Qdrant：`http://localhost:6333`

停止：
```bash
docker compose down
```

---

## 本地开发

### 仅启动 Qdrant
```bash
docker compose -f docker-compose.qdrant.yml up -d
```

### 启动后端
```bash
cd backend
go run .
```

### 启动前端
```bash
cd frontend
npm ci
npm run dev
```

开发地址：
- 前端：`http://localhost:5173`
- 后端：`http://localhost:8080`

---

## 默认推荐配置

- Chat：`qwen2.5:7b`
- Temperature：`0.2`
- Embedding：`nomic-embed-text`
- Vector Size：`768`
- 语义切片：`800`
- Overlap：`120`
- 文档内 TopK：`5`
- 知识库 TopK：`6`

> 切换 Embedding 模型后，建议立即重建索引。

---

## 保留的关键入口

- `docker-compose.yml`：完整应用
- `docker-compose.qdrant.yml`：仅 Qdrant
- `scripts/linux/install_go_npm_env.sh`
- `scripts/linux/package_release.sh`
- `scripts/linux/build_images.sh`
- `.env.example`

---

## 常见命令

### 查看当前配置
```bash
curl -s http://localhost:8080/api/config | jq .
```

### 查看知识库列表
```bash
curl -s http://localhost:8080/api/knowledge-bases | jq .
```

---

## 其他说明

- Linux 部署：[`DEPLOY_LINUX.md`](./DEPLOY_LINUX.md)
- 常见问题：[`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md)

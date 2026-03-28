# AI LocalBase

> 说明：本仓库代码 **基于他人项目 Fork 而来，并在此基础上做了本地化与可用性优化**。当前仓库独立维护，不向原作者仓库直接推送发布产物。原始参考仓库：`https://github.com/veyliss/ai-localbase`。

一个本地优先的 AI 知识库系统（RAG）。

它提供：
- 本地文档上传与解析
- Qdrant 向量检索
- 基于 Ollama / OpenAI Compatible 的问答
- Web UI、知识库管理、聊天记录持久化

支持文档类型：
- `txt`
- `md`
- `pdf`
- `docx`

---

## 最简单启动方式

### 方式一：Docker 一把启动（推荐）

1. 安装并启动：
   - Docker
   - Ollama
2. 拉取默认模型：

```bash
ollama pull qwen2.5:7b
ollama pull nomic-embed-text
```

3. 在项目根目录执行：

```bash
docker compose up --build -d
```

4. 打开：

- 前端：`http://localhost:4173`
- 后端：`http://localhost:8080`
- Qdrant：`http://localhost:6333`

5. 进入前端设置页，确认模型配置后开始上传文档。

停止服务：

```bash
docker compose down
```

---

## 本地开发方式

### 1. 仅启动 Qdrant

```bash
docker compose -f docker-compose.qdrant.yml up -d
```

### 2. 启动后端

```bash
cd backend
go run .
```

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
```

访问地址：
- 前端：`http://localhost:5173`
- 后端：`http://localhost:8080`

---

## 默认推荐配置

### 聊天模型
- Provider：`ollama`
- Base URL：`http://localhost:11434`
- Model：`qwen2.5:7b`
- Temperature：`0.2`
- Context Message Limit：`12`

### 向量模型
- Provider：`ollama`
- Base URL：`http://localhost:11434`
- Model：`nomic-embed-text`
- Vector Size：`768`

### 内置 RAG 策略
- 语义切片：`800`
- Overlap：`120`
- 文档内 TopK：`5`
- 知识库 TopK：`6`
- 单文档最多返回：`2` 个切片

> 如果你切换了 Embedding 模型，**建议立即重建索引**，否则旧向量和新向量可能不在同一向量空间。

---

## 常用文件

### Docker / Compose
- `docker-compose.yml`：完整应用栈，**优先使用这个**
- `docker-compose.qdrant.yml`：仅启动 Qdrant
- `docker-compose.app.yml`：兼容保留，和主应用栈一致
- `docker-compose.prod.yml`：本地 build + 固定镜像名版本

### Linux 脚本
- `scripts/linux/install_go_npm_env.sh`：安装 Go / Node / npm（可选 Docker）
- `scripts/linux/package_release.sh`：打包发布物
- `scripts/linux/build_images.sh`：构建镜像

---

## Linux 一键命令

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

### 导出镜像 tar
```bash
SAVE_TAR=1 bash scripts/linux/build_images.sh
```

---

## 常见操作

### 重建知识库索引
进入前端知识库面板，点击：

- **重建索引**

适用场景：
- 切换了 Embedding 模型
- 修改了向量维度
- 旧文档需要重新生成向量

### 查看当前配置
```bash
curl -s http://localhost:8080/api/config | jq .
```

### 查看知识库列表
```bash
curl -s http://localhost:8080/api/knowledge-bases | jq .
```

---

## CI 说明

当前仓库内置的是**轻量 GitHub Actions**，只做以下事情：
- Go 测试 + 构建
- 前端安装依赖 + 打包
- Shell 脚本语法检查
- Compose 文件校验
- Docker 镜像本地构建校验

**不会推送镜像，不会发布到任何外部仓库。**

---

## 更多说明

- Docker 部署说明：[`DOCKER_DEPLOY.md`](./DOCKER_DEPLOY.md)
- 常见问题排查：[`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md)

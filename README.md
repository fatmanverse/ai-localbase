# AI LocalBase

> 说明：本仓库基于开源项目 Fork，并在原有基础上进行了本地化适配、功能完善与可用性优化。当前仓库由我们独立维护，相关代码变更、构建与发布流程仅面向本仓库，不直接同步至上游仓库。原始参考仓库：`https://github.com/veyliss/ai-localbase`。

一个本地优先的 AI 知识库系统（RAG）。

支持：
- 文档上传与解析：`txt` / `md` / `pdf` / `docx` / `html` / `htm` / `png` / `jpg` / `jpeg` / `webp` / `gif`
- 上传实时进度：文件传输进度 + 服务端解析 / 切片 / 向量化阶段进度
- Qdrant 向量检索
- Ollama / OpenAI Compatible 问答
- **支持聊天模型 / 向量模型多候选容灾切换**（主模型失败自动切到备用模型）
- Web UI、知识库管理、聊天记录持久化
- **对外服务台聊天 API**（会话 / 消息 / 流式 / 反馈 / 运营分析）
- **可嵌入聊天组件**（工单机器人 / 客服机器人风格）
- **点赞 / 点踩 / FAQ 候选 / 知识缺口闭环**

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

如果服务器需要代理再拉依赖：
```bash
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890
export NO_PROXY=localhost,127.0.0.1,host.docker.internal,qdrant,backend,frontend
docker compose up --build -d
```

也支持 Linux 常见的小写变量：
```bash
export http_proxy=http://127.0.0.1:7890
export https_proxy=http://127.0.0.1:7890
export no_proxy=localhost,127.0.0.1,host.docker.internal,qdrant,backend,frontend
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

> CentOS 7 / EL7：请先执行 `bash scripts/linux/install_go_npm_env.sh`，脚本会自动切到兼容的 Node.js 16.20.2。

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

## 模型容灾配置

系统现在支持为 **聊天模型** 和 **向量模型** 配置多个候选项。
调用顺序为：

1. 先调用主模型
2. 主模型失败后自动切到备用模型
3. 只有全部候选都失败时，才返回提示消息或进入本地向量 fallback

### 前端设置页填写方式

在“AI 设置”中，`聊天备用模型` / `Embedding 备用模型` 支持：

- **只写模型名**：继承主 Provider / Base URL / API Key
- **完整写法**：`provider | baseUrl | model | apiKey`

示例：

```text
qwen2.5:14b
openai-compatible | https://api.example.com/v1 | gpt-4o-mini | sk-***
```

### 配置接口返回示例

```json
{
  "chat": {
    "provider": "ollama",
    "baseUrl": "http://localhost:11434",
    "model": "qwen2.5:7b",
    "apiKey": "",
    "temperature": 0.2,
    "contextMessageLimit": 12,
    "candidates": [
      {
        "provider": "ollama",
        "baseUrl": "",
        "model": "qwen2.5:14b",
        "apiKey": ""
      }
    ]
  },
  "embedding": {
    "provider": "ollama",
    "baseUrl": "http://localhost:11434",
    "model": "nomic-embed-text",
    "apiKey": "",
    "candidates": [
      {
        "provider": "ollama",
        "baseUrl": "",
        "model": "bge-m3",
        "apiKey": ""
      }
    ]
  }
}
```

---

## 保留的关键入口

- `docker-compose.yml`：完整应用
- `docker-compose.qdrant.yml`：仅 Qdrant
- `scripts/linux/install_go_npm_env.sh`
- `scripts/linux/package_release.sh`
- `scripts/linux/build_images.sh`
- `scripts/linux/build_and_push.sh`
- `.env.example`

---

## 常见命令

### 构建并推送镜像
```bash
REGISTRY_PREFIX=registry.cn-zhangjiakou.aliyuncs.com/ai_localbase \
TAG=$(git rev-parse --short HEAD) \
bash scripts/linux/build_and_push.sh
```

执行后会自动把 `docker-compose.yml` 里的 `backend` / `frontend` 镜像地址回写成刚刚 push 的地址。

### 查看当前配置
```bash
curl -s http://localhost:8080/api/config | jq .
```

### 查看知识库列表
```bash
curl -s http://localhost:8080/api/knowledge-bases | jq .
```

### 查看服务台机器人运营摘要
```bash
curl -s http://localhost:8080/api/service-desk/analytics/summary | jq .
```

### 打开嵌入式聊天组件 Demo
```text
http://localhost:5173/?mode=service-desk-demo
```

---

## 其他说明

- Linux 部署：[`DEPLOY_LINUX.md`](./DEPLOY_LINUX.md)
- 常见问题：[`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md)
- 对外聊天接口：[`docs/chat-integration/api.md`](./docs/chat-integration/api.md)
- 前端组件接入：[`docs/chat-integration/frontend-widget.md`](./docs/chat-integration/frontend-widget.md)
- 反馈闭环：[`docs/chat-integration/feedback-loop.md`](./docs/chat-integration/feedback-loop.md)
- FAQ / 持续优化：[`docs/chat-integration/faq-optimization.md`](./docs/chat-integration/faq-optimization.md)
- Demo 说明：[`docs/chat-integration/demo-guide.md`](./docs/chat-integration/demo-guide.md)

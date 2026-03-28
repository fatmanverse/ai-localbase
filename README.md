# AI LocalBase

> 说明：本仓库基于开源项目 Fork，并在原有基础上进行了本地化适配、功能完善与可用性优化。当前仓库由我们独立维护，相关代码变更、构建与发布流程仅面向本仓库，不直接同步至上游仓库。原始参考仓库：`https://github.com/veyliss/ai-localbase`。

一个**本地优先、最简单可用**的 AI 知识库系统（RAG）。

支持：
- 文档上传与解析：`txt` / `md` / `pdf` / `docx` / `html` / `htm` / `png` / `jpg` / `jpeg` / `webp` / `gif`
- 上传实时进度：文件传输进度 + 服务端解析 / OCR / 切片 / 向量化进度
- Qdrant 向量检索
- Ollama / OpenAI Compatible 问答
- **聊天模型 / 向量模型多候选容灾切换**
- **对外服务台聊天 API**（会话 / 消息 / 流式 / 反馈 / 运营分析）
- **可嵌入聊天组件**（工单机器人 / 客服机器人风格）
- **点赞 / 点踩 / FAQ 候选 / 知识缺口闭环**
- **图片知识处理 MVP**（图片提取 / OCR / 描述 / 图文关联 / 检索可用）

---

## 最快启动

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

如果上传文件时报 `413`，说明前置 Nginx / 网关限制过小。当前仓库默认前端 Nginx 已放宽到 **5GB**，更新后请重新构建前端镜像；如果你前面还有自建 Nginx / Ingress，也要同步配置 `client_max_body_size 5g;`。

如果服务器需要代理再构建：

```bash
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890
export NO_PROXY=localhost,127.0.0.1,host.docker.internal,qdrant,backend,frontend

docker compose up --build -d
```

也兼容小写代理变量：

```bash
export http_proxy=http://127.0.0.1:7890
export https_proxy=http://127.0.0.1:7890
export no_proxy=localhost,127.0.0.1,host.docker.internal,qdrant,backend,frontend
```

### 如果出现 `invalid IP address in add-host: "host-gateway"`

说明你的 Docker 版本较旧，不支持 `host-gateway` 占位符。

先查看宿主机 `docker0` 网桥 IP：

```bash
ip addr show docker0 | awk '/inet / {print $2}' | cut -d/ -f1
```

通常会得到：

```text
172.17.0.1
```

然后写入 `.env`：

```bash
HOST_GATEWAY_IP=172.17.0.1
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

再重新启动：

```bash
docker compose up --build -d
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
- 切片大小：`800`
- Overlap：`120`
- 文档内 TopK：`5`
- 知识库 TopK：`6`

> 切换 Embedding 模型后，建议立即重建索引。

---

## 模型容灾

系统支持为**聊天模型**和**向量模型**配置多个候选项，并对每个提供方执行**熔断 + 自动切换**：

1. 优先调用主模型 / 主提供方
2. 连续失败达到阈值后，对当前提供方临时熔断
3. 熔断期间自动跳过该提供方，切换到下一候选项
4. 冷却结束后进入半开状态，放行少量探测请求验证恢复
5. **只有全部候选都不可用**时，才返回提示消息或进入本地向量 fallback

前端设置页可配置：
- 备用提供方列表
- 熔断阈值（默认 `2`）
- 冷却秒数（默认 `30`）
- 半开探测数（默认 `1`）

其中，`聊天备用模型` / `Embedding 备用模型` 支持：
- 仅模型名：继承主 Provider / Base URL / API Key
- 完整写法：`provider | baseUrl | model | apiKey`

示例：

```text
qwen2.5:14b
openai-compatible | https://api.example.com/v1 | gpt-4o-mini | sk-***
ollama | http://10.0.0.8:11434 | qwen2.5:14b
```

---

## iframe 嵌入入口

推荐使用：

```text
http://localhost:4173/embed/kb-it-support
```

如果部署环境暂未配置 SPA 路由回退，可改用：

```text
http://localhost:4173/?embed=1&kb=kb-it-support
```

详细说明见：

- `docs/chat-integration/embed-final.md`
- `docs/chat-integration/embed-deployment.md`
- `docs/chat-integration/embed-handoff-template.md`

---

## 常用入口

### 服务台机器人 Demo

Docker 部署后：

```text
http://localhost:4173/?mode=service-desk-demo
```

前端本地开发模式：

```text
http://localhost:5173/?mode=service-desk-demo
```

### 常用接口

查看当前配置：

```bash
curl -s http://localhost:8080/api/config | jq .
```

查看知识库列表：

```bash
curl -s http://localhost:8080/api/knowledge-bases | jq .
```

查看服务台机器人运营摘要：

```bash
curl -s http://localhost:8080/api/service-desk/analytics/summary | jq .
```

查看 FAQ / 知识缺口 / 低质量回答 / 反馈明细：

```bash
curl -s "http://localhost:8080/api/service-desk/analytics/faq-candidates?limit=20" | jq .
curl -s "http://localhost:8080/api/service-desk/analytics/knowledge-gaps?limit=20" | jq .
curl -s "http://localhost:8080/api/service-desk/analytics/low-quality-answers?limit=20" | jq .
curl -s "http://localhost:8080/api/service-desk/analytics/feedback?limit=20&feedbackType=dislike" | jq .
```

重建索引：

```bash
curl -X POST http://localhost:8080/api/knowledge-bases/<kbId>/reindex
curl -X POST http://localhost:8080/api/knowledge-bases/<kbId>/documents/<documentId>/reindex
```

治理状态流转 / 责任人 / 备注：

```bash
curl -X PATCH http://localhost:8080/api/service-desk/analytics/faq-candidates/<id> \
  -H 'Content-Type: application/json' \
  -d '{"status":"approved","owner":"ops-zhangsan","note":"已整理到标准 FAQ"}'

curl -X PATCH http://localhost:8080/api/service-desk/analytics/knowledge-gaps/<id> \
  -H 'Content-Type: application/json' \
  -d '{"status":"resolved","owner":"delivery-li","note":"已补文档并重新索引"}'

curl -X PATCH http://localhost:8080/api/service-desk/analytics/low-quality-answers/batch \
  -H 'Content-Type: application/json' \
  -d '{"ids":["lqa-1","lqa-2"],"status":"resolved","owner":"ops-quality","note":"已补召回词并优化回答模板"}'
```

前端最简治理页：

```text
http://localhost:5173/?mode=ops-console
http://localhost:5173/ops
```

治理页已支持：
- 运营摘要卡片
- 单条状态流转
- 责任人编辑
- 处理备注记录
- 批量勾选与批量更新

---

## Linux 打包 / 镜像

安装环境：

```bash
bash scripts/linux/install_go_npm_env.sh
```

代码打包：

```bash
bash scripts/linux/package_release.sh
```

镜像构建：

```bash
bash scripts/linux/build_images.sh
```

构建并推送镜像：

```bash
REGISTRY_PREFIX=registry.cn-zhangjiakou.aliyuncs.com/ai_localbase \
TAG=$(git rev-parse --short HEAD) \
bash scripts/linux/build_and_push.sh
```

执行后会自动把 `docker-compose.yml` 中的 `backend` / `frontend` 镜像地址回写成刚刚 push 的地址。

更完整的部署说明见：[`DEPLOY_LINUX.md`](./DEPLOY_LINUX.md)

---

## 文档索引

- Fork / 维护说明：[`NOTICE.md`](./NOTICE.md)
- 本次改造发布说明：[`RELEASE_NOTES.md`](./RELEASE_NOTES.md)
- Linux 部署：[`DEPLOY_LINUX.md`](./DEPLOY_LINUX.md)
- 常见问题：[`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md)
- 对外聊天接口：[`docs/chat-integration/api.md`](./docs/chat-integration/api.md)
- 前端组件接入：[`docs/chat-integration/frontend-widget.md`](./docs/chat-integration/frontend-widget.md)
- 反馈闭环：[`docs/chat-integration/feedback-loop.md`](./docs/chat-integration/feedback-loop.md)
- FAQ / 持续优化：[`docs/chat-integration/faq-optimization.md`](./docs/chat-integration/faq-optimization.md)
- Demo 说明：[`docs/chat-integration/demo-guide.md`](./docs/chat-integration/demo-guide.md)

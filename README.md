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

如果你希望直接改成固定运行镜像，也可以在 `.env` 中覆盖：

```bash
BACKEND_IMAGE=registry.cn-zhangjiakou.aliyuncs.com/ai_localbase/ai-localbase-backend:v1.0.0
FRONTEND_IMAGE=registry.cn-zhangjiakou.aliyuncs.com/ai_localbase/ai-localbase-frontend:v1.0.0
QDRANT_IMAGE=registry.cn-zhangjiakou.aliyuncs.com/ai_localbase/qdrant:v1.13.4
```

---

## 本地开发

### 仅启动 Qdrant

```bash
docker compose -f docker-compose.qdrant.yml up -d
```

如果 Docker Hub 网络不稳定，可以先覆盖 Qdrant 镜像地址，例如：

```bash
QDRANT_IMAGE=registry.cn-zhangjiakou.aliyuncs.com/<你的命名空间>/qdrant:v1.13.4 docker compose -f docker-compose.qdrant.yml up -d
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

## 纯问答入口

推荐把“只允许问答、不展示设置和知识库管理”的场景统一走：

```text
http://localhost:4173/chat/{knowledgeBaseId}
```

例如：

```text
http://localhost:4173/chat/kb-it-support
```

如果部署环境暂未配置 SPA 路由回退，可改用：

```text
http://localhost:4173/?mode=chat-only&kb=kb-it-support
```

这个入口的特点：
- 固定绑定一个知识库
- 页面只保留问答
- 不显示设置面板
- 不显示知识库管理
- 适合外链、门户页、公开问答入口

如果要把纯问答页嵌到 iframe，并希望页面**无边距、无外层卡片、更加贴近宿主页面**，可直接使用：

```text
http://localhost:4173/chat/kb-it-support?frameless=1
```

详细说明见：

- `docs/chat-integration/chat-only-route.md`

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
- `OPS.md`

---

## 升级与回滚

### 安全升级

根目录已内置升级脚本：

```bash
REF=main AUTO_STASH=1 bash upgrade.sh
```

默认行为：

- 自动兼容 `docker compose` 和老版本 `docker-compose`
- 升级前先备份当前 `.env`、`docker-compose.yml`、`backend/data`、`qdrant_storage`
- 保留已上传文档、历史会话、知识库状态和向量数据
- 不执行 `docker compose down -v`
- 重新构建并启动新版本容器

### 镜像升级

如果你的服务器不想拉代码再本地构建，也可以直接使用镜像升级：

```bash
UPGRADE_MODE=image BACKEND_IMAGE=registry.cn-zhangjiakou.aliyuncs.com/ai_localbase/ai-localbase-backend:v1.0.0 FRONTEND_IMAGE=registry.cn-zhangjiakou.aliyuncs.com/ai_localbase/ai-localbase-frontend:v1.0.0 bash upgrade.sh
```

如果你想命令更短，可以直接用包装脚本：

```bash
bash scripts/linux/upgrade-by-image.sh registry.cn-zhangjiakou.aliyuncs.com/ai_localbase v1.0.0
```

如果服务器拉 Docker Hub 不稳定，也可以同时覆盖 Qdrant 镜像：

```bash
QDRANT_IMAGE=registry.cn-zhangjiakou.aliyuncs.com/<你的命名空间>/qdrant:v1.13.4 bash scripts/linux/upgrade-by-image.sh registry.cn-zhangjiakou.aliyuncs.com/ai_localbase v1.0.0
```

脚本会自动生成：

```text
docker-compose.image.override.yml
```

并按镜像方式执行 `pull + up --no-build`，同时仍保留历史数据与升级前备份。

补充说明：当前 `docker-compose.yml` 也已经支持统一镜像变量：

```bash
BACKEND_IMAGE=...
FRONTEND_IMAGE=...
QDRANT_IMAGE=...
```

如果你有自己的私有仓库，可以直接在 `.env` 中长期固定。

### 快速回滚

根目录已内置回滚脚本：

```bash
bash rollback.sh
```

默认会回滚到 `backups/upgrade/` 下最新的一份升级备份，并且：

- 回滚前再做一次当前状态保护备份
- 恢复上传文档、会话历史、知识库状态和向量数据
- 恢复备份对应的代码版本和配置

指定某一份备份回滚：

```bash
bash rollback.sh backups/upgrade/20250329-120000
```

如果只想恢复数据，不切换代码版本：

```bash
RESTORE_CODE=0 bash rollback.sh
```

---

## 常用入口

### 运维命令速查

更完整的日常运维命令请查看：`OPS.md`

安全升级：

```bash
REF=main AUTO_STASH=1 bash upgrade.sh
```

快速回滚：

```bash
bash rollback.sh
```

巡检当前部署状态：

```bash
bash scripts/linux/ops-check.sh
```

镜像升级（简化包装）：

```bash
bash scripts/linux/upgrade-by-image.sh <REGISTRY_PREFIX> <TAG>
```

---

### 纯问答页

Docker 部署后：

```text
http://localhost:4173/chat/kb-it-support
```

iframe 无边距极简版：

```text
http://localhost:4173/chat/kb-it-support?frameless=1
```

前端本地开发模式：

```text
http://localhost:5173/chat/kb-it-support
```

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
curl -s "http://localhost:8080/api/service-desk/analytics/faq-candidates?limit=20&publishedOnly=true" | jq .
curl -s "http://localhost:8080/api/service-desk/analytics/knowledge-gaps?limit=20" | jq .
curl -s "http://localhost:8080/api/service-desk/analytics/low-quality-answers?limit=20" | jq .
curl -s "http://localhost:8080/api/service-desk/analytics/feedback?limit=20&feedbackType=dislike" | jq .
```

查看治理周报 / 导出治理数据：

```bash
curl -s "http://localhost:8080/api/service-desk/analytics/weekly-report?knowledgeBaseId=<kbId>" | jq .
curl -s "http://localhost:8080/api/service-desk/analytics/export?scope=weekly-report&format=markdown&knowledgeBaseId=<kbId>" | jq .
curl -s "http://localhost:8080/api/service-desk/analytics/export?scope=faq-candidates&format=markdown&knowledgeBaseId=<kbId>&owner=ops-faq" | jq .
```

把 FAQ 候选整理成标准 FAQ 草稿：

```bash
curl -X POST http://localhost:8080/api/service-desk/analytics/faq-candidates/<id>/publish \
  -H 'Content-Type: application/json' \
  -d '{"question":"Redis 的核心特点是什么？","answer":"Redis 适合高性能缓存、结构化数据读写和快速恢复场景。","publishedBy":"ops-faq-publisher","note":"已整理为 FAQ 草稿，待审核后同步到帮助中心"}'
```

把 FAQ 草稿直接回写到知识库：

```bash
curl -X POST http://localhost:8080/api/service-desk/analytics/faq-candidates/<id>/publish-to-kb \
  -H 'Content-Type: application/json' \
  -d '{"question":"Redis 的核心特点是什么？","answer":"Redis 适合高性能缓存、结构化数据读写和快速恢复场景。","publishedBy":"ops-faq-publisher","note":"已整理为 FAQ 草稿并同步知识库","knowledgeBaseId":"<kbId>","documentName":"FAQ-Redis-核心特点.md","publishMode":"create_new","markAsDefaultCollection":true}'
```

把 FAQ 追加到已有 FAQ 合集文档：

```bash
curl -X POST http://localhost:8080/api/service-desk/analytics/faq-candidates/<id>/publish-to-kb \
  -H 'Content-Type: application/json' \
  -d '{"knowledgeBaseId":"<kbId>","publishMode":"append_to_document","targetDocumentId":"<docId>","question":"Redis 的核心特点是什么？","answer":"Redis 适合高性能缓存、结构化数据读写和快速恢复场景。","publishedBy":"ops-faq-publisher","note":"已更新 FAQ 合集中的 Redis 说明"}'
```

支持的 FAQ 发布模式：

- `create_new`：新建 FAQ Markdown 文档
- `append_to_document`：追加到已有文档；如果同一 FAQ 已存在，会按问题 key 自动替换，避免重复堆积
- `replace_document`：用当前 FAQ 文档整体覆盖目标文档

- 系统会优先推荐最近一次发布过的 FAQ 文档；如果没有历史记录，会优先推荐名字看起来像 FAQ 合集 / 常见问题的文档
- FAQ 候选会记录最近一次发布到哪个知识库、哪个文档、用了什么模式，以及累计发布次数

查看 FAQ 发布历史：

```bash
curl -s "http://localhost:8080/api/service-desk/analytics/faq-candidates/<id>/publish-history?limit=10" | jq .
```

导出 FAQ 发布历史（Markdown）：

```bash
curl -s "http://localhost:8080/api/service-desk/analytics/faq-candidates/<id>/publish-history/export?limit=50&format=markdown" | jq -r '.data.content'
```

- 知识库文档列表现在会直接标出 `默认 FAQ 合集` / `FAQ 文档`
- 如果同一条 FAQ 已经分散发布到多份文档，治理台会给出提示，并支持一键导出发布历史留档
- 治理台现在可以直接选择发布历史导出格式（Markdown / JSON），也可以一键把 FAQ 追加到当前知识库的默认 FAQ 合集
- 知识库管理弹窗支持按文档类型筛选：全部文档 / FAQ 文档 / 默认 FAQ 合集 / 普通文档

把某份知识库文档设为默认 FAQ 合集：

```bash
curl -X PATCH http://localhost:8080/api/knowledge-bases/<kbId>/documents/<docId>/faq-collection \
  -H 'Content-Type: application/json' \
  -d '{"isFaqCollection":true,"isDefaultFaqCollection":true}'
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
- 周治理报告卡片
- 单条状态流转
- 责任人编辑
- 责任人筛选
- 处理备注记录
- 批量勾选与批量更新
- 导出当前视图
- 导出本周周报
- 一键生成 FAQ 草稿
- 一键发布到知识库

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

每次发版都刷新 `latest`（推荐用于服务器始终拉最新）：

```bash
export REGISTRY_PREFIX=registry.cn-zhangjiakou.aliyuncs.com/ai_localbase
export RELEASE_TAG=$(date +%Y%m%d%H%M%S)
REGISTRY_PREFIX=${REGISTRY_PREFIX} TAG=${RELEASE_TAG} PUSH_LATEST=1 UPDATE_COMPOSE_IMAGE=0 bash scripts/linux/build_and_push.sh
```

一键发布（构建推送 backend/frontend、可选同步 qdrant、可选打 git tag）：

```bash
bash scripts/linux/release.sh v1.0.1 registry.cn-zhangjiakou.aliyuncs.com/ai_localbase
```

如果希望额外推送 `latest`：

```bash
PUSH_LATEST=1 bash scripts/linux/release.sh v1.0.1 registry.cn-zhangjiakou.aliyuncs.com/ai_localbase
```

打包机一键发布 latest：

```bash
bash scripts/linux/publish-latest.sh
```

如果服务器不依赖 git，只想下载单独脚本直接部署 / 升级 latest：

```bash
curl -fsSL https://raw.githubusercontent.com/fatmanverse/ai-localbase/main/scripts/linux/upgrade-latest.sh -o upgrade-latest.sh
chmod +x upgrade-latest.sh
PULL_QDRANT=0 bash upgrade-latest.sh /data/ai-localbase registry.cn-zhangjiakou.aliyuncs.com/ai_localbase
```

或者下载功能更完整的部署脚本：

```bash
curl -fsSL https://raw.githubusercontent.com/fatmanverse/ai-localbase/main/scripts/linux/deploy-latest.sh -o deploy-latest.sh
chmod +x deploy-latest.sh
PULL_QDRANT=0 bash deploy-latest.sh /data/ai-localbase registry.cn-zhangjiakou.aliyuncs.com/ai_localbase latest
```

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

# Linux 部署说明（最简版）

---

## 方式一：直接用 Docker 启动

### 1. 准备模型
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

如果服务器要走代理再构建：
```bash
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890
export NO_PROXY=localhost,127.0.0.1,host.docker.internal,qdrant,backend,frontend
docker compose up --build -d
```

### 4. 访问
- 前端：`http://localhost:4173`
- 后端：`http://localhost:8080`
- Qdrant：`http://localhost:6333`

停止：
```bash
docker compose down
```

### 如果出现 `invalid IP address in add-host: "host-gateway"`
说明 Docker 版本较旧，不支持 `host-gateway`。

先获取宿主机 `docker0` IP：

```bash
ip addr show docker0 | awk '/inet / {print $2}' | cut -d/ -f1
```

然后写入 `.env`：

```bash
HOST_GATEWAY_IP=172.17.0.1
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

再执行：

```bash
docker compose up --build -d
```

---

## 方式二：先安装环境，再本地打包

### 安装 Go / Node / npm / Docker
```bash
INSTALL_DOCKER=1 bash scripts/linux/install_go_npm_env.sh
```

### 打包发布物
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

### 构建并推送到镜像仓库
```bash
REGISTRY_PREFIX=registry.cn-zhangjiakou.aliyuncs.com/ai_localbase TAG=$(git rev-parse --short HEAD) bash scripts/linux/build_and_push.sh
```

执行后会自动把 `docker-compose.yml` 中的 `backend` / `frontend` 镜像地址更新为刚刚 push 的镜像。

如需顺手推 `latest`：
```bash
REGISTRY_PREFIX=registry.cn-zhangjiakou.aliyuncs.com/ai_localbase TAG=$(git rev-parse --short HEAD) PUSH_LATEST=1 bash scripts/linux/build_and_push.sh
```

---

### CentOS 7 / EL7 说明
项目脚本会自动识别老版本 glibc。
在 `CentOS 7 / EL7 x64` 环境会自动切换到 **Node.js 16.20.2 兼容版本**，避免 Node 20 在老系统上的 `GLIBC` / `GLIBCXX` 报错。
如果你不想在宿主机装 Node，建议直接使用 Docker 完成前端构建。

---

## 默认推荐配置

- Chat：`qwen2.5:7b`
- Embedding：`nomic-embed-text`
- Qdrant Vector Size：`768`
- Ollama URL：`http://host.docker.internal:11434`

如果你切换了 Embedding 模型，请重建索引。

### 模型容灾建议

建议至少为聊天模型和向量模型各配置 1 个备用项：

1. 主模型：本机 Ollama
2. 备用模型：同机更大模型，或另一套 OpenAI Compatible 接口
3. 只有全部候选不可用时，系统才会向用户返回失败提示

前端设置页中，备用模型支持：

```text
qwen2.5:14b
openai-compatible | https://api.example.com/v1 | gpt-4o-mini | sk-***
```

说明：
- 仅写模型名：继承主 Provider / Base URL / API Key
- 完整写法：`provider | baseUrl | model | apiKey`

---

## iframe / 外部系统接入

### 推荐接入地址
```text
http://服务器IP:4173/embed/kb-it-support
```

### 无 SPA 路由回退时的兼容地址
```text
http://服务器IP:4173/?embed=1&kb=kb-it-support
```

### 详细部署与交付文档
- `docs/chat-integration/embed-final.md`
- `docs/chat-integration/embed-deployment.md`
- `docs/chat-integration/embed-handoff-template.md`

---

## 工单机器人 Demo

### 打开前端演示页
```text
http://服务器IP:4173/?mode=service-desk-demo
```

### 查看对外聊天接口文档
- `docs/chat-integration/api.md`
- `docs/chat-integration/frontend-widget.md`

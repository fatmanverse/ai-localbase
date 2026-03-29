# AI LocalBase 运维手册（最常用版）

> 适用目标：**生产 / 测试环境的日常部署、巡检、升级、回滚与问题排查**。  
> 默认基于当前仓库根目录执行命令。

---

## 一、最常用 10 条命令

### 1. 首次启动 / 重建启动

```bash
docker compose up --build -d
```

### 2. 查看容器状态

```bash
docker compose ps
```

### 3. 巡检当前部署状态

```bash
bash scripts/linux/ops-check.sh
```

### 4. 查看后端日志

```bash
docker compose logs -f backend
```

### 5. 查看前端日志

```bash
docker compose logs -f frontend
```

### 6. 安全升级到当前分支最新代码

```bash
REF=main AUTO_STASH=1 bash upgrade.sh
```

### 7. 回滚到最近一次升级备份

```bash
bash rollback.sh
```

### 8. 回滚到指定备份目录

```bash
bash rollback.sh backups/upgrade/<timestamp>
```

### 9. 只恢复数据与配置，不切代码版本

```bash
RESTORE_CODE=0 bash rollback.sh
```

### 10. 停止服务

```bash
docker compose down
```

---

## 二、服务访问地址

### 前端

```text
http://服务器IP:4173
```

### 纯问答页

```text
http://服务器IP:4173/chat/kb-it-support
```

### 纯问答页 iframe 无边距极简版

```text
http://服务器IP:4173/chat/kb-it-support?frameless=1
```

### 嵌入式服务台页

```text
http://服务器IP:4173/embed/kb-it-support
```

### 后端 API

```text
http://服务器IP:8080
```

### Qdrant

```text
http://服务器IP:6333
```

---

## 三、首次部署流程

### 1. 准备环境变量

```bash
cp .env.example .env
```

### 2. 准备模型

```bash
ollama pull qwen2.5:7b
ollama pull nomic-embed-text
```

### 3. 启动服务

```bash
docker compose up --build -d
```

### 4. 巡检服务

```bash
bash scripts/linux/ops-check.sh
```

---

## 四、日常巡检

### 标准巡检

```bash
bash scripts/linux/ops-check.sh
```

脚本会检查：

- docker compose 容器状态
- 4173 / 8080 / 6333 端口监听
- 前端 / 后端 / Qdrant HTTP 可达性
- `backend/data` 数据目录状态
- `qdrant_storage` 向量数据目录状态
- 最近升级备份与回滚保护备份
- `.env` 是否缺少 `.env.example` 中新增变量

### 只看容器和目录，不检查 HTTP

```bash
CHECK_HTTP=0 bash scripts/linux/ops-check.sh
```

---

## 五、安全升级流程

### 推荐命令

```bash
REF=main AUTO_STASH=1 bash upgrade.sh
```

### 升级脚本会做什么

- 升级前备份当前 `.env`、`docker-compose.yml`、`backend/data`、`qdrant_storage`
- 保留已上传文档、历史会话、知识库状态和向量数据
- 不执行 `docker compose down -v`
- 拉取目标代码版本
- 自动重建并启动新版本容器

### 6.1 通过镜像升级

如果你已经把镜像推到仓库，可以不拉代码，直接按镜像升级：

```bash
UPGRADE_MODE=image BACKEND_IMAGE=registry.cn-zhangjiakou.aliyuncs.com/ai_localbase/ai-localbase-backend:v1.0.0 FRONTEND_IMAGE=registry.cn-zhangjiakou.aliyuncs.com/ai_localbase/ai-localbase-frontend:v1.0.0 bash upgrade.sh
```

升级脚本会自动生成：

```text
docker-compose.image.override.yml
```

之后 `rollback.sh` 与 `scripts/linux/ops-check.sh` 也会自动识别这个覆盖文件。

### 升级完成后建议立刻执行

```bash
bash scripts/linux/ops-check.sh
```

---

## 六、快速回滚流程

### 回滚到最近一次升级备份

```bash
bash rollback.sh
```

### 回滚到指定备份目录

```bash
bash rollback.sh backups/upgrade/20250329-120000
```

### 只恢复数据与配置，不切代码版本

```bash
RESTORE_CODE=0 bash rollback.sh
```

### 回滚脚本会做什么

- 回滚前对当前状态再做一次保护备份
- 停止当前容器，但**不删除卷**
- 恢复备份中的 `.env`、`docker-compose.yml`、`backend/data`、`qdrant_storage`
- 默认恢复备份对应的代码提交
- 重新构建并启动容器

### 回滚完成后建议立刻执行

```bash
bash scripts/linux/ops-check.sh
```

---

## 七、数据与备份目录

### 业务数据目录

- 上传文档 / 会话历史 / 应用状态：

```text
backend/data
```

- Qdrant 向量数据：

```text
qdrant_storage
```

### 升级备份目录

```text
backups/upgrade
```

### 回滚前保护备份目录

```text
backups/rollback-safety
```

---

## 八、常用日志命令

### 查看全部服务日志

```bash
docker compose logs -f
```

### 查看后端日志

```bash
docker compose logs -f backend
```

### 查看前端日志

```bash
docker compose logs -f frontend
```

### 查看 Qdrant 日志

```bash
docker compose logs -f qdrant
```

---

## 九、常见运维场景

### 场景 1：升级前先确认环境是否正常

```bash
bash scripts/linux/ops-check.sh
REF=main AUTO_STASH=1 bash upgrade.sh
bash scripts/linux/ops-check.sh
```

### 场景 2：升级后发现异常，立即回滚

```bash
bash rollback.sh
bash scripts/linux/ops-check.sh
```

### 场景 3：只想恢复数据，不想切代码

```bash
RESTORE_CODE=0 bash rollback.sh
bash scripts/linux/ops-check.sh
```

### 场景 4：查看当前最近一次升级备份

```bash
ls -lah backups/upgrade
```

### 场景 5：查看最近一次回滚保护备份

```bash
ls -lah backups/rollback-safety
```

---

## 十、推荐的日常操作顺序

### 稳妥做法

1. 巡检当前状态
2. 执行升级
3. 再次巡检
4. 若有异常，立即回滚
5. 回滚后再次巡检

对应命令：

```bash
bash scripts/linux/ops-check.sh
REF=main AUTO_STASH=1 bash upgrade.sh
bash scripts/linux/ops-check.sh
bash rollback.sh
bash scripts/linux/ops-check.sh
```

---

## 十一、相关文档

- `README.md`
- `DEPLOY_LINUX.md`
- `TROUBLESHOOTING.md`
- `docs/chat-integration/chat-only-route.md`
- `docs/chat-integration/embed-handoff-template.md`

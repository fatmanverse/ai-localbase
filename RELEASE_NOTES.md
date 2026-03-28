# RELEASE NOTES

## 本次版本改造概览

本次版本将项目从“本地知识库聊天页”进一步收敛为一套**最简单可用**、同时具备**对外接入能力**的 AI 知识库 / 服务台机器人系统。

---

## 1. 产品能力升级

### 对外聊天能力

新增统一服务台接口：

- `POST /api/service-desk/conversations`
- `GET /api/service-desk/conversations/:id`
- `GET /api/service-desk/conversations/:id/messages`
- `POST /api/service-desk/conversations/:id/messages`
- `POST /api/service-desk/conversations/:id/messages/stream`
- `POST /api/service-desk/messages/:id/feedback`
- `GET /api/service-desk/analytics/summary`

### 可嵌入前端组件

新增 `frontend/src/widget`，可直接嵌入其他 React 项目，支持：

- 工单上下文展示
- 消息发送与历史展示
- 流式消息渲染
- 点赞 / 点踩 / 原因 / 补充说明
- 相关图片知识展示
- 快捷问题建议

---

## 2. 知识库与文档处理增强

### 上传与进度展示

新增异步上传任务接口：

- `POST /api/knowledge-bases/:id/document-uploads`
- `GET /api/knowledge-bases/:id/document-uploads/:taskId`
- `DELETE /api/knowledge-bases/:id/document-uploads/:taskId`

支持展示：

- 文件传输进度
- 正文抽取进度
- 图片 OCR 进度
- 切片进度
- 向量化进度
- 入库进度

### 图片知识处理 MVP

新增图片处理链路：

- 图片提取
- OCR 文本恢复
- 图片分类
- 图片描述生成
- 图文关联
- 检索入库
- 回答阶段带回相关图片

---

## 3. 模型容灾增强

### 聊天模型容灾

支持主模型 + 多候选模型自动切换：

1. 主模型优先
2. 主模型失败后按 `chat.candidates` 顺序切换
3. 只有全部失败才向用户返回友好降级提示

### 向量模型容灾

支持主 embedding + 多候选 embedding 自动切换：

1. 主 embedding 优先
2. 主 embedding 失败后按 `embedding.candidates` 顺序切换
3. 全部失败后退回 deterministic embedding fallback

---

## 4. 反馈闭环与持续优化

新增反馈与运营闭环能力：

- 点赞 / 点踩
- 点踩原因分类
- 用户补充说明
- FAQ 候选沉淀
- 知识缺口清单
- 低质量回答清单
- 周维度反馈统计

图片相关失败原因已纳入：

- 图片文字未识别
- 图片内容未召回
- 图文理解不完整
- 图片描述不准确
- 图片信息过时

---

## 5. 工程与文档整理

### 文档新增

- `docs/chat-integration/api.md`
- `docs/chat-integration/frontend-widget.md`
- `docs/chat-integration/feedback-loop.md`
- `docs/chat-integration/faq-optimization.md`
- `docs/chat-integration/demo-guide.md`
- `NOTICE.md`
- `RELEASE_NOTES.md`

### 部署与打包

保留并整理 Linux 相关脚本：

- `scripts/linux/install_go_npm_env.sh`
- `scripts/linux/package_release.sh`
- `scripts/linux/build_images.sh`
- `scripts/linux/build_and_push.sh`

---

## 6. 静态验证结果

本次已完成的静态验证：

### 后端

```bash
cd backend
go test ./...
```

### 前端

```bash
cd frontend
npm run build
```

结果：**通过**。

---

## 7. 验证边界说明

本次交付未执行以下运行态验证：

- 未启动前端 dev server
- 未启动后端服务
- 未执行 `docker compose up`
- 未做本地页面联调

原因：本次改造按“**单次完整交付 + 不做本地服务启动测试**”要求执行。

因此，本次版本以**代码静态可用性、类型/构建闭合、接口与文档一致性**作为验收基线。

# RELEASE NOTES

## v0.5.2 增量更新

### FAQ 治理台进一步提效

- FAQ 发布历史导出现在支持前端直接选择 `Markdown / JSON`
- FAQ 候选卡片新增“发布到默认 FAQ 合集”，默认合集存在时可直接追加过去
- 知识库文档管理弹窗新增文档类型筛选：全部文档 / FAQ 文档 / 默认 FAQ 合集 / 普通文档
- FAQ 卡片会显示当前知识库默认 FAQ 合集名称，减少人工反复确认

### 静态验证

```bash
cd backend && PATH=/usr/local/go/bin:$PATH go test ./...
cd frontend && npm run build
```

结果：**通过**。

---

## v0.5.1 增量更新

### FAQ 治理台继续收敛

- 新增 FAQ 发布历史导出接口：`GET /api/service-desk/analytics/faq-candidates/:id/publish-history/export`，支持 Markdown / JSON
- 知识库文档列表直接显示 `默认 FAQ 合集` / `FAQ 文档` 标记，减少误选
- 治理台 FAQ 卡片新增“导出发布历史”按钮
- 当同一条 FAQ 曾发布到多份文档时，治理台会给出冲突提示，提醒运营收敛到统一 FAQ 合集

### 静态验证

```bash
cd backend && PATH=/usr/local/go/bin:$PATH go test ./...
cd frontend && npm run build
```

结果：**通过**。

---

## v0.5.0 增量更新

### FAQ 发布历史与默认合集增强

- 新增 FAQ 发布历史表与接口：`GET /api/service-desk/analytics/faq-candidates/:id/publish-history`
- FAQ 发布到知识库时，会同步写入历史记录，保留知识库、文档、模式、时间与整理人信息
- 新增文档接口：`PATCH /api/knowledge-bases/:id/documents/:documentId/faq-collection`，可把指定文档设为默认 FAQ 合集
- FAQ 发布请求新增 `markAsDefaultCollection` 参数，可在发布时顺手把目标文档设为默认 FAQ 合集
- 前端治理台支持查看 FAQ 发布历史、一键继续发布到上次文档，以及手动设置默认 FAQ 合集

### 静态验证

```bash
cd backend && PATH=/usr/local/go/bin:$PATH go test ./...
cd frontend && npm run build
```

结果：**通过**。

---

## v0.4.9 增量更新

### FAQ 发布推荐与记录增强

- FAQ 候选新增最近一次知识库发布记录字段，包括最近知识库、最近文档、最近发布模式、最近发布时间与累计发布次数
- FAQ 发布到知识库成功后，会自动回写这些记录，方便后续继续追加到同一份 FAQ 合集文档
- 前端治理台会优先带出最近使用的 FAQ 文档；如果没有历史记录，会优先推荐名字像 FAQ 合集 / 常见问题的文档
- FAQ 卡片新增最近发布信息展示，减少重复判断“这条 FAQ 上次发到哪里了”

### 静态验证

```bash
cd backend && PATH=/usr/local/go/bin:$PATH go test ./...
cd frontend && npm run build
```

结果：**通过**。

---

## v0.4.8 增量更新

### FAQ 文档合并发布

- FAQ 回写知识库接口新增 `publishMode` 与 `targetDocumentId` 参数
- 支持 `create_new / append_to_document / replace_document` 三种发布模式
- 追加模式会按 FAQ 问题 key 合并到已有 FAQ 文档；若同一 FAQ 已存在，则自动替换原条目，避免重复堆积
- 前端治理台支持选择发布方式、目标文档，并可直接把 FAQ 发布到 FAQ 合集文档

### 静态验证

```bash
cd backend && PATH=/usr/local/go/bin:$PATH go test ./...
cd frontend && npm run build
```

结果：**通过**。

---

## v0.4.7 增量更新

### FAQ 回写知识库

- 新增接口：`POST /api/service-desk/analytics/faq-candidates/:id/publish-to-kb`
- FAQ 候选现在可以直接生成 Markdown 文档并写入指定知识库
- 服务端会在写入后立刻完成索引，避免再手工上传
- 前端治理台新增“发布到知识库”按钮、目标知识库选择和文档名输入

### 静态验证

```bash
cd backend && PATH=/usr/local/go/bin:$PATH go test ./...
cd frontend && npm run build
```

结果：**通过**。

---

## v0.4.6 增量更新

### 治理台能力增强

- 新增治理周报接口：`GET /api/service-desk/analytics/weekly-report`
- 新增治理导出接口：`GET /api/service-desk/analytics/export`
- 新增 FAQ 草稿发布接口：`POST /api/service-desk/analytics/faq-candidates/:id/publish`
- FAQ 候选列表支持 `publishedOnly=true` 过滤
- 前端治理台支持责任人筛选、导出当前视图、导出本周周报和一键生成 FAQ 草稿

### 运营闭环补强

- FAQ 候选现在可以保存标准问题、标准回答、整理人、整理时间与备注
- FAQ 草稿会自动导出 Markdown，方便继续审核或同步到帮助中心
- 治理周报会汇总本周重点、FAQ 候选、知识缺口和低质量回答

### 静态验证

```bash
cd backend && PATH=/usr/local/go/bin:$PATH go test ./...
cd frontend && npm run build
```

结果：**通过**。

---

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

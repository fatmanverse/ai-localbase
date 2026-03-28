# 反馈闭环说明

## 已实现的反馈能力

当前以下两条链路都已支持反馈：

- 普通聊天页
- service-desk / widget / iframe 嵌入页

每条机器人回答都支持：

- 👍 已解决
- 👎 仍未解决
- 点踩原因选择
- 用户补充说明文本

点踩原因支持：

- 答非所问
- 内容不准确
- 内容不完整
- 内容过时
- 没有解决问题
- 检索结果不相关
- 图片文字未识别
- 图片内容未召回
- 图文理解不完整
- 图片描述不准确
- 图片信息过时
- 其他

---

## 反馈存储结构

反馈写入 SQLite 表：

```text
message_feedback
```

关键字段：

- `conversation_id`
- `message_id`
- `user_id`
- `feedback_type`
- `feedback_reason`
- `feedback_text`
- `question_text`
- `answer_text`
- `knowledge_base_id`
- `retrieved_context`
- `source_documents_json`
- `source_platform`
- `tenant_id`
- `ticket_id`
- `created_at`

---

## 消息级追踪信息

机器人回答会记录：

- `knowledgeBaseId`
- `documentId`
- `retrievedContext`
- `sourceDocuments`
- `relatedImages`
- `degraded`
- `fallbackStrategy`
- `upstreamError`

这使得运营人员可以把“回答质量差”追溯到：

- 检索召回问题
- 文档缺失问题
- 模型生成问题
- 上游模型服务异常
- 图片 OCR / 图文关联 / 图片召回问题

---

## 闭环流转

### 高质量回答

- 用户连续点赞
- 点赞次数达到阈值后进入 FAQ 候选
- 可在运营侧人工审核后转为标准 FAQ

### 低质量回答

- 用户点踩
- 进入低质量回答清单
- 如果原因集中为“答非所问 / 检索不相关”，优先检查检索参数与提示词
- 如果原因集中为“不准确 / 不完整 / 过时”，优先补知识文档与 FAQ

---

## FAQ 正式化与治理周报

### FAQ 草稿生成

新增接口：

```http
POST /api/service-desk/analytics/faq-candidates/:id/publish
```

用途：

- 把高赞回答整理成标准 FAQ 问答
- 保存整理人、整理时间与备注
- 同时返回一份 Markdown FAQ 草稿，方便继续审核或同步到帮助中心
- 如需一步到位，也可以直接回写成知识库文档

FAQ 候选列表还支持：

- `publishedOnly=true`：只看已整理过 FAQ 文稿的候选项

### FAQ 直接回写知识库

新增接口：

```http
POST /api/service-desk/analytics/faq-candidates/:id/publish-to-kb
```

用途：

- 在生成 FAQ 草稿的同时，直接写入指定知识库
- 服务端会自动生成 Markdown 文档并立刻完成索引
- 前端治理台可以直接选择目标知识库、发布方式和目标文档
- 支持按 FAQ 问题 key 合并到已有 FAQ 合集文档，避免重复堆积

FAQ 回写模式：

- `create_new`：新建 FAQ 文档
- `append_to_document`：追加到现有文档；若同一 FAQ 已存在则自动替换
- `replace_document`：用当前 FAQ 文档整体覆盖目标文档

治理台会优先带出最近一次发布过的 FAQ 文档；如果当前候选还没有历史记录，则会优先推荐名称像 FAQ 合集 / 常见问题的文档，减少人工反复选择。

同时，FAQ 候选会保留最近一次发布记录和累计发布次数，方便运营回看“这条 FAQ 上次已经发布到哪里”。

如果需要把某份文档固定成 FAQ 合集入口，还可以通过文档接口把它设为“默认 FAQ 合集”。后续 FAQ 发布推荐会优先命中这份文档。

治理台同时支持查看 FAQ 发布历史，以及一键继续发布到上次文档，减少重复找目标文档的操作。

### 治理周报

新增接口：

```http
GET /api/service-desk/analytics/weekly-report?knowledgeBaseId=kb-1
```

周报会输出：

- 本周反馈摘要
- 本周重点提醒
- Top FAQ 候选
- Top 知识缺口
- Top 低质量回答
- 一份可直接复制或导出的 Markdown 周报正文

### 导出接口

新增接口：

```http
GET /api/service-desk/analytics/export?scope=faq-candidates&format=markdown
```

支持导出：

- `weekly-report`
- `faq-candidates`
- `knowledge-gaps`
- `low-quality-answers`
- `feedback`

支持格式：

- `markdown`
- `json`

---

## 普通聊天页反馈接口

普通聊天页现在也支持直接提交消息反馈：

```http
POST /api/conversations/:id/messages/:messageId/feedback
Content-Type: application/json
```

示例：

```json
{
  "feedbackType": "dislike",
  "feedbackReason": "内容不完整",
  "feedbackText": "少了截图里的按钮位置说明"
}
```

服务端会自动补齐：

- 当前会话 ID
- 当前回答 ID
- 上一轮用户问题
- 当前答案正文
- 当前知识库 ID
- 当前回答来源文档
- `channel=normal-chat` 元数据

提交成功后会同步写入：

- `message_feedback`
- `faq_candidates`
- `knowledge_gaps`
- `low_quality_answers`

---

## 运营建议

1. 每周先看 `analytics/summary` 和 `analytics/weekly-report`，优先判断本周差评是否集中在某个知识库。
2. 用 `analytics/faq-candidates` 拉取高赞 FAQ 候选，必要时加上 `owner`、`status`、`publishedOnly` 筛选。
3. 对值得沉淀的问答，直接调用 `POST /api/service-desk/analytics/faq-candidates/:id/publish` 生成 FAQ 草稿。
4. 用 `analytics/knowledge-gaps` 筛选高频知识缺口，并在备注里记录“已补文档 / 已重建索引 / 待业务确认”等动作。
5. 用 `analytics/low-quality-answers` 看高频差评回答，把问题归因到切片、检索、答案策略或知识缺失。
6. 用 `analytics/export` 导出当前视图，直接发给运营、交付或产品同学复盘。
7. 在前端 `?mode=ops-console` / `/ops` 页面直接做勾选、指派、备注、导出、FAQ 草稿整理，以及 FAQ 合集文档发布。
8. 优先处理高频点踩的问题，再回头补 FAQ 与图片型知识说明。

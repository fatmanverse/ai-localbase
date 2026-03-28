# 对外聊天接口说明

## 概览

新增统一外接接口前缀：

```text
/api/service-desk
```

适用场景：
- 工单系统
- 客服系统
- 企业门户
- 内部服务台
- 任意 Web 前端 / Widget / iframe

统一返回结构：

```json
{
  "success": true,
  "data": {}
}
```

错误结构：

```json
{
  "success": false,
  "error": {
    "code": "send_message_failed",
    "message": "conversation not found"
  }
}
```

---

## 1. 创建会话

### 请求

```http
POST /api/service-desk/conversations
Content-Type: application/json
```

```json
{
  "knowledgeBaseId": "kb-1",
  "title": "工单 INC-10086",
  "status": "open",
  "context": {
    "userId": "u-001",
    "tenantId": "tenant-a",
    "ticketId": "INC-10086",
    "sourcePlatform": "itsm-portal",
    "category": "账号与访问",
    "priority": "P2",
    "tags": ["登录", "SSO"]
  },
  "sessionMetadata": {
    "channel": "portal-widget",
    "department": "IT"
  }
}
```

### 响应

```json
{
  "success": true,
  "data": {
    "id": "sdc-1",
    "title": "工单 INC-10086",
    "status": "open",
    "knowledgeBaseId": "kb-1",
    "createdAt": "2025-03-28T10:00:00Z",
    "updatedAt": "2025-03-28T10:00:00Z",
    "context": {
      "ticketId": "INC-10086",
      "userId": "u-001",
      "tenantId": "tenant-a",
      "sourcePlatform": "itsm-portal",
      "category": "账号与访问"
    },
    "messages": []
  }
}
```

---

## 2. 获取会话详情

```http
GET /api/service-desk/conversations/:id
```

返回完整会话、上下文、消息、反馈摘要。

---

## 3. 获取会话消息列表

```http
GET /api/service-desk/conversations/:id/messages
```

用于外部系统按需加载消息历史。

---

## 4. 发送消息

### 非流式

```http
POST /api/service-desk/conversations/:id/messages
Content-Type: application/json
```

```json
{
  "content": "账号密码正确但 SSO 登录失败怎么办？",
  "knowledgeBaseId": "kb-1",
  "context": {
    "ticketId": "INC-10086",
    "category": "账号与访问"
  },
  "sessionMetadata": {
    "page": "employee-portal"
  }
}
```

### 响应

```json
{
  "success": true,
  "data": {
    "conversation": {},
    "userMessage": {},
    "assistantMessage": {
      "id": "sdmsg-2",
      "role": "assistant",
      "content": "## 处理建议 ...",
      "trace": {
        "knowledgeBaseId": "kb-1",
        "retrievedContext": "...",
        "sourceDocuments": [
          {
            "knowledgeBaseId": "kb-1",
            "documentId": "doc-1",
            "documentName": "账号登录排障手册.md"
          }
        ]
      },
      "feedbackSummary": {
        "likeCount": 0,
        "dislikeCount": 0
      }
    }
  }
}
```

---

## 4.1 模型容灾说明

系统现已支持**聊天模型**与**向量模型**的主配置 + 多候选容灾，并支持提供方级别的**熔断 + 自动切换**：

1. 优先尝试主模型 / 主 embedding。
2. 主配置连续失败达到阈值后，对当前提供方临时熔断。
3. 熔断期间自动跳过该提供方，按 `candidates` 顺序切换到下一项。
4. 冷却时间结束后进入半开状态，仅放行少量探测请求验证恢复。
5. **只有全部候选都失败**时，才向提问方返回友好降级提示。
6. 向量模型全部失败时，会退回 deterministic embedding，保证检索链路尽量不中断。

### 配置方式

前端设置页与配置接口均支持：

- `chat.candidates`
- `embedding.candidates`
- `chat.circuitBreaker`
- `embedding.circuitBreaker`

每个候选项字段：

- `provider`
- `baseUrl`
- `model`
- `apiKey`

熔断配置字段：

- `failureThreshold`：连续失败多少次后熔断
- `cooldownSeconds`：熔断后冷却多久再尝试恢复
- `halfOpenMaxRequests`：半开阶段允许多少个探测请求

### `/v1/chat/completions` 响应中的 failover metadata

当直接对接通用聊天接口时，响应 `metadata` 中会包含以下字段：

- `candidateCount`：本次参与尝试的模型数量
- `activeProvider`：最终生效的 provider
- `activeModel`：最终生效的模型
- `failoverUsed`：是否发生了主模型 -> 备用模型切换
- `modelFailoverHistory`：失败尝试历史
- `circuitBreakerUsed`：是否因熔断跳过了某些提供方
- `circuitBreakerSkips`：被熔断跳过的提供方列表
- `circuitBreakerPolicy`：本次生效的熔断策略
- `degraded`：是否进入降级响应
- `fallbackStrategy`：降级策略，如 `model-failover`、`local-message-after-failover`
- `upstreamError`：全部失败时的上游错误汇总

示例：

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1743156000,
  "model": "qwen2.5:14b",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "## 处理建议..."
      }
    }
  ],
  "metadata": {
    "candidateCount": 3,
    "activeProvider": "openai-compatible",
    "activeModel": "gpt-4o-mini",
    "failoverUsed": true,
    "modelFailoverHistory": [
      "ollama @ qwen2.5:14b => dial tcp 127.0.0.1:11434: connect: connection refused"
    ],
    "knowledgeBaseId": "kb-1"
  }
}
```

### service-desk 接口中的容灾可观测字段

为保持对外工单接口简洁，`/api/service-desk/...` 不直接暴露全部模型路由细节，但会在机器人消息中保留关键降级信息：

- `assistantMessage.trace.degraded`
- `assistantMessage.trace.fallbackStrategy`
- `assistantMessage.trace.upstreamError`

这意味着：

- 外部工单系统可以感知本次回答是否处于降级状态
- 运营人员可以根据 `fallbackStrategy` 判断是模型切换还是本地兜底消息
- 如果需要完整模型切换审计信息，建议直接对接 `/v1/chat/completions` 或在服务端日志中保留 `modelFailoverHistory`

### 流式输出策略

当只配置单一聊天模型时，`/messages/stream` 与 `/v1/chat/completions/stream` 会走真实流式输出。

当配置了多个候选聊天模型时，系统会先完成模型选择，再按块输出回答，避免出现“前半段来自模型 A、后半段来自模型 B”的脏流问题。

---

## 5. 流式发送消息

```http
POST /api/service-desk/conversations/:id/messages/stream
Accept: text/event-stream
Content-Type: application/json
```

事件说明：

- `meta`：返回知识来源与上下文
- `chunk`：增量内容
- `done`：结束事件
- `error`：错误事件

---

## 6. 提交反馈

```http
POST /api/service-desk/messages/:id/feedback
Content-Type: application/json
```

```json
{
  "conversationId": "sdc-1",
  "messageId": "sdmsg-2",
  "feedbackType": "dislike",
  "feedbackReason": "内容不完整",
  "feedbackText": "缺少人工升级建议",
  "questionText": "账号密码正确但 SSO 登录失败怎么办？",
  "answerText": "...",
  "knowledgeBaseId": "kb-1",
  "retrievedContext": "...",
  "sourceDocuments": [
    {
      "knowledgeBaseId": "kb-1",
      "documentId": "doc-1",
      "documentName": "账号登录排障手册.md"
    }
  ],
  "sourcePlatform": "itsm-portal",
  "tenantId": "tenant-a",
  "ticketId": "INC-10086"
}
```

### 点踩原因枚举

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

## 7. 获取运营分析摘要

```http
GET /api/service-desk/analytics/summary?knowledgeBaseId=kb-1
```

返回：
- 总反馈量
- 点赞 / 点踩数量
- 待处理 FAQ 数量
- 待补知识缺口数量
- 待处理低质量回答数量
- 本周差评数量
- FAQ 候选
- 知识缺口
- 低质量回答
- 最近反馈
- 周趋势指标

### 7.1 获取 FAQ 候选列表

```http
GET /api/service-desk/analytics/faq-candidates?limit=20&knowledgeBaseId=kb-1&status=candidate
```

### 7.2 获取知识缺口列表

```http
GET /api/service-desk/analytics/knowledge-gaps?limit=20&knowledgeBaseId=kb-1&status=pending&issueType=内容不完整
```

### 7.3 获取低质量回答列表

```http
GET /api/service-desk/analytics/low-quality-answers?limit=20&knowledgeBaseId=kb-1&status=open&feedbackReason=内容不完整&owner=ops-quality
```

### 7.4 获取反馈明细列表

```http
GET /api/service-desk/analytics/feedback?limit=50&knowledgeBaseId=kb-1&feedbackType=dislike&feedbackReason=内容不完整
```

支持的筛选参数：

- `limit`
- `knowledgeBaseId`
- `status`
- `feedbackType`
- `feedbackReason`
- `issueType`
- `owner`
- `publishedOnly`（仅 FAQ 候选列表生效）

### 7.5 生成 FAQ 草稿 / 标准问答

```http
POST /api/service-desk/analytics/faq-candidates/:id/publish
Content-Type: application/json
```

```json
{
  "question": "Redis 的核心特点是什么？",
  "answer": "Redis 适合高性能缓存、结构化数据读写和快速恢复场景。",
  "publishedBy": "ops-faq-publisher",
  "note": "已整理为 FAQ 草稿，待审核后写入正式帮助中心"
}
```

响应：

```json
{
  "success": true,
  "data": {
    "candidate": {
      "id": "faq-1",
      "questionText": "Redis 能做什么？",
      "publishedQuestion": "Redis 的核心特点是什么？",
      "publishedAnswer": "Redis 适合高性能缓存、结构化数据读写和快速恢复场景。",
      "publishedBy": "ops-faq-publisher",
      "publishedAt": "2025-03-29T12:00:00Z",
      "publishNote": "已整理为 FAQ 草稿，待审核后写入正式帮助中心"
    },
    "export": {
      "scope": "faq-candidate",
      "format": "markdown",
      "fileName": "faq-candidate-kb-1-20250329.md",
      "mimeType": "text/markdown; charset=utf-8",
      "content": "# FAQ 草稿..."
    }
  }
}
```

说明：
- 如果 `question / answer / publishedBy / note` 为空，服务端会优先回退到当前候选内容
- 该接口会把整理后的 FAQ 文稿保存到候选项中，并返回一份可直接下载的 Markdown 草稿
- `publishedOnly=true` 可用于只筛选已经整理过 FAQ 文稿的候选项

### 7.5.1 直接发布到知识库

```http
POST /api/service-desk/analytics/faq-candidates/:id/publish-to-kb
Content-Type: application/json
```

```json
{
  "question": "Redis 的核心特点是什么？",
  "answer": "Redis 适合高性能缓存、结构化数据读写和快速恢复场景。",
  "publishedBy": "ops-faq-publisher",
  "note": "已整理为 FAQ 草稿并同步知识库",
  "knowledgeBaseId": "kb-1",
  "documentName": "FAQ-Redis-核心特点.md",
  "publishMode": "create_new"
}
```

补充参数：

- `publishMode`：`create_new` / `append_to_document` / `replace_document`
- `targetDocumentId`：当 `publishMode` 为 `append_to_document` 或 `replace_document` 时必填

如果希望把 FAQ 合并到已有 FAQ 合集文档，可使用：

```json
{
  "knowledgeBaseId": "kb-1",
  "publishMode": "append_to_document",
  "targetDocumentId": "doc-18",
  "question": "Redis 的核心特点是什么？",
  "answer": "Redis 适合高性能缓存、结构化数据读写和快速恢复场景。",
  "publishedBy": "ops-faq-publisher",
  "note": "已更新 FAQ 合集中的 Redis 说明"
}
```

响应：

```json
{
  "success": true,
  "data": {
    "candidate": {
      "id": "faq-1",
      "publishedQuestion": "Redis 的核心特点是什么？",
      "publishedBy": "ops-faq-publisher"
    },
    "export": {
      "scope": "faq-candidate",
      "format": "markdown",
      "fileName": "faq-candidate-kb-1-20250329.md",
      "mimeType": "text/markdown; charset=utf-8",
      "content": "# FAQ 草稿..."
    },
    "document": {
      "id": "doc-101",
      "knowledgeBaseId": "kb-1",
      "name": "FAQ-Redis-核心特点.md",
      "status": "indexed",
      "contentPreview": "FAQ 草稿..."
    }
  }
}
```

适用场景：
- 运维 / 交付同学已经把 FAQ 文稿整理好，希望直接回写到知识库
- 希望把高赞回答快速转成知识库里的 Markdown 文档，避免人工复制
- 希望把多个 FAQ 合并到统一 FAQ 合集文档，而不是每次都新增一份文档
- 让 FAQ 候选 -> FAQ 草稿 -> 知识库文档形成最小闭环

发布模式说明：
- `create_new`：新建一份 FAQ Markdown 文档并立即索引
- `append_to_document`：按 FAQ 问题 key 合并进目标文档；如果相同 FAQ 已存在，则自动替换原条目
- `replace_document`：用当前 FAQ 文档整体覆盖目标文档，再重新索引

### 7.6 获取治理周报

```http
GET /api/service-desk/analytics/weekly-report?knowledgeBaseId=kb-1
```

响应重点字段：

- `generatedAt`
- `knowledgeBaseId` / `knowledgeBaseName`
- `summary`
- `highlights`
- `topFaqCandidates`
- `topKnowledgeGaps`
- `topLowQualityAnswers`
- `markdown`

适用场景：
- 每周例会前快速导出治理摘要
- 按知识库查看本周 FAQ 候选、知识缺口和差评重点
- 给运营 / 交付同学提供统一复盘入口

### 7.7 导出治理数据

```http
GET /api/service-desk/analytics/export?scope=faq-candidates&format=markdown&knowledgeBaseId=kb-1&owner=ops-faq
```

支持参数：

- `scope`：`weekly-report / faq-candidates / knowledge-gaps / low-quality-answers / feedback`
- `format`：`markdown / json`
- 其他筛选参数与列表接口保持一致，例如 `knowledgeBaseId / status / owner / feedbackType / feedbackReason / issueType / publishedOnly`

响应：

```json
{
  "success": true,
  "data": {
    "scope": "faq-candidates",
    "format": "markdown",
    "fileName": "faq-candidates-kb-1-20250329.md",
    "mimeType": "text/markdown; charset=utf-8",
    "content": "# FAQ 候选导出..."
  }
}
```

### 7.8 更新 FAQ / 知识缺口 / 低质量回答

```http
PATCH /api/service-desk/analytics/faq-candidates/:id
PATCH /api/service-desk/analytics/knowledge-gaps/:id
PATCH /api/service-desk/analytics/low-quality-answers/:id
Content-Type: application/json
```

```json
{
  "status": "approved",
  "owner": "ops-zhangsan",
  "note": "已整理到标准 FAQ，并计划下周上线",
  "updatedBy": "ops-zhangsan"
}
```

说明：
- `status` 可选，只改责任人 / 备注时可以不传
- `owner` 可选，用于责任归属
- `note` 可选，用于记录处理动作
- `updatedBy` 可选，用于保留最近操作人

### 7.9 批量更新治理项

```http
PATCH /api/service-desk/analytics/faq-candidates/batch
PATCH /api/service-desk/analytics/knowledge-gaps/batch
PATCH /api/service-desk/analytics/low-quality-answers/batch
Content-Type: application/json
```

```json
{
  "ids": ["faq-1", "faq-2"],
  "status": "approved",
  "owner": "ops-zhangsan",
  "note": "本周批量整理完成"
}
```

状态建议：

- FAQ：`candidate / approved / ignored`
- 知识缺口：`pending / resolved / ignored`
- 低质量回答：`open / resolved / ignored`

---

## 8. 重建索引

### 8.1 重建整个知识库索引

```http
POST /api/knowledge-bases/:id/reindex
```

适用场景：

- 调整切片策略后希望整库重建
- 新增 `chunk_type / chunk_profile / chunk_topic` 后希望旧数据刷新
- 图片知识处理链路升级后，希望重新入索引

### 8.2 重建单个文档索引

```http
POST /api/knowledge-bases/:id/documents/:documentId/reindex
```

说明：

- 当前实现以**索引一致性优先**为原则
- 服务端会返回目标文档信息
- 为避免旧 chunk 残留，当前内部会重建该知识库集合后再返回目标文档结果

---

## 9. 数据对象

### conversation
- `id`
- `title`
- `status`
- `knowledgeBaseId`
- `context`
- `sessionMetadata`
- `createdAt`
- `updatedAt`

### message
- `id`
- `conversationId`
- `role`
- `content`
- `messageType`
- `trace`
- `feedbackSummary`
- `metadata`
- `createdAt`

### feedback
- `id`
- `conversationId`
- `messageId`
- `userId`
- `feedbackType`
- `feedbackReason`
- `feedbackText`
- `questionText`
- `answerText`
- `knowledgeBaseId`
- `kbVersion`
- `retrievedContext`
- `sourceDocuments`
- `sourcePlatform`
- `tenantId`
- `ticketId`
- `createdAt`

---

## 8. 普通聊天页消息反馈接口

如果你接的是 AI LocalBase 自带普通聊天页，或者你希望沿用普通会话模型，也可以直接使用这条接口提交反馈：

```http
POST /api/conversations/:id/messages/:messageId/feedback
Content-Type: application/json
```

### 请求体

```json
{
  "feedbackType": "dislike",
  "feedbackReason": "内容不完整",
  "feedbackText": "少了截图里的操作位置说明",
  "questionText": "如何在系统里保存审批配置？",
  "answerText": "...可选，留空时服务端自动补齐...",
  "knowledgeBaseId": "kb-it-support",
  "sourceDocuments": [
    {
      "knowledgeBaseId": "kb-it-support",
      "documentId": "doc-1",
      "documentName": "审批配置手册.pdf"
    }
  ],
  "metadata": {
    "channel": "normal-chat-ui"
  }
}
```

### 响应体

```json
{
  "feedback": {
    "id": "feedback-1",
    "conversationId": "conv-1",
    "messageId": "msg-2",
    "feedbackType": "dislike",
    "feedbackReason": "内容不完整",
    "createdAt": "2025-03-28T10:00:00Z"
  },
  "summary": {
    "likeCount": 0,
    "dislikeCount": 1,
    "latestFeedbackId": "feedback-1",
    "latestFeedback": "dislike:内容不完整",
    "status": "needs-improvement"
  }
}
```

### 说明

- 服务端会校验会话和回答消息是否存在。
- 如果 `questionText` / `answerText` 为空，服务端会自动从当前会话里补齐。
- 反馈会直接进入统一治理表：
  - `message_feedback`
  - `faq_candidates`
  - `knowledge_gaps`
  - `low_quality_answers`
- 普通聊天页重新加载会话详情时，也会把 `feedbackSummary` 回填到对应回答消息上。

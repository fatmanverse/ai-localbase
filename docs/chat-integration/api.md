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
GET /api/service-desk/analytics/summary
```

返回：
- 总反馈量
- 点赞 / 点踩数量
- FAQ 候选
- 知识缺口
- 低质量回答
- 最近反馈
- 周趋势指标

---

## 8. 数据对象

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

# 纯问答路由接入说明

## 目标

给外部系统、公开入口或业务页面提供一个**只允许问答**的前端地址。

这个入口：

- 只显示聊天消息与输入框
- 不显示设置面板
- 不显示知识库管理
- 固定绑定一个知识库
- 适合门户页、iframe 外链、轻量问答入口

---

## 推荐地址

```text
/chat/{knowledgeBaseId}
```

例如：

```text
https://your-ai-localbase.example.com/chat/kb-it-support
```

兼容别名：

```text
/ask/{knowledgeBaseId}
/qa/{knowledgeBaseId}
```

---

## 路由回退不完整时的兼容写法

如果当前前端部署环境没有配置 SPA 路由回退，请使用：

```text
/?mode=chat-only&kb=kb-it-support
```

也兼容：

```text
/?mode=ask-only&kb=kb-it-support
/?mode=qa-only&kb=kb-it-support
```

---

## 最简访问示例

```text
https://your-ai-localbase.example.com/chat/kb-it-support
```

---

## 带参数示例

```text
https://your-ai-localbase.example.com/chat/kb-it-support?title=IT服务台助手&ticket=INC-2025-0001&uid=u-001&tenant=tenant-a&src=portal&cat=账号与访问&p=P2&q=登录失败怎么办|VPN无法连接如何排查
```

---

## iframe 无边距极简版

如果这个纯问答页要直接作为 iframe 外链使用，推荐追加：

```text
?frameless=1
```

完整示例：

```text
https://your-ai-localbase.example.com/chat/kb-it-support?frameless=1
```

带上下文的 iframe 示例：

```html
<iframe
  src="https://your-ai-localbase.example.com/chat/kb-it-support?frameless=1&title=IT服务台助手&ticket=INC-2025-0001&uid=u-001&tenant=tenant-a&src=portal"
  style="width:100%;height:820px;border:0;"
  loading="lazy"
></iframe>
```

`frameless=1` 时：

- 会移除页面外边距
- 会移除外层大卡片的圆角和阴影
- 更贴近宿主页面
- 更适合门户系统、业务系统或工单页里的内嵌区域

---

## 参数说明

### 必填

- 路径中的 `{knowledgeBaseId}`
  - 固定知识库 ID

### 可选

- `title` / `t`
  - 页面标题
- `q` / `quickPrompts`
  - 快捷问题，多个值用 `|` 或 `,` 分隔
- `cid` / `conversationId`
  - 复用已有会话
- `stream` / `s`
  - 是否开启流式回答，默认 `true`
- `ticket` / `ticketId`
- `uid` / `userId`
- `tenant` / `tenantId`
- `src` / `sourcePlatform`
- `cat` / `category`
- `p` / `priority`
- `tag` / `tags`
- `api` / `apiBaseUrl`
  - 后端地址，默认同源
- `host` / `hostPage`
  - 宿主页面标识

---

## 页面行为说明

### 会显示

- 消息列表
- 输入框
- 机器人回答
- 点赞 / 点踩反馈
- 图片型回答中的相关图片卡片（命中时）

### 不会显示

- 设置面板
- 知识库管理
- 知识库切换
- 侧边栏

---

## 适合的使用场景

- 门户系统里的“在线问答”入口
- 面向业务用户的固定知识库问答页
- 不希望暴露系统配置能力的外部访问页面
- 对接其他系统时的轻量入口页

---

## 对应前端文件

```text
frontend/src/pages/ChatOnlyPage.tsx
```

---

## 与 iframe 嵌入页的区别

### `/chat/{knowledgeBaseId}`

适合：

- 打开一个完整的独立问答页面
- 用户直接访问 AI LocalBase 前端地址

### `/embed/{knowledgeBaseId}`

适合：

- 通过 iframe 嵌入到其他系统页面
- 作为嵌入式客服 / 服务台组件使用

---

## 推荐口径

如果对外描述这个能力，建议统一说：

> 我们提供了一个固定知识库的纯问答入口页，地址格式为 `/chat/{knowledgeBaseId}`。该页面只保留问答能力，不展示设置和知识库管理，适合直接给业务用户或其他系统访问。

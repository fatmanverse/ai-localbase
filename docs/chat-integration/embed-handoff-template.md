# 第三方系统 iframe 接入模板

## 1. 适用场景

此模板用于把 AI LocalBase 的固定知识库聊天能力交付给：

- 工单系统
- 客服系统
- 门户系统
- 内部办公系统
- 其他 Web 前端页面

---

## 2. 对外说明模板

可直接复制给接入方：

```md
# AI LocalBase 嵌入接入说明

## 接入地址

请使用以下 iframe 地址接入：

`https://your-ai-localbase.example.com/embed/{knowledgeBaseId}`

例如：

`https://your-ai-localbase.example.com/embed/kb-it-support`

## 固定知识库说明

- `{knowledgeBaseId}` 由接入方决定
- 每个嵌入实例固定绑定一个知识库
- 终端用户在聊天框内不能切换知识库

## 可选参数

可按需追加 query 参数：

- `title`：机器人标题
- `ticket`：工单号
- `uid`：用户 ID
- `tenant`：租户 ID
- `src`：来源系统
- `cat`：问题分类
- `p`：优先级
- `q`：快捷问题，多个值可用 `|` 分隔

## iframe 示例

```html
<iframe
  src="https://your-ai-localbase.example.com/embed/kb-it-support?title=IT服务台机器人&ticket=INC-2025-0001&uid=u-001&tenant=tenant-a&src=itsm-portal"
  style="width:100%;height:820px;border:0;"
  loading="lazy"
></iframe>
```

## 兼容写法

如果部署环境不支持 SPA 路由回退，请改用：

`https://your-ai-localbase.example.com/?embed=1&kb=kb-it-support`
```

---

## 纯问答页交付模板

如果接入方不需要完整嵌入式服务台，只想要一个**固定知识库的纯问答入口**，可以直接交付下面这套地址：

```md
# AI LocalBase 纯问答入口说明

## 推荐地址

`https://your-ai-localbase.example.com/chat/{knowledgeBaseId}`

例如：

`https://your-ai-localbase.example.com/chat/kb-it-support`

## iframe 无边距极简版

如果你们要把这个地址直接放到 iframe，并希望页面更贴边、更像原生模块，请使用：

`https://your-ai-localbase.example.com/chat/kb-it-support?frameless=1`

## 页面行为

- 固定绑定一个知识库
- 页面只保留消息问答
- 不显示设置面板
- 不显示知识库管理
- 不提供知识库切换

## 可选参数

- `title`：页面标题
- `ticket`：工单号
- `uid`：用户 ID
- `tenant`：租户 ID
- `src`：来源系统
- `cat`：问题分类
- `p`：优先级
- `q`：快捷问题，多个值可用 `|` 分隔
- `frameless=1`：无边距极简版

## iframe 示例

```html
<iframe
  src="https://your-ai-localbase.example.com/chat/kb-it-support?frameless=1&title=IT服务台助手&ticket=INC-2025-0001&uid=u-001&tenant=tenant-a&src=portal"
  style="width:100%;height:820px;border:0;"
  loading="lazy"
></iframe>
```

## 兼容写法

如果部署环境不支持 SPA 路由回退，请改用：

`https://your-ai-localbase.example.com/?mode=chat-only&kb=kb-it-support&frameless=1`
```

---

## 3. 交付时建议补充的信息

建议你在发给第三方时，把以下字段填完整：

### 基础信息

- 系统名称：`__________`
- 环境：`生产 / 测试 / 预发`
- 前端访问域名：`https://__________`
- 联系人：`__________`

### 知识库绑定关系

- IT 服务台：`kb-it-support`
- HR 制度：`kb-hr`
- 网络与安全：`kb-network`
- 其他：`__________`

### 推荐接入地址

- IT 服务台：
  ```text
  https://your-ai-localbase.example.com/embed/kb-it-support
  ```
- HR：
  ```text
  https://your-ai-localbase.example.com/embed/kb-hr
  ```

### 可选增强参数

- 固定标题：
  ```text
  ?title=IT服务台机器人
  ```
- 带工单上下文：
  ```text
  ?ticket={ticketId}&uid={userId}&tenant={tenantId}&src=itsm-portal
  ```

---

## 4. 给接入方的最终成品版示例

```md
你们可直接在页面中嵌入以下地址：

- 测试环境：`https://ai-test.example.com/embed/kb-it-support`
- 生产环境：`https://ai.example.com/embed/kb-it-support`

如需展示工单上下文，可使用：

`https://ai.example.com/embed/kb-it-support?title=IT服务台机器人&ticket={ticketId}&uid={userId}&tenant={tenantId}&src=itsm-portal`

注意：
- 该聊天实例固定绑定 IT 服务台知识库
- 最终用户不能在组件内部切换知识库
- 如贵方网关不支持 SPA 路由回退，请改用兼容地址：
  `https://ai.example.com/?embed=1&kb=kb-it-support`
```

---

## 5. 接入验收建议

1. iframe 能正常加载
2. 嵌入页标题显示正确
3. 工单号 / 用户 ID 等上下文传递正确
4. 问答固定走指定知识库
5. 终端用户看不到知识库切换入口
6. 若交付的是纯问答页，确认 `frameless=1` 样式正常
7. 点赞 / 点踩反馈正常提交

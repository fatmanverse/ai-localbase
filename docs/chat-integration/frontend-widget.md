# 前端聊天组件接入说明

## 组件位置

```text
frontend/src/widget
```

目录结构：

```text
widget/
  api.ts
  index.ts
  types.ts
  ServiceDeskWidget.tsx
  FixedKnowledgeBaseWidget.tsx
  serviceDeskWidget.css
  components/
    ConversationContextBar.tsx
    FeedbackComposer.tsx
    MessageComposer.tsx
    MessageList.tsx
    QuickPrompts.tsx
  examples/
    FixedKnowledgeBaseExample.tsx
```

---

## 可复用组件拆分

- `ServiceDeskWidget`
  - 对外主组件
  - 负责会话创建、消息发送、流式渲染、反馈提交
- `FixedKnowledgeBaseWidget`
  - 面向外部 React 项目的固定知识库封装
  - 由宿主显式传入 `knowledgeBaseId`
  - 嵌入后不提供知识库切换能力
- `ConversationContextBar`
  - 展示工单号、用户、来源平台、分类、优先级
- `MessageList`
  - 渲染消息列表、来源文档、反馈摘要
- `MessageComposer`
  - 输入框、发送按钮、loading 状态
- `FeedbackComposer`
  - 点赞 / 点踩 / 原因选择 / 补充说明
- `QuickPrompts`
  - 快捷问题建议

---

## 最小 React 组件接入示例

```tsx
import { ServiceDeskWidget } from './src/widget'

export default function TicketAssistant() {
  return (
    <ServiceDeskWidget
      apiBaseUrl=""
      knowledgeBaseId="kb-1"
      title="IT 服务台机器人"
      initialContext={{
        ticketId: 'INC-10086',
        userId: 'u-001',
        tenantId: 'tenant-a',
        sourcePlatform: 'itsm-portal',
        category: '账号与访问',
        priority: 'P2',
      }}
      quickPrompts={[
        '登录失败怎么办？',
        'VPN 无法连接如何排查？',
      ]}
    />
  )
}
```

---

## 固定知识库嵌入示例

如果宿主系统希望：

- **在接入时直接指定一个知识库**
- **嵌入后不允许终端用户切换知识库**
- **所有问答都固定走该知识库**

请直接使用 `FixedKnowledgeBaseWidget`：

```tsx
import { FixedKnowledgeBaseWidget } from './src/widget'

export default function EmbeddedKbAssistant() {
  return (
    <FixedKnowledgeBaseWidget
      apiBaseUrl=""
      knowledgeBaseId="kb-it-support"
      title="企业 IT 服务台"
      initialContext={{
        sourcePlatform: 'react-host-app',
        tenantId: 'tenant-a',
        userId: 'u-001',
        ticketId: 'INC-2025-0001',
        category: '账号与访问',
      }}
      quickPrompts={[
        'VPN 无法连接如何排查？',
        '如何重置企业邮箱密码？',
      ]}
    />
  )
}
```

说明：

- `knowledgeBaseId` 为必填
- 宿主系统负责决定绑定哪个知识库
- Widget 内部不会暴露知识库切换控件
- 会话创建后默认使用该知识库进行问答

仓库内也提供了可直接参考的示例文件：

```text
frontend/src/widget/examples/FixedKnowledgeBaseExample.tsx
```

---

## 纯问答前端地址接入

如果你希望：

- **只开放消息问答**
- **不让终端用户看到设置**
- **不让终端用户看到知识库管理**
- **并且固定绑定一个知识库**

现在可以直接使用 AI LocalBase 前端地址：

```text
/chat/{knowledgeBaseId}
```

例如：

```text
/chat/kb-it-support
```

如果部署环境没有配置 SPA 路由回退，也可以使用：

```text
/?mode=chat-only&kb=kb-it-support
```

如果要直接用于 iframe，推荐在地址后追加：

```text
?frameless=1
```

例如：

```text
/chat/kb-it-support?frameless=1
```

可选参数：

- `title` / `t`：页面标题
- `q` / `quickPrompts`：快捷问题，多个值用 `|` 或 `,` 分隔
- `ticket` / `ticketId`
- `uid` / `userId`
- `tenant` / `tenantId`
- `src` / `sourcePlatform`
- `cat` / `category`
- `p` / `priority`
- `tag` / `tags`
- `cid` / `conversationId`
- `stream` / `s`
- `api` / `apiBaseUrl`
- `frameless` / `bare` / `compact`：无边距极简模式

特点：

- 仅保留问答消息流
- 不显示设置面板
- 不显示知识库设置
- 会话固定走指定知识库

详细说明见：

- `docs/chat-integration/chat-only-route.md`

---

## 通过 AI LocalBase 前端访问地址接入

如果你不想把组件源码复制到宿主项目里，而是希望：

- **直接复用已部署的 AI LocalBase 前端地址**
- **在外部系统中通过 iframe / 外链方式接入**
- **并且固定指定一个知识库，不允许切换**

现在推荐直接使用**更简洁的路径方式**：

```text
/embed/kb-it-support
```

### 最简 iframe 示例

```html
<iframe
  src="https://your-ai-localbase.example.com/embed/kb-it-support"
  style="width:100%;height:820px;border:0;"
  loading="lazy"
  referrerpolicy="strict-origin-when-cross-origin"
></iframe>
```

### 知识库参数化方式

- 路径段中的 `kb-it-support` 就是知识库 ID
- 例如：
  - `/embed/kb-it-support`
  - `/embed/kb-hr`
  - `/embed/kb-network`

### 可选参数

可继续通过 query 传递补充参数：

- `title` / `t`：机器人标题
- `api` / `apiBaseUrl`：后端地址，默认同源
- `cid` / `conversationId`：复用已有会话
- `ticket` / `ticketId`
- `uid` / `userId`
- `tenant` / `tenantId`
- `src` / `sourcePlatform`
- `cat` / `category`
- `p` / `priority`
- `tag` / `tags`：多个值可用逗号 / 竖线分隔
- `q` / `quickPrompts`：多个值可用逗号 / 竖线分隔
- `stream` / `s`：是否启用流式返回，默认 `true`
- `host` / `hostPage`：宿主页面标识，用于审计或追踪

### 推荐完整示例

```html
<iframe
  src="https://your-ai-localbase.example.com/embed/kb-it-support?title=IT%E6%9C%8D%E5%8A%A1%E5%8F%B0%E6%9C%BA%E5%99%A8%E4%BA%BA&ticket=INC-2025-0001&tenant=tenant-a&uid=u-001&src=portal-react-host&cat=%E8%B4%A6%E5%8F%B7%E4%B8%8E%E8%AE%BF%E9%97%AE&p=P2&q=VPN%E6%97%A0%E6%B3%95%E8%BF%9E%E6%8E%A5%7C%E5%A6%82%E4%BD%95%E9%87%8D%E7%BD%AE%E4%BC%81%E4%B8%9A%E9%82%AE%E7%AE%B1%E5%AF%86%E7%A0%81"
  style="width:100%;height:820px;border:0;"
  loading="lazy"
  referrerpolicy="strict-origin-when-cross-origin"
></iframe>
```

### 兼容与回退方式

如果你的前端部署环境**没有配置 SPA 路由重写**，直接访问 `/embed/...` 可能无法落到前端入口，此时请改用以下兼容方式：

```text
/?embed=1&kb=kb-it-support
```

同时仍兼容旧写法：

```text
/?mode=service-desk-embed&knowledgeBaseId=kb-it-support
```

### 行为说明

- 页面内部使用固定知识库 Widget
- 宿主系统只需要拼接访问地址即可接入
- 终端用户在该嵌入页中**不能切换知识库**
- 如果未传知识库参数，页面会直接提示缺少参数

对应前端页面文件：

```text
frontend/src/pages/ServiceDeskEmbedPage.tsx
```

---

## 在其他 React 项目中的推荐接入方式

1. 复制 `frontend/src/widget/` 到目标 React 项目。
2. 保留 `api.ts / types.ts / ServiceDeskWidget.tsx / FixedKnowledgeBaseWidget.tsx / components/`。
3. 引入 `serviceDeskWidget.css`。
4. 根据宿主系统能力，选择：
   - `ServiceDeskWidget`：允许由宿主动态决定知识库
   - `FixedKnowledgeBaseWidget`：固定单一知识库，不允许切换
5. 通过 `initialContext` 注入用户、工单、租户、来源平台等业务上下文。

---

## Demo 访问方式

本仓库已内置演示页：

```text
/?mode=service-desk-demo
```

嵌入页推荐方式：

```text
/embed/kb-it-support
```

无重写环境下的兼容方式：

```text
/?embed=1&kb=kb-it-support
```

---

## 部署与第三方交付

如需把 `/embed/{knowledgeBaseId}` 作为正式对外入口发布，请继续参考：

- `docs/chat-integration/embed-final.md`
- `docs/chat-integration/embed-deployment.md`
- `docs/chat-integration/embed-handoff-template.md`

---

## 后续可扩展方向

当前实现已为以下接入方式预留结构：

- 直接复制 `widget/` 到其他 React 项目
- 封装为内部 npm package
- 封装为 iframe widget
- 封装为 Web Component
- 绑定 SSO / 工单系统上下文自动注入


---

## 最简运营入口

除了聊天接入页外，前端现在还提供一个**最简治理工作台**入口，便于运营或交付同学直接处理 FAQ 候选、知识缺口和低质量回答：

```text
?mode=ops-console
/ops
```

用途：

- 查看 FAQ 候选
- 查看知识缺口
- 查看低质量回答
- 查看差评反馈明细
- 直接做基础状态流转

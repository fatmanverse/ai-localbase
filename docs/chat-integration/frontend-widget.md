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
  serviceDeskWidget.css
  components/
    ConversationContextBar.tsx
    FeedbackComposer.tsx
    MessageComposer.tsx
    MessageList.tsx
    QuickPrompts.tsx
```

---

## 可复用组件拆分

- `ServiceDeskWidget`
  - 对外主组件
  - 负责会话创建、消息发送、流式渲染、反馈提交
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

## 最小接入示例

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

## Demo 访问方式

本仓库已内置演示页：

```text
/?mode=service-desk-demo
```

启动前端后访问：

```text
http://localhost:5173/?mode=service-desk-demo
```

---

## 后续可扩展方向

当前实现已为以下接入方式预留结构：

- 直接复制 `widget/` 到其他 React 项目
- 封装为内部 npm package
- 封装为 iframe widget
- 封装为 Web Component
- 绑定 SSO / 工单系统上下文自动注入

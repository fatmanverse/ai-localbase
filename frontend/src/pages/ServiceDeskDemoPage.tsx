import { ServiceDeskWidget } from '../widget'
import './serviceDeskDemo.css'

export default function ServiceDeskDemoPage() {
  return (
    <main className="service-desk-demo-page">
      <section className="service-desk-demo-hero">
        <div>
          <div className="eyebrow">Embeddable Widget Demo</div>
          <h1>工单机器人 / 客服机器人接入演示</h1>
          <p>
            这个页面演示新的对外聊天 API 与可嵌入聊天组件。它适合接入工单系统、客服系统、内部服务台、门户网站或其他前端页面。
          </p>
          <ul>
            <li>支持会话级业务上下文：用户、租户、工单号、来源平台、问题分类</li>
            <li>支持点赞 / 点踩 / 不符合预期原因 / 补充反馈说明</li>
            <li>支持把高赞回答沉淀为 FAQ 候选，把点踩问题沉淀为知识缺口</li>
          </ul>
        </div>
        <div className="service-desk-demo-card">
          <h3>接入方式</h3>
          <code>import {'{ ServiceDeskWidget }'} from './src/widget'</code>
          <p>访问当前 Demo：<code>?mode=service-desk-demo</code></p>
        </div>
      </section>

      <ServiceDeskWidget
        title="IT 服务台机器人"
        initialContext={{
          ticketId: 'INC-2025-00128',
          userId: 'u-10086',
          tenantId: 'acme-cn',
          sourcePlatform: 'ITSM Portal',
          category: '账号与访问',
          priority: 'P2',
          tags: ['账号', 'SSO', '登录失败'],
        }}
        quickPrompts={[
          '账号提示密码正确但登录失败，怎么处理？',
          '请给我一个工单升级到人工支持的标准话术',
          'VPN 无法连接时应该先检查哪些步骤？',
        ]}
      />
    </main>
  )
}

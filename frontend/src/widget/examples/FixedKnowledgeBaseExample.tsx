import { FixedKnowledgeBaseWidget } from '../FixedKnowledgeBaseWidget'

export function FixedKnowledgeBaseExample() {
  return (
    <FixedKnowledgeBaseWidget
      apiBaseUrl=""
      knowledgeBaseId="kb-it-support"
      title="IT 服务台"
      initialContext={{
        ticketId: 'INC-2025-0001',
        userId: 'u-001',
        tenantId: 'tenant-a',
        sourcePlatform: 'portal-react-host',
        category: '账号与访问',
        priority: 'P2',
      }}
      quickPrompts={['VPN 无法连接如何排查？', '如何重置企业邮箱密码？']}
    />
  )
}

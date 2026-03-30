import { ServiceDeskConversationContext } from '../types'

interface ConversationContextBarProps {
  context?: ServiceDeskConversationContext
  title?: string
  label?: string
}

const buildBadges = (context?: ServiceDeskConversationContext) => {
  if (!context) {
    return []
  }

  return [
    context.ticketId ? { label: '工单', value: context.ticketId } : null,
    context.category ? { label: '分类', value: context.category } : null,
    context.priority ? { label: '优先级', value: context.priority } : null,
    context.sourcePlatform ? { label: '来源', value: context.sourcePlatform } : null,
    context.userId ? { label: '用户', value: context.userId } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>
}

export function ConversationContextBar({ context, title, label }: ConversationContextBarProps) {
  const badges = buildBadges(context)

  return (
    <div className="service-desk-context-bar">
      <div>
        <div className="service-desk-context-label">{label || '企业服务台'}</div>
        <h2>{title || '问题处理支持'}</h2>
      </div>
      <div className="service-desk-context-badges">
        {badges.length > 0 ? (
          badges.map((badge) => (
            <span key={`${badge.label}-${badge.value}`} className="service-desk-badge">
              <strong>{badge.label}</strong>
              <span>{badge.value}</span>
            </span>
          ))
        ) : (
          <span className="service-desk-badge muted">可绑定工单号 / 用户 / 分类上下文</span>
        )}
      </div>
    </div>
  )
}

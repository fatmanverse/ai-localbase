import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createServiceDeskConversation,
  getServiceDeskConversation,
  sendServiceDeskMessage,
  streamServiceDeskMessage,
  submitServiceDeskFeedback,
} from './api'
import { ConversationContextBar } from './components/ConversationContextBar'
import { MessageComposer } from './components/MessageComposer'
import { MessageList } from './components/MessageList'
import { QuickPrompts } from './components/QuickPrompts'
import {
  CreateConversationPayload,
  FeedbackPayload,
  SendMessagePayload,
  ServiceDeskConversation,
  ServiceDeskConversationContext,
  ServiceDeskMessage,
} from './types'
import './serviceDeskWidget.css'

export interface ServiceDeskWidgetProps {
  apiBaseUrl?: string
  title?: string
  knowledgeBaseId?: string
  initialContext?: ServiceDeskConversationContext
  sessionMetadata?: Record<string, unknown>
  quickPrompts?: string[]
  initialConversationId?: string
  useStreaming?: boolean
  displayMode?: 'service-desk' | 'chat-only'
  showHeader?: boolean
  showContextBar?: boolean
  showQuickPrompts?: boolean
  shellClassName?: string
  headerLabel?: string
  composerPlaceholder?: string
  composerHelperText?: string
  emptyStateTitle?: string
  emptyStateDescription?: string
}

const defaultPrompts = [
  '登录失败怎么办？',
  'VPN 无法连接如何排查？',
  '请告诉我工单升级的处理流程',
]

const createLocalMessage = (
  role: 'user' | 'assistant',
  content: string,
  conversationId: string,
): ServiceDeskMessage => ({
  id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  conversationId,
  role,
  content,
  createdAt: new Date().toISOString(),
  messageType: role === 'assistant' ? 'answer' : 'text',
  feedbackSummary: role === 'assistant' ? { likeCount: 0, dislikeCount: 0 } : undefined,
})

export function ServiceDeskWidget({
  apiBaseUrl = '',
  title,
  knowledgeBaseId,
  initialContext,
  sessionMetadata,
  quickPrompts = defaultPrompts,
  initialConversationId,
  useStreaming = true,
  displayMode = 'service-desk',
  showHeader,
  showContextBar,
  showQuickPrompts,
  shellClassName,
  headerLabel,
  composerPlaceholder,
  composerHelperText,
  emptyStateTitle,
  emptyStateDescription,
}: ServiceDeskWidgetProps) {
  const [conversation, setConversation] = useState<ServiceDeskConversation | null>(null)
  const [messages, setMessages] = useState<ServiceDeskMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const context = useMemo<ServiceDeskConversationContext>(
    () => ({
      ...initialContext,
    }),
    [initialContext],
  )

  const resolvedShowHeader = showHeader ?? true
  const resolvedShowContextBar = showContextBar ?? displayMode !== 'chat-only'
  const resolvedShowQuickPrompts = showQuickPrompts ?? quickPrompts.length > 0
  const resolvedTitle = title ?? conversation?.title ?? '智能工单助手'
  const resolvedKnowledgeBaseId = knowledgeBaseId ?? conversation?.knowledgeBaseId
  const shellClasses = ['service-desk-widget-shell', `service-desk-widget-${displayMode}`]
  if (shellClassName) {
    shellClasses.push(shellClassName)
  }

  const ensureConversation = async () => {
    if (conversation) {
      return conversation
    }

    if (initialConversationId) {
      const loadedConversation = await getServiceDeskConversation(apiBaseUrl, initialConversationId)
      setConversation(loadedConversation)
      setMessages(loadedConversation.messages ?? [])
      return loadedConversation
    }

    const payload: CreateConversationPayload = {
      title,
      knowledgeBaseId,
      context,
      sessionMetadata,
    }
    const createdConversation = await createServiceDeskConversation(apiBaseUrl, payload)
    setConversation(createdConversation)
    setMessages(createdConversation.messages ?? [])
    return createdConversation
  }

  const refreshConversation = async (conversationId: string) => {
    const latestConversation = await getServiceDeskConversation(apiBaseUrl, conversationId)
    setConversation(latestConversation)
    setMessages(latestConversation.messages ?? [])
    return latestConversation
  }

  useEffect(() => {
    const bootstrap = async () => {
      try {
        setBootstrapError(null)
        await ensureConversation()
      } catch (error) {
        setBootstrapError(error instanceof Error ? error.message : '初始化工单机器人失败')
      }
    }

    void bootstrap()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBaseUrl, initialConversationId, knowledgeBaseId, title])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleSend = async (content: string) => {
    const currentConversation = await ensureConversation()
    setLoading(true)
    setFeedbackNotice(null)
    const optimisticUser = createLocalMessage('user', content, currentConversation.id)
    const optimisticAssistant = createLocalMessage('assistant', '', currentConversation.id)

    setMessages((prev) => [...prev, optimisticUser, optimisticAssistant])

    const payload: SendMessagePayload = {
      content,
      knowledgeBaseId: knowledgeBaseId ?? currentConversation.knowledgeBaseId,
      context,
      sessionMetadata,
    }

    try {
      if (useStreaming) {
        await streamServiceDeskMessage(apiBaseUrl, currentConversation.id, payload, {
          onChunk: (chunk) => {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === optimisticAssistant.id
                  ? { ...message, content: message.content + chunk }
                  : message,
              ),
            )
          },
        })
        await refreshConversation(currentConversation.id)
      } else {
        const response = await sendServiceDeskMessage(apiBaseUrl, currentConversation.id, payload)
        setConversation(response.conversation)
        setMessages(response.conversation.messages ?? [...messages, response.userMessage, response.assistantMessage])
      }
    } catch (error) {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === optimisticAssistant.id
            ? {
                ...message,
                content: error instanceof Error ? `机器人暂时无法回答：${error.message}` : '机器人暂时无法回答，请稍后重试。',
              }
            : message,
        ),
      )
    } finally {
      setLoading(false)
    }
  }

  const submitFeedback = async (
    message: ServiceDeskMessage,
    payload: Pick<FeedbackPayload, 'feedbackType' | 'feedbackReason' | 'feedbackText'>,
  ) => {
    if (!conversation) {
      return
    }

    const question = (() => {
      const index = messages.findIndex((item) => item.id === message.id)
      for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        if (messages[cursor]?.role === 'user') {
          return messages[cursor]?.content ?? ''
        }
      }
      return ''
    })()

    await submitServiceDeskFeedback(apiBaseUrl, {
      conversationId: conversation.id,
      messageId: message.id,
      feedbackType: payload.feedbackType,
      feedbackReason: payload.feedbackReason,
      feedbackText: payload.feedbackText,
      questionText: question,
      answerText: message.content,
      knowledgeBaseId: message.trace?.knowledgeBaseId ?? conversation.knowledgeBaseId,
      retrievedContext: message.trace?.retrievedContext,
      sourceDocuments: message.trace?.sourceDocuments,
      sourcePlatform: context.sourcePlatform,
      tenantId: context.tenantId,
      ticketId: context.ticketId,
      userId: context.userId,
      metadata: {
        channel: 'widget',
      },
    })

    await refreshConversation(conversation.id)
    setFeedbackNotice(payload.feedbackType === 'like' ? '已记录“已解决”反馈，可用于沉淀 FAQ 候选。' : '已记录问题反馈，将进入知识库 / FAQ 优化队列。')
  }

  return (
    <div className={shellClasses.join(' ')}>
      {resolvedShowHeader ? (
        resolvedShowContextBar ? (
          <ConversationContextBar
            context={conversation?.context ?? context}
            title={resolvedTitle}
            label={headerLabel}
          />
        ) : (
          <div className="service-desk-compact-header">
            <div>
              <div className="service-desk-context-label">{headerLabel || '固定知识库问答'}</div>
              <h2>{resolvedTitle}</h2>
            </div>
            {resolvedKnowledgeBaseId ? (
              <div className="service-desk-context-badges">
                <span className="service-desk-badge">
                  <strong>知识库</strong>
                  <span>{resolvedKnowledgeBaseId}</span>
                </span>
              </div>
            ) : null}
          </div>
        )
      ) : null}

      {resolvedShowQuickPrompts ? (
        <QuickPrompts prompts={quickPrompts} disabled={loading} onSelect={(prompt) => void handleSend(prompt)} />
      ) : null}

      {bootstrapError ? <div className="service-desk-error-banner">{bootstrapError}</div> : null}
      {feedbackNotice ? <div className="service-desk-notice-banner">{feedbackNotice}</div> : null}

      <MessageList
        messages={messages}
        loading={loading}
        emptyTitle={emptyStateTitle}
        emptyDescription={emptyStateDescription}
        onLike={(message) => submitFeedback(message, { feedbackType: 'like' })}
        onDislike={(message, reason, feedbackText) =>
          submitFeedback(message, {
            feedbackType: 'dislike',
            feedbackReason: reason,
            feedbackText,
          })
        }
      />
      <div ref={messagesEndRef} />
      <MessageComposer
        disabled={loading || !!bootstrapError}
        placeholder={composerPlaceholder}
        helperText={composerHelperText}
        onSend={handleSend}
      />
    </div>
  )
}

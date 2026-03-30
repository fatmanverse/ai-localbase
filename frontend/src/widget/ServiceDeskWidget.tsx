import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  const conversationRef = useRef<ServiceDeskConversation | null>(null)
  const messagesRef = useRef<ServiceDeskMessage[]>([])

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

  useEffect(() => {
    conversationRef.current = conversation
  }, [conversation])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const ensureConversation = useCallback(async () => {
    if (conversationRef.current) {
      return conversationRef.current
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
  }, [apiBaseUrl, context, initialConversationId, knowledgeBaseId, sessionMetadata, title])

  const refreshConversation = useCallback(async (conversationId: string) => {
    const latestConversation = await getServiceDeskConversation(apiBaseUrl, conversationId)
    setConversation(latestConversation)
    setMessages(latestConversation.messages ?? [])
    return latestConversation
  }, [apiBaseUrl])

  useEffect(() => {
    const bootstrap = async () => {
      try {
        setBootstrapError(null)
        await ensureConversation()
      } catch (error) {
        setBootstrapError('页面暂时没连上服务，请稍后刷新或联系管理员。')
      }
    }

    void bootstrap()
  }, [ensureConversation])

  const handleSend = useCallback(async (content: string) => {
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
        setMessages((prev) => response.conversation.messages ?? [...prev, response.userMessage, response.assistantMessage])
      }
    } catch (error) {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === optimisticAssistant.id
            ? {
                ...message,
                content: '这边刚才没拿到稳定结果，请稍后再发一次；如果连续失败，再把现象和报错一起发我。',
              }
            : message,
        ),
      )
    } finally {
      setLoading(false)
    }
  }, [apiBaseUrl, context, ensureConversation, knowledgeBaseId, refreshConversation, sessionMetadata, useStreaming])

  const submitFeedback = useCallback(async (
    message: ServiceDeskMessage,
    payload: Pick<FeedbackPayload, 'feedbackType' | 'feedbackReason' | 'feedbackText'>,
  ) => {
    const currentConversation = conversationRef.current
    const currentMessages = messagesRef.current

    if (!currentConversation) {
      return
    }

    const question = (() => {
      const index = currentMessages.findIndex((item) => item.id === message.id)
      for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        if (currentMessages[cursor]?.role === 'user') {
          return currentMessages[cursor]?.content ?? ''
        }
      }
      return ''
    })()

    await submitServiceDeskFeedback(apiBaseUrl, {
      conversationId: currentConversation.id,
      messageId: message.id,
      feedbackType: payload.feedbackType,
      feedbackReason: payload.feedbackReason,
      feedbackText: payload.feedbackText,
      questionText: question,
      answerText: message.content,
      knowledgeBaseId: message.trace?.knowledgeBaseId ?? currentConversation.knowledgeBaseId,
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

    await refreshConversation(currentConversation.id)
    setFeedbackNotice(payload.feedbackType === 'like' ? '收到，这条答复我先标记为已解决。' : '收到，这个问题我这边记下了，后面会继续优化。')
  }, [apiBaseUrl, context, refreshConversation])

  const handleLikeFeedback = useCallback((message: ServiceDeskMessage) => submitFeedback(message, { feedbackType: 'like' }), [submitFeedback])

  const handleDislikeFeedback = useCallback(
    (message: ServiceDeskMessage, reason: string, feedbackText: string) =>
      submitFeedback(message, {
        feedbackType: 'dislike',
        feedbackReason: reason,
        feedbackText,
      }),
    [submitFeedback],
  )

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
        onLike={handleLikeFeedback}
        onDislike={handleDislikeFeedback}
      />
      <MessageComposer
        disabled={loading || !!bootstrapError}
        placeholder={composerPlaceholder}
        helperText={composerHelperText}
        onSend={handleSend}
      />
    </div>
  )
}

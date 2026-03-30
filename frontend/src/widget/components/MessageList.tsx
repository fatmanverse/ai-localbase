import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MarkdownRenderer from '../../components/markdown/MarkdownRenderer'
import { usePinnedAutoScroll } from '../../hooks/usePinnedAutoScroll'
import { FeedbackComposer } from './FeedbackComposer'
import { ServiceDeskImageReference, ServiceDeskMessage } from '../types'

const WIDGET_MESSAGE_WINDOW_SIZE = 40
const WIDGET_MESSAGE_LOAD_MORE_STEP = 30

interface MessageListProps {
  messages: ServiceDeskMessage[]
  loading?: boolean
  emptyTitle?: string
  emptyDescription?: string
  onLike: (message: ServiceDeskMessage) => Promise<void>
  onDislike: (message: ServiceDeskMessage, reason: string, feedbackText: string) => Promise<void>
}

interface ServiceDeskMessageRowProps {
  message: ServiceDeskMessage
  previousMessageRole?: ServiceDeskMessage['role']
  isReplyStreaming: boolean
  copied: boolean
  onCopy: (messageId: string, content: string) => void
  onLike: (message: ServiceDeskMessage) => Promise<void>
  onDislike: (message: ServiceDeskMessage, reason: string, feedbackText: string) => Promise<void>
}

const formatTime = (value: string) => {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}

const buildRelatedImagesSignature = (images: ServiceDeskImageReference[] | undefined) =>
  (images ?? [])
    .map((image) => `${image.id}|${image.publicUrl ?? ''}|${image.classification ?? ''}|${image.description ?? ''}`)
    .join(';')

const buildWidgetMessageSignature = (message: ServiceDeskMessage) => {
  const summary = message.feedbackSummary
  return [
    message.id,
    message.role,
    message.content,
    message.createdAt,
    message.trace?.degraded ? '1' : '0',
    summary?.likeCount ?? 0,
    summary?.dislikeCount ?? 0,
    summary?.latestFeedbackId ?? '',
    summary?.latestFeedback ?? '',
    buildRelatedImagesSignature(message.trace?.relatedImages),
  ].join('|')
}

const areServiceDeskMessageRowPropsEqual = (prev: ServiceDeskMessageRowProps, next: ServiceDeskMessageRowProps) =>
  buildWidgetMessageSignature(prev.message) === buildWidgetMessageSignature(next.message) &&
  prev.previousMessageRole === next.previousMessageRole &&
  prev.isReplyStreaming === next.isReplyStreaming &&
  prev.copied === next.copied &&
  prev.onCopy === next.onCopy &&
  prev.onLike === next.onLike &&
  prev.onDislike === next.onDislike

const ServiceDeskMessageRow = memo(function ServiceDeskMessageRow({
  message,
  previousMessageRole,
  isReplyStreaming,
  copied,
  onCopy,
  onLike,
  onDislike,
}: ServiceDeskMessageRowProps) {
  const isAssistant = message.role === 'assistant'
  const relatedImages = message.trace?.relatedImages ?? []
  const summary = message.feedbackSummary
  const canCollectFeedback = isAssistant && previousMessageRole === 'user' && !isReplyStreaming && Boolean(message.content.trim())

  return (
    <div className={`service-desk-message ${message.role}`}>
      <div className="service-desk-message-bubble">
        <div className="service-desk-message-meta">
          <span>{isAssistant ? '机器人' : '用户'}</span>
          <span>{formatTime(message.createdAt)}</span>
        </div>
        {isAssistant ? (
          isReplyStreaming ? (
            <div className={`service-desk-streaming-text ${message.content.trim() ? '' : 'is-empty'}`.trim()}>
              {message.content.trim() ? message.content : '正在整理答案...'}
            </div>
          ) : (
            <div className="service-desk-markdown">
              <MarkdownRenderer content={message.content} />
            </div>
          )
        ) : (
          <div className="service-desk-plain-text">{message.content}</div>
        )}

        {isAssistant && relatedImages.length > 0 ? (
          <div className="service-desk-related-images">
            <div className="service-desk-related-images-title">相关图片知识</div>
            <div className="service-desk-related-image-grid">
              {relatedImages.map((image) => (
                <div key={image.id} className="service-desk-related-image-card">
                  {image.publicUrl ? (
                    <a
                      href={image.publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="service-desk-related-image-link"
                      title="查看原图"
                    >
                      <img src={image.publicUrl} alt={image.description || image.documentName || image.id} loading="lazy" />
                      <span className="service-desk-related-image-view-tag">查看大图</span>
                    </a>
                  ) : null}
                  <div className="service-desk-related-image-meta">
                    <strong>{image.documentName || '图片知识'}</strong>
                    {image.classification ? <span>{image.classification}</span> : null}
                    {image.description ? <p>{image.description}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {isAssistant ? (
        <FeedbackComposer
          messageId={message.id}
          hidden={!canCollectFeedback}
          disabled={isReplyStreaming}
          copied={copied}
          summary={summary}
          onCopy={() => void onCopy(message.id, message.content)}
          onLike={() => onLike(message)}
          onDislike={(reason, feedbackText) => onDislike(message, reason, feedbackText)}
        />
      ) : null}
    </div>
  )
}, areServiceDeskMessageRowPropsEqual)

export const MessageList = memo(function MessageList({
  messages,
  loading,
  emptyTitle,
  emptyDescription,
  onLike,
  onDislike,
}: MessageListProps) {
  const conversationKey = useMemo(() => messages[0]?.conversationId ?? 'empty', [messages])
  const [visibleCount, setVisibleCount] = useState(() => Math.min(messages.length, WIDGET_MESSAGE_WINDOW_SIZE))
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const previousConversationKeyRef = useRef(conversationKey)
  const previousMessageLengthRef = useRef(messages.length)
  const copyTimerRef = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const lastMessage = messages.at(-1)
  const lastMessageContentSignature = `${lastMessage?.id ?? ''}|${lastMessage?.content.length ?? 0}`

  useEffect(() => {
    const previousConversationKey = previousConversationKeyRef.current
    const previousMessageLength = previousMessageLengthRef.current

    if (previousConversationKey !== conversationKey) {
      setVisibleCount(Math.min(messages.length, WIDGET_MESSAGE_WINDOW_SIZE))
    } else {
      setVisibleCount((prev) => {
        if (messages.length <= WIDGET_MESSAGE_WINDOW_SIZE) {
          return messages.length
        }
        if (prev >= previousMessageLength) {
          return messages.length
        }
        return prev
      })
    }

    previousConversationKeyRef.current = conversationKey
    previousMessageLengthRef.current = messages.length
  }, [conversationKey, messages.length])

  const hiddenCount = Math.max(0, messages.length - visibleCount)
  const renderedMessages = hiddenCount > 0 ? messages.slice(-visibleCount) : messages

  usePinnedAutoScroll({
    containerRef,
    conversationKey,
    itemCount: messages.length,
    lastItemId: lastMessage?.id,
    lastItemContentSignature,
    streaming: Boolean(loading && lastMessage?.role === 'assistant'),
  })

  const handleLoadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(messages.length, prev + WIDGET_MESSAGE_LOAD_MORE_STEP))
  }, [messages.length])

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current)
      }
    }
  }, [])

  const handleCopy = useCallback(async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedMessageId(messageId)
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current)
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedMessageId((current) => (current === messageId ? null : current))
      }, 1600)
    } catch {
      // 静默失败，避免打断当前问答流程
    }
  }, [])

  if (messages.length === 0) {
    return (
      <div className="service-desk-empty-state">
        <h3>{emptyTitle ?? '欢迎使用工单机器人'}</h3>
        <p>
          {emptyDescription ?? '你可以直接描述故障现象、影响范围、已尝试操作，机器人会结合知识库给出处理建议。'}
        </p>
      </div>
    )
  }

  return (
    <div className="service-desk-message-list" ref={containerRef}>
      {hiddenCount > 0 ? (
        <div className="service-desk-message-window-banner">
          <button type="button" className="service-desk-message-window-load-more" onClick={handleLoadMore}>
            查看更早的 {Math.min(hiddenCount, WIDGET_MESSAGE_LOAD_MORE_STEP)} 条消息
          </button>
          <span>当前已折叠 {hiddenCount} 条较早消息，减少长会话首屏负担。</span>
        </div>
      ) : null}
      {renderedMessages.map((message, index) => {
        const actualIndex = hiddenCount + index
        const previousMessage = messages[actualIndex - 1]
        const isReplyStreaming = Boolean(loading && message.role === 'assistant' && message.id === lastMessage?.id)

        return (
          <ServiceDeskMessageRow
            key={message.id}
            message={message}
            previousMessageRole={previousMessage?.role}
            isReplyStreaming={isReplyStreaming}
            copied={copiedMessageId === message.id}
            onCopy={handleCopy}
            onLike={onLike}
            onDislike={onDislike}
          />
        )
      })}
      {loading && lastMessage?.role !== 'assistant' ? <div className="service-desk-typing">机器人正在整理答案...</div> : null}
    </div>
  )
})

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MarkdownRenderer from '../../components/markdown/MarkdownRenderer'
import { FeedbackComposer } from './FeedbackComposer'
import { ServiceDeskMessage } from '../types'

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

export function MessageList({
  messages,
  loading,
  emptyTitle,
  emptyDescription,
  onLike,
  onDislike,
}: MessageListProps) {
  const conversationKey = useMemo(() => messages[0]?.conversationId ?? 'empty', [messages])
  const [visibleCount, setVisibleCount] = useState(() => Math.min(messages.length, WIDGET_MESSAGE_WINDOW_SIZE))
  const previousConversationKeyRef = useRef(conversationKey)
  const previousMessageLengthRef = useRef(messages.length)

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
  const handleLoadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(messages.length, prev + WIDGET_MESSAGE_LOAD_MORE_STEP))
  }, [messages.length])

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
    <div className="service-desk-message-list">
      {hiddenCount > 0 ? (
        <div className="service-desk-message-window-banner">
          <button type="button" className="service-desk-message-window-load-more" onClick={handleLoadMore}>
            查看更早的 {Math.min(hiddenCount, WIDGET_MESSAGE_LOAD_MORE_STEP)} 条消息
          </button>
          <span>当前已折叠 {hiddenCount} 条较早消息，减少长会话首屏负担。</span>
        </div>
      ) : null}
      {renderedMessages.map((message) => {
        const isAssistant = message.role === 'assistant'
        const relatedImages = message.trace?.relatedImages ?? []
        const summary = message.feedbackSummary
        return (
          <div key={message.id} className={`service-desk-message ${message.role}`}>
            <div className="service-desk-message-bubble">
              <div className="service-desk-message-meta">
                <span>{isAssistant ? '机器人' : '用户'}</span>
                <span>{formatTime(message.createdAt)}</span>
              </div>
              {isAssistant ? (
                <div className="service-desk-markdown">
                  <MarkdownRenderer content={message.content} />
                </div>
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
                          <img src={image.publicUrl} alt={image.description || image.documentName || image.id} />
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

              {isAssistant && summary ? (
                <div className="service-desk-feedback-summary">
                  <span>👍 {summary.likeCount}</span>
                  <span>👎 {summary.dislikeCount}</span>
                  {summary.status ? <span className={`status-${summary.status}`}>{summary.status}</span> : null}
                </div>
              ) : null}
            </div>
            {isAssistant ? (
              <FeedbackComposer
                messageId={message.id}
                disabled={loading}
                onLike={() => onLike(message)}
                onDislike={(reason, feedbackText) => onDislike(message, reason, feedbackText)}
              />
            ) : null}
          </div>
        )
      })}
      {loading ? <div className="service-desk-typing">机器人正在整理答案...</div> : null}
    </div>
  )
}

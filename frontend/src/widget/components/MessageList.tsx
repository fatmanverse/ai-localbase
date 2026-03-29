import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FeedbackComposer } from './FeedbackComposer'
import { ServiceDeskMessage } from '../types'

interface MessageListProps {
  messages: ServiceDeskMessage[]
  loading?: boolean
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

export function MessageList({ messages, loading, onLike, onDislike }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="service-desk-empty-state">
        <h3>欢迎使用工单机器人</h3>
        <p>你可以直接描述故障现象、影响范围、已尝试操作，机器人会结合知识库给出处理建议。</p>
      </div>
    )
  }

  return (
    <div className="service-desk-message-list">
      {messages.map((message) => {
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
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
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
                        {image.publicUrl ? <img src={image.publicUrl} alt={image.description || image.documentName || image.id} /> : null}
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

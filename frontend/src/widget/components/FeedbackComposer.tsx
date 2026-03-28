import { useState } from 'react'
import { feedbackReasonOptions } from '../types'

interface FeedbackComposerProps {
  messageId: string
  disabled?: boolean
  onLike: () => Promise<void>
  onDislike: (reason: string, feedbackText: string) => Promise<void>
}

export function FeedbackComposer({ messageId, disabled, onLike, onDislike }: FeedbackComposerProps) {
  const [expanded, setExpanded] = useState(false)
  const [reason, setReason] = useState<string>('没有解决问题')
  const [feedbackText, setFeedbackText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const loading = disabled || submitting

  const handleLike = async () => {
    setSubmitting(true)
    try {
      await onLike()
    } finally {
      setSubmitting(false)
    }
  }

  const handleDislike = async () => {
    setSubmitting(true)
    try {
      await onDislike(reason, feedbackText)
      setExpanded(false)
      setFeedbackText('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="feedback-composer" data-message-id={messageId}>
      <div className="feedback-headline">这条回答是否解决了你的问题？</div>
      <div className="feedback-actions">
        <button type="button" disabled={loading} onClick={() => void handleLike()}>
          👍 已解决
        </button>
        <button type="button" disabled={loading} className="secondary" onClick={() => setExpanded((prev) => !prev)}>
          👎 仍未解决
        </button>
      </div>
      {expanded ? (
        <div className="feedback-panel">
          <div className="feedback-reason-grid">
            {feedbackReasonOptions.map((option) => (
              <button
                key={option}
                type="button"
                className={reason === option ? 'selected' : ''}
                disabled={loading}
                onClick={() => setReason(option)}
              >
                {option}
              </button>
            ))}
          </div>
          <textarea
            value={feedbackText}
            disabled={loading}
            onChange={(event) => setFeedbackText(event.target.value)}
            placeholder="可补充失败场景、系统报错、缺失信息，帮助后续优化 FAQ / 知识库。"
            rows={3}
          />
          <div className="feedback-submit-row">
            <button type="button" className="secondary" disabled={loading} onClick={() => setExpanded(false)}>
              取消
            </button>
            <button type="button" disabled={loading} onClick={() => void handleDislike()}>
              提交反馈
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

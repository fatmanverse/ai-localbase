import { useMemo, useState } from 'react'
import { ServiceDeskFeedbackSummary, feedbackReasonOptions } from '../types'

interface FeedbackComposerProps {
  messageId: string
  disabled?: boolean
  hidden?: boolean
  copied?: boolean
  summary?: ServiceDeskFeedbackSummary
  onCopy?: () => void
  onLike: () => Promise<void>
  onDislike: (reason: string, feedbackText: string) => Promise<void>
}

const resolveNoticeTone = (notice: string, hasSubmittedFeedback: boolean): 'info' | 'success' | 'error' | 'muted' => {
  if (!notice) {
    return 'info'
  }

  if (notice.startsWith('反馈暂时没有记上')) {
    return 'error'
  }

  if (hasSubmittedFeedback) {
    return 'muted'
  }

  if (notice.startsWith('已记录')) {
    return 'success'
  }

  return 'info'
}

const describeSubmittedFeedback = (summary?: ServiceDeskFeedbackSummary) => {
  if (!summary?.latestFeedback) {
    return ''
  }

  const [feedbackType, reason] = summary.latestFeedback.split(':')
  if (feedbackType === 'like') {
    return '已记录：已解决'
  }
  if (reason) {
    return `已记录：${reason}`
  }
  if (feedbackType === 'dislike') {
    return '已记录：待优化'
  }
  return ''
}

export function FeedbackComposer({
  messageId,
  disabled,
  hidden,
  copied,
  summary,
  onCopy,
  onLike,
  onDislike,
}: FeedbackComposerProps) {
  const [expanded, setExpanded] = useState(false)
  const [reason, setReason] = useState<string>('没有解决问题')
  const [feedbackText, setFeedbackText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [localNotice, setLocalNotice] = useState<string | null>(null)
  const loading = disabled || submitting
  const hasSubmittedFeedback = Boolean(summary?.latestFeedbackId)
  const summaryNotice = useMemo(() => describeSubmittedFeedback(summary), [summary])
  const feedbackNotice = localNotice ?? summaryNotice
  const noticeTone = resolveNoticeTone(feedbackNotice, hasSubmittedFeedback)
  const hasSummaryStats = (summary?.likeCount ?? 0) > 0 || (summary?.dislikeCount ?? 0) > 0

  useEffect(() => {
    if (hasSubmittedFeedback) {
      setLocalNotice(null)
    }
  }, [hasSubmittedFeedback])

  const handleLike = async () => {
    setSubmitting(true)
    setLocalNotice(null)
    try {
      await onLike()
    } catch {
      setLocalNotice('反馈暂时没有记上，请稍后再试。')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDislike = async () => {
    setSubmitting(true)
    setLocalNotice(null)
    try {
      await onDislike(reason, feedbackText)
      setExpanded(false)
      setFeedbackText('')
    } catch {
      setLocalNotice('反馈暂时没有记上，请稍后再试。')
    } finally {
      setSubmitting(false)
    }
  }

  if (hidden) {
    return null
  }

  return (
    <div
      className={`feedback-composer ${expanded ? 'is-expanded' : ''} ${hasSubmittedFeedback ? 'is-submitted' : ''}`.trim()}
      data-message-id={messageId}
    >
      <div className="feedback-inline-row">
        {hasSummaryStats || feedbackNotice ? (
          <div className="feedback-meta">
            {hasSummaryStats ? (
              <div className="feedback-summary">
                <span>👍 {summary?.likeCount ?? 0}</span>
                <span>👎 {summary?.dislikeCount ?? 0}</span>
              </div>
            ) : null}
            {feedbackNotice ? <div className={`feedback-compact-notice ${noticeTone === 'muted' ? 'is-muted' : ''} ${noticeTone === 'success' ? 'is-success' : ''} ${noticeTone === 'error' ? 'is-error' : ''}`.trim()}>{feedbackNotice}</div> : null}
          </div>
        ) : null}

        <div className="feedback-actions compact">
          {!hasSubmittedFeedback ? (
            <>
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleLike()}
                aria-label="这条回复解决了问题"
                title={loading ? '提交中...' : '这条回复解决了问题'}
              >
                👍
              </button>
              <button
                type="button"
                disabled={loading}
                className={`secondary ${expanded ? 'active' : ''}`.trim()}
                onClick={() => setExpanded((prev) => !prev)}
                aria-label="这条回复还不够准确"
                title="这条回复还不够准确"
              >
                👎
              </button>
            </>
          ) : null}
          {onCopy ? (
            <button
              type="button"
              disabled={loading}
              className="ghost"
              onClick={onCopy}
              aria-label="复制消息"
              title={copied ? '已复制' : '复制消息'}
            >
              {copied ? '✓' : '⧉'}
            </button>
          ) : null}
        </div>
      </div>

      {!hasSubmittedFeedback && expanded ? (
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
              {loading ? '提交中...' : '提交反馈'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

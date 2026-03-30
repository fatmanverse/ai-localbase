import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DeferredMarkdownRenderer from './markdown/DeferredMarkdownRenderer'
import { usePinnedAutoScroll } from '../hooks/usePinnedAutoScroll'
import { AppConfig, Conversation, DEFAULT_SUGGESTED_PROMPTS, DocumentItem, KnowledgeBase, MessageFeedbackSummary } from '../App'

interface ChatAreaProps {
  sidebarOpen: boolean
  activeConversation: Conversation
  conversationKnowledgeBase: KnowledgeBase | null
  conversationDocument: DocumentItem | null
  knowledgeBases: KnowledgeBase[]
  config: AppConfig
  welcomeMessage: string
  isLoading: boolean
  isSwitchingKnowledgeBase?: boolean
  onSendMessage: (content: string) => Promise<void>
  onClearConversation: () => void
  onChangeConversationKnowledgeBase: (knowledgeBaseId: string) => Promise<void> | void
  onSubmitMessageFeedback: (
    messageId: string,
    payload: {
      feedbackType: 'like' | 'dislike'
      feedbackReason?: string
      feedbackText?: string
    },
  ) => Promise<MessageFeedbackSummary>
}

interface ChatToolbarItem {
  icon: string
  text: string
}

interface ChatTopBarProps {
  title: string
  updatedAt: string
  conversationKnowledgeBaseLabel: string
  hasBoundKnowledgeBase: boolean
  toolbarItems: ChatToolbarItem[]
  currentKnowledgeBaseSelectValue: string
  activeConversationKnowledgeBaseId: string
  knowledgeBases: KnowledgeBase[]
  isSwitchingKnowledgeBase: boolean
  onChangeKnowledgeBase: (knowledgeBaseId: string) => void
  onClearConversation: () => void
}

interface WelcomeStateProps {
  welcomeMessage: string
  conversationDocument: DocumentItem | null
}

interface MessageBubbleProps {
  message: Conversation['messages'][number]
  isStreamingPlaceholder: boolean
  isReplyStreaming: boolean
  copied: boolean
  feedbackNotice: string
  feedbackNoticeTone: 'info' | 'success' | 'error' | 'muted'
  hasSubmittedFeedback: boolean
  isFeedbackExpanded: boolean
  isFeedbackSubmitting: boolean
  selectedFeedbackReason: string
  feedbackText: string
  canCollectFeedback: boolean
  onCopyMessage: (messageId: string, content: string) => void
  onSubmitLikeFeedback: (messageId: string) => void
  onToggleFeedback: (messageId: string) => void
  onSelectFeedbackReason: (messageId: string, reason: string) => void
  onFeedbackTextChange: (messageId: string, value: string) => void
  onCancelFeedback: () => void
  onSubmitDislikeFeedback: (messageId: string) => void
}

interface MessageListProps {
  conversationId: string
  messages: Conversation['messages']
  isLoading: boolean
  copiedMessageId: string | null
  expandedFeedbackMessageId: string | null
  feedbackSubmittingMessageId: string | null
  feedbackReasons: Record<string, string>
  feedbackTexts: Record<string, string>
  feedbackNotices: Record<string, string>
  onCopyMessage: (messageId: string, content: string) => void
  onSubmitLikeFeedback: (messageId: string) => void
  onToggleFeedback: (messageId: string) => void
  onSelectFeedbackReason: (messageId: string, reason: string) => void
  onFeedbackTextChange: (messageId: string, value: string) => void
  onCancelFeedback: () => void
  onSubmitDislikeFeedback: (messageId: string) => void
  welcomeMessage: string
  conversationDocument: DocumentItem | null
}

interface PromptListProps {
  prompts: string[]
  canAsk: boolean
  onPromptClick: (prompt: string) => void
}

interface ChatComposerProps {
  inputValue: string
  canSend: boolean
  hasBoundKnowledgeBase: boolean
  isSwitchingKnowledgeBase: boolean
  isLoading: boolean
  onInputChange: (value: string) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onSubmit: () => void
}

const normalChatFeedbackReasonOptions = [
  '答非所问',
  '内容不准确',
  '内容不完整',
  '内容过时',
  '没有解决问题',
  '检索结果不相关',
  '图片文字未识别',
  '图片内容未召回',
  '图文理解不完整',
  '图片描述不准确',
  '图片信息过时',
  '其他',
]

const CHAT_MESSAGE_WINDOW_SIZE = 60
const CHAT_MESSAGE_LOAD_MORE_STEP = 40

const resolveFeedbackNoticeTone = (notice: string, hasSubmittedFeedback: boolean): 'info' | 'success' | 'error' | 'muted' => {
  if (!notice) {
    return 'info'
  }

  if (notice.includes('还没记上')) {
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

const describeFeedbackSummary = (summary?: MessageFeedbackSummary): string => {
  if (!summary?.latestFeedback) {
    return ''
  }

  const [feedbackType, reason] = summary.latestFeedback.split(':')
  if (feedbackType === 'like') {
    return '已记录：这条答复已解决当前问题'
  }
  if (reason) {
    return `已记录：${reason}`
  }
  if (feedbackType === 'dislike') {
    return '已记录：这条答复还需要继续跟进'
  }
  return ''
}

const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })

const buildRelatedImagesSignature = (images: NonNullable<Conversation['messages'][number]['metadata']>['relatedImages'] | undefined) =>
  (images ?? [])
    .map((image) => `${image.id}|${image.publicUrl ?? ''}|${image.classification ?? ''}|${image.description ?? ''}`)
    .join(';')

const buildMessageRenderSignature = (message: Conversation['messages'][number]) => {
  const metadata = message.metadata
  const feedbackSummary = metadata?.feedbackSummary
  return [
    message.id,
    message.role,
    message.content,
    message.timestamp,
    metadata?.degraded ? '1' : '0',
    feedbackSummary?.likeCount ?? 0,
    feedbackSummary?.dislikeCount ?? 0,
    feedbackSummary?.latestFeedbackId ?? '',
    feedbackSummary?.latestFeedback ?? '',
    buildRelatedImagesSignature(metadata?.relatedImages),
  ].join('|')
}

const areMessageBubblePropsEqual = (prev: MessageBubbleProps, next: MessageBubbleProps) =>
  buildMessageRenderSignature(prev.message) === buildMessageRenderSignature(next.message) &&
  prev.isStreamingPlaceholder === next.isStreamingPlaceholder &&
  prev.isReplyStreaming === next.isReplyStreaming &&
  prev.copied === next.copied &&
  prev.feedbackNotice === next.feedbackNotice &&
  prev.feedbackNoticeTone === next.feedbackNoticeTone &&
  prev.hasSubmittedFeedback === next.hasSubmittedFeedback &&
  prev.isFeedbackExpanded === next.isFeedbackExpanded &&
  prev.isFeedbackSubmitting === next.isFeedbackSubmitting &&
  prev.selectedFeedbackReason === next.selectedFeedbackReason &&
  prev.feedbackText === next.feedbackText &&
  prev.canCollectFeedback === next.canCollectFeedback

const isMessageScopedMapEqual = (
  prevMap: Record<string, string>,
  nextMap: Record<string, string>,
  messageIds: string[],
) => {
  for (const messageId of messageIds) {
    if ((prevMap[messageId] ?? '') !== (nextMap[messageId] ?? '')) {
      return false
    }
  }
  return true
}

const areMessageListPropsEqual = (prev: MessageListProps, next: MessageListProps) => {
  if (prev.conversationId !== next.conversationId) return false
  if (prev.messages !== next.messages) return false
  if (prev.isLoading !== next.isLoading) return false
  if (prev.copiedMessageId !== next.copiedMessageId) return false
  if (prev.expandedFeedbackMessageId !== next.expandedFeedbackMessageId) return false
  if (prev.feedbackSubmittingMessageId !== next.feedbackSubmittingMessageId) return false
  if (prev.welcomeMessage !== next.welcomeMessage) return false
  if (prev.conversationDocument !== next.conversationDocument) return false
  if (prev.onCopyMessage !== next.onCopyMessage) return false
  if (prev.onSubmitLikeFeedback !== next.onSubmitLikeFeedback) return false
  if (prev.onToggleFeedback !== next.onToggleFeedback) return false
  if (prev.onSelectFeedbackReason !== next.onSelectFeedbackReason) return false
  if (prev.onFeedbackTextChange !== next.onFeedbackTextChange) return false
  if (prev.onCancelFeedback !== next.onCancelFeedback) return false
  if (prev.onSubmitDislikeFeedback !== next.onSubmitDislikeFeedback) return false

  const messageIds = next.messages.map((message) => message.id)
  return isMessageScopedMapEqual(prev.feedbackReasons, next.feedbackReasons, messageIds) &&
    isMessageScopedMapEqual(prev.feedbackTexts, next.feedbackTexts, messageIds) &&
    isMessageScopedMapEqual(prev.feedbackNotices, next.feedbackNotices, messageIds)
}

const ChatTopBar = memo(function ChatTopBar({
  title,
  updatedAt,
  conversationKnowledgeBaseLabel,
  hasBoundKnowledgeBase,
  toolbarItems,
  currentKnowledgeBaseSelectValue,
  activeConversationKnowledgeBaseId,
  knowledgeBases,
  isSwitchingKnowledgeBase,
  onChangeKnowledgeBase,
  onClearConversation,
}: ChatTopBarProps) {
  return (
    <div className="chat-topbar">
      <div className="chat-topbar-left">
        <span className="chat-topbar-title">问题处理支持</span>
        <span className="chat-topbar-sep">·</span>
        <span className="chat-topbar-hint">{title}</span>
        <span className="chat-topbar-sep">·</span>
        <span className={`chat-topbar-kb-tag ${hasBoundKnowledgeBase ? '' : 'is-missing'}`.trim()} title={conversationKnowledgeBaseLabel}>
          {conversationKnowledgeBaseLabel}
        </span>
        <span className="chat-topbar-sep">·</span>
        <span className="chat-topbar-hint">{formatTime(updatedAt)}</span>
      </div>

      <div className="chat-topbar-pills">
        {toolbarItems.map((item) => (
          <div key={item.text} className="topbar-pill" title={item.text}>
            <span className="topbar-pill-icon">{item.icon}</span>
            <span className="topbar-pill-text">{item.text}</span>
          </div>
        ))}
      </div>

      <div className="chat-topbar-right">
        <label className="chat-topbar-scope">
          <span className="chat-topbar-scope-label">知识库</span>
          <select
            className="chat-scope-select"
            value={currentKnowledgeBaseSelectValue}
            disabled={knowledgeBases.length === 0 || isSwitchingKnowledgeBase}
            onChange={(event) => onChangeKnowledgeBase(event.target.value)}
          >
            {!currentKnowledgeBaseSelectValue ? <option value="">请选择知识库</option> : null}
            {!hasBoundKnowledgeBase && activeConversationKnowledgeBaseId ? (
              <option value={activeConversationKnowledgeBaseId}>当前绑定知识库已失效</option>
            ) : null}
            {knowledgeBases.map((knowledgeBase) => (
              <option key={knowledgeBase.id} value={knowledgeBase.id}>
                {knowledgeBase.name}
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="chat-clear-btn" onClick={onClearConversation} disabled={isSwitchingKnowledgeBase}>
          清空对话
        </button>
      </div>
    </div>
  )
})

const WelcomeState = memo(function WelcomeState({ welcomeMessage, conversationDocument }: WelcomeStateProps) {
  return (
    <div className="welcome-message">
      <h2>请先描述你遇到的问题</h2>
      <p>{welcomeMessage}</p>
      {conversationDocument ? <p>当前文档范围：{conversationDocument.name}</p> : null}
    </div>
  )
})

const MessageBubble = memo(function MessageBubble({
  message,
  isStreamingPlaceholder,
  isReplyStreaming,
  copied,
  feedbackNotice,
  feedbackNoticeTone,
  hasSubmittedFeedback,
  isFeedbackExpanded,
  isFeedbackSubmitting,
  selectedFeedbackReason,
  feedbackText,
  canCollectFeedback,
  onCopyMessage,
  onSubmitLikeFeedback,
  onToggleFeedback,
  onSelectFeedbackReason,
  onFeedbackTextChange,
  onCancelFeedback,
  onSubmitDislikeFeedback,
}: MessageBubbleProps) {
  const degradedMetadata = message.role === 'assistant' && message.metadata?.degraded ? message.metadata : null
  const relatedImages = message.role === 'assistant' ? message.metadata?.relatedImages ?? [] : []
  const feedbackSummary = message.role === 'assistant' ? message.metadata?.feedbackSummary : undefined
  const hasMessageContent = Boolean(message.content.trim())

  return (
    <div className={`message ${message.role}`}>
      <div className={`message-content ${isStreamingPlaceholder ? 'message-content-thinking' : ''} ${message.role === 'assistant' ? 'message-content-markdown' : ''}`.trim()}>
        {degradedMetadata ? (
          <div className="message-degraded-banner" role="status" aria-live="polite">
            <div className="message-degraded-title">这次先给你一版保守结论，现有资料还不算特别完整。</div>
            <div className="message-degraded-detail">你可以先按当前答案处理；如果还卡住，我再继续帮你缩小范围。</div>
          </div>
        ) : null}

        {isStreamingPlaceholder ? (
          <div className="thinking-indicator" aria-label="AI 正在思考">
            <span className="thinking-dot" />
            <span className="thinking-dot" />
            <span className="thinking-dot" />
          </div>
        ) : message.role === 'assistant' ? (
          isReplyStreaming ? (
            <div className="message-streaming-text">{message.content}</div>
          ) : (
            <DeferredMarkdownRenderer content={message.content} fallbackClassName="message-streaming-text message-deferred-markdown" />
          )
        ) : (
          message.content
        )}
      </div>

      {message.role === 'assistant' && relatedImages.length > 0 ? (
        <div className="message-related-images">
          <div className="message-related-images-title">相关图片</div>
          <div className="message-related-image-grid">
            {relatedImages.map((image) => (
              <div key={image.id} className="message-related-image-card">
                {image.publicUrl ? (
                  <a
                    href={image.publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="message-related-image-link"
                    title="查看原图"
                  >
                    <img src={image.publicUrl} alt={image.description || image.documentName || image.id} loading="lazy" decoding="async" fetchPriority="low" />
                    <span className="message-related-image-view-tag">查看大图</span>
                  </a>
                ) : null}
                <div className="message-related-image-meta">
                  <strong>{image.documentName || '相关图片'}</strong>
                  {image.classification ? <span>{image.classification}</span> : null}
                  {image.description ? <p>{image.description}</p> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="message-tail">
        <div className="message-time">{formatTime(message.timestamp)}</div>

        {canCollectFeedback ? (
          <div className={`message-feedback-box ${isFeedbackExpanded ? 'is-expanded' : ''}`.trim()}>
            <div className="message-feedback-inline-row">
              {(feedbackSummary?.likeCount ?? 0) > 0 || (feedbackSummary?.dislikeCount ?? 0) > 0 ? (
                <div className="message-feedback-summary">
                  <span>👍 {feedbackSummary?.likeCount ?? 0}</span>
                  <span>👎 {feedbackSummary?.dislikeCount ?? 0}</span>
                </div>
              ) : null}

              {feedbackNotice ? (
                <div className={`message-feedback-notice ${feedbackNoticeTone === 'muted' ? 'is-muted' : ''} ${feedbackNoticeTone === 'success' ? 'is-success' : ''} ${feedbackNoticeTone === 'error' ? 'is-error' : ''}`.trim()}>
                  {feedbackNotice}
                </div>
              ) : null}

              {!hasSubmittedFeedback ? (
                <div className="message-feedback-actions compact">
                  <button
                    type="button"
                    className="message-feedback-action icon primary"
                    disabled={isFeedbackSubmitting}
                    onClick={() => onSubmitLikeFeedback(message.id)}
                    aria-label="这条回复解决了问题"
                    title={isFeedbackSubmitting ? '提交中...' : '这条回复解决了问题'}
                  >
                    👍
                  </button>
                  <button
                    type="button"
                    className={`message-feedback-action icon secondary ${isFeedbackExpanded ? 'is-active' : ''}`.trim()}
                    disabled={isFeedbackSubmitting}
                    onClick={() => onToggleFeedback(message.id)}
                    aria-label="这条回复还不够准确"
                    title="这条回复还不够准确"
                  >
                    👎
                  </button>
                </div>
              ) : null}
            </div>

            {!hasSubmittedFeedback && isFeedbackExpanded ? (
              <div className="message-feedback-panel">
                <div className="message-feedback-reasons">
                  {normalChatFeedbackReasonOptions.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      className={`message-feedback-reason ${selectedFeedbackReason === reason ? 'selected' : ''}`.trim()}
                      disabled={isFeedbackSubmitting}
                      onClick={() => onSelectFeedbackReason(message.id, reason)}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={3}
                  value={feedbackText}
                  disabled={isFeedbackSubmitting}
                  placeholder="如果你愿意，可以补充一下实际卡住的点，我后面会优先优化这类回答。"
                  onChange={(event) => onFeedbackTextChange(message.id, event.target.value)}
                />
                <div className="message-feedback-submit-row">
                  <span>选好原因后提交，我会把这类问题归到后续优化清单里。</span>
                  <div className="message-feedback-submit-actions">
                    <button type="button" className="message-feedback-action secondary" disabled={isFeedbackSubmitting} onClick={onCancelFeedback}>
                      取消
                    </button>
                    <button
                      type="button"
                      className="message-feedback-action primary"
                      disabled={isFeedbackSubmitting}
                      onClick={() => onSubmitDislikeFeedback(message.id)}
                    >
                      {isFeedbackSubmitting ? '提交中...' : '提交反馈'}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {!isStreamingPlaceholder && hasMessageContent ? (
          <button
            type="button"
            className="message-tail-icon-btn"
            onClick={() => onCopyMessage(message.id, message.content)}
            aria-label="复制消息"
            title={copied ? '已复制' : '复制消息'}
          >
            {copied ? '✓' : '⧉'}
          </button>
        ) : null}
      </div>
    </div>
  )
}, areMessageBubblePropsEqual)

const MessageList = memo(function MessageList({
  conversationId,
  messages,
  isLoading,
  copiedMessageId,
  expandedFeedbackMessageId,
  feedbackSubmittingMessageId,
  feedbackReasons,
  feedbackTexts,
  feedbackNotices,
  onCopyMessage,
  onSubmitLikeFeedback,
  onToggleFeedback,
  onSelectFeedbackReason,
  onFeedbackTextChange,
  onCancelFeedback,
  onSubmitDislikeFeedback,
  welcomeMessage,
  conversationDocument,
}: MessageListProps) {
  const lastMessage = messages.at(-1)
  const [visibleCount, setVisibleCount] = useState(() => Math.min(messages.length, CHAT_MESSAGE_WINDOW_SIZE))
  const previousConversationIdRef = useRef(conversationId)
  const previousMessageLengthRef = useRef(messages.length)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const lastMessageContentSignature = `${lastMessage?.id ?? ''}|${lastMessage?.content.length ?? 0}`

  useEffect(() => {
    const previousConversationId = previousConversationIdRef.current
    const previousMessageLength = previousMessageLengthRef.current

    if (previousConversationId !== conversationId) {
      setVisibleCount(Math.min(messages.length, CHAT_MESSAGE_WINDOW_SIZE))
    } else {
      setVisibleCount((prev) => {
        if (messages.length <= CHAT_MESSAGE_WINDOW_SIZE) {
          return messages.length
        }
        if (prev >= previousMessageLength) {
          return messages.length
        }
        return prev
      })
    }

    previousConversationIdRef.current = conversationId
    previousMessageLengthRef.current = messages.length
  }, [conversationId, messages.length])

  const hiddenCount = Math.max(0, messages.length - visibleCount)
  const renderedMessages = hiddenCount > 0 ? messages.slice(-visibleCount) : messages

  usePinnedAutoScroll({
    containerRef,
    conversationKey: conversationId,
    itemCount: messages.length,
    lastItemId: lastMessage?.id,
    lastItemContentSignature,
    streaming: Boolean(isLoading && lastMessage?.role === 'assistant'),
  })

  const handleLoadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(messages.length, prev + CHAT_MESSAGE_LOAD_MORE_STEP))
  }, [messages.length])

  return (
    <div className="messages-container" ref={containerRef}>
      {hiddenCount > 0 ? (
        <div className="message-window-banner">
          <button type="button" className="message-window-load-more" onClick={handleLoadMore}>
            查看更早的 {Math.min(hiddenCount, CHAT_MESSAGE_LOAD_MORE_STEP)} 条消息
          </button>
          <span className="message-window-hint">已先折叠 {hiddenCount} 条较早消息，需要时再展开查看即可。</span>
        </div>
      ) : null}

      {messages.length === 0 ? (
        <WelcomeState welcomeMessage={welcomeMessage} conversationDocument={conversationDocument} />
      ) : (
        renderedMessages.map((message, index) => {
          const actualIndex = hiddenCount + index
          const isReplyStreaming = isLoading && message.role === 'assistant' && message.id === lastMessage?.id
          const isStreamingPlaceholder = isReplyStreaming && !message.content.trim()
          const previousMessage = messages[actualIndex - 1]
          const feedbackSummary = message.role === 'assistant' ? message.metadata?.feedbackSummary : undefined
          const feedbackNotice = feedbackNotices[message.id] || describeFeedbackSummary(feedbackSummary)
          const hasSubmittedFeedback = Boolean(feedbackSummary?.latestFeedbackId)
          const feedbackNoticeTone = resolveFeedbackNoticeTone(feedbackNotice, hasSubmittedFeedback)
          const canCollectFeedback =
            message.role === 'assistant' && previousMessage?.role === 'user' && !isReplyStreaming && Boolean(message.content.trim())

          return (
            <MessageBubble
              key={message.id}
              message={message}
              isStreamingPlaceholder={isStreamingPlaceholder}
              isReplyStreaming={isReplyStreaming}
              copied={copiedMessageId === message.id}
              feedbackNotice={feedbackNotice}
              feedbackNoticeTone={feedbackNoticeTone}
              hasSubmittedFeedback={hasSubmittedFeedback}
              isFeedbackExpanded={expandedFeedbackMessageId === message.id}
              isFeedbackSubmitting={feedbackSubmittingMessageId === message.id}
              selectedFeedbackReason={feedbackReasons[message.id] ?? '没有解决问题'}
              feedbackText={feedbackTexts[message.id] ?? ''}
              canCollectFeedback={canCollectFeedback}
              onCopyMessage={onCopyMessage}
              onSubmitLikeFeedback={onSubmitLikeFeedback}
              onToggleFeedback={onToggleFeedback}
              onSelectFeedbackReason={onSelectFeedbackReason}
              onFeedbackTextChange={onFeedbackTextChange}
              onCancelFeedback={onCancelFeedback}
              onSubmitDislikeFeedback={onSubmitDislikeFeedback}
            />
          )
        })
      )}

      {isLoading && lastMessage?.role !== 'assistant' ? (
        <div className="message assistant loading">
          <div className="message-content">正在整理答复...</div>
        </div>
      ) : null}

    </div>
  )
}, areMessageListPropsEqual)

const PromptList = memo(function PromptList({ prompts, canAsk, onPromptClick }: PromptListProps) {
  return (
    <div className="prompt-list">
      {prompts.map((prompt) => (
        <button key={prompt} type="button" className="prompt-chip" disabled={!canAsk} onClick={() => onPromptClick(prompt)}>
          {prompt}
        </button>
      ))}
    </div>
  )
})

const ChatComposer = memo(function ChatComposer({
  inputValue,
  canSend,
  hasBoundKnowledgeBase,
  isSwitchingKnowledgeBase,
  isLoading,
  onInputChange,
  onKeyDown,
  onSubmit,
}: ChatComposerProps) {
  return (
    <div className="input-area">
      <div className="input-container">
        <textarea
          value={inputValue}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            isSwitchingKnowledgeBase
              ? '正在切换知识库，请稍候...'
              : hasBoundKnowledgeBase
                ? '输入您的问题，Enter 发送，Shift + Enter 换行'
                : '请先为当前会话绑定知识库后再提问'
          }
          rows={3}
          disabled={!hasBoundKnowledgeBase || isSwitchingKnowledgeBase}
        />
        <button type="button" onClick={onSubmit} disabled={!canSend} className="send-btn">
          {isSwitchingKnowledgeBase ? '切换中...' : isLoading ? '发送中...' : '发送'}
        </button>
      </div>
    </div>
  )
})

const ChatArea: React.FC<ChatAreaProps> = ({
  sidebarOpen,
  activeConversation,
  conversationKnowledgeBase,
  conversationDocument,
  knowledgeBases,
  config,
  welcomeMessage,
  isLoading,
  isSwitchingKnowledgeBase = false,
  onSendMessage,
  onClearConversation,
  onChangeConversationKnowledgeBase,
  onSubmitMessageFeedback,
}) => {
  const [inputValue, setInputValue] = useState('')
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [expandedFeedbackMessageId, setExpandedFeedbackMessageId] = useState<string | null>(null)
  const [feedbackSubmittingMessageId, setFeedbackSubmittingMessageId] = useState<string | null>(null)
  const [feedbackReasons, setFeedbackReasons] = useState<Record<string, string>>({})
  const [feedbackTexts, setFeedbackTexts] = useState<Record<string, string>>({})
  const [feedbackNotices, setFeedbackNotices] = useState<Record<string, string>>({})
  const copyResetTimerRef = useRef<number | null>(null)

  const hasBoundKnowledgeBase = Boolean(conversationKnowledgeBase)
  const currentKnowledgeBaseSelectValue = conversationKnowledgeBase?.id ?? activeConversation.knowledgeBaseId ?? ''
  const conversationKnowledgeBaseLabel = conversationKnowledgeBase
    ? `知识库：${conversationKnowledgeBase.name}`
    : activeConversation.knowledgeBaseId
      ? '知识库已删除或不可用'
      : '未绑定知识库'
  const canAsk = hasBoundKnowledgeBase && !isLoading && !isSwitchingKnowledgeBase
  const canSend = inputValue.trim().length > 0 && canAsk

  const suggestedPrompts = useMemo(
    () =>
      config.ui?.suggestedPrompts && config.ui.suggestedPrompts.length > 0
        ? config.ui.suggestedPrompts
        : DEFAULT_SUGGESTED_PROMPTS,
    [config.ui?.suggestedPrompts],
  )

  useEffect(() => () => {
    if (copyResetTimerRef.current) {
      window.clearTimeout(copyResetTimerRef.current)
    }
  }, [])

  const conversationStats = useMemo(() => {
    const userCount = activeConversation.messages.filter((message) => message.role === 'user').length

    return {
      userCount,
      totalCount: activeConversation.messages.length,
    }
  }, [activeConversation.messages])

  const scopeText = useMemo(() => {
    if (conversationDocument) {
      return `文档问答：${conversationDocument.name}`
    }
    if (conversationKnowledgeBase) {
      return `知识库问答：${conversationKnowledgeBase.name}`
    }
    if (activeConversation.knowledgeBaseId) {
      return '会话绑定的知识库已失效'
    }
    return '当前会话未绑定知识库'
  }, [activeConversation.knowledgeBaseId, conversationDocument, conversationKnowledgeBase])

  const toolbarItems = useMemo<ChatToolbarItem[]>(() => [
    {
      icon: '📚',
      text: scopeText,
    },
    {
      icon: '🤖',
      text:
        config.chat.candidates && config.chat.candidates.length > 0
          ? `${config.chat.model} +${config.chat.candidates.length} 备用`
          : config.chat.model,
    },
    {
      icon: '💬',
      text: `${conversationStats.totalCount} 条消息`,
    },
  ], [config.chat.candidates, config.chat.model, conversationStats.totalCount, scopeText])

  const handleSubmit = useCallback(async () => {
    const content = inputValue.trim()
    if (!content || !canAsk) {
      return
    }

    setInputValue('')
    await onSendMessage(content)
  }, [inputValue, canAsk, onSendMessage])

  const handleKeyDown = useCallback(async (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      await handleSubmit()
    }
  }, [handleSubmit])

  const handleInputChange = useCallback((value: string) => {
    setInputValue(value)
  }, [])

  const handlePromptClick = useCallback((prompt: string) => {
    void onSendMessage(prompt)
  }, [onSendMessage])

  const handleKnowledgeBaseChange = useCallback((knowledgeBaseId: string) => {
    void onChangeConversationKnowledgeBase(knowledgeBaseId)
  }, [onChangeConversationKnowledgeBase])

  const handleClearConversationClick = useCallback(() => {
    onClearConversation()
  }, [onClearConversation])

  const handleCopyMessage = useCallback(async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedMessageId(messageId)
      if (copyResetTimerRef.current) {
        window.clearTimeout(copyResetTimerRef.current)
      }
      copyResetTimerRef.current = window.setTimeout(() => {
        setCopiedMessageId((prev) => (prev === messageId ? null : prev))
      }, 1500)
    } catch {
      // 忽略复制异常，避免影响主流程
    }
  }, [])

  const handleToggleFeedback = useCallback((messageId: string) => {
    setExpandedFeedbackMessageId((prev) => (prev === messageId ? null : messageId))
    setFeedbackReasons((prev) => ({
      ...prev,
      [messageId]: prev[messageId] ?? '没有解决问题',
    }))
  }, [])

  const handleSelectFeedbackReason = useCallback((messageId: string, reason: string) => {
    setFeedbackReasons((prev) => ({
      ...prev,
      [messageId]: reason,
    }))
  }, [])

  const handleFeedbackTextChange = useCallback((messageId: string, value: string) => {
    setFeedbackTexts((prev) => ({
      ...prev,
      [messageId]: value,
    }))
  }, [])

  const handleCancelFeedback = useCallback(() => {
    setExpandedFeedbackMessageId(null)
  }, [])

  const handleSubmitLikeFeedback = useCallback(async (messageId: string) => {
    setFeedbackSubmittingMessageId(messageId)
    try {
      await onSubmitMessageFeedback(messageId, { feedbackType: 'like' })
      setFeedbackNotices((prev) => ({
        ...prev,
        [messageId]: '已记录：这条答复已解决当前问题',
      }))
      setExpandedFeedbackMessageId((prev) => (prev === messageId ? null : prev))
    } catch (error) {
      setFeedbackNotices((prev) => ({
        ...prev,
        [messageId]: '这次反馈还没记上，请稍后再试。',
      }))
    } finally {
      setFeedbackSubmittingMessageId(null)
    }
  }, [onSubmitMessageFeedback])

  const handleSubmitDislikeFeedback = useCallback(async (messageId: string) => {
    const feedbackReason = feedbackReasons[messageId] ?? '没有解决问题'
    const feedbackText = feedbackTexts[messageId]?.trim() ?? ''

    setFeedbackSubmittingMessageId(messageId)
    try {
      await onSubmitMessageFeedback(messageId, {
        feedbackType: 'dislike',
        feedbackReason,
        feedbackText,
      })
      setFeedbackNotices((prev) => ({
        ...prev,
        [messageId]: '已记录：这条答复还需要继续跟进',
      }))
      setExpandedFeedbackMessageId((prev) => (prev === messageId ? null : prev))
    } catch (error) {
      setFeedbackNotices((prev) => ({
        ...prev,
        [messageId]: '这次反馈还没记上，请稍后再试。',
      }))
    } finally {
      setFeedbackSubmittingMessageId(null)
    }
  }, [feedbackReasons, feedbackTexts, onSubmitMessageFeedback])

  return (
    <main className={`chat-area ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      <ChatTopBar
        title={activeConversation.title}
        updatedAt={activeConversation.updatedAt}
        conversationKnowledgeBaseLabel={conversationKnowledgeBaseLabel}
        hasBoundKnowledgeBase={hasBoundKnowledgeBase}
        toolbarItems={toolbarItems}
        currentKnowledgeBaseSelectValue={currentKnowledgeBaseSelectValue}
        activeConversationKnowledgeBaseId={activeConversation.knowledgeBaseId}
        knowledgeBases={knowledgeBases}
        isSwitchingKnowledgeBase={isSwitchingKnowledgeBase}
        onChangeKnowledgeBase={handleKnowledgeBaseChange}
        onClearConversation={handleClearConversationClick}
      />

      <MessageList
        conversationId={activeConversation.id}
        messages={activeConversation.messages}
        isLoading={isLoading}
        copiedMessageId={copiedMessageId}
        expandedFeedbackMessageId={expandedFeedbackMessageId}
        feedbackSubmittingMessageId={feedbackSubmittingMessageId}
        feedbackReasons={feedbackReasons}
        feedbackTexts={feedbackTexts}
        feedbackNotices={feedbackNotices}
        onCopyMessage={handleCopyMessage}
        onSubmitLikeFeedback={handleSubmitLikeFeedback}
        onToggleFeedback={handleToggleFeedback}
        onSelectFeedbackReason={handleSelectFeedbackReason}
        onFeedbackTextChange={handleFeedbackTextChange}
        onCancelFeedback={handleCancelFeedback}
        onSubmitDislikeFeedback={handleSubmitDislikeFeedback}
        welcomeMessage={welcomeMessage}
        conversationDocument={conversationDocument}
      />

      <PromptList prompts={suggestedPrompts} canAsk={canAsk} onPromptClick={handlePromptClick} />

      <ChatComposer
        inputValue={inputValue}
        canSend={canSend}
        hasBoundKnowledgeBase={hasBoundKnowledgeBase}
        isSwitchingKnowledgeBase={isSwitchingKnowledgeBase}
        isLoading={isLoading}
        onInputChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onSubmit={() => {
          void handleSubmit()
        }}
      />
    </main>
  )
}

const areChatAreaPropsEqual = (prev: ChatAreaProps, next: ChatAreaProps) =>
  prev.sidebarOpen === next.sidebarOpen &&
  prev.activeConversation === next.activeConversation &&
  prev.conversationKnowledgeBase === next.conversationKnowledgeBase &&
  prev.conversationDocument === next.conversationDocument &&
  prev.knowledgeBases === next.knowledgeBases &&
  prev.config === next.config &&
  prev.welcomeMessage === next.welcomeMessage &&
  prev.isLoading === next.isLoading &&
  prev.isSwitchingKnowledgeBase === next.isSwitchingKnowledgeBase

export default memo(ChatArea, areChatAreaPropsEqual)
export type FeedbackType = 'like' | 'dislike'

export interface ApiResponse<T> {
  success: boolean
  data: T
  error?: {
    code: string
    message: string
  }
}

export interface ServiceDeskConversationContext {
  userId?: string
  tenantId?: string
  ticketId?: string
  sourcePlatform?: string
  category?: string
  priority?: string
  tags?: string[]
  metadata?: Record<string, unknown>
}

export interface ServiceDeskSourceDocument {
  knowledgeBaseId?: string
  documentId?: string
  documentName?: string
}

export interface ServiceDeskImageReference {
  id: string
  documentId?: string
  documentName?: string
  classification?: string
  description?: string
  publicUrl?: string
}

export interface ServiceDeskMessageTrace {
  knowledgeBaseId?: string
  documentId?: string
  retrievedContext?: string
  sourceDocuments?: ServiceDeskSourceDocument[]
  relatedImages?: ServiceDeskImageReference[]
  degraded?: boolean
  fallbackStrategy?: string
  upstreamError?: string
}

export interface ServiceDeskFeedbackSummary {
  likeCount: number
  dislikeCount: number
  latestFeedbackId?: string
  latestFeedback?: string
  status?: string
}

export interface ServiceDeskMessage {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  messageType?: string
  createdAt: string
  trace?: ServiceDeskMessageTrace
  feedbackSummary?: ServiceDeskFeedbackSummary
  metadata?: Record<string, unknown>
}

export interface ServiceDeskConversation {
  id: string
  title: string
  status: string
  knowledgeBaseId: string
  createdAt: string
  updatedAt: string
  context: ServiceDeskConversationContext
  sessionMetadata?: Record<string, unknown>
  messages: ServiceDeskMessage[]
  lastMessagePreview?: string
}

export interface CreateConversationPayload {
  title?: string
  knowledgeBaseId?: string
  status?: string
  context?: ServiceDeskConversationContext
  sessionMetadata?: Record<string, unknown>
}

export interface SendMessagePayload {
  content: string
  knowledgeBaseId?: string
  documentId?: string
  context?: ServiceDeskConversationContext
  sessionMetadata?: Record<string, unknown>
}

export interface SendMessageResponse {
  conversation: ServiceDeskConversation
  userMessage: ServiceDeskMessage
  assistantMessage: ServiceDeskMessage
}

export interface FeedbackPayload {
  conversationId: string
  messageId: string
  userId?: string
  feedbackType: FeedbackType
  feedbackReason?: string
  feedbackText?: string
  questionText?: string
  answerText?: string
  knowledgeBaseId?: string
  kbVersion?: string
  retrievedContext?: string
  sourceDocuments?: ServiceDeskSourceDocument[]
  sourcePlatform?: string
  tenantId?: string
  ticketId?: string
  metadata?: Record<string, unknown>
}

export interface StreamChunkHandler {
  onMeta?: (payload: Record<string, unknown>) => void
  onChunk?: (content: string) => void
  onDone?: (payload: Record<string, unknown>) => void
}

export const feedbackReasonOptions = [
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
] as const

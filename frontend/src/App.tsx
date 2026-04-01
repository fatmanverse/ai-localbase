import './App.css'
import ChatArea from './components/ChatArea'
import Sidebar from './components/Sidebar'
import SettingsPanel from './components/settings/SettingsPanel'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export interface SourceDocumentReference {
  knowledgeBaseId?: string
  documentId?: string
  documentName?: string
}

export interface RelatedImageReference {
  id: string
  documentId?: string
  documentName?: string
  classification?: string
  description?: string
  publicUrl?: string
}

export interface MessageFeedbackSummary {
  likeCount: number
  dislikeCount: number
  latestFeedbackId?: string
  latestFeedback?: string
  status?: string
}

export interface ChatMessageMetadata {
  degraded?: boolean
  fallbackStrategy?: string
  upstreamError?: string
  sources?: SourceDocumentReference[]
  relatedImages?: RelatedImageReference[]
  feedbackSummary?: MessageFeedbackSummary
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  metadata?: ChatMessageMetadata
}

export interface Conversation {
  id: string
  title: string
  knowledgeBaseId: string
  documentId: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
}

export interface DocumentItem {
  id: string
  name: string
  sizeLabel: string
  uploadedAt: string
  status: 'indexed' | 'ready' | 'processing'
  contentPreview?: string
  isFaqCollection?: boolean
  isDefaultFaqCollection?: boolean
}

export interface KnowledgeBase {
  id: string
  name: string
  description: string
  documents: DocumentItem[]
  createdAt: string
}

export interface UploadTask {
  id: string
  taskType?: 'upload' | 'reindex'
  knowledgeBaseId: string
  fileName: string
  sizeBytes: number
  sizeLabel: string
  progress: number
  networkProgress: number
  status: 'queued' | 'uploading' | 'processing' | 'success' | 'error' | 'canceled'
  backendTaskId?: string
  stage?: string
  detail?: string
  uploadedDocumentId?: string
  targetDocumentId?: string
  shouldAutoSelect?: boolean
  error?: string
  rollbackDocument?: DocumentItem
}

export interface ModelEndpointConfig {
  provider: string
  baseUrl: string
  model: string
  apiKey: string
}

export interface CircuitBreakerConfig {
  failureThreshold: number
  cooldownSeconds: number
  halfOpenMaxRequests: number
}

export interface ChatConfig {
  provider: 'ollama' | 'openai-compatible'
  baseUrl: string
  model: string
  apiKey: string
  temperature: number
  contextMessageLimit: number
  candidates: ModelEndpointConfig[]
  circuitBreaker: CircuitBreakerConfig
}

export interface EmbeddingConfig {
  provider: 'ollama' | 'openai-compatible'
  baseUrl: string
  model: string
  apiKey: string
  candidates: ModelEndpointConfig[]
  circuitBreaker: CircuitBreakerConfig
}

export interface UIConfig {
  welcomeMessageTemplate: string
  suggestedPrompts: string[]
}

export interface AppConfig {
  chat: ChatConfig
  embedding: EmbeddingConfig
  ui: UIConfig
}

interface ChatCompletionResponse {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    message: {
      role: 'assistant' | 'user'
      content: string
    }
  }>
  metadata?: ChatMessageMetadata
}

interface ChatRequestBody {
  conversationId: string
  model: string
  knowledgeBaseId: string
  documentId: string
  assistantMessageId?: string
  config: ChatConfig
  embedding: EmbeddingConfig
  messages: Array<{
    id: string
    role: ChatMessage['role']
    content: string
  }>
}

interface ApiErrorResponse {
  error?: string
}

interface StreamEventPayload {
  content?: string
  error?: string
  metadata?: ChatMessageMetadata
}

interface ConversationFeedbackPayload {
  feedbackType: 'like' | 'dislike'
  feedbackReason?: string
  feedbackText?: string
}

interface ConversationMessageFeedbackResponse {
  feedback: {
    id: string
  }
  summary: MessageFeedbackSummary
}

const API_BASE_PATH = ''

export const DEFAULT_WELCOME_MESSAGE_TEMPLATE = '你好，这边协助你处理当前问题。{knowledgeBaseHint}'
export const DEFAULT_SUGGESTED_PROMPTS = [
  '先帮我梳理这份资料里最关键的结论',
  '如果现在开始处理，第一步建议先做什么？',
  '结合当前资料，下一步最稳妥的处理顺序是什么？',
]

export const recommendedConfig: AppConfig = {
  chat: {
    provider: 'ollama',
    baseUrl: 'http://localhost:11434',
    model: 'qwen2.5:7b',
    apiKey: '',
    temperature: 0.2,
    contextMessageLimit: 12,
    candidates: [],
    circuitBreaker: {
      failureThreshold: 2,
      cooldownSeconds: 30,
      halfOpenMaxRequests: 1,
    },
  },
  embedding: {
    provider: 'ollama',
    baseUrl: 'http://localhost:11434',
    model: 'nomic-embed-text',
    apiKey: '',
    candidates: [],
    circuitBreaker: {
      failureThreshold: 2,
      cooldownSeconds: 30,
      halfOpenMaxRequests: 1,
    },
  },
  ui: {
    welcomeMessageTemplate: DEFAULT_WELCOME_MESSAGE_TEMPLATE,
    suggestedPrompts: [...DEFAULT_SUGGESTED_PROMPTS],
  },
}

const normalizeSuggestedPrompts = (values?: string[]): string[] => {
  const items = (values ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .slice(0, 8)

  return items.length > 0 ? items : [...DEFAULT_SUGGESTED_PROMPTS]
}

const cloneAppConfig = (config: AppConfig): AppConfig => ({
  chat: {
    ...config.chat,
    candidates: (config.chat.candidates ?? []).map((item) => ({ ...item })),
    circuitBreaker: { ...(config.chat.circuitBreaker ?? recommendedConfig.chat.circuitBreaker) },
  },
  embedding: {
    ...config.embedding,
    candidates: (config.embedding.candidates ?? []).map((item) => ({ ...item })),
    circuitBreaker: { ...(config.embedding.circuitBreaker ?? recommendedConfig.embedding.circuitBreaker) },
  },
  ui: {
    welcomeMessageTemplate: config.ui?.welcomeMessageTemplate?.trim() || DEFAULT_WELCOME_MESSAGE_TEMPLATE,
    suggestedPrompts: normalizeSuggestedPrompts(config.ui?.suggestedPrompts),
  },
})

const createId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const normalizeFeedbackSummary = (summary?: MessageFeedbackSummary): MessageFeedbackSummary | undefined => {
  if (!summary) {
    return undefined
  }

  const likeCount = Number(summary.likeCount ?? 0)
  const dislikeCount = Number(summary.dislikeCount ?? 0)
  const latestFeedbackId = summary.latestFeedbackId?.trim() ?? ''
  const latestFeedback = summary.latestFeedback?.trim() ?? ''
  const status = summary.status?.trim() ?? ''

  if (likeCount <= 0 && dislikeCount <= 0 && !latestFeedbackId && !latestFeedback && !status) {
    return undefined
  }

  return {
    likeCount,
    dislikeCount,
    latestFeedbackId: latestFeedbackId || undefined,
    latestFeedback: latestFeedback || undefined,
    status: status || undefined,
  }
}

const normalizeChatMessageMetadata = (metadata?: ChatMessageMetadata): ChatMessageMetadata | undefined => {
  if (!metadata) {
    return undefined
  }

  const sources = (metadata.sources ?? []).filter((item) =>
    Boolean(item.documentId || item.documentName || item.knowledgeBaseId),
  )
  const relatedImages = (metadata.relatedImages ?? []).filter((item) => Boolean(item.id))
  const feedbackSummary = normalizeFeedbackSummary(metadata.feedbackSummary)

  if (
    !metadata.degraded &&
    !metadata.fallbackStrategy &&
    !metadata.upstreamError &&
    sources.length === 0 &&
    relatedImages.length === 0 &&
    !feedbackSummary
  ) {
    return undefined
  }

  return {
    degraded: metadata.degraded,
    fallbackStrategy: metadata.fallbackStrategy,
    upstreamError: metadata.upstreamError,
    sources,
    relatedImages,
    feedbackSummary,
  }
}

interface BackendDocumentItem {
  id: string
  name: string
  sizeLabel: string
  uploadedAt: string
  status: 'indexed' | 'ready' | 'processing'
  contentPreview?: string
  isFaqCollection?: boolean
  isDefaultFaqCollection?: boolean
}

interface BackendKnowledgeBase {
  id: string
  name: string
  description: string
  documents: BackendDocumentItem[]
  createdAt: string
}

interface KnowledgeBaseListResponse {
  items: BackendKnowledgeBase[]
}

interface ConfigResponse {
  chat: ChatConfig
  embedding: EmbeddingConfig
  ui: UIConfig
}

interface BackendConversationListItem {
  id: string
  title: string
  knowledgeBaseId: string
  documentId: string
  createdAt: string
  updatedAt: string
  messageCount: number
}

interface ConversationListResponse {
  items: BackendConversationListItem[]
}

interface BackendConversation {
  id: string
  title: string
  knowledgeBaseId: string
  documentId: string
  createdAt: string
  updatedAt: string
  messages: Array<{
    id: string
    role: 'assistant' | 'user'
    content: string
    createdAt: string
    metadata?: ChatMessageMetadata
  }>
}

interface BackendUploadTask {
  id: string
  taskType?: 'upload' | 'reindex'
  knowledgeBaseId: string
  documentId: string
  fileName: string
  fileSize: number
  fileSizeLabel: string
  status: 'processing' | 'success' | 'error' | 'canceled'
  stage: string
  progress: number
  message?: string
  error?: string
  createdAt: string
  updatedAt: string
  uploaded?: BackendDocumentItem
}

interface ReindexKnowledgeBaseResponse {
  message: string
  knowledgeBase: BackendKnowledgeBase
}
const normalizeDocument = (document: BackendDocumentItem): DocumentItem => ({
  id: document.id,
  name: document.name,
  sizeLabel: document.sizeLabel,
  uploadedAt: document.uploadedAt,
  status: document.status,
  contentPreview: document.contentPreview,
  isFaqCollection: document.isFaqCollection,
  isDefaultFaqCollection: document.isDefaultFaqCollection,
})

const normalizeKnowledgeBase = (knowledgeBase: BackendKnowledgeBase): KnowledgeBase => ({
  id: knowledgeBase.id,
  name: knowledgeBase.name,
  description: knowledgeBase.description,
  documents: (knowledgeBase.documents ?? []).map(normalizeDocument),
  createdAt: knowledgeBase.createdAt,
})

const isDegradedFallbackContent = (content: string): boolean => {
  const normalized = content.trim()
  return (
    normalized.startsWith('⚠️ 当前回复服务暂时不可用') ||
    normalized.startsWith('⚠️ AI 模型调用失败') ||
    normalized.startsWith('⚠ 当前回答为降级回复') ||
    normalized.includes('模型或检索链路出现异常')
  )
}

const normalizeConversation = (conversation: BackendConversation): Conversation => ({
  id: conversation.id,
  title: conversation.title,
  knowledgeBaseId: conversation.knowledgeBaseId ?? '',
  documentId: conversation.documentId ?? '',
  createdAt: conversation.createdAt,
  updatedAt: conversation.updatedAt,
  messages: (conversation.messages ?? []).map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.createdAt,
    metadata: normalizeChatMessageMetadata(message.metadata),
  })),
})

const resolveKnowledgeBaseHint = (knowledgeBaseName?: string | null) =>
  knowledgeBaseName?.trim()
    ? `当前会话已关联知识库「${knowledgeBaseName.trim()}」，可以直接提问。`
    : '请先新建会话并选择要使用的知识库。'

const buildWelcomeMessage = (welcomeMessageTemplate?: string, knowledgeBaseName?: string | null) => {
  const normalizedTemplate = welcomeMessageTemplate?.trim() || DEFAULT_WELCOME_MESSAGE_TEMPLATE
  const trimmedKnowledgeBaseName = knowledgeBaseName?.trim() ?? ''

  return normalizedTemplate
    .replace(/\{knowledgeBaseName\}/g, trimmedKnowledgeBaseName)
    .replace(/\{knowledgeBaseHint\}/g, resolveKnowledgeBaseHint(knowledgeBaseName))
}

const findPreviousUserQuestion = (messages: ChatMessage[], targetIndex: number): string => {
  for (let cursor = targetIndex - 1; cursor >= 0; cursor -= 1) {
    if (messages[cursor]?.role === 'user') {
      return messages[cursor]?.content?.trim() ?? ''
    }
  }
  return ''
}

const createWelcomeConversation = (options?: {
  knowledgeBaseId?: string
  documentId?: string
  knowledgeBaseName?: string | null
  welcomeMessageTemplate?: string
}): Conversation => {
  const now = new Date().toISOString()

  return {
    id: createId(),
    title: '新的对话',
    knowledgeBaseId: options?.knowledgeBaseId ?? '',
    documentId: options?.documentId ?? '',
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        id: createId(),
        role: 'assistant',
        content: buildWelcomeMessage(options?.welcomeMessageTemplate, options?.knowledgeBaseName),
        timestamp: now,
      },
    ],
  }
}

const isConversationLocalOnly = (conversation: Conversation) =>
  conversation.messages.length > 0 &&
  !conversation.messages.some((message) => message.role === 'user')

const extractErrorMessage = async (response: Response) => {
  try {
    const errorBody = (await response.json()) as ApiErrorResponse
    return errorBody.error || '请求失败'
  } catch {
    return '请求失败'
  }
}

const formatUploadFileSize = (size: number) => {
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

const extractXHRErrorMessage = (xhr: XMLHttpRequest) => {
  if (xhr.status === 413) {
    return '上传文件过大，请调大前置 Nginx / 网关的 client_max_body_size 限制（项目内置前端 Nginx 默认已放宽到 5g），然后重试。'
  }

  try {
    const payload = JSON.parse(xhr.responseText) as ApiErrorResponse
    return payload.error || `请求失败：${xhr.status}`
  } catch {
    return `请求失败：${xhr.status}`
  }
}

const UPLOAD_TRANSPORT_PROGRESS_WEIGHT = 35
const UPLOAD_PROCESS_PROGRESS_WEIGHT = 100 - UPLOAD_TRANSPORT_PROGRESS_WEIGHT
const UPLOAD_PROGRESS_UPDATE_INTERVAL_MS = 160

const clampProgress = (progress: number) =>
  Math.max(0, Math.min(100, Math.round(progress)))

const mapTransportProgress = (progress: number) =>
  clampProgress((Math.max(0, Math.min(100, progress)) / 100) * UPLOAD_TRANSPORT_PROGRESS_WEIGHT)

const mapBackendTaskProgress = (progress: number) =>
  clampProgress(
    UPLOAD_TRANSPORT_PROGRESS_WEIGHT +
      (Math.max(0, Math.min(100, progress)) / 100) * UPLOAD_PROCESS_PROGRESS_WEIGHT,
  )

const resolveUploadStageLabel = (stage?: string) => {
  switch (stage) {
    case 'uploaded':
      return '文件已上传，等待开始解析'
    case 'queued':
      return '任务已创建，准备开始解析'
    case 'extracting_content':
      return '开始解析文档正文、提取图片并处理 OCR'
    case 'preparing_index_text':
      return '正在整理正文、图片说明与 OCR 文本'
    case 'chunking':
      return '正在切分文档内容'
    case 'embedding':
      return '正在生成向量并准备入库'
    case 'indexing':
      return '正在写入向量索引'
    case 'finalizing':
      return '正在保存文档状态'
    case 'completed':
      return '文档处理完成，已可用于检索'
    case 'canceled':
      return '上传任务已取消'
    case 'failed':
      return '文档处理失败'
    default:
      return '服务端正在处理文档'
  }
}

const normalizeUploadTaskStatus = (task: BackendUploadTask): UploadTask['status'] => {
  if (task.status === 'success' || task.status === 'error' || task.status === 'canceled') {
    return task.status
  }
  if (task.stage === 'uploaded' || task.stage === 'queued') {
    return 'queued'
  }
  return 'processing'
}

const normalizeUploadTaskFromBackend = (
  task: BackendUploadTask,
): Partial<UploadTask> => ({
  backendTaskId: task.id,
  taskType: task.taskType ?? 'upload',
  fileName: task.fileName,
  sizeBytes: Math.max(1, task.fileSize || 0),
  sizeLabel: task.fileSizeLabel || '—',
  status: normalizeUploadTaskStatus(task),
  progress: mapBackendTaskProgress(task.progress),
  networkProgress: 100,
  stage: task.stage,
  detail: task.message || resolveUploadStageLabel(task.stage),
  uploadedDocumentId: task.uploaded?.id ?? task.documentId,
  targetDocumentId: task.documentId,
  error:
    task.status === 'error'
      ? task.error || task.message || '文档处理失败'
      : task.status === 'canceled'
        ? task.error || task.message || '处理任务已取消'
        : undefined,
})

const uploadKnowledgeBaseDocument = (
  knowledgeBaseId: string,
  file: File,
  onProgress: (progress: number) => void,
  onRequestCreated?: (xhr: XMLHttpRequest) => void,
) =>
  new Promise<BackendUploadTask>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE_PATH}/api/knowledge-bases/${knowledgeBaseId}/document-uploads`)
    onRequestCreated?.(xhr)

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) {
        return
      }
      onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
    }

    xhr.onerror = () => reject(new Error('网络异常，上传失败'))
    xhr.onabort = () => {
      const abortError = new Error('UPLOAD_ABORTED')
      abortError.name = 'UploadAbortError'
      reject(abortError)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as BackendUploadTask)
        } catch {
          reject(new Error('上传成功，但任务响应解析失败'))
        }
        return
      }
      reject(new Error(extractXHRErrorMessage(xhr)))
    }

    const formData = new FormData()
    formData.append('file', file)
    xhr.send(formData)
  })

type AppNoticeTone = 'info' | 'success' | 'error'
type AppConfirmTone = 'primary' | 'danger'

interface AppNoticeState {
  id: string
  tone: AppNoticeTone
  message: string
}

interface AppConfirmState {
  id: string
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  tone: AppConfirmTone
  onConfirm: () => void | Promise<void>
}

const startDocumentReindexTask = async (
  knowledgeBaseId: string,
  documentId: string,
) => {
  const response = await fetch(
    `${API_BASE_PATH}/api/knowledge-bases/${knowledgeBaseId}/documents/${documentId}/reindex-task`,
    {
      method: 'POST',
    },
  )
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response))
  }
  return (await response.json()) as BackendUploadTask
}

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [streamingConversationId, setStreamingConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const initialConversation = createWelcomeConversation({ welcomeMessageTemplate: DEFAULT_WELCOME_MESSAGE_TEMPLATE })
    return [initialConversation]
  })
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState<string | null>(null)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [isCreateConversationModalOpen, setIsCreateConversationModalOpen] = useState(false)
  const [pendingConversationKnowledgeBaseId, setPendingConversationKnowledgeBaseId] = useState<string>('')
  const [isSwitchingConversationKnowledgeBase, setIsSwitchingConversationKnowledgeBase] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isKnowledgePanelOpen, setIsKnowledgePanelOpen] = useState(false)
  const [config, setConfig] = useState<AppConfig>(() => cloneAppConfig(recommendedConfig))
  const [isSavingConfig, setIsSavingConfig] = useState(false)
  const [configSaveError, setConfigSaveError] = useState<string | null>(null)
  const [configSaveSuccess, setConfigSaveSuccess] = useState<string | null>(null)
  const [appNotice, setAppNotice] = useState<AppNoticeState | null>(null)
  const [appConfirm, setAppConfirm] = useState<AppConfirmState | null>(null)
  const [reindexingKnowledgeBaseId, setReindexingKnowledgeBaseId] = useState<string | null>(null)
  const [reindexingDocumentKeys, setReindexingDocumentKeys] = useState<Record<string, true>>({})
  const [uploadTasksByKnowledgeBase, setUploadTasksByKnowledgeBase] = useState<Record<string, UploadTask[]>>({})
  const uploadTaskFilesRef = useRef<Record<string, File>>({})
  const uploadTaskXhrRef = useRef<Record<string, XMLHttpRequest>>({})
  const uploadTaskPollTimerRef = useRef<Record<string, number>>({})
  const uploadTasksByKnowledgeBaseRef = useRef<Record<string, UploadTask[]>>({})
  const canceledUploadTaskIdsRef = useRef<Set<string>>(new Set())
  const uploadTaskProgressSnapshotRef = useRef<Record<string, { networkProgress: number; progress: number; updatedAt: number }>>({})
  const appNoticeTimerRef = useRef<number | null>(null)

  const clearAppNotice = useCallback(() => {
    if (appNoticeTimerRef.current) {
      window.clearTimeout(appNoticeTimerRef.current)
      appNoticeTimerRef.current = null
    }
    setAppNotice(null)
  }, [])

  const clearAppConfirm = useCallback(() => {
    setAppConfirm(null)
  }, [])

  const requestAppConfirm = useCallback((payload: Omit<AppConfirmState, 'id'>) => {
    setAppConfirm({
      id: createId(),
      ...payload,
    })
  }, [])

  const handleConfirmAppAction = useCallback(async () => {
    if (!appConfirm) {
      return
    }

    const currentConfirm = appConfirm
    setAppConfirm(null)
    await currentConfirm.onConfirm()
  }, [appConfirm])

  const showAppNotice = useCallback((message: string, tone: AppNoticeTone = 'info') => {
    if (appNoticeTimerRef.current) {
      window.clearTimeout(appNoticeTimerRef.current)
    }

    setAppNotice({
      id: createId(),
      tone,
      message,
    })

    appNoticeTimerRef.current = window.setTimeout(() => {
      setAppNotice((current) => (current?.message === message ? null : current))
      appNoticeTimerRef.current = null
    }, tone === 'error' ? 5200 : 3200)
  }, [])

  useEffect(() => () => {
    if (appNoticeTimerRef.current) {
      window.clearTimeout(appNoticeTimerRef.current)
    }
  }, [])

  const markDocumentReindexing = (knowledgeBaseId: string, documentId: string) => {
    const reindexKey = `${knowledgeBaseId}:${documentId}`
    setReindexingDocumentKeys((current) =>
      current[reindexKey] ? current : { ...current, [reindexKey]: true },
    )
  }

  const clearDocumentReindexing = (knowledgeBaseId: string, documentId: string) => {
    const reindexKey = `${knowledgeBaseId}:${documentId}`
    setReindexingDocumentKeys((current) => {
      if (!current[reindexKey]) {
        return current
      }
      const next = { ...current }
      delete next[reindexKey]
      return next
    })
  }

  const isTaskActive = (status: UploadTask['status']) =>
    status === 'queued' || status === 'uploading' || status === 'processing'


  const loadConversationDetail = async (conversationId: string): Promise<Conversation> => {
    const response = await fetch(`${API_BASE_PATH}/api/conversations/${conversationId}`)
    if (!response.ok) {
      throw new Error(await extractErrorMessage(response))
    }

    return normalizeConversation((await response.json()) as BackendConversation)
  }

  const saveConversationSnapshot = async (conversation: Conversation) => {
    const response = await fetch(`${API_BASE_PATH}/api/conversations/${conversation.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: conversation.id,
        title: conversation.title,
        knowledgeBaseId: conversation.knowledgeBaseId,
        documentId: conversation.documentId,
        messages: conversation.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.timestamp,
          metadata: normalizeChatMessageMetadata(message.metadata),
        })),
      }),
    })

    if (!response.ok) {
      throw new Error(await extractErrorMessage(response))
    }

    return normalizeConversation((await response.json()) as BackendConversation)
  }

  const activeConversation = useMemo(
    () =>
      conversations.find((conversation) => conversation.id === activeConversationId) ??
      conversations[0],
    [activeConversationId, conversations],
  )

  const selectedKnowledgeBase = useMemo(() => {
    const fallbackKnowledgeBase = knowledgeBases[0] ?? null

    return (
      knowledgeBases.find(
        (knowledgeBase) => knowledgeBase.id === selectedKnowledgeBaseId,
      ) ?? fallbackKnowledgeBase
    )
  }, [knowledgeBases, selectedKnowledgeBaseId])

  const activeConversationKnowledgeBase = useMemo(() => {
    if (!activeConversation?.knowledgeBaseId) {
      return null
    }

    return (
      knowledgeBases.find(
        (knowledgeBase) => knowledgeBase.id === activeConversation.knowledgeBaseId,
      ) ?? null
    )
  }, [activeConversation?.knowledgeBaseId, knowledgeBases])

  const activeConversationDocument = useMemo(() => {
    if (!activeConversationKnowledgeBase || !activeConversation?.documentId) {
      return null
    }

    return (
      activeConversationKnowledgeBase.documents.find(
        (document) => document.id === activeConversation.documentId,
      ) ?? null
    )
  }, [activeConversation?.documentId, activeConversationKnowledgeBase])

  useEffect(() => {
    uploadTasksByKnowledgeBaseRef.current = uploadTasksByKnowledgeBase
  }, [uploadTasksByKnowledgeBase])

  useEffect(() => () => {
    Object.values(uploadTaskPollTimerRef.current).forEach((timer) => {
      window.clearTimeout(timer)
    })
    Object.values(uploadTaskXhrRef.current).forEach((xhr) => {
      try {
        xhr.abort()
      } catch {
        // ignore abort errors during cleanup
      }
    })
  }, [])

  useEffect(() => {
    const bootstrapApp = async () => {
      try {
        const [knowledgeBaseResponse, configResponse, conversationsResponse] = await Promise.all([
          fetch(`${API_BASE_PATH}/api/knowledge-bases`),
          fetch(`${API_BASE_PATH}/api/config`),
          fetch(`${API_BASE_PATH}/api/conversations`),
        ])

        if (!knowledgeBaseResponse.ok) {
          throw new Error(await extractErrorMessage(knowledgeBaseResponse))
        }

        if (!configResponse.ok) {
          throw new Error(await extractErrorMessage(configResponse))
        }

        if (!conversationsResponse.ok) {
          throw new Error(await extractErrorMessage(conversationsResponse))
        }

        const knowledgeBaseData =
          (await knowledgeBaseResponse.json()) as KnowledgeBaseListResponse
        const configData = (await configResponse.json()) as ConfigResponse
        const conversationsData =
          (await conversationsResponse.json()) as ConversationListResponse
        const nextKnowledgeBases = knowledgeBaseData.items.map(normalizeKnowledgeBase)

        setKnowledgeBases(nextKnowledgeBases)
        setConfig(cloneAppConfig(configData))
        setSelectedKnowledgeBaseId((current) => current ?? nextKnowledgeBases[0]?.id ?? null)
        setSelectedDocumentId(null)

        const conversationItems = conversationsData.items ?? []
        if (conversationItems.length > 0) {
          const firstConversationId = conversationItems[0].id
          const firstConversationResponse = await fetch(
            `${API_BASE_PATH}/api/conversations/${firstConversationId}`,
          )
          if (!firstConversationResponse.ok) {
            throw new Error(await extractErrorMessage(firstConversationResponse))
          }
          const firstConversation = normalizeConversation(
            (await firstConversationResponse.json()) as BackendConversation,
          )
          const restConversations = conversationItems.slice(1).map((conversation) => ({
            id: conversation.id,
            title: conversation.title,
            knowledgeBaseId: conversation.knowledgeBaseId ?? '',
            documentId: conversation.documentId ?? '',
            createdAt: conversation.createdAt,
            updatedAt: conversation.updatedAt,
            messages: [],
          }))
          setConversations([firstConversation, ...restConversations])
          setActiveConversationId(firstConversation.id)
          setSelectedKnowledgeBaseId((firstConversation.knowledgeBaseId || nextKnowledgeBases[0]?.id) ?? null)
          setSelectedDocumentId(firstConversation.documentId || null)
        } else {
          const fallbackKnowledgeBase = nextKnowledgeBases[0] ?? null
          const initialConversation = createWelcomeConversation({
            knowledgeBaseId: fallbackKnowledgeBase?.id ?? '',
            knowledgeBaseName: fallbackKnowledgeBase?.name ?? null,
            welcomeMessageTemplate: cloneAppConfig(configData).ui.welcomeMessageTemplate,
          })
          setConversations([initialConversation])
          setActiveConversationId(initialConversation.id)
          setSelectedKnowledgeBaseId(fallbackKnowledgeBase?.id ?? null)
          setSelectedDocumentId(null)
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '初始化知识库失败，请检查后端服务。'

        setConversations((prev) =>
          prev.map((conversation, index) =>
            index === 0
              ? {
                  ...conversation,
                  messages: [
                    ...conversation.messages,
                    {
                      id: createId(),
                      role: 'assistant',
                      content: `知识库初始化失败：${message}`,
                      timestamp: new Date().toISOString(),
                    },
                  ],
                }
              : conversation,
          ),
        )
      }
    }

    void bootstrapApp()
  }, [])

  const handleCreateConversation = () => {
    if (knowledgeBases.length === 0) {
      showAppNotice('当前还没有可用知识库，请先创建知识库。', 'info')
      return
    }

    setPendingConversationKnowledgeBaseId(
      selectedKnowledgeBaseId ?? activeConversation?.knowledgeBaseId ?? knowledgeBases[0]?.id ?? '',
    )
    setIsCreateConversationModalOpen(true)
  }

  const handleConfirmCreateConversation = () => {
    const targetKnowledgeBase =
      knowledgeBases.find((knowledgeBase) => knowledgeBase.id === pendingConversationKnowledgeBaseId) ??
      knowledgeBases[0]

    if (!targetKnowledgeBase) {
      showAppNotice('当前还没有可用知识库，请先创建知识库。', 'info')
      return
    }

    const conversation = createWelcomeConversation({
      knowledgeBaseId: targetKnowledgeBase.id,
      knowledgeBaseName: targetKnowledgeBase.name,
      welcomeMessageTemplate: config.ui.welcomeMessageTemplate,
    })

    setConversations((prev) => [conversation, ...prev])
    setActiveConversationId(conversation.id)
    setSelectedKnowledgeBaseId(targetKnowledgeBase.id)
    setSelectedDocumentId(null)
    setIsCreateConversationModalOpen(false)
  }

  const handleChangeConversationKnowledgeBase = async (knowledgeBaseId: string) => {
    if (!activeConversation) {
      return
    }

    const targetKnowledgeBase = knowledgeBases.find(
      (knowledgeBase) => knowledgeBase.id === knowledgeBaseId,
    )

    if (!targetKnowledgeBase) {
      showAppNotice('目标知识库已经不可用，请刷新后再试。', 'error')
      return
    }

    if (activeConversation.knowledgeBaseId === targetKnowledgeBase.id) {
      setSelectedKnowledgeBaseId(targetKnowledgeBase.id)
      setSelectedDocumentId(null)
      return
    }

    const nextTimestamp = new Date().toISOString()
    const nextMessages =
      isConversationLocalOnly(activeConversation) &&
      activeConversation.messages.length === 1 &&
      activeConversation.messages[0]?.role === 'assistant'
        ? [
            {
              ...activeConversation.messages[0],
              content: buildWelcomeMessage(config.ui.welcomeMessageTemplate, targetKnowledgeBase.name),
              timestamp: nextTimestamp,
            },
          ]
        : activeConversation.messages

    const nextConversation: Conversation = {
      ...activeConversation,
      knowledgeBaseId: targetKnowledgeBase.id,
      documentId: '',
      messages: nextMessages,
      updatedAt: nextTimestamp,
    }

    const previousConversation = activeConversation

    setIsSwitchingConversationKnowledgeBase(true)
    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === activeConversation.id ? nextConversation : conversation,
      ),
    )
    setSelectedKnowledgeBaseId(targetKnowledgeBase.id)
    setSelectedDocumentId(null)

    try {
      const savedConversation = await saveConversationSnapshot(nextConversation)
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === savedConversation.id ? savedConversation : conversation,
        ),
      )
      setSelectedKnowledgeBaseId(savedConversation.knowledgeBaseId || null)
      setSelectedDocumentId(savedConversation.documentId || null)
    } catch (error) {
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === previousConversation.id ? previousConversation : conversation,
        ),
      )
      setSelectedKnowledgeBaseId(previousConversation.knowledgeBaseId || null)
      setSelectedDocumentId(previousConversation.documentId || null)
      const message =
        error instanceof Error ? error.message : '切换会话知识库失败，请稍后重试。'
      showAppNotice(`切换会话知识库失败：${message}`, 'error')
    } finally {
      setIsSwitchingConversationKnowledgeBase(false)
    }
  }

  const handleSelectConversation = async (conversationId: string) => {
    const existingConversation = conversations.find((conversation) => conversation.id === conversationId)
    if (existingConversation && existingConversation.messages.length > 0) {
      setActiveConversationId(conversationId)
      setSelectedKnowledgeBaseId(existingConversation.knowledgeBaseId || null)
      setSelectedDocumentId(existingConversation.documentId || null)
      return
    }

    try {
      const loadedConversation = await loadConversationDetail(conversationId)
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId ? loadedConversation : conversation,
        ),
      )
      setActiveConversationId(conversationId)
      setSelectedKnowledgeBaseId(loadedConversation.knowledgeBaseId || null)
      setSelectedDocumentId(loadedConversation.documentId || null)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '加载会话失败，请稍后重试。'
      showAppNotice(`加载会话失败：${message}`, 'error')
    }
  }

  const handleRenameConversation = async (conversationId: string, title: string) => {
    const nextTitle = title.trim()
    if (!nextTitle) {
      return
    }

    const targetConversation = conversations.find((conversation) => conversation.id === conversationId)
    if (!targetConversation) {
      return
    }

    const isLocalOnly = isConversationLocalOnly(targetConversation)

    if (isLocalOnly) {
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                title: nextTitle,
                updatedAt: new Date().toISOString(),
              }
            : conversation,
        ),
      )
      return
    }

    try {
      const fullConversation =
        targetConversation.messages.length > 0
          ? targetConversation
          : await loadConversationDetail(conversationId)

      const response = await fetch(`${API_BASE_PATH}/api/conversations/${conversationId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: fullConversation.id,
          title: nextTitle,
          knowledgeBaseId: fullConversation.knowledgeBaseId,
          documentId: fullConversation.documentId,
          messages: fullConversation.messages.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            createdAt: message.timestamp,
            metadata: normalizeChatMessageMetadata(message.metadata),
          })),
        }),
      })

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response))
      }

      const updatedConversation = normalizeConversation((await response.json()) as BackendConversation)
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId
            ? conversation.messages.length > 0
              ? updatedConversation
              : { ...updatedConversation, messages: [] }
            : conversation,
        ),
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '重命名会话失败，请稍后重试。'
      showAppNotice(`重命名会话失败：${message}`, 'error')
    }
  }

  const handleDeleteConversation = async (conversationId: string) => {
    const targetConversation = conversations.find((conversation) => conversation.id === conversationId)
    if (!targetConversation) {
      return
    }

    const isLocalOnly = isConversationLocalOnly(targetConversation)

    try {
      if (!isLocalOnly) {
        const response = await fetch(`${API_BASE_PATH}/api/conversations/${conversationId}`, {
          method: 'DELETE',
        })

        if (!response.ok) {
          throw new Error(await extractErrorMessage(response))
        }
      }

      const remainingConversations = conversations.filter(
        (conversation) => conversation.id !== conversationId,
      )
      const fallbackConversation =
        remainingConversations[0] ??
        (() => {
          const fallbackKnowledgeBase =
            knowledgeBases.find((knowledgeBase) => knowledgeBase.id === selectedKnowledgeBaseId) ??
            knowledgeBases[0] ??
            null
          const conversation = createWelcomeConversation({
            knowledgeBaseId: fallbackKnowledgeBase?.id ?? '',
            knowledgeBaseName: fallbackKnowledgeBase?.name ?? null,
            welcomeMessageTemplate: config.ui.welcomeMessageTemplate,
          })
          return conversation
        })()

      setConversations(
        remainingConversations.length > 0 ? remainingConversations : [fallbackConversation],
      )

      if (activeConversationId === conversationId) {
        setActiveConversationId(fallbackConversation.id)
        setSelectedKnowledgeBaseId(fallbackConversation.knowledgeBaseId || null)
        setSelectedDocumentId(fallbackConversation.documentId || null)
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '删除会话失败，请稍后重试。'
      showAppNotice(`删除会话失败：${message}`, 'error')
    }
  }

  const handleRequestDeleteConversation = useCallback((conversation: Conversation) => {
    requestAppConfirm({
      title: '删除会话',
      description: `确定删除会话“${conversation.title}”吗？删除后当前会话消息会一起移除。`,
      confirmLabel: '删除会话',
      cancelLabel: '保留会话',
      tone: 'danger',
      onConfirm: () => handleDeleteConversation(conversation.id),
    })
  }, [requestAppConfirm, handleDeleteConversation])

  const handleClearConversation = () => {
    if (!activeConversation) {
      return
    }

    const resetMessage: ChatMessage = {
      id: createId(),
      role: 'assistant',
      content: activeConversationKnowledgeBase
        ? `当前会话已清空，已保留知识库「${activeConversationKnowledgeBase.name}」。你可以继续发起新的提问。`
        : '当前会话已清空。你可以继续发起新的提问。',
      timestamp: new Date().toISOString(),
    }

    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === activeConversation.id
          ? {
              ...conversation,
              title: '新的对话',
              messages: [resetMessage],
              updatedAt: resetMessage.timestamp,
            }
          : conversation,
      ),
    )
  }

  const handleCreateKnowledgeBase = async (name: string, description: string) => {
    try {
      const response = await fetch(`${API_BASE_PATH}/api/knowledge-bases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, description }),
      })

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response))
      }

      const createdKnowledgeBase = normalizeKnowledgeBase(
        (await response.json()) as BackendKnowledgeBase,
      )

      setKnowledgeBases((prev) => [createdKnowledgeBase, ...prev])
      setSelectedKnowledgeBaseId(createdKnowledgeBase.id)
      setSelectedDocumentId(null)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '创建知识库失败，请稍后重试。'
      showAppNotice(`创建知识库失败：${message}`, 'error')
    }
  }

  const handleDeleteKnowledgeBase = async (knowledgeBaseId: string) => {
    try {
      const response = await fetch(`${API_BASE_PATH}/api/knowledge-bases/${knowledgeBaseId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response))
      }

      setKnowledgeBases((prev) => {
        const nextKnowledgeBases = prev.filter(
          (knowledgeBase) => knowledgeBase.id !== knowledgeBaseId,
        )

        if (selectedKnowledgeBaseId === knowledgeBaseId) {
          setSelectedKnowledgeBaseId(nextKnowledgeBases[0]?.id ?? null)
          setSelectedDocumentId(null)
        }

        return nextKnowledgeBases
      })
      setUploadTasksByKnowledgeBase((prev) => {
        ;(prev[knowledgeBaseId] ?? []).forEach((task) => {
          stopPollingUploadTask(task.id)
          delete uploadTaskFilesRef.current[task.id]
          delete uploadTaskXhrRef.current[task.id]
          delete uploadTaskProgressSnapshotRef.current[task.id]
          canceledUploadTaskIdsRef.current.delete(task.id)
        })
        const next = { ...prev }
        delete next[knowledgeBaseId]
        uploadTasksByKnowledgeBaseRef.current = next
        return next
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '删除知识库失败，请稍后重试。'
      showAppNotice(`删除知识库失败：${message}`, 'error')
    }
  }

  const handleSelectKnowledgeBase = (knowledgeBaseId: string) => {
    setSelectedKnowledgeBaseId(knowledgeBaseId)
    setSelectedDocumentId(null)
  }

  const handleSelectDocument = (
    knowledgeBaseId: string,
    documentId: string | null,
  ) => {
    setSelectedKnowledgeBaseId(knowledgeBaseId)
    setSelectedDocumentId(documentId)
  }

  const updateUploadTask = (
    knowledgeBaseId: string,
    taskId: string,
    patch: Partial<UploadTask>,
  ) => {
    setUploadTasksByKnowledgeBase((prev) => {
      const currentTasks = prev[knowledgeBaseId] ?? []
      let hasChanged = false
      const nextTasks = currentTasks.map((task) => {
        if (task.id !== taskId) {
          return task
        }

        const isSamePatch = Object.entries(patch).every(([key, value]) => task[key as keyof UploadTask] === value)
        if (isSamePatch) {
          return task
        }

        hasChanged = true
        return { ...task, ...patch }
      })

      if (!hasChanged) {
        return prev
      }

      const next = {
        ...prev,
        [knowledgeBaseId]: nextTasks,
      }
      uploadTasksByKnowledgeBaseRef.current = next
      return next
    })
  }

  const updateUploadTransportProgress = (
    knowledgeBaseId: string,
    taskId: string,
    networkProgress: number,
  ) => {
    const progress = mapTransportProgress(networkProgress)
    const now = Date.now()
    const snapshot = uploadTaskProgressSnapshotRef.current[taskId]

    const shouldFlush =
      !snapshot ||
      networkProgress >= 100 ||
      networkProgress <= snapshot.networkProgress ||
      Math.abs(networkProgress - snapshot.networkProgress) >= 2 ||
      progress !== snapshot.progress ||
      now - snapshot.updatedAt >= UPLOAD_PROGRESS_UPDATE_INTERVAL_MS

    if (!shouldFlush) {
      return
    }

    uploadTaskProgressSnapshotRef.current[taskId] = {
      networkProgress,
      progress,
      updatedAt: now,
    }

    updateUploadTask(knowledgeBaseId, taskId, {
      status: 'uploading',
      networkProgress,
      progress,
      stage: 'uploading',
      detail: `正在上传文件到服务器（${networkProgress}%）`,
      error: undefined,
    })
  }

  function stopPollingUploadTask(taskId: string) {
    const timer = uploadTaskPollTimerRef.current[taskId]
    if (typeof timer === 'number') {
      window.clearTimeout(timer)
      delete uploadTaskPollTimerRef.current[taskId]
    }
  }

  function upsertDocumentItem(knowledgeBaseId: string, normalizedDocument: DocumentItem) {
    setKnowledgeBases((prev) =>
      prev.map((knowledgeBase) =>
        knowledgeBase.id === knowledgeBaseId
          ? {
              ...knowledgeBase,
              documents: [
                normalizedDocument,
                ...knowledgeBase.documents.filter((item) => item.id !== normalizedDocument.id),
              ],
            }
          : knowledgeBase,
      ),
    )
    return normalizedDocument
  }

  function upsertUploadedDocument(knowledgeBaseId: string, document: BackendDocumentItem) {
    return upsertDocumentItem(knowledgeBaseId, normalizeDocument(document))
  }

  function applyBackendUploadTask(
    knowledgeBaseId: string,
    taskId: string,
    backendTask: BackendUploadTask,
  ) {
    const currentTask = uploadTasksByKnowledgeBaseRef.current[knowledgeBaseId]?.find(
      (item) => item.id === taskId,
    )
    updateUploadTask(knowledgeBaseId, taskId, normalizeUploadTaskFromBackend(backendTask))

    if (backendTask.uploaded) {
      const uploadedDocument = upsertUploadedDocument(knowledgeBaseId, backendTask.uploaded)
      if (backendTask.status === 'success' && currentTask?.shouldAutoSelect) {
        setSelectedKnowledgeBaseId(knowledgeBaseId)
        setSelectedDocumentId(uploadedDocument.id)
      }
    } else if (
      (backendTask.status === 'error' || backendTask.status === 'canceled') &&
      currentTask?.taskType === 'reindex' &&
      currentTask.rollbackDocument
    ) {
      upsertDocumentItem(knowledgeBaseId, currentTask.rollbackDocument)
    }

    if (backendTask.status === 'success') {
      delete uploadTaskFilesRef.current[taskId]
      delete uploadTaskProgressSnapshotRef.current[taskId]
      canceledUploadTaskIdsRef.current.delete(taskId)
      updateUploadTask(knowledgeBaseId, taskId, { rollbackDocument: undefined })
    }

    if (currentTask?.taskType === 'reindex' && currentTask.targetDocumentId && (backendTask.status === 'success' || backendTask.status === 'error' || backendTask.status === 'canceled')) {
      clearDocumentReindexing(knowledgeBaseId, currentTask.targetDocumentId)
    }

    if (
      backendTask.status === 'success' ||
      backendTask.status === 'error' ||
      backendTask.status === 'canceled'
    ) {
      stopPollingUploadTask(taskId)
      delete uploadTaskXhrRef.current[taskId]
      delete uploadTaskProgressSnapshotRef.current[taskId]
    }
  }

  function scheduleUploadTaskPoll(
    knowledgeBaseId: string,
    taskId: string,
    backendTaskId: string,
    delayMs = 900,
  ) {
    stopPollingUploadTask(taskId)
    uploadTaskPollTimerRef.current[taskId] = window.setTimeout(() => {
      void pollUploadTask(knowledgeBaseId, taskId, backendTaskId)
    }, delayMs)
  }

  async function pollUploadTask(
    knowledgeBaseId: string,
    taskId: string,
    backendTaskId: string,
  ) {
    if (canceledUploadTaskIdsRef.current.has(taskId)) {
      stopPollingUploadTask(taskId)
      return
    }

    try {
      const response = await fetch(
        `${API_BASE_PATH}/api/knowledge-bases/${knowledgeBaseId}/document-uploads/${backendTaskId}`,
      )
      if (!response.ok) {
        throw new Error(await extractErrorMessage(response))
      }

      const backendTask = (await response.json()) as BackendUploadTask
      applyBackendUploadTask(knowledgeBaseId, taskId, backendTask)

      if (backendTask.status === 'processing') {
        scheduleUploadTaskPoll(knowledgeBaseId, taskId, backendTaskId)
      }
    } catch (error) {
      if (canceledUploadTaskIdsRef.current.has(taskId)) {
        stopPollingUploadTask(taskId)
        return
      }

      const message =
        error instanceof Error ? error.message : '任务状态查询失败，正在自动重试。'
      updateUploadTask(knowledgeBaseId, taskId, {
        status: 'processing',
        detail: `任务状态查询失败，正在重试：${message}`,
      })
      scheduleUploadTaskPoll(knowledgeBaseId, taskId, backendTaskId, 1800)
    }
  }

  const clearFinishedUploadTasks = (knowledgeBaseId: string) => {
    setUploadTasksByKnowledgeBase((prev) => {
      const removableTasks = (prev[knowledgeBaseId] ?? []).filter(
        (task) => task.status === 'success' || task.status === 'canceled',
      )
      removableTasks.forEach((task) => {
        stopPollingUploadTask(task.id)
        delete uploadTaskFilesRef.current[task.id]
        delete uploadTaskXhrRef.current[task.id]
        delete uploadTaskProgressSnapshotRef.current[task.id]
        canceledUploadTaskIdsRef.current.delete(task.id)
      })
      const next = {
        ...prev,
        [knowledgeBaseId]: (prev[knowledgeBaseId] ?? []).filter(
          (task) => task.status !== 'success' && task.status !== 'canceled',
        ),
      }
      uploadTasksByKnowledgeBaseRef.current = next
      return next
    })
  }

  const runUploadTask = async (task: UploadTask, file: File) => {
    stopPollingUploadTask(task.id)
    delete uploadTaskProgressSnapshotRef.current[task.id]

    if (canceledUploadTaskIdsRef.current.has(task.id)) {
      updateUploadTask(task.knowledgeBaseId, task.id, {
        status: 'canceled',
        stage: 'canceled',
        detail: '上传任务已取消',
        error: '上传任务已取消',
      })
      return
    }

    updateUploadTask(task.knowledgeBaseId, task.id, {
      status: 'uploading',
      progress: 0,
      networkProgress: 0,
      backendTaskId: undefined,
      stage: 'uploading',
      detail: '正在上传文件到服务器',
      uploadedDocumentId: undefined,
      error: undefined,
    })

    try {
      const backendTask = await uploadKnowledgeBaseDocument(
        task.knowledgeBaseId,
        file,
        (networkProgress) => {
          updateUploadTransportProgress(task.knowledgeBaseId, task.id, networkProgress)
        },
        (xhr) => {
          uploadTaskXhrRef.current[task.id] = xhr
        },
      )

      delete uploadTaskXhrRef.current[task.id]
      applyBackendUploadTask(task.knowledgeBaseId, task.id, backendTask)

      if (backendTask.status === 'processing') {
        scheduleUploadTaskPoll(task.knowledgeBaseId, task.id, backendTask.id, 400)
      }
    } catch (error) {
      stopPollingUploadTask(task.id)
      delete uploadTaskXhrRef.current[task.id]

      if (error instanceof Error && error.name === 'UploadAbortError') {
        updateUploadTask(task.knowledgeBaseId, task.id, {
          status: 'canceled',
          stage: 'canceled',
          detail: '上传任务已取消',
          error: '上传任务已取消',
        })
        return
      }

      const message =
        error instanceof Error ? error.message : '上传文档失败，请稍后重试。'
      updateUploadTask(task.knowledgeBaseId, task.id, {
        status: 'error',
        stage: 'failed',
        detail: '文件上传失败，未进入服务端解析阶段',
        error: message,
      })
    }
  }

  const runDocumentReindexTask = async (task: UploadTask) => {
    stopPollingUploadTask(task.id)
    delete uploadTaskProgressSnapshotRef.current[task.id]

    if (task.targetDocumentId) {
      markDocumentReindexing(task.knowledgeBaseId, task.targetDocumentId)
    }

    if (canceledUploadTaskIdsRef.current.has(task.id)) {
      updateUploadTask(task.knowledgeBaseId, task.id, {
        status: 'canceled',
        stage: 'canceled',
        detail: '重跑解析任务已取消',
        error: '重跑解析任务已取消',
      })
      return
    }

    if (!task.targetDocumentId) {
      updateUploadTask(task.knowledgeBaseId, task.id, {
        status: 'error',
        stage: 'failed',
        detail: '未找到目标文档，无法重跑解析。',
        error: '未找到目标文档，无法重跑解析。',
      })
      return
    }

    updateUploadTask(task.knowledgeBaseId, task.id, {
      taskType: 'reindex',
      status: 'processing',
      progress: 6,
      networkProgress: 100,
      backendTaskId: undefined,
      stage: 'queued',
      detail: '正在提交重跑解析任务',
      uploadedDocumentId: task.targetDocumentId,
      error: undefined,
    })

    try {
      const backendTask = await startDocumentReindexTask(task.knowledgeBaseId, task.targetDocumentId)
      applyBackendUploadTask(task.knowledgeBaseId, task.id, backendTask)

      if (canceledUploadTaskIdsRef.current.has(task.id)) {
        void fetch(
          `${API_BASE_PATH}/api/knowledge-bases/${task.knowledgeBaseId}/document-uploads/${backendTask.id}`,
          { method: 'DELETE' },
        )
          .then(async (response) => {
            if (!response.ok) {
              throw new Error(await extractErrorMessage(response))
            }
            const canceledTask = (await response.json()) as BackendUploadTask
            applyBackendUploadTask(task.knowledgeBaseId, task.id, canceledTask)
          })
          .catch((cancelError) => {
            const message = cancelError instanceof Error ? cancelError.message : '取消重跑解析任务失败。'
            updateUploadTask(task.knowledgeBaseId, task.id, {
              status: 'canceled',
              stage: 'canceled',
              detail: '取消请求已发送，但服务端确认失败',
              error: message,
            })
          })
        return
      }

      if (backendTask.status === 'processing') {
        scheduleUploadTaskPoll(task.knowledgeBaseId, task.id, backendTask.id, 400)
      }
    } catch (error) {
      stopPollingUploadTask(task.id)
      const message = error instanceof Error ? error.message : '重跑解析任务创建失败，请稍后重试。'
      updateUploadTask(task.knowledgeBaseId, task.id, {
        status: 'error',
        stage: 'failed',
        detail: '重跑解析任务创建失败',
        error: message,
      })
      if (task.rollbackDocument) {
        upsertDocumentItem(task.knowledgeBaseId, task.rollbackDocument)
      }
      if (task.targetDocumentId) {
        clearDocumentReindexing(task.knowledgeBaseId, task.targetDocumentId)
      }
    }
  }


  const hasActiveDocumentReindexTask = (knowledgeBaseId: string, documentId: string) =>
    (uploadTasksByKnowledgeBaseRef.current[knowledgeBaseId] ?? []).some(
      (task) =>
        task.taskType === 'reindex' &&
        task.targetDocumentId === documentId &&
        isTaskActive(task.status),
    )

  const enqueueDocumentReindexTasks = (
    knowledgeBaseId: string,
    documents: DocumentItem[],
    shouldAutoSelect = false,
  ) => {
    const nextDocuments = documents.filter(
      (document) => !hasActiveDocumentReindexTask(knowledgeBaseId, document.id),
    )
    if (nextDocuments.length === 0) {
      return 0
    }

    nextDocuments.forEach((document) => {
      markDocumentReindexing(knowledgeBaseId, document.id)
    })

    const targetDocumentIds = new Set(nextDocuments.map((document) => document.id))
    const tasks = nextDocuments.map((document, index) => ({
      id: createId(),
      taskType: 'reindex' as const,
      knowledgeBaseId,
      fileName: document.name,
      sizeBytes: 1,
      sizeLabel: document.sizeLabel || '—',
      progress: 0,
      networkProgress: 100,
      status: 'queued' as const,
      stage: 'queued',
      detail: '等待开始重跑解析',
      uploadedDocumentId: document.id,
      targetDocumentId: document.id,
      rollbackDocument: document,
      shouldAutoSelect: shouldAutoSelect && index === 0,
    }))

    setKnowledgeBases((prev) =>
      prev.map((knowledgeBase) =>
        knowledgeBase.id !== knowledgeBaseId
          ? knowledgeBase
          : {
              ...knowledgeBase,
              documents: knowledgeBase.documents.map((document) =>
                targetDocumentIds.has(document.id)
                  ? { ...document, status: 'processing' }
                  : document,
              ),
            },
      ),
    )

    setUploadTasksByKnowledgeBase((prev) => {
      const next = {
        ...prev,
        [knowledgeBaseId]: [...tasks, ...(prev[knowledgeBaseId] ?? [])],
      }
      uploadTasksByKnowledgeBaseRef.current = next
      return next
    })

    tasks.forEach((task) => {
      void runDocumentReindexTask(task)
    })
    return tasks.length
  }

  const handleUploadFiles = async (knowledgeBaseId: string, files: FileList | null) => {
    if (!files || files.length === 0) {
      return
    }

    const fileList = Array.from(files)
    const nextTasks = fileList.map((file, index) => ({
      id: createId(),
      taskType: 'upload' as const,
      knowledgeBaseId,
      fileName: file.name,
      sizeBytes: file.size,
      sizeLabel: formatUploadFileSize(file.size),
      progress: 0,
      networkProgress: 0,
      status: 'queued' as const,
      stage: 'queued',
      detail: '等待开始上传',
      shouldAutoSelect: index === 0,
    }))

    nextTasks.forEach((task, index) => {
      uploadTaskFilesRef.current[task.id] = fileList[index]
      canceledUploadTaskIdsRef.current.delete(task.id)
    })

    setUploadTasksByKnowledgeBase((prev) => {
      const next = {
        ...prev,
        [knowledgeBaseId]: [...nextTasks, ...(prev[knowledgeBaseId] ?? [])],
      }
      uploadTasksByKnowledgeBaseRef.current = next
      return next
    })

    setSelectedKnowledgeBaseId(knowledgeBaseId)
    setSelectedDocumentId(null)

    nextTasks.forEach((task, index) => {
      void runUploadTask(task, fileList[index])
    })
  }

  const handleCancelUploadTask = (knowledgeBaseId: string, taskId: string) => {
    canceledUploadTaskIdsRef.current.add(taskId)
    stopPollingUploadTask(taskId)

    const xhr = uploadTaskXhrRef.current[taskId]
    if (xhr) {
      xhr.abort()
      return
    }

    const task = uploadTasksByKnowledgeBaseRef.current[knowledgeBaseId]?.find(
      (item) => item.id === taskId,
    )

    updateUploadTask(knowledgeBaseId, taskId, {
      status: 'canceled',
      stage: 'canceled',
      detail: task?.backendTaskId
        ? '正在取消服务端处理任务'
        : task?.taskType === 'reindex'
          ? '正在取消重跑解析任务'
          : '上传任务已取消',
      error: task?.taskType === 'reindex' ? '重跑解析任务已取消' : '上传任务已取消',
    })

    if (!task?.backendTaskId) {
      if (task?.taskType === 'reindex' && task.targetDocumentId) {
        clearDocumentReindexing(knowledgeBaseId, task.targetDocumentId)
        if (task.rollbackDocument) {
          upsertDocumentItem(knowledgeBaseId, task.rollbackDocument)
        }
      }
      return
    }

    void fetch(
      `${API_BASE_PATH}/api/knowledge-bases/${knowledgeBaseId}/document-uploads/${task.backendTaskId}`,
      {
        method: 'DELETE',
      },
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await extractErrorMessage(response))
        }
        const backendTask = (await response.json()) as BackendUploadTask
        applyBackendUploadTask(knowledgeBaseId, taskId, backendTask)
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : '取消上传任务失败，请稍后重试。'
        updateUploadTask(knowledgeBaseId, taskId, {
          status: 'canceled',
          stage: 'canceled',
          detail: '取消请求已发送，但服务端确认失败',
          error: message,
        })
      })
  }

  const handleRetryUploadTask = async (knowledgeBaseId: string, taskId: string) => {
    stopPollingUploadTask(taskId)

    const existingTask = uploadTasksByKnowledgeBaseRef.current[knowledgeBaseId]?.find(
      (item) => item.id === taskId,
    )
    if (!existingTask) {
      return
    }

    if (existingTask.taskType === 'reindex' && existingTask.targetDocumentId) {
      canceledUploadTaskIdsRef.current.delete(taskId)
      updateUploadTask(knowledgeBaseId, taskId, {
        status: 'queued',
        progress: 0,
        networkProgress: 100,
        backendTaskId: undefined,
        stage: 'queued',
        detail: '等待重新发起重跑解析',
        uploadedDocumentId: existingTask.targetDocumentId,
        error: undefined,
      })
      await runDocumentReindexTask({
        ...existingTask,
        status: 'queued',
        progress: 0,
        networkProgress: 100,
        backendTaskId: undefined,
        stage: 'queued',
        detail: '等待重新发起重跑解析',
        uploadedDocumentId: existingTask.targetDocumentId,
        error: undefined,
      })
      return
    }

    const file = uploadTaskFilesRef.current[taskId]
    if (!file) {
      updateUploadTask(knowledgeBaseId, taskId, {
        status: 'error',
        stage: 'failed',
        detail: '原始文件对象已失效，请重新选择文件上传。',
        error: '原始文件对象已失效，请重新选择文件上传。',
      })
      return
    }

    canceledUploadTaskIdsRef.current.delete(taskId)
    const task: UploadTask = {
      id: taskId,
      taskType: 'upload',
      knowledgeBaseId,
      fileName: file.name,
      sizeBytes: file.size,
      sizeLabel: formatUploadFileSize(file.size),
      progress: 0,
      networkProgress: 0,
      status: 'queued',
      stage: 'queued',
      detail: '等待重新上传',
      shouldAutoSelect: true,
    }
    updateUploadTask(knowledgeBaseId, taskId, {
      taskType: 'upload',
      fileName: file.name,
      sizeBytes: file.size,
      sizeLabel: formatUploadFileSize(file.size),
      progress: 0,
      networkProgress: 0,
      status: 'queued',
      backendTaskId: undefined,
      stage: 'queued',
      detail: '等待重新上传',
      uploadedDocumentId: undefined,
      shouldAutoSelect: true,
      error: undefined,
    })

    await runUploadTask(task, file)
  }


  const handleRemoveDocument = async (knowledgeBaseId: string, documentId: string) => {
    try {
      const response = await fetch(
        `${API_BASE_PATH}/api/knowledge-bases/${knowledgeBaseId}/documents/${documentId}`,
        {
          method: 'DELETE',
        },
      )

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response))
      }

      setKnowledgeBases((prev) =>
        prev.map((knowledgeBase) =>
          knowledgeBase.id === knowledgeBaseId
            ? {
                ...knowledgeBase,
                documents: knowledgeBase.documents.filter(
                  (document) => document.id !== documentId,
                ),
              }
            : knowledgeBase,
        ),
      )

      setSelectedDocumentId((current) => (current === documentId ? null : current))
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '删除文档失败，请稍后重试。'
      showAppNotice(`删除文档失败：${message}`, 'error')
    }
  }

  const executeReindexKnowledgeBase = async (knowledgeBaseId: string) => {
    const targetKnowledgeBase = knowledgeBases.find((knowledgeBase) => knowledgeBase.id === knowledgeBaseId)
    if (!targetKnowledgeBase) {
      return
    }

    setReindexingKnowledgeBaseId(knowledgeBaseId)
    setKnowledgeBases((prev) =>
      prev.map((knowledgeBase) =>
        knowledgeBase.id === knowledgeBaseId
          ? {
              ...knowledgeBase,
              documents: knowledgeBase.documents.map((document) => ({
                ...document,
                status: 'processing',
              })),
            }
          : knowledgeBase,
      ),
    )

    try {
      const response = await fetch(`${API_BASE_PATH}/api/knowledge-bases/${knowledgeBaseId}/reindex`, {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response))
      }

      const data = (await response.json()) as ReindexKnowledgeBaseResponse
      const nextKnowledgeBase = normalizeKnowledgeBase(data.knowledgeBase)
      setKnowledgeBases((prev) =>
        prev.map((knowledgeBase) =>
          knowledgeBase.id === knowledgeBaseId ? nextKnowledgeBase : knowledgeBase,
        ),
      )
      showAppNotice('知识库索引已经重建完成。', 'success')
    } catch (error) {
      setKnowledgeBases((prev) =>
        prev.map((knowledgeBase) =>
          knowledgeBase.id === knowledgeBaseId ? targetKnowledgeBase : knowledgeBase,
        ),
      )
      const message =
        error instanceof Error ? error.message : '重建索引失败，请稍后重试。'
      showAppNotice(`重建索引失败：${message}`, 'error')
    } finally {
      setReindexingKnowledgeBaseId(null)
    }
  }

  const handleReindexKnowledgeBase = async (knowledgeBaseId: string) => {
    const targetKnowledgeBase = knowledgeBases.find((knowledgeBase) => knowledgeBase.id === knowledgeBaseId)
    if (!targetKnowledgeBase) {
      return
    }

    if (targetKnowledgeBase.documents.length === 0) {
      showAppNotice('当前知识库还没有文档，不需要重建索引。', 'info')
      return
    }

    requestAppConfirm({
      title: '重建知识库索引',
      description: `确定重建知识库“${targetKnowledgeBase.name}”的索引吗？这会使用当前 Embedding 配置重新生成全部文档向量。`,
      confirmLabel: '确认重建',
      cancelLabel: '暂不处理',
      tone: 'danger',
      onConfirm: () => executeReindexKnowledgeBase(knowledgeBaseId),
    })
  }

  const handleReindexDocument = async (knowledgeBaseId: string, documentId: string) => {
    const targetKnowledgeBase = knowledgeBases.find((knowledgeBase) => knowledgeBase.id === knowledgeBaseId)
    const targetDocument = targetKnowledgeBase?.documents.find((document) => document.id === documentId)
    if (!targetKnowledgeBase || !targetDocument) {
      return
    }

    requestAppConfirm({
      title: '重跑文档解析',
      description: `确定重跑文档“${targetDocument.name}”的解析吗？这会重新读取原文件，并重跑图片提取、OCR、切片与向量入库，无需重新上传。`,
      confirmLabel: '确认重跑',
      cancelLabel: '暂不处理',
      tone: 'primary',
      onConfirm: () => {
        const startedCount = enqueueDocumentReindexTasks(
          knowledgeBaseId,
          [targetDocument],
          selectedKnowledgeBaseId === knowledgeBaseId,
        )
        if (startedCount === 0) {
          showAppNotice('这份文档已经在重跑解析中了。', 'info')
        }
      },
    })
  }

  const handleBatchReindexDocuments = async (knowledgeBaseId: string, documentIds: string[]) => {
    const targetKnowledgeBase = knowledgeBases.find((knowledgeBase) => knowledgeBase.id === knowledgeBaseId)
    if (!targetKnowledgeBase) {
      return
    }

    const requestedDocuments = targetKnowledgeBase.documents.filter((document) =>
      documentIds.includes(document.id),
    )
    if (requestedDocuments.length === 0) {
      showAppNotice('当前没有可批量重跑的文档。', 'info')
      return
    }

    const readyDocuments = requestedDocuments.filter(
      (document) => !hasActiveDocumentReindexTask(knowledgeBaseId, document.id),
    )
    if (readyDocuments.length === 0) {
      showAppNotice('当前筛选文档都已经在重跑解析中了。', 'info')
      return
    }

    requestAppConfirm({
      title: '批量重跑文档解析',
      description: `确定批量重跑 ${readyDocuments.length} 份文档的解析吗？这会重新读取原文件，并重跑图片提取、OCR、切片与向量入库。`,
      confirmLabel: '确认批量重跑',
      cancelLabel: '暂不处理',
      tone: 'primary',
      onConfirm: () => {
        const startedCount = enqueueDocumentReindexTasks(knowledgeBaseId, readyDocuments, false)
        if (startedCount > 0) {
          showAppNotice(`已加入 ${startedCount} 个重跑解析任务，可以在任务列表里查看进度。`, 'success')
        }
      },
    })
  }


  const handleSendMessage = async (content: string) => {
    if (!activeConversation || streamingConversationId || isSwitchingConversationKnowledgeBase) {
      return
    }

    const conversationKnowledgeBaseId = activeConversation.knowledgeBaseId || selectedKnowledgeBaseId || ''
    const conversationDocumentId = activeConversation.documentId || ''

    if (!conversationKnowledgeBaseId) {
      showAppNotice('当前会话还没有绑定知识库，请先选择知识库后再提问。', 'info')
      return
    }

    const knowledgeBaseExists = knowledgeBases.some(
      (knowledgeBase) => knowledgeBase.id === conversationKnowledgeBaseId,
    )
    if (!knowledgeBaseExists) {
      showAppNotice('当前会话绑定的知识库已经不可用，请先切换到可用知识库后再提问。', 'error')
      return
    }

    const conversationId = activeConversation.id
    const timestamp = new Date().toISOString()
    const userMessage: ChatMessage = {
      id: createId(),
      role: 'user',
      content,
      timestamp,
    }
    const assistantMessageId = createId()
    const assistantTimestamp = new Date().toISOString()
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: assistantTimestamp,
    }

    const nextMessages = [...activeConversation.messages, userMessage]
    const requestBody: ChatRequestBody = {
      conversationId,
      model: config.chat.model,
      knowledgeBaseId: conversationKnowledgeBaseId,
      documentId: conversationDocumentId,
      assistantMessageId,
      config: config.chat,
      embedding: config.embedding,
      messages: nextMessages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
      })),
    }

    const updateAssistantMessage = (
      updater: (current: ChatMessage) => ChatMessage,
    ) => {
      setConversations((prev) =>
        prev.map((conversation) => {
          if (conversation.id !== conversationId) {
            return conversation
          }

          return {
            ...conversation,
            messages: conversation.messages.map((message) =>
              message.id === assistantMessageId
                ? {
                    ...updater(message),
                    timestamp: new Date().toISOString(),
                  }
                : message,
            ),
            updatedAt: new Date().toISOString(),
          }
        }),
      )
    }

    const finalizeAssistantMessage = (
      contentOverride?: string,
      metadata?: ChatMessageMetadata,
    ) => {
      updateAssistantMessage((current) => ({
        ...current,
        content:
          contentOverride !== undefined
            ? contentOverride || '后端未返回有效回答。'
            : current.content || '后端未返回有效回答。',
        metadata: metadata ?? current.metadata,
      }))
    }

    const requestWithFallback = async () => {
      const streamResponse = await fetch(`${API_BASE_PATH}/v1/chat/completions/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(requestBody),
      })

      if (!streamResponse.ok) {
        const fallbackResponse = await fetch(`${API_BASE_PATH}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        })

        if (!fallbackResponse.ok) {
          throw new Error(await extractErrorMessage(fallbackResponse))
        }

        const data = (await fallbackResponse.json()) as ChatCompletionResponse
        finalizeAssistantMessage(
          data.choices[0]?.message?.content || '后端未返回有效回答。',
          normalizeChatMessageMetadata(data.metadata),
        )
        return
      }

      if (!streamResponse.body) {
        throw new Error('浏览器不支持流式响应读取')
      }

      const reader = streamResponse.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''
      let streamCompleted = false

      const processEventBlock = (block: string) => {
        const normalizedBlock = block.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        const lines = normalizedBlock.split('\n')
        const eventLine = lines.find((line) => line.startsWith('event:'))
        const dataLines = lines.filter((line) => line.startsWith('data:'))
        const eventName = eventLine?.slice(6).trim() ?? 'message'
        const rawData = dataLines.map((line) => line.slice(5).trim()).join('\n')

        if (!rawData) {
          return
        }

        const payload = JSON.parse(rawData) as StreamEventPayload

        if (eventName === 'chunk') {
          if (payload.content) {
            updateAssistantMessage((current) => ({
              ...current,
              content: current.content + payload.content,
            }))
          }
          return
        }

        if (eventName === 'done') {
          const degradedMetadata =
            payload.metadata ??
            (payload.content && isDegradedFallbackContent(payload.content)
              ? {
                  degraded: true,
                  fallbackStrategy: 'stream-fallback-message',
                }
              : undefined)
          finalizeAssistantMessage(payload.content, degradedMetadata)
          streamCompleted = true
          return
        }

        if (eventName === 'error') {
          throw new Error(payload.error || '流式响应失败')
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
        const normalizedBuffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

        const blocks = normalizedBuffer.split('\n\n')
        buffer = blocks.pop() ?? ''

        for (const block of blocks) {
          processEventBlock(block)
        }

        if (done) {
          break
        }
      }

      const rest = buffer.trim()
      if (rest) {
        processEventBlock(rest)
      }

      if (!streamCompleted) {
        finalizeAssistantMessage()
      }
    }

    setStreamingConversationId(conversationId)
    setConversations((prev) =>
      prev.map((conversation) => {
        if (conversation.id !== conversationId) {
          return conversation
        }

        return {
          ...conversation,
          title:
            conversation.messages.length <= 1
              ? content.slice(0, 18) || '新的对话'
              : conversation.title,
          messages: [...nextMessages, assistantMessage],
          updatedAt: assistantTimestamp,
        }
      }),
    )

    try {
      await requestWithFallback()
    } catch (error) {
      updateAssistantMessage((current) => ({
        ...current,
        content:
          error instanceof Error
            ? `聊天接口调用失败：${error.message}`
            : '聊天接口调用失败，请检查后端服务是否启动。',
      }))
    } finally {
      setStreamingConversationId(null)
    }
  }

  const handleSubmitMessageFeedback = async (
    messageId: string,
    payload: ConversationFeedbackPayload,
  ): Promise<MessageFeedbackSummary> => {
    if (!activeConversation) {
      throw new Error('当前没有可反馈的会话。')
    }

    const messageIndex = activeConversation.messages.findIndex((message) => message.id === messageId)
    if (messageIndex < 0) {
      throw new Error('未找到对应回答，请刷新后重试。')
    }

    const targetMessage = activeConversation.messages[messageIndex]
    if (targetMessage.role !== 'assistant') {
      throw new Error('只有回答消息支持反馈。')
    }

    const response = await fetch(
      `${API_BASE_PATH}/api/conversations/${activeConversation.id}/messages/${messageId}/feedback`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          feedbackType: payload.feedbackType,
          feedbackReason: payload.feedbackReason,
          feedbackText: payload.feedbackText,
          questionText: findPreviousUserQuestion(activeConversation.messages, messageIndex),
          answerText: targetMessage.content,
          knowledgeBaseId: activeConversation.knowledgeBaseId,
          sourceDocuments: targetMessage.metadata?.sources ?? [],
          metadata: {
            channel: 'normal-chat-ui',
          },
        }),
      },
    )

    if (!response.ok) {
      throw new Error(await extractErrorMessage(response))
    }

    const result = (await response.json()) as ConversationMessageFeedbackResponse
    const summary = normalizeFeedbackSummary(result.summary) ?? {
      likeCount: payload.feedbackType === 'like' ? 1 : 0,
      dislikeCount: payload.feedbackType === 'dislike' ? 1 : 0,
      latestFeedbackId: result.feedback?.id,
      latestFeedback:
        payload.feedbackType === 'dislike' && payload.feedbackReason
          ? `${payload.feedbackType}:${payload.feedbackReason}`
          : payload.feedbackType,
      status: payload.feedbackType === 'like' ? 'helpful' : 'needs-improvement',
    }

    setConversations((prev) =>
      prev.map((conversation) => {
        if (conversation.id !== activeConversation.id) {
          return conversation
        }

        return {
          ...conversation,
          messages: conversation.messages.map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  metadata: {
                    ...(message.metadata ?? {}),
                    feedbackSummary: summary,
                  },
                }
              : message,
          ),
        }
      }),
    )

    return summary
  }

  const handleSaveConfig = useCallback(async (nextConfig: AppConfig) => {
    setIsSavingConfig(true)
    setConfigSaveError(null)
    setConfigSaveSuccess(null)

    try {
      const response = await fetch(`${API_BASE_PATH}/api/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(nextConfig),
      })

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response))
      }

      const savedConfig = cloneAppConfig((await response.json()) as ConfigResponse)
      const chatChanged = JSON.stringify(config.chat) !== JSON.stringify(savedConfig.chat)
      const embeddingChanged =
        JSON.stringify(config.embedding) !== JSON.stringify(savedConfig.embedding)
      const welcomeTemplateChanged =
        config.ui.welcomeMessageTemplate !== savedConfig.ui.welcomeMessageTemplate

      setConfig(savedConfig)

      if (welcomeTemplateChanged) {
        setConversations((prev) =>
          prev.map((conversation) => {
            if (
              !isConversationLocalOnly(conversation) ||
              conversation.messages.length !== 1 ||
              conversation.messages[0]?.role !== 'assistant'
            ) {
              return conversation
            }

            const knowledgeBaseName =
              knowledgeBases.find((knowledgeBase) => knowledgeBase.id === conversation.knowledgeBaseId)?.name ?? null
            const nextTimestamp = new Date().toISOString()

            return {
              ...conversation,
              messages: [
                {
                  ...conversation.messages[0],
                  content: buildWelcomeMessage(savedConfig.ui.welcomeMessageTemplate, knowledgeBaseName),
                  timestamp: nextTimestamp,
                },
              ],
              updatedAt: nextTimestamp,
            }
          }),
        )
      }

      if (embeddingChanged) {
        setConfigSaveSuccess('配置已保存。Embedding 模型已变更，请重新上传文档或重建知识库索引。')
      } else if (chatChanged) {
        setConfigSaveSuccess('配置已保存，新的聊天模型配置已生效。')
      } else if (welcomeTemplateChanged) {
        setConfigSaveSuccess('配置已保存，新的欢迎提示语已生效。')
      } else {
        setConfigSaveSuccess('配置已保存。')
      }
    } catch (error) {
      setConfigSaveError(
        error instanceof Error ? error.message : '保存配置失败，请稍后重试。',
      )
    } finally {
      setIsSavingConfig(false)
    }
  }, [config, knowledgeBases])

  const handleToggleSettings = useCallback(() => {
    setIsSettingsOpen((prev) => {
      const next = !prev
      if (next) {
        setIsKnowledgePanelOpen(false)
        setConfigSaveError(null)
        setConfigSaveSuccess(null)
      }
      return next
    })
  }, [])

  const handleToggleKnowledgePanel = useCallback(() => {
    setIsKnowledgePanelOpen((prev) => {
      const next = !prev
      if (next) {
        setIsSettingsOpen(false)
      }
      return next
    })
  }, [])

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev)
  }, [])

  return (
    <div className="chat-page">
      {appNotice ? (
        <div className="app-notice-layer" aria-live="polite" aria-atomic="true">
          <div className={`app-notice app-notice-${appNotice.tone}`.trim()} role="status">
            <span className="app-notice-text">{appNotice.message}</span>
            <button type="button" className="app-notice-close" onClick={clearAppNotice} aria-label="关闭提示">
              ×
            </button>
          </div>
        </div>
      ) : null}

      <Sidebar
        isOpen={sidebarOpen}
        onToggle={handleToggleSidebar}
        knowledgeBases={knowledgeBases}
        selectedKnowledgeBaseId={selectedKnowledgeBase?.id ?? null}
        selectedDocumentId={selectedDocumentId}
        onSelectKnowledgeBase={handleSelectKnowledgeBase}
        onSelectDocument={handleSelectDocument}
        onCreateKnowledgeBase={handleCreateKnowledgeBase}
        onDeleteKnowledgeBase={handleDeleteKnowledgeBase}
        onUploadFiles={handleUploadFiles}
        uploadTasksByKnowledgeBase={uploadTasksByKnowledgeBase}
        onCancelUploadTask={handleCancelUploadTask}
        onRetryUploadTask={handleRetryUploadTask}
        onClearFinishedUploadTasks={clearFinishedUploadTasks}
        onRemoveDocument={handleRemoveDocument}
        onReindexKnowledgeBase={handleReindexKnowledgeBase}
        onReindexDocument={handleReindexDocument}
        onBatchReindexDocuments={handleBatchReindexDocuments}
        reindexingKnowledgeBaseId={reindexingKnowledgeBaseId}
        reindexingDocumentKeys={reindexingDocumentKeys}
        conversations={conversations}
        activeConversationId={activeConversation?.id ?? null}
        onSelectConversation={handleSelectConversation}
        onCreateConversation={handleCreateConversation}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleRequestDeleteConversation}
        isSettingsOpen={isSettingsOpen}
        isKnowledgePanelOpen={isKnowledgePanelOpen}
        onToggleSettings={handleToggleSettings}
        onToggleKnowledgePanel={handleToggleKnowledgePanel}
      />

      {isSettingsOpen ? (
        <SettingsPanel
          config={config}
          onClose={handleToggleSettings}
          onSave={handleSaveConfig}
          isSaving={isSavingConfig}
          saveError={configSaveError}
          saveSuccess={configSaveSuccess}
        />
      ) : null}
      <ChatArea
        sidebarOpen={sidebarOpen}
        activeConversation={activeConversation}
        conversationKnowledgeBase={activeConversationKnowledgeBase}
        conversationDocument={activeConversationDocument}
        knowledgeBases={knowledgeBases}
        config={config}
        welcomeMessage={buildWelcomeMessage(config.ui.welcomeMessageTemplate, activeConversationKnowledgeBase?.name)}
        isLoading={streamingConversationId === activeConversation?.id}
        isSwitchingKnowledgeBase={isSwitchingConversationKnowledgeBase}
        onSendMessage={handleSendMessage}
        onClearConversation={handleClearConversation}
        onChangeConversationKnowledgeBase={handleChangeConversationKnowledgeBase}
        onSubmitMessageFeedback={handleSubmitMessageFeedback}
      />

      {appConfirm ? (
        <div
          className="settings-modal-backdrop app-confirm-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="app-confirm-title"
          onClick={clearAppConfirm}
        >
          <div className="settings-modal app-confirm-modal" onClick={(event) => event.stopPropagation()}>
            <div className="settings-modal-header app-confirm-header">
              <div>
                <h3 id="app-confirm-title">{appConfirm.title}</h3>
                <p>{appConfirm.description}</p>
              </div>
              <button
                type="button"
                className="settings-close-btn"
                onClick={clearAppConfirm}
              >
                取消
              </button>
            </div>
            <div className="app-confirm-actions">
              <button
                type="button"
                className="kb-cancel-btn"
                onClick={clearAppConfirm}
              >
                {appConfirm.cancelLabel || '取消'}
              </button>
              <button
                type="button"
                className={appConfirm.tone === 'danger' ? 'app-confirm-danger-btn' : 'kb-confirm-btn'}
                onClick={() => {
                  void handleConfirmAppAction()
                }}
              >
                {appConfirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCreateConversationModalOpen && (
        <div
          className="settings-modal-backdrop conversation-scope-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="conversation-scope-modal-title"
        >
          <div className="settings-modal conversation-scope-modal">
            <div className="settings-modal-header">
              <div>
                <h3 id="conversation-scope-modal-title">新建会话并绑定知识库</h3>
                <p>每个普通聊天会话固定绑定一个知识库，后续问答默认使用该知识库。</p>
              </div>
              <button
                type="button"
                className="settings-close-btn"
                onClick={() => setIsCreateConversationModalOpen(false)}
              >
                取消
              </button>
            </div>

            <div className="settings-modal-scroll">
              <div className="conversation-scope-list">
                {knowledgeBases.map((knowledgeBase) => {
                  const isActive = knowledgeBase.id === pendingConversationKnowledgeBaseId

                  return (
                    <button
                      key={knowledgeBase.id}
                      type="button"
                      className={`conversation-scope-card ${isActive ? 'active' : ''}`}
                      onClick={() => setPendingConversationKnowledgeBaseId(knowledgeBase.id)}
                    >
                      <div className="conversation-scope-card-title-row">
                        <span className="conversation-scope-card-title">{knowledgeBase.name}</span>
                        <span className="conversation-scope-card-meta">
                          {knowledgeBase.documents.length} 个文档
                        </span>
                      </div>
                      <div className="conversation-scope-card-desc">
                        {knowledgeBase.description || '未填写知识库描述'}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="conversation-scope-actions">
              <button
                type="button"
                className="kb-cancel-btn"
                onClick={() => setIsCreateConversationModalOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="kb-confirm-btn"
                onClick={handleConfirmCreateConversation}
                disabled={!pendingConversationKnowledgeBaseId && knowledgeBases.length === 0}
              >
                创建会话
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App

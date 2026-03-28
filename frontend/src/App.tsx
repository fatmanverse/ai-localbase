import './App.css'
import ChatArea from './components/ChatArea'
import Sidebar from './components/Sidebar'
import { useEffect, useMemo, useRef, useState } from 'react'

export interface ChatMessageMetadata {
  degraded?: boolean
  fallbackStrategy?: string
  upstreamError?: string
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
  shouldAutoSelect?: boolean
  error?: string
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

export interface AppConfig {
  chat: ChatConfig
  embedding: EmbeddingConfig
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
  metadata?: {
    degraded?: boolean
    fallbackStrategy?: string
    upstreamError?: string
    sources?: Array<{
      knowledgeBaseId: string
      documentId: string
      documentName: string
    }>
  }
}

interface ChatRequestBody {
  conversationId: string
  model: string
  knowledgeBaseId: string
  documentId: string
  config: ChatConfig
  embedding: EmbeddingConfig
  messages: Array<{
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

const API_BASE_PATH = ''

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
})

const createId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

interface BackendDocumentItem {
  id: string
  name: string
  sizeLabel: string
  uploadedAt: string
  status: 'indexed' | 'ready' | 'processing'
  contentPreview?: string
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
    normalized.startsWith('⚠️ AI 模型调用失败') ||
    normalized.startsWith('⚠ 当前回答为降级回复') ||
    normalized.includes('模型或检索链路出现异常')
  )
}

const normalizeConversation = (conversation: BackendConversation): Conversation => ({
  id: conversation.id,
  title: conversation.title,
  createdAt: conversation.createdAt,
  updatedAt: conversation.updatedAt,
  messages: (conversation.messages ?? []).map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.createdAt,
    metadata: message.metadata,
  })),
})

const createWelcomeConversation = (): Conversation => {
  const now = new Date().toISOString()

  return {
    id: createId(),
    title: '新的对话',
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        id: createId(),
        role: 'assistant',
        content:
          '你好，我是 AI LocalBase 助手。你可以先选择知识库，或者进一步选中某个文档后再提问。',
        timestamp: now,
      },
    ],
  }
}

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
  try {
    const payload = JSON.parse(xhr.responseText) as ApiErrorResponse
    return payload.error || `请求失败：${xhr.status}`
  } catch {
    return `请求失败：${xhr.status}`
  }
}

const UPLOAD_TRANSPORT_PROGRESS_WEIGHT = 35
const UPLOAD_PROCESS_PROGRESS_WEIGHT = 100 - UPLOAD_TRANSPORT_PROGRESS_WEIGHT

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
  status: normalizeUploadTaskStatus(task),
  progress: mapBackendTaskProgress(task.progress),
  networkProgress: 100,
  stage: task.stage,
  detail: task.message || resolveUploadStageLabel(task.stage),
  uploadedDocumentId: task.uploaded?.id,
  error:
    task.status === 'error'
      ? task.error || task.message || '文档处理失败'
      : task.status === 'canceled'
        ? task.error || task.message || '上传任务已取消'
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

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [streamingConversationId, setStreamingConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const initialConversation = createWelcomeConversation()
    return [initialConversation]
  })
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState<string | null>(null)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isKnowledgePanelOpen, setIsKnowledgePanelOpen] = useState(false)
  const [config, setConfig] = useState<AppConfig>(() => cloneAppConfig(recommendedConfig))
  const [isSavingConfig, setIsSavingConfig] = useState(false)
  const [configSaveError, setConfigSaveError] = useState<string | null>(null)
  const [configSaveSuccess, setConfigSaveSuccess] = useState<string | null>(null)
  const [reindexingKnowledgeBaseId, setReindexingKnowledgeBaseId] = useState<string | null>(null)
  const [uploadTasksByKnowledgeBase, setUploadTasksByKnowledgeBase] = useState<Record<string, UploadTask[]>>({})
  const uploadTaskFilesRef = useRef<Record<string, File>>({})
  const uploadTaskXhrRef = useRef<Record<string, XMLHttpRequest>>({})
  const uploadTaskPollTimerRef = useRef<Record<string, number>>({})
  const uploadTasksByKnowledgeBaseRef = useRef<Record<string, UploadTask[]>>({})
  const canceledUploadTaskIdsRef = useRef<Set<string>>(new Set())

  const loadConversationDetail = async (conversationId: string): Promise<Conversation> => {
    const response = await fetch(`${API_BASE_PATH}/api/conversations/${conversationId}`)
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

  const selectedDocument = useMemo(() => {
    if (!selectedKnowledgeBase || !selectedDocumentId) {
      return null
    }

    return (
      selectedKnowledgeBase.documents.find(
        (document) => document.id === selectedDocumentId,
      ) ?? null
    )
  }, [selectedDocumentId, selectedKnowledgeBase])

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
            createdAt: conversation.createdAt,
            updatedAt: conversation.updatedAt,
            messages: [],
          }))
          setConversations([firstConversation, ...restConversations])
          setActiveConversationId(firstConversation.id)
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
    const conversation = createWelcomeConversation()

    setConversations((prev) => [conversation, ...prev])
    setActiveConversationId(conversation.id)
  }

  const handleSelectConversation = async (conversationId: string) => {
    const existingConversation = conversations.find((conversation) => conversation.id === conversationId)
    if (existingConversation && existingConversation.messages.length > 0) {
      setActiveConversationId(conversationId)
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
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '加载会话失败，请稍后重试。'
      window.alert(`加载会话失败：${message}`)
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

    const isLocalOnly = targetConversation.messages.length > 0 && !targetConversation.messages.some((message) => message.role === 'user')

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
          knowledgeBaseId: '',
          documentId: '',
          messages: fullConversation.messages.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            createdAt: message.timestamp,
            metadata: message.metadata,
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
      window.alert(`重命名会话失败：${message}`)
    }
  }

  const handleDeleteConversation = async (conversationId: string) => {
    const targetConversation = conversations.find((conversation) => conversation.id === conversationId)
    if (!targetConversation) {
      return
    }

    const isLocalOnly = targetConversation.messages.length > 0 && !targetConversation.messages.some((message) => message.role === 'user')

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
          const conversation = createWelcomeConversation()
          return conversation
        })()

      setConversations(
        remainingConversations.length > 0 ? remainingConversations : [fallbackConversation],
      )

      if (activeConversationId === conversationId) {
        setActiveConversationId(fallbackConversation.id)
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '删除会话失败，请稍后重试。'
      window.alert(`删除会话失败：${message}`)
    }
  }

  const handleClearConversation = () => {
    if (!activeConversation) {
      return
    }

    const resetMessage: ChatMessage = {
      id: createId(),
      role: 'assistant',
      content: '当前会话已清空。你可以继续发起新的提问。',
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
      window.alert(`创建知识库失败：${message}`)
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
      window.alert(`删除知识库失败：${message}`)
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
      const next = {
        ...prev,
        [knowledgeBaseId]: (prev[knowledgeBaseId] ?? []).map((task) =>
          task.id === taskId ? { ...task, ...patch } : task,
        ),
      }
      uploadTasksByKnowledgeBaseRef.current = next
      return next
    })
  }

  function stopPollingUploadTask(taskId: string) {
    const timer = uploadTaskPollTimerRef.current[taskId]
    if (typeof timer === 'number') {
      window.clearTimeout(timer)
      delete uploadTaskPollTimerRef.current[taskId]
    }
  }

  function upsertUploadedDocument(knowledgeBaseId: string, document: BackendDocumentItem) {
    const normalizedDocument = normalizeDocument(document)
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

  function applyBackendUploadTask(
    knowledgeBaseId: string,
    taskId: string,
    backendTask: BackendUploadTask,
  ) {
    updateUploadTask(knowledgeBaseId, taskId, normalizeUploadTaskFromBackend(backendTask))

    if (backendTask.uploaded) {
      const uploadedDocument = upsertUploadedDocument(knowledgeBaseId, backendTask.uploaded)
      const currentTask = uploadTasksByKnowledgeBaseRef.current[knowledgeBaseId]?.find(
        (item) => item.id === taskId,
      )
      if (backendTask.status === 'success' && currentTask?.shouldAutoSelect) {
        setSelectedKnowledgeBaseId(knowledgeBaseId)
        setSelectedDocumentId(uploadedDocument.id)
      }
    }

    if (backendTask.status === 'success') {
      delete uploadTaskFilesRef.current[taskId]
      canceledUploadTaskIdsRef.current.delete(taskId)
    }

    if (
      backendTask.status === 'success' ||
      backendTask.status === 'error' ||
      backendTask.status === 'canceled'
    ) {
      stopPollingUploadTask(taskId)
      delete uploadTaskXhrRef.current[taskId]
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
          updateUploadTask(task.knowledgeBaseId, task.id, {
            status: 'uploading',
            networkProgress,
            progress: mapTransportProgress(networkProgress),
            stage: 'uploading',
            detail: `正在上传文件到服务器（${networkProgress}%）`,
            error: undefined,
          })
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

  const handleUploadFiles = async (knowledgeBaseId: string, files: FileList | null) => {
    if (!files || files.length === 0) {
      return
    }

    const fileList = Array.from(files)
    const nextTasks = fileList.map((file, index) => ({
      id: createId(),
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
      detail: task?.backendTaskId ? '正在取消服务端处理任务' : '上传任务已取消',
      error: '上传任务已取消',
    })

    if (!task?.backendTaskId) {
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
      window.alert(`删除文档失败：${message}`)
    }
  }

  const handleReindexKnowledgeBase = async (knowledgeBaseId: string) => {
    const targetKnowledgeBase = knowledgeBases.find((knowledgeBase) => knowledgeBase.id === knowledgeBaseId)
    if (!targetKnowledgeBase) {
      return
    }

    if (targetKnowledgeBase.documents.length === 0) {
      window.alert('当前知识库暂无文档，无需重建索引。')
      return
    }

    const confirmed = window.confirm(
      `确定重建知识库“${targetKnowledgeBase.name}”的索引吗？这会使用当前 Embedding 配置重新生成全部文档向量。`,
    )
    if (!confirmed) {
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
      window.alert('知识库索引重建完成。')
    } catch (error) {
      setKnowledgeBases((prev) =>
        prev.map((knowledgeBase) =>
          knowledgeBase.id === knowledgeBaseId ? targetKnowledgeBase : knowledgeBase,
        ),
      )
      const message =
        error instanceof Error ? error.message : '重建索引失败，请稍后重试。'
      window.alert(`重建索引失败：${message}`)
    } finally {
      setReindexingKnowledgeBaseId(null)
    }
  }

  const handleSendMessage = async (content: string) => {
    if (!activeConversation || streamingConversationId) {
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
      knowledgeBaseId: selectedKnowledgeBaseId ?? '',
      documentId: selectedDocumentId ?? '',
      config: config.chat,
      embedding: config.embedding,
      messages: nextMessages.map((message) => ({
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
          data.metadata
            ? {
                degraded: data.metadata.degraded,
                fallbackStrategy: data.metadata.fallbackStrategy,
                upstreamError: data.metadata.upstreamError,
              }
            : undefined,
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

  const handleSaveConfig = async (nextConfig: AppConfig) => {
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

      const savedConfig = (await response.json()) as ConfigResponse
      const embeddingChanged =
        JSON.stringify(config.embedding) !== JSON.stringify(savedConfig.embedding)

      setConfig(cloneAppConfig(savedConfig))
      setConfigSaveSuccess('配置已保存，新的聊天模型与向量模型已生效。')

      if (embeddingChanged) {
        setConfigSaveSuccess('配置已保存。Embedding 模型已变更，请重新上传文档或重建知识库索引。')
      }
    } catch (error) {
      setConfigSaveError(
        error instanceof Error ? error.message : '保存配置失败，请稍后重试。',
      )
    } finally {
      setIsSavingConfig(false)
    }
  }

  const handleToggleSettings = () => {
    setIsSettingsOpen((prev) => {
      const next = !prev
      if (next) {
        setIsKnowledgePanelOpen(false)
        setConfigSaveError(null)
        setConfigSaveSuccess(null)
      }
      return next
    })
  }

  const handleToggleKnowledgePanel = () => {
    setIsKnowledgePanelOpen((prev) => {
      const next = !prev
      if (next) {
        setIsSettingsOpen(false)
      }
      return next
    })
  }

  return (
    <div className="chat-page">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
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
        reindexingKnowledgeBaseId={reindexingKnowledgeBaseId}
        conversations={conversations}
        activeConversationId={activeConversation?.id ?? null}
        onSelectConversation={handleSelectConversation}
        onCreateConversation={handleCreateConversation}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleDeleteConversation}
        config={config}
        isSettingsOpen={isSettingsOpen}
        isKnowledgePanelOpen={isKnowledgePanelOpen}
        onToggleSettings={handleToggleSettings}
        onToggleKnowledgePanel={handleToggleKnowledgePanel}
        onSaveConfig={handleSaveConfig}
        isSavingConfig={isSavingConfig}
        configSaveError={configSaveError}
        configSaveSuccess={configSaveSuccess}
      />
      <ChatArea
        sidebarOpen={sidebarOpen}
        activeConversation={activeConversation}
        selectedKnowledgeBase={selectedKnowledgeBase}
        selectedDocument={selectedDocument}
        config={config}
        isLoading={streamingConversationId === activeConversation?.id}
        onSendMessage={handleSendMessage}
        onClearConversation={handleClearConversation}
      />
    </div>
  )
}

export default App

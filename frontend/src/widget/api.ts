import {
  ApiResponse,
  CreateConversationPayload,
  FeedbackPayload,
  SendMessagePayload,
  SendMessageResponse,
  ServiceDeskConversation,
  ServiceDeskMessage,
  StreamChunkHandler,
} from './types'

const toError = async (response: Response) => {
  try {
    const data = (await response.json()) as ApiResponse<unknown>
    return data.error?.message ?? `请求失败：${response.status}`
  } catch {
    return `请求失败：${response.status}`
  }
}

const unwrap = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    throw new Error(await toError(response))
  }

  const payload = (await response.json()) as ApiResponse<T>
  if (!payload.success) {
    throw new Error(payload.error?.message ?? '请求失败')
  }

  return payload.data
}

export const createServiceDeskConversation = async (
  apiBaseUrl: string,
  payload: CreateConversationPayload,
) => {
  const response = await fetch(`${apiBaseUrl}/api/service-desk/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  return unwrap<ServiceDeskConversation>(response)
}

export const getServiceDeskConversation = async (
  apiBaseUrl: string,
  conversationId: string,
) => {
  const response = await fetch(`${apiBaseUrl}/api/service-desk/conversations/${conversationId}`)
  return unwrap<ServiceDeskConversation>(response)
}

export const listServiceDeskMessages = async (
  apiBaseUrl: string,
  conversationId: string,
) => {
  const response = await fetch(`${apiBaseUrl}/api/service-desk/conversations/${conversationId}/messages`)
  const data = await unwrap<{ conversationId: string; items: ServiceDeskMessage[] }>(response)
  return data.items
}

export const sendServiceDeskMessage = async (
  apiBaseUrl: string,
  conversationId: string,
  payload: SendMessagePayload,
) => {
  const response = await fetch(`${apiBaseUrl}/api/service-desk/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  return unwrap<SendMessageResponse>(response)
}

export const streamServiceDeskMessage = async (
  apiBaseUrl: string,
  conversationId: string,
  payload: SendMessagePayload,
  handlers: StreamChunkHandler,
) => {
  const response = await fetch(`${apiBaseUrl}/api/service-desk/conversations/${conversationId}/messages/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(await toError(response))
  }

  if (!response.body) {
    throw new Error('当前浏览器不支持流式响应')
  }

  const decoder = new TextDecoder('utf-8')
  const reader = response.body.getReader()
  let buffer = ''

  const processBlock = (block: string) => {
    const normalized = block.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const lines = normalized.split('\n')
    const eventLine = lines.find((line) => line.startsWith('event:'))
    const dataLines = lines.filter((line) => line.startsWith('data:'))
    const eventName = eventLine?.slice(6).trim() ?? 'message'
    const raw = dataLines.map((line) => line.slice(5).trim()).join('\n')

    if (!raw) {
      return
    }

    const payload = JSON.parse(raw) as Record<string, unknown>
    if (eventName === 'meta') {
      handlers.onMeta?.(payload)
      return
    }
    if (eventName === 'chunk') {
      handlers.onChunk?.(String(payload.content ?? ''))
      return
    }
    if (eventName === 'done') {
      handlers.onDone?.(payload)
      return
    }
    if (eventName === 'error') {
      throw new Error(String(payload.error ?? '流式请求失败'))
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
    const blocks = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n\n')
    buffer = blocks.pop() ?? ''

    for (const block of blocks) {
      processBlock(block)
    }

    if (done) {
      break
    }
  }

  const rest = buffer.trim()
  if (rest) {
    processBlock(rest)
  }
}

export const submitServiceDeskFeedback = async (
  apiBaseUrl: string,
  payload: FeedbackPayload,
) => {
  const response = await fetch(`${apiBaseUrl}/api/service-desk/messages/${payload.messageId}/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  return unwrap(response)
}

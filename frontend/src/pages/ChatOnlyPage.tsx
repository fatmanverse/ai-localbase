import { FixedKnowledgeBaseWidget } from '../widget'
import {
  CHAT_ONLY_ROUTE_SEGMENTS,
  readBooleanParam,
  readFirstParam,
  readKnowledgeBaseIdFromNamedPath,
  splitListParam,
} from './serviceDeskPageParams'
import './serviceDeskDemo.css'

const detectIframeContext = () => {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

export default function ChatOnlyPage() {
  const searchParams = new URLSearchParams(window.location.search)
  const knowledgeBaseId =
    readKnowledgeBaseIdFromNamedPath(CHAT_ONLY_ROUTE_SEGMENTS) ||
    readFirstParam(searchParams, 'kb', 'knowledgeBaseId')
  const title = readFirstParam(searchParams, 'title', 't') || '知识库问答入口'
  const apiBaseUrl = readFirstParam(searchParams, 'api', 'apiBaseUrl')
  const initialConversationId = readFirstParam(searchParams, 'cid', 'conversationId') || undefined
  const promptList = splitListParam(searchParams.get('q') ?? searchParams.get('quickPrompts'))
  const useStreaming = readBooleanParam(searchParams.get('stream') ?? searchParams.get('s'), true)
  const frameless = readBooleanParam(
    searchParams.get('frameless') ?? searchParams.get('bare') ?? searchParams.get('compact'),
    detectIframeContext(),
  )
  const ticketId = readFirstParam(searchParams, 'ticket', 'ticketId')
  const userId = readFirstParam(searchParams, 'uid', 'userId')
  const tenantId = readFirstParam(searchParams, 'tenant', 'tenantId')
  const sourcePlatform = readFirstParam(searchParams, 'src', 'sourcePlatform') || 'chat-only-page'
  const category = readFirstParam(searchParams, 'cat', 'category')
  const priority = readFirstParam(searchParams, 'p', 'priority')
  const tags = splitListParam(searchParams.get('tag') ?? searchParams.get('tags'))
  const hostPage = readFirstParam(searchParams, 'host', 'hostPage')

  if (!knowledgeBaseId) {
    return (
      <main className={`service-desk-demo-page chat-only-page ${frameless ? 'chat-only-page-frameless' : ''}`.trim()}>
        <section className="service-desk-demo-card chat-only-config-card">
          <div className="eyebrow">Chat Only Route</div>
          <h1>缺少知识库参数</h1>
          <p>
            这个页面只保留问答能力，不展示设置与知识库管理。访问时请固定传入知识库 ID。
          </p>
          <code>/chat/kb-it-support</code>
          <p>如果当前部署没有做前端路由重写，也可以直接使用：<code>?mode=chat-only&amp;kb=kb-it-support</code></p>
          <p>兼容更短的写法：<code>/ask/kb-it-support?title=IT服务台</code></p>
        </section>
      </main>
    )
  }

  return (
    <main className={`service-desk-demo-page chat-only-page ${frameless ? 'chat-only-page-frameless' : ''}`.trim()}>
      <section className="chat-only-page-shell">
        {frameless ? null : <div className="chat-only-page-caption">纯问答入口 · 已锁定知识库</div>}
        <FixedKnowledgeBaseWidget
          apiBaseUrl={apiBaseUrl}
          knowledgeBaseId={knowledgeBaseId}
          title={title}
          initialConversationId={initialConversationId}
          useStreaming={useStreaming}
          quickPrompts={promptList}
          displayMode="chat-only"
          showHeader={!frameless}
          showContextBar={false}
          showQuickPrompts={promptList.length > 0}
          shellClassName={`chat-only-widget-shell ${frameless ? 'chat-only-widget-frameless' : ''}`.trim()}
          headerLabel="对外问答入口"
          composerPlaceholder="请输入你的问题，我这边按当前知识库给你一个可直接执行的答复。"
          composerHelperText="当前页面仅保留问答，不显示设置、知识库管理和知识库切换。"
          emptyStateTitle="直接开始提问"
          emptyStateDescription="这个页面已经固定到指定知识库，可以直接输入问题、现象或排查目标。"
          initialContext={{
            ticketId,
            userId,
            tenantId,
            sourcePlatform,
            category,
            priority,
            tags,
          }}
          sessionMetadata={{
            channel: 'frontend-chat-only-page',
            routeMode: 'chat-only',
            hostPage,
          }}
        />
      </section>
    </main>
  )
}

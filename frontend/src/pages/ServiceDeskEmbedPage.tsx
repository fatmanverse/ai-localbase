import { FixedKnowledgeBaseWidget } from '../widget'
import {
  readBooleanParam,
  readFirstParam,
  readKnowledgeBaseIdFromNamedPath,
  splitListParam,
} from './serviceDeskPageParams'
import './serviceDeskDemo.css'

export default function ServiceDeskEmbedPage() {
  const searchParams = new URLSearchParams(window.location.search)
  const knowledgeBaseId =
    readKnowledgeBaseIdFromNamedPath(['embed']) ||
    readFirstParam(searchParams, 'kb', 'knowledgeBaseId')
  const title = readFirstParam(searchParams, 'title', 't') || '企业服务台'
  const apiBaseUrl = readFirstParam(searchParams, 'api', 'apiBaseUrl')
  const initialConversationId = readFirstParam(searchParams, 'cid', 'conversationId') || undefined
  const promptList = splitListParam(searchParams.get('q') ?? searchParams.get('quickPrompts'))
  const quickPrompts = promptList.length > 0 ? promptList : undefined
  const tags = splitListParam(searchParams.get('tag') ?? searchParams.get('tags'))
  const useStreaming = readBooleanParam(searchParams.get('stream') ?? searchParams.get('s'), true)
  const ticketId = readFirstParam(searchParams, 'ticket', 'ticketId')
  const userId = readFirstParam(searchParams, 'uid', 'userId')
  const tenantId = readFirstParam(searchParams, 'tenant', 'tenantId')
  const sourcePlatform = readFirstParam(searchParams, 'src', 'sourcePlatform') || 'iframe-embed'
  const category = readFirstParam(searchParams, 'cat', 'category')
  const priority = readFirstParam(searchParams, 'p', 'priority')
  const hostPage = readFirstParam(searchParams, 'host', 'hostPage')

  if (!knowledgeBaseId) {
    return (
      <main className="service-desk-demo-page service-desk-embed-page">
        <section className="service-desk-demo-card service-desk-embed-card">
          <div className="eyebrow">Embed Config Required</div>
          <h1>缺少知识库参数</h1>
          <p>
            请通过当前前端访问地址传入固定知识库，推荐使用以下最简方式：
          </p>
          <code>
            /embed/kb-it-support?title=IT服务台
          </code>
          <p>若当前部署未配置前端路由重写，可改用：<code>?embed=1&amp;kb=kb-it-support</code></p>
          <p>兼容旧参数写法：<code>?mode=service-desk-embed&amp;knowledgeBaseId=kb-it-support</code></p>
          <p>嵌入后该会话将固定使用指定知识库，不提供切换能力。</p>
        </section>
      </main>
    )
  }

  return (
    <main className="service-desk-demo-page service-desk-embed-page">
      <FixedKnowledgeBaseWidget
        apiBaseUrl={apiBaseUrl}
        knowledgeBaseId={knowledgeBaseId}
        title={title}
        initialConversationId={initialConversationId}
        useStreaming={useStreaming}
        quickPrompts={quickPrompts}
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
          channel: 'frontend-url-embed',
          embedMode: 'iframe',
          hostPage,
        }}
      />
    </main>
  )
}

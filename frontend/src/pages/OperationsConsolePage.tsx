import { useCallback, useEffect, useMemo, useState } from 'react'
import type { KnowledgeBase } from '../App'
import './operationsConsole.css'

type GovernanceTab = 'faq' | 'gaps' | 'low-quality' | 'feedback'

interface FAQCandidate {
  id: string
  questionText: string
  answerText: string
  knowledgeBaseId?: string
  likeCount: number
  status: string
  updatedAt: string
}

interface KnowledgeGap {
  id: string
  questionText: string
  issueType: string
  knowledgeBaseId?: string
  suggestedAction?: string
  count: number
  status: string
  updatedAt: string
}

interface LowQualityAnswer {
  id: string
  questionText: string
  answerText: string
  knowledgeBaseId?: string
  primaryReason?: string
  dislikeCount: number
  status: string
  updatedAt: string
}

interface FeedbackItem {
  id: string
  questionText?: string
  answerText?: string
  knowledgeBaseId?: string
  feedbackType: string
  feedbackReason?: string
  feedbackText?: string
  createdAt: string
}

interface APIResponse<T> {
  success: boolean
  data?: T
  error?: {
    code?: string
    message?: string
  }
}

const API_BASE_PATH = ''

const governanceTabs: Array<{ key: GovernanceTab; label: string; description: string }> = [
  { key: 'faq', label: 'FAQ 候选', description: '把高赞回答转成可复用标准问答' },
  { key: 'gaps', label: '知识缺口', description: '查看高频缺失、过时或不完整的问题' },
  { key: 'low-quality', label: '低质量回答', description: '优先处理高频差评回答' },
  { key: 'feedback', label: '反馈明细', description: '回看原始点赞 / 点踩与补充说明' },
]

const statusOptions: Record<Exclude<GovernanceTab, 'feedback'>, Array<{ value: string; label: string }>> = {
  faq: [
    { value: 'candidate', label: '候选' },
    { value: 'approved', label: '已采纳' },
    { value: 'ignored', label: '忽略' },
  ],
  gaps: [
    { value: 'pending', label: '待处理' },
    { value: 'resolved', label: '已解决' },
    { value: 'ignored', label: '忽略' },
  ],
  'low-quality': [
    { value: 'open', label: '待处理' },
    { value: 'resolved', label: '已解决' },
    { value: 'ignored', label: '忽略' },
  ],
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  return fallback
}

async function requestJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const payload = await response.json().catch(() => ({})) as APIResponse<T>
  if (!response.ok || !payload.success) {
    throw new Error(payload.error?.message || `请求失败：${response.status}`)
  }
  return payload.data as T
}

function formatDate(value?: string) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString('zh-CN', { hour12: false })
}

export default function OperationsConsolePage() {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [activeTab, setActiveTab] = useState<GovernanceTab>('faq')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [faqCandidates, setFaqCandidates] = useState<FAQCandidate[]>([])
  const [knowledgeGaps, setKnowledgeGaps] = useState<KnowledgeGap[]>([])
  const [lowQualityAnswers, setLowQualityAnswers] = useState<LowQualityAnswer[]>([])
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([])
  const [updatingId, setUpdatingId] = useState('')

  const activeTabConfig = useMemo(
    () => governanceTabs.find((item) => item.key === activeTab) ?? governanceTabs[0],
    [activeTab],
  )

  const activeStatusOptions = activeTab === 'feedback' ? [] : statusOptions[activeTab]

  const loadKnowledgeBases = useCallback(async () => {
    const result = await fetch(`${API_BASE_PATH}/api/knowledge-bases`)
    const payload = await result.json().catch(() => ({ items: [] })) as { items?: KnowledgeBase[] }
    const items = payload.items ?? []
    setKnowledgeBases(items)
    setSelectedKnowledgeBaseId((current) => current || items[0]?.id || '')
  }, [])

  const loadGovernanceData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      params.set('limit', '50')
      if (selectedKnowledgeBaseId) {
        params.set('knowledgeBaseId', selectedKnowledgeBaseId)
      }
      if (statusFilter) {
        params.set('status', statusFilter)
      }

      if (activeTab === 'faq') {
        const data = await requestJSON<{ items: FAQCandidate[] }>(`${API_BASE_PATH}/api/service-desk/analytics/faq-candidates?${params.toString()}`)
        setFaqCandidates(data.items ?? [])
      } else if (activeTab === 'gaps') {
        const data = await requestJSON<{ items: KnowledgeGap[] }>(`${API_BASE_PATH}/api/service-desk/analytics/knowledge-gaps?${params.toString()}`)
        setKnowledgeGaps(data.items ?? [])
      } else if (activeTab === 'low-quality') {
        const data = await requestJSON<{ items: LowQualityAnswer[] }>(`${API_BASE_PATH}/api/service-desk/analytics/low-quality-answers?${params.toString()}`)
        setLowQualityAnswers(data.items ?? [])
      } else {
        const feedbackParams = new URLSearchParams(params)
        feedbackParams.set('feedbackType', 'dislike')
        const data = await requestJSON<{ items: FeedbackItem[] }>(`${API_BASE_PATH}/api/service-desk/analytics/feedback?${feedbackParams.toString()}`)
        setFeedbackItems(data.items ?? [])
      }
    } catch (fetchError) {
      setError(getErrorMessage(fetchError, '治理数据加载失败'))
    } finally {
      setLoading(false)
    }
  }, [activeTab, selectedKnowledgeBaseId, statusFilter])

  useEffect(() => {
    void loadKnowledgeBases()
  }, [loadKnowledgeBases])

  useEffect(() => {
    void loadGovernanceData()
  }, [loadGovernanceData])

  useEffect(() => {
    setStatusFilter('')
  }, [activeTab])

  const updateItemStatus = useCallback(async (tab: Exclude<GovernanceTab, 'feedback'>, id: string, status: string) => {
    setUpdatingId(id)
    setActionMessage('')
    setError('')
    try {
      const endpoint = tab === 'faq'
        ? 'faq-candidates'
        : tab === 'gaps'
          ? 'knowledge-gaps'
          : 'low-quality-answers'
      await requestJSON(`${API_BASE_PATH}/api/service-desk/analytics/${endpoint}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      setActionMessage(`已更新状态为“${status}”`)
      await loadGovernanceData()
    } catch (updateError) {
      setError(getErrorMessage(updateError, '状态更新失败'))
    } finally {
      setUpdatingId('')
    }
  }, [loadGovernanceData])

  return (
    <main className="ops-console-page">
      <section className="ops-console-hero">
        <div>
          <div className="ops-console-eyebrow">Operations Console</div>
          <h1>知识库治理工作台</h1>
          <p>
            这里给运营、交付和知识库维护同学一个最简单可用的治理入口。你可以直接查看 FAQ 候选、知识缺口、低质量回答和差评明细，并做基础状态流转。
          </p>
        </div>
        <div className="ops-console-summary-card">
          <div>接入方式</div>
          <code>?mode=ops-console</code>
          <code>/ops</code>
        </div>
      </section>

      <section className="ops-console-toolbar">
        <label>
          <span>知识库</span>
          <select value={selectedKnowledgeBaseId} onChange={(event) => setSelectedKnowledgeBaseId(event.target.value)}>
            <option value="">全部知识库</option>
            {knowledgeBases.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>状态筛选</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} disabled={activeTab === 'feedback'}>
            <option value="">全部状态</option>
            {activeStatusOptions.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
        <button type="button" className="ops-refresh-button" onClick={() => void loadGovernanceData()} disabled={loading}>
          {loading ? '刷新中...' : '刷新数据'}
        </button>
      </section>

      <section className="ops-console-tabs">
        {governanceTabs.map((item) => (
          <button
            key={item.key}
            type="button"
            className={item.key === activeTab ? 'is-active' : ''}
            onClick={() => setActiveTab(item.key)}
          >
            <strong>{item.label}</strong>
            <span>{item.description}</span>
          </button>
        ))}
      </section>

      {error ? <div className="ops-console-alert is-error">{error}</div> : null}
      {actionMessage ? <div className="ops-console-alert is-success">{actionMessage}</div> : null}

      <section className="ops-console-list">
        <header>
          <h2>{activeTabConfig.label}</h2>
          <p>{activeTabConfig.description}</p>
        </header>

        {activeTab === 'faq' && faqCandidates.length === 0 ? <div className="ops-empty">当前没有符合条件的 FAQ 候选。</div> : null}
        {activeTab === 'gaps' && knowledgeGaps.length === 0 ? <div className="ops-empty">当前没有符合条件的知识缺口。</div> : null}
        {activeTab === 'low-quality' && lowQualityAnswers.length === 0 ? <div className="ops-empty">当前没有符合条件的低质量回答。</div> : null}
        {activeTab === 'feedback' && feedbackItems.length === 0 ? <div className="ops-empty">当前没有符合条件的反馈记录。</div> : null}

        {activeTab === 'faq' && faqCandidates.map((item) => (
          <article key={item.id} className="ops-card">
            <div className="ops-card-head">
              <span className={`ops-status ops-status--${item.status}`}>{item.status}</span>
              <span>点赞 {item.likeCount}</span>
              <span>{formatDate(item.updatedAt)}</span>
            </div>
            <h3>{item.questionText}</h3>
            <p>{item.answerText}</p>
            <div className="ops-card-actions">
              {statusOptions.faq.map((option) => (
                <button key={option.value} type="button" disabled={updatingId === item.id || option.value === item.status} onClick={() => void updateItemStatus('faq', item.id, option.value)}>
                  {option.label}
                </button>
              ))}
            </div>
          </article>
        ))}

        {activeTab === 'gaps' && knowledgeGaps.map((item) => (
          <article key={item.id} className="ops-card">
            <div className="ops-card-head">
              <span className={`ops-status ops-status--${item.status}`}>{item.status}</span>
              <span>频次 {item.count}</span>
              <span>{formatDate(item.updatedAt)}</span>
            </div>
            <h3>{item.questionText}</h3>
            <p><strong>问题类型：</strong>{item.issueType}</p>
            {item.suggestedAction ? <p><strong>建议动作：</strong>{item.suggestedAction}</p> : null}
            <div className="ops-card-actions">
              {statusOptions.gaps.map((option) => (
                <button key={option.value} type="button" disabled={updatingId === item.id || option.value === item.status} onClick={() => void updateItemStatus('gaps', item.id, option.value)}>
                  {option.label}
                </button>
              ))}
            </div>
          </article>
        ))}

        {activeTab === 'low-quality' && lowQualityAnswers.map((item) => (
          <article key={item.id} className="ops-card">
            <div className="ops-card-head">
              <span className={`ops-status ops-status--${item.status}`}>{item.status}</span>
              <span>点踩 {item.dislikeCount}</span>
              <span>{formatDate(item.updatedAt)}</span>
            </div>
            <h3>{item.questionText}</h3>
            <p><strong>主要原因：</strong>{item.primaryReason || '未标注'}</p>
            <p>{item.answerText}</p>
            <div className="ops-card-actions">
              {statusOptions['low-quality'].map((option) => (
                <button key={option.value} type="button" disabled={updatingId === item.id || option.value === item.status} onClick={() => void updateItemStatus('low-quality', item.id, option.value)}>
                  {option.label}
                </button>
              ))}
            </div>
          </article>
        ))}

        {activeTab === 'feedback' && feedbackItems.map((item) => (
          <article key={item.id} className="ops-card">
            <div className="ops-card-head">
              <span className={`ops-status ops-status--${item.feedbackType}`}>{item.feedbackType}</span>
              <span>{item.feedbackReason || '未填写原因'}</span>
              <span>{formatDate(item.createdAt)}</span>
            </div>
            <h3>{item.questionText || '未记录问题正文'}</h3>
            <p>{item.answerText || '未记录回答正文'}</p>
            {item.feedbackText ? <p><strong>补充说明：</strong>{item.feedbackText}</p> : null}
          </article>
        ))}
      </section>
    </main>
  )
}

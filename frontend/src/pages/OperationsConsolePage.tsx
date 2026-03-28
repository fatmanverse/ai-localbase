import { useCallback, useEffect, useMemo, useState } from 'react'
import type { KnowledgeBase } from '../App'
import './operationsConsole.css'

type GovernanceTab = 'faq' | 'gaps' | 'low-quality' | 'feedback'
type EditableGovernanceTab = Exclude<GovernanceTab, 'feedback'>

interface GovernanceDraft {
  owner: string
  note: string
}

interface FAQPublishDraft {
  question: string
  answer: string
  publishedBy: string
  note: string
}

interface FAQCandidate {
  id: string
  questionText: string
  answerText: string
  knowledgeBaseId?: string
  likeCount: number
  status: string
  owner?: string
  note?: string
  updatedAt: string
  publishedQuestion?: string
  publishedAnswer?: string
  publishedBy?: string
  publishedAt?: string
  publishNote?: string
}

interface KnowledgeGap {
  id: string
  questionText: string
  issueType: string
  knowledgeBaseId?: string
  suggestedAction?: string
  count: number
  status: string
  owner?: string
  note?: string
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
  owner?: string
  note?: string
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

interface AnalyticsSummary {
  totalFeedbacks: number
  likeCount: number
  dislikeCount: number
  faqPendingCount: number
  knowledgeGapCount: number
  lowQualityOpenCount: number
  thisWeekDislikeCount: number
}

interface WeeklyReport {
  generatedAt: string
  knowledgeBaseId?: string
  knowledgeBaseName?: string
  highlights: string[]
  markdown: string
}

interface AnalyticsExportResponse {
  scope: string
  format: string
  fileName: string
  mimeType: string
  content: string
}

interface PublishFAQCandidateResponse {
  candidate: FAQCandidate
  export: AnalyticsExportResponse
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

const statusOptions: Record<EditableGovernanceTab, Array<{ value: string; label: string }>> = {
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

const emptySummary: AnalyticsSummary = {
  totalFeedbacks: 0,
  likeCount: 0,
  dislikeCount: 0,
  faqPendingCount: 0,
  knowledgeGapCount: 0,
  lowQualityOpenCount: 0,
  thisWeekDislikeCount: 0,
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

function getGovernanceEndpoint(tab: EditableGovernanceTab) {
  if (tab === 'faq') return 'faq-candidates'
  if (tab === 'gaps') return 'knowledge-gaps'
  return 'low-quality-answers'
}

function getExportScope(tab: GovernanceTab) {
  if (tab === 'faq') return 'faq-candidates'
  if (tab === 'gaps') return 'knowledge-gaps'
  if (tab === 'low-quality') return 'low-quality-answers'
  return 'feedback'
}

function buildDraftMap<T extends { id: string; owner?: string; note?: string }>(items: T[]): Record<string, GovernanceDraft> {
  return items.reduce<Record<string, GovernanceDraft>>((accumulator, item) => {
    accumulator[item.id] = {
      owner: item.owner ?? '',
      note: item.note ?? '',
    }
    return accumulator
  }, {})
}

function buildPublishDraftMap(items: FAQCandidate[]): Record<string, FAQPublishDraft> {
  return items.reduce<Record<string, FAQPublishDraft>>((accumulator, item) => {
    accumulator[item.id] = {
      question: item.publishedQuestion || item.questionText || '',
      answer: item.publishedAnswer || item.answerText || '',
      publishedBy: item.publishedBy || item.owner || '',
      note: item.publishNote || item.note || '',
    }
    return accumulator
  }, {})
}

function downloadTextFile(fileName: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType || 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName || 'export.txt'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export default function OperationsConsolePage() {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [activeTab, setActiveTab] = useState<GovernanceTab>('faq')
  const [loading, setLoading] = useState(false)
  const [batchUpdating, setBatchUpdating] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [publishingId, setPublishingId] = useState('')
  const [error, setError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [summary, setSummary] = useState<AnalyticsSummary>(emptySummary)
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null)
  const [faqCandidates, setFaqCandidates] = useState<FAQCandidate[]>([])
  const [knowledgeGaps, setKnowledgeGaps] = useState<KnowledgeGap[]>([])
  const [lowQualityAnswers, setLowQualityAnswers] = useState<LowQualityAnswer[]>([])
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([])
  const [faqDrafts, setFaqDrafts] = useState<Record<string, GovernanceDraft>>({})
  const [gapDrafts, setGapDrafts] = useState<Record<string, GovernanceDraft>>({})
  const [lowQualityDrafts, setLowQualityDrafts] = useState<Record<string, GovernanceDraft>>({})
  const [publishDrafts, setPublishDrafts] = useState<Record<string, FAQPublishDraft>>({})
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [updatingId, setUpdatingId] = useState('')
  const [batchStatus, setBatchStatus] = useState('')
  const [batchOwner, setBatchOwner] = useState('')
  const [batchNote, setBatchNote] = useState('')

  const activeTabConfig = useMemo(
    () => governanceTabs.find((item) => item.key === activeTab) ?? governanceTabs[0],
    [activeTab],
  )

  const editableActiveTab: EditableGovernanceTab | null = activeTab === 'feedback' ? null : activeTab
  const activeStatusOptions = editableActiveTab ? statusOptions[editableActiveTab] : []

  const currentEditableIds = useMemo(() => {
    if (activeTab === 'faq') return faqCandidates.map((item) => item.id)
    if (activeTab === 'gaps') return knowledgeGaps.map((item) => item.id)
    if (activeTab === 'low-quality') return lowQualityAnswers.map((item) => item.id)
    return []
  }, [activeTab, faqCandidates, knowledgeGaps, lowQualityAnswers])

  const allCurrentSelected = currentEditableIds.length > 0 && currentEditableIds.every((item) => selectedIds.includes(item))

  const resolveKnowledgeBaseName = useCallback((knowledgeBaseId?: string) => {
    const trimmed = knowledgeBaseId?.trim() ?? ''
    if (!trimmed) return '未绑定知识库'
    return knowledgeBases.find((item) => item.id === trimmed)?.name || trimmed
  }, [knowledgeBases])

  const loadKnowledgeBases = useCallback(async () => {
    const result = await fetch(`${API_BASE_PATH}/api/knowledge-bases`)
    const payload = await result.json().catch(() => ({ items: [] })) as { items?: KnowledgeBase[] }
    const items = payload.items ?? []
    setKnowledgeBases(items)
    setSelectedKnowledgeBaseId((current) => (items.some((item) => item.id === current) ? current : ''))
  }, [])

  const loadGovernanceData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const summaryParams = new URLSearchParams()
      if (selectedKnowledgeBaseId) {
        summaryParams.set('knowledgeBaseId', selectedKnowledgeBaseId)
      }

      const listParams = new URLSearchParams()
      listParams.set('limit', '50')
      if (selectedKnowledgeBaseId) {
        listParams.set('knowledgeBaseId', selectedKnowledgeBaseId)
      }
      if (statusFilter && editableActiveTab) {
        listParams.set('status', statusFilter)
      }
      if (ownerFilter.trim()) {
        listParams.set('owner', ownerFilter.trim())
      }

      const summaryPromise = requestJSON<AnalyticsSummary>(`${API_BASE_PATH}/api/service-desk/analytics/summary?${summaryParams.toString()}`)
      const weeklyReportPromise = requestJSON<WeeklyReport>(`${API_BASE_PATH}/api/service-desk/analytics/weekly-report?${summaryParams.toString()}`)
      let listPromise: Promise<{ items: FAQCandidate[] | KnowledgeGap[] | LowQualityAnswer[] | FeedbackItem[] }>

      if (activeTab === 'faq') {
        listPromise = requestJSON<{ items: FAQCandidate[] }>(`${API_BASE_PATH}/api/service-desk/analytics/faq-candidates?${listParams.toString()}`)
      } else if (activeTab === 'gaps') {
        listPromise = requestJSON<{ items: KnowledgeGap[] }>(`${API_BASE_PATH}/api/service-desk/analytics/knowledge-gaps?${listParams.toString()}`)
      } else if (activeTab === 'low-quality') {
        listPromise = requestJSON<{ items: LowQualityAnswer[] }>(`${API_BASE_PATH}/api/service-desk/analytics/low-quality-answers?${listParams.toString()}`)
      } else {
        const feedbackParams = new URLSearchParams(listParams)
        feedbackParams.set('feedbackType', 'dislike')
        listPromise = requestJSON<{ items: FeedbackItem[] }>(`${API_BASE_PATH}/api/service-desk/analytics/feedback?${feedbackParams.toString()}`)
      }

      const [summaryData, weeklyReportData, listData] = await Promise.all([summaryPromise, weeklyReportPromise, listPromise])
      setSummary(summaryData)
      setWeeklyReport(weeklyReportData)

      if (activeTab === 'faq') {
        const items = (listData.items ?? []) as FAQCandidate[]
        setFaqCandidates(items)
        setFaqDrafts(buildDraftMap(items))
        setPublishDrafts(buildPublishDraftMap(items))
      } else if (activeTab === 'gaps') {
        const items = (listData.items ?? []) as KnowledgeGap[]
        setKnowledgeGaps(items)
        setGapDrafts(buildDraftMap(items))
      } else if (activeTab === 'low-quality') {
        const items = (listData.items ?? []) as LowQualityAnswer[]
        setLowQualityAnswers(items)
        setLowQualityDrafts(buildDraftMap(items))
      } else {
        setFeedbackItems((listData.items ?? []) as FeedbackItem[])
      }
    } catch (fetchError) {
      setError(getErrorMessage(fetchError, '治理数据加载失败'))
    } finally {
      setLoading(false)
    }
  }, [activeTab, editableActiveTab, ownerFilter, selectedKnowledgeBaseId, statusFilter])

  useEffect(() => {
    void loadKnowledgeBases()
  }, [loadKnowledgeBases])

  useEffect(() => {
    void loadGovernanceData()
  }, [loadGovernanceData])

  useEffect(() => {
    setSelectedIds([])
    setBatchStatus('')
    setBatchOwner('')
    setBatchNote('')
  }, [activeTab, ownerFilter, selectedKnowledgeBaseId, statusFilter])

  const updateDraft = useCallback((tab: EditableGovernanceTab, id: string, field: keyof GovernanceDraft, value: string) => {
    if (tab === 'faq') {
      setFaqDrafts((current) => ({
        ...current,
        [id]: { ...(current[id] ?? { owner: '', note: '' }), [field]: value },
      }))
      return
    }
    if (tab === 'gaps') {
      setGapDrafts((current) => ({
        ...current,
        [id]: { ...(current[id] ?? { owner: '', note: '' }), [field]: value },
      }))
      return
    }
    setLowQualityDrafts((current) => ({
      ...current,
      [id]: { ...(current[id] ?? { owner: '', note: '' }), [field]: value },
    }))
  }, [])

  const getDraft = useCallback((tab: EditableGovernanceTab, id: string): GovernanceDraft => {
    if (tab === 'faq') return faqDrafts[id] ?? { owner: '', note: '' }
    if (tab === 'gaps') return gapDrafts[id] ?? { owner: '', note: '' }
    return lowQualityDrafts[id] ?? { owner: '', note: '' }
  }, [faqDrafts, gapDrafts, lowQualityDrafts])

  const updatePublishDraft = useCallback((id: string, field: keyof FAQPublishDraft, value: string) => {
    setPublishDrafts((current) => ({
      ...current,
      [id]: { ...(current[id] ?? { question: '', answer: '', publishedBy: '', note: '' }), [field]: value },
    }))
  }, [])

  const getPublishDraft = useCallback((id: string): FAQPublishDraft => (
    publishDrafts[id] ?? { question: '', answer: '', publishedBy: '', note: '' }
  ), [publishDrafts])

  const updateItemStatus = useCallback(async (tab: EditableGovernanceTab, id: string, status: string) => {
    setUpdatingId(id)
    setError('')
    setActionMessage('')
    try {
      await requestJSON(`${API_BASE_PATH}/api/service-desk/analytics/${getGovernanceEndpoint(tab)}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      setActionMessage(`已更新为“${status}”`)
      await loadGovernanceData()
    } catch (updateError) {
      setError(getErrorMessage(updateError, '状态更新失败'))
    } finally {
      setUpdatingId('')
    }
  }, [loadGovernanceData])

  const saveItemDraft = useCallback(async (tab: EditableGovernanceTab, id: string) => {
    const draft = getDraft(tab, id)
    setUpdatingId(id)
    setError('')
    setActionMessage('')
    try {
      await requestJSON(`${API_BASE_PATH}/api/service-desk/analytics/${getGovernanceEndpoint(tab)}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: draft.owner, note: draft.note }),
      })
      setActionMessage('已保存责任人和处理备注')
      await loadGovernanceData()
    } catch (updateError) {
      setError(getErrorMessage(updateError, '保存处理信息失败'))
    } finally {
      setUpdatingId('')
    }
  }, [getDraft, loadGovernanceData])

  const publishFAQCandidate = useCallback(async (item: FAQCandidate) => {
    const draft = getPublishDraft(item.id)
    setPublishingId(item.id)
    setError('')
    setActionMessage('')
    try {
      const result = await requestJSON<PublishFAQCandidateResponse>(`${API_BASE_PATH}/api/service-desk/analytics/faq-candidates/${item.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: draft.question,
          answer: draft.answer,
          publishedBy: draft.publishedBy,
          note: draft.note,
        }),
      })
      downloadTextFile(result.export.fileName, result.export.content, result.export.mimeType)
      setActionMessage('FAQ 草稿已生成，并已自动下载 Markdown 文件')
      await loadGovernanceData()
    } catch (publishError) {
      setError(getErrorMessage(publishError, 'FAQ 草稿生成失败'))
    } finally {
      setPublishingId('')
    }
  }, [getPublishDraft, loadGovernanceData])

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }, [])

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((current) => (allCurrentSelected ? current.filter((id) => !currentEditableIds.includes(id)) : currentEditableIds))
  }, [allCurrentSelected, currentEditableIds])

  const applyBatchUpdate = useCallback(async () => {
    if (!editableActiveTab || selectedIds.length === 0) {
      return
    }
    const payload: Record<string, unknown> = { ids: selectedIds }
    if (batchStatus) payload.status = batchStatus
    if (batchOwner.trim()) payload.owner = batchOwner.trim()
    if (batchNote.trim()) payload.note = batchNote.trim()
    if (Object.keys(payload).length === 1) {
      setError('请至少填写一个批量更新项')
      return
    }

    setBatchUpdating(true)
    setError('')
    setActionMessage('')
    try {
      await requestJSON(`${API_BASE_PATH}/api/service-desk/analytics/${getGovernanceEndpoint(editableActiveTab)}/batch`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setActionMessage(`已批量处理 ${selectedIds.length} 条治理项`)
      setSelectedIds([])
      setBatchStatus('')
      setBatchOwner('')
      setBatchNote('')
      await loadGovernanceData()
    } catch (updateError) {
      setError(getErrorMessage(updateError, '批量更新失败'))
    } finally {
      setBatchUpdating(false)
    }
  }, [batchNote, batchOwner, batchStatus, editableActiveTab, loadGovernanceData, selectedIds])

  const exportCurrentView = useCallback(async () => {
    setExporting(true)
    setError('')
    setActionMessage('')
    try {
      const params = new URLSearchParams()
      params.set('scope', getExportScope(activeTab))
      params.set('format', 'markdown')
      params.set('limit', '200')
      if (selectedKnowledgeBaseId) params.set('knowledgeBaseId', selectedKnowledgeBaseId)
      if (statusFilter && editableActiveTab) params.set('status', statusFilter)
      if (ownerFilter.trim()) params.set('owner', ownerFilter.trim())
      if (activeTab === 'feedback') params.set('feedbackType', 'dislike')
      const result = await requestJSON<AnalyticsExportResponse>(`${API_BASE_PATH}/api/service-desk/analytics/export?${params.toString()}`)
      downloadTextFile(result.fileName, result.content, result.mimeType)
      setActionMessage('当前视图已导出为 Markdown')
    } catch (exportError) {
      setError(getErrorMessage(exportError, '导出失败'))
    } finally {
      setExporting(false)
    }
  }, [activeTab, editableActiveTab, ownerFilter, selectedKnowledgeBaseId, statusFilter])

  const downloadWeeklyReport = useCallback(async () => {
    setExporting(true)
    setError('')
    setActionMessage('')
    try {
      const params = new URLSearchParams()
      params.set('scope', 'weekly-report')
      params.set('format', 'markdown')
      if (selectedKnowledgeBaseId) params.set('knowledgeBaseId', selectedKnowledgeBaseId)
      const result = await requestJSON<AnalyticsExportResponse>(`${API_BASE_PATH}/api/service-desk/analytics/export?${params.toString()}`)
      downloadTextFile(result.fileName, result.content, result.mimeType)
      setActionMessage('本周治理周报已导出')
    } catch (exportError) {
      setError(getErrorMessage(exportError, '周报导出失败'))
    } finally {
      setExporting(false)
    }
  }, [selectedKnowledgeBaseId])

  return (
    <main className="ops-console-page">
      <section className="ops-console-hero">
        <div>
          <div className="ops-console-eyebrow">Operations Console</div>
          <h1>知识库治理工作台</h1>
          <p>
            这里给运营、交付和知识库维护同学一个最简单可用的治理入口。你可以直接查看 FAQ 候选、知识缺口、低质量回答和差评明细，顺手补责任人、处理备注、导出当前视图，并把高赞回答整理成正式 FAQ 草稿。
          </p>
        </div>
        <div className="ops-console-summary-card">
          <div>接入方式</div>
          <code>?mode=ops-console</code>
          <code>/ops</code>
        </div>
      </section>

      <section className="ops-console-metrics">
        <article className="ops-metric-card">
          <span>待处理 FAQ</span>
          <strong>{summary.faqPendingCount}</strong>
          <p>适合沉淀为标准问答的高赞回答</p>
        </article>
        <article className="ops-metric-card">
          <span>待补知识缺口</span>
          <strong>{summary.knowledgeGapCount}</strong>
          <p>优先补高频缺失、过时或不完整内容</p>
        </article>
        <article className="ops-metric-card">
          <span>待处理低质量回答</span>
          <strong>{summary.lowQualityOpenCount}</strong>
          <p>优先复盘高频差评与答非所问</p>
        </article>
        <article className="ops-metric-card">
          <span>本周差评</span>
          <strong>{summary.thisWeekDislikeCount}</strong>
          <p>结合点赞 {summary.likeCount} / 点踩 {summary.dislikeCount} 做周度复盘</p>
        </article>
      </section>

      <section className="ops-console-report-card">
        <div>
          <h2>本周治理重点</h2>
          <p>{weeklyReport ? `更新时间：${formatDate(weeklyReport.generatedAt)}` : '正在整理本周治理概览...'}</p>
        </div>
        <div className="ops-report-actions">
          <button type="button" className="ops-secondary-button" onClick={() => void loadGovernanceData()} disabled={loading}>
            {loading ? '刷新中...' : '刷新周报'}
          </button>
          <button type="button" className="ops-refresh-button" onClick={() => void downloadWeeklyReport()} disabled={exporting || !weeklyReport}>
            {exporting ? '处理中...' : '导出本周周报'}
          </button>
        </div>
        <ul>
          {(weeklyReport?.highlights ?? ['当前还没有生成治理重点。']).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
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
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} disabled={!editableActiveTab}>
            <option value="">全部状态</option>
            {activeStatusOptions.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>责任人筛选</span>
          <input value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} placeholder="例如 ops-zhangsan" />
        </label>
        <div className="ops-toolbar-stat">
          <strong>{summary.totalFeedbacks}</strong>
          <span>累计反馈</span>
        </div>
        <button type="button" className="ops-secondary-button" onClick={() => void exportCurrentView()} disabled={exporting}>
          {exporting ? '导出中...' : '导出当前视图'}
        </button>
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

      {editableActiveTab ? (
        <section className="ops-console-batch">
          <div className="ops-batch-summary">
            <strong>已选 {selectedIds.length}</strong>
            <span>支持一键指派责任人、补处理备注、批量流转状态</span>
          </div>
          <button type="button" className="ops-secondary-button" onClick={toggleSelectAll} disabled={currentEditableIds.length === 0}>
            {allCurrentSelected ? '取消全选当前列表' : '全选当前列表'}
          </button>
          <label>
            <span>批量状态</span>
            <select value={batchStatus} onChange={(event) => setBatchStatus(event.target.value)}>
              <option value="">不修改</option>
              {statusOptions[editableActiveTab].map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>批量责任人</span>
            <input value={batchOwner} onChange={(event) => setBatchOwner(event.target.value)} placeholder="例如 ops-zhangsan" />
          </label>
          <label className="ops-batch-note">
            <span>批量备注</span>
            <input value={batchNote} onChange={(event) => setBatchNote(event.target.value)} placeholder="例如 已补文档并重新索引" />
          </label>
          <button type="button" className="ops-refresh-button" onClick={() => void applyBatchUpdate()} disabled={batchUpdating || selectedIds.length === 0}>
            {batchUpdating ? '提交中...' : '批量应用'}
          </button>
        </section>
      ) : null}

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

        {activeTab === 'faq' && faqCandidates.map((item) => {
          const draft = getDraft('faq', item.id)
          const publishDraft = getPublishDraft(item.id)
          return (
            <article key={item.id} className="ops-card">
              <div className="ops-card-head">
                <label className="ops-card-select">
                  <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelected(item.id)} />
                  <span>勾选</span>
                </label>
                <span className={`ops-status ops-status--${item.status}`}>{item.status}</span>
                <span>点赞 {item.likeCount}</span>
                <span>{resolveKnowledgeBaseName(item.knowledgeBaseId)}</span>
                <span>{item.owner ? `责任人 ${item.owner}` : '待分配责任人'}</span>
                {item.publishedAt ? <span>{`已整理 ${formatDate(item.publishedAt)}`}</span> : <span>尚未整理 FAQ 文稿</span>}
                <span>{formatDate(item.updatedAt)}</span>
              </div>
              <h3>{item.questionText}</h3>
              <p>{item.answerText}</p>
              <div className="ops-card-editor">
                <label>
                  <span>责任人</span>
                  <input value={draft.owner} onChange={(event) => updateDraft('faq', item.id, 'owner', event.target.value)} placeholder="例如 ops-zhangsan" />
                </label>
                <label className="is-note">
                  <span>处理备注</span>
                  <textarea value={draft.note} onChange={(event) => updateDraft('faq', item.id, 'note', event.target.value)} placeholder="补充一下这条 FAQ 已经如何落地" rows={3} />
                </label>
              </div>
              <div className="ops-publish-editor">
                <label>
                  <span>FAQ 标准问题</span>
                  <input value={publishDraft.question} onChange={(event) => updatePublishDraft(item.id, 'question', event.target.value)} placeholder="整理成最终对外问题标题" />
                </label>
                <label>
                  <span>整理人</span>
                  <input value={publishDraft.publishedBy} onChange={(event) => updatePublishDraft(item.id, 'publishedBy', event.target.value)} placeholder="例如 ops-faq" />
                </label>
                <label className="is-answer">
                  <span>FAQ 标准回答</span>
                  <textarea value={publishDraft.answer} onChange={(event) => updatePublishDraft(item.id, 'answer', event.target.value)} rows={4} placeholder="整理后的最终 FAQ 回答内容" />
                </label>
                <label className="is-note">
                  <span>FAQ 备注</span>
                  <textarea value={publishDraft.note} onChange={(event) => updatePublishDraft(item.id, 'note', event.target.value)} rows={3} placeholder="例如 已整理到对外帮助中心，待审核上线" />
                </label>
              </div>
              <div className="ops-card-actions">
                {statusOptions.faq.map((option) => (
                  <button key={option.value} type="button" disabled={updatingId === item.id || option.value === item.status} onClick={() => void updateItemStatus('faq', item.id, option.value)}>
                    {option.label}
                  </button>
                ))}
                <button type="button" className="ops-primary-button" disabled={updatingId === item.id} onClick={() => void saveItemDraft('faq', item.id)}>
                  保存责任人 / 备注
                </button>
                <button type="button" className="ops-refresh-button" disabled={publishingId === item.id} onClick={() => void publishFAQCandidate(item)}>
                  {publishingId === item.id ? '生成中...' : '生成 FAQ 草稿'}
                </button>
              </div>
            </article>
          )
        })}

        {activeTab === 'gaps' && knowledgeGaps.map((item) => {
          const draft = getDraft('gaps', item.id)
          return (
            <article key={item.id} className="ops-card">
              <div className="ops-card-head">
                <label className="ops-card-select">
                  <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelected(item.id)} />
                  <span>勾选</span>
                </label>
                <span className={`ops-status ops-status--${item.status}`}>{item.status}</span>
                <span>频次 {item.count}</span>
                <span>{resolveKnowledgeBaseName(item.knowledgeBaseId)}</span>
                <span>{item.owner ? `责任人 ${item.owner}` : '待分配责任人'}</span>
                <span>{formatDate(item.updatedAt)}</span>
              </div>
              <h3>{item.questionText}</h3>
              <p><strong>问题类型：</strong>{item.issueType}</p>
              {item.suggestedAction ? <p><strong>建议动作：</strong>{item.suggestedAction}</p> : null}
              <div className="ops-card-editor">
                <label>
                  <span>责任人</span>
                  <input value={draft.owner} onChange={(event) => updateDraft('gaps', item.id, 'owner', event.target.value)} placeholder="例如 delivery-li" />
                </label>
                <label className="is-note">
                  <span>处理备注</span>
                  <textarea value={draft.note} onChange={(event) => updateDraft('gaps', item.id, 'note', event.target.value)} placeholder="记录这条知识缺口已经如何处理" rows={3} />
                </label>
              </div>
              <div className="ops-card-actions">
                {statusOptions.gaps.map((option) => (
                  <button key={option.value} type="button" disabled={updatingId === item.id || option.value === item.status} onClick={() => void updateItemStatus('gaps', item.id, option.value)}>
                    {option.label}
                  </button>
                ))}
                <button type="button" className="ops-primary-button" disabled={updatingId === item.id} onClick={() => void saveItemDraft('gaps', item.id)}>
                  保存责任人 / 备注
                </button>
              </div>
            </article>
          )
        })}

        {activeTab === 'low-quality' && lowQualityAnswers.map((item) => {
          const draft = getDraft('low-quality', item.id)
          return (
            <article key={item.id} className="ops-card">
              <div className="ops-card-head">
                <label className="ops-card-select">
                  <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelected(item.id)} />
                  <span>勾选</span>
                </label>
                <span className={`ops-status ops-status--${item.status}`}>{item.status}</span>
                <span>点踩 {item.dislikeCount}</span>
                <span>{resolveKnowledgeBaseName(item.knowledgeBaseId)}</span>
                <span>{item.owner ? `责任人 ${item.owner}` : '待分配责任人'}</span>
                <span>{formatDate(item.updatedAt)}</span>
              </div>
              <h3>{item.questionText}</h3>
              <p><strong>主要原因：</strong>{item.primaryReason || '未标注'}</p>
              <p>{item.answerText}</p>
              <div className="ops-card-editor">
                <label>
                  <span>责任人</span>
                  <input value={draft.owner} onChange={(event) => updateDraft('low-quality', item.id, 'owner', event.target.value)} placeholder="例如 rag-ops" />
                </label>
                <label className="is-note">
                  <span>处理备注</span>
                  <textarea value={draft.note} onChange={(event) => updateDraft('low-quality', item.id, 'note', event.target.value)} placeholder="记录召回、知识补充或答案策略优化动作" rows={3} />
                </label>
              </div>
              <div className="ops-card-actions">
                {statusOptions['low-quality'].map((option) => (
                  <button key={option.value} type="button" disabled={updatingId === item.id || option.value === item.status} onClick={() => void updateItemStatus('low-quality', item.id, option.value)}>
                    {option.label}
                  </button>
                ))}
                <button type="button" className="ops-primary-button" disabled={updatingId === item.id} onClick={() => void saveItemDraft('low-quality', item.id)}>
                  保存责任人 / 备注
                </button>
              </div>
            </article>
          )
        })}

        {activeTab === 'feedback' && feedbackItems.map((item) => (
          <article key={item.id} className="ops-card">
            <div className="ops-card-head">
              <span className={`ops-status ops-status--${item.feedbackType}`}>{item.feedbackType}</span>
              <span>{item.feedbackReason || '未填写原因'}</span>
              <span>{resolveKnowledgeBaseName(item.knowledgeBaseId)}</span>
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

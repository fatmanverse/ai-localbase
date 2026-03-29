import { useCallback, useEffect, useMemo, useState } from 'react'
import type { KnowledgeBase } from '../App'
import './operationsConsole.css'

type GovernanceTab = 'faq' | 'gaps' | 'low-quality' | 'feedback'
type EditableGovernanceTab = Exclude<GovernanceTab, 'feedback'>

interface GovernanceDraft {
  owner: string
  note: string
}

type FAQHistoryExportFormat = 'markdown' | 'json'

interface FAQPublishDraft {
  question: string
  answer: string
  publishedBy: string
  note: string
  knowledgeBaseId: string
  documentName: string
  publishMode: string
  targetDocumentId: string
  markAsDefaultCollection: boolean
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
  lastPublishedKnowledgeBaseId?: string
  lastPublishedDocumentId?: string
  lastPublishedDocumentName?: string
  lastPublishMode?: string
  lastPublishedToKnowledgeAt?: string
  knowledgeBasePublishCount?: number
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

interface PublishedKnowledgeBaseDocument {
  id: string
  knowledgeBaseId: string
  name: string
  status: string
  contentPreview: string
  isFaqCollection?: boolean
  isDefaultFaqCollection?: boolean
}

interface PublishFAQToKnowledgeBaseResponse {
  candidate: FAQCandidate
  export: AnalyticsExportResponse
  document: PublishedKnowledgeBaseDocument
}

interface FAQPublishHistoryItem {
  id: string
  faqCandidateId: string
  knowledgeBaseId: string
  documentId: string
  documentName: string
  publishMode: string
  publishedBy?: string
  publishedAt: string
  questionText?: string
  answerText?: string
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

function resolveInitialGovernanceTab(): GovernanceTab {
  const params = new URLSearchParams(window.location.search)
  const tab = params.get('tab')?.trim().toLowerCase() ?? ''
  if (tab === 'faq' || tab === 'gaps' || tab === 'low-quality' || tab === 'feedback') {
    return tab
  }
  return 'faq'
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

function buildDefaultFAQDocumentName(question?: string) {
  const trimmed = question?.trim() ?? ''
  if (!trimmed) return ''
  const title = Array.from(trimmed).slice(0, 48).join('')
  return `FAQ-${title}.md`
}

function normalizeDocumentText(value?: string) {
  return (value || '').trim().toLowerCase()
}

function isFAQDocumentCandidate(document: PublishedKnowledgeBaseDocument) {
  const haystack = `${normalizeDocumentText(document.name)} ${normalizeDocumentText(document.contentPreview)}`
  if (!haystack) return false
  return /faq|常见问题|常见问答|问答|合集|汇总|帮助中心/.test(haystack) || haystack.includes('ai-localbase-faq-entry')
}

function pickRecommendedFAQDocument(item: FAQCandidate, knowledgeBaseId: string, documents: PublishedKnowledgeBaseDocument[]) {
  if (!knowledgeBaseId || documents.length === 0) return ''
  const preferredKnowledgeBaseId = item.lastPublishedKnowledgeBaseId?.trim() || ''
  const preferredDocumentId = item.lastPublishedDocumentId?.trim() || ''
  if (preferredKnowledgeBaseId === knowledgeBaseId && preferredDocumentId && documents.some((document) => document.id === preferredDocumentId)) {
    return preferredDocumentId
  }

  const preferredDocumentName = normalizeDocumentText(item.lastPublishedDocumentName)
  const scored = documents
    .map((document, index) => {
      let score = 0
      if (preferredDocumentName && normalizeDocumentText(document.name) === preferredDocumentName) score += 80
      if (document.isDefaultFaqCollection) score += 100
      if (document.isFaqCollection) score += 30
      if (isFAQDocumentCandidate(document)) score += 20
      if (/合集|汇总|总览|大全/.test(document.name)) score += 10
      return { document, index, score }
    })
    .sort((left, right) => {
      if (left.score === right.score) return left.index - right.index
      return right.score - left.score
    })

  return scored[0]?.score > 0 ? scored[0].document.id : ''
}

function formatPublishModeLabel(mode?: string) {
  if (mode === 'append_to_document') return '追加到现有文档'
  if (mode === 'replace_document') return '覆盖目标文档'
  if (mode === 'create_new') return '新建 FAQ 文档'
  return '未记录'
}

function formatDocumentOptionLabel(document: PublishedKnowledgeBaseDocument) {
  if (document.isDefaultFaqCollection) return `${document.name}（默认 FAQ 合集）`
  if (document.isFaqCollection) return `${document.name}（FAQ 文档）`
  return document.name
}

function findDefaultFAQDocument(documents: PublishedKnowledgeBaseDocument[]) {
  return documents.find((document) => document.isDefaultFaqCollection)
}

function collectPublishHistoryDocumentNames(items: FAQPublishHistoryItem[]) {
  const documents = new Map<string, string>()
  items.forEach((item) => {
    const key = item.documentId?.trim() || item.documentName?.trim()
    if (!key) return
    documents.set(key, item.documentName?.trim() || item.documentId?.trim() || '未命名文档')
  })
  return Array.from(documents.values())
}

function buildPublishHistoryHint(item: FAQCandidate, historyItems: FAQPublishHistoryItem[]) {
  const documentNames = collectPublishHistoryDocumentNames(historyItems)
  if (documentNames.length > 1) {
    return `这条 FAQ 目前已经分散到 ${documentNames.length} 份文档：${documentNames.join('、')}。建议收敛到统一 FAQ 合集，后续维护会更轻松。`
  }
  if (historyItems.length === 0 && (item.knowledgeBasePublishCount ?? 0) > 1) {
    return `这条 FAQ 已经发布 ${(item.knowledgeBasePublishCount ?? 0)} 次，建议先看一下发布历史，确认有没有分散到多个 FAQ 文档。`
  }
  return ''
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
    const question = item.publishedQuestion || item.questionText || ''
    const reusedKnowledgeBaseId = item.lastPublishedKnowledgeBaseId || item.knowledgeBaseId || ''
    const reusedDocumentId = item.lastPublishedDocumentId || ''
    accumulator[item.id] = {
      question,
      answer: item.publishedAnswer || item.answerText || '',
      publishedBy: item.publishedBy || item.owner || '',
      note: item.publishNote || item.note || '',
      knowledgeBaseId: reusedKnowledgeBaseId,
      documentName: buildDefaultFAQDocumentName(question),
      publishMode: reusedDocumentId ? 'append_to_document' : 'create_new',
      targetDocumentId: reusedDocumentId,
      markAsDefaultCollection: false,
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
  const [activeTab, setActiveTab] = useState<GovernanceTab>(() => resolveInitialGovernanceTab())
  const [loading, setLoading] = useState(false)
  const [batchUpdating, setBatchUpdating] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [publishingId, setPublishingId] = useState('')
  const [publishingToKnowledgeBaseId, setPublishingToKnowledgeBaseId] = useState('')
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
  const [knowledgeBaseDocuments, setKnowledgeBaseDocuments] = useState<Record<string, PublishedKnowledgeBaseDocument[]>>({})
  const [publishHistoryMap, setPublishHistoryMap] = useState<Record<string, FAQPublishHistoryItem[]>>({})
  const [historyLoadingId, setHistoryLoadingId] = useState('')
  const [historyExportingId, setHistoryExportingId] = useState('')
  const [historyExportFormatMap, setHistoryExportFormatMap] = useState<Record<string, FAQHistoryExportFormat>>({})
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<string[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [updatingId, setUpdatingId] = useState('')
  const [batchStatus, setBatchStatus] = useState('')
  const [batchOwner, setBatchOwner] = useState('')
  const [batchNote, setBatchNote] = useState('')

  const activeTabConfig = useMemo(
    () => governanceTabs.find((item) => item.key === activeTab) ?? governanceTabs[0],
    [activeTab],
  )

  useEffect(() => {
    const nextURL = new URL(window.location.href)
    nextURL.searchParams.set('mode', 'ops')
    nextURL.searchParams.set('tab', activeTab)
    window.history.replaceState({}, '', nextURL.toString())
  }, [activeTab])

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

  const loadKnowledgeBaseDocuments = useCallback(async (knowledgeBaseId: string, force = false): Promise<PublishedKnowledgeBaseDocument[]> => {
    const trimmed = knowledgeBaseId.trim()
    if (!trimmed) return []
    if (!force && knowledgeBaseDocuments[trimmed]) return knowledgeBaseDocuments[trimmed]
    const response = await fetch(`${API_BASE_PATH}/api/knowledge-bases/${trimmed}/documents`)
    const payload = await response.json().catch(() => ({ items: [] })) as { items?: PublishedKnowledgeBaseDocument[] }
    const items = payload.items ?? []
    setKnowledgeBaseDocuments((current) => ({ ...current, [trimmed]: items }))
    return items
  }, [knowledgeBaseDocuments])

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
    if (activeTab !== 'faq') return
    const knowledgeBaseIds = Array.from(new Set(faqCandidates.map((item) => (item.lastPublishedKnowledgeBaseId || item.knowledgeBaseId || '').trim()).filter(Boolean)))
    knowledgeBaseIds.forEach((knowledgeBaseId) => {
      if (!knowledgeBaseDocuments[knowledgeBaseId]) {
        void loadKnowledgeBaseDocuments(knowledgeBaseId)
      }
    })
  }, [activeTab, faqCandidates, knowledgeBaseDocuments, loadKnowledgeBaseDocuments])

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

  const updatePublishDraft = useCallback((id: string, field: keyof FAQPublishDraft, value: string | boolean) => {
    setPublishDrafts((current) => ({
      ...current,
      [id]: { ...(current[id] ?? { question: '', answer: '', publishedBy: '', note: '', knowledgeBaseId: '', documentName: '', publishMode: 'create_new', targetDocumentId: '', markAsDefaultCollection: false }), [field]: value },
    }))
  }, [])

  const getPublishDraft = useCallback((id: string): FAQPublishDraft => (
    publishDrafts[id] ?? { question: '', answer: '', publishedBy: '', note: '', knowledgeBaseId: '', documentName: '', publishMode: 'create_new', targetDocumentId: '', markAsDefaultCollection: false }
  ), [publishDrafts])

  const loadFAQPublishHistory = useCallback(async (faqCandidateId: string, force = false): Promise<FAQPublishHistoryItem[]> => {
    const trimmed = faqCandidateId.trim()
    if (!trimmed) return []
    if (!force && publishHistoryMap[trimmed]) return publishHistoryMap[trimmed]
    const result = await requestJSON<{ items?: FAQPublishHistoryItem[] }>(`${API_BASE_PATH}/api/service-desk/analytics/faq-candidates/${trimmed}/publish-history?limit=10`)
    const items = result.items ?? []
    setPublishHistoryMap((current) => ({ ...current, [trimmed]: items }))
    return items
  }, [publishHistoryMap])

  const recommendFAQDocument = useCallback(async (item: FAQCandidate, knowledgeBaseId: string, publishMode: string) => {
    const trimmedKnowledgeBaseId = knowledgeBaseId.trim()
    if (!trimmedKnowledgeBaseId || publishMode === 'create_new') return
    const documents = await loadKnowledgeBaseDocuments(trimmedKnowledgeBaseId)
    const recommendedDocumentId = pickRecommendedFAQDocument(item, trimmedKnowledgeBaseId, documents)
    if (recommendedDocumentId) {
      updatePublishDraft(item.id, 'targetDocumentId', recommendedDocumentId)
    }
  }, [loadKnowledgeBaseDocuments, updatePublishDraft])

  const submitPublishToKnowledgeBase = useCallback(async (item: FAQCandidate, draft: FAQPublishDraft) => {
    const result = await requestJSON<PublishFAQToKnowledgeBaseResponse>(`${API_BASE_PATH}/api/service-desk/analytics/faq-candidates/${item.id}/publish-to-kb`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: draft.question,
        answer: draft.answer,
        publishedBy: draft.publishedBy,
        note: draft.note,
        knowledgeBaseId: draft.knowledgeBaseId,
        documentName: draft.publishMode === 'create_new' ? draft.documentName : '',
        publishMode: draft.publishMode,
        targetDocumentId: draft.targetDocumentId,
        markAsDefaultCollection: draft.markAsDefaultCollection,
      }),
    })
    setActionMessage(draft.publishMode === 'create_new' ? `FAQ 已写入知识库文档：${result.document.name}` : `FAQ 已合并到知识库文档：${result.document.name}`)
    await loadKnowledgeBaseDocuments(draft.knowledgeBaseId, true)
    await loadGovernanceData()
    await loadFAQPublishHistory(item.id, true)
  }, [loadFAQPublishHistory, loadGovernanceData, loadKnowledgeBaseDocuments])

  const togglePublishHistory = useCallback(async (item: FAQCandidate) => {
    const exists = expandedHistoryIds.includes(item.id)
    if (exists) {
      setExpandedHistoryIds((current) => current.filter((id) => id !== item.id))
      return
    }
    setExpandedHistoryIds((current) => [...current, item.id])
    setHistoryLoadingId(item.id)
    setError('')
    try {
      await loadFAQPublishHistory(item.id)
    } catch (historyError) {
      setError(getErrorMessage(historyError, 'FAQ 发布历史加载失败'))
    } finally {
      setHistoryLoadingId('')
    }
  }, [expandedHistoryIds, loadFAQPublishHistory])

  const exportFAQPublishHistory = useCallback(async (item: FAQCandidate, format: FAQHistoryExportFormat = 'markdown') => {
    setHistoryExportingId(item.id)
    setError('')
    setActionMessage('')
    try {
      const params = new URLSearchParams()
      params.set('limit', '50')
      params.set('format', format)
      const result = await requestJSON<AnalyticsExportResponse>(`${API_BASE_PATH}/api/service-desk/analytics/faq-candidates/${item.id}/publish-history/export?${params.toString()}`)
      downloadTextFile(result.fileName, result.content, result.mimeType)
      setActionMessage(format === 'json' ? 'FAQ 发布历史已导出为 JSON' : 'FAQ 发布历史已导出为 Markdown')
    } catch (exportError) {
      setError(getErrorMessage(exportError, 'FAQ 发布历史导出失败'))
    } finally {
      setHistoryExportingId('')
    }
  }, [])

  const publishFAQToDefaultCollection = useCallback(async (item: FAQCandidate) => {
    const baseDraft = getPublishDraft(item.id)
    const knowledgeBaseId = (baseDraft.knowledgeBaseId || item.lastPublishedKnowledgeBaseId || item.knowledgeBaseId || '').trim()
    if (!knowledgeBaseId) {
      setError('请先为这条 FAQ 选择目标知识库，或者先把它发布过一次到知识库。')
      return
    }

    setPublishingToKnowledgeBaseId(item.id)
    setError('')
    setActionMessage('')
    try {
      const documents = await loadKnowledgeBaseDocuments(knowledgeBaseId)
      const defaultDocument = findDefaultFAQDocument(documents)
      if (!defaultDocument) {
        throw new Error('当前知识库还没有默认 FAQ 合集，请先手动设置一份默认 FAQ 合集文档。')
      }
      const draft: FAQPublishDraft = {
        ...baseDraft,
        knowledgeBaseId,
        publishMode: 'append_to_document',
        targetDocumentId: defaultDocument.id,
        documentName: '',
        markAsDefaultCollection: true,
      }
      await submitPublishToKnowledgeBase(item, draft)
      setPublishDrafts((current) => ({ ...current, [item.id]: draft }))
      setActionMessage(`FAQ 已同步到默认 FAQ 合集：${defaultDocument.name}`)
    } catch (publishError) {
      setError(getErrorMessage(publishError, '发布到默认 FAQ 合集失败'))
    } finally {
      setPublishingToKnowledgeBaseId('')
    }
  }, [getPublishDraft, loadKnowledgeBaseDocuments, submitPublishToKnowledgeBase])

  const markDocumentAsDefaultFAQCollection = useCallback(async (knowledgeBaseId: string, documentId: string) => {
    if (!knowledgeBaseId.trim() || !documentId.trim()) return
    setError('')
    setActionMessage('')
    try {
      await requestJSON<PublishedKnowledgeBaseDocument>(`${API_BASE_PATH}/api/knowledge-bases/${knowledgeBaseId}/documents/${documentId}/faq-collection`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFaqCollection: true, isDefaultFaqCollection: true }),
      })
      setActionMessage('已设为默认 FAQ 合集文档')
      await loadKnowledgeBaseDocuments(knowledgeBaseId, true)
      await loadGovernanceData()
    } catch (updateError) {
      setError(getErrorMessage(updateError, '默认 FAQ 合集设置失败'))
    }
  }, [loadGovernanceData, loadKnowledgeBaseDocuments])

  const quickRepublishToLastDocument = useCallback(async (item: FAQCandidate) => {
    const baseDraft = getPublishDraft(item.id)
    const knowledgeBaseId = item.lastPublishedKnowledgeBaseId || baseDraft.knowledgeBaseId
    const targetDocumentId = item.lastPublishedDocumentId || baseDraft.targetDocumentId
    if (!knowledgeBaseId || !targetDocumentId) return
    const draft: FAQPublishDraft = {
      ...baseDraft,
      knowledgeBaseId,
      publishMode: 'append_to_document',
      targetDocumentId,
      documentName: '',
      markAsDefaultCollection: false,
    }
    setPublishingToKnowledgeBaseId(item.id)
    setError('')
    setActionMessage('')
    try {
      await submitPublishToKnowledgeBase(item, draft)
      setPublishDrafts((current) => ({ ...current, [item.id]: draft }))
    } catch (publishError) {
      setError(getErrorMessage(publishError, '继续发布到上次文档失败'))
    } finally {
      setPublishingToKnowledgeBaseId('')
    }
  }, [getPublishDraft, submitPublishToKnowledgeBase])

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

  const publishFAQToKnowledgeBase = useCallback(async (item: FAQCandidate) => {
    const draft = getPublishDraft(item.id)
    setPublishingToKnowledgeBaseId(item.id)
    setError('')
    setActionMessage('')
    try {
      await submitPublishToKnowledgeBase(item, draft)
    } catch (publishError) {
      setError(getErrorMessage(publishError, 'FAQ 发布到知识库失败'))
    } finally {
      setPublishingToKnowledgeBaseId('')
    }
  }, [getPublishDraft, submitPublishToKnowledgeBase])

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
            这里给运营、交付和知识库维护同学一个最简单可用的治理入口。你可以直接查看 FAQ 候选、知识缺口、低质量回答和差评明细，顺手补责任人、处理备注、导出当前视图，把高赞回答整理成正式 FAQ 草稿，直接发布回知识库，或者追加进 FAQ 合集文档。
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
          const historyItems = publishHistoryMap[item.id] ?? []
          const publishHistoryHint = buildPublishHistoryHint(item, historyItems)
          const historyExportFormat = historyExportFormatMap[item.id] ?? 'markdown'
          const availableDocuments = knowledgeBaseDocuments[publishDraft.knowledgeBaseId] ?? []
          const defaultFAQDocument = findDefaultFAQDocument(availableDocuments)
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
              {item.knowledgeBasePublishCount ? (
                <div className="ops-feedback-meta">
                  <span>已发布知识库 {item.knowledgeBasePublishCount} 次</span>
                  {item.lastPublishedDocumentName ? <span>最近文档：{item.lastPublishedDocumentName}</span> : null}
                  {item.lastPublishedKnowledgeBaseId ? <span>最近知识库：{resolveKnowledgeBaseName(item.lastPublishedKnowledgeBaseId)}</span> : null}
                  {item.lastPublishMode ? <span>最近方式：{formatPublishModeLabel(item.lastPublishMode)}</span> : null}
                  {item.lastPublishedToKnowledgeAt ? <span>最近发布时间：{formatDate(item.lastPublishedToKnowledgeAt)}</span> : null}
                </div>
              ) : null}
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
                <label>
                  <span>发布知识库</span>
                  <select value={publishDraft.knowledgeBaseId} onChange={(event) => {
                    const value = event.target.value
                    updatePublishDraft(item.id, 'knowledgeBaseId', value)
                    updatePublishDraft(item.id, 'targetDocumentId', '')
                    if (value) {
                      void recommendFAQDocument(item, value, publishDraft.publishMode)
                    }
                  }}>
                    <option value="">请选择知识库</option>
                    {knowledgeBases.map((knowledgeBase) => (
                      <option key={knowledgeBase.id} value={knowledgeBase.id}>{knowledgeBase.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>发布方式</span>
                  <select value={publishDraft.publishMode} onChange={(event) => {
                    const value = event.target.value
                    updatePublishDraft(item.id, 'publishMode', value)
                    if (value === 'create_new') {
                      updatePublishDraft(item.id, 'targetDocumentId', '')
                      if (!publishDraft.documentName.trim()) {
                        updatePublishDraft(item.id, 'documentName', buildDefaultFAQDocumentName(publishDraft.question))
                      }
                    } else {
                      updatePublishDraft(item.id, 'targetDocumentId', '')
                      updatePublishDraft(item.id, 'documentName', '')
                      if (publishDraft.knowledgeBaseId) {
                        void recommendFAQDocument(item, publishDraft.knowledgeBaseId, value)
                      }
                    }
                  }}>
                    <option value="create_new">新建 FAQ 文档</option>
                    <option value="append_to_document">追加到现有文档</option>
                    <option value="replace_document">覆盖现有文档</option>
                  </select>
                </label>
                {publishDraft.publishMode !== 'create_new' ? (
                  <label>
                    <span>目标文档</span>
                    <select value={publishDraft.targetDocumentId} onChange={(event) => updatePublishDraft(item.id, 'targetDocumentId', event.target.value)}>
                      <option value="">请选择目标文档</option>
                      {availableDocuments.map((document) => (
                        <option key={document.id} value={document.id}>{formatDocumentOptionLabel(document)}</option>
                      ))}
                    </select>
                    {publishDraft.targetDocumentId && availableDocuments.some((document) => document.id === publishDraft.targetDocumentId) ? (
                      <small>已自动带出最近使用或最匹配的 FAQ 合集文档，你也可以手动改。</small>
                    ) : null}
                  </label>
                ) : null}
                {publishDraft.publishMode === 'create_new' ? (
                  <label>
                    <span>文档名</span>
                    <input value={publishDraft.documentName} onChange={(event) => updatePublishDraft(item.id, 'documentName', event.target.value)} placeholder="例如 FAQ-Redis核心特点.md" />
                  </label>
                ) : null}
                <label>
                  <span>FAQ 合集设置</span>
                  <select value={publishDraft.markAsDefaultCollection ? 'default' : 'normal'} onChange={(event) => updatePublishDraft(item.id, 'markAsDefaultCollection', event.target.value === 'default')}>
                    <option value="normal">保持普通文档</option>
                    <option value="default">设为默认 FAQ 合集</option>
                  </select>
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
                <button type="button" className="ops-refresh-button" disabled={publishingId === item.id || publishingToKnowledgeBaseId === item.id} onClick={() => void publishFAQCandidate(item)}>
                  {publishingId === item.id ? '生成中...' : '生成 FAQ 草稿'}
                </button>
                <button
                  type="button"
                  className="ops-secondary-button"
                  disabled={publishingId === item.id || publishingToKnowledgeBaseId === item.id || !publishDraft.knowledgeBaseId || (publishDraft.publishMode !== 'create_new' && !publishDraft.targetDocumentId)}
                  onClick={() => void publishFAQToKnowledgeBase(item)}
                >
                  {publishingToKnowledgeBaseId === item.id ? '发布中...' : '发布到知识库'}
                </button>
                <button
                  type="button"
                  disabled={publishingId === item.id || publishingToKnowledgeBaseId === item.id || !item.lastPublishedDocumentId}
                  onClick={() => void quickRepublishToLastDocument(item)}
                >
                  继续发布到上次文档
                </button>
                <button
                  type="button"
                  disabled={!publishDraft.knowledgeBaseId || !publishDraft.targetDocumentId}
                  onClick={() => void markDocumentAsDefaultFAQCollection(publishDraft.knowledgeBaseId, publishDraft.targetDocumentId)}
                >
                  设为默认 FAQ 合集
                </button>
                <button
                  type="button"
                  disabled={publishingId === item.id || publishingToKnowledgeBaseId === item.id || !(publishDraft.knowledgeBaseId || item.lastPublishedKnowledgeBaseId || item.knowledgeBaseId)}
                  onClick={() => void publishFAQToDefaultCollection(item)}
                >
                  发布到默认 FAQ 合集
                </button>
                <label className="ops-inline-select">
                  <span>历史导出</span>
                  <select value={historyExportFormat} onChange={(event) => setHistoryExportFormatMap((current) => ({ ...current, [item.id]: event.target.value as FAQHistoryExportFormat }))}>
                    <option value="markdown">Markdown</option>
                    <option value="json">JSON</option>
                  </select>
                </label>
                <button type="button" disabled={historyExportingId === item.id} onClick={() => void exportFAQPublishHistory(item, historyExportFormat)}>
                  {historyExportingId === item.id ? '导出中...' : `导出发布历史（${historyExportFormat.toUpperCase()}）`}
                </button>
                <button type="button" onClick={() => void togglePublishHistory(item)}>
                  {expandedHistoryIds.includes(item.id) ? '收起发布历史' : '查看发布历史'}
                </button>
              </div>
              {defaultFAQDocument ? <div className="ops-inline-tip">当前默认 FAQ 合集：{defaultFAQDocument.name}，可直接使用“发布到默认 FAQ 合集”。</div> : null}
              {publishHistoryHint ? <div className="ops-inline-warning">{publishHistoryHint}</div> : null}
              {expandedHistoryIds.includes(item.id) ? (
                <div className="ops-history-list">
                  {historyLoadingId === item.id ? <div className="ops-empty">正在加载 FAQ 发布历史...</div> : null}
                  {historyLoadingId !== item.id && (publishHistoryMap[item.id] ?? []).length === 0 ? <div className="ops-empty">当前还没有 FAQ 发布历史。</div> : null}
                  {historyLoadingId !== item.id && historyItems.length > 0 ? (
                    <ul>
                      {historyItems.map((history) => (
                        <li key={history.id}>
                          <strong>{history.documentName || '未命名文档'}</strong>
                          <span>{formatPublishModeLabel(history.publishMode)}</span>
                          <span>{resolveKnowledgeBaseName(history.knowledgeBaseId)}</span>
                          <span>{formatDate(history.publishedAt)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
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

import React, { ChangeEvent, memo, useCallback, useMemo, useState } from 'react'
import { KnowledgeBase, UploadTask } from '../../App'

interface KnowledgePanelProps {
  open: boolean
  knowledgeBases: KnowledgeBase[]
  collapsedKnowledgeBases: Record<string, boolean>
  onToggleCollapse: (knowledgeBaseId: string) => void
  selectedKnowledgeBaseId: string | null
  selectedDocumentId: string | null
  onSelectKnowledgeBase: (knowledgeBaseId: string) => void
  onSelectDocument: (knowledgeBaseId: string, documentId: string | null) => void
  onCreateKnowledgeBase: (name: string, description: string) => void
  onDeleteKnowledgeBase: (knowledgeBaseId: string) => void
  onUploadFiles: (knowledgeBaseId: string, files: FileList | null) => Promise<void>
  uploadTasksByKnowledgeBase: Record<string, UploadTask[]>
  onCancelUploadTask: (knowledgeBaseId: string, taskId: string) => void
  onRetryUploadTask: (knowledgeBaseId: string, taskId: string) => Promise<void>
  onClearFinishedUploadTasks: (knowledgeBaseId: string) => void
  onRemoveDocument: (knowledgeBaseId: string, documentId: string) => void
  onReindexKnowledgeBase: (knowledgeBaseId: string) => Promise<void>
  onReindexDocument: (knowledgeBaseId: string, documentId: string) => Promise<void>
  onBatchReindexDocuments: (knowledgeBaseId: string, documentIds: string[]) => Promise<void>
  reindexingKnowledgeBaseId: string | null
  reindexingDocumentKeys: Record<string, true>
  onClose: () => void
}

type DocumentFilterType = 'all' | 'faq' | 'default' | 'normal'

interface KnowledgeBaseCardProps {
  knowledgeBase: KnowledgeBase
  documentFilter: DocumentFilterType
  supportedFileTypesLabel: string
  isSelected: boolean
  isCollapsed: boolean
  selectedDocumentId: string | null
  uploadTasks: UploadTask[]
  reindexingKnowledgeBaseId: string | null
  reindexingDocumentKeys: Record<string, true>
  onToggleCollapse: (knowledgeBaseId: string) => void
  onSelectKnowledgeBase: (knowledgeBaseId: string) => void
  onSelectDocument: (knowledgeBaseId: string, documentId: string | null) => void
  onDeleteKnowledgeBase: (knowledgeBaseId: string) => void
  onUploadFiles: (knowledgeBaseId: string, files: FileList | null) => Promise<void>
  onCancelUploadTask: (knowledgeBaseId: string, taskId: string) => void
  onRetryUploadTask: (knowledgeBaseId: string, taskId: string) => Promise<void>
  onClearFinishedUploadTasks: (knowledgeBaseId: string) => void
  onRemoveDocument: (knowledgeBaseId: string, documentId: string) => void
  onReindexKnowledgeBase: (knowledgeBaseId: string) => Promise<void>
  onReindexDocument: (knowledgeBaseId: string, documentId: string) => Promise<void>
  onBatchReindexDocuments: (knowledgeBaseId: string, documentIds: string[]) => Promise<void>
}

const supportedFileTypes = ['TXT', 'MD', 'PDF', 'DOCX', 'HTML', 'HTM', 'PNG', 'JPG', 'JPEG', 'WEBP', 'GIF']
const DEFAULT_VISIBLE_UPLOAD_TASKS = 4
const DEFAULT_VISIBLE_DOCUMENTS = 24
const EXPANDED_SCOPE_THRESHOLD = 12

const isActiveUploadStatus = (status: UploadTask['status']) =>
  status === 'queued' || status === 'uploading' || status === 'processing'

const getUploadTaskStatusText = (task: UploadTask) => {
  const isReindexTask = task.taskType === 'reindex'
  if (task.status === 'queued') return isReindexTask ? '等待重跑' : '等待开始'
  if (task.status === 'uploading') return `上传中 ${task.networkProgress}%`
  if (task.status === 'processing') return isReindexTask ? `重跑中 ${task.progress}%` : `处理中 ${task.progress}%`
  if (task.status === 'success') return isReindexTask ? '重跑完成' : '处理完成'
  if (task.status === 'canceled') return '已取消'
  return isReindexTask ? '重跑失败' : '处理失败'
}

const getStatusLabel = (status: string) => {
  if (status === 'indexed') return { text: '已索引', color: '#16a34a', bg: '#dcfce7' }
  if (status === 'processing') return { text: '处理中', color: '#d97706', bg: '#fef3c7' }
  return { text: '就绪', color: '#2563eb', bg: '#dbeafe' }
}

const formatScopeDocumentLabel = (document: KnowledgeBase['documents'][number]) => {
  if (document.isDefaultFaqCollection) return `${document.name} · 默认FAQ`
  if (document.isFaqCollection) return `${document.name} · FAQ`
  return document.name
}

const matchDocumentFilter = (
  document: KnowledgeBase['documents'][number],
  documentFilter: DocumentFilterType,
) => {
  if (documentFilter === 'faq') return Boolean(document.isFaqCollection)
  if (documentFilter === 'default') return Boolean(document.isDefaultFaqCollection)
  if (documentFilter === 'normal') return !document.isFaqCollection && !document.isDefaultFaqCollection
  return true
}

const handleUploadByFileList = (
  onUploadFiles: KnowledgePanelProps['onUploadFiles'],
  knowledgeBaseId: string,
  files: FileList | null,
) => {
  if (!files || files.length === 0) {
    return
  }
  void onUploadFiles(knowledgeBaseId, files)
}

const KnowledgeBaseCard: React.FC<KnowledgeBaseCardProps> = ({
  knowledgeBase,
  documentFilter,
  supportedFileTypesLabel,
  isSelected,
  isCollapsed,
  selectedDocumentId,
  uploadTasks,
  reindexingKnowledgeBaseId,
  reindexingDocumentKeys,
  onToggleCollapse,
  onSelectKnowledgeBase,
  onSelectDocument,
  onDeleteKnowledgeBase,
  onUploadFiles,
  onCancelUploadTask,
  onRetryUploadTask,
  onClearFinishedUploadTasks,
  onRemoveDocument,
  onReindexKnowledgeBase,
  onReindexDocument,
  onBatchReindexDocuments,
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [showAllUploadTasks, setShowAllUploadTasks] = useState(false)
  const [showAllDocuments, setShowAllDocuments] = useState(false)

  const filteredDocuments = useMemo(
    () => knowledgeBase.documents.filter((document) => matchDocumentFilter(document, documentFilter)),
    [documentFilter, knowledgeBase.documents],
  )

  const uploadSummary = useMemo(() => {
    const activeUploadTasks = uploadTasks.filter((task) => isActiveUploadStatus(task.status))
    const failedUploadTasks = uploadTasks.filter((task) => task.status === 'error')
    const successUploadCount = uploadTasks.filter((task) => task.status === 'success').length
    const failedUploadCount = failedUploadTasks.length
    const canceledUploadCount = uploadTasks.filter((task) => task.status === 'canceled').length
    const totalUploadBytes = uploadTasks.reduce((sum, task) => sum + task.sizeBytes, 0)
    const totalUploadProgress =
      totalUploadBytes > 0
        ? Math.round(
            uploadTasks.reduce((sum, task) => {
              const progress =
                task.status === 'success' || task.status === 'error' || task.status === 'canceled'
                  ? 100
                  : task.progress
              return sum + task.sizeBytes * progress
            }, 0) / totalUploadBytes,
          )
        : 0

    return {
      activeUploadTasks,
      failedUploadTasks,
      successUploadCount,
      failedUploadCount,
      canceledUploadCount,
      totalUploadProgress,
      averageUploadProgress:
        activeUploadTasks.length > 0
          ? Math.round(
              activeUploadTasks.reduce((sum, task) => sum + task.progress, 0) /
                activeUploadTasks.length,
            )
          : 0,
      hasClearableTasks: successUploadCount > 0 || canceledUploadCount > 0,
    }
  }, [uploadTasks])

  const visibleUploadTaskCount = useMemo(
    () =>
      showAllUploadTasks
        ? uploadTasks.length
        : Math.min(
            uploadTasks.length,
            Math.max(DEFAULT_VISIBLE_UPLOAD_TASKS, uploadSummary.activeUploadTasks.length + 2),
          ),
    [showAllUploadTasks, uploadSummary.activeUploadTasks.length, uploadTasks.length],
  )

  const visibleUploadTasks = useMemo(
    () => uploadTasks.slice(0, visibleUploadTaskCount),
    [uploadTasks, visibleUploadTaskCount],
  )

  const hiddenUploadTaskCount = uploadTasks.length - visibleUploadTasks.length

  const selectedDocumentIndex = useMemo(
    () => filteredDocuments.findIndex((document) => document.id === selectedDocumentId),
    [filteredDocuments, selectedDocumentId],
  )

  const visibleDocumentCount = useMemo(() => {
    if (showAllDocuments) {
      return filteredDocuments.length
    }
    if (selectedDocumentIndex >= DEFAULT_VISIBLE_DOCUMENTS) {
      return Math.min(filteredDocuments.length, selectedDocumentIndex + 1)
    }
    return Math.min(filteredDocuments.length, DEFAULT_VISIBLE_DOCUMENTS)
  }, [filteredDocuments.length, selectedDocumentIndex, showAllDocuments])

  const visibleDocuments = useMemo(
    () => filteredDocuments.slice(0, visibleDocumentCount),
    [filteredDocuments, visibleDocumentCount],
  )

  const hiddenDocumentCount = filteredDocuments.length - visibleDocuments.length
  const shouldUseScopeSelect = filteredDocuments.length > EXPANDED_SCOPE_THRESHOLD
  const allFilteredDocumentsReindexing =
    filteredDocuments.length > 0 &&
    filteredDocuments.every((document) => reindexingDocumentKeys[`${knowledgeBase.id}:${document.id}`])

  const handleRetryFailedTasks = async () => {
    for (const task of uploadSummary.failedUploadTasks) {
      await onRetryUploadTask(knowledgeBase.id, task.id)
    }
  }

  return (
    <div className={`kb-card${isSelected ? ' kb-card--active' : ''}`}>
      <div className="kb-card-header">
        <button className="kb-card-main" onClick={() => onSelectKnowledgeBase(knowledgeBase.id)}>
          <div className="kb-card-icon">📁</div>
          <div className="kb-card-info">
            <span className="kb-card-name">{knowledgeBase.name}</span>
            {knowledgeBase.description ? <span className="kb-card-desc">{knowledgeBase.description}</span> : null}
            <span className="kb-card-meta">
              {knowledgeBase.documents.length} 份文档 · 创建于 {new Date(knowledgeBase.createdAt).toLocaleDateString('zh-CN')}
            </span>
          </div>
        </button>

        <div className="kb-card-actions">
          <label className="kb-upload-btn" title="上传文档">
            <span>📤</span> 上传
            <input
              type="file"
              multiple
              accept=".txt,.md,.pdf,.docx,.html,.htm,.png,.jpg,.jpeg,.webp,.gif"
              className="hidden-input"
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                handleUploadByFileList(onUploadFiles, knowledgeBase.id, event.target.files)
                event.target.value = ''
              }}
            />
          </label>
          <button
            className="kb-reindex-btn"
            onClick={() => {
              void onReindexKnowledgeBase(knowledgeBase.id)
            }}
            disabled={
              knowledgeBase.documents.length === 0 ||
              reindexingKnowledgeBaseId === knowledgeBase.id ||
              uploadSummary.activeUploadTasks.length > 0
            }
            title={
              uploadSummary.activeUploadTasks.length > 0
                ? '请等待当前上传任务完成后再重建索引'
                : knowledgeBase.documents.length === 0
                  ? '当前知识库暂无文档'
                  : '使用当前 Embedding 配置重建索引'
            }
          >
            {reindexingKnowledgeBaseId === knowledgeBase.id ? '重建中...' : '重建索引'}
          </button>
          <button
            className="kb-reindex-btn kb-reindex-btn--secondary"
            onClick={() => {
              void onBatchReindexDocuments(
                knowledgeBase.id,
                filteredDocuments.map((document) => document.id),
              )
            }}
            disabled={
              filteredDocuments.length === 0 ||
              reindexingKnowledgeBaseId === knowledgeBase.id ||
              uploadSummary.activeUploadTasks.length > 0 ||
              allFilteredDocumentsReindexing
            }
            title={
              uploadSummary.activeUploadTasks.length > 0
                ? '请等待当前上传任务完成后再批量重跑解析'
                : filteredDocuments.length === 0
                  ? '当前筛选结果中暂无可处理文档'
                  : '按当前筛选结果批量重跑图片提取、OCR、切片与向量入库'
            }
          >
            批量重跑
          </button>
          <button
            className="kb-collapse-btn"
            onClick={() => onToggleCollapse(knowledgeBase.id)}
            title={isCollapsed ? '展开' : '折叠'}
          >
            {isCollapsed ? '▸' : '▾'}
          </button>
          {showDeleteConfirm ? (
            <div className="kb-delete-confirm">
              <span>确认删除？</span>
              <button
                className="kb-delete-yes"
                onClick={() => {
                  onDeleteKnowledgeBase(knowledgeBase.id)
                  setShowDeleteConfirm(false)
                }}
              >
                删除
              </button>
              <button className="kb-delete-no" onClick={() => setShowDeleteConfirm(false)}>
                取消
              </button>
            </div>
          ) : (
            <button
              className="kb-delete-btn"
              onClick={() => setShowDeleteConfirm(true)}
              title={uploadSummary.activeUploadTasks.length > 0 ? '存在上传任务时不可删除知识库' : '删除知识库'}
              disabled={uploadSummary.activeUploadTasks.length > 0}
            >
              🗑️
            </button>
          )}
        </div>
      </div>

      <div className="kb-upload-hint">
        <span className="kb-upload-hint-label">支持文件类型</span>
        <span className="kb-upload-hint-value">{supportedFileTypesLabel}</span>
      </div>

      <div
        className={`kb-upload-dropzone${isDragOver ? ' kb-upload-dropzone--active' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
          setIsDragOver(true)
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsDragOver(false)
          }
        }}
        onDrop={(event) => {
          event.preventDefault()
          setIsDragOver(false)
          handleUploadByFileList(onUploadFiles, knowledgeBase.id, event.dataTransfer.files)
        }}
      >
        <div>
          <strong>{isDragOver ? '松开鼠标，上传到当前知识库' : '支持拖拽上传到当前知识库'}</strong>
          <span>也可以继续使用上方“上传”按钮进行多选上传</span>
        </div>
        <span className="kb-upload-dropzone-tag">拖拽上传</span>
      </div>

      {uploadTasks.length > 0 ? (
        <div className="kb-upload-progress-list">
          <div className="kb-upload-summary">
            <div className="kb-upload-summary-main">
              <div className="kb-upload-summary-badges">
                <span className="kb-upload-summary-chip">任务 {uploadTasks.length}</span>
                <span className="kb-upload-summary-chip active">
                  进行中 {uploadSummary.activeUploadTasks.length}
                  {uploadSummary.activeUploadTasks.length > 0 ? ` · 平均 ${uploadSummary.averageUploadProgress}%` : ''}
                </span>
                {uploadSummary.successUploadCount > 0 ? (
                  <span className="kb-upload-summary-chip success">完成 {uploadSummary.successUploadCount}</span>
                ) : null}
                {uploadSummary.failedUploadCount > 0 ? (
                  <span className="kb-upload-summary-chip error">失败 {uploadSummary.failedUploadCount}</span>
                ) : null}
                {uploadSummary.canceledUploadCount > 0 ? (
                  <span className="kb-upload-summary-chip muted">取消 {uploadSummary.canceledUploadCount}</span>
                ) : null}
              </div>
              <div className="kb-upload-total-progress" aria-label={`总进度 ${uploadSummary.totalUploadProgress}%`}>
                <div style={{ width: `${uploadSummary.totalUploadProgress}%` }} />
              </div>
              <div className="kb-upload-total-progress-text">批量总进度 {uploadSummary.totalUploadProgress}%</div>
            </div>
            <div className="kb-upload-summary-actions">
              {uploadSummary.activeUploadTasks.length === 0 && uploadSummary.failedUploadTasks.length > 0 ? (
                <button type="button" className="kb-upload-clear-btn" onClick={() => void handleRetryFailedTasks()}>
                  一键重试失败项
                </button>
              ) : null}
              {uploadSummary.hasClearableTasks ? (
                <button
                  type="button"
                  className="kb-upload-clear-btn"
                  onClick={() => onClearFinishedUploadTasks(knowledgeBase.id)}
                >
                  清理已完成
                </button>
              ) : null}
            </div>
          </div>

          {visibleUploadTasks.map((task) => (
            <div key={task.id} className={`kb-upload-progress-item kb-upload-progress-item--${task.status}`}>
              <div className="kb-upload-progress-top">
                <div>
                  <strong>{task.fileName}</strong>
                  <span>{task.sizeLabel}</span>
                </div>
                <div className="kb-upload-progress-side">
                  <span>{getUploadTaskStatusText(task)}</span>
                  <div className="kb-upload-progress-actions">
                    {isActiveUploadStatus(task.status) ? (
                      <button
                        type="button"
                        className="kb-upload-action-btn"
                        onClick={() => onCancelUploadTask(knowledgeBase.id, task.id)}
                      >
                        取消
                      </button>
                    ) : null}
                    {uploadSummary.activeUploadTasks.length === 0 && (task.status === 'error' || task.status === 'canceled') ? (
                      <button
                        type="button"
                        className="kb-upload-action-btn primary"
                        onClick={() => {
                          void onRetryUploadTask(knowledgeBase.id, task.id)
                        }}
                      >
                        重试
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="kb-upload-progress-bar">
                <div style={{ width: `${task.progress}%` }} />
              </div>
              {task.detail ? <p className="kb-upload-progress-detail">{task.detail}</p> : null}
              {task.status === 'error' && task.error ? (
                <p className="kb-upload-progress-error">{task.error}</p>
              ) : null}
            </div>
          ))}

          {hiddenUploadTaskCount > 0 ? (
            <div className="kb-list-more-wrap">
              <button
                type="button"
                className="kb-list-more-btn"
                onClick={() => setShowAllUploadTasks((current) => !current)}
              >
                {showAllUploadTasks ? '收起历史任务' : `展开其余 ${hiddenUploadTaskCount} 条任务`}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {isSelected ? (
        shouldUseScopeSelect ? (
          <div className="kb-scope-bar">
            <div className="kb-scope-select-wrap">
              <span className="kb-scope-select-label">问答范围</span>
              <select
                className="kb-scope-select"
                value={selectedDocumentId ?? ''}
                onChange={(event) => onSelectDocument(knowledgeBase.id, event.target.value || null)}
              >
                <option value="">全部文档</option>
                {filteredDocuments.map((document) => (
                  <option key={document.id} value={document.id}>
                    {formatScopeDocumentLabel(document)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="kb-scope-bar">
            <button
              className={`kb-scope-btn${selectedDocumentId === null ? ' kb-scope-btn--active' : ''}`}
              onClick={() => onSelectDocument(knowledgeBase.id, null)}
            >
              全部文档
            </button>
            {filteredDocuments.map((document) => (
              <button
                key={document.id}
                className={`kb-scope-btn${selectedDocumentId === document.id ? ' kb-scope-btn--active' : ''}`}
                onClick={() => onSelectDocument(knowledgeBase.id, document.id)}
              >
                {formatScopeDocumentLabel(document)}
              </button>
            ))}
          </div>
        )
      ) : null}

      {!isCollapsed ? (
        <div className="kb-docs">
          {filteredDocuments.length === 0 ? (
            <div className="kb-docs-empty">
              <span>📄</span>
              <span>{documentFilter === 'all' ? '暂无文档，点击「上传」添加文件' : '当前筛选下暂无符合条件的文档'}</span>
            </div>
          ) : (
            <>
              {visibleDocuments.map((document) => {
                const badge = getStatusLabel(document.status)
                const documentReindexKey = `${knowledgeBase.id}:${document.id}`
                const isDocumentReindexing = Boolean(reindexingDocumentKeys[documentReindexKey])
                const isDocumentActionDisabled =
                  uploadSummary.activeUploadTasks.length > 0 ||
                  reindexingKnowledgeBaseId === knowledgeBase.id ||
                  isDocumentReindexing

                return (
                  <div
                    key={document.id}
                    className={`kb-doc-item${selectedDocumentId === document.id ? ' kb-doc-item--active' : ''}`}
                  >
                    <button className="kb-doc-main" onClick={() => onSelectDocument(knowledgeBase.id, document.id)}>
                      <div className="kb-doc-top">
                        <span className="kb-doc-icon">📄</span>
                        <span className="kb-doc-name">{document.name}</span>
                        <span className="kb-doc-badge" style={{ color: badge.color, background: badge.bg }}>
                          {badge.text}
                        </span>
                      </div>
                      {document.isDefaultFaqCollection || document.isFaqCollection ? (
                        <div className="kb-doc-tags">
                          {document.isDefaultFaqCollection ? (
                            <span className="kb-doc-tag kb-doc-tag--default">默认 FAQ 合集</span>
                          ) : null}
                          {!document.isDefaultFaqCollection && document.isFaqCollection ? (
                            <span className="kb-doc-tag kb-doc-tag--faq">FAQ 文档</span>
                          ) : null}
                        </div>
                      ) : null}
                      {document.contentPreview ? <p className="kb-doc-preview">{document.contentPreview}</p> : null}
                      <div className="kb-doc-meta">
                        <span>{document.sizeLabel}</span>
                        <span>·</span>
                        <span>{new Date(document.uploadedAt).toLocaleDateString('zh-CN')}</span>
                      </div>
                    </button>
                    <div className="kb-doc-actions">
                      <button
                        className="kb-doc-reindex"
                        onClick={() => {
                          void onReindexDocument(knowledgeBase.id, document.id)
                        }}
                        disabled={isDocumentActionDisabled}
                        title={
                          uploadSummary.activeUploadTasks.length > 0
                            ? '请等待当前上传任务完成后再重跑解析'
                            : reindexingKnowledgeBaseId === knowledgeBase.id
                              ? '当前知识库正在重建索引'
                              : isDocumentReindexing
                                ? '当前文档正在重跑解析'
                                : '重新读取原文件，重跑图片提取、OCR、切片与向量入库'
                        }
                      >
                        {isDocumentReindexing ? '重跑中...' : '重跑解析'}
                      </button>
                      <button
                        className="kb-doc-remove"
                        onClick={() => onRemoveDocument(knowledgeBase.id, document.id)}
                        title={isDocumentActionDisabled ? '当前文档处理中，暂不可删除' : '删除文档'}
                        disabled={isDocumentActionDisabled}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )
              })}

              {hiddenDocumentCount > 0 ? (
                <div className="kb-list-more-wrap">
                  <button
                    type="button"
                    className="kb-list-more-btn"
                    onClick={() => setShowAllDocuments((current) => !current)}
                  >
                    {showAllDocuments ? '收起文档列表' : `展开其余 ${hiddenDocumentCount} 份文档`}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

const areKnowledgeBaseCardPropsEqual = (
  prev: Readonly<KnowledgeBaseCardProps>,
  next: Readonly<KnowledgeBaseCardProps>,
) => {
  if (
    prev.knowledgeBase !== next.knowledgeBase ||
    prev.documentFilter !== next.documentFilter ||
    prev.supportedFileTypesLabel !== next.supportedFileTypesLabel ||
    prev.isSelected !== next.isSelected ||
    prev.isCollapsed !== next.isCollapsed ||
    prev.selectedDocumentId !== next.selectedDocumentId ||
    prev.uploadTasks !== next.uploadTasks ||
    prev.reindexingKnowledgeBaseId !== next.reindexingKnowledgeBaseId
  ) {
    return false
  }

  const currentDocuments = next.knowledgeBase.documents
  for (const document of currentDocuments) {
    const key = `${next.knowledgeBase.id}:${document.id}`
    if (Boolean(prev.reindexingDocumentKeys[key]) !== Boolean(next.reindexingDocumentKeys[key])) {
      return false
    }
  }

  return true
}

const MemoizedKnowledgeBaseCard = memo(KnowledgeBaseCard, areKnowledgeBaseCardPropsEqual)

const KnowledgePanel: React.FC<KnowledgePanelProps> = ({
  open,
  knowledgeBases,
  collapsedKnowledgeBases,
  onToggleCollapse,
  selectedKnowledgeBaseId,
  selectedDocumentId,
  onSelectKnowledgeBase,
  onSelectDocument,
  onCreateKnowledgeBase,
  onDeleteKnowledgeBase,
  onUploadFiles,
  uploadTasksByKnowledgeBase,
  onCancelUploadTask,
  onRetryUploadTask,
  onClearFinishedUploadTasks,
  onRemoveDocument,
  onReindexKnowledgeBase,
  onReindexDocument,
  onBatchReindexDocuments,
  reindexingKnowledgeBaseId,
  reindexingDocumentKeys,
  onClose,
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [documentFilter, setDocumentFilter] = useState<DocumentFilterType>('all')

  const summary = useMemo(
    () => ({
      knowledgeBaseCount: knowledgeBases.length,
      documentCount: knowledgeBases.reduce((sum, knowledgeBase) => sum + knowledgeBase.documents.length, 0),
    }),
    [knowledgeBases],
  )

  const supportedFileTypesLabel = useMemo(() => supportedFileTypes.join(' / '), [])

  const handleOpenCreate = useCallback(() => {
    setNewName('')
    setNewDescription('')
    setShowCreateModal(true)
  }, [])

  const handleConfirmCreate = useCallback(() => {
    const trimmedName = newName.trim()
    if (!trimmedName) {
      return
    }
    onCreateKnowledgeBase(trimmedName, newDescription.trim())
    setShowCreateModal(false)
    setNewName('')
    setNewDescription('')
  }, [newDescription, newName, onCreateKnowledgeBase])

  const handleCancelCreate = useCallback(() => {
    setShowCreateModal(false)
    setNewName('')
    setNewDescription('')
  }, [])

  if (!open) return null

  return (
    <>
      <div className="kb-backdrop" onClick={onClose}>
        <div className="kb-modal" onClick={(event) => event.stopPropagation()}>
          <div className="kb-header">
            <div className="kb-header-left">
              <div className="kb-header-icon">🗂️</div>
              <div>
                <h2 className="kb-header-title">知识库管理</h2>
                <p className="kb-header-sub">
                  共 {summary.knowledgeBaseCount} 个知识库 · {summary.documentCount} 份文档
                </p>
              </div>
            </div>
            <div className="kb-header-actions">
              <label className="kb-doc-filter">
                <span>文档筛选</span>
                <select
                  value={documentFilter}
                  onChange={(event) => setDocumentFilter(event.target.value as DocumentFilterType)}
                >
                  <option value="all">全部文档</option>
                  <option value="faq">FAQ 文档</option>
                  <option value="default">默认 FAQ 合集</option>
                  <option value="normal">普通文档</option>
                </select>
              </label>
              <button className="kb-create-btn" onClick={handleOpenCreate}>
                <span>＋</span> 新建知识库
              </button>
              <button className="kb-close-btn" onClick={onClose} title="关闭">
                ✕
              </button>
            </div>
          </div>

          <div className="kb-body">
            {knowledgeBases.length === 0 ? (
              <div className="kb-empty">
                <div className="kb-empty-icon">📚</div>
                <p className="kb-empty-title">暂无知识库</p>
                <p className="kb-empty-sub">创建第一个知识库，开始管理您的文档</p>
                <button className="kb-create-btn" onClick={handleOpenCreate}>
                  <span>＋</span> 新建知识库
                </button>
              </div>
            ) : (
              <div className="kb-list">
                {knowledgeBases.map((knowledgeBase) => (
                  <MemoizedKnowledgeBaseCard
                    key={knowledgeBase.id}
                    knowledgeBase={knowledgeBase}
                    documentFilter={documentFilter}
                    supportedFileTypesLabel={supportedFileTypesLabel}
                    isSelected={selectedKnowledgeBaseId === knowledgeBase.id}
                    isCollapsed={Boolean(collapsedKnowledgeBases[knowledgeBase.id])}
                    selectedDocumentId={selectedDocumentId}
                    uploadTasks={uploadTasksByKnowledgeBase[knowledgeBase.id] ?? []}
                    reindexingKnowledgeBaseId={reindexingKnowledgeBaseId}
                    reindexingDocumentKeys={reindexingDocumentKeys}
                    onToggleCollapse={onToggleCollapse}
                    onSelectKnowledgeBase={onSelectKnowledgeBase}
                    onSelectDocument={onSelectDocument}
                    onDeleteKnowledgeBase={onDeleteKnowledgeBase}
                    onUploadFiles={onUploadFiles}
                    onCancelUploadTask={onCancelUploadTask}
                    onRetryUploadTask={onRetryUploadTask}
                    onClearFinishedUploadTasks={onClearFinishedUploadTasks}
                    onRemoveDocument={onRemoveDocument}
                    onReindexKnowledgeBase={onReindexKnowledgeBase}
                    onReindexDocument={onReindexDocument}
                    onBatchReindexDocuments={onBatchReindexDocuments}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showCreateModal ? (
        <div className="kb-create-backdrop" onClick={handleCancelCreate}>
          <div className="kb-create-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="kb-create-dialog-header">
              <h3>新建知识库</h3>
              <button className="kb-close-btn" onClick={handleCancelCreate}>
                ✕
              </button>
            </div>
            <div className="kb-create-dialog-body">
              <div className="kb-form-field">
                <label className="kb-form-label">
                  知识库名称 <span className="kb-required">*</span>
                </label>
                <input
                  className="kb-form-input"
                  type="text"
                  placeholder="例如：产品文档、技术手册…"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && handleConfirmCreate()}
                  autoFocus
                  maxLength={50}
                />
              </div>
              <div className="kb-form-field">
                <label className="kb-form-label">描述（可选）</label>
                <textarea
                  className="kb-form-textarea"
                  placeholder="简要描述该知识库的用途…"
                  value={newDescription}
                  onChange={(event) => setNewDescription(event.target.value)}
                  rows={3}
                  maxLength={200}
                />
              </div>
            </div>
            <div className="kb-create-dialog-footer">
              <button className="kb-cancel-btn" onClick={handleCancelCreate}>
                取消
              </button>
              <button className="kb-confirm-btn" onClick={handleConfirmCreate} disabled={!newName.trim()}>
                创建知识库
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

const areKnowledgePanelPropsEqual = (prev: KnowledgePanelProps, next: KnowledgePanelProps) =>
  prev.open === next.open &&
  prev.knowledgeBases === next.knowledgeBases &&
  prev.collapsedKnowledgeBases === next.collapsedKnowledgeBases &&
  prev.selectedKnowledgeBaseId === next.selectedKnowledgeBaseId &&
  prev.selectedDocumentId === next.selectedDocumentId &&
  prev.uploadTasksByKnowledgeBase === next.uploadTasksByKnowledgeBase &&
  prev.reindexingKnowledgeBaseId === next.reindexingKnowledgeBaseId &&
  prev.reindexingDocumentKeys === next.reindexingDocumentKeys

export default memo(KnowledgePanel, areKnowledgePanelPropsEqual)

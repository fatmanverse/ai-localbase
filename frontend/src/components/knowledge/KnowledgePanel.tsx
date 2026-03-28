import React, { ChangeEvent, useState } from 'react'
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
  reindexingKnowledgeBaseId: string | null
  onClose: () => void
}

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
  reindexingKnowledgeBaseId,
  onClose,
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [dragOverKnowledgeBaseId, setDragOverKnowledgeBaseId] = useState<string | null>(null)

  const supportedFileTypes = ['TXT', 'MD', 'PDF', 'DOCX', 'HTML', 'HTM', 'PNG', 'JPG', 'JPEG', 'WEBP', 'GIF']

  if (!open) return null

  const handleUploadByFileList = (knowledgeBaseId: string, files: FileList | null) => {
    if (!files || files.length === 0) {
      return
    }
    void onUploadFiles(knowledgeBaseId, files)
  }

  const handleFileChange = (knowledgeBaseId: string, event: ChangeEvent<HTMLInputElement>) => {
    handleUploadByFileList(knowledgeBaseId, event.target.files)
    event.target.value = ''
  }

  const handleOpenCreate = () => {
    setNewName('')
    setNewDescription('')
    setShowCreateModal(true)
  }

  const handleConfirmCreate = () => {
    const trimmedName = newName.trim()
    if (!trimmedName) return
    onCreateKnowledgeBase(trimmedName, newDescription.trim())
    setShowCreateModal(false)
    setNewName('')
    setNewDescription('')
  }

  const handleCancelCreate = () => {
    setShowCreateModal(false)
    setNewName('')
    setNewDescription('')
  }

  const statusLabel = (status: string) => {
    if (status === 'indexed') return { text: '已索引', color: '#16a34a', bg: '#dcfce7' }
    if (status === 'processing') return { text: '处理中', color: '#d97706', bg: '#fef3c7' }
    return { text: '就绪', color: '#2563eb', bg: '#dbeafe' }
  }

  const isActiveUploadStatus = (status: UploadTask['status']) =>
    status === 'queued' || status === 'uploading' || status === 'processing'

  const getUploadTaskStatusText = (task: UploadTask) => {
    if (task.status === 'queued') return '等待开始'
    if (task.status === 'uploading') return `上传中 ${task.networkProgress}%`
    if (task.status === 'processing') return `处理中 ${task.progress}%`
    if (task.status === 'success') return '处理完成'
    if (task.status === 'canceled') return '已取消'
    return '处理失败'
  }

  const handleRetryFailedTasks = async (knowledgeBaseId: string, tasks: UploadTask[]) => {
    for (const task of tasks) {
      await onRetryUploadTask(knowledgeBaseId, task.id)
    }
  }

  return (
    <>
      {/* 主弹窗 */}
      <div className="kb-backdrop" onClick={onClose}>
        <div className="kb-modal" onClick={(e) => e.stopPropagation()}>
          {/* 头部 */}
          <div className="kb-header">
            <div className="kb-header-left">
              <div className="kb-header-icon">🗂️</div>
              <div>
                <h2 className="kb-header-title">知识库管理</h2>
                <p className="kb-header-sub">
                  共 {knowledgeBases.length} 个知识库 ·{' '}
                  {knowledgeBases.reduce((s, kb) => s + kb.documents.length, 0)} 份文档
                </p>
              </div>
            </div>
            <div className="kb-header-actions">
              <button className="kb-create-btn" onClick={handleOpenCreate}>
                <span>＋</span> 新建知识库
              </button>
              <button className="kb-close-btn" onClick={onClose} title="关闭">✕</button>
            </div>
          </div>

          {/* 内容区 */}
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
                {knowledgeBases.map((kb) => {
                  const isSelected = selectedKnowledgeBaseId === kb.id
                  const isCollapsed = collapsedKnowledgeBases[kb.id]
                  const uploadTasks = uploadTasksByKnowledgeBase[kb.id] ?? []
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
                  const averageUploadProgress =
                    activeUploadTasks.length > 0
                      ? Math.round(
                          activeUploadTasks.reduce((sum, task) => sum + task.progress, 0) /
                            activeUploadTasks.length,
                        )
                      : 0
                  const hasClearableTasks = successUploadCount > 0 || canceledUploadCount > 0
                  const isDragOver = dragOverKnowledgeBaseId === kb.id
                  return (
                    <div key={kb.id} className={`kb-card${isSelected ? ' kb-card--active' : ''}`}>
                      {/* 知识库卡片头部 */}
                      <div className="kb-card-header">
                        <button
                          className="kb-card-main"
                          onClick={() => onSelectKnowledgeBase(kb.id)}
                        >
                          <div className="kb-card-icon">📁</div>
                          <div className="kb-card-info">
                            <span className="kb-card-name">{kb.name}</span>
                            {kb.description && (
                              <span className="kb-card-desc">{kb.description}</span>
                            )}
                            <span className="kb-card-meta">
                              {kb.documents.length} 份文档 · 创建于 {new Date(kb.createdAt).toLocaleDateString('zh-CN')}
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
                              onChange={(e) => handleFileChange(kb.id, e)}
                            />
                          </label>
                          <button
                            className="kb-reindex-btn"
                            onClick={() => {
                              void onReindexKnowledgeBase(kb.id)
                            }}
                            disabled={kb.documents.length === 0 || reindexingKnowledgeBaseId === kb.id || activeUploadTasks.length > 0}
                            title={
                              activeUploadTasks.length > 0
                                ? '请等待当前上传任务完成后再重建索引'
                                : kb.documents.length === 0
                                  ? '当前知识库暂无文档'
                                  : '使用当前 Embedding 配置重建索引'
                            }
                          >
                            {reindexingKnowledgeBaseId === kb.id ? '重建中...' : '重建索引'}
                          </button>
                          <button
                            className="kb-collapse-btn"
                            onClick={() => onToggleCollapse(kb.id)}
                            title={isCollapsed ? '展开' : '折叠'}
                          >
                            {isCollapsed ? '▸' : '▾'}
                          </button>
                          {deleteConfirmId === kb.id ? (
                            <div className="kb-delete-confirm">
                              <span>确认删除？</span>
                              <button
                                className="kb-delete-yes"
                                onClick={() => {
                                  onDeleteKnowledgeBase(kb.id)
                                  setDeleteConfirmId(null)
                                }}
                              >
                                删除
                              </button>
                              <button
                                className="kb-delete-no"
                                onClick={() => setDeleteConfirmId(null)}
                              >
                                取消
                              </button>
                            </div>
                          ) : (
                            <button
                              className="kb-delete-btn"
                              onClick={() => setDeleteConfirmId(kb.id)}
                              title={activeUploadTasks.length > 0 ? '存在上传任务时不可删除知识库' : '删除知识库'}
                              disabled={activeUploadTasks.length > 0}
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="kb-upload-hint">
                        <span className="kb-upload-hint-label">支持文件类型</span>
                        <span className="kb-upload-hint-value">{supportedFileTypes.join(' / ')}</span>
                      </div>

                      <div
                        className={`kb-upload-dropzone${isDragOver ? ' kb-upload-dropzone--active' : ''}`}
                        onDragOver={(event) => {
                          event.preventDefault()
                          event.dataTransfer.dropEffect = 'copy'
                          setDragOverKnowledgeBaseId(kb.id)
                        }}
                        onDragLeave={(event) => {
                          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                            setDragOverKnowledgeBaseId((current) => (current === kb.id ? null : current))
                          }
                        }}
                        onDrop={(event) => {
                          event.preventDefault()
                          setDragOverKnowledgeBaseId(null)
                          handleUploadByFileList(kb.id, event.dataTransfer.files)
                        }}
                      >
                        <div>
                          <strong>{isDragOver ? '松开鼠标，上传到当前知识库' : '支持拖拽上传到当前知识库'}</strong>
                          <span>也可以继续使用上方“上传”按钮进行多选上传</span>
                        </div>
                        <span className="kb-upload-dropzone-tag">拖拽上传</span>
                      </div>

                      {uploadTasks.length > 0 && (
                        <div className="kb-upload-progress-list">
                          <div className="kb-upload-summary">
                            <div className="kb-upload-summary-main">
                              <div className="kb-upload-summary-badges">
                                <span className="kb-upload-summary-chip">任务 {uploadTasks.length}</span>
                                <span className="kb-upload-summary-chip active">
                                  进行中 {activeUploadTasks.length}
                                  {activeUploadTasks.length > 0 ? ` · 平均 ${averageUploadProgress}%` : ''}
                                </span>
                                {successUploadCount > 0 ? (
                                  <span className="kb-upload-summary-chip success">完成 {successUploadCount}</span>
                                ) : null}
                                {failedUploadCount > 0 ? (
                                  <span className="kb-upload-summary-chip error">失败 {failedUploadCount}</span>
                                ) : null}
                                {canceledUploadCount > 0 ? (
                                  <span className="kb-upload-summary-chip muted">取消 {canceledUploadCount}</span>
                                ) : null}
                              </div>
                              <div className="kb-upload-total-progress" aria-label={`总进度 ${totalUploadProgress}%`}>
                                <div style={{ width: `${totalUploadProgress}%` }} />
                              </div>
                              <div className="kb-upload-total-progress-text">批量总进度 {totalUploadProgress}%</div>
                            </div>
                            <div className="kb-upload-summary-actions">
                              {activeUploadTasks.length === 0 && failedUploadTasks.length > 0 ? (
                                <button
                                  type="button"
                                  className="kb-upload-clear-btn"
                                  onClick={() => {
                                    void handleRetryFailedTasks(kb.id, failedUploadTasks)
                                  }}
                                >
                                  一键重试失败项
                                </button>
                              ) : null}
                              {hasClearableTasks ? (
                                <button
                                  type="button"
                                  className="kb-upload-clear-btn"
                                  onClick={() => onClearFinishedUploadTasks(kb.id)}
                                >
                                  清理已完成
                                </button>
                              ) : null}
                            </div>
                          </div>

                          {uploadTasks.map((task) => (
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
                                        onClick={() => onCancelUploadTask(kb.id, task.id)}
                                      >
                                        取消
                                      </button>
                                    ) : null}
                                    {activeUploadTasks.length === 0 && (task.status === 'error' || task.status === 'canceled') ? (
                                      <button
                                        type="button"
                                        className="kb-upload-action-btn primary"
                                        onClick={() => {
                                          void onRetryUploadTask(kb.id, task.id)
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
                              {task.detail ? (
                                <p className="kb-upload-progress-detail">{task.detail}</p>
                              ) : null}
                              {task.status === 'error' && task.error ? (
                                <p className="kb-upload-progress-error">{task.error}</p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 查询范围选择 */}
                      {isSelected && (
                        <div className="kb-scope-bar">
                          <button
                            className={`kb-scope-btn${selectedDocumentId === null ? ' kb-scope-btn--active' : ''}`}
                            onClick={() => onSelectDocument(kb.id, null)}
                          >
                            全部文档
                          </button>
                          {kb.documents.map((doc) => (
                            <button
                              key={doc.id}
                              className={`kb-scope-btn${selectedDocumentId === doc.id ? ' kb-scope-btn--active' : ''}`}
                              onClick={() => onSelectDocument(kb.id, doc.id)}
                            >
                              {doc.name}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* 文档列表 */}
                      {!isCollapsed && (
                        <div className="kb-docs">
                          {kb.documents.length === 0 ? (
                            <div className="kb-docs-empty">
                              <span>📄</span>
                              <span>暂无文档，点击「上传」添加文件</span>
                            </div>
                          ) : (
                            kb.documents.map((doc) => {
                              const badge = statusLabel(doc.status)
                              return (
                                <div
                                  key={doc.id}
                                  className={`kb-doc-item${selectedDocumentId === doc.id ? ' kb-doc-item--active' : ''}`}
                                >
                                  <button
                                    className="kb-doc-main"
                                    onClick={() => onSelectDocument(kb.id, doc.id)}
                                  >
                                    <div className="kb-doc-top">
                                      <span className="kb-doc-icon">📄</span>
                                      <span className="kb-doc-name">{doc.name}</span>
                                      <span
                                        className="kb-doc-badge"
                                        style={{ color: badge.color, background: badge.bg }}
                                      >
                                        {badge.text}
                                      </span>
                                    </div>
                                    {doc.contentPreview && (
                                      <p className="kb-doc-preview">{doc.contentPreview}</p>
                                    )}
                                    <div className="kb-doc-meta">
                                      <span>{doc.sizeLabel}</span>
                                      <span>·</span>
                                      <span>{new Date(doc.uploadedAt).toLocaleDateString('zh-CN')}</span>
                                    </div>
                                  </button>
                                  <button
                                    className="kb-doc-remove"
                                    onClick={() => onRemoveDocument(kb.id, doc.id)}
                                    title="删除文档"
                                  >
                                    ✕
                                  </button>
                                </div>
                              )
                            })
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 新建知识库弹窗 */}
      {showCreateModal && (
        <div className="kb-create-backdrop" onClick={handleCancelCreate}>
          <div className="kb-create-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="kb-create-dialog-header">
              <h3>新建知识库</h3>
              <button className="kb-close-btn" onClick={handleCancelCreate}>✕</button>
            </div>
            <div className="kb-create-dialog-body">
              <div className="kb-form-field">
                <label className="kb-form-label">知识库名称 <span className="kb-required">*</span></label>
                <input
                  className="kb-form-input"
                  type="text"
                  placeholder="例如：产品文档、技术手册…"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleConfirmCreate()}
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
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={3}
                  maxLength={200}
                />
              </div>
            </div>
            <div className="kb-create-dialog-footer">
              <button className="kb-cancel-btn" onClick={handleCancelCreate}>取消</button>
              <button
                className="kb-confirm-btn"
                onClick={handleConfirmCreate}
                disabled={!newName.trim()}
              >
                创建知识库
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default KnowledgePanel

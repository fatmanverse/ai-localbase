import React, { memo, useCallback, useMemo, useState } from 'react'
import { Conversation, KnowledgeBase, UploadTask } from '../App'
import KnowledgePanel from './knowledge/KnowledgePanel'

interface SidebarProps {
  isOpen: boolean
  onToggle: () => void
  knowledgeBases: KnowledgeBase[]
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
  conversations: Conversation[]
  activeConversationId: string | null
  onSelectConversation: (conversationId: string) => void
  onCreateConversation: () => void
  onRenameConversation: (conversationId: string, title: string) => void
  onDeleteConversation: (conversation: Conversation) => void
  isSettingsOpen: boolean
  isKnowledgePanelOpen: boolean
  onToggleSettings: () => void
  onToggleKnowledgePanel: () => void
}

interface ConversationRowProps {
  conversation: Conversation
  knowledgeBaseName: string
  isActive: boolean
  isMenuOpen: boolean
  isEditing: boolean
  editingTitle: string
  isComposingTitle: boolean
  onSelectConversation: (conversationId: string) => void
  onToggleMenu: (conversationId: string) => void
  onBeginEdit: (conversation: Conversation) => void
  onDeleteConversation: (conversation: Conversation) => void
  onEditingTitleChange: (value: string) => void
  onEditingCompositionStart: () => void
  onEditingCompositionEnd: (value: string) => void
  onCommitRename: (conversation: Conversation) => void
  onCancelRename: (conversation: Conversation) => void
}

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

const ConversationRow = memo(function ConversationRow({
  conversation,
  knowledgeBaseName,
  isActive,
  isMenuOpen,
  isEditing,
  editingTitle,
  isComposingTitle,
  onSelectConversation,
  onToggleMenu,
  onBeginEdit,
  onDeleteConversation,
  onEditingTitleChange,
  onEditingCompositionStart,
  onEditingCompositionEnd,
  onCommitRename,
  onCancelRename,
}: ConversationRowProps) {
  return (
    <div className={`conversation-item-row ${isMenuOpen ? 'menu-open' : ''}`}>
      {isEditing ? (
        <div className={`conversation-item conversation-item-editing ${isActive ? 'active' : ''}`}>
          <input
            className="conversation-title-input"
            type="text"
            value={editingTitle}
            autoFocus
            onFocus={(event) => {
              event.currentTarget.select()
            }}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onEditingTitleChange(event.currentTarget.value)}
            onCompositionStart={onEditingCompositionStart}
            onCompositionEnd={(event) => onEditingCompositionEnd(event.currentTarget.value)}
            onKeyDown={(event) => {
              event.stopPropagation()

              if (isComposingTitle || event.nativeEvent.isComposing) {
                return
              }

              if (event.key === 'Enter') {
                onCommitRename(conversation)
              }

              if (event.key === 'Escape') {
                onCancelRename(conversation)
              }
            }}
            onKeyUp={(event) => {
              event.stopPropagation()
            }}
            onBlur={() => {
              if (isComposingTitle) {
                return
              }
              onCommitRename(conversation)
            }}
          />
          <span className="conversation-meta">
            {knowledgeBaseName} · {conversation.messages.length} 条消息 · {formatDateTime(conversation.updatedAt)}
          </span>
        </div>
      ) : (
        <button
          type="button"
          className={`conversation-item ${isActive ? 'active' : ''}`}
          onClick={() => onSelectConversation(conversation.id)}
        >
          <span className="conversation-title-row-inline">
            <span className="conversation-title">{conversation.title}</span>
            <span className="conversation-kb-chip">{knowledgeBaseName}</span>
          </span>
          <span className="conversation-meta">
            {conversation.messages.length} 条消息 · {formatDateTime(conversation.updatedAt)}
          </span>
        </button>
      )}

      <div className="conversation-item-actions">
        <button
          type="button"
          className="conversation-menu-trigger"
          aria-label="打开会话菜单"
          onClick={(event) => {
            event.stopPropagation()
            onToggleMenu(conversation.id)
          }}
        >
          ⋯
        </button>

        {isMenuOpen ? (
          <div className="conversation-menu" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="conversation-menu-item"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onBeginEdit(conversation)}
            >
              重命名
            </button>
            <button
              type="button"
              className="conversation-menu-item danger"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onDeleteConversation(conversation)}
            >
              删除
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}, (prev, next) =>
  prev.conversation === next.conversation &&
  prev.knowledgeBaseName === next.knowledgeBaseName &&
  prev.isActive === next.isActive &&
  prev.isMenuOpen === next.isMenuOpen &&
  prev.isEditing === next.isEditing &&
  prev.editingTitle === next.editingTitle &&
  prev.isComposingTitle === next.isComposingTitle)

const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onToggle,
  knowledgeBases,
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
  conversations,
  activeConversationId,
  onSelectConversation,
  onCreateConversation,
  onRenameConversation,
  onDeleteConversation,
  isSettingsOpen,
  isKnowledgePanelOpen,
  onToggleSettings,
  onToggleKnowledgePanel,
}) => {
  const [collapsedKnowledgeBases, setCollapsedKnowledgeBases] = useState<Record<string, boolean>>({})
  const [menuConversationId, setMenuConversationId] = useState<string | null>(null)
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [isComposingTitle, setIsComposingTitle] = useState(false)

  const sortedKnowledgeBases = useMemo(() => knowledgeBases, [knowledgeBases])
  const knowledgeBaseNameById = useMemo(
    () => Object.fromEntries(sortedKnowledgeBases.map((knowledgeBase) => [knowledgeBase.id, knowledgeBase.name])),
    [sortedKnowledgeBases],
  )

  const toggleKnowledgeBaseCollapse = useCallback((knowledgeBaseId: string) => {
    setCollapsedKnowledgeBases((prev) => ({
      ...prev,
      [knowledgeBaseId]: !prev[knowledgeBaseId],
    }))
  }, [])

  const handleSelectConversation = useCallback((conversationId: string) => {
    setMenuConversationId(null)
    setEditingConversationId(null)
    onSelectConversation(conversationId)
  }, [onSelectConversation])

  const handleToggleMenu = useCallback((conversationId: string) => {
    setEditingConversationId(null)
    setMenuConversationId((current) => (current === conversationId ? null : conversationId))
  }, [])

  const handleBeginEdit = useCallback((conversation: Conversation) => {
    setMenuConversationId(null)
    setEditingConversationId(conversation.id)
    setEditingTitle(conversation.title)
    setIsComposingTitle(false)
  }, [])

  const handleDeleteConversation = useCallback((conversation: Conversation) => {
    setMenuConversationId(null)
    setEditingConversationId(null)
    onDeleteConversation(conversation)
  }, [onDeleteConversation])

  const handleCommitRename = useCallback((conversation: Conversation) => {
    const nextTitle = editingTitle.trim()
    setEditingConversationId(null)
    if (!nextTitle || nextTitle === conversation.title.trim()) {
      return
    }
    onRenameConversation(conversation.id, nextTitle)
  }, [editingTitle, onRenameConversation])

  const handleCancelRename = useCallback((conversation: Conversation) => {
    setEditingConversationId(null)
    setEditingTitle(conversation.title)
    setIsComposingTitle(false)
  }, [])

  const handleOpenOpsConsole = useCallback(() => {
    const nextURL = new URL(window.location.href)
    nextURL.searchParams.set('mode', 'ops')
    nextURL.searchParams.set('tab', 'feedback')
    window.open(nextURL.toString(), '_blank', 'noopener,noreferrer')
  }, [])

  return (
    <>
      <aside className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <button onClick={onToggle} className="toggle-btn" type="button">
            {isOpen ? '◁' : '▷'}
          </button>
          <h2>LocalBase</h2>
        </div>

        <div className="sidebar-body">
          <section className="section section-conversations">
            <div className="section-title-row">
              <h3>会话</h3>
              <button type="button" className="ghost-btn" onClick={onCreateConversation}>
                ＋ 新建
              </button>
            </div>

            <div className="conversation-list">
              {conversations.map((conversation) => (
                <ConversationRow
                  key={conversation.id}
                  conversation={conversation}
                  knowledgeBaseName={
                    conversation.knowledgeBaseId
                      ? knowledgeBaseNameById[conversation.knowledgeBaseId] ?? '知识库已删除'
                      : '未绑定知识库'
                  }
                  isActive={activeConversationId === conversation.id}
                  isMenuOpen={menuConversationId === conversation.id}
                  isEditing={editingConversationId === conversation.id}
                  editingTitle={editingConversationId === conversation.id ? editingTitle : conversation.title}
                  isComposingTitle={editingConversationId === conversation.id ? isComposingTitle : false}
                  onSelectConversation={handleSelectConversation}
                  onToggleMenu={handleToggleMenu}
                  onBeginEdit={handleBeginEdit}
                  onDeleteConversation={handleDeleteConversation}
                  onEditingTitleChange={setEditingTitle}
                  onEditingCompositionStart={() => setIsComposingTitle(true)}
                  onEditingCompositionEnd={(value) => {
                    setIsComposingTitle(false)
                    setEditingTitle(value)
                  }}
                  onCommitRename={handleCommitRename}
                  onCancelRename={handleCancelRename}
                />
              ))}
            </div>
          </section>

          <div className="sidebar-footer sidebar-footer-icons">
            <button
              type="button"
              className={`sidebar-icon-btn ${isSettingsOpen ? 'active' : ''}`}
              onClick={onToggleSettings}
              title="设置"
            >
              <span className="sidebar-icon-glyph">⚙️</span>
              <span>设置</span>
            </button>
            <button
              type="button"
              className={`sidebar-icon-btn ${isKnowledgePanelOpen ? 'active' : ''}`}
              onClick={onToggleKnowledgePanel}
              title="知识库"
            >
              <span className="sidebar-icon-glyph">📘</span>
              <span>知识库</span>
            </button>
            <button
              type="button"
              className="sidebar-icon-btn"
              onClick={handleOpenOpsConsole}
              title="治理台 / 反馈明细"
            >
              <span className="sidebar-icon-glyph">📊</span>
              <span>治理台</span>
            </button>
          </div>
        </div>
      </aside>

      <KnowledgePanel
        open={isKnowledgePanelOpen}
        knowledgeBases={sortedKnowledgeBases}
        collapsedKnowledgeBases={collapsedKnowledgeBases}
        onToggleCollapse={toggleKnowledgeBaseCollapse}
        selectedKnowledgeBaseId={selectedKnowledgeBaseId}
        selectedDocumentId={selectedDocumentId}
        onSelectKnowledgeBase={onSelectKnowledgeBase}
        onSelectDocument={onSelectDocument}
        onCreateKnowledgeBase={onCreateKnowledgeBase}
        onDeleteKnowledgeBase={onDeleteKnowledgeBase}
        onUploadFiles={onUploadFiles}
        uploadTasksByKnowledgeBase={uploadTasksByKnowledgeBase}
        onCancelUploadTask={onCancelUploadTask}
        onRetryUploadTask={onRetryUploadTask}
        onClearFinishedUploadTasks={onClearFinishedUploadTasks}
        onRemoveDocument={onRemoveDocument}
        onReindexKnowledgeBase={onReindexKnowledgeBase}
        onReindexDocument={onReindexDocument}
        onBatchReindexDocuments={onBatchReindexDocuments}
        reindexingKnowledgeBaseId={reindexingKnowledgeBaseId}
        reindexingDocumentKeys={reindexingDocumentKeys}
        onClose={onToggleKnowledgePanel}
      />
    </>
  )
}

const areSidebarPropsEqual = (prev: SidebarProps, next: SidebarProps) =>
  prev.isOpen === next.isOpen &&
  prev.knowledgeBases === next.knowledgeBases &&
  prev.selectedKnowledgeBaseId === next.selectedKnowledgeBaseId &&
  prev.selectedDocumentId === next.selectedDocumentId &&
  prev.uploadTasksByKnowledgeBase === next.uploadTasksByKnowledgeBase &&
  prev.reindexingKnowledgeBaseId === next.reindexingKnowledgeBaseId &&
  prev.reindexingDocumentKeys === next.reindexingDocumentKeys &&
  prev.conversations === next.conversations &&
  prev.activeConversationId === next.activeConversationId &&
  prev.isSettingsOpen === next.isSettingsOpen &&
  prev.isKnowledgePanelOpen === next.isKnowledgePanelOpen

export default memo(Sidebar, areSidebarPropsEqual)

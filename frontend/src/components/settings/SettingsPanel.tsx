import React, { useEffect, useMemo, useState } from 'react'
import { AppConfig, ChatConfig, EmbeddingConfig, recommendedConfig } from '../../App'

interface SettingsPanelProps {
  config: AppConfig
  onClose: () => void
  onSave: (config: AppConfig) => Promise<void>
  isSaving: boolean
  saveError: string | null
  saveSuccess: string | null
}

const normalizeContextLimit = (value: number) => Math.max(1, Math.min(100, Number(value) || 1))

const createRecommendedConfig = (): AppConfig => ({
  chat: { ...recommendedConfig.chat },
  embedding: { ...recommendedConfig.embedding },
})

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  config,
  onClose,
  onSave,
  isSaving,
  saveError,
  saveSuccess,
}) => {
  const [draftConfig, setDraftConfig] = useState<AppConfig>(config)

  const recommendedDraft = useMemo(() => createRecommendedConfig(), [])

  useEffect(() => {
    setDraftConfig(config)
  }, [config])

  const hasChanges = useMemo(
    () => JSON.stringify(draftConfig) !== JSON.stringify(config),
    [config, draftConfig],
  )

  const isUsingRecommendedConfig = useMemo(
    () => JSON.stringify(draftConfig) === JSON.stringify(recommendedDraft),
    [draftConfig, recommendedDraft],
  )

  const handleChatConfigChange = <K extends keyof ChatConfig>(
    key: K,
    value: ChatConfig[K],
  ) => {
    setDraftConfig((prev) => ({
      ...prev,
      chat: {
        ...prev.chat,
        [key]: key === 'contextMessageLimit' ? normalizeContextLimit(Number(value)) : value,
      },
    }))
  }

  const handleEmbeddingConfigChange = <K extends keyof EmbeddingConfig>(
    key: K,
    value: EmbeddingConfig[K],
  ) => {
    setDraftConfig((prev) => ({
      ...prev,
      embedding: {
        ...prev.embedding,
        [key]: value,
      },
    }))
  }

  const handleSave = async () => {
    await onSave(draftConfig)
  }

  const handleReset = () => {
    setDraftConfig(config)
  }

  const handleApplyRecommended = () => {
    setDraftConfig(createRecommendedConfig())
  }

  return (
    <div className="settings-modal-backdrop" onClick={onClose}>
      <div className="settings-modal settings-modal-single" onClick={(event) => event.stopPropagation()}>
        <div className="settings-modal-header">
          <div>
            <h3>AI 设置</h3>
            <p>编辑后点击保存，后端会统一持久化并立即生效。</p>
          </div>
          <button type="button" className="ghost-btn settings-close-btn" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="settings-modal-scroll">
          <section className="settings-panel-block ai-config-panel single-column">
            <div className="section-title-row knowledge-panel-header">
              <h3>聊天模型</h3>
            </div>

            <div className="ai-config-fields">
              <label className="settings-field">
                <span>Provider</span>
                <select
                  value={draftConfig.chat.provider}
                  onChange={(event) =>
                    handleChatConfigChange('provider', event.target.value as ChatConfig['provider'])
                  }
                >
                  <option value="ollama">Ollama</option>
                  <option value="openai-compatible">OpenAI Compatible</option>
                </select>
              </label>

              <label className="settings-field">
                <span>Base URL</span>
                <input
                  value={draftConfig.chat.baseUrl}
                  onChange={(event) => handleChatConfigChange('baseUrl', event.target.value)}
                  placeholder={
                    draftConfig.chat.provider === 'ollama'
                      ? 'http://localhost:11434'
                      : 'https://your-api.example.com/v1'
                  }
                />
              </label>

              <label className="settings-field">
                <span>Model</span>
                <input
                  value={draftConfig.chat.model}
                  onChange={(event) => handleChatConfigChange('model', event.target.value)}
                  placeholder="qwen2.5:7b"
                />
              </label>

              <label className="settings-field">
                <span>API Key</span>
                <input
                  type="password"
                  value={draftConfig.chat.apiKey}
                  onChange={(event) => handleChatConfigChange('apiKey', event.target.value)}
                  placeholder="选填"
                />
              </label>

              <label className="settings-field settings-field-full">
                <span>Temperature: {draftConfig.chat.temperature.toFixed(1)}</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={draftConfig.chat.temperature}
                  onChange={(event) =>
                    handleChatConfigChange('temperature', Number(event.target.value))
                  }
                />
              </label>

              <label className="settings-field settings-field-full">
                <span>上下文消息数量</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={draftConfig.chat.contextMessageLimit}
                  onChange={(event) =>
                    handleChatConfigChange('contextMessageLimit', Number(event.target.value))
                  }
                  placeholder="12"
                />
                <small>限制每次发送给模型的最近消息条数，范围 1-100。</small>
              </label>
            </div>
          </section>

          <section className="settings-panel-block ai-config-panel single-column">
            <div className="section-title-row knowledge-panel-header">
              <h3>Embedding 模型</h3>
            </div>

            <div className="ai-config-fields">
              <label className="settings-field">
                <span>Provider</span>
                <select
                  value={draftConfig.embedding.provider}
                  onChange={(event) =>
                    handleEmbeddingConfigChange(
                      'provider',
                      event.target.value as EmbeddingConfig['provider'],
                    )
                  }
                >
                  <option value="ollama">Ollama</option>
                  <option value="openai-compatible">OpenAI Compatible</option>
                </select>
              </label>

              <label className="settings-field">
                <span>Base URL</span>
                <input
                  value={draftConfig.embedding.baseUrl}
                  onChange={(event) => handleEmbeddingConfigChange('baseUrl', event.target.value)}
                  placeholder={
                    draftConfig.embedding.provider === 'ollama'
                      ? 'http://localhost:11434'
                      : 'https://your-api.example.com/v1'
                  }
                />
              </label>

              <label className="settings-field">
                <span>Model</span>
                <input
                  value={draftConfig.embedding.model}
                  onChange={(event) => handleEmbeddingConfigChange('model', event.target.value)}
                  placeholder="nomic-embed-text"
                />
              </label>

              <label className="settings-field">
                <span>API Key</span>
                <input
                  type="password"
                  value={draftConfig.embedding.apiKey}
                  onChange={(event) => handleEmbeddingConfigChange('apiKey', event.target.value)}
                  placeholder="选填"
                />
              </label>
            </div>

            <div className="settings-hint settings-hint-profile">
              <strong>当前内置推荐配置</strong>
              <ul className="settings-hint-list">
                <li>聊天模型：<code>qwen2.5:7b</code>，Temperature 默认 <code>0.2</code></li>
                <li>向量模型：<code>nomic-embed-text</code>，默认向量维度 <code>768</code></li>
                <li>RAG 内置策略：语义切片 <code>800</code> / Overlap <code>120</code></li>
                <li>检索策略：文档内 TopK <code>5</code>，知识库 TopK <code>6</code>，单文档最多 <code>2</code> 个切片</li>
              </ul>
            </div>

            <p className="settings-hint">
              切换 Embedding 模型后，旧文档向量不会自动重建。为了保证检索准确率，请重新上传文档或重建知识库索引。
            </p>
          </section>

          <div className="settings-modal-actions">
            <div className="settings-status-group">
              {saveError ? <div className="settings-status settings-status-error">{saveError}</div> : null}
              {!saveError && saveSuccess ? (
                <div className="settings-status settings-status-success">{saveSuccess}</div>
              ) : null}
            </div>

            <div className="settings-action-buttons">
              <button
                type="button"
                className="ghost-btn"
                onClick={handleReset}
                disabled={!hasChanges || isSaving}
              >
                重置为已保存
              </button>
              <button
                type="button"
                className="ghost-btn"
                onClick={handleApplyRecommended}
                disabled={isUsingRecommendedConfig || isSaving}
              >
                恢复推荐默认
              </button>
              <button
                type="button"
                className="btn-primary settings-save-btn"
                onClick={() => {
                  void handleSave()
                }}
                disabled={!hasChanges || isSaving}
              >
                {isSaving ? '保存中...' : '保存并生效'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsPanel

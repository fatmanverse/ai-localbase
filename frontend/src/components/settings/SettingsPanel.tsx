import React, { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { AppConfig, ChatConfig, CircuitBreakerConfig, DEFAULT_SUGGESTED_PROMPTS, DEFAULT_WELCOME_MESSAGE_TEMPLATE, EmbeddingConfig, ModelEndpointConfig, recommendedConfig } from '../../App'

interface SettingsPanelProps {
  config: AppConfig
  onClose: () => void
  onSave: (config: AppConfig) => Promise<void>
  isSaving: boolean
  saveError: string | null
  saveSuccess: string | null
}

const normalizeContextLimit = (value: number) => Math.max(1, Math.min(100, Number(value) || 1))
const normalizeCircuitBreakerNumber = (value: number, min: number, max: number, fallback: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.max(min, Math.min(max, parsed))
}

const cloneCandidates = (items: ModelEndpointConfig[] | undefined) =>
  (items ?? []).map((item) => ({ ...item }))

const createRecommendedConfig = (): AppConfig => ({
  chat: {
    ...recommendedConfig.chat,
    candidates: cloneCandidates(recommendedConfig.chat.candidates),
    circuitBreaker: { ...recommendedConfig.chat.circuitBreaker },
  },
  embedding: {
    ...recommendedConfig.embedding,
    candidates: cloneCandidates(recommendedConfig.embedding.candidates),
    circuitBreaker: { ...recommendedConfig.embedding.circuitBreaker },
  },
  ui: {
    welcomeMessageTemplate:
      recommendedConfig.ui?.welcomeMessageTemplate || DEFAULT_WELCOME_MESSAGE_TEMPLATE,
    suggestedPrompts: [...(recommendedConfig.ui?.suggestedPrompts ?? DEFAULT_SUGGESTED_PROMPTS)],
  },
})

const formatCandidateLines = (items: ModelEndpointConfig[] | undefined) =>
  (items ?? [])
    .map((item) => {
      const provider = item.provider?.trim() ?? ''
      const baseUrl = item.baseUrl?.trim() ?? ''
      const model = item.model?.trim() ?? ''
      const apiKey = item.apiKey?.trim() ?? ''
      if (!model) {
        return ''
      }
      if (!provider && !baseUrl && !apiKey) {
        return model
      }
      if (!provider && baseUrl && !apiKey) {
        return `${baseUrl} | ${model}`
      }
      if (!apiKey) {
        return `${provider} | ${baseUrl} | ${model}`
      }
      return `${provider} | ${baseUrl} | ${model} | ${apiKey}`
    })
    .filter(Boolean)
    .join('\n')

const formatPromptLines = (items: string[] | undefined) =>
  (items ?? []).map((item) => item.trim()).filter(Boolean).join('\n')

const parsePromptLines = (value: string): string[] =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line, index, arr) => arr.indexOf(line) === index)
    .slice(0, 8)

const parseCandidateLines = (value: string): ModelEndpointConfig[] => {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const items: ModelEndpointConfig[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    const parts = line.split('|').map((item) => item.trim())
    let candidate: ModelEndpointConfig | null = null

    if (parts.length === 1) {
      candidate = {
        provider: '',
        baseUrl: '',
        model: parts[0],
        apiKey: '',
      }
    } else if (parts.length === 2) {
      const firstPart = parts[0]
      candidate =
        firstPart === 'ollama' || firstPart === 'openai-compatible'
          ? {
              provider: firstPart,
              baseUrl: '',
              model: parts[1],
              apiKey: '',
            }
          : {
              provider: '',
              baseUrl: parts[0],
              model: parts[1],
              apiKey: '',
            }
    } else {
      candidate = {
        provider: parts[0] || 'ollama',
        baseUrl: parts[1] ?? '',
        model: parts[2] ?? '',
        apiKey: parts[3] ?? '',
      }
    }

    if (!candidate.model.trim()) {
      continue
    }

    const key = [
      candidate.provider.trim(),
      candidate.baseUrl.trim(),
      candidate.model.trim(),
      candidate.apiKey.trim(),
    ].join('|')
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    items.push(candidate)
  }

  return items
}

const buildEffectiveDraftConfig = (options: {
  draftConfig: AppConfig
  chatCandidatesText: string
  embeddingCandidatesText: string
  suggestedPromptsText: string
}): AppConfig => ({
  ...options.draftConfig,
  chat: {
    ...options.draftConfig.chat,
    candidates: parseCandidateLines(options.chatCandidatesText),
  },
  embedding: {
    ...options.draftConfig.embedding,
    candidates: parseCandidateLines(options.embeddingCandidatesText),
  },
  ui: {
    ...options.draftConfig.ui,
    welcomeMessageTemplate:
      options.draftConfig.ui?.welcomeMessageTemplate?.trim() || DEFAULT_WELCOME_MESSAGE_TEMPLATE,
    suggestedPrompts: parsePromptLines(options.suggestedPromptsText),
  },
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
  const [chatCandidatesText, setChatCandidatesText] = useState(() =>
    formatCandidateLines(config.chat.candidates),
  )
  const [embeddingCandidatesText, setEmbeddingCandidatesText] = useState(() =>
    formatCandidateLines(config.embedding.candidates),
  )
  const [suggestedPromptsText, setSuggestedPromptsText] = useState(() =>
    formatPromptLines(config.ui?.suggestedPrompts),
  )

  const recommendedDraft = useMemo(() => createRecommendedConfig(), [])

  useEffect(() => {
    setDraftConfig(config)
    setChatCandidatesText(formatCandidateLines(config.chat.candidates))
    setEmbeddingCandidatesText(formatCandidateLines(config.embedding.candidates))
    setSuggestedPromptsText(formatPromptLines(config.ui?.suggestedPrompts))
  }, [config])

  const deferredDraftConfig = useDeferredValue(draftConfig)
  const deferredChatCandidatesText = useDeferredValue(chatCandidatesText)
  const deferredEmbeddingCandidatesText = useDeferredValue(embeddingCandidatesText)
  const deferredSuggestedPromptsText = useDeferredValue(suggestedPromptsText)

  const effectiveDraftConfig = useMemo<AppConfig>(
    () =>
      buildEffectiveDraftConfig({
        draftConfig,
        chatCandidatesText,
        embeddingCandidatesText,
        suggestedPromptsText,
      }),
    [chatCandidatesText, draftConfig, embeddingCandidatesText, suggestedPromptsText],
  )

  const comparisonDraftConfig = useMemo<AppConfig>(
    () =>
      buildEffectiveDraftConfig({
        draftConfig: deferredDraftConfig,
        chatCandidatesText: deferredChatCandidatesText,
        embeddingCandidatesText: deferredEmbeddingCandidatesText,
        suggestedPromptsText: deferredSuggestedPromptsText,
      }),
    [
      deferredChatCandidatesText,
      deferredDraftConfig,
      deferredEmbeddingCandidatesText,
      deferredSuggestedPromptsText,
    ],
  )

  const savedConfigSnapshot = useMemo(() => JSON.stringify(config), [config])
  const recommendedDraftSnapshot = useMemo(() => JSON.stringify(recommendedDraft), [recommendedDraft])
  const comparisonDraftSnapshot = useMemo(() => JSON.stringify(comparisonDraftConfig), [comparisonDraftConfig])

  const hasChanges = comparisonDraftSnapshot !== savedConfigSnapshot

  const isUsingRecommendedConfig = comparisonDraftSnapshot === recommendedDraftSnapshot

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

  const handleWelcomeMessageTemplateChange = (value: string) => {
    setDraftConfig((prev) => ({
      ...prev,
      ui: {
        ...prev.ui,
        welcomeMessageTemplate: value,
      },
    }))
  }

  const handleSuggestedPromptsChange = (value: string) => {
    setSuggestedPromptsText(value)
  }

  const handleChatCircuitBreakerChange = <K extends keyof CircuitBreakerConfig>(
    key: K,
    value: CircuitBreakerConfig[K],
  ) => {
    setDraftConfig((prev) => ({
      ...prev,
      chat: {
        ...prev.chat,
        circuitBreaker: {
          ...prev.chat.circuitBreaker,
          [key]: normalizeCircuitBreakerNumber(
            Number(value),
            1,
            key === 'cooldownSeconds' ? 3600 : 20,
            prev.chat.circuitBreaker[key],
          ),
        },
      },
    }))
  }

  const handleEmbeddingCircuitBreakerChange = <K extends keyof CircuitBreakerConfig>(
    key: K,
    value: CircuitBreakerConfig[K],
  ) => {
    setDraftConfig((prev) => ({
      ...prev,
      embedding: {
        ...prev.embedding,
        circuitBreaker: {
          ...prev.embedding.circuitBreaker,
          [key]: normalizeCircuitBreakerNumber(
            Number(value),
            1,
            key === 'cooldownSeconds' ? 3600 : 20,
            prev.embedding.circuitBreaker[key],
          ),
        },
      },
    }))
  }

  const handleSave = async () => {
    await onSave(effectiveDraftConfig)
  }

  const handleReset = () => {
    setDraftConfig(config)
    setChatCandidatesText(formatCandidateLines(config.chat.candidates))
    setEmbeddingCandidatesText(formatCandidateLines(config.embedding.candidates))
    setSuggestedPromptsText(formatPromptLines(config.ui?.suggestedPrompts))
  }

  const handleApplyRecommended = () => {
    const nextConfig = createRecommendedConfig()
    setDraftConfig(nextConfig)
    setChatCandidatesText(formatCandidateLines(nextConfig.chat.candidates))
    setEmbeddingCandidatesText(formatCandidateLines(nextConfig.embedding.candidates))
    setSuggestedPromptsText(formatPromptLines(nextConfig.ui?.suggestedPrompts))
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
                <span>温度（回答发散度）：{draftConfig.chat.temperature.toFixed(1)}</span>
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
                <small>值越低越稳定，越适合知识库问答；默认推荐 <code>0.2</code>。</small>
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

              <label className="settings-field">
                <span>聊天熔断阈值</span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={draftConfig.chat.circuitBreaker.failureThreshold}
                  onChange={(event) =>
                    handleChatCircuitBreakerChange('failureThreshold', Number(event.target.value))
                  }
                />
                <small>同一提供方连续失败达到该次数后，暂时熔断。</small>
              </label>

              <label className="settings-field">
                <span>聊天冷却秒数</span>
                <input
                  type="number"
                  min="1"
                  max="3600"
                  value={draftConfig.chat.circuitBreaker.cooldownSeconds}
                  onChange={(event) =>
                    handleChatCircuitBreakerChange('cooldownSeconds', Number(event.target.value))
                  }
                />
                <small>熔断后等待多久再放一个探测请求。</small>
              </label>

              <label className="settings-field">
                <span>聊天半开探测数</span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={draftConfig.chat.circuitBreaker.halfOpenMaxRequests}
                  onChange={(event) =>
                    handleChatCircuitBreakerChange('halfOpenMaxRequests', Number(event.target.value))
                  }
                />
                <small>冷却结束后允许多少个请求先试探恢复。</small>
              </label>

              <label className="settings-field settings-field-full">
                <span>聊天备用模型</span>
                <textarea
                  rows={4}
                  value={chatCandidatesText}
                  onChange={(event) => setChatCandidatesText(event.target.value)}
                  placeholder={['qwen2.5:14b', 'openai-compatible | https://api.example.com/v1 | gpt-4o-mini | sk-***'].join('\n')}
                />
                <small>
                  每行一个备用模型。支持仅写模型名（继承主 Provider / Base URL / API Key），或使用
                  <code>provider | baseUrl | model | apiKey</code> 完整格式。主模型失败后会自动切换到下一项。
                </small>
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

              <label className="settings-field">
                <span>向量熔断阈值</span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={draftConfig.embedding.circuitBreaker.failureThreshold}
                  onChange={(event) =>
                    handleEmbeddingCircuitBreakerChange('failureThreshold', Number(event.target.value))
                  }
                />
                <small>同一向量提供方连续失败达到该次数后，暂时熔断。</small>
              </label>

              <label className="settings-field">
                <span>向量冷却秒数</span>
                <input
                  type="number"
                  min="1"
                  max="3600"
                  value={draftConfig.embedding.circuitBreaker.cooldownSeconds}
                  onChange={(event) =>
                    handleEmbeddingCircuitBreakerChange('cooldownSeconds', Number(event.target.value))
                  }
                />
                <small>熔断后等待多久再放一个探测请求。</small>
              </label>

              <label className="settings-field">
                <span>向量半开探测数</span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={draftConfig.embedding.circuitBreaker.halfOpenMaxRequests}
                  onChange={(event) =>
                    handleEmbeddingCircuitBreakerChange('halfOpenMaxRequests', Number(event.target.value))
                  }
                />
                <small>冷却结束后允许多少个请求先试探恢复。</small>
              </label>

              <label className="settings-field settings-field-full">
                <span>Embedding 备用模型</span>
                <textarea
                  rows={4}
                  value={embeddingCandidatesText}
                  onChange={(event) => setEmbeddingCandidatesText(event.target.value)}
                  placeholder={['bge-m3', 'openai-compatible | https://api.example.com/v1 | text-embedding-3-small | sk-***'].join('\n')}
                />
                <small>
                  每行一个备用向量模型。支持仅写模型名，或使用
                  <code>provider | baseUrl | model | apiKey</code> 完整格式。主向量模型失败后会自动切换到下一项。
                </small>
              </label>
            </div>

            <div className="settings-hint settings-hint-profile">
              <strong>当前内置推荐配置</strong>
              <ul className="settings-hint-list">
                <li>聊天模型：<code>qwen2.5:7b</code>，温度默认 <code>0.2</code></li>
                <li>向量模型：<code>nomic-embed-text</code>，默认向量维度 <code>768</code></li>
                <li>RAG 内置策略：类型感知切片，默认窗口 <code>800</code> / Overlap <code>120</code></li>
                <li>检索策略：默认开启混合检索 / 语义重排 / 查询改写，文档内 TopK <code>5</code>，知识库 TopK <code>6</code>，单文档最多 <code>2</code> 个切片</li>
                <li>容灾策略：支持多提供方顺序切换，默认熔断阈值 <code>2</code>，冷却 <code>30s</code></li>
              </ul>
            </div>

            <p className="settings-hint">
              切换 Embedding 模型后，旧文档向量不会自动重建。为了保证检索准确率，请重新上传文档或重建知识库索引。
            </p>
          </section>

          <section className="settings-panel-block ai-config-panel single-column">
            <div className="section-title-row knowledge-panel-header">
              <h3>界面文案</h3>
            </div>

            <div className="ai-config-fields">
              <label className="settings-field settings-field-full">
                <span>欢迎提示语模板</span>
                <textarea
                  rows={4}
                  value={draftConfig.ui?.welcomeMessageTemplate ?? ''}
                  onChange={(event) => handleWelcomeMessageTemplateChange(event.target.value)}
                  placeholder={DEFAULT_WELCOME_MESSAGE_TEMPLATE}
                />
                <small>
                  支持变量
                  <code>{'{knowledgeBaseHint}'}</code>
                  和
                  <code>{'{knowledgeBaseName}'}</code>。
                  例如：
                  <code>你好，我是 AI LocalBase 助手。{'{knowledgeBaseHint}'}</code>
                </small>
              </label>

              <label className="settings-field settings-field-full">
                <span>默认问题建议</span>
                <textarea
                  rows={5}
                  value={suggestedPromptsText}
                  onChange={(event) => handleSuggestedPromptsChange(event.target.value)}
                  placeholder={DEFAULT_SUGGESTED_PROMPTS.join('\n')}
                />
                <small>
                  普通聊天页底部的快捷提问按钮支持自定义。每行一条，最多保留 <code>8</code> 条；留空会自动回退到默认建议。
                </small>
              </label>
            </div>

            <p className="settings-hint">
              该区域用于控制普通聊天页的新建会话欢迎文案与快捷提问建议。若相关配置留空，会自动回退到默认值。
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

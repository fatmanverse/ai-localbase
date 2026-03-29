import React, { ReactNode, memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
  AppConfig,
  ChatConfig,
  CircuitBreakerConfig,
  DEFAULT_SUGGESTED_PROMPTS,
  DEFAULT_WELCOME_MESSAGE_TEMPLATE,
  EmbeddingConfig,
  ModelEndpointConfig,
  recommendedConfig,
} from '../../App'

interface SettingsPanelProps {
  config: AppConfig
  onClose: () => void
  onSave: (config: AppConfig) => Promise<void>
  isSaving: boolean
  saveError: string | null
  saveSuccess: string | null
}

interface ChatSettingsSectionProps {
  chatConfig: ChatConfig
  chatCandidatesText: string
  onChatConfigChange: (key: keyof ChatConfig, value: ChatConfig[keyof ChatConfig]) => void
  onChatCircuitBreakerChange: (
    key: keyof CircuitBreakerConfig,
    value: CircuitBreakerConfig[keyof CircuitBreakerConfig],
  ) => void
  onChatCandidatesTextChange: (value: string) => void
}

interface EmbeddingSettingsSectionProps {
  embeddingConfig: EmbeddingConfig
  embeddingCandidatesText: string
  onEmbeddingConfigChange: (
    key: keyof EmbeddingConfig,
    value: EmbeddingConfig[keyof EmbeddingConfig],
  ) => void
  onEmbeddingCircuitBreakerChange: (
    key: keyof CircuitBreakerConfig,
    value: CircuitBreakerConfig[keyof CircuitBreakerConfig],
  ) => void
  onEmbeddingCandidatesTextChange: (value: string) => void
}

interface UISettingsSectionProps {
  welcomeMessageTemplate: string
  suggestedPromptsText: string
  onWelcomeMessageTemplateChange: (value: string) => void
  onSuggestedPromptsChange: (value: string) => void
}

interface SettingsFooterProps {
  saveError: string | null
  saveSuccess: string | null
  hasChanges: boolean
  isSaving: boolean
  isUsingRecommendedConfig: boolean
  onReset: () => void
  onApplyRecommended: () => void
  onSave: () => void
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

const providerOptions = [
  { value: 'ollama', label: 'Ollama' },
  { value: 'openai-compatible', label: 'OpenAI Compatible' },
] as const

const defaultChatCandidatesPlaceholder = [
  'qwen2.5:14b',
  'openai-compatible | https://api.example.com/v1 | gpt-4o-mini | sk-***',
].join('\n')

const defaultEmbeddingCandidatesPlaceholder = [
  'bge-m3',
  'openai-compatible | https://api.example.com/v1 | text-embedding-3-small | sk-***',
].join('\n')

interface FieldContainerProps {
  label: ReactNode
  fullWidth?: boolean
  hint?: ReactNode
  children: ReactNode
}

interface TextInputFieldProps {
  label: ReactNode
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: 'text' | 'password'
  fullWidth?: boolean
  hint?: ReactNode
}

interface SelectFieldProps {
  label: ReactNode
  value: string
  onChange: (value: string) => void
  options: ReadonlyArray<{ value: string; label: string }>
  fullWidth?: boolean
  hint?: ReactNode
}

interface NumberInputFieldProps {
  label: ReactNode
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  placeholder?: string
  fullWidth?: boolean
  hint?: ReactNode
}

interface RangeFieldProps {
  label: ReactNode
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step: number
  fullWidth?: boolean
  hint?: ReactNode
}

interface TextareaFieldProps {
  label: ReactNode
  value: string
  onChange: (value: string) => void
  rows: number
  placeholder?: string
  fullWidth?: boolean
  hint?: ReactNode
}

const SectionHeader = memo(function SectionHeader({ title }: { title: string }) {
  return (
    <div className="section-title-row knowledge-panel-header">
      <h3>{title}</h3>
    </div>
  )
})

const FieldContainer = memo(function FieldContainer({ label, fullWidth, hint, children }: FieldContainerProps) {
  return (
    <label className={`settings-field ${fullWidth ? 'settings-field-full' : ''}`.trim()}>
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  )
})

const TextInputField = memo(function TextInputField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  fullWidth,
  hint,
}: TextInputFieldProps) {
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange(event.target.value)
    },
    [onChange],
  )

  return (
    <FieldContainer label={label} fullWidth={fullWidth} hint={hint}>
      <input type={type} value={value} onChange={handleChange} placeholder={placeholder} />
    </FieldContainer>
  )
})

const SelectField = memo(function SelectField({ label, value, onChange, options, fullWidth, hint }: SelectFieldProps) {
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      onChange(event.target.value)
    },
    [onChange],
  )

  return (
    <FieldContainer label={label} fullWidth={fullWidth} hint={hint}>
      <select value={value} onChange={handleChange}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldContainer>
  )
})

const NumberInputField = memo(function NumberInputField({
  label,
  value,
  onChange,
  min,
  max,
  placeholder,
  fullWidth,
  hint,
}: NumberInputFieldProps) {
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange(Number(event.target.value))
    },
    [onChange],
  )

  return (
    <FieldContainer label={label} fullWidth={fullWidth} hint={hint}>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
      />
    </FieldContainer>
  )
})

const RangeField = memo(function RangeField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  fullWidth,
  hint,
}: RangeFieldProps) {
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange(Number(event.target.value))
    },
    [onChange],
  )

  return (
    <FieldContainer label={label} fullWidth={fullWidth} hint={hint}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={handleChange} />
    </FieldContainer>
  )
})

const TextareaField = memo(function TextareaField({
  label,
  value,
  onChange,
  rows,
  placeholder,
  fullWidth,
  hint,
}: TextareaFieldProps) {
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(event.target.value)
    },
    [onChange],
  )

  return (
    <FieldContainer label={label} fullWidth={fullWidth} hint={hint}>
      <textarea rows={rows} value={value} onChange={handleChange} placeholder={placeholder} />
    </FieldContainer>
  )
})

const EmbeddingRecommendedProfile = memo(function EmbeddingRecommendedProfile() {
  return (
    <div className="settings-hint settings-hint-profile">
      <strong>当前内置推荐配置</strong>
      <ul className="settings-hint-list">
        <li>聊天模型：<code>qwen2.5:7b</code>，温度默认 <code>0.2</code></li>
        <li>向量模型：<code>nomic-embed-text</code>，默认向量维度 <code>768</code></li>
        <li>RAG 内置策略：类型感知切片，默认窗口 <code>800</code> / Overlap <code>120</code></li>
        <li>
          检索策略：默认开启混合检索 / 语义重排 / 查询改写，文档内 TopK <code>5</code>，知识库 TopK <code>6</code>，单文档最多 <code>2</code> 个切片
        </li>
        <li>容灾策略：支持多提供方顺序切换，默认熔断阈值 <code>2</code>，冷却 <code>30s</code></li>
      </ul>
    </div>
  )
})

const ChatSettingsSection = memo(function ChatSettingsSection({
  chatConfig,
  chatCandidatesText,
  onChatConfigChange,
  onChatCircuitBreakerChange,
  onChatCandidatesTextChange,
}: ChatSettingsSectionProps) {
  const handleProviderChange = useCallback(
    (value: string) => onChatConfigChange('provider', value as ChatConfig['provider']),
    [onChatConfigChange],
  )
  const handleBaseUrlChange = useCallback((value: string) => onChatConfigChange('baseUrl', value), [onChatConfigChange])
  const handleModelChange = useCallback((value: string) => onChatConfigChange('model', value), [onChatConfigChange])
  const handleApiKeyChange = useCallback((value: string) => onChatConfigChange('apiKey', value), [onChatConfigChange])
  const handleTemperatureChange = useCallback(
    (value: number) => onChatConfigChange('temperature', value),
    [onChatConfigChange],
  )
  const handleContextMessageLimitChange = useCallback(
    (value: number) => onChatConfigChange('contextMessageLimit', value),
    [onChatConfigChange],
  )
  const handleFailureThresholdChange = useCallback(
    (value: number) => onChatCircuitBreakerChange('failureThreshold', value),
    [onChatCircuitBreakerChange],
  )
  const handleCooldownSecondsChange = useCallback(
    (value: number) => onChatCircuitBreakerChange('cooldownSeconds', value),
    [onChatCircuitBreakerChange],
  )
  const handleHalfOpenMaxRequestsChange = useCallback(
    (value: number) => onChatCircuitBreakerChange('halfOpenMaxRequests', value),
    [onChatCircuitBreakerChange],
  )

  return (
    <section className="settings-panel-block ai-config-panel single-column">
      <SectionHeader title="聊天模型" />

      <div className="ai-config-fields">
        <SelectField
          label="Provider"
          value={chatConfig.provider}
          onChange={handleProviderChange}
          options={providerOptions}
        />

        <TextInputField
          label="Base URL"
          value={chatConfig.baseUrl}
          onChange={handleBaseUrlChange}
          placeholder={
            chatConfig.provider === 'ollama'
              ? 'http://localhost:11434'
              : 'https://your-api.example.com/v1'
          }
        />

        <TextInputField
          label="Model"
          value={chatConfig.model}
          onChange={handleModelChange}
          placeholder="qwen2.5:7b"
        />

        <TextInputField
          label="API Key"
          type="password"
          value={chatConfig.apiKey}
          onChange={handleApiKeyChange}
          placeholder="选填"
        />

        <RangeField
          label={`温度（回答发散度）：${chatConfig.temperature.toFixed(1)}`}
          value={chatConfig.temperature}
          onChange={handleTemperatureChange}
          min={0}
          max={1}
          step={0.1}
          fullWidth
          hint={
            <>
              值越低越稳定，越适合知识库问答；默认推荐 <code>0.2</code>。
            </>
          }
        />

        <NumberInputField
          label="上下文消息数量"
          value={chatConfig.contextMessageLimit}
          onChange={handleContextMessageLimitChange}
          min={1}
          max={100}
          placeholder="12"
          fullWidth
          hint="限制每次发送给模型的最近消息条数，范围 1-100。"
        />

        <NumberInputField
          label="聊天熔断阈值"
          value={chatConfig.circuitBreaker.failureThreshold}
          onChange={handleFailureThresholdChange}
          min={1}
          max={20}
          hint="同一提供方连续失败达到该次数后，暂时熔断。"
        />

        <NumberInputField
          label="聊天冷却秒数"
          value={chatConfig.circuitBreaker.cooldownSeconds}
          onChange={handleCooldownSecondsChange}
          min={1}
          max={3600}
          hint="熔断后等待多久再放一个探测请求。"
        />

        <NumberInputField
          label="聊天半开探测数"
          value={chatConfig.circuitBreaker.halfOpenMaxRequests}
          onChange={handleHalfOpenMaxRequestsChange}
          min={1}
          max={20}
          hint="冷却结束后允许多少个请求先试探恢复。"
        />

        <TextareaField
          label="聊天备用模型"
          rows={4}
          value={chatCandidatesText}
          onChange={onChatCandidatesTextChange}
          placeholder={defaultChatCandidatesPlaceholder}
          fullWidth
          hint={
            <>
              每行一个备用模型。支持仅写模型名（继承主 Provider / Base URL / API Key），或使用
              <code>provider | baseUrl | model | apiKey</code> 完整格式。主模型失败后会自动切换到下一项。
            </>
          }
        />
      </div>
    </section>
  )
})

const EmbeddingSettingsSection = memo(function EmbeddingSettingsSection({
  embeddingConfig,
  embeddingCandidatesText,
  onEmbeddingConfigChange,
  onEmbeddingCircuitBreakerChange,
  onEmbeddingCandidatesTextChange,
}: EmbeddingSettingsSectionProps) {
  const handleProviderChange = useCallback(
    (value: string) => onEmbeddingConfigChange('provider', value as EmbeddingConfig['provider']),
    [onEmbeddingConfigChange],
  )
  const handleBaseUrlChange = useCallback(
    (value: string) => onEmbeddingConfigChange('baseUrl', value),
    [onEmbeddingConfigChange],
  )
  const handleModelChange = useCallback(
    (value: string) => onEmbeddingConfigChange('model', value),
    [onEmbeddingConfigChange],
  )
  const handleApiKeyChange = useCallback(
    (value: string) => onEmbeddingConfigChange('apiKey', value),
    [onEmbeddingConfigChange],
  )
  const handleFailureThresholdChange = useCallback(
    (value: number) => onEmbeddingCircuitBreakerChange('failureThreshold', value),
    [onEmbeddingCircuitBreakerChange],
  )
  const handleCooldownSecondsChange = useCallback(
    (value: number) => onEmbeddingCircuitBreakerChange('cooldownSeconds', value),
    [onEmbeddingCircuitBreakerChange],
  )
  const handleHalfOpenMaxRequestsChange = useCallback(
    (value: number) => onEmbeddingCircuitBreakerChange('halfOpenMaxRequests', value),
    [onEmbeddingCircuitBreakerChange],
  )

  return (
    <section className="settings-panel-block ai-config-panel single-column">
      <SectionHeader title="Embedding 模型" />

      <div className="ai-config-fields">
        <SelectField
          label="Provider"
          value={embeddingConfig.provider}
          onChange={handleProviderChange}
          options={providerOptions}
        />

        <TextInputField
          label="Base URL"
          value={embeddingConfig.baseUrl}
          onChange={handleBaseUrlChange}
          placeholder={
            embeddingConfig.provider === 'ollama'
              ? 'http://localhost:11434'
              : 'https://your-api.example.com/v1'
          }
        />

        <TextInputField
          label="Model"
          value={embeddingConfig.model}
          onChange={handleModelChange}
          placeholder="nomic-embed-text"
        />

        <TextInputField
          label="API Key"
          type="password"
          value={embeddingConfig.apiKey}
          onChange={handleApiKeyChange}
          placeholder="选填"
        />

        <NumberInputField
          label="向量熔断阈值"
          value={embeddingConfig.circuitBreaker.failureThreshold}
          onChange={handleFailureThresholdChange}
          min={1}
          max={20}
          hint="同一向量提供方连续失败达到该次数后，暂时熔断。"
        />

        <NumberInputField
          label="向量冷却秒数"
          value={embeddingConfig.circuitBreaker.cooldownSeconds}
          onChange={handleCooldownSecondsChange}
          min={1}
          max={3600}
          hint="熔断后等待多久再放一个探测请求。"
        />

        <NumberInputField
          label="向量半开探测数"
          value={embeddingConfig.circuitBreaker.halfOpenMaxRequests}
          onChange={handleHalfOpenMaxRequestsChange}
          min={1}
          max={20}
          hint="冷却结束后允许多少个请求先试探恢复。"
        />

        <TextareaField
          label="Embedding 备用模型"
          rows={4}
          value={embeddingCandidatesText}
          onChange={onEmbeddingCandidatesTextChange}
          placeholder={defaultEmbeddingCandidatesPlaceholder}
          fullWidth
          hint={
            <>
              每行一个备用向量模型。支持仅写模型名，或使用
              <code>provider | baseUrl | model | apiKey</code> 完整格式。主向量模型失败后会自动切换到下一项。
            </>
          }
        />
      </div>

      <EmbeddingRecommendedProfile />

      <p className="settings-hint">
        切换 Embedding 模型后，旧文档向量不会自动重建。为了保证检索准确率，请重新上传文档或重建知识库索引。
      </p>
    </section>
  )
})

const UISettingsSection = memo(function UISettingsSection({
  welcomeMessageTemplate,
  suggestedPromptsText,
  onWelcomeMessageTemplateChange,
  onSuggestedPromptsChange,
}: UISettingsSectionProps) {
  return (
    <section className="settings-panel-block ai-config-panel single-column">
      <SectionHeader title="界面文案" />

      <div className="ai-config-fields">
        <TextareaField
          label="欢迎提示语模板"
          rows={4}
          value={welcomeMessageTemplate}
          onChange={onWelcomeMessageTemplateChange}
          placeholder={DEFAULT_WELCOME_MESSAGE_TEMPLATE}
          fullWidth
          hint={
            <>
              支持变量 <code>{'{knowledgeBaseHint}'}</code> 和 <code>{'{knowledgeBaseName}'}</code>。例如：
              <code>你好，我是 AI LocalBase 助手。{'{knowledgeBaseHint}'}</code>
            </>
          }
        />

        <TextareaField
          label="默认问题建议"
          rows={5}
          value={suggestedPromptsText}
          onChange={onSuggestedPromptsChange}
          placeholder={DEFAULT_SUGGESTED_PROMPTS.join('\n')}
          fullWidth
          hint={
            <>
              普通聊天页底部的快捷提问按钮支持自定义。每行一条，最多保留 <code>8</code> 条；留空会自动回退到默认建议。
            </>
          }
        />
      </div>

      <p className="settings-hint">
        该区域用于控制普通聊天页的新建会话欢迎文案与快捷提问建议。若相关配置留空，会自动回退到默认值。
      </p>
    </section>
  )
})

const SettingsFooter = memo(function SettingsFooter({
  saveError,
  saveSuccess,
  hasChanges,
  isSaving,
  isUsingRecommendedConfig,
  onReset,
  onApplyRecommended,
  onSave,
}: SettingsFooterProps) {
  return (
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
          onClick={onReset}
          disabled={!hasChanges || isSaving}
        >
          重置为已保存
        </button>
        <button
          type="button"
          className="ghost-btn"
          onClick={onApplyRecommended}
          disabled={isUsingRecommendedConfig || isSaving}
        >
          恢复推荐默认
        </button>
        <button
          type="button"
          className="btn-primary settings-save-btn"
          onClick={onSave}
          disabled={!hasChanges || isSaving}
        >
          {isSaving ? '保存中...' : '保存并生效'}
        </button>
      </div>
    </div>
  )
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

  const handleChatConfigChange = useCallback(
    (key: keyof ChatConfig, value: ChatConfig[keyof ChatConfig]) => {
      setDraftConfig((prev) => ({
        ...prev,
        chat: {
          ...prev.chat,
          [key]: key === 'contextMessageLimit' ? normalizeContextLimit(Number(value)) : value,
        } as ChatConfig,
      }))
    },
    [],
  )

  const handleEmbeddingConfigChange = useCallback(
    (key: keyof EmbeddingConfig, value: EmbeddingConfig[keyof EmbeddingConfig]) => {
      setDraftConfig((prev) => ({
        ...prev,
        embedding: {
          ...prev.embedding,
          [key]: value,
        } as EmbeddingConfig,
      }))
    },
    [],
  )

  const handleWelcomeMessageTemplateChange = useCallback((value: string) => {
    setDraftConfig((prev) => ({
      ...prev,
      ui: {
        ...prev.ui,
        welcomeMessageTemplate: value,
      },
    }))
  }, [])

  const handleSuggestedPromptsChange = useCallback((value: string) => {
    setSuggestedPromptsText(value)
  }, [])

  const handleChatCircuitBreakerChange = useCallback(
    (key: keyof CircuitBreakerConfig, value: CircuitBreakerConfig[keyof CircuitBreakerConfig]) => {
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
    },
    [],
  )

  const handleEmbeddingCircuitBreakerChange = useCallback(
    (key: keyof CircuitBreakerConfig, value: CircuitBreakerConfig[keyof CircuitBreakerConfig]) => {
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
    },
    [],
  )

  const handleSave = useCallback(() => {
    void onSave(effectiveDraftConfig)
  }, [effectiveDraftConfig, onSave])

  const handleReset = useCallback(() => {
    setDraftConfig(config)
    setChatCandidatesText(formatCandidateLines(config.chat.candidates))
    setEmbeddingCandidatesText(formatCandidateLines(config.embedding.candidates))
    setSuggestedPromptsText(formatPromptLines(config.ui?.suggestedPrompts))
  }, [config])

  const handleApplyRecommended = useCallback(() => {
    const nextConfig = createRecommendedConfig()
    setDraftConfig(nextConfig)
    setChatCandidatesText(formatCandidateLines(nextConfig.chat.candidates))
    setEmbeddingCandidatesText(formatCandidateLines(nextConfig.embedding.candidates))
    setSuggestedPromptsText(formatPromptLines(nextConfig.ui?.suggestedPrompts))
  }, [])

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
          <ChatSettingsSection
            chatConfig={draftConfig.chat}
            chatCandidatesText={chatCandidatesText}
            onChatConfigChange={handleChatConfigChange}
            onChatCircuitBreakerChange={handleChatCircuitBreakerChange}
            onChatCandidatesTextChange={setChatCandidatesText}
          />

          <EmbeddingSettingsSection
            embeddingConfig={draftConfig.embedding}
            embeddingCandidatesText={embeddingCandidatesText}
            onEmbeddingConfigChange={handleEmbeddingConfigChange}
            onEmbeddingCircuitBreakerChange={handleEmbeddingCircuitBreakerChange}
            onEmbeddingCandidatesTextChange={setEmbeddingCandidatesText}
          />

          <UISettingsSection
            welcomeMessageTemplate={draftConfig.ui?.welcomeMessageTemplate ?? ''}
            suggestedPromptsText={suggestedPromptsText}
            onWelcomeMessageTemplateChange={handleWelcomeMessageTemplateChange}
            onSuggestedPromptsChange={handleSuggestedPromptsChange}
          />

          <SettingsFooter
            saveError={saveError}
            saveSuccess={saveSuccess}
            hasChanges={hasChanges}
            isSaving={isSaving}
            isUsingRecommendedConfig={isUsingRecommendedConfig}
            onReset={handleReset}
            onApplyRecommended={handleApplyRecommended}
            onSave={handleSave}
          />
        </div>
      </div>
    </div>
  )
}

export default memo(SettingsPanel)

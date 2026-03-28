interface QuickPromptsProps {
  prompts: string[]
  onSelect: (prompt: string) => void
  disabled?: boolean
}

export function QuickPrompts({ prompts, onSelect, disabled }: QuickPromptsProps) {
  if (prompts.length === 0) {
    return null
  }

  return (
    <div className="service-desk-quick-prompts">
      <div className="section-caption">快捷提问</div>
      <div className="service-desk-quick-prompt-list">
        {prompts.map((prompt) => (
          <button key={prompt} type="button" disabled={disabled} onClick={() => onSelect(prompt)}>
            {prompt}
          </button>
        ))}
      </div>
    </div>
  )
}

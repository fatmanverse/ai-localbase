import { FormEvent, useState } from 'react'

interface MessageComposerProps {
  disabled?: boolean
  placeholder?: string
  helperText?: string
  onSend: (message: string) => Promise<void>
}

export function MessageComposer({ disabled, placeholder, helperText, onSend }: MessageComposerProps) {
  const [value, setValue] = useState('')

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const content = value.trim()
    if (!content || disabled) {
      return
    }

    setValue('')
    await onSend(content)
  }

  return (
    <form className="service-desk-composer" onSubmit={(event) => void handleSubmit(event)}>
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={disabled}
        placeholder={placeholder ?? '请描述你的问题、影响范围、错误现象或工单背景。'}
        rows={4}
      />
      <div className="service-desk-composer-footer">
        <div className="section-caption">
          {helperText ?? '支持附带工单号、用户编号、问题分类等业务上下文'}
        </div>
        <button type="submit" disabled={disabled || !value.trim()}>
          {disabled ? '处理中...' : '发送问题'}
        </button>
      </div>
    </form>
  )
}

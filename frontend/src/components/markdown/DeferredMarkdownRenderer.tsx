import { memo, useEffect, useState } from 'react'
import MarkdownRenderer from './MarkdownRenderer'

type IdleCapableWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  cancelIdleCallback?: (id: number) => void
}

interface DeferredMarkdownRendererProps {
  content: string
  fallbackClassName?: string
}

const HEAVY_MARKDOWN_CHAR_THRESHOLD = 1400
const HEAVY_MARKDOWN_LINE_THRESHOLD = 22
const HEAVY_MARKDOWN_PATTERN = /```|\|.*\||^#{1,4}\s|^\d+[.)、]\s|^-\s|^>\s|mermaid/mi

const shouldDeferMarkdownRender = (content: string) => {
  if (!content.trim()) {
    return false
  }

  if (content.length >= HEAVY_MARKDOWN_CHAR_THRESHOLD) {
    return true
  }

  if (content.split(/\r?\n/).length >= HEAVY_MARKDOWN_LINE_THRESHOLD) {
    return true
  }

  return HEAVY_MARKDOWN_PATTERN.test(content)
}

export default memo(function DeferredMarkdownRenderer({
  content,
  fallbackClassName = '',
}: DeferredMarkdownRendererProps) {
  const shouldDefer = shouldDeferMarkdownRender(content)
  const [isReady, setIsReady] = useState(!shouldDefer)

  useEffect(() => {
    if (!shouldDefer) {
      setIsReady(true)
      return undefined
    }

    setIsReady(false)

    let idleId: number | null = null
    let timeoutId: number | null = null
    let cancelled = false

    const markReady = () => {
      if (!cancelled) {
        setIsReady(true)
      }
    }

    const browserWindow = typeof window === 'undefined' ? null : (window as IdleCapableWindow)

    if (browserWindow?.requestIdleCallback) {
      idleId = browserWindow.requestIdleCallback(markReady, { timeout: 180 })
    } else if (browserWindow) {
      timeoutId = browserWindow.setTimeout(markReady, 32)
    } else {
      setIsReady(true)
    }

    return () => {
      cancelled = true
      if (idleId !== null && browserWindow?.cancelIdleCallback) {
        browserWindow.cancelIdleCallback(idleId)
      }
      if (timeoutId !== null && browserWindow) {
        browserWindow.clearTimeout(timeoutId)
      }
    }
  }, [content, shouldDefer])

  if (!isReady) {
    return <div className={fallbackClassName}>{content}</div>
  }

  return <MarkdownRenderer content={content} />
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function extractRule(css: string, selector: string) {
  const start = css.indexOf(selector)
  expect(start).toBeGreaterThanOrEqual(0)

  const end = css.indexOf('}', start)
  expect(end).toBeGreaterThan(start)

  return css.slice(start, end + 1)
}

describe('markdown layout styles', () => {
  it('assistant 消息正文不会再被字符宽度上限提前截断', () => {
    const css = readFileSync(new URL('../../App.css', import.meta.url), 'utf8')
    const selector = '.message.assistant .message-content-markdown .md-render-shell > :not(.md-table-shell):not(.md-table-wrap):not(.md-code-shell):not(.md-code-block):not(.md-mermaid):not(.md-mermaid-loading):not(.md-mermaid-fallback):not(.md-render-actions)'
    const rule = extractRule(css, selector)

    expect(rule).toContain('max-width: 100%;')
    expect(rule).not.toContain('92ch')
  })

  it('service desk 正文不会再被字符宽度上限提前截断', () => {
    const css = readFileSync(new URL('../../widget/serviceDeskWidget.css', import.meta.url), 'utf8')
    const selector = '.service-desk-markdown .md-render-shell > :not(.md-table-shell):not(.md-table-wrap):not(.md-code-shell):not(.md-code-block):not(.md-mermaid):not(.md-mermaid-loading):not(.md-mermaid-fallback):not(.md-render-actions)'
    const rule = extractRule(css, selector)

    expect(rule).toContain('max-width: 100%;')
    expect(rule).not.toContain('88ch')
  })
})

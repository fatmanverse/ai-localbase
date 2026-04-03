import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import MarkdownRenderer from './MarkdownRenderer'

describe('MarkdownRenderer', () => {
  it('将无语言标记的 fenced code 渲染为代码块容器', () => {
    const html = renderToStaticMarkup(
      <MarkdownRenderer
        content={[
          '权限示例：',
          '',
          '```',
          'SELECT ANY TABLE',
          '```',
        ].join('\n')}
      />,
    )

    expect(html).toContain('md-code-shell')
    expect(html).not.toContain('<pre><code class="md-inline-code"')
  })
})

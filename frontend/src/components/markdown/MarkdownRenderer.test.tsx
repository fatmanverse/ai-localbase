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

  it('不会把缩进后的单行代码误渲染为代码块', () => {
    const html = renderToStaticMarkup(
      <MarkdownRenderer
        content={[
          '应改用',
          '    `EXECUTE_CATALOG_ROLE`',
          '或逐个授权',
          '    `V_$*`',
          '视图',
        ].join('\n')}
      />,
    )

    expect(html).toContain('<code class="md-inline-code">EXECUTE_CATALOG_ROLE</code>')
    expect(html).toContain('<code class="md-inline-code">V_$*</code>')
    expect(html).not.toContain('md-code-shell')
    expect(html).not.toContain('<pre>')
  })

  it('不会把普通技术说明误改写成表格或列表', () => {
    const html = renderToStaticMarkup(
      <MarkdownRenderer
        content={[
          'Oracle 11g | 12c+ | 19c | 权限差异说明',
          '11g 跳过 `GRANT LOGMINING`，19c 支持该权限。',
        ].join('\n')}
      />,
    )

    expect(html).not.toContain('<table')
    expect(html).not.toContain('md-table-shell')
    expect(html).not.toContain('<ul>')
    expect(html).toContain('Oracle 11g | 12c+ | 19c | 权限差异说明')
  })
})

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

  it('不会把带空行的缩进权限名渲染成代码块', () => {
    const html = renderToStaticMarkup(
      <MarkdownRenderer
        content={[
          '最小必要权限原则',
          '',
          ': LogMiner 用户需授予',
          '',
          '    SELECT ANY TABLE',
          '',
          '或',
          '',
          '按表粒度授权具体采集表',
          '',
          ': 必须包含',
          '',
          '    V_$DATABASE',
          '',
          '、',
          '',
          '    V_$LOG',
          '',
          '、',
          '',
          '    V_$LOGMNR_CONTENTS',
        ].join('\n')}
      />,
    )

    expect(html).not.toContain('md-code-shell')
    expect(html).not.toContain('<pre>')
    expect(html).toContain('SELECT ANY TABLE')
    expect(html).toContain('V_$DATABASE、V_$LOG、V_$LOGMNR_CONTENTS')
  })


  it('有序列表继续使用步骤列表样式', () => {
    const html = renderToStaticMarkup(
      <MarkdownRenderer
        content={[
          '1. 第一步处理',
          '2. 第二步确认',
        ].join('\n')}
      />,
    )

    expect(html).toContain('class="md-step-list"')
    expect(html).toContain('class="md-step-item"')
  })


  it('普通无序列表不应用步骤列表样式', () => {
    const html = renderToStaticMarkup(
      <MarkdownRenderer
        content={[
          '## 核心观点',
          '',
          '### 权限配置以最小化和场景化为前提',
          '',
          '- **LogMiner 用户权限必须按 Oracle 版本区分**：Oracle 11g 明确要求跳过 `GRANT LOGMINING`，否则会报错；而 `DBMS_LOGMNR` 和 `DBMS_LOGMNR_D` 的 EXECUTE 权限是所有版本共性刚需',
          '- **SELECT 权限应优先按表授予**：手册明确建议“可以只授权需要采集的表”，而非直接授予 `SELECT ANY TABLE`；若无法授予 ANY TABLE，则必须补全具体表 + `SELECT ANY DICTIONARY` + `EXECUTE_CATALOG_ROLE`',
        ].join('\n')}
      />,
    )

    expect(html).toContain('<ul>')
    expect(html).not.toContain('md-code-shell')
    expect(html).not.toContain('class="md-step-item')
    expect(html).toContain('<code class="md-inline-code">GRANT LOGMINING</code>')
    expect(html).toContain('<code class="md-inline-code">SELECT ANY TABLE</code>')
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

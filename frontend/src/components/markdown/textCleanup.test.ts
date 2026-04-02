import { describe, expect, it } from 'vitest'
import { normalizeCJKPunctuationLineBreaks } from './textCleanup'

describe('normalizeCJKPunctuationLineBreaks', () => {
  it('合并普通正文块中的单独标点行', () => {
    expect(normalizeCJKPunctuationLineBreaks('权限配置\n、\n最小必要原则')).toBe(
      '权限配置、\n最小必要原则',
    )
  })

  it('保守合并同一正文块中的短续写', () => {
    expect(normalizeCJKPunctuationLineBreaks('这是第一行，\n继续补充说明')).toBe(
      '这是第一行，继续补充说明',
    )
  })

  it('不合并完整新句', () => {
    expect(
      normalizeCJKPunctuationLineBreaks('这是第一行，\n这里已经是一个完整的新句子，应该保持分行。'),
    ).toBe('这是第一行，\n这里已经是一个完整的新句子，应该保持分行。')
  })

  it('不跨标题与正文边界合并', () => {
    expect(normalizeCJKPunctuationLineBreaks('## 标题\n这是第一行，\n继续说明')).toBe(
      '## 标题\n这是第一行，继续说明',
    )
  })

  it('不跨列表项边界合并', () => {
    expect(normalizeCJKPunctuationLineBreaks('- 第一项，\n继续说明')).toBe('- 第一项，\n继续说明')
  })

  it('不处理代码块内部内容', () => {
    expect(normalizeCJKPunctuationLineBreaks('```\n第一行，\n第二行\n```')).toBe(
      '```\n第一行，\n第二行\n```',
    )
  })

  it('合并行首中文标点到上一行', () => {
    expect(normalizeCJKPunctuationLineBreaks('访问视图\n，避免遗漏权限')).toBe(
      '访问视图，避免遗漏权限',
    )
  })

  it('只在下一行较短且像续写时合并', () => {
    expect(normalizeCJKPunctuationLineBreaks('这是第一行：\n补充一句')).toBe('这是第一行：补充一句')
  })

  it('遇到明显起段词时不合并', () => {
    expect(normalizeCJKPunctuationLineBreaks('这是第一行，\n首先需要确认权限边界')).toBe(
      '这是第一行，\n首先需要确认权限边界',
    )
  })

  it('不跨空行合并', () => {
    expect(normalizeCJKPunctuationLineBreaks('这是第一行，\n\n继续说明')).toBe(
      '这是第一行，\n\n继续说明',
    )
  })
})

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

  it('不处理波浪线围栏代码块内部内容', () => {
    expect(normalizeCJKPunctuationLineBreaks('~~~\n第一行，\n第二行\n~~~')).toBe(
      '~~~\n第一行，\n第二行\n~~~',
    )
  })

  it('不处理不带首尾竖线的 markdown 表格', () => {
    expect(normalizeCJKPunctuationLineBreaks('列 1 | 列 2\n--- | ---\n值一，\n值二')).toBe(
      '列 1 | 列 2\n--- | ---\n值一，\n值二',
    )
  })

  it('合并行首中文标点到上一行', () => {
    expect(normalizeCJKPunctuationLineBreaks('访问视图\n，避免遗漏权限')).toBe(
      '访问视图，避免遗漏权限',
    )
  })

  it('合并独立 ascii 冒号到上一行', () => {
    expect(normalizeCJKPunctuationLineBreaks('核心动态视图权限不可缺\n:\n后续说明')).toBe(
      '核心动态视图权限不可缺:\n后续说明',
    )
  })

  it('合并带文本的 ascii 冒号前缀行到上一行', () => {
    expect(normalizeCJKPunctuationLineBreaks('最小化授权可行但需手动补全\n: 若无法授予')).toBe(
      '最小化授权可行但需手动补全: 若无法授予',
    )
  })

  it('将连接词并入相邻的单行代码', () => {
    expect(normalizeCJKPunctuationLineBreaks('`V_$LOGMNR_CONTENTS`\n和\n`V_$ARCHIVED_LOG`')).toBe(
      '`V_$LOGMNR_CONTENTS` 和 `V_$ARCHIVED_LOG`',
    )
  })

  it('将单行代码并入前后碎裂的权限说明', () => {
    expect(
      normalizeCJKPunctuationLineBreaks(
        '或显式授权全部 7 个\n`V_$*`\n视图（含\n`V_$LOGMNR_CONTENTS`\n、\n`V_$ARCHIVED_LOG`\n等）',
      ),
    ).toBe('或显式授权全部 7 个 `V_$*` 视图（含 `V_$LOGMNR_CONTENTS`、`V_$ARCHIVED_LOG` 等）')
  })

  it('将单行代码并入后续解释说明', () => {
    expect(normalizeCJKPunctuationLineBreaks('`ORA-01305`\n错误，且无法绕过')).toBe(
      '`ORA-01305` 错误，且无法绕过',
    )
  })

  it('去掉普通正文中单行代码的多余缩进', () => {
    expect(
      normalizeCJKPunctuationLineBreaks('应改用\n    `EXECUTE_CATALOG_ROLE`\n或逐个授权\n    `V_$*`\n视图'),
    ).toBe('应改用 `EXECUTE_CATALOG_ROLE` 或逐个授权 `V_$*` 视图')
  })

  it('收起带空行的缩进技术词，避免渲染成独立代码块', () => {
    expect(
      normalizeCJKPunctuationLineBreaks(
        '最小必要权限原则\n\n: LogMiner 用户需授予\n\n    SELECT ANY TABLE\n\n或\n\n按表粒度授权具体采集表\n\n: 必须包含\n\n    V_$DATABASE\n\n、\n\n    V_$LOG\n\n、\n\n    V_$LOGMNR_CONTENTS',
      ),
    ).toBe(
      '最小必要权限原则\n\n: LogMiner 用户需授予 SELECT ANY TABLE\n\n或\n\n按表粒度授权具体采集表\n\n: 必须包含 V_$DATABASE、V_$LOG、V_$LOGMNR_CONTENTS',
    )
  })

  it('恢复被独立反引号拆开的单行代码', () => {
    expect(normalizeCJKPunctuationLineBreaks('`\nV_$LOG\n`')).toBe('`V_$LOG`')
  })

  it('保守恢复截图中的权限清单碎裂格式', () => {
    expect(
      normalizeCJKPunctuationLineBreaks(
        '核心动态视图权限不可缺\n:\n`\nV_$LOG\n`\n`\nV_$LOGMNR_CONTENTS\n`\n`\nV_$ARCHIVED_LOG\n`\n等 7 个\n`\nV_$*\n`\n视图需显式授权',
      ),
    ).toBe(
      '核心动态视图权限不可缺:\n`V_$LOG`\n`V_$LOGMNR_CONTENTS`\n`V_$ARCHIVED_LOG`\n等 7 个\n`V_$*`\n视图需显式授权',
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

  it('不合并 url 结构行后的短文本', () => {
    expect(normalizeCJKPunctuationLineBreaks('https://example.com/docs\n详情')).toBe(
      'https://example.com/docs\n详情',
    )
  })

  it('不合并路径结构行后的短文本', () => {
    expect(normalizeCJKPunctuationLineBreaks('/var/log/app\n继续查看')).toBe('/var/log/app\n继续查看')
  })

  it('不合并对象名结构行后的短文本', () => {
    expect(normalizeCJKPunctuationLineBreaks('schema.table_name\n说明')).toBe(
      'schema.table_name\n说明',
    )
  })
})

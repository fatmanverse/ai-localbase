# 中文正文段落级断行清洗增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将中文断行清洗从“只合并单独标点行”增强为“只处理普通正文段落中的异常断行”，同时继续避开标题、列表、表格、引用和代码块等 Markdown 结构。

**Architecture:** 在 `frontend/src/components/markdown/textCleanup.ts` 中集中实现普通正文块识别和保守断行归并，保持 `ChatArea`、`MessageList`、`DeferredMarkdownRenderer`、`MarkdownRenderer` 继续共用同一入口。先补一个最小前端单测入口，用 TDD 锁定“应合并 / 不应合并”边界，再只做最小实现使测试通过，最后用前端构建与人工样例回归确认渲染链路稳定。

**Tech Stack:** React 18、TypeScript、Vite、ReactMarkdown、Vitest

---

### Task 1: 建立 `textCleanup` 的最小测试入口

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/components/markdown/textCleanup.test.ts`

- [ ] **Step 1: 写出失败测试，锁定当前缺失的“正文块短续写合并”行为**

```ts
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
})
```

- [ ] **Step 2: 给前端增加最小测试命令并安装依赖声明**

```json
{
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^2.1.9"
  }
}
```

- [ ] **Step 3: 运行测试，确认新行为在实现前失败**

Run:
```bash
npm --prefix frontend install
npm --prefix frontend run test -- frontend/src/components/markdown/textCleanup.test.ts
```

Expected: 至少 `保守合并同一正文块中的短续写` 失败，失败原因为当前实现不会合并该场景。

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/components/markdown/textCleanup.test.ts
git commit -m "test: add markdown text cleanup coverage"
```

### Task 2: 在 `textCleanup.ts` 中实现普通正文块识别

**Files:**
- Modify: `frontend/src/components/markdown/textCleanup.ts`
- Test: `frontend/src/components/markdown/textCleanup.test.ts`

- [ ] **Step 1: 先补结构边界失败测试，锁定“只处理普通正文块”**

```ts
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
```

- [ ] **Step 2: 运行测试，确认边界测试在实现前失败**

Run:
```bash
npm --prefix frontend run test -- frontend/src/components/markdown/textCleanup.test.ts
```

Expected: 新增边界测试中至少一项失败，暴露当前实现无法区分普通正文块与 Markdown 结构。

- [ ] **Step 3: 写出最小实现，先把行分类与正文块边界识别补齐**

```ts
const MARKDOWN_HEADING = /^#{1,6}\s/
const MARKDOWN_LIST = /^\s*(?:[-*+]\s|\d+[.)]\s)/
const MARKDOWN_QUOTE = /^>\s?/
const MARKDOWN_TABLE = /^\s*\|.*\|\s*$/
const MARKDOWN_TABLE_DIVIDER = /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/
const CODE_FENCE = /^```/

function isMarkdownBoundaryLine(line: string, insideCodeFence: boolean): boolean {
  const trimmed = line.trim()
  if (!trimmed) {
    return true
  }
  if (insideCodeFence || CODE_FENCE.test(trimmed)) {
    return true
  }
  return (
    MARKDOWN_HEADING.test(trimmed) ||
    MARKDOWN_LIST.test(trimmed) ||
    MARKDOWN_QUOTE.test(trimmed) ||
    MARKDOWN_TABLE.test(trimmed) ||
    MARKDOWN_TABLE_DIVIDER.test(trimmed)
  )
}
```

- [ ] **Step 4: 在主函数中按普通正文块遍历，而不是对所有行统一做归并**

```ts
export function normalizeCJKPunctuationLineBreaks(content: string): string {
  if (!content.includes('\n')) {
    return content
  }

  const lines = content.split('\n')
  const normalized: string[] = []
  let insideCodeFence = false

  for (const line of lines) {
    const trimmed = line.trim()

    if (CODE_FENCE.test(trimmed)) {
      insideCodeFence = !insideCodeFence
      normalized.push(line)
      continue
    }

    if (isMarkdownBoundaryLine(line, insideCodeFence)) {
      normalized.push(line)
      continue
    }

    // 这里只保留普通正文块进入后续清洗，结构行直接原样透传
    normalized.push(line)
  }

  return normalized.join('\n')
}
```

- [ ] **Step 5: 运行测试，确认结构边界测试转绿且旧行为不回退**

Run:
```bash
npm --prefix frontend run test -- frontend/src/components/markdown/textCleanup.test.ts
```

Expected: 标题、列表、代码块边界测试通过；若短续写测试仍失败，属于下一任务继续补实现的预期状态。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/markdown/textCleanup.ts frontend/src/components/markdown/textCleanup.test.ts
git commit -m "refactor: scope text cleanup to paragraph blocks"
```

### Task 3: 实现保守的“短续写”合并规则

**Files:**
- Modify: `frontend/src/components/markdown/textCleanup.ts`
- Test: `frontend/src/components/markdown/textCleanup.test.ts`

- [ ] **Step 1: 先补完整测试矩阵，覆盖应合并与不应合并两侧**

```ts
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
```

- [ ] **Step 2: 运行测试，确认新增测试先失败**

Run:
```bash
npm --prefix frontend run test -- frontend/src/components/markdown/textCleanup.test.ts
```

Expected: “合并行首中文标点到上一行” 或 “只在下一行较短且像续写时合并” 至少一项失败。

- [ ] **Step 3: 写出最小实现，补正文块内部的三类归并助手**

```ts
const DANGLING_CJK_PUNCTUATION_ONLY = /^[，。、；：！？）】》」』、]+$/
const LEADING_CJK_PUNCTUATION = /^[，。、；：！？）】》」』、]+/
const HARD_SENTENCE_END = /[。！？!?]$/
const SOFT_SENTENCE_END = /[，、；：]$/
const NEW_PARAGRAPH_PREFIX = /^(首先|其次|然后|另外|此外|总结|注意|需要说明|建议)/
const SHORT_CONTINUATION_MAX_LENGTH = 18

function shouldMergeShortContinuation(previousLine: string, currentLine: string): boolean {
  const prev = previousLine.trim()
  const curr = currentLine.trim()
  if (!prev || !curr) {
    return false
  }
  if (HARD_SENTENCE_END.test(prev)) {
    return false
  }
  if (NEW_PARAGRAPH_PREFIX.test(curr)) {
    return false
  }
  if (curr.length > SHORT_CONTINUATION_MAX_LENGTH) {
    return false
  }
  return SOFT_SENTENCE_END.test(prev) || curr.length <= 8
}
```

- [ ] **Step 4: 在普通正文块遍历中串起三段逻辑：单独标点、行首标点、短续写**

```ts
function normalizeParagraphLines(lines: string[]): string[] {
  const normalized: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    const previousIndex = normalized.length - 1
    const previous = previousIndex >= 0 ? normalized[previousIndex] : ''

    if (previous && DANGLING_CJK_PUNCTUATION_ONLY.test(trimmed)) {
      normalized[previousIndex] += trimmed
      continue
    }

    if (previous && LEADING_CJK_PUNCTUATION.test(trimmed)) {
      const leading = trimmed.match(LEADING_CJK_PUNCTUATION)?.[0] ?? ''
      normalized[previousIndex] += leading
      normalized.push(trimmed.slice(leading.length))
      continue
    }

    if (previous && shouldMergeShortContinuation(previous, trimmed)) {
      normalized[previousIndex] += trimmed
      continue
    }

    normalized.push(line)
  }

  return normalized
}
```

- [ ] **Step 5: 运行测试，确认 `textCleanup` 全部通过**

Run:
```bash
npm --prefix frontend run test -- frontend/src/components/markdown/textCleanup.test.ts
```

Expected: 所有 `normalizeCJKPunctuationLineBreaks` 用例通过。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/markdown/textCleanup.ts frontend/src/components/markdown/textCleanup.test.ts
git commit -m "feat: normalize abnormal chinese paragraph line breaks"
```

### Task 4: 验证渲染链路与构建结果

**Files:**
- Modify: `frontend/src/components/markdown/MarkdownRenderer.tsx`
- Modify: `frontend/src/components/markdown/DeferredMarkdownRenderer.tsx`
- Modify: `frontend/src/components/ChatArea.tsx`
- Modify: `frontend/src/widget/components/MessageList.tsx`

- [ ] **Step 1: 检查四个入口仍然共用 `normalizeCJKPunctuationLineBreaks`，只在不一致时做最小补齐**

```ts
// MarkdownRenderer.tsx
let fixed = normalizeCJKPunctuationLineBreaks(cleanupModelArtifacts(content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')))
const normalizedInput = normalizeCJKPunctuationLineBreaks(content.replace(/\r\n/g, '\n').replace(/\r/g, '\n'))

// DeferredMarkdownRenderer.tsx
const normalizedContent = normalizeCJKPunctuationLineBreaks(content)

// ChatArea.tsx
<div className="message-streaming-text">{normalizeCJKPunctuationLineBreaks(message.content)}</div>

// MessageList.tsx
{message.content.trim() ? normalizeCJKPunctuationLineBreaks(message.content) : '正在整理答复...'}
```

- [ ] **Step 2: 运行定向测试和前端构建**

Run:
```bash
npm --prefix frontend run test -- frontend/src/components/markdown/textCleanup.test.ts
npm --prefix frontend run build
```

Expected: 单测全绿，`vite build` 成功。

- [ ] **Step 3: 按 spec 做人工回归**

Run:
```text
样例 1：权限配置\n、\n最小必要原则
样例 2：这是第一行，\n补充一句
样例 3：这是第一行，\n这里已经是一个完整的新句子，应该保持分行。
样例 4：## 标题\n这是第一行，\n继续说明
样例 5：- 第一项，\n继续说明
样例 6：```\n第一行，\n第二行\n```
```

Expected:
- 样例 1 合并单独标点行
- 样例 2 合并短续写
- 样例 3 保持分行
- 样例 4 标题保留边界，仅正文块内可合并
- 样例 5 列表项保持原样
- 样例 6 代码块内部保持原样

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/components/markdown/textCleanup.ts frontend/src/components/markdown/textCleanup.test.ts frontend/src/components/markdown/MarkdownRenderer.tsx frontend/src/components/markdown/DeferredMarkdownRenderer.tsx frontend/src/components/ChatArea.tsx frontend/src/widget/components/MessageList.tsx
git commit -m "feat: enhance paragraph-level chinese line break cleanup"
```

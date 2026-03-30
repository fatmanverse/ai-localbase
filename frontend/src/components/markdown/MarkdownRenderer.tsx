import React, { memo, useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * 修复 LLM 输出的 Markdown 格式问题：
 * 1. `##标题` → `## 标题`（标题符号后缺空格）
 * 2. 标题前无空行时补空行，确保解析器正确识别
 * 3. 尝试拆分被压成单行的表格、列表与编号段落
 * 4. 将目录树/路径结构包裹成代码块，避免半渲染
 * 5. 针对 Ollama 常见的“中文段落 + checklist + 分隔线粘连”做额外修复
 */
function looksLikePseudoTableHeader(cell: string): boolean {
  const trimmed = cell.trim()
  if (!trimmed || trimmed.length > 18) {
    return false
  }

  return !/[，。；：:,.!?()（）\[\]]/.test(trimmed)
}

function renumberOrderedListBlocks(content: string): string {
  const lines = content.split('\n')
  let counter = 0

  return lines
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) {
        return line
      }

      if (/^(#{1,6}|[-*+]\s|>\s|```)/.test(trimmed)) {
        counter = 0
        return line
      }

      if (/^\d+[.)、]\s+/.test(trimmed)) {
        counter += 1
        return line.replace(/^(\s*)\d+[.)、]\s+/, `$1${counter}. `)
      }

      if (/^[A-Z]\./.test(trimmed) || /^第[一二三四五六七八九十]+/.test(trimmed)) {
        counter = 0
      }

      return line
    })
    .join('\n')
}

function normalizePseudoStructuredLine(line: string): string {
  const trimmed = line.trim()
  if (!trimmed) {
    return ''
  }

  if (/^[|:\-\s]+$/.test(trimmed)) {
    return ''
  }

  const pipeCount = (trimmed.match(/\|/g) ?? []).length
  if (pipeCount < 3) {
    return line
  }

  const cells = trimmed
    .split('|')
    .map((cell) => cell.trim())
    .filter(Boolean)
    .filter((cell) => !/^:?-{3,}:?$/.test(cell))

  if (cells.length < 2) {
    return line
  }

  if (cells.length >= 4 && cells.length % 2 === 0) {
    const half = cells.length / 2
    const headers = cells.slice(0, half)
    const values = cells.slice(half)

    if (headers.every((cell) => looksLikePseudoTableHeader(cell))) {
      return headers.map((header, index) => `- ${header}：${values[index]}`).join('\n')
    }
  }

  return cells.map((cell) => `- ${cell}`).join('\n')
}

function normalizeDeliverableSection(content: string): string {
  const lines = content.split('\n')
  const normalized: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()

    if (!line) {
      normalized.push(lines[index])
      continue
    }

    const cells = line
      .split('|')
      .map((cell) => cell.trim())
      .filter(Boolean)

    const isDeliverableHeader =
      cells.length === 3 &&
      ((cells[0] === '模块' && cells[1] === '交付物' && cells[2] === '基础功能') ||
        (cells[0] === '阶段' && cells[1] === '任务' && cells[2] === '优先级'))

    if (!isDeliverableHeader) {
      normalized.push(lines[index])
      continue
    }

    const labels = cells
    let cursor = index + 1

    while (cursor + 2 < lines.length) {
      const row = [lines[cursor].trim(), lines[cursor + 1].trim(), lines[cursor + 2].trim()]

      if (row.some((value) => !value)) {
        break
      }

      if (row.some((value) => value.includes('|'))) {
        break
      }

      if (/^(##|###|第\d+步|根据|总结|核心|技术栈|系统架构|关键约束|如果需)/.test(row[0])) {
        break
      }

      normalized.push(`- ${labels[0]}：${row[0]}`)
      normalized.push(`  - ${labels[1]}：${row[1]}`)
      normalized.push(`  - ${labels[2]}：${row[2]}`)
      cursor += 3
      index += 3
    }
  }

  return normalized.join('\n')
}

function normalizePainSolutionSection(content: string): string {
  const lines = content.split('\n')
  const normalized: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index].trim()
    const next = lines[index + 1]?.trim() ?? ''

    const currentCells = current
      .split('|')
      .map((cell) => cell.trim())
      .filter(Boolean)

    const isPainSolutionHeader =
      currentCells.length >= 3 &&
      currentCells[0] === '问题' &&
      currentCells[1] === '解决方案'

    if (!isPainSolutionHeader) {
      normalized.push(lines[index])
      continue
    }

    normalized.push('- 问题：' + currentCells[2])
    if (next) {
      normalized.push('- 解决方案：' + next)
      index += 1
    }

    let cursor = index + 1
    while (cursor + 1 < lines.length) {
      const problem = lines[cursor].trim()
      const solution = lines[cursor + 1].trim()

      if (!problem || !solution) {
        break
      }

      if (problem.includes('|') || solution.includes('|')) {
        break
      }

      if (/^(根据|核心|技术栈|系统架构|关键约束|如果需|总结)/.test(problem)) {
        break
      }

      normalized.push('- 问题：' + problem)
      normalized.push('- 解决方案：' + solution)
      cursor += 2
      index += 2
    }
  }

  return normalized.join('\n')
}

function normalizeStepSections(content: string): string {
  let normalized = content

  normalized = normalized.replace(/(^|\n)(实施路线图（简化版）|实施路径|实施步骤|步骤规划)\s*[:：]?\s*/g, '$1## $2\n\n')
  normalized = normalized.replace(/(^|\n)(阶段|任务|优先级)\s*(?=\n|$)/g, '$1')
  normalized = normalized.replace(/(^|\n)(第\d+步)\s*[:：]?\s*/g, '$1### $2\n\n')
  normalized = normalized.replace(/(^|\n)(MVP 核心功能验证|模块架构深化|接口与前端交互设计|UI 与交互优化|测试与迭代优化)\s*[:：]?\s*/g, '$1- $2：')
  normalized = normalized.replace(/(^|\n)([^\n：]{2,20})\s*[：:]\s*(☆☆☆|★★★|高|中|低)\s*(?=\n|$)/g, '$1- $2：$3')
  normalized = normalized.replace(/(^|\n)([^\n：]{2,20})\s*(☆☆☆|★★★)\s*(?=\n|$)/g, '$1- $2：$3')

  return normalized
}

function sanitizeMermaidLine(line: string): string {
  let sanitized = line.trim()
  sanitized = sanitized.replace(/^```+/, '')
  sanitized = sanitized.replace(/^mermaid/, '')
  sanitized = sanitized.replace(/```$/, '')
  sanitized = sanitized.replace(/<\/?span[^>]*>/g, '')
  sanitized = sanitized.replace(/<[^>]+>/g, '')
  sanitized = sanitized.replace(/\*\*/g, '')
  sanitized = sanitized.replace(/%%.*/g, '')
  sanitized = sanitized.replace(/classDef([A-Za-z0-9_]+)fill:/g, 'classDef $1 fill:')
  sanitized = sanitized.replace(/style([A-Za-z0-9_]+)fill:/g, 'style $1 fill:')
  sanitized = sanitized.replace(/style\s+([A-Za-z0-9_]+)fill:/g, 'style $1 fill:')
  sanitized = sanitized.replace(/class\s+Def/g, 'classDef ')
  sanitized = sanitized.replace(/class\s+([A-Za-z0-9_]+)fill:/g, 'classDef $1 fill:')
  sanitized = sanitized.replace(/flowchartTD/g, 'flowchart TD')
  sanitized = sanitized.replace(/flowchartLR/g, 'flowchart LR')
  sanitized = sanitized.replace(/graphTD/g, 'graph TD')
  sanitized = sanitized.replace(/graphLR/g, 'graph LR')
  sanitized = sanitized.replace(/mermaidflowchart\s*TD/g, 'flowchart TD')
  sanitized = sanitized.replace(/mermaidflowchart\s*LR/g, 'flowchart LR')
  sanitized = sanitized.replace(/mermaidgraph\s*TD/g, 'graph TD')
  sanitized = sanitized.replace(/mermaidgraph\s*LR/g, 'graph LR')
  sanitized = sanitized.replace(/;+\s*$/, '')
  return sanitized.trim()
}

function rebuildCompressedMermaid(lines: string[]): string[] {
  const source = lines.join(' ')
  if (!source) {
    return []
  }

  let rebuilt = source
    .replace(/^```mermaid\s*/i, '')
    .replace(/```$/i, '')
    .replace(/mermaidflowchart\s*TD/gi, 'flowchart TD\n')
    .replace(/mermaidgraph\s*TD/gi, 'graph TD\n')
    .replace(/mermaidflowchart\s*LR/gi, 'flowchart LR\n')
    .replace(/mermaidgraph\s*LR/gi, 'graph LR\n')
    .replace(/(flowchart\s+(?:TD|LR)|graph\s+(?:TD|LR)|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|mindmap|timeline)/g, '\n$1\n')
    .replace(/%%\s*/g, '\n%% ')
    .replace(/end\s*subgraph/gi, 'end\nsubgraph ')
    .replace(/endsubgraph/gi, 'end\nsubgraph ')
    .replace(/(subgraph\s+[A-Za-z0-9_\-]+\[[^\]]+\])/g, '\n$1\n')
    .replace(/(subgraph\s+[A-Za-z0-9_\-]+)/g, '\n$1\n')
    .replace(/(classDef\s+[A-Za-z0-9_]+\s+fill:[^;]+;)/g, '\n$1\n')
    .replace(/(style\s+[A-Za-z0-9_]+\s+fill:[^;]+;)/g, '\n$1\n')
    .replace(/(classDef[A-Za-z0-9_]+fill:[^;]+;)/g, '\n$1\n')
    .replace(/(style[A-Za-z0-9_]+fill:[^;]+;)/g, '\n$1\n')
    .replace(/([A-Za-z0-9_]+\[[^\]]+\])(?=[A-Za-z0-9_]+\[[^\]]+\])/g, '$1\n')
    .replace(/([A-Za-z0-9_]+\([^\)]*\))(?=[A-Za-z0-9_]+\([^\)]*\))/g, '$1\n')
    .replace(/([A-Za-z0-9_]+\{[^\}]*\})(?=[A-Za-z0-9_]+\{[^\}]*\})/g, '$1\n')
    .replace(/([A-Za-z0-9_\]\)\}])\s*(-->|==>|-.->)\s*([A-Za-z0-9_\[\(\{])/g, '$1 $2 $3')
    .replace(/([\]\)\}])\s*(?=[A-Za-z0-9_]+(?:\[|\(|\{|-->|==>|-.->))/g, '\n')
    .replace(/(;)(?=\s*(?:classDef|style|subgraph|end|[A-Za-z0-9_]+\[|[A-Za-z0-9_]+\{|[A-Za-z0-9_]+\(|[A-Za-z0-9_]+-->))/g, '$1\n')
    .replace(/((?:-->|==>|-.->)\s*[A-Za-z0-9_]+(?:\[[^\]]*\]|\([^\)]*\)|\{[^\}]*\}))(?!\s*(?:classDef|style|subgraph|end|%%|$))/g, '$1\n')
    .replace(/([A-Za-z0-9_]+(?:-->|==>|-.->)[A-Za-z0-9_]+)(?=[A-Za-z0-9_]+(?:-->|==>|-.->))/g, '$1\n')
    .replace(/(end)(?=\s*(?:[A-Za-z0-9_]+\[|[A-Za-z0-9_]+\{|[A-Za-z0-9_]+\(|subgraph|classDef|style|%%))/g, '$1\n')
    .replace(/(\w+)(-->|==>|-.->)(\w+)/g, '$1 $2 $3')
    .replace(/\]\s*(?=[A-Z][A-Za-z0-9_]*(?:-->|\[|\{|\())/g, ']\n')
    .replace(/\}\s*(?=[A-Z][A-Za-z0-9_]*(?:-->|\[|\{|\())/g, '}\n')
    .replace(/\)\s*(?=[A-Z][A-Za-z0-9_]*(?:-->|\[|\{|\())/g, ')\n')
    .replace(/\s{2,}/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()

  return rebuilt
    .split('\n')
    .map((line) => sanitizeMermaidLine(line))
    .filter(Boolean)
}

function isValidMermaidLine(line: string): boolean {
  if (!line) {
    return false
  }

  return /^(flowchart\s+(TD|LR)|graph\s+(TD|LR)|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|mindmap|timeline|subgraph|end|style\s|classDef\s|class\s|linkStyle\s|[A-Za-z0-9_\-\u4e00-\u9fa5]+\s*(\(|\{|\[)|[A-Za-z0-9_\-\u4e00-\u9fa5]+\s*(-{1,2}|={1,2}|\.-)>|[A-Za-z0-9_\-\u4e00-\u9fa5]+\s+-->|%%)/.test(
    line,
  )
}

function normalizeMermaidSection(content: string): string {
  if (!/```mermaid/i.test(content)) {
    return content
  }

  const lines = content.split('\n')
  const normalized: string[] = []
  let mermaidBuffer: string[] = []
  let collecting = false

  const flushMermaidBuffer = () => {
    const rawLines = mermaidBuffer.map((line) => line.trim()).filter(Boolean)
    const rebuiltLines = rebuildCompressedMermaid(rawLines)
    const sanitizedLines = rebuiltLines.filter((line) => isValidMermaidLine(line))
    const outputLines = sanitizedLines.length > 0 ? sanitizedLines : rebuiltLines.length > 0 ? rebuiltLines : rawLines

    normalized.push('```mermaid')
    normalized.push(...outputLines)
    normalized.push('```')
    mermaidBuffer = []
  }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim()

    if (trimmed.startsWith('```mermaid')) {
      collecting = true
      const inlineContent = sanitizeMermaidLine(trimmed)
      if (inlineContent) {
        mermaidBuffer.push(inlineContent)
      }
      continue
    }

    if (trimmed === '```' && collecting) {
      flushMermaidBuffer()
      collecting = false
      continue
    }

    if (collecting) {
      const cleaned = sanitizeMermaidLine(trimmed)
      if (cleaned) {
        mermaidBuffer.push(cleaned)
      }
      continue
    }

    normalized.push(rawLine)
  }

  if (collecting) {
    flushMermaidBuffer()
  }

  return normalized.join('\n')
}

function normalizeSummarySections(content: string): string {
  let normalized = content

  normalized = normalized.replace(
    /(^|\n)(当前知识库的核心观点总结如下|最关键的结论总结如下|核心观点总结如下|核心结论如下)\s*[:：]?\s*/g,
    '$1## 核心结论\n\n',
  )
  normalized = normalized.replace(/(^|\n)(核心结论|关键结论)\s*(\d+[.)、])/g, '$1## $2\n\n$3')
  normalized = normalized.replace(
    /(^|\n)(总结|结论总结|关键决策点|下一步行动|下一步建议)\s*[:：]?\s*/g,
    '$1## $2\n\n',
  )

  normalized = normalized.replace(/([。；])\s*(\d+[.)、]\s+)/g, '$1\n\n$2')
  normalized = normalized.replace(/([^\n])(\d+[.)、]\s+)/g, '$1\n$2')
  normalized = normalized.replace(/(\d+[.)、][^\n。！？]*?)(?=\s+\d+[.)、]\s+)/g, '$1\n')
  normalized = normalized.replace(/([。；])\s*(##\s)/g, '$1\n\n$2')
  normalized = normalized.replace(/([^\n])(是否将|建议采用|建议优先|需要确认|优先实现)/g, '$1\n\n$2')
  normalized = normalized.replace(/([^\n])(产品定位|解决的核心问题|实施路径|技术选型建议|后续演进方向|用户价值主张|目标用户群体|技术架构分层)\s*-/g, '$1\n$2 -')

  return normalized
}

const MARKDOWN_NORMALIZATION_CACHE_LIMIT = 200
const markdownNormalizationCache = new Map<string, string>()

interface MarkdownSegment {
  type: 'text' | 'code'
  value: string
}

function rememberNormalizedMarkdown(content: string, normalized: string): string {
  if (markdownNormalizationCache.has(content)) {
    markdownNormalizationCache.delete(content)
  }
  markdownNormalizationCache.set(content, normalized)

  if (markdownNormalizationCache.size > MARKDOWN_NORMALIZATION_CACHE_LIMIT) {
    const oldestKey = markdownNormalizationCache.keys().next().value
    if (oldestKey) {
      markdownNormalizationCache.delete(oldestKey)
    }
  }

  return normalized
}

function shouldNormalizeMarkdownContent(content: string): boolean {
  const trimmed = content.trim()
  if (!trimmed) {
    return false
  }

  return /```mermaid/i.test(trimmed) ||
    /<br\s*\/?>/i.test(trimmed) ||
    /<\|im_start\|>|<\|im_end\|>|<\|endoftext\|>|\|endoftext\|>/.test(trimmed) ||
    /<\/?(think|assistant|user|system)>/i.test(trimmed) ||
    /(^|\n)#{1,6}[^\s#]/m.test(trimmed) ||
    /(^|\n)\d+[.)、]\S/m.test(trimmed) ||
    /(^|\n)[^\n]*\|[^\n]*\|/m.test(trimmed) ||
    /[├└│]/.test(trimmed) ||
    /[✅☑️✔🟩🟦🔹🔸•📌✨📍🛠️📦🚀🎯💡🔥⭐👉🔧📝📣⚠️❗❓]/.test(trimmed) ||
    /(实施路线图（简化版）|实施路径|实施步骤|步骤规划|第\d+步|MVP 核心功能验证|模块架构深化|接口与前端交互设计|UI 与交互优化|测试与迭代优化)/.test(trimmed) ||
    /(当前知识库的核心观点总结如下|最关键的结论总结如下|核心观点总结如下|核心结论如下|结论总结|关键决策点|下一步行动|下一步建议)/.test(trimmed) ||
    /(模块\s*\|\s*交付物\s*\|\s*基础功能|阶段\s*\|\s*任务\s*\|\s*优先级|问题\s*\|\s*解决方案)/.test(trimmed)
}

function splitMarkdownByCodeFences(content: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = []
  const fencePattern = /```[\s\S]*?```/g
  let lastIndex = 0

  for (const match of content.matchAll(fencePattern)) {
    const block = match[0]
    const start = match.index ?? 0

    if (start > lastIndex) {
      segments.push({
        type: 'text',
        value: content.slice(lastIndex, start),
      })
    }

    segments.push({
      type: 'code',
      value: block,
    })

    lastIndex = start + block.length
  }

  if (lastIndex < content.length) {
    segments.push({
      type: 'text',
      value: content.slice(lastIndex),
    })
  }

  return segments
}

function cleanupModelArtifacts(content: string): string {
  let fixed = content
  fixed = fixed.replace(/<br\s*\/?>/gi, '\n')
  fixed = fixed.replace(/<\|im_start\|>.*?(?=\n|$)/g, '')
  fixed = fixed.replace(/<\|im_end\|>/g, '')
  fixed = fixed.replace(/<\|endoftext\|>/g, '')
  fixed = fixed.replace(/\|endoftext\|>/g, '')
  fixed = fixed.replace(/<think>[\s\S]*?<\/think>/g, '')
  fixed = fixed.replace(/<\/?think>/g, '')
  fixed = fixed.replace(/<\/?assistant>/g, '')
  fixed = fixed.replace(/<\/?user>/g, '')
  fixed = fixed.replace(/<\/?system>/g, '')
  return fixed
}

function normalizeTextSegment(content: string): string {
  let fixed = cleanupModelArtifacts(content.replace(/\r\n/g, '\n').replace(/\r/g, '\n'))

  if (!fixed.trim()) {
    return ''
  }

  if (/(实施路线图（简化版）|实施路径|实施步骤|步骤规划|第\d+步|MVP 核心功能验证|模块架构深化|接口与前端交互设计|UI 与交互优化|测试与迭代优化)/.test(fixed)) {
    fixed = normalizeStepSections(fixed)
  }

  if (/(当前知识库的核心观点总结如下|最关键的结论总结如下|核心观点总结如下|核心结论如下|结论总结|关键决策点|下一步行动|下一步建议)/.test(fixed)) {
    fixed = normalizeSummarySections(fixed)
  }

  if (/问题\s*\|\s*解决方案/.test(fixed)) {
    fixed = normalizePainSolutionSection(fixed)
  }

  if (/(模块\s*\|\s*交付物\s*\|\s*基础功能|阶段\s*\|\s*任务\s*\|\s*优先级)/.test(fixed)) {
    fixed = normalizeDeliverableSection(fixed)
  }

  fixed = fixed.replace(/([^\n])(#{1,6})(?=[^\s#])/g, '$1\n\n$2')
  fixed = fixed.replace(/^(#{1,6})([^\s#])/gm, '$1 $2')

  if (/\|/.test(fixed)) {
    fixed = fixed.replace(/\|\s*[-:]+[-| :]*\|/g, (match) => `\n${match}\n`)
    fixed = fixed.replace(/([^\n])(\|[^\n]+\|)/g, '$1\n$2')
    fixed = fixed.replace(/(\|[^\n]+\|)([^\n])/g, '$1\n$2')
  }

  if (/[├└│]/.test(fixed)) {
    fixed = fixed.replace(
      /(^|\n)((?:[^\n]*[├└│].*(?:\n|$))+)/g,
      (_, prefix, treeBlock: string) => `${prefix}\n\n${treeBlock.trimEnd()}\n`,
    )
  }

  if (/\d+[.)、]/.test(fixed) || /第[一二三四五六七八九十]+阶段[:：]/.test(fixed)) {
    fixed = fixed.replace(/([^\n])\s+(\d+[.)、]\s*)/g, '$1\n$2')
    fixed = fixed.replace(/([^\n])\s+(第[一二三四五六七八九十]+阶段[:：])/g, '$1\n\n$2')
    fixed = fixed.replace(/-\s*(\d+[.)、])/g, '$1')
  }

  if (/\s+[-*+]\s+/.test(fixed) || /\n-\s+(?=[^\n：:]+[：:])/.test(fixed)) {
    fixed = fixed.replace(/([^\n])\s+([-*+])\s+/g, '$1\n$2 ')
    fixed = fixed.replace(/([^\n])\s+-\s+(?=[^\n：:]+[：:])/g, '$1\n- ')
  }

  if (/[✅☑️✔🟩🟦🔹🔸•📌✨📍🛠️📦🚀🎯💡🔥⭐👉🔧📝📣⚠️❗❓]/.test(fixed)) {
    fixed = fixed.replace(/[✅☑️✔🟩🟦🔹🔸•📌✨📍🛠️📦🚀🎯💡🔥⭐👉🔧📝📣⚠️❗❓]/g, '')
  }

  fixed = fixed.replace(/([^\n])\s+(总结|结论|建议|风险|下一步|关键任务|阶段功能目标|理由|备注|关键依赖)[:：]/g, '$1\n\n$2：')
  fixed = fixed.replace(/\s+(---|———+|───+)\s+/g, '\n\n---\n\n')
  fixed = fixed.replace(/([^\n])\s*(---)\s*([\u4e00-\u9fa5A-Za-z0-9])/g, '$1\n\n$2\n\n$3')

  fixed = fixed.replace(/([a-z])([A-Z])/g, '$1 $2')
  fixed = fixed.replace(/([a-zA-Z])([\u4e00-\u9fa5])/g, '$1 $2')
  fixed = fixed.replace(/([\u4e00-\u9fa5])([A-Za-z][a-z])/g, '$1 $2')
  fixed = fixed.replace(/([.!?])([A-Za-z\u4e00-\u9fa5])/g, '$1 $2')

  fixed = fixed.replace(/^[ \t]*:[-]{3,}[ \t]*$/gm, '---')
  fixed = fixed.replace(/^[ \t]*\|?[ :-]{3,}\|?[ \t]*$/gm, '---')

  if (/\|/.test(fixed)) {
    fixed = fixed
      .split('\n')
      .map((line) => normalizePseudoStructuredLine(line))
      .filter(Boolean)
      .join('\n')
  }

  fixed = renumberOrderedListBlocks(fixed)
  fixed = fixed.replace(/([：:])\s*[-*]\s+/g, '$1 ')
  fixed = fixed.replace(/\n{3,}/g, '\n\n')
  fixed = fixed.replace(/[ \t]+\n/g, '\n')

  return fixed.trim()
}

function normalizeCodeFenceSegment(content: string): string {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!normalized) {
    return ''
  }

  if (/^```mermaid/i.test(normalized)) {
    return normalizeMermaidSection(normalized)
  }

  return normalized
}

function fixMarkdown(content: string): string {
  const cached = markdownNormalizationCache.get(content)
  if (cached !== undefined) {
    return cached
  }

  const normalizedInput = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!shouldNormalizeMarkdownContent(normalizedInput)) {
    return rememberNormalizedMarkdown(content, normalizedInput.trim())
  }

  const segments = splitMarkdownByCodeFences(normalizedInput)
  const normalized = (segments.length > 0 ? segments : [{ type: 'text', value: normalizedInput }])
    .map((segment) => (segment.type === 'code' ? normalizeCodeFenceSegment(segment.value) : normalizeTextSegment(segment.value)))
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return rememberNormalizedMarkdown(content, normalized)
}

let mermaidModulePromise: Promise<typeof import('mermaid')> | null = null
let mermaidInitialized = false

const loadMermaid = async () => {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import('mermaid')
  }

  const module = await mermaidModulePromise
  return module.default
}

interface MermaidDiagramProps {
  chart: string
}

const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ chart }) => {
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setSvg('')
    setError('')
    setIsLoading(true)

    const renderChart = async () => {
      try {
        const mermaid = await loadMermaid()
        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'loose',
            theme: 'default',
          })
          mermaidInitialized = true
        }
        const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`
        const { svg: renderedSvg } = await mermaid.render(id, chart)

        const hasSvgContent = Boolean(renderedSvg && renderedSvg.includes('<svg'))
        const hasSyntaxError = /Syntax error in text|Parse error|Lexical error/i.test(renderedSvg)
        if (!hasSvgContent || hasSyntaxError) {
          throw new Error('invalid mermaid svg')
        }

        if (!cancelled) {
          setSvg(renderedSvg)
          setError('')
          setIsLoading(false)
        }
      } catch {
        if (!cancelled) {
          setSvg('')
          setError('流程图渲染失败，已降级显示源码')
          setIsLoading(false)
        }
      }
    }

    void renderChart()

    const timeout = window.setTimeout(() => {
      if (!cancelled) {
        setSvg('')
        setError('流程图渲染超时，已降级显示源码')
        setIsLoading(false)
      }
    }, 2500)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [chart])

  if (error) {
    return (
      <div className="md-mermaid-fallback">
        <div className="md-mermaid-error">{error}</div>
        <pre className="md-code-block">
          <code>{chart}</code>
        </pre>
      </div>
    )
  }

  if (isLoading) {
    return <div className="md-mermaid-loading">流程图渲染中...</div>
  }

  if (!svg) {
    return (
      <div className="md-mermaid-fallback">
        <div className="md-mermaid-error">流程图无有效输出，已降级显示源码</div>
        <pre className="md-code-block">
          <code>{chart}</code>
        </pre>
      </div>
    )
  }

  return <div className="md-mermaid" dangerouslySetInnerHTML={{ __html: svg }} />
}

const markdownComponents = {
  code({ className, children, ...props }: any) {
    const isInline = !className
    const codeContent = String(children).replace(/\n$/, '')

    if (!isInline && className?.includes('language-mermaid')) {
      return <MermaidDiagram chart={codeContent} />
    }

    return isInline ? (
      <code className="md-inline-code" {...props}>
        {children}
      </code>
    ) : (
      <pre className="md-code-block">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    )
  },
  a({ href, children, ...props }: any) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="md-link" {...props}>
        {children}
      </a>
    )
  },
  table({ children, ...props }: any) {
    return (
      <div className="md-table-wrap">
        <table {...props}>{children}</table>
      </div>
    )
  },
}

const MarkdownRenderer = memo(function MarkdownRenderer({ content }: { content: string }) {
  const normalizedContent = useMemo(() => fixMarkdown(content), [content])

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {normalizedContent}
    </ReactMarkdown>
  )
})

export default MarkdownRenderer

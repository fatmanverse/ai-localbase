const DANGLING_CJK_PUNCTUATION_ONLY = /^[，。、；：！？）】》」』、]+$/
const LEADING_CJK_PUNCTUATION = /^[，。、；：！？）】》」』、]+/
const HARD_SENTENCE_END = /[。！？!?]$/
const SOFT_SENTENCE_END = /[，、；：]$/
const NEW_PARAGRAPH_PREFIX = /^(首先|其次|然后|另外|此外|总结|注意|需要说明|建议)/
const SHORT_CONTINUATION_MAX_LENGTH = 18

const MARKDOWN_HEADING = /^#{1,6}\s/
const MARKDOWN_LIST = /^\s*(?:[-*+]\s|\d+[.)、]\s)/
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

function normalizeParagraphLines(lines: string[]): string[] {
  const normalized: string[] = []
  let mergedDanglingPunctuation = false

  for (const line of lines) {
    const trimmed = line.trim()
    const previousIndex = normalized.length - 1

    if (
      previousIndex >= 0 &&
      trimmed &&
      DANGLING_CJK_PUNCTUATION_ONLY.test(trimmed) &&
      normalized[previousIndex].trim() &&
      !/^[-*+]\s?$/.test(normalized[previousIndex].trim())
    ) {
      normalized[previousIndex] += trimmed
      mergedDanglingPunctuation = true
      continue
    }

    if (previousIndex >= 0 && trimmed && LEADING_CJK_PUNCTUATION.test(trimmed) && normalized[previousIndex].trim()) {
      normalized[previousIndex] += trimmed
      mergedDanglingPunctuation = false
      continue
    }

    if (!mergedDanglingPunctuation && previousIndex >= 0 && shouldMergeShortContinuation(normalized[previousIndex], trimmed)) {
      normalized[previousIndex] += trimmed
      continue
    }

    normalized.push(line)
    mergedDanglingPunctuation = false
  }

  return normalized
}

export function normalizeCJKPunctuationLineBreaks(content: string): string {
  if (!content.includes('\n')) {
    return content
  }

  const lines = content.split('\n')
  const normalized: string[] = []
  let paragraphLines: string[] = []
  let insideCodeFence = false

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return
    }

    normalized.push(...normalizeParagraphLines(paragraphLines))
    paragraphLines = []
  }

  for (const line of lines) {
    const trimmed = line.trim()

    if (CODE_FENCE.test(trimmed)) {
      flushParagraph()
      insideCodeFence = !insideCodeFence
      normalized.push(line)
      continue
    }

    if (isMarkdownBoundaryLine(line, insideCodeFence)) {
      flushParagraph()
      normalized.push(line)
      continue
    }

    paragraphLines.push(line)
  }

  flushParagraph()

  return normalized.join('\n')
}

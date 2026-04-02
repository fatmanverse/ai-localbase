const DANGLING_CJK_PUNCTUATION_ONLY = /^[，。、；：！？）】》」』、]+$/
const LEADING_CJK_PUNCTUATION = /^[，。、；：！？）】》」』、]+/
const HARD_SENTENCE_END = /[。！？!?]$/
const SOFT_SENTENCE_END = /[，、；：]$/
const NEW_PARAGRAPH_PREFIX = /^(首先|其次|然后|另外|此外|总结|注意|需要说明|建议)/
const SHORT_CONTINUATION_MAX_LENGTH = 18

const MARKDOWN_HEADING = /^#{1,6}\s/
const MARKDOWN_LIST = /^\s*(?:[-*+]\s|\d+[.)、]\s)/
const MARKDOWN_QUOTE = /^>\s?/
const MARKDOWN_TABLE = /^\s*\|.*\|\s*$|^\s*[^|\n]+\|[^|\n]+(?:\|[^|\n]+)*\s*$/
const MARKDOWN_TABLE_DIVIDER = /^\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$|^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/
const CODE_FENCE = /^(`{3,}|~{3,})/
const URL_LIKE = /^(?:https?:\/\/|ftp:\/\/|file:\/\/)/i
const PATH_LIKE = /^(?:\/|\.\.?\/|~\/)/
const OBJECT_LIKE = /^[A-Za-z0-9_-]+(?:[./:][A-Za-z0-9_-]+)+$/

function getCodeFenceMarker(line: string): string | null {
  return line.trim().match(CODE_FENCE)?.[1] ?? null
}

function isFenceClose(line: string, activeFence: string | null): boolean {
  if (!activeFence) {
    return false
  }

  const markerChar = activeFence[0]
  const minLength = activeFence.length
  const trimmed = line.trim()
  const matched = trimmed.match(new RegExp(`^${markerChar}{${minLength},}`))

  return matched !== null
}

function isTableHeaderLine(line: string, nextLine: string | undefined): boolean {
  const trimmed = line.trim()
  const nextTrimmed = nextLine?.trim() ?? ''

  return Boolean(trimmed) && MARKDOWN_TABLE.test(trimmed) && MARKDOWN_TABLE_DIVIDER.test(nextTrimmed)
}

function isMarkdownTableLine(line: string): boolean {
  const trimmed = line.trim()
  return MARKDOWN_TABLE.test(trimmed) || MARKDOWN_TABLE_DIVIDER.test(trimmed)
}

function looksStructuredTextLine(line: string): boolean {
  const trimmed = line.trim()

  if (!trimmed) {
    return false
  }

  if (URL_LIKE.test(trimmed) || PATH_LIKE.test(trimmed) || OBJECT_LIKE.test(trimmed)) {
    return true
  }

  return /[_/]/.test(trimmed) && !/[\u4e00-\u9fff]/.test(trimmed)
}

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
    isMarkdownTableLine(trimmed)
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

  if (looksStructuredTextLine(prev) || looksStructuredTextLine(curr)) {
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
  let activeCodeFence: string | null = null
  let insideTableBlock = false

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return
    }

    normalized.push(...normalizeParagraphLines(paragraphLines))
    paragraphLines = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    const nextLine = lines[normalized.length + paragraphLines.length + 1]

    if (insideTableBlock) {
      flushParagraph()
      normalized.push(line)
      if (!trimmed) {
        insideTableBlock = false
      }
      continue
    }

    if (activeCodeFence && isFenceClose(line, activeCodeFence)) {
      flushParagraph()
      normalized.push(line)
      activeCodeFence = null
      continue
    }

    if (activeCodeFence) {
      flushParagraph()
      normalized.push(line)
      continue
    }

    const openedFence = getCodeFenceMarker(line)
    if (openedFence) {
      flushParagraph()
      activeCodeFence = openedFence
      normalized.push(line)
      continue
    }

    if (isTableHeaderLine(line, nextLine) || (MARKDOWN_TABLE_DIVIDER.test(trimmed) && normalized.length > 0 && isMarkdownTableLine(normalized[normalized.length - 1]))) {
      flushParagraph()
      insideTableBlock = true
      normalized.push(line)
      continue
    }

    if (isMarkdownBoundaryLine(line, activeCodeFence !== null)) {
      flushParagraph()
      normalized.push(line)
      continue
    }

    paragraphLines.push(line)
  }

  flushParagraph()

  return normalized.join('\n')
}

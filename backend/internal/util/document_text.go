package util

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"os"
	"os/exec"
	"regexp"
	"sort"
	"strings"
	"unicode"

	pdf "github.com/ledongthuc/pdf"
)

func ExtractDocumentText(path string) (string, error) {
	content, err := ExtractDocumentContent(path)
	if err != nil {
		return "", err
	}
	text := strings.TrimSpace(content.Text)
	if text != "" {
		return text, nil
	}
	return BuildDocumentRetrievalText(content), nil
}

func BuildContentPreviewFromText(text string) string {
	cleaned := normalizePreviewText(text)
	if cleaned == "" {
		return "文档内容为空或暂不支持预览"
	}

	runes := []rune(cleaned)
	if len(runes) > 120 {
		return string(runes[:120]) + "..."
	}

	return cleaned
}

func normalizePreviewText(text string) string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")
	text = strings.ReplaceAll(text, "\u0000", "")

	lines := strings.Split(text, "\n")
	cleanedLines := make([]string, 0, len(lines))
	inCodeBlock := false

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}

		if strings.HasPrefix(trimmed, "```") {
			inCodeBlock = !inCodeBlock
			continue
		}

		if inCodeBlock {
			continue
		}

		if isMarkdownTableSeparator(trimmed) {
			continue
		}

		trimmed = stripMarkdownDecoration(trimmed)
		trimmed = strings.TrimSpace(trimmed)
		if trimmed == "" {
			continue
		}

		cleanedLines = append(cleanedLines, trimmed)
	}

	joined := strings.Join(cleanedLines, " ")
	joined = strings.Join(strings.Fields(joined), " ")
	joined = strings.TrimSpace(joined)
	if joined == "" {
		return ""
	}

	return joined
}

func stripMarkdownDecoration(line string) string {
	line = strings.TrimSpace(line)
	line = regexp.MustCompile(`^#{1,6}\s*`).ReplaceAllString(line, "")
	line = regexp.MustCompile(`^>+\s*`).ReplaceAllString(line, "")
	line = regexp.MustCompile(`^[-*+]\s+`).ReplaceAllString(line, "")
	line = regexp.MustCompile(`^\d+[.)]\s+`).ReplaceAllString(line, "")
	line = regexp.MustCompile(`^[-=]{3,}$`).ReplaceAllString(line, "")
	line = strings.ReplaceAll(line, "|", " ")
	line = strings.ReplaceAll(line, "`", "")
	return strings.TrimSpace(line)
}

func isMarkdownTableSeparator(line string) bool {
	line = strings.TrimSpace(line)
	if line == "" || !strings.Contains(line, "|") {
		return false
	}

	compact := strings.ReplaceAll(line, "|", "")
	compact = strings.ReplaceAll(compact, ":", "")
	compact = strings.ReplaceAll(compact, "-", "")
	compact = strings.TrimSpace(compact)
	return compact == ""
}

func extractPlainTextFile(path string) (string, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}

	return normalizeExtractedText(string(content)), nil
}

func extractPDFText(path string) (string, error) {
	// 优先使用 pdftotext（poppler），对中文 PDF 支持更好
	if text, err := extractPDFTextWithPdftotext(path); err == nil && strings.TrimSpace(text) != "" {
		return text, nil
	}

	// 回退到 Go 库
	return extractPDFTextWithGoLib(path)
}

func extractPDFTextWithPdftotext(path string) (string, error) {
	pdftotextPath, err := exec.LookPath("pdftotext")
	if err != nil {
		return "", fmt.Errorf("pdftotext not found")
	}

	var stdout, stderr bytes.Buffer
	cmd := exec.Command(pdftotextPath, "-enc", "UTF-8", "-layout", path, "-")
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("pdftotext: %w: %s", err, stderr.String())
	}

	return normalizeExtractedText(stdout.String()), nil
}

func extractPDFTextWithGoLib(path string) (string, error) {
	file, reader, err := pdf.Open(path)
	if err != nil {
		return "", fmt.Errorf("open pdf: %w", err)
	}
	defer file.Close()

	plainTextReader, err := reader.GetPlainText()
	if err != nil {
		return "", fmt.Errorf("extract pdf text: %w", err)
	}

	content, err := io.ReadAll(plainTextReader)
	if err != nil {
		return "", fmt.Errorf("read pdf text: %w", err)
	}

	return normalizeExtractedText(string(content)), nil
}

func extractDOCXText(path string) (string, error) {
	reader, err := zip.OpenReader(path)
	if err != nil {
		return "", fmt.Errorf("open docx: %w", err)
	}
	defer reader.Close()

	contentFiles := make([]*zip.File, 0)
	for _, file := range reader.File {
		if isDOCXContentFile(file.Name) {
			contentFiles = append(contentFiles, file)
		}
	}
	if len(contentFiles) == 0 {
		return "", fmt.Errorf("docx content xml not found")
	}

	sort.Slice(contentFiles, func(i, j int) bool {
		return docxContentOrder(contentFiles[i].Name) < docxContentOrder(contentFiles[j].Name)
	})

	parts := make([]string, 0, len(contentFiles))
	for _, file := range contentFiles {
		rc, err := file.Open()
		if err != nil {
			return "", fmt.Errorf("open docx entry %s: %w", file.Name, err)
		}

		text, extractErr := extractDOCXXMLText(rc)
		_ = rc.Close()
		if extractErr != nil {
			return "", fmt.Errorf("extract docx xml %s: %w", file.Name, extractErr)
		}
		if strings.TrimSpace(text) != "" {
			parts = append(parts, text)
		}
	}

	if len(parts) == 0 {
		return "", fmt.Errorf("docx content is empty")
	}

	return normalizeExtractedText(strings.Join(parts, "\n\n")), nil
}

func isDOCXContentFile(name string) bool {
	switch {
	case name == "word/document.xml":
		return true
	case strings.HasPrefix(name, "word/header") && strings.HasSuffix(name, ".xml"):
		return true
	case strings.HasPrefix(name, "word/footer") && strings.HasSuffix(name, ".xml"):
		return true
	case name == "word/footnotes.xml", name == "word/endnotes.xml":
		return true
	default:
		return false
	}
}

func docxContentOrder(name string) string {
	switch {
	case name == "word/document.xml":
		return "0-" + name
	case strings.HasPrefix(name, "word/header"):
		return "1-" + name
	case name == "word/footnotes.xml":
		return "2-" + name
	case name == "word/endnotes.xml":
		return "3-" + name
	case strings.HasPrefix(name, "word/footer"):
		return "4-" + name
	default:
		return "9-" + name
	}
}

func extractDOCXXMLText(reader io.Reader) (string, error) {
	decoder := xml.NewDecoder(reader)
	var builder strings.Builder
	inText := false

	for {
		token, err := decoder.Token()
		if err != nil {
			if err == io.EOF {
				break
			}
			return "", err
		}

		switch typed := token.(type) {
		case xml.StartElement:
			switch typed.Name.Local {
			case "t":
				inText = true
			case "tab":
				builder.WriteString("\t")
			case "br", "cr":
				builder.WriteString("\n")
			}
		case xml.EndElement:
			switch typed.Name.Local {
			case "t":
				inText = false
			case "p":
				builder.WriteString("\n\n")
			case "tr":
				builder.WriteString("\n")
			}
		case xml.CharData:
			if inText {
				builder.Write([]byte(typed))
			}
		}
	}

	return builder.String(), nil
}

func normalizeExtractedText(text string) string {
	text = strings.ReplaceAll(text, "\u0000", "")
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")

	lines := strings.Split(text, "\n")

	// 统计每行出现次数，过滤高频重复行（水印）
	lineCount := make(map[string]int, len(lines))
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			lineCount[trimmed]++
		}
	}
	totalNonBlank := len(lineCount)
	// 若某行出现次数超过总不重复行数的 5%（且至少出现 10 次），视为水印行
	watermarkThreshold := totalNonBlank / 20
	if watermarkThreshold < 10 {
		watermarkThreshold = 10
	}

	cleanedLines := make([]string, 0, len(lines))
	blankLineCount := 0
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			blankLineCount++
			if blankLineCount > 1 {
				continue
			}
			cleanedLines = append(cleanedLines, "")
			continue
		}
		blankLineCount = 0
		// 过滤水印行
		if lineCount[line] >= watermarkThreshold {
			continue
		}
		cleanedLines = append(cleanedLines, line)
	}

	return strings.TrimSpace(strings.Join(cleanedLines, "\n"))
}

// SemanticChunkConfig 语义切分配置
// MaxChunkSize 默认 512
// MinChunkSize 默认 50
// OverlapSize 默认 50
// PreserveNewline 默认 true
// 说明：ChunkText 会在 cfg 中为 0 的字段填充默认值
// 以便兼容调用方只传部分配置。
type SemanticChunkConfig struct {
	MaxChunkSize    int
	MinChunkSize    int
	OverlapSize     int
	PreserveNewline bool
}

// DefaultSemanticChunkConfig 返回默认配置
func DefaultSemanticChunkConfig() SemanticChunkConfig {
	return SemanticChunkConfig{
		MaxChunkSize:    512,
		MinChunkSize:    50,
		OverlapSize:     50,
		PreserveNewline: true,
	}
}

// ChunkStrategy 切分策略
// ChunkStrategyFixed: 固定窗口
// ChunkStrategySemantic: 语义边界
// 默认使用语义切分
type ChunkStrategy int

const (
	ChunkStrategyFixed ChunkStrategy = iota
	ChunkStrategySemantic
)

// ChunkText 统一切分入口
// strategy: 切分策略，默认使用语义切分
func ChunkText(text string, strategy ChunkStrategy, cfg SemanticChunkConfig) []string {
	switch strategy {
	case ChunkStrategyFixed:
		return FixedWindowChunk(text, cfg)
	case ChunkStrategySemantic:
		fallthrough
	default:
		return SemanticChunk(text, cfg)
	}
}

// FixedWindowChunk 固定窗口切分（兼容原有逻辑）
func FixedWindowChunk(text string, cfg SemanticChunkConfig) []string {
	cleaned := normalizeChunkText(text)
	if cleaned == "" {
		return nil
	}

	cfg = normalizeSemanticChunkConfig(cfg)
	runes := []rune(cleaned)
	if len(runes) <= cfg.MaxChunkSize {
		return []string{cleaned}
	}

	chunks := make([]string, 0)
	step := cfg.MaxChunkSize - cfg.OverlapSize
	if step <= 0 {
		step = cfg.MaxChunkSize
	}

	for start := 0; start < len(runes); start += step {
		end := start + cfg.MaxChunkSize
		if end > len(runes) {
			end = len(runes)
		}

		chunk := strings.TrimSpace(string(runes[start:end]))
		if chunk != "" {
			chunks = append(chunks, chunk)
		}

		if end == len(runes) {
			break
		}
	}

	return chunks
}

// SemanticChunk 按语义边界切分文本
// 切分优先级：段落边界（双换行）> 句子边界（。！？.!?）> 单换行 > 固定窗口
// 支持中英文混合文本
// 返回切分后的 chunk 列表
func SemanticChunk(text string, cfg SemanticChunkConfig) []string {
	cleaned := normalizeChunkText(text)
	if cleaned == "" {
		return nil
	}

	cfg = normalizeSemanticChunkConfig(cfg)
	paragraphs := splitParagraphs(cleaned)
	chunks := make([]string, 0, len(paragraphs))
	carry := ""

	for index, paragraph := range paragraphs {
		paragraph = strings.TrimSpace(paragraph)
		if paragraph == "" {
			continue
		}

		if carry != "" {
			paragraph = carry + paragraph
			carry = ""
		}

		if runeCount(paragraph) <= cfg.MaxChunkSize {
			chunks = append(chunks, paragraph)
			continue
		}

		sentences := splitSentences(paragraph, cfg.PreserveNewline)
		current := ""
		for _, sentence := range sentences {
			trimmed := strings.TrimSpace(sentence)
			if trimmed == "" {
				continue
			}

			if current == "" {
				current = trimmed
				if runeCount(current) > cfg.MaxChunkSize {
					forced := forceWindowSplit(current, cfg.MaxChunkSize)
					chunks = append(chunks, forced[:len(forced)-1]...)
					current = forced[len(forced)-1]
				}
				continue
			}

			candidate := current + " " + trimmed
			if runeCount(candidate) <= cfg.MaxChunkSize {
				current = candidate
				continue
			}

			chunks = append(chunks, current)
			current = trimmed
			if runeCount(current) > cfg.MaxChunkSize {
				forced := forceWindowSplit(current, cfg.MaxChunkSize)
				chunks = append(chunks, forced[:len(forced)-1]...)
				current = forced[len(forced)-1]
			}
		}

		if current != "" {
			chunks = append(chunks, current)
		}

		if index == len(paragraphs)-1 {
			continue
		}
	}

	chunks = applyOverlap(chunks, cfg.OverlapSize)
	chunks = filterMinChunks(chunks, cfg.MinChunkSize)
	return chunks
}

func normalizeSemanticChunkConfig(cfg SemanticChunkConfig) SemanticChunkConfig {
	defaults := DefaultSemanticChunkConfig()
	if cfg == (SemanticChunkConfig{}) {
		return defaults
	}
	if cfg.MaxChunkSize <= 0 {
		cfg.MaxChunkSize = defaults.MaxChunkSize
	}
	if cfg.MinChunkSize <= 0 {
		cfg.MinChunkSize = defaults.MinChunkSize
	}
	if cfg.OverlapSize < 0 {
		cfg.OverlapSize = defaults.OverlapSize
	}
	return cfg
}

func normalizeChunkText(text string) string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")
	lines := strings.Split(text, "\n")
	cleanedLines := make([]string, 0, len(lines))
	lastWasBlank := true
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			if lastWasBlank {
				continue
			}
			cleanedLines = append(cleanedLines, "")
			lastWasBlank = true
			continue
		}
		cleanedLines = append(cleanedLines, line)
		lastWasBlank = false
	}
	return strings.TrimSpace(strings.Join(cleanedLines, "\n"))
}

func splitParagraphs(text string) []string {
	re := regexp.MustCompile("\\n{2,}")
	parts := re.Split(text, -1)
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		result = append(result, trimmed)
	}
	if len(result) == 0 {
		return []string{text}
	}
	return result
}

func splitSentences(text string, preserveNewline bool) []string {
	runes := []rune(text)
	var out []string
	start := 0
	for i := 0; i < len(runes); i++ {
		r := runes[i]
		if preserveNewline && r == '\n' {
			segment := strings.TrimSpace(string(runes[start : i+1]))
			if segment != "" {
				out = append(out, segment)
			}
			start = i + 1
			continue
		}

		if !isSentencePunctuation(r) {
			continue
		}

		next := rune(0)
		if i+1 < len(runes) {
			next = runes[i+1]
		}
		if next != 0 && !isSentenceBoundaryAfter(next) {
			continue
		}

		segment := strings.TrimSpace(string(runes[start : i+1]))
		if segment != "" {
			out = append(out, segment)
		}
		start = i + 1
	}

	tail := strings.TrimSpace(string(runes[start:]))
	if tail != "" {
		out = append(out, tail)
	}
	return out
}

func isSentencePunctuation(r rune) bool {
	switch r {
	case '。', '！', '？', '.', '!', '?':
		return true
	default:
		return false
	}
}

func isSentenceBoundaryAfter(next rune) bool {
	if next == '\n' || next == '\t' || next == '\r' || next == ' ' {
		return true
	}
	return unicode.IsSpace(next)
}

func forceWindowSplit(text string, maxSize int) []string {
	runes := []rune(text)
	if maxSize <= 0 || len(runes) <= maxSize {
		return []string{text}
	}
	parts := make([]string, 0)
	for start := 0; start < len(runes); start += maxSize {
		end := start + maxSize
		if end > len(runes) {
			end = len(runes)
		}
		parts = append(parts, strings.TrimSpace(string(runes[start:end])))
		if end == len(runes) {
			break
		}
	}
	return parts
}

func applyOverlap(chunks []string, overlap int) []string {
	if len(chunks) == 0 || overlap <= 0 {
		return chunks
	}
	result := make([]string, len(chunks))
	copy(result, chunks)
	for i := 0; i < len(result)-1; i++ {
		current := []rune(result[i])
		if len(current) == 0 {
			continue
		}
		start := len(current) - overlap
		if start < 0 {
			start = 0
		}
		prefix := strings.TrimSpace(string(current[start:]))
		if prefix == "" {
			continue
		}
		next := strings.TrimSpace(result[i+1])
		if next == "" {
			continue
		}
		result[i+1] = prefix + " " + next
	}
	return result
}

func filterMinChunks(chunks []string, minSize int) []string {
	if len(chunks) == 0 {
		return chunks
	}
	if minSize <= 0 {
		return chunks
	}
	result := make([]string, 0, len(chunks))
	for i, chunk := range chunks {
		trimmed := strings.TrimSpace(chunk)
		if trimmed == "" {
			continue
		}
		if runeCount(trimmed) < minSize && i != len(chunks)-1 {
			continue
		}
		result = append(result, trimmed)
	}
	return result
}

func runeCount(text string) int {
	return len([]rune(text))
}

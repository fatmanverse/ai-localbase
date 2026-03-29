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

type DocumentChunkProfile string

const (
	DocumentChunkProfileGeneric         DocumentChunkProfile = "generic"
	DocumentChunkProfileFAQ             DocumentChunkProfile = "faq"
	DocumentChunkProfileOperationSteps  DocumentChunkProfile = "operation_steps"
	DocumentChunkProfileParameters      DocumentChunkProfile = "parameters"
	DocumentChunkProfileTroubleshooting DocumentChunkProfile = "troubleshooting"
)

var (
	faqQuestionLineRegexp     = regexp.MustCompile(`(?i)^(问|q(?:uestion)?)[\s\d._-]*[:：]`)
	stepParagraphLineRegexp   = regexp.MustCompile(`(?m)^(\d+[.)、]\s+|步骤\s*\d+[:：]?\s*|第[一二三四五六七八九十\d]+步[:：]?\s*|[-*+]\s+)`)
	markdownTableLineRegexp   = regexp.MustCompile(`(?m)^\|.+\|\s*$`)
	troubleshootKeywordRegexp = regexp.MustCompile(`现象|原因|排查|处理|修复|报错|错误|告警|异常|解决`)
)

// DetectDocumentChunkProfile 根据文档名与正文特征判断切片策略。
// 这是一个轻量启发式实现，优先保证 FAQ / 步骤 / 参数 / 排障几类资料不要继续一刀切。
func DetectDocumentChunkProfile(documentName, text string) DocumentChunkProfile {
	cleaned := normalizeChunkText(text)
	if cleaned == "" {
		return DocumentChunkProfileGeneric
	}

	lowerName := strings.ToLower(strings.TrimSpace(documentName))
	faqScore := 0
	stepScore := 0
	parameterScore := 0
	troubleshootScore := 0

	if strings.Contains(lowerName, "faq") || strings.Contains(lowerName, "q&a") {
		faqScore += 4
	}
	if strings.Contains(lowerName, "guide") || strings.Contains(lowerName, "manual") || strings.Contains(lowerName, "tutorial") || strings.Contains(lowerName, "手册") || strings.Contains(lowerName, "步骤") || strings.Contains(lowerName, "操作") {
		stepScore += 2
	}
	if strings.Contains(lowerName, "config") || strings.Contains(lowerName, "setting") || strings.Contains(lowerName, "param") || strings.Contains(lowerName, "参数") || strings.Contains(lowerName, "配置") || strings.Contains(lowerName, "字段") {
		parameterScore += 3
	}
	if strings.Contains(lowerName, "error") || strings.Contains(lowerName, "trouble") || strings.Contains(lowerName, "incident") || strings.Contains(lowerName, "排障") || strings.Contains(lowerName, "故障") || strings.Contains(lowerName, "错误") || strings.Contains(lowerName, "告警") {
		troubleshootScore += 4
	}

	faqScore += countRegexpMatches(faqQuestionLineRegexp, cleaned) * 2
	stepScore += countRegexpMatches(stepParagraphLineRegexp, cleaned)
	parameterScore += countRegexpMatches(markdownTableLineRegexp, cleaned)
	troubleshootScore += countRegexpMatches(troubleshootKeywordRegexp, cleaned)

	if strings.Contains(cleaned, "默认值") || strings.Contains(cleaned, "必填") || strings.Contains(cleaned, "字段说明") || strings.Contains(cleaned, "参数说明") || strings.Contains(cleaned, "配置项") {
		parameterScore += 3
	}
	if strings.Contains(cleaned, "步骤") || strings.Contains(cleaned, "点击") || strings.Contains(cleaned, "进入") || strings.Contains(cleaned, "打开") || strings.Contains(cleaned, "保存") || strings.Contains(cleaned, "提交") {
		stepScore += 2
	}
	if strings.Contains(cleaned, "问：") || strings.Contains(cleaned, "答：") || strings.Contains(cleaned, "Q:") || strings.Contains(cleaned, "A:") {
		faqScore += 2
	}

	bestProfile := DocumentChunkProfileGeneric
	bestScore := 0
	candidates := []struct {
		profile DocumentChunkProfile
		score   int
	}{
		{DocumentChunkProfileFAQ, faqScore},
		{DocumentChunkProfileTroubleshooting, troubleshootScore},
		{DocumentChunkProfileParameters, parameterScore},
		{DocumentChunkProfileOperationSteps, stepScore},
	}
	for _, candidate := range candidates {
		if candidate.score > bestScore {
			bestScore = candidate.score
			bestProfile = candidate.profile
		}
	}
	return bestProfile
}

// ChunkDocumentText 以“文档类型 + 图片知识段”做基础版分治切片。
// 目标不是一次性做完整多模态 chunker，而是先避免 FAQ / 参数 / 步骤 / 排障 / 图片继续被统一语义切片打散。
func ChunkDocumentText(documentName, text string, cfg SemanticChunkConfig) []string {
	cleaned := normalizeChunkText(text)
	if cleaned == "" {
		return nil
	}

	cfg = normalizeSemanticChunkConfig(cfg)
	bodyText, imageChunks := splitImageKnowledgeAwareText(cleaned, cfg)
	profile := DetectDocumentChunkProfile(documentName, bodyText)

	var bodyChunks []string
	switch profile {
	case DocumentChunkProfileFAQ:
		bodyChunks = chunkFAQText(bodyText, cfg)
	case DocumentChunkProfileParameters:
		bodyChunks = chunkParagraphAwareText(bodyText, cfg, true)
	case DocumentChunkProfileTroubleshooting:
		bodyChunks = chunkParagraphAwareText(bodyText, cfg, true)
	case DocumentChunkProfileOperationSteps:
		bodyChunks = chunkParagraphAwareText(bodyText, cfg, true)
	default:
		bodyChunks = SemanticChunk(bodyText, cfg)
	}

	combined := make([]string, 0, len(bodyChunks)+len(imageChunks))
	combined = append(combined, normalizeStructuredChunks(bodyChunks)...)
	combined = append(combined, normalizeStructuredChunks(imageChunks)...)
	if len(combined) > 0 {
		return combined
	}
	return SemanticChunk(cleaned, cfg)
}

func countRegexpMatches(re *regexp.Regexp, text string) int {
	if re == nil || strings.TrimSpace(text) == "" {
		return 0
	}
	return len(re.FindAllString(text, -1))
}

func splitImageKnowledgeAwareText(text string, cfg SemanticChunkConfig) (string, []string) {
	marker := "## 图片知识补充"
	index := strings.Index(text, marker)
	if index < 0 {
		return strings.TrimSpace(text), nil
	}

	body := strings.TrimSpace(text[:index])
	section := strings.TrimSpace(text[index+len(marker):])
	if section == "" {
		return body, nil
	}

	lines := strings.Split(section, "\n")
	blocks := make([]string, 0)
	introLines := make([]string, 0)
	current := make([]string, 0)
	flushCurrent := func() {
		trimmed := strings.TrimSpace(strings.Join(current, "\n"))
		if trimmed != "" {
			blocks = append(blocks, trimmed)
		}
		current = current[:0]
	}

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			if len(current) > 0 {
				current = append(current, "")
			}
			continue
		}
		if strings.HasPrefix(trimmed, "图片ID:") || strings.HasPrefix(trimmed, "图片ID：") {
			if len(current) > 0 {
				flushCurrent()
			}
			current = append(current, trimmed)
			continue
		}
		if len(current) == 0 {
			introLines = append(introLines, trimmed)
			continue
		}
		current = append(current, trimmed)
	}
	if len(current) > 0 {
		flushCurrent()
	}

	result := make([]string, 0, len(blocks)+1)
	intro := strings.TrimSpace(strings.Join(introLines, "\n"))
	if intro != "" {
		result = append(result, chunkParagraphAwareText(intro, cfg, false)...)
	}
	for _, block := range blocks {
		result = append(result, chunkImageKnowledgeBlock(block, cfg)...)
	}
	return body, result
}

func chunkImageKnowledgeBlock(block string, cfg SemanticChunkConfig) []string {
	cleaned := normalizeChunkText(block)
	if cleaned == "" {
		return nil
	}
	if runeCount(cleaned) <= cfg.MaxChunkSize {
		return []string{cleaned}
	}

	lines := splitImageKnowledgeLines(cleaned)
	if len(lines) == 0 {
		return nil
	}

	prefixLines, contentLines := buildImageChunkPrefix(lines, cfg.MaxChunkSize)
	if len(contentLines) == 0 {
		return []string{cleaned}
	}

	availableSize := imageChunkAvailableSize(prefixLines, cfg.MaxChunkSize)
	if availableSize < 24 {
		prefixLines = buildImageChunkMandatoryPrefix(lines)
		availableSize = imageChunkAvailableSize(prefixLines, cfg.MaxChunkSize)
	}
	if availableSize < 16 {
		return []string{cleaned}
	}

	units := make([]string, 0, len(contentLines))
	for _, line := range contentLines {
		units = append(units, splitImageChunkLine(line, availableSize)...)
	}
	if len(units) == 0 {
		return []string{cleaned}
	}

	prefix := strings.TrimSpace(strings.Join(prefixLines, "\n"))
	chunks := make([]string, 0, len(units))
	current := make([]string, 0)
	currentSize := 0
	flush := func() {
		if len(current) == 0 {
			return
		}
		body := strings.Join(current, "\n")
		if prefix != "" {
			chunks = append(chunks, strings.TrimSpace(prefix+"\n"+body))
		} else {
			chunks = append(chunks, strings.TrimSpace(body))
		}
		current = current[:0]
		currentSize = 0
	}

	for _, unit := range units {
		trimmed := strings.TrimSpace(unit)
		if trimmed == "" {
			continue
		}
		unitSize := runeCount(trimmed)
		candidateSize := unitSize
		if currentSize > 0 {
			candidateSize += currentSize + 1
		}
		if currentSize > 0 && candidateSize > availableSize {
			flush()
		}
		current = append(current, trimmed)
		if currentSize == 0 {
			currentSize = unitSize
		} else {
			currentSize += unitSize + 1
		}
	}
	flush()
	if len(chunks) == 0 {
		return []string{cleaned}
	}
	return chunks
}

func splitImageKnowledgeLines(block string) []string {
	lines := strings.Split(block, "\n")
	items := make([]string, 0, len(lines))
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		items = append(items, trimmed)
	}
	return items
}

func buildImageChunkPrefix(lines []string, maxChunkSize int) ([]string, []string) {
	if len(lines) == 0 {
		return nil, nil
	}
	used := make([]bool, len(lines))
	prefix := make([]string, 0, len(lines))
	for index, line := range lines {
		if !isMandatoryImagePrefixLine(line) {
			continue
		}
		prefix = append(prefix, line)
		used[index] = true
	}

	reservedForContent := 96
	if maxChunkSize > 0 {
		quarter := maxChunkSize / 4
		if quarter > reservedForContent {
			reservedForContent = quarter
		}
		if quarter < 48 {
			reservedForContent = 48
		}
	}

	prefixSize := runeCount(strings.Join(prefix, "\n"))
	for index, line := range lines {
		if used[index] || !isPreferredImagePrefixLine(line) {
			continue
		}
		extra := runeCount(line)
		if len(prefix) > 0 {
			extra += 1
		}
		if maxChunkSize > 0 && prefixSize+extra > maxChunkSize-reservedForContent {
			continue
		}
		prefix = append(prefix, line)
		used[index] = true
		prefixSize += extra
	}

	content := make([]string, 0, len(lines))
	for index, line := range lines {
		if used[index] {
			continue
		}
		content = append(content, line)
	}
	if len(prefix) == 0 {
		return buildImageChunkMandatoryPrefix(lines), content
	}
	return prefix, content
}

func buildImageChunkMandatoryPrefix(lines []string) []string {
	prefix := make([]string, 0, len(lines))
	for _, line := range lines {
		if isMandatoryImagePrefixLine(line) {
			prefix = append(prefix, line)
		}
	}
	return prefix
}

func isMandatoryImagePrefixLine(line string) bool {
	label, _, _, ok := splitStructuredLabelLine(line)
	if !ok {
		return false
	}
	switch label {
	case "图片ID", "图片类型", "图片标题":
		return true
	default:
		return false
	}
}

func isPreferredImagePrefixLine(line string) bool {
	label, _, _, ok := splitStructuredLabelLine(line)
	if !ok {
		return false
	}
	switch label {
	case "图片说明", "前文", "后文":
		return true
	default:
		return false
	}
}

func imageChunkAvailableSize(prefixLines []string, maxChunkSize int) int {
	available := maxChunkSize
	prefix := strings.TrimSpace(strings.Join(prefixLines, "\n"))
	if prefix != "" {
		available -= runeCount(prefix) + 1
	}
	return available
}

func splitImageChunkLine(line string, maxSize int) []string {
	trimmed := strings.TrimSpace(line)
	if trimmed == "" {
		return nil
	}
	if maxSize <= 0 || runeCount(trimmed) <= maxSize {
		return []string{trimmed}
	}

	label, sep, value, ok := splitStructuredLabelLine(trimmed)
	if !ok {
		return forceWindowSplit(trimmed, maxSize)
	}
	prefix := strings.TrimSpace(label + sep)
	if prefix == "" {
		return forceWindowSplit(trimmed, maxSize)
	}
	prefix += " "
	available := maxSize - runeCount(prefix)
	if available <= 8 {
		return forceWindowSplit(trimmed, maxSize)
	}

	parts := SemanticChunk(value, SemanticChunkConfig{
		MaxChunkSize:    available,
		MinChunkSize:    1,
		OverlapSize:     0,
		PreserveNewline: false,
	})
	if len(parts) == 0 {
		parts = forceWindowSplit(value, available)
	}
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		chunk := strings.TrimSpace(part)
		if chunk == "" {
			continue
		}
		result = append(result, prefix+chunk)
	}
	if len(result) == 0 {
		return forceWindowSplit(trimmed, maxSize)
	}
	return result
}

func splitStructuredLabelLine(line string) (string, string, string, bool) {
	trimmed := strings.TrimSpace(line)
	if trimmed == "" {
		return "", "", "", false
	}
	index := strings.Index(trimmed, "：")
	sep := "："
	if asciiIndex := strings.Index(trimmed, ":"); asciiIndex >= 0 && (index < 0 || asciiIndex < index) {
		index = asciiIndex
		sep = ":"
	}
	if index <= 0 {
		return "", "", "", false
	}
	label := strings.TrimSpace(trimmed[:index])
	value := strings.TrimSpace(trimmed[index+len(sep):])
	if label == "" {
		return "", "", "", false
	}
	return label, sep, value, true
}

func chunkFAQText(text string, cfg SemanticChunkConfig) []string {
	cleaned := normalizeChunkText(text)
	if cleaned == "" {
		return nil
	}

	lines := strings.Split(cleaned, "\n")
	blocks := make([]string, 0)
	current := make([]string, 0)
	seenQuestion := false
	flushCurrent := func() {
		trimmed := strings.TrimSpace(strings.Join(current, "\n"))
		if trimmed != "" {
			blocks = append(blocks, trimmed)
		}
		current = current[:0]
	}

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			if len(current) > 0 {
				current = append(current, "")
			}
			continue
		}
		if faqQuestionLineRegexp.MatchString(trimmed) {
			if len(current) > 0 {
				flushCurrent()
			}
			seenQuestion = true
			current = append(current, trimmed)
			continue
		}
		current = append(current, trimmed)
	}
	if len(current) > 0 {
		flushCurrent()
	}

	if !seenQuestion {
		return chunkParagraphAwareText(cleaned, cfg, true)
	}

	result := make([]string, 0, len(blocks))
	for _, block := range blocks {
		if runeCount(block) <= cfg.MaxChunkSize {
			result = append(result, strings.TrimSpace(block))
			continue
		}
		result = append(result, packStructuredUnits([]string{block}, cfg)...)
	}
	return result
}

func chunkParagraphAwareText(text string, cfg SemanticChunkConfig, mergeHeadings bool) []string {
	cleaned := normalizeChunkText(text)
	if cleaned == "" {
		return nil
	}
	paragraphs := splitParagraphs(cleaned)
	if len(paragraphs) == 0 {
		return nil
	}
	if mergeHeadings {
		paragraphs = mergeHeadingParagraphs(paragraphs)
	}
	return packStructuredUnits(paragraphs, cfg)
}

func mergeHeadingParagraphs(paragraphs []string) []string {
	if len(paragraphs) <= 1 {
		return paragraphs
	}
	result := make([]string, 0, len(paragraphs))
	for index := 0; index < len(paragraphs); index++ {
		current := strings.TrimSpace(paragraphs[index])
		if current == "" {
			continue
		}
		if looksLikeHeadingParagraph(current) && index+1 < len(paragraphs) {
			next := strings.TrimSpace(paragraphs[index+1])
			if next != "" {
				result = append(result, current+"\n\n"+next)
				index++
				continue
			}
		}
		result = append(result, current)
	}
	return result
}

func looksLikeHeadingParagraph(paragraph string) bool {
	trimmed := strings.TrimSpace(paragraph)
	if trimmed == "" {
		return false
	}
	if runeCount(trimmed) > 48 {
		return false
	}
	if strings.HasPrefix(trimmed, "#") {
		return true
	}
	if strings.HasSuffix(trimmed, "：") || strings.HasSuffix(trimmed, ":") {
		return true
	}
	if strings.HasPrefix(trimmed, "步骤") || strings.HasPrefix(trimmed, "第") {
		return true
	}
	if regexp.MustCompile(`^[一二三四五六七八九十]+[、.．]`).MatchString(trimmed) {
		return true
	}
	if strings.Contains(trimmed, "现象") || strings.Contains(trimmed, "原因") || strings.Contains(trimmed, "排查") || strings.Contains(trimmed, "修复") {
		return true
	}
	return false
}

func packStructuredUnits(units []string, cfg SemanticChunkConfig) []string {
	trimmedUnits := make([]string, 0, len(units))
	for _, unit := range units {
		trimmed := strings.TrimSpace(unit)
		if trimmed == "" {
			continue
		}
		trimmedUnits = append(trimmedUnits, trimmed)
	}
	if len(trimmedUnits) == 0 {
		return nil
	}

	chunks := make([]string, 0, len(trimmedUnits))
	current := ""
	for _, unit := range trimmedUnits {
		if runeCount(unit) > cfg.MaxChunkSize {
			if strings.TrimSpace(current) != "" {
				chunks = append(chunks, strings.TrimSpace(current))
				current = ""
			}
			for _, part := range SemanticChunk(unit, SemanticChunkConfig{
				MaxChunkSize:    cfg.MaxChunkSize,
				MinChunkSize:    1,
				OverlapSize:     0,
				PreserveNewline: cfg.PreserveNewline,
			}) {
				if strings.TrimSpace(part) != "" {
					chunks = append(chunks, strings.TrimSpace(part))
				}
			}
			continue
		}

		if current == "" {
			current = unit
			continue
		}
		candidate := current + "\n\n" + unit
		if runeCount(candidate) <= cfg.MaxChunkSize {
			current = candidate
			continue
		}
		chunks = append(chunks, strings.TrimSpace(current))
		current = unit
	}
	if strings.TrimSpace(current) != "" {
		chunks = append(chunks, strings.TrimSpace(current))
	}
	return chunks
}

func normalizeStructuredChunks(chunks []string) []string {
	if len(chunks) == 0 {
		return nil
	}
	result := make([]string, 0, len(chunks))
	seen := make(map[string]struct{}, len(chunks))
	for _, chunk := range chunks {
		trimmed := strings.TrimSpace(chunk)
		if trimmed == "" {
			continue
		}
		key := strings.ToLower(trimmed)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, trimmed)
	}
	return result
}

var imageIntentKeywords = []string{
	"图片", "截图", "界面", "页面", "按钮", "图里", "图中", "附图", "看图",
	"流程图", "架构图", "拓扑图", "示意图", "图表", "表格截图", "页面截图", "关键操作截图",
	"screenshot", "ui", "button", "page", "diagram", "topology",
}

func IsImageIntentQuery(query string) bool {
	cleaned := strings.ToLower(strings.TrimSpace(query))
	if cleaned == "" {
		return false
	}
	for _, keyword := range imageIntentKeywords {
		if strings.Contains(cleaned, strings.ToLower(keyword)) {
			return true
		}
	}
	return false
}

func ExtractChunkTopic(text string) string {
	cleaned := normalizeChunkText(text)
	if cleaned == "" {
		return ""
	}

	lines := strings.Split(cleaned, "\n")
	preferredLabels := []string{"图片标题", "图片说明", "图片类型", "标题", "主题"}
	for _, label := range preferredLabels {
		for _, line := range lines {
			if value := extractTopicLabelValue(line, label); value != "" {
				return shortenChunkTopic(value)
			}
		}
	}

	skipPrefixes := []string{"图片ID", "图片OCR", "前文", "后文"}
	for _, line := range lines {
		trimmed := strings.TrimSpace(stripMarkdownDecoration(line))
		if trimmed == "" {
			continue
		}
		skip := false
		for _, prefix := range skipPrefixes {
			if strings.HasPrefix(trimmed, prefix+":") || strings.HasPrefix(trimmed, prefix+"：") {
				skip = true
				break
			}
		}
		if skip {
			continue
		}
		return shortenChunkTopic(trimmed)
	}
	return ""
}

func extractTopicLabelValue(line, label string) string {
	trimmed := strings.TrimSpace(line)
	if trimmed == "" {
		return ""
	}
	for _, sep := range []string{":", "："} {
		prefix := label + sep
		if strings.HasPrefix(trimmed, prefix) {
			return strings.TrimSpace(strings.TrimPrefix(trimmed, prefix))
		}
	}
	return ""
}

func shortenChunkTopic(topic string) string {
	trimmed := strings.TrimSpace(topic)
	if trimmed == "" {
		return ""
	}
	runes := []rune(trimmed)
	if len(runes) > 72 {
		return string(runes[:72])
	}
	return trimmed
}

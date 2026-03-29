package util

import (
	"strings"
	"testing"
)

func TestSemanticChunkBasic(t *testing.T) {
	text := "第一段第一句。第一段第二句。\n\n第二段第一句。"
	cfg := DefaultSemanticChunkConfig()
	cfg.MaxChunkSize = 20
	cfg.MinChunkSize = 1
	cfg.OverlapSize = 0

	chunks := SemanticChunk(text, cfg)
	if len(chunks) < 2 {
		t.Fatalf("expected multiple chunks, got %d", len(chunks))
	}
	if chunks[0] != "第一段第一句。第一段第二句。" {
		t.Fatalf("unexpected first chunk: %q", chunks[0])
	}
	if chunks[len(chunks)-1] != "第二段第一句。" {
		t.Fatalf("unexpected last chunk: %q", chunks[len(chunks)-1])
	}
}

func TestSemanticChunkOverlap(t *testing.T) {
	text := "句子一。句子二。句子三。"
	cfg := DefaultSemanticChunkConfig()
	cfg.MaxChunkSize = 6
	cfg.MinChunkSize = 1
	cfg.OverlapSize = 2

	chunks := SemanticChunk(text, cfg)
	if len(chunks) < 2 {
		t.Fatalf("expected multiple chunks, got %d", len(chunks))
	}
	prevTail := []rune(strings.TrimSpace(chunks[0]))
	if len(prevTail) < cfg.OverlapSize {
		t.Fatalf("expected chunk length >= overlap")
	}
	prefix := string(prevTail[len(prevTail)-cfg.OverlapSize:])
	if !strings.HasPrefix(chunks[1], prefix) {
		t.Fatalf("expected overlap prefix %q, got %q", prefix, chunks[1])
	}
}

func TestSemanticChunkLongSentence(t *testing.T) {
	text := strings.Repeat("很长", 40) + "。"
	cfg := DefaultSemanticChunkConfig()
	cfg.MaxChunkSize = 10
	cfg.MinChunkSize = 1
	cfg.OverlapSize = 0

	chunks := SemanticChunk(text, cfg)
	if len(chunks) < 2 {
		t.Fatalf("expected forced split, got %d", len(chunks))
	}
	for i, chunk := range chunks {
		if len([]rune(chunk)) > cfg.MaxChunkSize {
			t.Fatalf("chunk %d too long: %d", i, len([]rune(chunk)))
		}
	}
}

func TestSemanticChunkMinSize(t *testing.T) {
	text := "短句。\n\n这是一个足够长的句子，用于验证最小长度过滤。"
	cfg := DefaultSemanticChunkConfig()
	cfg.MaxChunkSize = 50
	cfg.MinChunkSize = 10
	cfg.OverlapSize = 0

	chunks := SemanticChunk(text, cfg)
	if len(chunks) != 1 {
		t.Fatalf("expected short chunk to be filtered, got %d", len(chunks))
	}
	if !strings.Contains(chunks[0], "这是一个足够长的句子") {
		t.Fatalf("unexpected chunk: %q", chunks[0])
	}
}

func TestSemanticChunkPreservesParagraphBoundary(t *testing.T) {
	text := "第一段第一句。\n\n第二段第一句。\n\n第三段第一句。"
	cfg := DefaultSemanticChunkConfig()
	cfg.MaxChunkSize = 12
	cfg.MinChunkSize = 1
	cfg.OverlapSize = 0

	chunks := SemanticChunk(text, cfg)
	if len(chunks) < 2 {
		t.Fatalf("expected paragraph-aware split, got %d", len(chunks))
	}
	if chunks[0] != "第一段第一句。" {
		t.Fatalf("expected first paragraph chunk, got %q", chunks[0])
	}
	if chunks[1] != "第二段第一句。" {
		t.Fatalf("expected second paragraph chunk, got %q", chunks[1])
	}
}

func TestSemanticChunkAllowsDisablePreserveNewline(t *testing.T) {
	text := "第一行\n第二行\n第三行"
	cfg := SemanticChunkConfig{
		MaxChunkSize:    20,
		MinChunkSize:    1,
		OverlapSize:     0,
		PreserveNewline: false,
	}

	chunks := SemanticChunk(text, cfg)
	if len(chunks) != 1 {
		t.Fatalf("expected newline to be merged when preserveNewline=false, got %d", len(chunks))
	}
	if !strings.Contains(chunks[0], "第二行") {
		t.Fatalf("expected merged chunk to contain full content, got %q", chunks[0])
	}
}

func TestExtractChunkTopic(t *testing.T) {
	imageTopic := ExtractChunkTopic(`图片ID: img-1
图片标题: 审批页操作区
图片说明: 右上角有保存按钮。`)
	if imageTopic != "审批页操作区" {
		t.Fatalf("expected image title topic, got %q", imageTopic)
	}

	faqTopic := ExtractChunkTopic(`问：如何切换知识库？
答：新建会话时先选择知识库。`)
	if !strings.Contains(faqTopic, "如何切换知识库") {
		t.Fatalf("expected faq topic, got %q", faqTopic)
	}
}

func TestChunkDocumentTextPreservesImageIDsForOversizedImageBlocks(t *testing.T) {
	cfg := DefaultSemanticChunkConfig()
	cfg.MaxChunkSize = 110
	cfg.MinChunkSize = 1
	cfg.OverlapSize = 0

	text := strings.TrimSpace("正文说明：登录后先进入审批页。\n\n## 图片知识补充\n图片ID: img-oversized\n图片类型: 关键操作截图\n图片标题: 审批页操作区\n图片说明: 审批页右上角包含保存按钮和提交流程入口，提交前需要先确认审批状态。\n图片OCR: " + strings.Repeat("保存 提交 返回 审批 状态 说明。", 18))
	chunks := ChunkDocumentText("image-guide.md", text, cfg)

	var imageChunkCount int
	for _, chunk := range chunks {
		if !strings.Contains(chunk, "图片类型:") && !strings.Contains(chunk, "图片OCR:") && !strings.Contains(chunk, "图片说明:") {
			continue
		}
		imageChunkCount += 1
		ids := ExtractImageIDsFromText(chunk)
		if len(ids) != 1 || ids[0] != "img-oversized" {
			t.Fatalf("expected oversized image chunk to preserve image id, got %v in chunk %q", ids, chunk)
		}
		if len([]rune(chunk)) > cfg.MaxChunkSize {
			t.Fatalf("expected chunk to respect max size %d, got %d", cfg.MaxChunkSize, len([]rune(chunk)))
		}
	}

	if imageChunkCount < 2 {
		t.Fatalf("expected oversized image block to split into multiple retrievable chunks, got %d", imageChunkCount)
	}
}

func TestIsImageIntentQuery(t *testing.T) {
	positive := []string{
		"截图里的保存按钮在哪",
		"请结合流程图解释审批路径",
		"页面上这个按钮是什么意思",
	}
	for _, query := range positive {
		if !IsImageIntentQuery(query) {
			t.Fatalf("expected image intent query to be detected: %s", query)
		}
	}

	negative := []string{
		"如何配置向量模型",
		"知识库默认切片大小是多少",
	}
	for _, query := range negative {
		if IsImageIntentQuery(query) {
			t.Fatalf("expected non-image query to remain false: %s", query)
		}
	}
}

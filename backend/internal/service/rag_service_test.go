package service

import (
	"archive/zip"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"ai-localbase/internal/model"
	"ai-localbase/internal/util"
)

func TestRagServiceChunkText(t *testing.T) {
	rag := NewRagService()
	input := strings.Repeat("知识库检索能力验证。", 120)

	chunks := rag.ChunkText(input)
	if len(chunks) < 2 {
		t.Fatalf("expected multiple chunks, got %d", len(chunks))
	}

	for index, chunk := range chunks {
		if strings.TrimSpace(chunk) == "" {
			t.Fatalf("chunk %d should not be empty", index)
		}
	}
}

func TestRagServiceBuildDocumentChunks(t *testing.T) {
	rag := NewRagService()
	document := model.Document{
		ID:              "doc-1",
		KnowledgeBaseID: "kb-1",
		Name:            "demo.md",
	}

	chunks := rag.BuildDocumentChunks(document, strings.Repeat("RAG 文档切分测试。", 100))
	if len(chunks) == 0 {
		t.Fatal("expected non-empty document chunks")
	}

	first := chunks[0]
	if first.DocumentID != document.ID {
		t.Fatalf("expected document id %s, got %s", document.ID, first.DocumentID)
	}
	if first.KnowledgeBaseID != document.KnowledgeBaseID {
		t.Fatalf("expected knowledge base id %s, got %s", document.KnowledgeBaseID, first.KnowledgeBaseID)
	}
}

func TestRagServiceEmbedTextsFallback(t *testing.T) {
	rag := NewRagService()
	cfg := model.EmbeddingModelConfig{
		Provider: "ollama",
		BaseURL:  "http://127.0.0.1:0",
		Model:    "demo-embedding-model",
	}

	embeddings, err := rag.EmbedTexts(t.Context(), cfg, []string{"redis 缓存", "qdrant 检索"}, 8)
	if err != nil {
		t.Fatalf("expected fallback embeddings without error, got %v", err)
	}
	if len(embeddings) != 2 {
		t.Fatalf("expected 2 embeddings, got %d", len(embeddings))
	}
	for index, vector := range embeddings {
		if len(vector) != 8 {
			t.Fatalf("embedding %d expected dimension 8, got %d", index, len(vector))
		}
	}
}

func TestRagServiceBuildContext(t *testing.T) {
	rag := NewRagService()
	contextText, sources := rag.BuildContext([]RetrievedChunk{
		{
			DocumentChunk: DocumentChunk{
				ID:              "chunk-1",
				KnowledgeBaseID: "kb-1",
				DocumentID:      "doc-1",
				DocumentName:    "demo.md",
				Text:            "这是一个用于回答问题的片段。",
				Index:           0,
			},
			Score: 0.92,
		},
	})

	if !strings.Contains(contextText, "demo.md") {
		t.Fatalf("expected context to contain document name, got %s", contextText)
	}
	if len(sources) != 1 {
		t.Fatalf("expected 1 source, got %d", len(sources))
	}
	if sources[0]["chunkId"] != "chunk-1" {
		t.Fatalf("expected chunkId chunk-1, got %s", sources[0]["chunkId"])
	}
}

func TestExtractDocumentTextFromMarkdown(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "demo.md")
	content := "# 标题\n\n第一段内容。\n第二段内容。\n"
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write markdown file: %v", err)
	}

	text, err := util.ExtractDocumentText(path)
	if err != nil {
		t.Fatalf("extract markdown text: %v", err)
	}

	if !strings.Contains(text, "第一段内容。") {
		t.Fatalf("expected extracted text to contain markdown content, got %q", text)
	}
}

func TestExtractContentPreviewFromMarkdown(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "preview.md")
	content := strings.Repeat("用于摘要生成的内容。", 20)
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write markdown file: %v", err)
	}

	preview := util.ExtractContentPreview(path)
	if !strings.Contains(preview, "用于摘要生成的内容") {
		t.Fatalf("expected preview to contain file content, got %q", preview)
	}
	if len([]rune(preview)) > 123 {
		t.Fatalf("expected preview to be truncated to a reasonable length, got %d runes", len([]rune(preview)))
	}
}

func TestExtractDocumentTextFromDOCX(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "demo.docx")
	if err := writeTestDOCX(path, map[string]string{
		"word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>第一段内容</w:t></w:r></w:p><w:p><w:r><w:t>第二段内容</w:t></w:r></w:p></w:body></w:document>`,
	}); err != nil {
		t.Fatalf("write docx file: %v", err)
	}

	text, err := util.ExtractDocumentText(path)
	if err != nil {
		t.Fatalf("extract docx text: %v", err)
	}
	if !strings.Contains(text, "第一段内容") || !strings.Contains(text, "第二段内容") {
		t.Fatalf("expected extracted docx text to contain paragraphs, got %q", text)
	}
}

func TestExtractContentPreviewFromDOCX(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "preview.docx")
	if err := writeTestDOCX(path, map[string]string{
		"word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>` + strings.Repeat("DOCX预览内容。", 20) + `</w:t></w:r></w:p></w:body></w:document>`,
	}); err != nil {
		t.Fatalf("write docx preview file: %v", err)
	}

	preview := util.ExtractContentPreview(path)
	if !strings.Contains(preview, "DOCX预览内容") {
		t.Fatalf("expected docx preview to contain file content, got %q", preview)
	}
	if len([]rune(preview)) > 123 {
		t.Fatalf("expected docx preview to be truncated, got %d runes", len([]rune(preview)))
	}
}

func TestAppServiceIndexDocumentWithExtractedText(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "indexed.md")
	content := strings.Repeat("真实文本抽取后进入索引链路。", 80)
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write indexed markdown file: %v", err)
	}

	service := NewAppService(nil, NewAppStateStore(""), nil, model.ServerConfig{})
	knowledgeBases := service.ListKnowledgeBases()
	if len(knowledgeBases) == 0 {
		t.Fatal("expected default knowledge base")
	}

	document := model.Document{
		ID:              "doc-indexed",
		KnowledgeBaseID: knowledgeBases[0].ID,
		Name:            "indexed.md",
		Path:            path,
		Status:          "processing",
	}

	indexed, err := service.IndexDocument(document)
	if err != nil {
		t.Fatalf("index document: %v", err)
	}

	if indexed.Status != "indexed" {
		t.Fatalf("expected indexed status, got %s", indexed.Status)
	}
	if !strings.Contains(indexed.ContentPreview, "真实文本抽取后进入索引链路") {
		t.Fatalf("expected content preview to come from extracted text, got %q", indexed.ContentPreview)
	}
}

func TestBuildSparseVector(t *testing.T) {
	vector := BuildSparseVector("混合 Hybrid Search 支持 iPhone14 Pro Max")
	if len(vector.Indices) == 0 {
		t.Fatal("expected sparse vector indices")
	}
	if len(vector.Indices) != len(vector.Values) {
		t.Fatalf("expected indices and values length match, got %d and %d", len(vector.Indices), len(vector.Values))
	}
	if len(vector.Indices) < 5 {
		t.Fatalf("expected more tokens, got %d", len(vector.Indices))
	}
}

func TestRRFFusion(t *testing.T) {
	dense := []SearchResult{
		{ID: "a", Score: 0.9},
		{ID: "b", Score: 0.8},
		{ID: "c", Score: 0.7},
	}
	sparse := []SearchResult{
		{ID: "b", Score: 0.95},
		{ID: "d", Score: 0.6},
		{ID: "a", Score: 0.55},
	}

	merged := rrfFusion(dense, sparse, 4)
	if len(merged) < 3 {
		t.Fatalf("expected merged results, got %d", len(merged))
	}
	if merged[0].ID != "a" && merged[0].ID != "b" {
		t.Fatalf("expected top1 to be a or b, got %s", merged[0].ID)
	}
	if merged[0].ID == "b" && merged[1].ID != "a" {
		t.Fatalf("expected a to rank near top, got %s", merged[1].ID)
	}
}

func TestMultiQueryDeduplication(t *testing.T) {
	var calls int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/points/search") {
			call := atomic.AddInt32(&calls, 1)
			var resp qdrantSearchResponse
			if call == 1 {
				resp.Result = []struct {
					ID      any            `json:"id"`
					Score   float64        `json:"score"`
					Payload map[string]any `json:"payload"`
				}{
					{
						ID:    "chunk-1",
						Score: 0.9,
						Payload: map[string]any{
							"chunk_id":          "chunk-1",
							"text":              "片段一",
							"document_id":       "doc-1",
							"document_name":     "Doc 1",
							"knowledge_base_id": "kb-1",
							"chunk_index":       0,
						},
					},
					{
						ID:    "chunk-2",
						Score: 0.8,
						Payload: map[string]any{
							"chunk_id":          "chunk-2",
							"text":              "片段二",
							"document_id":       "doc-2",
							"document_name":     "Doc 2",
							"knowledge_base_id": "kb-1",
							"chunk_index":       1,
						},
					},
				}
			} else {
				resp.Result = []struct {
					ID      any            `json:"id"`
					Score   float64        `json:"score"`
					Payload map[string]any `json:"payload"`
				}{
					{
						ID:    "chunk-1",
						Score: 0.95,
						Payload: map[string]any{
							"chunk_id":          "chunk-1",
							"text":              "片段一",
							"document_id":       "doc-1",
							"document_name":     "Doc 1",
							"knowledge_base_id": "kb-1",
							"chunk_index":       0,
						},
					},
					{
						ID:    "chunk-3",
						Score: 0.7,
						Payload: map[string]any{
							"chunk_id":          "chunk-3",
							"text":              "片段三",
							"document_id":       "doc-3",
							"document_name":     "Doc 3",
							"knowledge_base_id": "kb-1",
							"chunk_index":       2,
						},
					},
				}
			}
			if err := json.NewEncoder(w).Encode(resp); err != nil {
				t.Fatalf("encode qdrant response: %v", err)
			}
			return
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(server.Close)

	rag := NewRagService()
	qdrant := NewQdrantService(model.ServerConfig{
		QdrantURL:        server.URL,
		QdrantVectorSize: 4,
		QdrantDistance:   "cosine",
	})
	rag.SetQdrantService(qdrant)

	results, err := rag.MultiQuerySearch(
		t.Context(),
		[]string{"  Foo", "foo", "Bar"},
		"kb-1",
		3,
		0,
		model.EmbeddingModelConfig{Provider: "openai"},
	)
	if err != nil {
		t.Fatalf("multi query search: %v", err)
	}
	if len(results) != 3 {
		t.Fatalf("expected 3 unique chunks, got %d", len(results))
	}
	if results[0].ID != "chunk-1" {
		t.Fatalf("expected top chunk-1, got %s", results[0].ID)
	}
	if results[0].Score != 0.95 {
		t.Fatalf("expected chunk-1 score 0.95, got %v", results[0].Score)
	}
}

func TestLLMQueryRewriterParsing(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/chat/completions") {
			resp := openAIChatResponse{
				ID:      "chatcmpl-test",
				Object:  "chat.completion",
				Created: 123,
				Model:   "test-model",
				Choices: []model.ChatCompletionChoice{
					{
						Index: 0,
						Message: model.ChatMessage{
							Role:    "assistant",
							Content: "- 查询一\n• 查询二\n\n* 查询三\n- 查询一",
						},
					},
				},
			}
			if err := json.NewEncoder(w).Encode(resp); err != nil {
				t.Fatalf("encode chat response: %v", err)
			}
			return
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(server.Close)

	llm := &LLMService{client: server.Client()}
	rewriter := NewLLMQueryRewriter(llm, 3)
	rewriter.SetChatConfigProvider(func() model.ChatModelConfig {
		return model.ChatModelConfig{
			Provider: "openai",
			BaseURL:  server.URL,
			Model:    "test-model",
		}
	})

	result, err := rewriter.Rewrite(t.Context(), "原始问题", []string{"上下文1", "上下文2"})
	if err != nil {
		t.Fatalf("rewrite query: %v", err)
	}
	if len(result.RewrittenQueries) != 4 {
		t.Fatalf("expected 4 queries, got %d", len(result.RewrittenQueries))
	}
	assertContains := func(target string) {
		for _, item := range result.RewrittenQueries {
			if item == target {
				return
			}
		}
		t.Fatalf("expected queries to contain %s", target)
	}
	assertContains("查询一")
	assertContains("查询二")
	assertContains("查询三")
	assertContains("原始问题")
}

func writeTestDOCX(path string, files map[string]string) error {
	file, err := os.Create(path)
	if err != nil {
		return err
	}
	defer file.Close()

	zipWriter := zip.NewWriter(file)
	for name, content := range files {
		entry, err := zipWriter.Create(name)
		if err != nil {
			_ = zipWriter.Close()
			return err
		}
		if _, err := entry.Write([]byte(content)); err != nil {
			_ = zipWriter.Close()
			return err
		}
	}
	return zipWriter.Close()
}

func TestExtractDocumentContentFromMarkdownWithImages(t *testing.T) {
	dir := t.TempDir()
	imagePath := filepath.Join(dir, "step.png")
	if err := os.WriteFile(imagePath, tinyPNG(), 0o644); err != nil {
		t.Fatalf("write image: %v", err)
	}
	markdownPath := filepath.Join(dir, "guide.md")
	markdown := `# 控制台处理

请先点击保存按钮，再检查权限。

![保存按钮截图](step.png)

如果仍失败，请联系管理员。`
	if err := os.WriteFile(markdownPath, []byte(markdown), 0o644); err != nil {
		t.Fatalf("write markdown: %v", err)
	}

	content, err := util.ExtractDocumentContent(markdownPath)
	if err != nil {
		t.Fatalf("extract document content: %v", err)
	}
	if len(content.Images) != 1 {
		t.Fatalf("expected 1 image asset, got %d", len(content.Images))
	}
	image := content.Images[0]
	if !image.Included {
		t.Fatalf("expected markdown image to be included in retrieval")
	}
	if image.Classification == model.DocumentImageDecorative {
		t.Fatalf("expected meaningful classification, got %s", image.Classification)
	}
	retrievalText := util.BuildDocumentRetrievalText(content)
	if !strings.Contains(retrievalText, "图片ID:") {
		t.Fatalf("expected retrieval text to contain image id, got %q", retrievalText)
	}
	if !strings.Contains(retrievalText, "保存按钮截图") {
		t.Fatalf("expected retrieval text to include image alt text, got %q", retrievalText)
	}
}

func TestBuildDocumentRetrievalTextIncludesImageKnowledge(t *testing.T) {
	content := model.DocumentContent{
		Text: "主文档正文。",
		Images: []model.DocumentImageAsset{{
			ID:             "img-test-1",
			Included:       true,
			Classification: model.DocumentImageFlowDiagram,
			Description:    "图片类型：流程图/架构图；图文上下文：登录后进入审批流程。",
			RetrievalText:  "图片ID: img-test-1\n图片类型: 流程图/架构图\n图片说明: 登录后进入审批流程。",
		}},
	}
	joined := util.BuildDocumentRetrievalText(content)
	if !strings.Contains(joined, "主文档正文") {
		t.Fatalf("expected joined retrieval text to keep original content, got %q", joined)
	}
	if !strings.Contains(joined, "img-test-1") || !strings.Contains(joined, "审批流程") {
		t.Fatalf("expected joined retrieval text to contain image knowledge, got %q", joined)
	}
}

func TestAppServiceIndexImageDocument(t *testing.T) {
	dir := t.TempDir()
	imagePath := filepath.Join(dir, "dashboard.png")
	if err := os.WriteFile(imagePath, tinyPNG(), 0o644); err != nil {
		t.Fatalf("write image: %v", err)
	}

	service := NewAppService(nil, NewAppStateStore(""), nil, model.ServerConfig{UploadDir: dir})
	knowledgeBases := service.ListKnowledgeBases()
	if len(knowledgeBases) == 0 {
		t.Fatal("expected default knowledge base")
	}

	document := model.Document{
		ID:              "doc-image",
		KnowledgeBaseID: knowledgeBases[0].ID,
		Name:            "dashboard.png",
		Path:            imagePath,
		Status:          "processing",
	}
	indexed, err := service.IndexDocument(document)
	if err != nil {
		t.Fatalf("index image document: %v", err)
	}
	if indexed.ImageCount != 1 {
		t.Fatalf("expected image count 1, got %d", indexed.ImageCount)
	}
	if len(indexed.Images) != 1 {
		t.Fatalf("expected one indexed image summary, got %d", len(indexed.Images))
	}
	if strings.TrimSpace(indexed.ContentPreview) == "" {
		t.Fatal("expected content preview for image document")
	}
	if indexed.Status != "indexed" && indexed.Status != "ready" {
		t.Fatalf("expected indexed or ready status, got %s", indexed.Status)
	}
}

func tinyPNG() []byte {
	data, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0VcAAAAASUVORK5CYII=")
	if err != nil {
		panic(err)
	}
	return data
}

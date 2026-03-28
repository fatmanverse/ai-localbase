package handler

import (
	"context"
	"fmt"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"ai-localbase/internal/model"
	"ai-localbase/internal/service"
	"ai-localbase/internal/util"

	"github.com/gin-gonic/gin"
)

type AppHandler struct {
	serverConfig       model.ServerConfig
	appService         *service.AppService
	llmService         *service.LLMService
	serviceDeskService *service.ServiceDeskService
	uploadTaskService  *service.UploadTaskService
}

func NewAppHandler(serverConfig model.ServerConfig, appService *service.AppService, llmService *service.LLMService, serviceDeskService *service.ServiceDeskService, uploadTaskServices ...*service.UploadTaskService) *AppHandler {
	var uploadTaskService *service.UploadTaskService
	if len(uploadTaskServices) > 0 {
		uploadTaskService = uploadTaskServices[0]
	}

	return &AppHandler{
		serverConfig:       serverConfig,
		appService:         appService,
		llmService:         llmService,
		serviceDeskService: serviceDeskService,
		uploadTaskService:  uploadTaskService,
	}
}

func (h *AppHandler) Root(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"name":    "AI LocalBase Backend",
		"version": "v0.4.8",
		"status":  "running",
	})
}

func (h *AppHandler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, model.HealthResponse{
		Status: "ok",
		Name:   "ai-localbase-backend",
		Config: h.appService.GetHealthConfigMap(h.serverConfig),
	})
}

func (h *AppHandler) GetConfig(c *gin.Context) {
	c.JSON(http.StatusOK, h.appService.GetConfig())
}

func (h *AppHandler) ListConversations(c *gin.Context) {
	items, err := h.appService.ListConversations()
	if err != nil {
		writeError(c, http.StatusInternalServerError, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (h *AppHandler) GetConversation(c *gin.Context) {
	conversation, err := h.appService.GetConversation(c.Param("id"))
	if err != nil {
		writeError(c, http.StatusInternalServerError, err.Error())
		return
	}
	if conversation == nil {
		writeError(c, http.StatusNotFound, "conversation not found")
		return
	}
	c.JSON(http.StatusOK, conversation)
}

func (h *AppHandler) SaveConversation(c *gin.Context) {
	var req model.SaveConversationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, http.StatusBadRequest, "invalid conversation request body")
		return
	}
	if strings.TrimSpace(req.ID) == "" {
		req.ID = c.Param("id")
	}
	conversation, err := h.appService.SaveConversation(req)
	if err != nil {
		writeError(c, http.StatusBadRequest, err.Error())
		return
	}
	c.JSON(http.StatusOK, conversation)
}

func (h *AppHandler) SubmitConversationFeedback(c *gin.Context) {
	var req model.ConversationMessageFeedbackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, http.StatusBadRequest, "invalid conversation feedback request body")
		return
	}
	if strings.TrimSpace(req.ConversationID) == "" {
		req.ConversationID = c.Param("id")
	}
	if strings.TrimSpace(req.MessageID) == "" {
		req.MessageID = c.Param("messageId")
	}
	result, err := h.appService.SubmitConversationFeedback(req)
	if err != nil {
		writeError(c, http.StatusBadRequest, err.Error())
		return
	}
	c.JSON(http.StatusCreated, result)
}

func (h *AppHandler) DeleteConversation(c *gin.Context) {
	if err := h.appService.DeleteConversation(c.Param("id")); err != nil {
		writeError(c, http.StatusInternalServerError, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "conversation deleted", "id": c.Param("id")})
}

func (h *AppHandler) UpdateConfig(c *gin.Context) {
	var req model.ConfigUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, http.StatusBadRequest, "invalid config request body")
		return
	}

	cfg, err := h.appService.UpdateConfig(req)
	if err != nil {
		writeError(c, http.StatusBadRequest, err.Error())
		return
	}

	c.JSON(http.StatusOK, cfg)
}

func (h *AppHandler) ListKnowledgeBases(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"items": h.appService.ListKnowledgeBases()})
}

func (h *AppHandler) CreateKnowledgeBase(c *gin.Context) {
	var req model.KnowledgeBaseInput
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, http.StatusBadRequest, "invalid knowledge base request body")
		return
	}

	knowledgeBase, err := h.appService.CreateKnowledgeBase(req)
	if err != nil {
		writeError(c, http.StatusBadRequest, err.Error())
		return
	}

	c.JSON(http.StatusCreated, knowledgeBase)
}

func (h *AppHandler) DeleteKnowledgeBase(c *gin.Context) {
	remaining, err := h.appService.DeleteKnowledgeBase(c.Param("id"))
	if err != nil {
		writeError(c, http.StatusNotFound, err.Error())
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":   "knowledge base deleted",
		"remaining": remaining,
	})
}

func (h *AppHandler) ListDocuments(c *gin.Context) {
	items, err := h.appService.GetKnowledgeBaseDocuments(c.Param("id"))
	if err != nil {
		writeError(c, http.StatusNotFound, err.Error())
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"knowledgeBaseId": c.Param("id"),
		"items":           items,
	})
}

func (h *AppHandler) UploadToKnowledgeBase(c *gin.Context) {
	h.handleUpload(c, c.Param("id"))
}

func (h *AppHandler) StartAsyncUploadToKnowledgeBase(c *gin.Context) {
	h.handleAsyncUpload(c, c.Param("id"))
}

func (h *AppHandler) GetUploadTask(c *gin.Context) {
	if h.uploadTaskService == nil {
		writeError(c, http.StatusServiceUnavailable, "upload task service unavailable")
		return
	}

	knowledgeBaseID := strings.TrimSpace(c.Param("id"))
	taskID := strings.TrimSpace(c.Param("taskId"))
	task, ok := h.uploadTaskService.GetTask(taskID)
	if !ok || task.KnowledgeBaseID != knowledgeBaseID {
		writeError(c, http.StatusNotFound, "upload task not found")
		return
	}
	c.JSON(http.StatusOK, task)
}

func (h *AppHandler) CancelUploadTask(c *gin.Context) {
	if h.uploadTaskService == nil {
		writeError(c, http.StatusServiceUnavailable, "upload task service unavailable")
		return
	}

	knowledgeBaseID := strings.TrimSpace(c.Param("id"))
	taskID := strings.TrimSpace(c.Param("taskId"))
	task, ok := h.uploadTaskService.GetTask(taskID)
	if !ok || task.KnowledgeBaseID != knowledgeBaseID {
		writeError(c, http.StatusNotFound, "upload task not found")
		return
	}
	updated, err := h.uploadTaskService.CancelTask(taskID)
	if err != nil {
		writeError(c, http.StatusBadRequest, err.Error())
		return
	}
	c.JSON(http.StatusOK, updated)
}

func (h *AppHandler) Upload(c *gin.Context) {
	h.handleUpload(c, c.PostForm("knowledgeBaseId"))
}

func (h *AppHandler) ReindexKnowledgeBase(c *gin.Context) {
	knowledgeBase, err := h.appService.ReindexKnowledgeBase(c.Param("id"))
	if err != nil {
		writeError(c, http.StatusBadRequest, err.Error())
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":       "knowledge base reindexed",
		"knowledgeBase": knowledgeBase,
	})
}

func (h *AppHandler) ReindexDocument(c *gin.Context) {
	document, err := h.appService.ReindexDocument(c.Param("id"), c.Param("documentId"))
	if err != nil {
		writeError(c, http.StatusBadRequest, err.Error())
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":         "document reindexed",
		"knowledgeBaseId": c.Param("id"),
		"document":        document,
	})
}

func (h *AppHandler) DeleteDocument(c *gin.Context) {
	removedDocument, err := h.appService.DeleteDocument(c.Param("id"), c.Param("documentId"))
	if err != nil {
		writeError(c, http.StatusNotFound, err.Error())
		return
	}

	_ = os.Remove(removedDocument.Path)
	_ = util.RemoveDocumentArtifacts(removedDocument.Path)

	c.JSON(http.StatusOK, gin.H{
		"message":         "document deleted",
		"knowledgeBaseId": c.Param("id"),
		"documentId":      c.Param("documentId"),
	})
}

func (h *AppHandler) ChatCompletions(c *gin.Context) {
	var req model.ChatCompletionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, http.StatusBadRequest, "invalid chat request body")
		return
	}

	preparedReq, sources, relatedImages, err := h.prepareChatRequest(req)
	if err != nil {
		writeError(c, http.StatusBadRequest, err.Error())
		return
	}

	response, err := h.llmService.Chat(preparedReq)
	if err != nil {
		writeError(c, http.StatusBadGateway, err.Error())
		return
	}

	if response.Metadata == nil {
		response.Metadata = map[string]any{}
	}
	response.Metadata["sources"] = sources
	response.Metadata["relatedImages"] = relatedImages
	response.Metadata["knowledgeBaseId"] = req.KnowledgeBaseID
	response.Metadata["documentId"] = req.DocumentID

	if assistantMessage := firstAssistantChoice(response); assistantMessage != nil {
		_, saveErr := h.appService.SaveConversation(model.SaveConversationRequest{
			ID:              req.ConversationID,
			Title:           "",
			KnowledgeBaseID: req.KnowledgeBaseID,
			DocumentID:      req.DocumentID,
			Messages:        buildStoredConversationMessages(req.Messages, assistantMessage.Content, response.Metadata),
		})
		if saveErr != nil {
			writeError(c, http.StatusInternalServerError, saveErr.Error())
			return
		}
	}

	c.JSON(http.StatusOK, response)
}

func (h *AppHandler) ChatCompletionsStream(c *gin.Context) {
	var req model.ChatCompletionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, http.StatusBadRequest, "invalid chat request body")
		return
	}

	preparedReq, sources, relatedImages, err := h.prepareChatRequest(req)
	if err != nil {
		writeError(c, http.StatusBadRequest, err.Error())
		return
	}

	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no")
	c.Status(http.StatusOK)

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		writeError(c, http.StatusInternalServerError, "streaming is not supported")
		return
	}

	initialMeta := gin.H{
		"sources":         sources,
		"relatedImages":   relatedImages,
		"knowledgeBaseId": req.KnowledgeBaseID,
		"documentId":      req.DocumentID,
	}
	c.SSEvent("meta", gin.H{"metadata": initialMeta})
	flusher.Flush()

	assistantContent := strings.Builder{}
	streamErr := h.llmService.StreamChat(preparedReq, func(chunk string) error {
		assistantContent.WriteString(chunk)
		c.SSEvent("chunk", gin.H{"content": chunk})
		flusher.Flush()
		return nil
	})
	if streamErr != nil {
		c.SSEvent("error", gin.H{"error": streamErr.Error()})
		flusher.Flush()
		return
	}

	fullAssistantContent := assistantContent.String()
	_, saveErr := h.appService.SaveConversation(model.SaveConversationRequest{
		ID:              req.ConversationID,
		Title:           "",
		KnowledgeBaseID: req.KnowledgeBaseID,
		DocumentID:      req.DocumentID,
		Messages:        buildStoredConversationMessages(req.Messages, fullAssistantContent, initialMeta),
	})
	if saveErr != nil {
		c.SSEvent("error", gin.H{"error": saveErr.Error()})
		flusher.Flush()
		return
	}

	c.SSEvent("done", gin.H{"content": fullAssistantContent, "metadata": initialMeta})
	flusher.Flush()
}

func (h *AppHandler) prepareChatRequest(req model.ChatCompletionRequest) (model.ChatCompletionRequest, []map[string]string, []model.ServiceDeskImageReference, error) {
	if len(req.Messages) == 0 {
		return model.ChatCompletionRequest{}, nil, nil, fmt.Errorf("messages cannot be empty")
	}

	retrievalContext, retrievalSources, err := h.appService.BuildRetrievalContext(req)
	if err != nil {
		return model.ChatCompletionRequest{}, nil, nil, err
	}

	contextSummary, sources, err := h.appService.BuildChatContext(req)
	if err != nil {
		return model.ChatCompletionRequest{}, nil, nil, err
	}

	allSources := append(retrievalSources, sources...)
	contextParts := make([]string, 0, 2)
	if strings.TrimSpace(retrievalContext) != "" {
		contextParts = append(contextParts, "检索命中的文档片段：\n"+retrievalContext)
	}
	if strings.TrimSpace(contextSummary) != "" {
		contextParts = append(contextParts, contextSummary)
	}

	preparedReq := req
	preparedReq.Config = h.appService.CurrentChatConfig()
	preparedReq.Embedding = h.appService.CurrentEmbeddingConfig()
	preparedReq.Config.ContextMessageLimit = h.appService.ContextMessageLimit()
	preparedReq.Messages = h.appService.TrimChatMessages(req.Messages)
	latestQuestion := ""
	for index := len(req.Messages) - 1; index >= 0; index-- {
		if strings.EqualFold(strings.TrimSpace(req.Messages[index].Role), "user") {
			latestQuestion = strings.TrimSpace(req.Messages[index].Content)
			break
		}
	}
	isDiagramRequest := strings.Contains(latestQuestion, "流程图") || strings.Contains(latestQuestion, "架构图") || strings.Contains(latestQuestion, "状态图") || strings.Contains(latestQuestion, "Mermaid")
	if len(contextParts) > 0 {
		promptSections := []string{
			"你是 AI LocalBase 知识库助手。请严格遵守以下规范输出 Markdown 格式的回答。",
			"",
			"## Markdown 格式规范（必须严格执行）",
			"",
			"### 标题规则",
			"- 标题符号（#）与标题文字之间必须有一个空格，例如：## 核心观点",
			"- 标题下方必须空一行再写正文，正文与下一段之间也必须空一行",
			"- 禁止将数字序号与标题符号混用，正确写法是 ### 标题",
			"- 全文只用一个 ## 作为主标题，子章节一律用 ###，细分内容用 ####",
			"- 标题文字简洁（10字以内），不加标点符号",
			"",
			"### 内容规则",
			"- 关键词、核心数据、重要结论用 **加粗** 标注",
			"- 并列事项必须用无序列表（每条以 - 开头）；有先后顺序的必须用有序列表（1. 2. 3.）；禁止把多个要点写成一行",
			"- 每个列表项单独一行，列表前后各留一空行，保证渲染换行",
			"- 引用原文关键句时使用 blockquote，格式为：> 原文内容（> 后加空格）",
			"- 有多个维度对比时使用表格",
		}

		if isDiagramRequest {
			promptSections = append(promptSections,
				"",
				"### Mermaid 专用输出规则（仅在用户明确要求流程图/架构图时生效）",
				"- 这次回答只允许输出两部分：1）一句简短标题；2）一个 Mermaid 代码块；不要输出额外解释段落、补充建议、表格、列表",
				"- 必须使用标准 Mermaid 围栏，严格格式如下：第一行单独写 ```mermaid，第二行单独写 graph TD / graph LR / flowchart TD / flowchart LR，最后一行单独写 ```",
				"- 每条 Mermaid 语句单独一行：每个节点定义、每条连线、每个 classDef、每个 style、每个 subgraph、每个 end 都必须单独一行",
				"- subgraph 必须使用标准结构：subgraph 名称 -> 若干语句 -> end",
				"- 禁止输出 mermaidgraphTD、```mermaidgraphTD、endsubgraph、classDefxxxfill:、A-->BB-->C 这类压缩格式",
				"- 禁止在 Mermaid 代码块中输出中文说明、Markdown 标题、HTML 标签、span/style 内联样式、emoji、补充建议",
				"- 如果不能保证 Mermaid 语法完全正确，就不要输出 Mermaid，改为普通 Markdown 有序列表描述流程",
			)
		} else {
			promptSections = append(promptSections,
				"",
				"### 结构模板（总结类问题必须遵循）",
				"",
				"## 主题名称",
				"",
				"### 子主题一",
				"",
				"- **关键词**：说明",
				"- **关键词**：说明",
				"",
				"### 子主题二",
				"",
				"- **关键词**：说明",
				"",
				"> 用一句话概括最重要的发现或观点。",
			)
		}

		promptSections = append(promptSections,
			"",
			"## 内容规范",
			"- 只基于以下上下文作答；信息不足时明确说明",
			"- 不要重复用户的问题，直接输出结构化内容",
			"- 回答长度适中，每个子章节 2 至 4 条要点即可，保持空行分隔，禁止连续写成一行",
			"- 若上下文包含图片 OCR、图片说明、流程图、截图或表格图信息，必须综合这些图片知识作答，不能只按纯文本理解",
			"- 不得自行声称系统只支持文本检索、无法展示图片、文档完全没有图片，除非上下文已明确说明当前检索结果未包含可用图片知识",
			"- 如果当前检索结果没有可用图片信息，应表述为“当前检索结果未包含可直接利用的图片知识”，不要上升为系统能力限制",
			"",
			"## 上下文",
			strings.Join(contextParts, "\n\n"),
		)

		systemPrompt := strings.Join(promptSections, "\n")
		preparedReq.Messages = append([]model.ChatMessage{{
			Role:    "system",
			Content: systemPrompt,
		}}, preparedReq.Messages...)
	}

	return preparedReq, allSources, h.appService.ResolveRelatedImages(allSources), nil
}

func (h *AppHandler) handleUpload(c *gin.Context, candidateKnowledgeBaseID string) {
	document, knowledgeBaseID, destination, err := h.prepareUploadedDocument(c, candidateKnowledgeBaseID)
	if err != nil {
		writeError(c, http.StatusBadRequest, err.Error())
		return
	}

	uploaded, err := h.appService.IndexDocument(document)
	if err != nil {
		_ = os.Remove(destination)
		_ = util.RemoveDocumentArtifacts(destination)
		writeError(c, http.StatusBadGateway, err.Error())
		return
	}

	c.JSON(http.StatusOK,
		model.UploadResponse{
			Message:       "file uploaded successfully",
			KnowledgeBase: knowledgeBaseID,
			Uploaded:      uploaded,
		})
}

func (h *AppHandler) handleAsyncUpload(c *gin.Context, candidateKnowledgeBaseID string) {
	if h.uploadTaskService == nil {
		writeError(c, http.StatusServiceUnavailable, "upload task service unavailable")
		return
	}

	document, _, destination, err := h.prepareUploadedDocument(c, candidateKnowledgeBaseID)
	if err != nil {
		writeError(c, http.StatusBadRequest, err.Error())
		return
	}

	task := h.uploadTaskService.CreateTask(document)
	if err := h.uploadTaskService.StartTask(task.ID, func(ctx context.Context, progress service.UploadTaskProgressCallback) (model.Document, error) {
		uploaded, indexErr := h.appService.IndexDocumentWithProgress(ctx, document, progress)
		if indexErr != nil {
			_ = os.Remove(destination)
			_ = util.RemoveDocumentArtifacts(destination)
			return model.Document{}, indexErr
		}
		return uploaded, nil
	}); err != nil {
		_ = os.Remove(destination)
		_ = util.RemoveDocumentArtifacts(destination)
		writeError(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.JSON(http.StatusAccepted, task)
}

func (h *AppHandler) prepareUploadedDocument(c *gin.Context, candidateKnowledgeBaseID string) (model.Document, string, string, error) {
	file, err := c.FormFile("file")
	if err != nil {
		return model.Document{}, "", "", fmt.Errorf("missing file field 'file'")
	}

	if err := validateUploadFile(file); err != nil {
		return model.Document{}, "", "", err
	}

	knowledgeBaseID, err := h.appService.ResolveKnowledgeBaseID(candidateKnowledgeBaseID)
	if err != nil {
		return model.Document{}, "", "", err
	}

	storedName := fmt.Sprintf("%d_%s", util.NowUnixNano(), util.SanitizeFilename(file.Filename))
	destination := filepath.Join(h.serverConfig.UploadDir, storedName)
	if err := c.SaveUploadedFile(file, destination); err != nil {
		return model.Document{}, "", "", fmt.Errorf("failed to save uploaded file")
	}

	document := model.Document{
		ID:              util.NextID("doc"),
		KnowledgeBaseID: knowledgeBaseID,
		Name:            file.Filename,
		Size:            file.Size,
		SizeLabel:       util.FormatFileSize(file.Size),
		UploadedAt:      util.NowRFC3339(),
		Status:          "processing",
		Path:            destination,
		ContentPreview:  "",
	}
	return document, knowledgeBaseID, destination, nil
}

func validateUploadFile(file *multipart.FileHeader) error {
	ext := strings.ToLower(filepath.Ext(file.Filename))
	if !util.IsSupportedUploadExtension(ext) {
		return errUnsupportedFileType(ext)
	}

	return nil
}

func errUnsupportedFileType(ext string) error {
	allowed := ".txt, .md, .pdf, .docx, .html, .htm, .png, .jpg, .jpeg, .webp, .gif"
	if ext == "" {
		return fmt.Errorf("unsupported file type: missing extension, allowed types are %s", allowed)
	}

	return &fileTypeError{Extension: ext}
}

type fileTypeError struct {
	Extension string
}

func (e *fileTypeError) Error() string {
	return "unsupported file type: " + e.Extension + ", allowed types are .txt, .md, .pdf, .docx, .html, .htm, .png, .jpg, .jpeg, .webp, .gif"
}

func (h *AppHandler) ServeAsset(c *gin.Context) {
	relativePath := strings.TrimPrefix(c.Param("path"), "/")
	if strings.TrimSpace(relativePath) == "" {
		c.Status(http.StatusNotFound)
		return
	}
	cleaned := filepath.Clean(relativePath)
	if cleaned == "." || cleaned == ".." || strings.HasPrefix(cleaned, "../") {
		c.Status(http.StatusForbidden)
		return
	}
	fullPath := filepath.Join(h.serverConfig.UploadDir, cleaned)
	rootAbs, err := filepath.Abs(h.serverConfig.UploadDir)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	fileAbs, err := filepath.Abs(fullPath)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	if fileAbs != rootAbs && !strings.HasPrefix(fileAbs, rootAbs+string(os.PathSeparator)) {
		c.Status(http.StatusForbidden)
		return
	}
	if !util.IsImageFilePath(fileAbs) {
		c.Status(http.StatusNotFound)
		return
	}
	if _, err := os.Stat(fileAbs); err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	c.File(fileAbs)
}

func buildStoredConversationMessages(messages []model.ChatMessage, assistantContent string, metadata map[string]any) []model.StoredChatMessage {
	stored := make([]model.StoredChatMessage, 0, len(messages)+1)
	for index, message := range messages {
		stored = append(stored, model.StoredChatMessage{
			ID:        fmt.Sprintf("msg_%d_%d", time.Now().UnixNano(), index),
			Role:      strings.TrimSpace(message.Role),
			Content:   message.Content,
			CreatedAt: time.Now().UTC().Format(time.RFC3339),
		})
	}
	assistantMessage := model.StoredChatMessage{
		ID:        fmt.Sprintf("msg_%d_assistant", time.Now().UnixNano()),
		Role:      "assistant",
		Content:   assistantContent,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	}
	if len(metadata) > 0 {
		assistantMessage.Metadata = metadata
	}
	stored = append(stored, assistantMessage)
	return stored
}

func firstAssistantChoice(response model.ChatCompletionResponse) *model.ChatMessage {
	for _, choice := range response.Choices {
		if strings.EqualFold(strings.TrimSpace(choice.Message.Role), "assistant") {
			message := choice.Message
			return &message
		}
	}
	return nil
}

func writeError(c *gin.Context, statusCode int, message string) {
	c.JSON(statusCode, model.APIError{Error: message})
}

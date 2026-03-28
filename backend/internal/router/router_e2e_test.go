package router

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"ai-localbase/internal/handler"
	"ai-localbase/internal/model"
	"ai-localbase/internal/service"
)

type qdrantCollectionState struct {
	points []service.QdrantPoint
}

type qdrantTestServer struct {
	mu          sync.Mutex
	collections map[string]*qdrantCollectionState
}

type embeddingTestResponse struct {
	Data []struct {
		Embedding []float64 `json:"embedding"`
		Index     int       `json:"index"`
	} `json:"data"`
}

type chatTestResponse struct {
	ID      string `json:"id"`
	Object  string `json:"object"`
	Created int64  `json:"created"`
	Model   string `json:"model"`
	Choices []struct {
		Index   int `json:"index"`
		Message struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

func TestRouterConfigEndpoints(t *testing.T) {
	engine, _, cleanup := newTestRouter(t)
	defer cleanup()

	updatePayload := map[string]any{
		"chat": map[string]any{
			"provider":    "ollama",
			"baseUrl":     "http://chat.local/v1",
			"model":       "llama3.2",
			"apiKey":      "",
			"temperature": 0.4,
		},
		"embedding": map[string]any{
			"provider": "openai-compatible",
			"baseUrl":  "http://embed.local/v1",
			"model":    "bge-m3",
			"apiKey":   "embed-key",
		},
	}

	resp := performJSONRequest(t, engine, http.MethodPut, "/api/config", updatePayload)
	if resp.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d, body=%s", resp.Code, resp.Body.String())
	}

	var updated model.AppConfig
	decodeJSONResponse(t, resp.Body.Bytes(), &updated)
	if updated.Chat.BaseURL != "http://chat.local/v1" {
		t.Fatalf("expected chat baseUrl to be updated, got %s", updated.Chat.BaseURL)
	}
	if updated.Embedding.Model != "bge-m3" {
		t.Fatalf("expected embedding model to be updated, got %s", updated.Embedding.Model)
	}

	resp = performRequest(t, engine, http.MethodGet, "/api/config", nil, "")
	if resp.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d, body=%s", resp.Code, resp.Body.String())
	}

	var fetched model.AppConfig
	decodeJSONResponse(t, resp.Body.Bytes(), &fetched)
	if fetched.Chat.Temperature != 0.4 {
		t.Fatalf("expected persisted chat temperature 0.4, got %v", fetched.Chat.Temperature)
	}
	if fetched.Embedding.APIKey != "embed-key" {
		t.Fatalf("expected persisted embedding apiKey, got %s", fetched.Embedding.APIKey)
	}
}

func TestRouterUploadRetrievalAndChatE2E(t *testing.T) {
	engine, modelBaseURL, cleanup := newTestRouter(t)
	defer cleanup()

	listResp := performRequest(t, engine, http.MethodGet, "/api/knowledge-bases", nil, "")
	if listResp.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d, body=%s", listResp.Code, listResp.Body.String())
	}

	var kbList struct {
		Items []model.KnowledgeBase `json:"items"`
	}
	decodeJSONResponse(t, listResp.Body.Bytes(), &kbList)
	if len(kbList.Items) == 0 {
		t.Fatal("expected default knowledge base")
	}
	knowledgeBaseID := kbList.Items[0].ID

	documentContent := `# Redis 核心特点

Redis 是一个开源的内存数据结构存储系统，可用作数据库、缓存和消息代理。

## 主要特性

Redis 支持字符串、哈希、列表、集合、有序集合等多种数据结构。
Redis 具有极高的读写性能，单机每秒可处理数十万次请求。
Redis 支持数据持久化，可将内存中的数据保存到磁盘，重启后恢复。
Redis 支持主从复制，可实现读写分离与高可用部署。
Redis 提供发布订阅功能，支持消息传递模式。
Redis 支持 Lua 脚本，可实现原子性复杂操作。
Redis 内置事务支持，通过 MULTI/EXEC 命令实现。
Redis 支持过期时间设置，适合用作会话缓存或临时数据存储。

## 常见应用场景

缓存加速：将热点数据存入 Redis，减少数据库压力，提升响应速度。
计数器：利用 INCR 命令实现高并发下的精确计数，如页面浏览量统计。
排行榜：使用有序集合实现实时排行榜功能，支持按分数快速查询。
分布式锁：通过 SET NX 命令实现分布式锁，保证多节点下的互斥访问。
消息队列：使用列表结构实现简单的消息队列，支持生产者消费者模式。
会话管理：将用户会话数据存入 Redis，实现跨服务器的会话共享。
`
	uploadResp := performMultipartUpload(
		t,
		engine,
		http.MethodPost,
		fmt.Sprintf("/api/knowledge-bases/%s/documents", knowledgeBaseID),
		"redis-notes.md",
		documentContent,
	)
	if uploadResp.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d, body=%s", uploadResp.Code, uploadResp.Body.String())
	}

	var uploadResult model.UploadResponse
	decodeJSONResponse(t, uploadResp.Body.Bytes(), &uploadResult)
	if uploadResult.Uploaded.Status != "indexed" {
		t.Fatalf("expected uploaded document status indexed, got %s", uploadResult.Uploaded.Status)
	}
	if !strings.Contains(uploadResult.Uploaded.ContentPreview, "Redis") {
		t.Fatalf("expected content preview to contain indexed text, got %q", uploadResult.Uploaded.ContentPreview)
	}

	documentReindexResp := performRequest(
		t,
		engine,
		http.MethodPost,
		fmt.Sprintf("/api/knowledge-bases/%s/documents/%s/reindex", knowledgeBaseID, uploadResult.Uploaded.ID),
		nil,
		"",
	)
	if documentReindexResp.Code != http.StatusOK {
		t.Fatalf("expected document reindex status 200, got %d, body=%s", documentReindexResp.Code, documentReindexResp.Body.String())
	}
	var documentReindexResult struct {
		Document model.Document `json:"document"`
	}
	decodeJSONResponse(t, documentReindexResp.Body.Bytes(), &documentReindexResult)
	if documentReindexResult.Document.ID != uploadResult.Uploaded.ID {
		t.Fatalf("expected reindexed document id %s, got %s", uploadResult.Uploaded.ID, documentReindexResult.Document.ID)
	}
	if documentReindexResult.Document.Status != "indexed" {
		t.Fatalf("expected document status indexed after document reindex, got %s", documentReindexResult.Document.Status)
	}

	reindexResp := performRequest(
		t,
		engine,
		http.MethodPost,
		fmt.Sprintf("/api/knowledge-bases/%s/reindex", knowledgeBaseID),
		nil,
		"",
	)
	if reindexResp.Code != http.StatusOK {
		t.Fatalf("expected reindex status 200, got %d, body=%s", reindexResp.Code, reindexResp.Body.String())
	}

	var reindexResult struct {
		KnowledgeBase model.KnowledgeBase `json:"knowledgeBase"`
	}
	decodeJSONResponse(t, reindexResp.Body.Bytes(), &reindexResult)
	if len(reindexResult.KnowledgeBase.Documents) != 1 {
		t.Fatalf("expected reindexed knowledge base to keep documents, got %d", len(reindexResult.KnowledgeBase.Documents))
	}
	if reindexResult.KnowledgeBase.Documents[0].Status != "indexed" {
		t.Fatalf("expected reindexed document status indexed, got %s", reindexResult.KnowledgeBase.Documents[0].Status)
	}

	chatPayload := map[string]any{
		"conversationId":  "conv-test-1",
		"model":           "chat-test-model",
		"knowledgeBaseId": knowledgeBaseID,
		"documentId":      uploadResult.Uploaded.ID,
		"config": map[string]any{
			"provider":    "ollama",
			"baseUrl":     modelBaseURL,
			"model":       "chat-test-model",
			"apiKey":      "",
			"temperature": 0.2,
		},
		"messages": []map[string]string{{
			"role":    "user",
			"content": "请说明 Redis 的核心特点",
		}},
	}

	resp := performJSONRequest(t, engine, http.MethodPost, "/v1/chat/completions", chatPayload)
	if resp.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d, body=%s", resp.Code, resp.Body.String())
	}

	var chatResult model.ChatCompletionResponse
	decodeJSONResponse(t, resp.Body.Bytes(), &chatResult)
	if len(chatResult.Choices) == 0 {
		t.Fatal("expected chat choices")
	}
	answer := chatResult.Choices[0].Message.Content
	if !strings.Contains(answer, "Redis") {
		t.Fatalf("expected answer to mention Redis, got %q", answer)
	}

	sources, ok := chatResult.Metadata["sources"].([]any)
	if !ok || len(sources) == 0 {
		t.Fatalf("expected retrieval sources in metadata, got %#v", chatResult.Metadata["sources"])
	}
}

func TestConversationFeedbackAndConversationDetailSummary(t *testing.T) {
	engine, modelBaseURL, cleanup := newTestRouter(t)
	defer cleanup()

	listResp := performRequest(t, engine, http.MethodGet, "/api/knowledge-bases", nil, "")
	if listResp.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d, body=%s", listResp.Code, listResp.Body.String())
	}

	var kbList struct {
		Items []model.KnowledgeBase `json:"items"`
	}
	decodeJSONResponse(t, listResp.Body.Bytes(), &kbList)
	knowledgeBaseID := kbList.Items[0].ID

	chatPayload := map[string]any{
		"conversationId":  "conv-feedback-1",
		"model":           "chat-test-model",
		"knowledgeBaseId": knowledgeBaseID,
		"config": map[string]any{
			"provider":    "ollama",
			"baseUrl":     modelBaseURL,
			"model":       "chat-test-model",
			"apiKey":      "",
			"temperature": 0.2,
		},
		"embedding": map[string]any{
			"provider": "ollama",
			"baseUrl":  modelBaseURL,
			"model":    "embedding-test-model",
		},
		"messages": []map[string]string{{
			"role":    "user",
			"content": "请说明 Redis 的核心特点",
		}},
	}

	chatResp := performJSONRequest(t, engine, http.MethodPost, "/v1/chat/completions", chatPayload)
	if chatResp.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d, body=%s", chatResp.Code, chatResp.Body.String())
	}

	conversationResp := performRequest(t, engine, http.MethodGet, "/api/conversations/conv-feedback-1", nil, "")
	if conversationResp.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d, body=%s", conversationResp.Code, conversationResp.Body.String())
	}

	var conversation model.Conversation
	decodeJSONResponse(t, conversationResp.Body.Bytes(), &conversation)
	if len(conversation.Messages) != 2 {
		t.Fatalf("expected 2 conversation messages, got %d", len(conversation.Messages))
	}
	assistantMessage := conversation.Messages[1]
	if assistantMessage.ID == "" {
		t.Fatal("expected persisted assistant message id")
	}

	feedbackPayload := map[string]any{
		"feedbackType":    "like",
		"questionText":    "请说明 Redis 的核心特点",
		"answerText":      assistantMessage.Content,
		"knowledgeBaseId": knowledgeBaseID,
	}
	feedbackResp := performJSONRequest(t, engine, http.MethodPost, fmt.Sprintf("/api/conversations/%s/messages/%s/feedback", conversation.ID, assistantMessage.ID), feedbackPayload)
	if feedbackResp.Code != http.StatusCreated {
		t.Fatalf("expected status 201, got %d, body=%s", feedbackResp.Code, feedbackResp.Body.String())
	}

	var feedbackResult model.ConversationMessageFeedbackResponse
	decodeJSONResponse(t, feedbackResp.Body.Bytes(), &feedbackResult)
	if feedbackResult.Summary.LikeCount != 1 {
		t.Fatalf("expected like count 1, got %+v", feedbackResult.Summary)
	}

	conversationResp = performRequest(t, engine, http.MethodGet, "/api/conversations/conv-feedback-1", nil, "")
	if conversationResp.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d, body=%s", conversationResp.Code, conversationResp.Body.String())
	}
	decodeJSONResponse(t, conversationResp.Body.Bytes(), &conversation)
	assistantMessage = conversation.Messages[1]
	metadataMap := assistantMessage.Metadata
	feedbackSummaryRaw, ok := metadataMap["feedbackSummary"]
	if !ok {
		t.Fatalf("expected feedback summary in assistant metadata, got %#v", metadataMap)
	}
	encoded, _ := json.Marshal(feedbackSummaryRaw)
	var summary model.ServiceDeskFeedbackSummary
	decodeJSONResponse(t, encoded, &summary)
	if summary.LikeCount != 1 || summary.Status != "helpful" {
		t.Fatalf("expected helpful feedback summary, got %+v", summary)
	}
}

func newTestRouter(t *testing.T) (*http.ServeMux, string, func()) {
	t.Helper()

	uploadDir := t.TempDir()
	chatHistoryPath := filepath.Join(uploadDir, "chat-history.db")
	qdrantState := &qdrantTestServer{collections: map[string]*qdrantCollectionState{}}
	qdrantHTTP := httptest.NewServer(http.HandlerFunc(qdrantState.handle))
	modelHTTP := httptest.NewServer(http.HandlerFunc(handleModelAPI))

	serverConfig := model.ServerConfig{
		Port:                   "0",
		UploadDir:              uploadDir,
		QdrantURL:              qdrantHTTP.URL,
		QdrantCollectionPrefix: "kb_",
		QdrantVectorSize:       8,
		QdrantDistance:         "Cosine",
		QdrantTimeoutSeconds:   5,
	}

	qdrantService := service.NewQdrantService(serverConfig)
	chatHistoryStore, err := service.NewSQLiteChatHistoryStore(chatHistoryPath)
	if err != nil {
		t.Fatalf("init chat history store: %v", err)
	}
	appService := service.NewAppService(qdrantService, service.NewAppStateStore(""), chatHistoryStore, serverConfig)

	_, err = appService.UpdateConfig(model.ConfigUpdateRequest{
		Chat: model.ChatConfig{
			Provider:    "ollama",
			BaseURL:     modelHTTP.URL,
			Model:       "chat-test-model",
			APIKey:      "",
			Temperature: 0.2,
		},
		Embedding: model.EmbeddingConfig{
			Provider: "ollama",
			BaseURL:  modelHTTP.URL,
			Model:    "embedding-test-model",
			APIKey:   "",
		},
	})
	if err != nil {
		t.Fatalf("update config: %v", err)
	}

	llmService := service.NewLLMService()
	serviceDeskService := service.NewServiceDeskService(appService, llmService, chatHistoryStore)
	appHandler := handler.NewAppHandler(serverConfig, appService, llmService, serviceDeskService)
	ginEngine := NewRouter(appHandler)

	mux := http.NewServeMux()
	mux.Handle("/", ginEngine)

	cleanup := func() {
		_ = chatHistoryStore.Close()
		modelHTTP.Close()
		qdrantHTTP.Close()
		_ = os.RemoveAll(uploadDir)
	}
	return mux, modelHTTP.URL, cleanup
}

func (s *qdrantTestServer) handle(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()

	writeJSON := func(status int, payload any) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(payload)
	}

	requestPath := strings.TrimPrefix(r.URL.Path, "/")
	segments := strings.Split(requestPath, "/")
	if len(segments) == 0 || segments[0] != "collections" {
		writeJSON(http.StatusNotFound, map[string]any{"error": "not found"})
		return
	}

	if r.Method == http.MethodGet && len(segments) == 1 {
		writeJSON(http.StatusOK, map[string]any{"result": []any{}})
		return
	}

	if len(segments) < 2 {
		writeJSON(http.StatusNotFound, map[string]any{"error": "missing collection"})
		return
	}

	collectionName := segments[1]
	if _, ok := s.collections[collectionName]; !ok {
		s.collections[collectionName] = &qdrantCollectionState{}
	}
	collection := s.collections[collectionName]

	switch {
	case r.Method == http.MethodPut && len(segments) == 2:
		writeJSON(http.StatusOK, map[string]any{"result": true})
		return
	case r.Method == http.MethodDelete && len(segments) == 2:
		delete(s.collections, collectionName)
		writeJSON(http.StatusOK, map[string]any{"result": true})
		return
	case r.Method == http.MethodPut && len(segments) == 3 && segments[2] == "points":
		var req struct {
			Points []service.QdrantPoint `json:"points"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		collection.points = append([]service.QdrantPoint(nil), req.Points...)
		writeJSON(http.StatusOK, map[string]any{"result": map[string]any{"status": "acknowledged"}})
		return
	case r.Method == http.MethodPost && len(segments) == 4 && segments[2] == "points" && segments[3] == "search":
		var req struct {
			Filter map[string]any `json:"filter"`
			Limit  int            `json:"limit"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		limit := req.Limit
		if limit <= 0 {
			limit = 5
		}

		results := make([]map[string]any, 0, len(collection.points))
		for index, point := range collection.points {
			if !matchesFilter(point.Payload, req.Filter) {
				continue
			}
			results = append(results, map[string]any{
				"id":      point.ID,
				"score":   0.99 - float64(index)*0.01,
				"payload": point.Payload,
			})
			if len(results) >= limit {
				break
			}
		}
		writeJSON(http.StatusOK, map[string]any{"result": results})
		return
	default:
		writeJSON(http.StatusNotFound, map[string]any{"error": "unsupported path"})
		return
	}
}

func matchesFilter(payload map[string]any, filter map[string]any) bool {
	if len(filter) == 0 {
		return true
	}
	must, ok := filter["must"].([]any)
	if !ok {
		if typed, ok := filter["must"].([]map[string]any); ok {
			for _, condition := range typed {
				if !matchCondition(payload, condition) {
					return false
				}
			}
			return true
		}
		return true
	}

	for _, item := range must {
		condition, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if !matchCondition(payload, condition) {
			return false
		}
	}
	return true
}

func matchCondition(payload map[string]any, condition map[string]any) bool {
	key, _ := condition["key"].(string)
	match, _ := condition["match"].(map[string]any)
	value := fmt.Sprint(match["value"])
	return fmt.Sprint(payload[key]) == value
}

func handleModelAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.URL.Path {
	case "/embeddings":
		var req struct {
			Input []string `json:"input"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		response := embeddingTestResponse{}
		for index := range req.Input {
			item := struct {
				Embedding []float64 `json:"embedding"`
				Index     int       `json:"index"`
			}{
				Embedding: []float64{1, 0, 0, 0, 0, 0, 0, 0},
				Index:     index,
			}
			response.Data = append(response.Data, item)
		}
		_ = json.NewEncoder(w).Encode(response)
	// Ollama native embedding
	case "/api/embed":
		var embedReq struct {
			Input []string `json:"input"`
		}
		_ = json.NewDecoder(r.Body).Decode(&embedReq)
		embeddings := make([][]float64, len(embedReq.Input))
		for i := range embedReq.Input {
			embeddings[i] = []float64{1, 0, 0, 0, 0, 0, 0, 0}
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"embeddings": embeddings})
	// OpenAI-compatible chat
	case "/chat/completions":
		body, _ := io.ReadAll(r.Body)
		content := "已基于检索上下文回答：Redis 是高性能内存数据库。"
		if !bytes.Contains(body, []byte("Redis")) {
			content = "已收到请求，但未检测到上下文。"
		}
		response := chatTestResponse{
			ID:      "chatcmpl-test",
			Object:  "chat.completion",
			Created: 1,
			Model:   "chat-test-model",
			Choices: []struct {
				Index   int `json:"index"`
				Message struct {
					Role    string `json:"role"`
					Content string `json:"content"`
				} `json:"message"`
			}{
				{
					Index: 0,
					Message: struct {
						Role    string `json:"role"`
						Content string `json:"content"`
					}{
						Role:    "assistant",
						Content: content,
					},
				},
			},
		}
		_ = json.NewEncoder(w).Encode(response)
	// Ollama native chat
	case "/api/chat":
		body, _ := io.ReadAll(r.Body)
		content := "已基于检索上下文回答：Redis 是高性能内存数据库。"
		if !bytes.Contains(body, []byte("Redis")) {
			content = "已收到请求，但未检测到上下文。"
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"model": "chat-test-model",
			"message": map[string]any{
				"role":    "assistant",
				"content": content,
			},
			"done": true,
		})
	default:
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]any{"message": "not found"}})
	}
}

func performJSONRequest(t *testing.T, handler http.Handler, method, target string, payload any) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal json request: %v", err)
	}
	return performRequest(t, handler, method, target, bytes.NewReader(body), "application/json")
}

func performMultipartUpload(t *testing.T, handler http.Handler, method, target, filename, content string) *httptest.ResponseRecorder {
	t.Helper()
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	fileWriter, err := writer.CreateFormFile("file", filepath.Base(filename))
	if err != nil {
		t.Fatalf("create multipart file: %v", err)
	}
	if _, err := fileWriter.Write([]byte(content)); err != nil {
		t.Fatalf("write multipart content: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}
	return performRequest(t, handler, method, target, body, writer.FormDataContentType())
}

func performRequest(t *testing.T, handler http.Handler, method, target string, body io.Reader, contentType string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, target, body)
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	resp := httptest.NewRecorder()
	handler.ServeHTTP(resp, req)
	return resp
}

func decodeJSONResponse(t *testing.T, body []byte, target any) {
	t.Helper()
	if err := json.Unmarshal(body, target); err != nil {
		t.Fatalf("decode json response: %v, body=%s", err, string(body))
	}
}

func TestServiceDeskConversationFeedbackAndAnalytics(t *testing.T) {
	engine, modelBaseURL, cleanup := newTestRouter(t)
	defer cleanup()

	listResp := performRequest(t, engine, http.MethodGet, "/api/knowledge-bases", nil, "")
	if listResp.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d, body=%s", listResp.Code, listResp.Body.String())
	}

	var kbList struct {
		Items []model.KnowledgeBase `json:"items"`
	}
	decodeJSONResponse(t, listResp.Body.Bytes(), &kbList)
	knowledgeBaseID := kbList.Items[0].ID

	createPayload := map[string]any{
		"knowledgeBaseId": knowledgeBaseID,
		"context": map[string]any{
			"ticketId":       "INC-7788",
			"userId":         "u-001",
			"tenantId":       "tenant-a",
			"sourcePlatform": "itsm-portal",
			"category":       "账号与访问",
		},
	}
	createResp := performJSONRequest(t, engine, http.MethodPost, "/api/service-desk/conversations", createPayload)
	if createResp.Code != http.StatusCreated {
		t.Fatalf("expected status 201, got %d, body=%s", createResp.Code, createResp.Body.String())
	}

	var createResult model.APIResponse
	decodeJSONResponse(t, createResp.Body.Bytes(), &createResult)
	conversationData, _ := json.Marshal(createResult.Data)
	var conversation model.ServiceDeskConversation
	decodeJSONResponse(t, conversationData, &conversation)
	if conversation.ID == "" {
		t.Fatal("expected service desk conversation id")
	}

	sendPayload := map[string]any{
		"content":         "请帮我说明 Redis 的核心特点和处理建议",
		"knowledgeBaseId": knowledgeBaseID,
		"config": map[string]any{
			"provider":            "ollama",
			"baseUrl":             modelBaseURL,
			"model":               "chat-test-model",
			"apiKey":              "",
			"temperature":         0.2,
			"contextMessageLimit": 12,
		},
		"embedding": map[string]any{
			"provider": "ollama",
			"baseUrl":  modelBaseURL,
			"model":    "embedding-test-model",
		},
	}
	sendResp := performJSONRequest(t, engine, http.MethodPost, fmt.Sprintf("/api/service-desk/conversations/%s/messages", conversation.ID), sendPayload)
	if sendResp.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d, body=%s", sendResp.Code, sendResp.Body.String())
	}

	var sendResult model.APIResponse
	decodeJSONResponse(t, sendResp.Body.Bytes(), &sendResult)
	sendData, _ := json.Marshal(sendResult.Data)
	var messageResult model.SendServiceDeskMessageResponse
	decodeJSONResponse(t, sendData, &messageResult)
	if messageResult.AssistantMessage.ID == "" {
		t.Fatal("expected assistant message id")
	}
	if !strings.Contains(messageResult.AssistantMessage.Content, "Redis") {
		t.Fatalf("expected assistant response to mention Redis, got %q", messageResult.AssistantMessage.Content)
	}

	feedbackPayload := map[string]any{
		"conversationId": conversation.ID,
		"feedbackType":   "dislike",
		"feedbackReason": "内容不完整",
		"feedbackText":   "缺少升级人工处理建议",
		"questionText":   "请帮我说明 Redis 的核心特点和处理建议",
		"answerText":     messageResult.AssistantMessage.Content,
	}
	feedbackResp := performJSONRequest(t, engine, http.MethodPost, fmt.Sprintf("/api/service-desk/messages/%s/feedback", messageResult.AssistantMessage.ID), feedbackPayload)
	if feedbackResp.Code != http.StatusCreated {
		t.Fatalf("expected status 201, got %d, body=%s", feedbackResp.Code, feedbackResp.Body.String())
	}

	likePayload := map[string]any{
		"conversationId": conversation.ID,
		"feedbackType":   "like",
		"feedbackReason": "回答准确",
		"questionText":   "请帮我说明 Redis 的核心特点和处理建议",
		"answerText":     messageResult.AssistantMessage.Content,
	}
	for i := 0; i < 2; i++ {
		likeResp := performJSONRequest(t, engine, http.MethodPost, fmt.Sprintf("/api/service-desk/messages/%s/feedback", messageResult.AssistantMessage.ID), likePayload)
		if likeResp.Code != http.StatusCreated {
			t.Fatalf("expected like feedback status 201, got %d, body=%s", likeResp.Code, likeResp.Body.String())
		}
	}

	analyticsResp := performRequest(t, engine, http.MethodGet, "/api/service-desk/analytics/summary", nil, "")
	if analyticsResp.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d, body=%s", analyticsResp.Code, analyticsResp.Body.String())
	}

	var analyticsResult model.APIResponse
	decodeJSONResponse(t, analyticsResp.Body.Bytes(), &analyticsResult)
	analyticsData, _ := json.Marshal(analyticsResult.Data)
	var analytics model.ServiceDeskAnalyticsSummary
	decodeJSONResponse(t, analyticsData, &analytics)
	if analytics.TotalFeedbacks != 3 || analytics.DislikeCount != 1 || analytics.LikeCount != 2 {
		t.Fatalf("expected analytics feedback counters to be updated, got %+v", analytics)
	}
	if analytics.FAQPendingCount == 0 || analytics.KnowledgeGapCount == 0 || analytics.LowQualityOpenCount == 0 || analytics.ThisWeekDislikeCount == 0 {
		t.Fatalf("expected analytics counters to include pending/open governance items, got %+v", analytics)
	}
	if len(analytics.FAQCandidates) == 0 {
		t.Fatal("expected faq candidate after like feedback")
	}
	if len(analytics.KnowledgeGaps) == 0 {
		t.Fatal("expected knowledge gap candidate after dislike feedback")
	}
	if len(analytics.LowQualityAnswers) == 0 {
		t.Fatal("expected low quality answer entry after dislike feedback")
	}

	faqListResp := performRequest(t, engine, http.MethodGet, fmt.Sprintf("/api/service-desk/analytics/faq-candidates?limit=10&knowledgeBaseId=%s", knowledgeBaseID), nil, "")
	if faqListResp.Code != http.StatusOK {
		t.Fatalf("expected faq list status 200, got %d, body=%s", faqListResp.Code, faqListResp.Body.String())
	}
	var faqListResult model.APIResponse
	decodeJSONResponse(t, faqListResp.Body.Bytes(), &faqListResult)
	faqListData, _ := json.Marshal(faqListResult.Data)
	var faqList struct {
		Items []model.FAQCandidate `json:"items"`
	}
	decodeJSONResponse(t, faqListData, &faqList)
	if len(faqList.Items) == 0 {
		t.Fatal("expected faq candidates list to return items")
	}

	faqUpdateResp := performJSONRequest(t, engine, http.MethodPatch, fmt.Sprintf("/api/service-desk/analytics/faq-candidates/%s", faqList.Items[0].ID), map[string]any{"status": "approved", "owner": "ops-faq", "note": "已转为标准 FAQ"})
	if faqUpdateResp.Code != http.StatusOK {
		t.Fatalf("expected faq update status 200, got %d, body=%s", faqUpdateResp.Code, faqUpdateResp.Body.String())
	}
	var faqUpdateResult model.APIResponse
	decodeJSONResponse(t, faqUpdateResp.Body.Bytes(), &faqUpdateResult)
	faqUpdateData, _ := json.Marshal(faqUpdateResult.Data)
	var updatedFAQ model.FAQCandidate
	decodeJSONResponse(t, faqUpdateData, &updatedFAQ)
	if updatedFAQ.Status != "approved" || updatedFAQ.Owner != "ops-faq" || updatedFAQ.Note != "已转为标准 FAQ" {
		t.Fatalf("expected faq update payload to include status/owner/note, got %+v", updatedFAQ)
	}

	faqBatchResp := performJSONRequest(t, engine, http.MethodPatch, "/api/service-desk/analytics/faq-candidates/batch", map[string]any{
		"ids":   []string{faqList.Items[0].ID},
		"owner": "ops-faq-batch",
		"note":  "已纳入 FAQ 看板",
	})
	if faqBatchResp.Code != http.StatusOK {
		t.Fatalf("expected faq batch update status 200, got %d, body=%s", faqBatchResp.Code, faqBatchResp.Body.String())
	}
	approvedFAQResp := performRequest(t, engine, http.MethodGet, fmt.Sprintf("/api/service-desk/analytics/faq-candidates?limit=10&knowledgeBaseId=%s&status=approved&owner=%s", knowledgeBaseID, "ops-faq-batch"), nil, "")
	if approvedFAQResp.Code != http.StatusOK {
		t.Fatalf("expected approved faq list status 200, got %d, body=%s", approvedFAQResp.Code, approvedFAQResp.Body.String())
	}
	var approvedFAQResult model.APIResponse
	decodeJSONResponse(t, approvedFAQResp.Body.Bytes(), &approvedFAQResult)
	approvedFAQData, _ := json.Marshal(approvedFAQResult.Data)
	var approvedFAQList struct {
		Items []model.FAQCandidate `json:"items"`
	}
	decodeJSONResponse(t, approvedFAQData, &approvedFAQList)
	if len(approvedFAQList.Items) == 0 || approvedFAQList.Items[0].Status != "approved" || approvedFAQList.Items[0].Owner != "ops-faq-batch" || approvedFAQList.Items[0].Note != "已纳入 FAQ 看板" {
		t.Fatalf("expected approved faq item after patch, got %+v", approvedFAQList.Items)
	}

	gapListResp := performRequest(t, engine, http.MethodGet, fmt.Sprintf("/api/service-desk/analytics/knowledge-gaps?limit=10&knowledgeBaseId=%s", knowledgeBaseID), nil, "")
	if gapListResp.Code != http.StatusOK {
		t.Fatalf("expected knowledge gap list status 200, got %d, body=%s", gapListResp.Code, gapListResp.Body.String())
	}
	var gapListResult model.APIResponse
	decodeJSONResponse(t, gapListResp.Body.Bytes(), &gapListResult)
	gapListData, _ := json.Marshal(gapListResult.Data)
	var gapList struct {
		Items []model.KnowledgeGap `json:"items"`
	}
	decodeJSONResponse(t, gapListData, &gapList)
	if len(gapList.Items) == 0 {
		t.Fatal("expected knowledge gap list to return items")
	}
	gapUpdateResp := performJSONRequest(t, engine, http.MethodPatch, "/api/service-desk/analytics/knowledge-gaps/batch", map[string]any{
		"ids":    []string{gapList.Items[0].ID},
		"status": "resolved",
		"owner":  "ops-gap",
		"note":   "已补充登录排障文档并重新索引",
	})
	if gapUpdateResp.Code != http.StatusOK {
		t.Fatalf("expected knowledge gap update status 200, got %d, body=%s", gapUpdateResp.Code, gapUpdateResp.Body.String())
	}
	resolvedGapResp := performRequest(t, engine, http.MethodGet, fmt.Sprintf("/api/service-desk/analytics/knowledge-gaps?limit=10&knowledgeBaseId=%s&status=resolved&owner=%s", knowledgeBaseID, "ops-gap"), nil, "")
	if resolvedGapResp.Code != http.StatusOK {
		t.Fatalf("expected resolved knowledge gap list status 200, got %d, body=%s", resolvedGapResp.Code, resolvedGapResp.Body.String())
	}
	var resolvedGapResult model.APIResponse
	decodeJSONResponse(t, resolvedGapResp.Body.Bytes(), &resolvedGapResult)
	resolvedGapData, _ := json.Marshal(resolvedGapResult.Data)
	var resolvedGapList struct {
		Items []model.KnowledgeGap `json:"items"`
	}
	decodeJSONResponse(t, resolvedGapData, &resolvedGapList)
	if len(resolvedGapList.Items) == 0 || resolvedGapList.Items[0].Status != "resolved" || resolvedGapList.Items[0].Owner != "ops-gap" || resolvedGapList.Items[0].Note != "已补充登录排障文档并重新索引" {
		t.Fatalf("expected resolved knowledge gap item after patch, got %+v", resolvedGapList.Items)
	}

	lowQualityResp := performRequest(t, engine, http.MethodGet, fmt.Sprintf("/api/service-desk/analytics/low-quality-answers?limit=10&knowledgeBaseId=%s&feedbackReason=%s", knowledgeBaseID, "内容不完整"), nil, "")
	if lowQualityResp.Code != http.StatusOK {
		t.Fatalf("expected low quality answers status 200, got %d, body=%s", lowQualityResp.Code, lowQualityResp.Body.String())
	}
	var lowQualityResult model.APIResponse
	decodeJSONResponse(t, lowQualityResp.Body.Bytes(), &lowQualityResult)
	lowQualityData, _ := json.Marshal(lowQualityResult.Data)
	var lowQualityList struct {
		Items []model.LowQualityAnswer `json:"items"`
	}
	decodeJSONResponse(t, lowQualityData, &lowQualityList)
	if len(lowQualityList.Items) == 0 {
		t.Fatal("expected low quality answers list to return items")
	}
	lowQualityUpdateResp := performJSONRequest(t, engine, http.MethodPatch, "/api/service-desk/analytics/low-quality-answers/batch", map[string]any{
		"ids":    []string{lowQualityList.Items[0].ID},
		"status": "resolved",
		"owner":  "ops-quality",
		"note":   "已补召回词并优化回答模板",
	})
	if lowQualityUpdateResp.Code != http.StatusOK {
		t.Fatalf("expected low quality update status 200, got %d, body=%s", lowQualityUpdateResp.Code, lowQualityUpdateResp.Body.String())
	}
	resolvedLowQualityResp := performRequest(t, engine, http.MethodGet, fmt.Sprintf("/api/service-desk/analytics/low-quality-answers?limit=10&knowledgeBaseId=%s&status=resolved&owner=%s", knowledgeBaseID, "ops-quality"), nil, "")
	if resolvedLowQualityResp.Code != http.StatusOK {
		t.Fatalf("expected resolved low quality list status 200, got %d, body=%s", resolvedLowQualityResp.Code, resolvedLowQualityResp.Body.String())
	}
	var resolvedLowQualityResult model.APIResponse
	decodeJSONResponse(t, resolvedLowQualityResp.Body.Bytes(), &resolvedLowQualityResult)
	resolvedLowQualityData, _ := json.Marshal(resolvedLowQualityResult.Data)
	var resolvedLowQualityList struct {
		Items []model.LowQualityAnswer `json:"items"`
	}
	decodeJSONResponse(t, resolvedLowQualityData, &resolvedLowQualityList)
	if len(resolvedLowQualityList.Items) == 0 || resolvedLowQualityList.Items[0].Status != "resolved" || resolvedLowQualityList.Items[0].Owner != "ops-quality" || resolvedLowQualityList.Items[0].Note != "已补召回词并优化回答模板" {
		t.Fatalf("expected resolved low quality item after patch, got %+v", resolvedLowQualityList.Items)
	}

	feedbackListResp := performRequest(t, engine, http.MethodGet, fmt.Sprintf("/api/service-desk/analytics/feedback?limit=10&knowledgeBaseId=%s&feedbackType=dislike&feedbackReason=%s", knowledgeBaseID, "内容不完整"), nil, "")
	if feedbackListResp.Code != http.StatusOK {
		t.Fatalf("expected feedback list status 200, got %d, body=%s", feedbackListResp.Code, feedbackListResp.Body.String())
	}
	var feedbackListResult model.APIResponse
	decodeJSONResponse(t, feedbackListResp.Body.Bytes(), &feedbackListResult)
	feedbackListData, _ := json.Marshal(feedbackListResult.Data)
	var feedbackList struct {
		Items []model.ServiceDeskMessageFeedback `json:"items"`
	}
	decodeJSONResponse(t, feedbackListData, &feedbackList)
	if len(feedbackList.Items) != 1 {
		t.Fatalf("expected 1 filtered feedback item, got %d", len(feedbackList.Items))
	}
}

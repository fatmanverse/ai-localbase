package service

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"ai-localbase/internal/model"
)

type LLMService struct {
	client *http.Client
}

// ── OpenAI-compatible structs ────────────────────────────────────────────────

type openAIChatRequest struct {
	Model       string              `json:"model"`
	Messages    []model.ChatMessage `json:"messages"`
	Temperature float64             `json:"temperature,omitempty"`
}

type openAIChatResponse struct {
	ID      string                        `json:"id"`
	Object  string                        `json:"object"`
	Created int64                         `json:"created"`
	Model   string                        `json:"model"`
	Choices []model.ChatCompletionChoice  `json:"choices"`
	Error   *openAICompatibleErrorPayload `json:"error,omitempty"`
}

type openAICompatibleErrorPayload struct {
	Message string `json:"message"`
	Type    string `json:"type,omitempty"`
	Code    any    `json:"code,omitempty"`
}

type openAIChatStreamRequest struct {
	Model       string              `json:"model"`
	Messages    []model.ChatMessage `json:"messages"`
	Temperature float64             `json:"temperature,omitempty"`
	Stream      bool                `json:"stream"`
}

type openAIChatStreamChunk struct {
	Choices []struct {
		Delta struct {
			Role    string `json:"role,omitempty"`
			Content string `json:"content,omitempty"`
		} `json:"delta"`
		FinishReason string `json:"finish_reason,omitempty"`
	} `json:"choices"`
	Error *openAICompatibleErrorPayload `json:"error,omitempty"`
}

// ── Ollama native API structs ────────────────────────────────────────────────

type ollamaChatRequest struct {
	Model    string              `json:"model"`
	Messages []model.ChatMessage `json:"messages"`
	Stream   bool                `json:"stream"`
	Options  *ollamaOptions      `json:"options,omitempty"`
}

type ollamaOptions struct {
	Temperature float64 `json:"temperature,omitempty"`
}

type ollamaChatResponse struct {
	Model     string            `json:"model"`
	CreatedAt string            `json:"created_at"`
	Message   model.ChatMessage `json:"message"`
	Done      bool              `json:"done"`
	Error     string            `json:"error,omitempty"`
}

// ── Constructor ──────────────────────────────────────────────────────────────

func NewLLMService() *LLMService {
	return &LLMService{
		client: &http.Client{Timeout: 90 * time.Second},
	}
}

// ── Public methods ───────────────────────────────────────────────────────────

func (s *LLMService) Chat(req model.ChatCompletionRequest) (model.ChatCompletionResponse, error) {
	configs, err := normalizeChatConfigCandidates(req)
	if err != nil {
		return model.ChatCompletionResponse{}, err
	}

	policy := normalizeFailoverPolicy(req.Config.CircuitBreaker)
	attemptErrors := make([]string, 0, len(configs))
	breakerSkips := make([]string, 0)
	for index, cfg := range configs {
		label := formatChatConfigLabel(cfg)
		permit, allowed, reason := defaultEndpointCircuitBreaker.allow("chat", label, policy)
		if !allowed {
			breakerSkips = append(breakerSkips, fmt.Sprintf("%s => %s", label, reason))
			attemptErrors = append(attemptErrors, fmt.Sprintf("%s => skipped: %s", label, reason))
			continue
		}

		result, callErr := s.chatWithConfig(cfg, req)
		if callErr != nil {
			permit.Failure(callErr, policy)
			attemptErrors = append(attemptErrors, fmt.Sprintf("%s => %s", label, callErr.Error()))
			continue
		}
		permit.Success()
		if result.Metadata == nil {
			result.Metadata = map[string]any{}
		}
		if len(configs) > 1 {
			result.Metadata["candidateCount"] = len(configs)
			result.Metadata["activeProvider"] = cfg.Provider
			result.Metadata["activeModel"] = cfg.Model
			if index > 0 {
				result.Metadata["failoverUsed"] = true
				result.Metadata["fallbackStrategy"] = "model-failover"
				result.Metadata["modelFailoverHistory"] = append([]string(nil), attemptErrors...)
			}
		}
		if len(breakerSkips) > 0 {
			result.Metadata["circuitBreakerUsed"] = true
			result.Metadata["circuitBreakerSkips"] = append([]string(nil), breakerSkips...)
		}
		result.Metadata["circuitBreakerPolicy"] = policy
		return result, nil
	}

	fallbackContent := buildModelFallbackMessage(req, configs)
	upstreamError := strings.Join(attemptErrors, " | ")
	if strings.TrimSpace(upstreamError) == "" {
		upstreamError = "all configured chat models failed"
	}
	metadata := map[string]any{
		"degraded":             true,
		"fallbackStrategy":     "local-message-after-failover",
		"upstreamError":        upstreamError,
		"candidateCount":       len(configs),
		"modelFailoverHistory": attemptErrors,
		"circuitBreakerPolicy": policy,
	}
	if len(breakerSkips) > 0 {
		metadata["circuitBreakerUsed"] = true
		metadata["circuitBreakerSkips"] = breakerSkips
	}
	return model.ChatCompletionResponse{
		ID:      "chatcmpl-fallback",
		Object:  "chat.completion",
		Created: time.Now().Unix(),
		Model:   configs[0].Model,
		Choices: []model.ChatCompletionChoice{{
			Index: 0,
			Message: model.ChatMessage{
				Role:    "assistant",
				Content: fallbackContent,
			},
		}},
		Metadata: metadata,
	}, nil
}

func (s *LLMService) StreamChat(req model.ChatCompletionRequest, onChunk func(string) error) error {
	configs, err := normalizeChatConfigCandidates(req)
	if err != nil {
		return err
	}

	if len(configs) > 1 {
		response, chatErr := s.Chat(req)
		if chatErr != nil {
			return chatErr
		}
		content := firstAssistantContentFromResponse(response)
		if strings.TrimSpace(content) == "" {
			return fmt.Errorf("chat model returned empty response")
		}
		for _, chunk := range chunkTextForStreaming(content, 160) {
			if err := onChunk(chunk); err != nil {
				return err
			}
		}
		return nil
	}

	cfg := configs[0]
	if err := s.streamWithConfig(cfg, req, onChunk); err != nil {
		fallbackContent := buildModelFallbackMessage(req, configs)
		return onChunk(fallbackContent)
	}

	return nil
}

// ── OpenAI-compatible implementation ─────────────────────────────────────────

func (s *LLMService) openAIChat(cfg model.ChatModelConfig, req model.ChatCompletionRequest) (model.ChatCompletionResponse, error) {
	payload := openAIChatRequest{
		Model:       cfg.Model,
		Messages:    req.Messages,
		Temperature: cfg.Temperature,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return model.ChatCompletionResponse{}, fmt.Errorf("failed to encode chat request")
	}

	endpoint := strings.TrimRight(cfg.BaseURL, "/") + "/chat/completions"
	var result model.ChatCompletionResponse
	err = retryWithBackoff(context.Background(), 3, 250*time.Millisecond, func() error {
		httpReq, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
		if err != nil {
			return fmt.Errorf("failed to create model request")
		}

		httpReq.Header.Set("Content-Type", "application/json")
		if cfg.APIKey != "" {
			httpReq.Header.Set("Authorization", "Bearer "+cfg.APIKey)
		}

		resp, err := s.client.Do(httpReq)
		if err != nil {
			return fmt.Errorf("failed to call model api: %w", err)
		}
		defer resp.Body.Close()

		respBody, err := io.ReadAll(resp.Body)
		if err != nil {
			return fmt.Errorf("failed to read model response")
		}

		var llmResp openAIChatResponse
		if err := json.Unmarshal(respBody, &llmResp); err != nil {
			return fmt.Errorf("invalid model response format")
		}

		if resp.StatusCode >= http.StatusBadRequest {
			if llmResp.Error != nil && strings.TrimSpace(llmResp.Error.Message) != "" {
				return fmt.Errorf("model api error: %s", llmResp.Error.Message)
			}
			return fmt.Errorf("model api error: http %d", resp.StatusCode)
		}

		if len(llmResp.Choices) == 0 {
			return fmt.Errorf("model api returned empty choices")
		}

		result = model.ChatCompletionResponse{
			ID:      llmResp.ID,
			Object:  llmResp.Object,
			Created: llmResp.Created,
			Model:   llmResp.Model,
			Choices: llmResp.Choices,
		}
		return nil
	})

	return result, err
}

func (s *LLMService) openAIStreamChat(cfg model.ChatModelConfig, req model.ChatCompletionRequest, onChunk func(string) error) error {
	payload := openAIChatStreamRequest{
		Model:       cfg.Model,
		Messages:    req.Messages,
		Temperature: cfg.Temperature,
		Stream:      true,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to encode chat request")
	}

	endpoint := strings.TrimRight(cfg.BaseURL, "/") + "/chat/completions"
	return retryWithBackoff(context.Background(), 2, 200*time.Millisecond, func() error {
		httpReq, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
		if err != nil {
			return fmt.Errorf("failed to create model request")
		}

		httpReq.Header.Set("Content-Type", "application/json")
		if cfg.APIKey != "" {
			httpReq.Header.Set("Authorization", "Bearer "+cfg.APIKey)
		}

		resp, err := s.client.Do(httpReq)
		if err != nil {
			return fmt.Errorf("failed to call model api: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode >= http.StatusBadRequest {
			respBody, readErr := io.ReadAll(resp.Body)
			if readErr != nil {
				return fmt.Errorf("model api error: http %d", resp.StatusCode)
			}

			var llmResp openAIChatResponse
			if err := json.Unmarshal(respBody, &llmResp); err == nil && llmResp.Error != nil && strings.TrimSpace(llmResp.Error.Message) != "" {
				return fmt.Errorf("model api error: %s", llmResp.Error.Message)
			}

			return fmt.Errorf("model api error: http %d", resp.StatusCode)
		}

		scanner := bufio.NewScanner(resp.Body)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || !strings.HasPrefix(line, "data:") {
				continue
			}

			payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			if payload == "[DONE]" {
				break
			}

			var chunk openAIChatStreamChunk
			if err := json.Unmarshal([]byte(payload), &chunk); err != nil {
				continue
			}

			if chunk.Error != nil && strings.TrimSpace(chunk.Error.Message) != "" {
				return fmt.Errorf("model api error: %s", chunk.Error.Message)
			}

			for _, choice := range chunk.Choices {
				if strings.TrimSpace(choice.Delta.Content) == "" {
					continue
				}
				if err := onChunk(choice.Delta.Content); err != nil {
					return err
				}
			}
		}

		if err := scanner.Err(); err != nil {
			return fmt.Errorf("failed to read model stream")
		}

		return nil
	})
}

// ── Ollama native implementation ──────────────────────────────────────────────

func (s *LLMService) ollamaChat(cfg model.ChatModelConfig, req model.ChatCompletionRequest) (model.ChatCompletionResponse, error) {
	payload := ollamaChatRequest{
		Model:    cfg.Model,
		Messages: req.Messages,
		Stream:   false,
	}
	if cfg.Temperature > 0 {
		payload.Options = &ollamaOptions{Temperature: cfg.Temperature}
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return model.ChatCompletionResponse{}, fmt.Errorf("failed to encode chat request")
	}

	endpoint := strings.TrimRight(cfg.BaseURL, "/") + "/api/chat"
	var result model.ChatCompletionResponse
	err = retryWithBackoff(context.Background(), 3, 250*time.Millisecond, func() error {
		httpReq, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
		if err != nil {
			return fmt.Errorf("failed to create model request")
		}
		httpReq.Header.Set("Content-Type", "application/json")

		resp, err := s.client.Do(httpReq)
		if err != nil {
			return fmt.Errorf("failed to call model api: %w", err)
		}
		defer resp.Body.Close()

		respBody, err := io.ReadAll(resp.Body)
		if err != nil {
			return fmt.Errorf("failed to read model response")
		}

		var ollamaResp ollamaChatResponse
		if err := json.Unmarshal(respBody, &ollamaResp); err != nil {
			return fmt.Errorf("invalid model response format")
		}

		if resp.StatusCode >= http.StatusBadRequest {
			if strings.TrimSpace(ollamaResp.Error) != "" {
				return fmt.Errorf("model api error: %s", ollamaResp.Error)
			}
			return fmt.Errorf("model api error: http %d", resp.StatusCode)
		}

		if strings.TrimSpace(ollamaResp.Message.Content) == "" {
			return fmt.Errorf("model api returned empty response")
		}

		result = model.ChatCompletionResponse{
			ID:      "ollama-" + ollamaResp.Model,
			Object:  "chat.completion",
			Created: time.Now().Unix(),
			Model:   ollamaResp.Model,
			Choices: []model.ChatCompletionChoice{{
				Index:   0,
				Message: ollamaResp.Message,
			}},
		}
		return nil
	})

	return result, err
}

func (s *LLMService) ollamaStreamChat(cfg model.ChatModelConfig, req model.ChatCompletionRequest, onChunk func(string) error) error {
	payload := ollamaChatRequest{
		Model:    cfg.Model,
		Messages: req.Messages,
		Stream:   true,
	}
	if cfg.Temperature > 0 {
		payload.Options = &ollamaOptions{Temperature: cfg.Temperature}
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to encode chat request")
	}

	endpoint := strings.TrimRight(cfg.BaseURL, "/") + "/api/chat"
	return retryWithBackoff(context.Background(), 2, 200*time.Millisecond, func() error {
		httpReq, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
		if err != nil {
			return fmt.Errorf("failed to create model request")
		}
		httpReq.Header.Set("Content-Type", "application/json")

		resp, err := s.client.Do(httpReq)
		if err != nil {
			return fmt.Errorf("failed to call model api: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode >= http.StatusBadRequest {
			respBody, readErr := io.ReadAll(resp.Body)
			if readErr != nil {
				return fmt.Errorf("model api error: http %d", resp.StatusCode)
			}
			var ollamaResp ollamaChatResponse
			if err := json.Unmarshal(respBody, &ollamaResp); err == nil && strings.TrimSpace(ollamaResp.Error) != "" {
				return fmt.Errorf("model api error: %s", ollamaResp.Error)
			}
			return fmt.Errorf("model api error: http %d", resp.StatusCode)
		}

		// Ollama streams newline-delimited JSON objects (NDJSON), not SSE
		scanner := bufio.NewScanner(resp.Body)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" {
				continue
			}

			var chunk ollamaChatResponse
			if err := json.Unmarshal([]byte(line), &chunk); err != nil {
				continue
			}

			if strings.TrimSpace(chunk.Error) != "" {
				return fmt.Errorf("model api error: %s", chunk.Error)
			}

			if chunk.Done {
				break
			}

			if content := strings.TrimSpace(chunk.Message.Content); content != "" {
				if err := onChunk(content); err != nil {
					return err
				}
			}
		}

		if err := scanner.Err(); err != nil {
			return fmt.Errorf("failed to read model stream")
		}

		return nil
	})
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func (s *LLMService) chatWithConfig(cfg model.ChatModelConfig, req model.ChatCompletionRequest) (model.ChatCompletionResponse, error) {
	if cfg.Provider == "ollama" {
		return s.ollamaChat(cfg, req)
	}
	return s.openAIChat(cfg, req)
}

func (s *LLMService) streamWithConfig(cfg model.ChatModelConfig, req model.ChatCompletionRequest, onChunk func(string) error) error {
	if cfg.Provider == "ollama" {
		return s.ollamaStreamChat(cfg, req, onChunk)
	}
	return s.openAIStreamChat(cfg, req, onChunk)
}

func normalizeChatConfigCandidates(req model.ChatCompletionRequest) ([]model.ChatModelConfig, error) {
	primary, err := normalizeSingleChatConfig(req.Config)
	if err != nil {
		return nil, err
	}

	items := []model.ChatModelConfig{primary}
	seen := map[string]struct{}{formatChatConfigLabel(primary): {}}
	for _, candidate := range req.Config.Candidates {
		provider := strings.TrimSpace(candidate.Provider)
		if provider == "" {
			provider = primary.Provider
		}
		modelName := strings.TrimSpace(candidate.Model)
		if modelName == "" {
			continue
		}
		baseURL := strings.TrimSpace(candidate.BaseURL)
		if baseURL == "" {
			baseURL = primary.BaseURL
		}
		apiKey := strings.TrimSpace(candidate.APIKey)
		if apiKey == "" && provider == primary.Provider && baseURL == primary.BaseURL {
			apiKey = primary.APIKey
		}
		normalized, candidateErr := normalizeSingleChatConfig(model.ChatModelConfig{
			Provider:            provider,
			BaseURL:             baseURL,
			Model:               modelName,
			APIKey:              apiKey,
			Temperature:         primary.Temperature,
			ContextMessageLimit: primary.ContextMessageLimit,
			CircuitBreaker:      primary.CircuitBreaker,
		})
		if candidateErr != nil {
			continue
		}
		key := formatChatConfigLabel(normalized)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		items = append(items, normalized)
	}
	return items, nil
}

func normalizeSingleChatConfig(cfg model.ChatModelConfig) (model.ChatModelConfig, error) {
	cfg.Provider = strings.TrimSpace(cfg.Provider)
	if cfg.Provider == "" {
		cfg.Provider = "ollama"
	}
	cfg.Model = strings.TrimSpace(cfg.Model)
	if cfg.Model == "" {
		return model.ChatModelConfig{}, fmt.Errorf("model is required")
	}
	cfg.BaseURL = strings.TrimSpace(cfg.BaseURL)
	if cfg.BaseURL == "" {
		if cfg.Provider == "ollama" {
			cfg.BaseURL = "http://localhost:11434"
		} else {
			cfg.BaseURL = "http://localhost:11434/v1"
		}
	}
	cfg.APIKey = strings.TrimSpace(cfg.APIKey)
	cfg.CircuitBreaker = normalizeFailoverPolicy(cfg.CircuitBreaker)
	if cfg.Temperature <= 0 {
		cfg.Temperature = 0.7
	}
	return cfg, nil
}

func formatChatConfigLabel(cfg model.ChatModelConfig) string {
	return strings.Join([]string{
		strings.TrimSpace(cfg.Provider),
		strings.TrimSpace(cfg.BaseURL),
		strings.TrimSpace(cfg.Model),
	}, "|")
}

func buildModelFallbackMessage(req model.ChatCompletionRequest, attempted []model.ChatModelConfig) string {
	modelNames := make([]string, 0, len(attempted))
	seen := map[string]struct{}{}
	for _, candidate := range attempted {
		name := strings.TrimSpace(candidate.Model)
		if name == "" {
			continue
		}
		if _, exists := seen[name]; exists {
			continue
		}
		seen[name] = struct{}{}
		modelNames = append(modelNames, name)
	}
	if len(modelNames) == 0 {
		modelName := strings.TrimSpace(req.Config.Model)
		if modelName == "" {
			modelName = strings.TrimSpace(req.Model)
		}
		if modelName != "" {
			modelNames = append(modelNames, modelName)
		}
	}
	if len(modelNames) == 0 {
		return "⚠️ AI 模型调用失败\n\n请在设置中配置正确的 Chat 模型。"
	}
	if len(modelNames) == 1 {
		modelName := modelNames[0]
		return fmt.Sprintf("⚠️ AI 模型调用失败\n\n请检查模型 **%s** 是否可用，或在设置中补充备用模型。", modelName)
	}
	return fmt.Sprintf("⚠️ AI 模型调用失败\n\n已依次尝试以下模型：**%s**。请检查这些模型或对应接口是否可用。", strings.Join(modelNames, " / "))
}

func firstAssistantContentFromResponse(response model.ChatCompletionResponse) string {
	for _, choice := range response.Choices {
		if content := strings.TrimSpace(choice.Message.Content); content != "" {
			return content
		}
	}
	return ""
}

func chunkTextForStreaming(content string, chunkSize int) []string {
	trimmed := strings.TrimSpace(content)
	if trimmed == "" {
		return nil
	}
	if chunkSize <= 0 {
		chunkSize = 160
	}
	runes := []rune(trimmed)
	chunks := make([]string, 0, (len(runes)+chunkSize-1)/chunkSize)
	for start := 0; start < len(runes); start += chunkSize {
		end := start + chunkSize
		if end > len(runes) {
			end = len(runes)
		}
		chunks = append(chunks, string(runes[start:end]))
	}
	return chunks
}

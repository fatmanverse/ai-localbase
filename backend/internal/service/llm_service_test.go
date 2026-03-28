package service

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"ai-localbase/internal/model"
)

func TestLLMServiceChatFailoverToCandidate(t *testing.T) {
	primary := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"error": map[string]any{"message": "primary unavailable"},
		})
	}))
	defer primary.Close()

	backup := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(openAIChatResponse{
			ID:      "chatcmpl-backup",
			Object:  "chat.completion",
			Created: 123,
			Model:   "backup-model",
			Choices: []model.ChatCompletionChoice{{
				Index: 0,
				Message: model.ChatMessage{
					Role:    "assistant",
					Content: "来自备用模型的回答",
				},
			}},
		})
	}))
	defer backup.Close()

	service := &LLMService{client: backup.Client()}
	resp, err := service.Chat(model.ChatCompletionRequest{
		Config: model.ChatModelConfig{
			Provider:    "openai-compatible",
			BaseURL:     primary.URL,
			Model:       "primary-model",
			Temperature: 0.2,
			Candidates: []model.ModelEndpointConfig{{
				Provider: "openai-compatible",
				BaseURL:  backup.URL,
				Model:    "backup-model",
			}},
		},
		Messages: []model.ChatMessage{{Role: "user", Content: "你好"}},
	})
	if err != nil {
		t.Fatalf("chat with failover: %v", err)
	}
	if len(resp.Choices) == 0 || strings.TrimSpace(resp.Choices[0].Message.Content) != "来自备用模型的回答" {
		t.Fatalf("expected backup answer, got %#v", resp.Choices)
	}
	if resp.Metadata["failoverUsed"] != true {
		t.Fatalf("expected failoverUsed metadata, got %#v", resp.Metadata)
	}
	if resp.Metadata["activeModel"] != "backup-model" {
		t.Fatalf("expected active backup model, got %#v", resp.Metadata["activeModel"])
	}
}

func TestLLMServiceChatReturnsFallbackWhenAllCandidatesFail(t *testing.T) {
	failureServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"error": map[string]any{"message": "upstream unavailable"},
		})
	}))
	defer failureServer.Close()

	service := &LLMService{client: failureServer.Client()}
	resp, err := service.Chat(model.ChatCompletionRequest{
		Config: model.ChatModelConfig{
			Provider:    "openai-compatible",
			BaseURL:     failureServer.URL,
			Model:       "primary-model",
			Temperature: 0.2,
			Candidates: []model.ModelEndpointConfig{{
				Provider: "openai-compatible",
				BaseURL:  failureServer.URL,
				Model:    "backup-model",
			}},
		},
		Messages: []model.ChatMessage{{Role: "user", Content: "你好"}},
	})
	if err != nil {
		t.Fatalf("chat fallback: %v", err)
	}
	if len(resp.Choices) == 0 || !strings.Contains(resp.Choices[0].Message.Content, "AI 模型调用失败") {
		t.Fatalf("expected fallback message, got %#v", resp.Choices)
	}
	if resp.Metadata["degraded"] != true {
		t.Fatalf("expected degraded metadata, got %#v", resp.Metadata)
	}
	if resp.Metadata["candidateCount"] != 2 {
		t.Fatalf("expected candidateCount 2, got %#v", resp.Metadata["candidateCount"])
	}
}

func TestRagServiceEmbeddingFailoverToCandidate(t *testing.T) {
	primary := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"error": map[string]any{"message": "primary embedding unavailable"},
		})
	}))
	defer primary.Close()

	backup := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": []map[string]any{{
				"index":     0,
				"embedding": []float64{0.1, 0.2, 0.3},
			}},
		})
	}))
	defer backup.Close()

	rag := NewRagService()
	rag.client = backup.Client()

	vectors, err := rag.EmbedTexts(t.Context(), model.EmbeddingModelConfig{
		Provider: "openai-compatible",
		BaseURL:  primary.URL,
		Model:    "primary-embed",
		Candidates: []model.ModelEndpointConfig{{
			Provider: "openai-compatible",
			BaseURL:  backup.URL,
			Model:    "backup-embed",
		}},
	}, []string{"embedding failover"}, 3)
	if err != nil {
		t.Fatalf("embedding failover: %v", err)
	}
	if len(vectors) != 1 {
		t.Fatalf("expected 1 vector, got %d", len(vectors))
	}
	if len(vectors[0]) != 3 || vectors[0][0] != 0.1 || vectors[0][1] != 0.2 || vectors[0][2] != 0.3 {
		t.Fatalf("expected backup embedding vector, got %#v", vectors[0])
	}
}

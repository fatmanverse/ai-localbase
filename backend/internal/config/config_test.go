package config

import "testing"

func TestLoadServerConfigDefaults(t *testing.T) {
	t.Setenv("QDRANT_VECTOR_SIZE", "")
	t.Setenv("OLLAMA_BASE_URL", "")

	cfg := LoadServerConfig()
	if cfg.QdrantVectorSize != 768 {
		t.Fatalf("expected default qdrant vector size 768, got %d", cfg.QdrantVectorSize)
	}
	if cfg.OllamaBaseURL != "http://localhost:11434" {
		t.Fatalf("expected default ollama base url, got %s", cfg.OllamaBaseURL)
	}
}

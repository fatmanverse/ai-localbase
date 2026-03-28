package config

import "testing"

func TestLoadServerConfigDefaults(t *testing.T) {
	t.Setenv("QDRANT_VECTOR_SIZE", "")
	t.Setenv("OLLAMA_BASE_URL", "")
	t.Setenv("ENABLE_HYBRID_SEARCH", "")
	t.Setenv("ENABLE_SEMANTIC_RERANKER", "")
	t.Setenv("ENABLE_QUERY_REWRITE", "")

	cfg := LoadServerConfig()
	if cfg.QdrantVectorSize != 768 {
		t.Fatalf("expected default qdrant vector size 768, got %d", cfg.QdrantVectorSize)
	}
	if cfg.OllamaBaseURL != "http://localhost:11434" {
		t.Fatalf("expected default ollama base url, got %s", cfg.OllamaBaseURL)
	}
	if !cfg.EnableHybridSearch {
		t.Fatal("expected hybrid search enabled by default")
	}
	if !cfg.EnableSemanticReranker {
		t.Fatal("expected semantic reranker enabled by default")
	}
	if !cfg.EnableQueryRewrite {
		t.Fatal("expected query rewrite enabled by default")
	}
}

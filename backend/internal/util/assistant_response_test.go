package util

import (
	"strings"
	"testing"
)

func TestPolishAssistantResponse_RemovesModelTone(t *testing.T) {
	input := "根据当前资料，这个问题可能由多种原因导致。\n\n您可以尝试先检查配置。"
	output := PolishAssistantResponse(input)

	if strings.Contains(output, "根据当前资料") {
		t.Fatalf("expected leading model phrase removed, got %q", output)
	}
	if strings.Contains(output, "可能由多种原因导致") {
		t.Fatalf("expected stock phrase normalized, got %q", output)
	}
	if strings.Contains(output, "您可以尝试") {
		t.Fatalf("expected user-facing phrase normalized, got %q", output)
	}
	if !strings.Contains(output, "常见原因一般有这几类") {
		t.Fatalf("expected normalized cause phrase, got %q", output)
	}
	if !strings.Contains(output, "先这样处理") {
		t.Fatalf("expected normalized action phrase, got %q", output)
	}
}

func TestPolishAssistantResponse_PreservesCodeFence(t *testing.T) {
	input := "作为 AI，先看结论。\n\n```bash\n您可以尝试 systemctl restart demo\n```"
	output := PolishAssistantResponse(input)

	if !strings.Contains(output, "```bash\n您可以尝试 systemctl restart demo\n```") {
		t.Fatalf("expected code fence kept as-is, got %q", output)
	}
	if strings.Contains(output, "作为 AI") {
		t.Fatalf("expected plain text prefix removed, got %q", output)
	}
}

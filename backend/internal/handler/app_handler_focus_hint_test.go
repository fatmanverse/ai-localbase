package handler

import (
	"testing"

	"ai-localbase/internal/model"
)

func TestBuildFigureReferenceSentenceUsesFocusHint(t *testing.T) {
	text := buildFigureReferenceSentence(2, model.ServiceDeskImageReference{FocusHint: "左侧导航菜单"})
	expected := "如图 2 所示，先看左侧导航菜单，再按后面的说明继续处理。"
	if text != expected {
		t.Fatalf("expected %q, got %q", expected, text)
	}
}

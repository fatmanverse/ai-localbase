package service

import (
	"testing"

	"ai-localbase/internal/model"
)

func TestResolveRelatedImagesIncludesFocusHint(t *testing.T) {
	svc := &AppService{
		state: &model.AppState{
			KnowledgeBases: map[string]model.KnowledgeBase{
				"kb-1": {
					ID: "kb-1",
					Documents: []model.Document{
						{
							ID:   "doc-1",
							Name: "审批手册",
							Images: []model.DocumentImageAsset{
								{
									ID:             "img-1",
									Included:       true,
									PublicURL:      "/assets/img-1.png",
									Description:    "审批页右上角有保存按钮",
									Classification: model.DocumentImageKeyOperation,
								},
							},
						},
					},
				},
			},
		},
	}

	items := svc.ResolveRelatedImages([]map[string]string{{
		"documentId": "doc-1",
		"imageIds":   "img-1",
	}})
	if len(items) != 1 {
		t.Fatalf("expected 1 related image, got %d", len(items))
	}
	if items[0].FocusHint != "右上角保存按钮" {
		t.Fatalf("expected focus hint %q, got %q", "右上角保存按钮", items[0].FocusHint)
	}
}

func TestExtractImageFocusHintBuildsNaturalPhrase(t *testing.T) {
	hint := extractImageFocusHint(model.DocumentImageAsset{Description: "审批页右上角有保存按钮"})
	if hint != "右上角保存按钮" {
		t.Fatalf("expected natural focus hint, got %q", hint)
	}
}

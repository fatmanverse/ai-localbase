package model

type DocumentImageClassification string

const (
	DocumentImageDecorative      DocumentImageClassification = "decorative"
	DocumentImageTextScreenshot  DocumentImageClassification = "text_screenshot"
	DocumentImageFlowDiagram     DocumentImageClassification = "flow_or_architecture"
	DocumentImageTableScreenshot DocumentImageClassification = "table_screenshot"
	DocumentImageKeyOperation    DocumentImageClassification = "key_operation_screenshot"
	DocumentImageMeaningfulOther DocumentImageClassification = "meaningful_other"
)

type DocumentImageAsset struct {
	ID             string                      `json:"id"`
	SourcePath     string                      `json:"sourcePath,omitempty"`
	SourceRef      string                      `json:"sourceRef,omitempty"`
	FileName       string                      `json:"fileName,omitempty"`
	PublicURL      string                      `json:"publicUrl,omitempty"`
	AltText        string                      `json:"altText,omitempty"`
	Classification DocumentImageClassification `json:"classification,omitempty"`
	Included       bool                        `json:"included"`
	OCRText        string                      `json:"ocrText,omitempty"`
	Description    string                      `json:"description,omitempty"`
	ContextBefore  string                      `json:"contextBefore,omitempty"`
	ContextAfter   string                      `json:"contextAfter,omitempty"`
	RetrievalText  string                      `json:"retrievalText,omitempty"`
}

type DocumentContent struct {
	Text   string               `json:"text"`
	Images []DocumentImageAsset `json:"images,omitempty"`
}

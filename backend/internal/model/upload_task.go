package model

type DocumentUploadTask struct {
	ID              string    `json:"id"`
	KnowledgeBaseID string    `json:"knowledgeBaseId"`
	DocumentID      string    `json:"documentId"`
	FileName        string    `json:"fileName"`
	FileSize        int64     `json:"fileSize"`
	FileSizeLabel   string    `json:"fileSizeLabel"`
	Status          string    `json:"status"`
	Stage           string    `json:"stage"`
	Progress        int       `json:"progress"`
	Message         string    `json:"message,omitempty"`
	Error           string    `json:"error,omitempty"`
	CreatedAt       string    `json:"createdAt"`
	UpdatedAt       string    `json:"updatedAt"`
	Uploaded        *Document `json:"uploaded,omitempty"`
}

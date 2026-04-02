package model

type APIErrorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type APIResponse struct {
	Success bool            `json:"success"`
	Data    any             `json:"data,omitempty"`
	Error   *APIErrorDetail `json:"error,omitempty"`
}

type ServiceDeskConversationContext struct {
	UserID         string         `json:"userId"`
	TenantID       string         `json:"tenantId"`
	TicketID       string         `json:"ticketId"`
	SourcePlatform string         `json:"sourcePlatform"`
	Category       string         `json:"category"`
	Priority       string         `json:"priority"`
	Tags           []string       `json:"tags,omitempty"`
	Metadata       map[string]any `json:"metadata,omitempty"`
}

type ServiceDeskSourceDocument struct {
	KnowledgeBaseID string `json:"knowledgeBaseId"`
	DocumentID      string `json:"documentId"`
	DocumentName    string `json:"documentName"`
}

type ServiceDeskImageReference struct {
	ID             string `json:"id"`
	DocumentID     string `json:"documentId,omitempty"`
	DocumentName   string `json:"documentName,omitempty"`
	Classification string `json:"classification,omitempty"`
	Description    string `json:"description,omitempty"`
	FocusHint      string `json:"focusHint,omitempty"`
	PublicURL      string `json:"publicUrl,omitempty"`
}

type ServiceDeskMessageTrace struct {
	KnowledgeBaseID  string                      `json:"knowledgeBaseId,omitempty"`
	DocumentID       string                      `json:"documentId,omitempty"`
	RetrievedContext string                      `json:"retrievedContext,omitempty"`
	SourceDocuments  []ServiceDeskSourceDocument `json:"sourceDocuments,omitempty"`
	RelatedImages    []ServiceDeskImageReference `json:"relatedImages,omitempty"`
	Degraded         bool                        `json:"degraded,omitempty"`
	FallbackStrategy string                      `json:"fallbackStrategy,omitempty"`
	UpstreamError    string                      `json:"upstreamError,omitempty"`
}

type ServiceDeskFeedbackSummary struct {
	LikeCount        int            `json:"likeCount"`
	DislikeCount     int            `json:"dislikeCount"`
	LatestFeedbackID string         `json:"latestFeedbackId,omitempty"`
	LatestFeedback   string         `json:"latestFeedback,omitempty"`
	Status           string         `json:"status,omitempty"`
	Metadata         map[string]any `json:"metadata,omitempty"`
}

type ServiceDeskMessage struct {
	ID              string                     `json:"id"`
	ConversationID  string                     `json:"conversationId"`
	Role            string                     `json:"role"`
	Content         string                     `json:"content"`
	MessageType     string                     `json:"messageType"`
	CreatedAt       string                     `json:"createdAt"`
	Trace           ServiceDeskMessageTrace    `json:"trace,omitempty"`
	FeedbackSummary ServiceDeskFeedbackSummary `json:"feedbackSummary,omitempty"`
	Metadata        map[string]any             `json:"metadata,omitempty"`
}

type ServiceDeskConversation struct {
	ID                 string                         `json:"id"`
	Title              string                         `json:"title"`
	Status             string                         `json:"status"`
	KnowledgeBaseID    string                         `json:"knowledgeBaseId"`
	CreatedAt          string                         `json:"createdAt"`
	UpdatedAt          string                         `json:"updatedAt"`
	Context            ServiceDeskConversationContext `json:"context"`
	SessionMetadata    map[string]any                 `json:"sessionMetadata,omitempty"`
	Messages           []ServiceDeskMessage           `json:"messages,omitempty"`
	LastMessagePreview string                         `json:"lastMessagePreview,omitempty"`
}

type CreateServiceDeskConversationRequest struct {
	Title           string                         `json:"title"`
	KnowledgeBaseID string                         `json:"knowledgeBaseId"`
	Status          string                         `json:"status"`
	Context         ServiceDeskConversationContext `json:"context"`
	SessionMetadata map[string]any                 `json:"sessionMetadata,omitempty"`
}

type SendServiceDeskMessageRequest struct {
	Content         string                         `json:"content"`
	KnowledgeBaseID string                         `json:"knowledgeBaseId,omitempty"`
	DocumentID      string                         `json:"documentId,omitempty"`
	Config          ChatModelConfig                `json:"config"`
	Embedding       EmbeddingModelConfig           `json:"embedding"`
	Context         ServiceDeskConversationContext `json:"context,omitempty"`
	SessionMetadata map[string]any                 `json:"sessionMetadata,omitempty"`
}

type SendServiceDeskMessageResponse struct {
	Conversation     ServiceDeskConversation `json:"conversation"`
	UserMessage      ServiceDeskMessage      `json:"userMessage"`
	AssistantMessage ServiceDeskMessage      `json:"assistantMessage"`
}

type ServiceDeskMessageFeedbackRequest struct {
	ConversationID   string                      `json:"conversationId"`
	MessageID        string                      `json:"messageId"`
	UserID           string                      `json:"userId,omitempty"`
	FeedbackType     string                      `json:"feedbackType"`
	FeedbackReason   string                      `json:"feedbackReason,omitempty"`
	FeedbackText     string                      `json:"feedbackText,omitempty"`
	QuestionText     string                      `json:"questionText,omitempty"`
	AnswerText       string                      `json:"answerText,omitempty"`
	KnowledgeBaseID  string                      `json:"knowledgeBaseId,omitempty"`
	KBVersion        string                      `json:"kbVersion,omitempty"`
	RetrievedContext string                      `json:"retrievedContext,omitempty"`
	SourceDocuments  []ServiceDeskSourceDocument `json:"sourceDocuments,omitempty"`
	SourcePlatform   string                      `json:"sourcePlatform,omitempty"`
	TenantID         string                      `json:"tenantId,omitempty"`
	TicketID         string                      `json:"ticketId,omitempty"`
	Metadata         map[string]any              `json:"metadata,omitempty"`
}

type ServiceDeskMessageFeedback struct {
	ID               string                      `json:"id"`
	ConversationID   string                      `json:"conversationId"`
	MessageID        string                      `json:"messageId"`
	UserID           string                      `json:"userId,omitempty"`
	FeedbackType     string                      `json:"feedbackType"`
	FeedbackReason   string                      `json:"feedbackReason,omitempty"`
	FeedbackText     string                      `json:"feedbackText,omitempty"`
	QuestionText     string                      `json:"questionText,omitempty"`
	AnswerText       string                      `json:"answerText,omitempty"`
	KnowledgeBaseID  string                      `json:"knowledgeBaseId,omitempty"`
	KBVersion        string                      `json:"kbVersion,omitempty"`
	RetrievedContext string                      `json:"retrievedContext,omitempty"`
	SourceDocuments  []ServiceDeskSourceDocument `json:"sourceDocuments,omitempty"`
	SourcePlatform   string                      `json:"sourcePlatform,omitempty"`
	TenantID         string                      `json:"tenantId,omitempty"`
	TicketID         string                      `json:"ticketId,omitempty"`
	Metadata         map[string]any              `json:"metadata,omitempty"`
	CreatedAt        string                      `json:"createdAt"`
}

type FAQCandidate struct {
	ID                           string `json:"id"`
	QuestionNormalized           string `json:"questionNormalized"`
	QuestionText                 string `json:"questionText"`
	AnswerText                   string `json:"answerText"`
	KnowledgeBaseID              string `json:"knowledgeBaseId,omitempty"`
	SourceMessageID              string `json:"sourceMessageId"`
	ConversationID               string `json:"conversationId"`
	LikeCount                    int    `json:"likeCount"`
	Status                       string `json:"status"`
	Owner                        string `json:"owner,omitempty"`
	Note                         string `json:"note,omitempty"`
	UpdatedBy                    string `json:"updatedBy,omitempty"`
	PublishedQuestion            string `json:"publishedQuestion,omitempty"`
	PublishedAnswer              string `json:"publishedAnswer,omitempty"`
	PublishedBy                  string `json:"publishedBy,omitempty"`
	PublishedAt                  string `json:"publishedAt,omitempty"`
	PublishNote                  string `json:"publishNote,omitempty"`
	LastPublishedKnowledgeBaseID string `json:"lastPublishedKnowledgeBaseId,omitempty"`
	LastPublishedDocumentID      string `json:"lastPublishedDocumentId,omitempty"`
	LastPublishedDocumentName    string `json:"lastPublishedDocumentName,omitempty"`
	LastPublishMode              string `json:"lastPublishMode,omitempty"`
	LastPublishedToKnowledgeAt   string `json:"lastPublishedToKnowledgeAt,omitempty"`
	KnowledgeBasePublishCount    int    `json:"knowledgeBasePublishCount,omitempty"`
	CreatedAt                    string `json:"createdAt"`
	UpdatedAt                    string `json:"updatedAt"`
}

type KnowledgeGap struct {
	ID                 string `json:"id"`
	QuestionNormalized string `json:"questionNormalized"`
	QuestionText       string `json:"questionText"`
	IssueType          string `json:"issueType"`
	KnowledgeBaseID    string `json:"knowledgeBaseId,omitempty"`
	SampleAnswer       string `json:"sampleAnswer,omitempty"`
	SuggestedAction    string `json:"suggestedAction,omitempty"`
	Count              int    `json:"count"`
	Status             string `json:"status"`
	Owner              string `json:"owner,omitempty"`
	Note               string `json:"note,omitempty"`
	UpdatedBy          string `json:"updatedBy,omitempty"`
	CreatedAt          string `json:"createdAt"`
	UpdatedAt          string `json:"updatedAt"`
}

type LowQualityAnswer struct {
	ID              string `json:"id"`
	SourceMessageID string `json:"sourceMessageId"`
	ConversationID  string `json:"conversationId"`
	QuestionText    string `json:"questionText"`
	AnswerText      string `json:"answerText"`
	KnowledgeBaseID string `json:"knowledgeBaseId,omitempty"`
	PrimaryReason   string `json:"primaryReason,omitempty"`
	DislikeCount    int    `json:"dislikeCount"`
	Status          string `json:"status"`
	Owner           string `json:"owner,omitempty"`
	Note            string `json:"note,omitempty"`
	UpdatedBy       string `json:"updatedBy,omitempty"`
	CreatedAt       string `json:"createdAt"`
	UpdatedAt       string `json:"updatedAt"`
}

type AnalyticsListOptions struct {
	Limit           int    `json:"limit,omitempty"`
	KnowledgeBaseID string `json:"knowledgeBaseId,omitempty"`
	Status          string `json:"status,omitempty"`
	FeedbackType    string `json:"feedbackType,omitempty"`
	FeedbackReason  string `json:"feedbackReason,omitempty"`
	IssueType       string `json:"issueType,omitempty"`
	Owner           string `json:"owner,omitempty"`
	PublishedOnly   bool   `json:"publishedOnly,omitempty"`
}

type AnalyticsStatusUpdateRequest struct {
	Status    *string `json:"status,omitempty"`
	Owner     *string `json:"owner,omitempty"`
	Note      *string `json:"note,omitempty"`
	UpdatedBy *string `json:"updatedBy,omitempty"`
}

type AnalyticsBatchUpdateRequest struct {
	IDs       []string `json:"ids"`
	Status    *string  `json:"status,omitempty"`
	Owner     *string  `json:"owner,omitempty"`
	Note      *string  `json:"note,omitempty"`
	UpdatedBy *string  `json:"updatedBy,omitempty"`
}

type AnalyticsBatchUpdateResponse struct {
	UpdatedCount int      `json:"updatedCount"`
	IDs          []string `json:"ids"`
}

type PublishFAQCandidateRequest struct {
	Question    string `json:"question,omitempty"`
	Answer      string `json:"answer,omitempty"`
	PublishedBy string `json:"publishedBy,omitempty"`
	Note        string `json:"note,omitempty"`
}

type PublishFAQToKnowledgeBaseRequest struct {
	Question                string `json:"question,omitempty"`
	Answer                  string `json:"answer,omitempty"`
	PublishedBy             string `json:"publishedBy,omitempty"`
	Note                    string `json:"note,omitempty"`
	KnowledgeBaseID         string `json:"knowledgeBaseId,omitempty"`
	DocumentName            string `json:"documentName,omitempty"`
	PublishMode             string `json:"publishMode,omitempty"`
	TargetDocumentID        string `json:"targetDocumentId,omitempty"`
	MarkAsDefaultCollection bool   `json:"markAsDefaultCollection,omitempty"`
}

type AnalyticsExportOptions struct {
	Scope  string `json:"scope"`
	Format string `json:"format,omitempty"`
	AnalyticsListOptions
}

type AnalyticsExportResponse struct {
	Scope    string `json:"scope"`
	Format   string `json:"format"`
	FileName string `json:"fileName"`
	MimeType string `json:"mimeType"`
	Content  string `json:"content"`
}

type PublishFAQCandidateResponse struct {
	Candidate FAQCandidate            `json:"candidate"`
	Export    AnalyticsExportResponse `json:"export"`
}

type PublishFAQToKnowledgeBaseResponse struct {
	Candidate FAQCandidate            `json:"candidate"`
	Export    AnalyticsExportResponse `json:"export"`
	Document  Document                `json:"document"`
}

type FAQPublishHistoryItem struct {
	ID              string `json:"id"`
	FAQCandidateID  string `json:"faqCandidateId"`
	KnowledgeBaseID string `json:"knowledgeBaseId"`
	DocumentID      string `json:"documentId"`
	DocumentName    string `json:"documentName"`
	PublishMode     string `json:"publishMode"`
	PublishedBy     string `json:"publishedBy,omitempty"`
	PublishedAt     string `json:"publishedAt"`
	QuestionText    string `json:"questionText,omitempty"`
	AnswerText      string `json:"answerText,omitempty"`
}

type GovernanceWeeklyReport struct {
	GeneratedAt          string                      `json:"generatedAt"`
	KnowledgeBaseID      string                      `json:"knowledgeBaseId,omitempty"`
	KnowledgeBaseName    string                      `json:"knowledgeBaseName,omitempty"`
	Summary              ServiceDeskAnalyticsSummary `json:"summary"`
	Highlights           []string                    `json:"highlights"`
	TopFAQCandidates     []FAQCandidate              `json:"topFaqCandidates"`
	TopKnowledgeGaps     []KnowledgeGap              `json:"topKnowledgeGaps"`
	TopLowQualityAnswers []LowQualityAnswer          `json:"topLowQualityAnswers"`
	Markdown             string                      `json:"markdown"`
}

type WeeklyFeedbackMetric struct {
	WeekStart    string `json:"weekStart"`
	LikeCount    int    `json:"likeCount"`
	DislikeCount int    `json:"dislikeCount"`
	TotalCount   int    `json:"totalCount"`
}

type ServiceDeskAnalyticsSummary struct {
	TotalFeedbacks       int                          `json:"totalFeedbacks"`
	LikeCount            int                          `json:"likeCount"`
	DislikeCount         int                          `json:"dislikeCount"`
	FAQPendingCount      int                          `json:"faqPendingCount"`
	KnowledgeGapCount    int                          `json:"knowledgeGapCount"`
	LowQualityOpenCount  int                          `json:"lowQualityOpenCount"`
	ThisWeekDislikeCount int                          `json:"thisWeekDislikeCount"`
	FAQCandidates        []FAQCandidate               `json:"faqCandidates"`
	KnowledgeGaps        []KnowledgeGap               `json:"knowledgeGaps"`
	LowQualityAnswers    []LowQualityAnswer           `json:"lowQualityAnswers"`
	RecentFeedback       []ServiceDeskMessageFeedback `json:"recentFeedback"`
	WeeklyMetrics        []WeeklyFeedbackMetric       `json:"weeklyMetrics"`
}

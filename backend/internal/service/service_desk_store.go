package service

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"ai-localbase/internal/model"
	"ai-localbase/internal/util"
)

func (s *SQLiteChatHistoryStore) initServiceDeskTables() error {
	if s == nil || s.db == nil {
		return fmt.Errorf("sqlite chat history store is nil")
	}

	statements := []string{
		`CREATE TABLE IF NOT EXISTS service_desk_conversations (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			status TEXT NOT NULL,
			knowledge_base_id TEXT NOT NULL,
			user_id TEXT NOT NULL DEFAULT '',
			tenant_id TEXT NOT NULL DEFAULT '',
			ticket_id TEXT NOT NULL DEFAULT '',
			source_platform TEXT NOT NULL DEFAULT '',
			category TEXT NOT NULL DEFAULT '',
			priority TEXT NOT NULL DEFAULT '',
			tags_json TEXT NOT NULL DEFAULT '[]',
			context_metadata_json TEXT NOT NULL DEFAULT '{}',
			session_metadata_json TEXT NOT NULL DEFAULT '{}',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS service_desk_messages (
			id TEXT PRIMARY KEY,
			conversation_id TEXT NOT NULL,
			role TEXT NOT NULL,
			content TEXT NOT NULL,
			message_type TEXT NOT NULL,
			created_at TEXT NOT NULL,
			trace_json TEXT NOT NULL DEFAULT '{}',
			metadata_json TEXT NOT NULL DEFAULT '{}',
			seq INTEGER NOT NULL,
			FOREIGN KEY(conversation_id) REFERENCES service_desk_conversations(id) ON DELETE CASCADE
		);`,
		`CREATE INDEX IF NOT EXISTS idx_service_desk_messages_conversation_seq ON service_desk_messages(conversation_id, seq);`,
		`CREATE TABLE IF NOT EXISTS message_feedback (
			id TEXT PRIMARY KEY,
			conversation_id TEXT NOT NULL,
			message_id TEXT NOT NULL,
			user_id TEXT NOT NULL DEFAULT '',
			feedback_type TEXT NOT NULL,
			feedback_reason TEXT NOT NULL DEFAULT '',
			feedback_text TEXT NOT NULL DEFAULT '',
			question_text TEXT NOT NULL DEFAULT '',
			answer_text TEXT NOT NULL DEFAULT '',
			knowledge_base_id TEXT NOT NULL DEFAULT '',
			kb_version TEXT NOT NULL DEFAULT '',
			retrieved_context TEXT NOT NULL DEFAULT '',
			source_documents_json TEXT NOT NULL DEFAULT '[]',
			source_platform TEXT NOT NULL DEFAULT '',
			tenant_id TEXT NOT NULL DEFAULT '',
			ticket_id TEXT NOT NULL DEFAULT '',
			metadata_json TEXT NOT NULL DEFAULT '{}',
			created_at TEXT NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_message_feedback_message_id ON message_feedback(message_id, created_at DESC);`,
		`CREATE INDEX IF NOT EXISTS idx_message_feedback_type ON message_feedback(feedback_type, created_at DESC);`,
		`CREATE TABLE IF NOT EXISTS faq_candidates (
			id TEXT PRIMARY KEY,
			question_normalized TEXT NOT NULL UNIQUE,
			question_text TEXT NOT NULL,
			answer_text TEXT NOT NULL,
			knowledge_base_id TEXT NOT NULL DEFAULT '',
			source_message_id TEXT NOT NULL,
			conversation_id TEXT NOT NULL,
			like_count INTEGER NOT NULL DEFAULT 0,
			status TEXT NOT NULL DEFAULT 'candidate',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS knowledge_gaps (
			id TEXT PRIMARY KEY,
			question_normalized TEXT NOT NULL,
			issue_type TEXT NOT NULL,
			question_text TEXT NOT NULL,
			sample_answer TEXT NOT NULL DEFAULT '',
			knowledge_base_id TEXT NOT NULL DEFAULT '',
			suggested_action TEXT NOT NULL DEFAULT '',
			count INTEGER NOT NULL DEFAULT 0,
			status TEXT NOT NULL DEFAULT 'pending',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			UNIQUE(question_normalized, issue_type)
		);`,
		`CREATE TABLE IF NOT EXISTS low_quality_answers (
			id TEXT PRIMARY KEY,
			source_message_id TEXT NOT NULL UNIQUE,
			conversation_id TEXT NOT NULL,
			question_text TEXT NOT NULL,
			answer_text TEXT NOT NULL,
			knowledge_base_id TEXT NOT NULL DEFAULT '',
			primary_reason TEXT NOT NULL DEFAULT '',
			dislike_count INTEGER NOT NULL DEFAULT 0,
			status TEXT NOT NULL DEFAULT 'open',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
	}

	for _, statement := range statements {
		if _, err := s.db.Exec(statement); err != nil {
			return fmt.Errorf("initialize service desk sqlite schema: %w", err)
		}
	}

	return nil
}

func (s *SQLiteChatHistoryStore) SaveServiceDeskConversation(conversation model.ServiceDeskConversation) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("sqlite chat history store is nil")
	}
	if strings.TrimSpace(conversation.ID) == "" {
		return fmt.Errorf("service desk conversation id is required")
	}

	tagsJSON, err := json.Marshal(conversation.Context.Tags)
	if err != nil {
		return fmt.Errorf("encode conversation tags: %w", err)
	}
	contextMetadataJSON := mustJSONMap(conversation.Context.Metadata)
	sessionMetadataJSON := mustJSONMap(conversation.SessionMetadata)

	_, err = s.db.Exec(
		`INSERT INTO service_desk_conversations (
			id, title, status, knowledge_base_id, user_id, tenant_id, ticket_id, source_platform, category, priority,
			tags_json, context_metadata_json, session_metadata_json, created_at, updated_at
		 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET
			title = excluded.title,
			status = excluded.status,
			knowledge_base_id = excluded.knowledge_base_id,
			user_id = excluded.user_id,
			tenant_id = excluded.tenant_id,
			ticket_id = excluded.ticket_id,
			source_platform = excluded.source_platform,
			category = excluded.category,
			priority = excluded.priority,
			tags_json = excluded.tags_json,
			context_metadata_json = excluded.context_metadata_json,
			session_metadata_json = excluded.session_metadata_json,
			created_at = excluded.created_at,
			updated_at = excluded.updated_at`,
		conversation.ID,
		strings.TrimSpace(conversation.Title),
		normalizeConversationStatus(conversation.Status),
		strings.TrimSpace(conversation.KnowledgeBaseID),
		strings.TrimSpace(conversation.Context.UserID),
		strings.TrimSpace(conversation.Context.TenantID),
		strings.TrimSpace(conversation.Context.TicketID),
		strings.TrimSpace(conversation.Context.SourcePlatform),
		strings.TrimSpace(conversation.Context.Category),
		strings.TrimSpace(conversation.Context.Priority),
		string(tagsJSON),
		contextMetadataJSON,
		sessionMetadataJSON,
		normalizeTimestamp(conversation.CreatedAt),
		normalizeTimestamp(conversation.UpdatedAt),
	)
	if err != nil {
		return fmt.Errorf("upsert service desk conversation: %w", err)
	}
	return nil
}

func (s *SQLiteChatHistoryStore) AppendServiceDeskMessages(conversationID string, messages []model.ServiceDeskMessage) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("sqlite chat history store is nil")
	}
	if len(messages) == 0 {
		return nil
	}

	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("begin sqlite transaction: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	maxSeq := 0
	if scanErr := tx.QueryRow(`SELECT COALESCE(MAX(seq), -1) + 1 FROM service_desk_messages WHERE conversation_id = ?`, conversationID).Scan(&maxSeq); scanErr != nil {
		err = fmt.Errorf("query current message seq: %w", scanErr)
		return err
	}

	for idx, message := range messages {
		traceJSON, marshalErr := json.Marshal(message.Trace)
		if marshalErr != nil {
			err = fmt.Errorf("encode message trace: %w", marshalErr)
			return err
		}
		metadataJSON := mustJSONMap(message.Metadata)
		if _, execErr := tx.Exec(
			`INSERT INTO service_desk_messages (id, conversation_id, role, content, message_type, created_at, trace_json, metadata_json, seq)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			message.ID,
			conversationID,
			strings.TrimSpace(message.Role),
			message.Content,
			normalizeMessageType(message.MessageType),
			normalizeTimestamp(message.CreatedAt),
			string(traceJSON),
			metadataJSON,
			maxSeq+idx,
		); execErr != nil {
			err = fmt.Errorf("insert service desk message: %w", execErr)
			return err
		}
	}

	if _, execErr := tx.Exec(`UPDATE service_desk_conversations SET updated_at = ? WHERE id = ?`, normalizeTimestamp(messages[len(messages)-1].CreatedAt), conversationID); execErr != nil {
		err = fmt.Errorf("update service desk conversation timestamp: %w", execErr)
		return err
	}

	if commitErr := tx.Commit(); commitErr != nil {
		return fmt.Errorf("commit sqlite transaction: %w", commitErr)
	}
	return nil
}

func (s *SQLiteChatHistoryStore) GetServiceDeskConversation(id string) (*model.ServiceDeskConversation, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("sqlite chat history store is nil")
	}
	conversationID := strings.TrimSpace(id)
	if conversationID == "" {
		return nil, fmt.Errorf("conversation id is required")
	}

	var (
		conversation        model.ServiceDeskConversation
		tagsJSON            string
		contextMetadataJSON string
		sessionMetadataJSON string
	)
	if err := s.db.QueryRow(
		`SELECT id, title, status, knowledge_base_id, user_id, tenant_id, ticket_id, source_platform, category, priority,
		        tags_json, context_metadata_json, session_metadata_json, created_at, updated_at
		 FROM service_desk_conversations WHERE id = ?`, conversationID,
	).Scan(
		&conversation.ID,
		&conversation.Title,
		&conversation.Status,
		&conversation.KnowledgeBaseID,
		&conversation.Context.UserID,
		&conversation.Context.TenantID,
		&conversation.Context.TicketID,
		&conversation.Context.SourcePlatform,
		&conversation.Context.Category,
		&conversation.Context.Priority,
		&tagsJSON,
		&contextMetadataJSON,
		&sessionMetadataJSON,
		&conversation.CreatedAt,
		&conversation.UpdatedAt,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get service desk conversation: %w", err)
	}
	_ = json.Unmarshal([]byte(tagsJSON), &conversation.Context.Tags)
	_ = json.Unmarshal([]byte(contextMetadataJSON), &conversation.Context.Metadata)
	_ = json.Unmarshal([]byte(sessionMetadataJSON), &conversation.SessionMetadata)

	messages, err := s.ListServiceDeskMessages(conversationID)
	if err != nil {
		return nil, err
	}
	conversation.Messages = messages
	if len(messages) > 0 {
		conversation.LastMessagePreview = buildPreview(messages[len(messages)-1].Content)
	}
	return &conversation, nil
}

func (s *SQLiteChatHistoryStore) ListServiceDeskMessages(conversationID string) ([]model.ServiceDeskMessage, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("sqlite chat history store is nil")
	}
	rows, err := s.db.Query(
		`SELECT id, conversation_id, role, content, message_type, created_at, trace_json, metadata_json
		 FROM service_desk_messages WHERE conversation_id = ? ORDER BY seq ASC`,
		conversationID,
	)
	if err != nil {
		return nil, fmt.Errorf("query service desk messages: %w", err)
	}
	defer rows.Close()

	summaryMap, err := s.feedbackSummaryMap(conversationID)
	if err != nil {
		return nil, err
	}

	messages := make([]model.ServiceDeskMessage, 0)
	for rows.Next() {
		var (
			message      model.ServiceDeskMessage
			traceJSON    string
			metadataJSON string
		)
		if err := rows.Scan(&message.ID, &message.ConversationID, &message.Role, &message.Content, &message.MessageType, &message.CreatedAt, &traceJSON, &metadataJSON); err != nil {
			return nil, fmt.Errorf("scan service desk message: %w", err)
		}
		if strings.TrimSpace(traceJSON) != "" && traceJSON != "{}" {
			_ = json.Unmarshal([]byte(traceJSON), &message.Trace)
		}
		if strings.TrimSpace(metadataJSON) != "" && metadataJSON != "{}" {
			_ = json.Unmarshal([]byte(metadataJSON), &message.Metadata)
		}
		if summary, ok := summaryMap[message.ID]; ok {
			message.FeedbackSummary = summary
		}
		messages = append(messages, message)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate service desk messages: %w", err)
	}
	return messages, nil
}

func (s *SQLiteChatHistoryStore) SaveServiceDeskFeedback(feedback model.ServiceDeskMessageFeedback) (*model.ServiceDeskMessageFeedback, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("sqlite chat history store is nil")
	}
	feedback.MessageID = strings.TrimSpace(feedback.MessageID)
	feedback.ConversationID = strings.TrimSpace(feedback.ConversationID)
	feedback.FeedbackType = normalizeFeedbackType(feedback.FeedbackType)
	feedback.FeedbackReason = normalizeFeedbackReason(feedback.FeedbackReason)
	if feedback.MessageID == "" || feedback.ConversationID == "" {
		return nil, fmt.Errorf("messageId and conversationId are required")
	}
	if feedback.FeedbackType == "" {
		return nil, fmt.Errorf("feedbackType must be like or dislike")
	}
	if strings.TrimSpace(feedback.ID) == "" {
		feedback.ID = util.NextID("feedback")
	}
	feedback.CreatedAt = normalizeTimestamp(feedback.CreatedAt)
	sourceDocumentsJSON, err := json.Marshal(feedback.SourceDocuments)
	if err != nil {
		return nil, fmt.Errorf("encode feedback source documents: %w", err)
	}
	metadataJSON := mustJSONMap(feedback.Metadata)

	tx, err := s.db.Begin()
	if err != nil {
		return nil, fmt.Errorf("begin sqlite transaction: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	if _, err = tx.Exec(
		`INSERT INTO message_feedback (
			id, conversation_id, message_id, user_id, feedback_type, feedback_reason, feedback_text, question_text, answer_text,
			knowledge_base_id, kb_version, retrieved_context, source_documents_json, source_platform, tenant_id, ticket_id, metadata_json, created_at
		 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		feedback.ID,
		feedback.ConversationID,
		feedback.MessageID,
		strings.TrimSpace(feedback.UserID),
		feedback.FeedbackType,
		feedback.FeedbackReason,
		strings.TrimSpace(feedback.FeedbackText),
		strings.TrimSpace(feedback.QuestionText),
		strings.TrimSpace(feedback.AnswerText),
		strings.TrimSpace(feedback.KnowledgeBaseID),
		strings.TrimSpace(feedback.KBVersion),
		strings.TrimSpace(feedback.RetrievedContext),
		string(sourceDocumentsJSON),
		strings.TrimSpace(feedback.SourcePlatform),
		strings.TrimSpace(feedback.TenantID),
		strings.TrimSpace(feedback.TicketID),
		metadataJSON,
		feedback.CreatedAt,
	); err != nil {
		return nil, fmt.Errorf("insert feedback: %w", err)
	}

	if err = s.refreshFeedbackArtifacts(tx, feedback); err != nil {
		return nil, err
	}

	if err = tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit feedback transaction: %w", err)
	}
	return &feedback, nil
}

func (s *SQLiteChatHistoryStore) GetServiceDeskAnalyticsSummary() (model.ServiceDeskAnalyticsSummary, error) {
	if s == nil || s.db == nil {
		return model.ServiceDeskAnalyticsSummary{}, fmt.Errorf("sqlite chat history store is nil")
	}
	summary := model.ServiceDeskAnalyticsSummary{}
	if err := s.db.QueryRow(`SELECT COUNT(1), COALESCE(SUM(CASE WHEN feedback_type = 'like' THEN 1 ELSE 0 END), 0), COALESCE(SUM(CASE WHEN feedback_type = 'dislike' THEN 1 ELSE 0 END), 0) FROM message_feedback`).Scan(&summary.TotalFeedbacks, &summary.LikeCount, &summary.DislikeCount); err != nil {
		return summary, fmt.Errorf("query feedback totals: %w", err)
	}

	var err error
	summary.FAQCandidates, err = s.ListFAQCandidates(20)
	if err != nil {
		return summary, err
	}
	summary.KnowledgeGaps, err = s.ListKnowledgeGaps(20)
	if err != nil {
		return summary, err
	}
	summary.LowQualityAnswers, err = s.ListLowQualityAnswers(20)
	if err != nil {
		return summary, err
	}
	recentFeedback, err := s.ListRecentFeedback(200)
	if err != nil {
		return summary, err
	}
	summary.WeeklyMetrics = buildWeeklyMetrics(recentFeedback)
	if len(recentFeedback) > 20 {
		summary.RecentFeedback = recentFeedback[:20]
	} else {
		summary.RecentFeedback = recentFeedback
	}
	return summary, nil
}

func (s *SQLiteChatHistoryStore) ListFAQCandidates(limit int) ([]model.FAQCandidate, error) {
	rows, err := s.db.Query(`SELECT id, question_normalized, question_text, answer_text, knowledge_base_id, source_message_id, conversation_id, like_count, status, created_at, updated_at FROM faq_candidates WHERE like_count >= 2 ORDER BY like_count DESC, updated_at DESC LIMIT ?`, normalizeLimit(limit, 20))
	if err != nil {
		return nil, fmt.Errorf("list faq candidates: %w", err)
	}
	defer rows.Close()
	items := make([]model.FAQCandidate, 0)
	for rows.Next() {
		var item model.FAQCandidate
		if err := rows.Scan(&item.ID, &item.QuestionNormalized, &item.QuestionText, &item.AnswerText, &item.KnowledgeBaseID, &item.SourceMessageID, &item.ConversationID, &item.LikeCount, &item.Status, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan faq candidate: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *SQLiteChatHistoryStore) ListKnowledgeGaps(limit int) ([]model.KnowledgeGap, error) {
	rows, err := s.db.Query(`SELECT id, question_normalized, question_text, issue_type, knowledge_base_id, sample_answer, suggested_action, count, status, created_at, updated_at FROM knowledge_gaps WHERE count >= 1 ORDER BY count DESC, updated_at DESC LIMIT ?`, normalizeLimit(limit, 20))
	if err != nil {
		return nil, fmt.Errorf("list knowledge gaps: %w", err)
	}
	defer rows.Close()
	items := make([]model.KnowledgeGap, 0)
	for rows.Next() {
		var item model.KnowledgeGap
		if err := rows.Scan(&item.ID, &item.QuestionNormalized, &item.QuestionText, &item.IssueType, &item.KnowledgeBaseID, &item.SampleAnswer, &item.SuggestedAction, &item.Count, &item.Status, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan knowledge gap: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *SQLiteChatHistoryStore) ListLowQualityAnswers(limit int) ([]model.LowQualityAnswer, error) {
	rows, err := s.db.Query(`SELECT id, source_message_id, conversation_id, question_text, answer_text, knowledge_base_id, primary_reason, dislike_count, status, created_at, updated_at FROM low_quality_answers WHERE dislike_count >= 1 ORDER BY dislike_count DESC, updated_at DESC LIMIT ?`, normalizeLimit(limit, 20))
	if err != nil {
		return nil, fmt.Errorf("list low quality answers: %w", err)
	}
	defer rows.Close()
	items := make([]model.LowQualityAnswer, 0)
	for rows.Next() {
		var item model.LowQualityAnswer
		if err := rows.Scan(&item.ID, &item.SourceMessageID, &item.ConversationID, &item.QuestionText, &item.AnswerText, &item.KnowledgeBaseID, &item.PrimaryReason, &item.DislikeCount, &item.Status, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan low quality answer: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *SQLiteChatHistoryStore) ListRecentFeedback(limit int) ([]model.ServiceDeskMessageFeedback, error) {
	rows, err := s.db.Query(`SELECT id, conversation_id, message_id, user_id, feedback_type, feedback_reason, feedback_text, question_text, answer_text, knowledge_base_id, kb_version, retrieved_context, source_documents_json, source_platform, tenant_id, ticket_id, metadata_json, created_at FROM message_feedback ORDER BY created_at DESC LIMIT ?`, normalizeLimit(limit, 20))
	if err != nil {
		return nil, fmt.Errorf("list recent feedback: %w", err)
	}
	defer rows.Close()
	items := make([]model.ServiceDeskMessageFeedback, 0)
	for rows.Next() {
		var item model.ServiceDeskMessageFeedback
		var sourceJSON, metadataJSON string
		if err := rows.Scan(&item.ID, &item.ConversationID, &item.MessageID, &item.UserID, &item.FeedbackType, &item.FeedbackReason, &item.FeedbackText, &item.QuestionText, &item.AnswerText, &item.KnowledgeBaseID, &item.KBVersion, &item.RetrievedContext, &sourceJSON, &item.SourcePlatform, &item.TenantID, &item.TicketID, &metadataJSON, &item.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan recent feedback: %w", err)
		}
		_ = json.Unmarshal([]byte(sourceJSON), &item.SourceDocuments)
		_ = json.Unmarshal([]byte(metadataJSON), &item.Metadata)
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *SQLiteChatHistoryStore) feedbackSummaryMap(conversationID string) (map[string]model.ServiceDeskFeedbackSummary, error) {
	rows, err := s.db.Query(`SELECT message_id,
		COALESCE(SUM(CASE WHEN feedback_type = 'like' THEN 1 ELSE 0 END), 0) AS like_count,
		COALESCE(SUM(CASE WHEN feedback_type = 'dislike' THEN 1 ELSE 0 END), 0) AS dislike_count,
		MAX(created_at) AS latest_created_at
		FROM message_feedback WHERE conversation_id = ? GROUP BY message_id`, conversationID)
	if err != nil {
		return nil, fmt.Errorf("query feedback summary: %w", err)
	}
	defer rows.Close()
	result := make(map[string]model.ServiceDeskFeedbackSummary)
	for rows.Next() {
		var messageID, latestCreatedAt string
		var likeCount, dislikeCount int
		if err := rows.Scan(&messageID, &likeCount, &dislikeCount, &latestCreatedAt); err != nil {
			return nil, fmt.Errorf("scan feedback summary: %w", err)
		}
		summary := model.ServiceDeskFeedbackSummary{LikeCount: likeCount, DislikeCount: dislikeCount}
		if dislikeCount > likeCount {
			summary.Status = "needs-improvement"
		} else if likeCount > 0 {
			summary.Status = "helpful"
		}
		var latestID, latestType, latestReason string
		if err := s.db.QueryRow(`SELECT id, feedback_type, feedback_reason FROM message_feedback WHERE message_id = ? AND created_at = ? ORDER BY id DESC LIMIT 1`, messageID, latestCreatedAt).Scan(&latestID, &latestType, &latestReason); err == nil {
			summary.LatestFeedbackID = latestID
			summary.LatestFeedback = strings.TrimSpace(strings.Join([]string{latestType, latestReason}, ":"))
		}
		result[messageID] = summary
	}
	return result, rows.Err()
}

func (s *SQLiteChatHistoryStore) refreshFeedbackArtifacts(tx *sql.Tx, feedback model.ServiceDeskMessageFeedback) error {
	normalizedQuestion := normalizeQuestionText(feedback.QuestionText)
	now := normalizeTimestamp(feedback.CreatedAt)

	if feedback.FeedbackType == "like" && normalizedQuestion != "" && strings.TrimSpace(feedback.AnswerText) != "" {
		var likeCount int
		if err := tx.QueryRow(`SELECT COUNT(1) FROM message_feedback WHERE message_id = ? AND feedback_type = 'like'`, feedback.MessageID).Scan(&likeCount); err != nil {
			return fmt.Errorf("query like count: %w", err)
		}
		if _, err := tx.Exec(
			`INSERT INTO faq_candidates (id, question_normalized, question_text, answer_text, knowledge_base_id, source_message_id, conversation_id, like_count, status, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'candidate', ?, ?)
			 ON CONFLICT(question_normalized) DO UPDATE SET
			   question_text = excluded.question_text,
			   answer_text = excluded.answer_text,
			   knowledge_base_id = excluded.knowledge_base_id,
			   source_message_id = excluded.source_message_id,
			   conversation_id = excluded.conversation_id,
			   like_count = excluded.like_count,
			   updated_at = excluded.updated_at`,
			util.NextID("faq"),
			normalizedQuestion,
			strings.TrimSpace(feedback.QuestionText),
			strings.TrimSpace(feedback.AnswerText),
			strings.TrimSpace(feedback.KnowledgeBaseID),
			feedback.MessageID,
			feedback.ConversationID,
			likeCount,
			now,
			now,
		); err != nil {
			return fmt.Errorf("upsert faq candidate: %w", err)
		}
	}

	if feedback.FeedbackType == "dislike" {
		var dislikeCount int
		if err := tx.QueryRow(`SELECT COUNT(1) FROM message_feedback WHERE message_id = ? AND feedback_type = 'dislike'`, feedback.MessageID).Scan(&dislikeCount); err != nil {
			return fmt.Errorf("query dislike count: %w", err)
		}
		if _, err := tx.Exec(
			`INSERT INTO low_quality_answers (id, source_message_id, conversation_id, question_text, answer_text, knowledge_base_id, primary_reason, dislike_count, status, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
			 ON CONFLICT(source_message_id) DO UPDATE SET
			   conversation_id = excluded.conversation_id,
			   question_text = excluded.question_text,
			   answer_text = excluded.answer_text,
			   knowledge_base_id = excluded.knowledge_base_id,
			   primary_reason = excluded.primary_reason,
			   dislike_count = excluded.dislike_count,
			   updated_at = excluded.updated_at`,
			util.NextID("lqa"),
			feedback.MessageID,
			feedback.ConversationID,
			strings.TrimSpace(feedback.QuestionText),
			strings.TrimSpace(feedback.AnswerText),
			strings.TrimSpace(feedback.KnowledgeBaseID),
			feedback.FeedbackReason,
			dislikeCount,
			now,
			now,
		); err != nil {
			return fmt.Errorf("upsert low quality answer: %w", err)
		}

		if normalizedQuestion != "" {
			issueType := feedback.FeedbackReason
			if issueType == "" {
				issueType = "其他"
			}
			if _, err := tx.Exec(
				`INSERT INTO knowledge_gaps (id, question_normalized, issue_type, question_text, sample_answer, knowledge_base_id, suggested_action, count, status, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'pending', ?, ?)
				 ON CONFLICT(question_normalized, issue_type) DO UPDATE SET
				   question_text = excluded.question_text,
				   sample_answer = excluded.sample_answer,
				   knowledge_base_id = excluded.knowledge_base_id,
				   suggested_action = excluded.suggested_action,
				   count = knowledge_gaps.count + 1,
				   updated_at = excluded.updated_at`,
				util.NextID("gap"),
				normalizedQuestion,
				issueType,
				strings.TrimSpace(feedback.QuestionText),
				strings.TrimSpace(feedback.AnswerText),
				strings.TrimSpace(feedback.KnowledgeBaseID),
				suggestedActionByReason(issueType),
				now,
				now,
			); err != nil {
				return fmt.Errorf("upsert knowledge gap: %w", err)
			}
		}
	}

	return nil
}

func normalizeConversationStatus(status string) string {
	trimmed := strings.TrimSpace(strings.ToLower(status))
	if trimmed == "" {
		return "open"
	}
	return trimmed
}

func normalizeMessageType(messageType string) string {
	trimmed := strings.TrimSpace(strings.ToLower(messageType))
	if trimmed == "" {
		return "text"
	}
	return trimmed
}

func normalizeFeedbackType(feedbackType string) string {
	trimmed := strings.TrimSpace(strings.ToLower(feedbackType))
	switch trimmed {
	case "like", "dislike":
		return trimmed
	default:
		return ""
	}
}

func normalizeFeedbackReason(reason string) string {
	trimmed := strings.TrimSpace(reason)
	switch trimmed {
	case "答非所问", "内容不准确", "内容不完整", "内容过时", "没有解决问题", "检索结果不相关", "图片文字未识别", "图片内容未召回", "图文理解不完整", "图片描述不准确", "图片信息过时", "其他":
		return trimmed
	default:
		return trimmed
	}
}

func normalizeQuestionText(question string) string {
	trimmed := strings.TrimSpace(strings.ToLower(question))
	if trimmed == "" {
		return ""
	}
	return strings.Join(strings.Fields(trimmed), " ")
}

func suggestedActionByReason(reason string) string {
	switch reason {
	case "答非所问", "检索结果不相关":
		return "检查检索召回范围、TopK 与提示词是否偏离用户问题"
	case "内容不准确", "内容不完整":
		return "补充知识文档或修正 FAQ 标准答案"
	case "内容过时":
		return "更新文档版本并补充最新制度/流程说明"
	case "没有解决问题":
		return "补充工单处置步骤与人工兜底指引"
	case "图片文字未识别", "图片内容未召回", "图文理解不完整", "图片描述不准确":
		return "检查图片提取、OCR、图片描述与图文关联策略是否完整"
	case "图片信息过时":
		return "替换过时截图/流程图，并重新索引图片型知识"
	default:
		return "归类问题后补充知识与回答模板"
	}
}

func mustJSONMap(value map[string]any) string {
	if len(value) == 0 {
		return "{}"
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		return "{}"
	}
	return string(encoded)
}

func buildPreview(content string) string {
	trimmed := strings.TrimSpace(content)
	runes := []rune(trimmed)
	if len(runes) > 48 {
		return string(runes[:48]) + "..."
	}
	return trimmed
}

func normalizeLimit(limit, fallback int) int {
	if limit <= 0 {
		return fallback
	}
	if limit > 100 {
		return 100
	}
	return limit
}

func buildWeeklyMetrics(items []model.ServiceDeskMessageFeedback) []model.WeeklyFeedbackMetric {
	bucket := make(map[string]*model.WeeklyFeedbackMetric)
	for _, item := range items {
		ts, err := time.Parse(time.RFC3339, normalizeTimestamp(item.CreatedAt))
		if err != nil {
			continue
		}
		weekday := int(ts.Weekday())
		if weekday == 0 {
			weekday = 7
		}
		weekStart := ts.AddDate(0, 0, -(weekday - 1)).UTC().Format("2006-01-02")
		metric := bucket[weekStart]
		if metric == nil {
			metric = &model.WeeklyFeedbackMetric{WeekStart: weekStart}
			bucket[weekStart] = metric
		}
		metric.TotalCount++
		if item.FeedbackType == "like" {
			metric.LikeCount++
		} else if item.FeedbackType == "dislike" {
			metric.DislikeCount++
		}
	}
	result := make([]model.WeeklyFeedbackMetric, 0, len(bucket))
	for _, metric := range bucket {
		result = append(result, *metric)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].WeekStart > result[j].WeekStart })
	return result
}

package service

import (
	"sort"
	"strings"

	"ai-localbase/internal/util"
)

const (
	DocumentChunkTypeText              = "text"
	DocumentChunkTypeImage             = "image"
	DocumentChunkTypeFAQ               = "faq"
	DocumentChunkTypeOperationSteps    = "operation_steps"
	DocumentChunkTypeParameters        = "parameters"
	DocumentChunkTypeTroubleshooting   = "troubleshooting"
	documentChunkProfileImageKnowledge = "image"
)

func inferDocumentChunkMetadata(documentName string, fallbackProfile util.DocumentChunkProfile, text string, imageIDs []string) (string, string, string) {
	topic := util.ExtractChunkTopic(text)
	if isImageKnowledgeChunk(text, imageIDs) {
		return DocumentChunkTypeImage, documentChunkProfileImageKnowledge, topic
	}

	profile := fallbackProfile
	if profile == util.DocumentChunkProfileGeneric {
		profile = util.DetectDocumentChunkProfile(documentName, text)
	}

	switch profile {
	case util.DocumentChunkProfileFAQ:
		return DocumentChunkTypeFAQ, string(profile), topic
	case util.DocumentChunkProfileOperationSteps:
		return DocumentChunkTypeOperationSteps, string(profile), topic
	case util.DocumentChunkProfileParameters:
		return DocumentChunkTypeParameters, string(profile), topic
	case util.DocumentChunkProfileTroubleshooting:
		return DocumentChunkTypeTroubleshooting, string(profile), topic
	default:
		return DocumentChunkTypeText, string(util.DocumentChunkProfileGeneric), topic
	}
}

func isImageKnowledgeChunk(text string, imageIDs []string) bool {
	if len(imageIDs) > 0 {
		return true
	}
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return false
	}
	markers := []string{"图片ID:", "图片ID：", "图片类型:", "图片类型：", "图片说明:", "图片说明：", "图片OCR:", "图片OCR：", "图片标题:", "图片标题："}
	for _, marker := range markers {
		if strings.Contains(trimmed, marker) {
			return true
		}
	}
	return false
}

func buildQdrantFilter(documentID, chunkType string) map[string]any {
	clauses := make([]map[string]any, 0, 2)
	if trimmed := strings.TrimSpace(documentID); trimmed != "" {
		clauses = append(clauses, map[string]any{
			"key":   "document_id",
			"match": map[string]any{"value": trimmed},
		})
	}
	if trimmed := strings.TrimSpace(chunkType); trimmed != "" {
		clauses = append(clauses, map[string]any{
			"key":   "chunk_type",
			"match": map[string]any{"value": trimmed},
		})
	}
	if len(clauses) == 0 {
		return map[string]any{}
	}
	return map[string]any{"must": clauses}
}

func mergeSearchResultsByChunkID(groups ...[]SearchResult) []SearchResult {
	if len(groups) == 0 {
		return nil
	}
	dedup := make(map[string]SearchResult)
	for _, group := range groups {
		for _, item := range group {
			key := payloadString(item.Payload, "chunk_id", item.ID)
			if key == "" {
				key = item.ID
			}
			existing, ok := dedup[key]
			if !ok || item.Score > existing.Score {
				dedup[key] = item
			}
		}
	}
	merged := make([]SearchResult, 0, len(dedup))
	for _, item := range dedup {
		merged = append(merged, item)
	}
	sort.Slice(merged, func(i, j int) bool {
		if merged[i].Score == merged[j].Score {
			return merged[i].ID < merged[j].ID
		}
		return merged[i].Score > merged[j].Score
	})
	return merged
}

func searchResultToRetrievedChunk(item SearchResult, fallbackKnowledgeBaseID string) (RetrievedChunk, bool) {
	chunkID := payloadString(item.Payload, "chunk_id", item.ID)
	text := payloadString(item.Payload, "text", "")
	if strings.TrimSpace(text) == "" {
		return RetrievedChunk{}, false
	}
	documentName := payloadString(item.Payload, "document_name", "未知文档")
	imageIDs := payloadStrings(item.Payload, "image_ids")
	fallbackProfile := util.DetectDocumentChunkProfile(documentName, text)
	inferredType, inferredProfile, inferredTopic := inferDocumentChunkMetadata(documentName, fallbackProfile, text, imageIDs)
	chunkType := payloadString(item.Payload, "chunk_type", inferredType)
	chunkProfile := payloadString(item.Payload, "chunk_profile", inferredProfile)
	topic := payloadString(item.Payload, "chunk_topic", inferredTopic)

	return RetrievedChunk{
		DocumentChunk: DocumentChunk{
			ID:              chunkID,
			KnowledgeBaseID: payloadString(item.Payload, "knowledge_base_id", fallbackKnowledgeBaseID),
			DocumentID:      payloadString(item.Payload, "document_id", ""),
			DocumentName:    documentName,
			Text:            text,
			Index:           payloadInt(item.Payload, "chunk_index"),
			ImageIDs:        imageIDs,
			ChunkType:       chunkType,
			ChunkProfile:    chunkProfile,
			Topic:           topic,
		},
		Score: item.Score,
	}, true
}

func searchResultsToRetrievedChunks(items []SearchResult, fallbackKnowledgeBaseID string) []RetrievedChunk {
	if len(items) == 0 {
		return nil
	}
	results := make([]RetrievedChunk, 0, len(items))
	for _, item := range items {
		chunk, ok := searchResultToRetrievedChunk(item, fallbackKnowledgeBaseID)
		if !ok {
			continue
		}
		results = append(results, chunk)
	}
	return results
}

func adjustPerDocumentLimitForQuery(limit int, query string) int {
	if limit <= 0 {
		return limit
	}
	if util.IsImageIntentQuery(query) {
		return limit + 1
	}
	return limit
}

func isImageChunk(chunk RetrievedChunk) bool {
	return chunk.ChunkType == DocumentChunkTypeImage || len(chunk.ImageIDs) > 0 || isImageKnowledgeChunk(chunk.Text, chunk.ImageIDs)
}

func imageIntentBoost(query string, chunk RetrievedChunk) float64 {
	if !util.IsImageIntentQuery(query) {
		return 0
	}
	if !isImageChunk(chunk) {
		return 0
	}
	boost := 0.08
	if chunk.Topic != "" {
		boost += 0.03 * keywordCoverage(query, chunk.Topic)
	}
	if strings.Contains(chunk.Text, "图片说明") || strings.Contains(chunk.Text, "图片OCR") {
		boost += 0.01
	}
	return boost
}

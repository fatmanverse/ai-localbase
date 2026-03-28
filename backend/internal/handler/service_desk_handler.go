package handler

import (
	"net/http"
	"strings"

	"ai-localbase/internal/model"

	"github.com/gin-gonic/gin"
)

func (h *AppHandler) CreateServiceDeskConversation(c *gin.Context) {
	if h.serviceDeskService == nil {
		writeAPIError(c, http.StatusServiceUnavailable, "service_desk_unavailable", "service desk service is not configured")
		return
	}
	var req model.CreateServiceDeskConversationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeAPIError(c, http.StatusBadRequest, "invalid_request", "invalid service desk conversation request body")
		return
	}
	conversation, err := h.serviceDeskService.CreateConversation(req)
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "create_conversation_failed", err.Error())
		return
	}
	writeAPISuccess(c, http.StatusCreated, conversation)
}

func (h *AppHandler) GetServiceDeskConversation(c *gin.Context) {
	if h.serviceDeskService == nil {
		writeAPIError(c, http.StatusServiceUnavailable, "service_desk_unavailable", "service desk service is not configured")
		return
	}
	conversation, err := h.serviceDeskService.GetConversation(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusInternalServerError, "get_conversation_failed", err.Error())
		return
	}
	if conversation == nil {
		writeAPIError(c, http.StatusNotFound, "conversation_not_found", "conversation not found")
		return
	}
	writeAPISuccess(c, http.StatusOK, conversation)
}

func (h *AppHandler) ListServiceDeskConversationMessages(c *gin.Context) {
	if h.serviceDeskService == nil {
		writeAPIError(c, http.StatusServiceUnavailable, "service_desk_unavailable", "service desk service is not configured")
		return
	}
	messages, err := h.serviceDeskService.ListMessages(c.Param("id"))
	if err != nil {
		writeAPIError(c, http.StatusInternalServerError, "list_messages_failed", err.Error())
		return
	}
	writeAPISuccess(c, http.StatusOK, gin.H{
		"conversationId": c.Param("id"),
		"items":          messages,
	})
}

func (h *AppHandler) SendServiceDeskMessage(c *gin.Context) {
	if h.serviceDeskService == nil {
		writeAPIError(c, http.StatusServiceUnavailable, "service_desk_unavailable", "service desk service is not configured")
		return
	}
	var req model.SendServiceDeskMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeAPIError(c, http.StatusBadRequest, "invalid_request", "invalid service desk message request body")
		return
	}
	response, err := h.serviceDeskService.SendMessage(c.Param("id"), req)
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "send_message_failed", err.Error())
		return
	}
	writeAPISuccess(c, http.StatusOK, response)
}

func (h *AppHandler) StreamServiceDeskMessage(c *gin.Context) {
	if h.serviceDeskService == nil {
		writeAPIError(c, http.StatusServiceUnavailable, "service_desk_unavailable", "service desk service is not configured")
		return
	}
	var req model.SendServiceDeskMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeAPIError(c, http.StatusBadRequest, "invalid_request", "invalid service desk message request body")
		return
	}

	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no")
	c.Status(http.StatusOK)

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		writeAPIError(c, http.StatusInternalServerError, "stream_unsupported", "streaming is not supported")
		return
	}

	_, err := h.serviceDeskService.StreamMessage(c.Param("id"), req, func(event string, payload map[string]any) error {
		c.SSEvent(event, payload)
		flusher.Flush()
		return nil
	})
	if err != nil {
		c.SSEvent("error", gin.H{"error": err.Error()})
		flusher.Flush()
	}
}

func (h *AppHandler) SubmitServiceDeskFeedback(c *gin.Context) {
	if h.serviceDeskService == nil {
		writeAPIError(c, http.StatusServiceUnavailable, "service_desk_unavailable", "service desk service is not configured")
		return
	}
	var req model.ServiceDeskMessageFeedbackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeAPIError(c, http.StatusBadRequest, "invalid_request", "invalid feedback request body")
		return
	}
	if strings.TrimSpace(req.MessageID) == "" {
		req.MessageID = c.Param("id")
	}
	feedback, err := h.serviceDeskService.SubmitFeedback(req)
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, "submit_feedback_failed", err.Error())
		return
	}
	writeAPISuccess(c, http.StatusCreated, feedback)
}

func (h *AppHandler) GetServiceDeskAnalyticsSummary(c *gin.Context) {
	if h.serviceDeskService == nil {
		writeAPIError(c, http.StatusServiceUnavailable, "service_desk_unavailable", "service desk service is not configured")
		return
	}
	summary, err := h.serviceDeskService.AnalyticsSummary()
	if err != nil {
		writeAPIError(c, http.StatusInternalServerError, "analytics_failed", err.Error())
		return
	}
	writeAPISuccess(c, http.StatusOK, summary)
}

func writeAPISuccess(c *gin.Context, statusCode int, data any) {
	c.JSON(statusCode, model.APIResponse{Success: true, Data: data})
}

func writeAPIError(c *gin.Context, statusCode int, code string, message string) {
	c.JSON(statusCode, model.APIResponse{
		Success: false,
		Error:   &model.APIErrorDetail{Code: code, Message: message},
	})
}

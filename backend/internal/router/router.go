package router

import (
	"net/http"

	"ai-localbase/internal/handler"

	"github.com/gin-gonic/gin"
)

func NewRouter(appHandler *handler.AppHandler) *gin.Engine {
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery(), corsMiddleware())

	r.GET("/", appHandler.Root)
	r.GET("/health", appHandler.Health)
	r.GET("/api/assets/*path", appHandler.ServeAsset)
	r.POST("/upload", appHandler.Upload)

	api := r.Group("/api")
	{
		api.GET("/config", appHandler.GetConfig)
		api.PUT("/config", appHandler.UpdateConfig)
		api.GET("/conversations", appHandler.ListConversations)
		api.GET("/conversations/:id", appHandler.GetConversation)
		api.PUT("/conversations/:id", appHandler.SaveConversation)
		api.POST("/conversations/:id/messages/:messageId/feedback", appHandler.SubmitConversationFeedback)
		api.DELETE("/conversations/:id", appHandler.DeleteConversation)
		api.GET("/knowledge-bases", appHandler.ListKnowledgeBases)
		api.POST("/knowledge-bases", appHandler.CreateKnowledgeBase)
		api.DELETE("/knowledge-bases/:id", appHandler.DeleteKnowledgeBase)
		api.GET("/knowledge-bases/:id/documents", appHandler.ListDocuments)
		api.POST("/knowledge-bases/:id/documents", appHandler.UploadToKnowledgeBase)
		api.POST("/knowledge-bases/:id/document-uploads", appHandler.StartAsyncUploadToKnowledgeBase)
		api.GET("/knowledge-bases/:id/document-uploads/:taskId", appHandler.GetUploadTask)
		api.DELETE("/knowledge-bases/:id/document-uploads/:taskId", appHandler.CancelUploadTask)
		api.POST("/knowledge-bases/:id/reindex", appHandler.ReindexKnowledgeBase)
		api.POST("/knowledge-bases/:id/documents/:documentId/reindex", appHandler.ReindexDocument)
		api.DELETE("/knowledge-bases/:id/documents/:documentId", appHandler.DeleteDocument)

		serviceDesk := api.Group("/service-desk")
		{
			serviceDesk.POST("/conversations", appHandler.CreateServiceDeskConversation)
			serviceDesk.GET("/conversations/:id", appHandler.GetServiceDeskConversation)
			serviceDesk.GET("/conversations/:id/messages", appHandler.ListServiceDeskConversationMessages)
			serviceDesk.POST("/conversations/:id/messages", appHandler.SendServiceDeskMessage)
			serviceDesk.POST("/conversations/:id/messages/stream", appHandler.StreamServiceDeskMessage)
			serviceDesk.POST("/messages/:id/feedback", appHandler.SubmitServiceDeskFeedback)
			serviceDesk.GET("/analytics/summary", appHandler.GetServiceDeskAnalyticsSummary)
			serviceDesk.GET("/analytics/faq-candidates", appHandler.ListServiceDeskFAQCandidates)
			serviceDesk.PATCH("/analytics/faq-candidates/:id", appHandler.UpdateServiceDeskFAQCandidateStatus)
			serviceDesk.PATCH("/analytics/faq-candidates/batch", appHandler.BatchUpdateServiceDeskFAQCandidates)
			serviceDesk.GET("/analytics/knowledge-gaps", appHandler.ListServiceDeskKnowledgeGaps)
			serviceDesk.PATCH("/analytics/knowledge-gaps/:id", appHandler.UpdateServiceDeskKnowledgeGapStatus)
			serviceDesk.PATCH("/analytics/knowledge-gaps/batch", appHandler.BatchUpdateServiceDeskKnowledgeGaps)
			serviceDesk.GET("/analytics/low-quality-answers", appHandler.ListServiceDeskLowQualityAnswers)
			serviceDesk.PATCH("/analytics/low-quality-answers/:id", appHandler.UpdateServiceDeskLowQualityAnswerStatus)
			serviceDesk.PATCH("/analytics/low-quality-answers/batch", appHandler.BatchUpdateServiceDeskLowQualityAnswers)
			serviceDesk.GET("/analytics/feedback", appHandler.ListServiceDeskFeedback)
		}
	}

	v1 := r.Group("/v1")
	{
		v1.POST("/chat/completions", appHandler.ChatCompletions)
		v1.POST("/chat/completions/stream", appHandler.ChatCompletionsStream)
	}

	return r
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

package service

import (
	"context"
	"fmt"
	"sync"

	"ai-localbase/internal/model"
	"ai-localbase/internal/util"
)

type UploadTaskProgressCallback func(stage string, progress int, message string)

const (
	uploadTaskTypeUpload  = "upload"
	uploadTaskTypeReindex = "reindex"
)

type UploadTaskService struct {
	mu         sync.RWMutex
	tasks      map[string]*model.DocumentUploadTask
	cancelFunc map[string]context.CancelFunc
}

func NewUploadTaskService() *UploadTaskService {
	return &UploadTaskService{
		tasks:      map[string]*model.DocumentUploadTask{},
		cancelFunc: map[string]context.CancelFunc{},
	}
}

func (s *UploadTaskService) CreateTask(document model.Document) model.DocumentUploadTask {
	return s.createTask(document, uploadTaskTypeUpload, "uploaded", 5, "文件已上传，等待开始解析")
}

func (s *UploadTaskService) CreateReindexTask(document model.Document) model.DocumentUploadTask {
	return s.createTask(document, uploadTaskTypeReindex, "queued", 8, "文档已进入重跑解析队列")
}

func (s *UploadTaskService) createTask(document model.Document, taskType, stage string, progress int, message string) model.DocumentUploadTask {
	now := util.NowRFC3339()
	prefix := "task"
	if taskType == uploadTaskTypeUpload {
		prefix = "upload"
	} else if taskType == uploadTaskTypeReindex {
		prefix = "reindex"
	}
	task := model.DocumentUploadTask{
		ID:              util.NextID(prefix),
		TaskType:        taskType,
		KnowledgeBaseID: document.KnowledgeBaseID,
		DocumentID:      document.ID,
		FileName:        document.Name,
		FileSize:        document.Size,
		FileSizeLabel:   document.SizeLabel,
		Status:          "processing",
		Stage:           stage,
		Progress:        clampTaskProgress(progress),
		Message:         message,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	s.mu.Lock()
	taskCopy := task
	s.tasks[task.ID] = &taskCopy
	s.mu.Unlock()
	return task
}

func (s *UploadTaskService) GetTask(taskID string) (model.DocumentUploadTask, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	task, ok := s.tasks[taskID]
	if !ok || task == nil {
		return model.DocumentUploadTask{}, false
	}
	copyTask := *task
	return copyTask, true
}

func (s *UploadTaskService) UpdateTask(taskID string, update func(task *model.DocumentUploadTask)) (model.DocumentUploadTask, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	task, ok := s.tasks[taskID]
	if !ok || task == nil {
		return model.DocumentUploadTask{}, fmt.Errorf("upload task not found")
	}
	update(task)
	task.UpdatedAt = util.NowRFC3339()
	copyTask := *task
	return copyTask, nil
}

func (s *UploadTaskService) StartTask(
	taskID string,
	runner func(ctx context.Context, progress UploadTaskProgressCallback) (model.Document, error),
) error {
	ctx, cancel := context.WithCancel(context.Background())

	s.mu.Lock()
	task, ok := s.tasks[taskID]
	if !ok || task == nil {
		s.mu.Unlock()
		cancel()
		return fmt.Errorf("upload task not found")
	}
	taskType := task.TaskType
	s.cancelFunc[taskID] = cancel
	task.Status = "processing"
	task.Stage = "queued"
	task.Progress = 10
	task.Message = queuedTaskMessage(taskType)
	task.UpdatedAt = util.NowRFC3339()
	s.mu.Unlock()

	go func() {
		document, err := runner(ctx, func(stage string, progress int, message string) {
			_, _ = s.UpdateTask(taskID, func(task *model.DocumentUploadTask) {
				if task.Status == "canceled" {
					return
				}
				task.Status = "processing"
				task.Stage = stage
				task.Progress = clampTaskProgress(progress)
				task.Message = message
			})
		})

		s.mu.Lock()
		defer s.mu.Unlock()
		delete(s.cancelFunc, taskID)
		task, ok := s.tasks[taskID]
		if !ok || task == nil {
			return
		}
		task.UpdatedAt = util.NowRFC3339()

		if err != nil {
			if ctx.Err() == context.Canceled || task.Status == "canceled" {
				task.Status = "canceled"
				task.Stage = "canceled"
				task.Progress = clampTaskProgress(max(task.Progress, 100))
				task.Message = canceledTaskMessage(task.TaskType)
				task.Error = canceledTaskMessage(task.TaskType)
				return
			}
			task.Status = "error"
			task.Stage = "failed"
			task.Progress = clampTaskProgress(max(task.Progress, 100))
			task.Message = failedTaskMessage(task.TaskType)
			task.Error = err.Error()
			return
		}

		task.Status = "success"
		task.Stage = "completed"
		task.Progress = 100
		task.Message = successTaskMessage(task.TaskType)
		task.Error = ""
		docCopy := document
		task.Uploaded = &docCopy
	}()

	return nil
}

func (s *UploadTaskService) CancelTask(taskID string) (model.DocumentUploadTask, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	task, ok := s.tasks[taskID]
	if !ok || task == nil {
		return model.DocumentUploadTask{}, fmt.Errorf("upload task not found")
	}
	if cancel, exists := s.cancelFunc[taskID]; exists && cancel != nil {
		cancel()
	}
	task.Status = "canceled"
	task.Stage = "canceled"
	task.Progress = clampTaskProgress(max(task.Progress, 100))
	task.Message = cancelingTaskMessage(task.TaskType)
	task.Error = canceledTaskMessage(task.TaskType)
	task.UpdatedAt = util.NowRFC3339()
	copyTask := *task
	return copyTask, nil
}

func clampTaskProgress(progress int) int {
	if progress < 0 {
		return 0
	}
	if progress > 100 {
		return 100
	}
	return progress
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func queuedTaskMessage(taskType string) string {
	if taskType == uploadTaskTypeReindex {
		return "任务已创建，准备重新解析文档"
	}
	return "任务已创建，准备开始解析"
}

func cancelingTaskMessage(taskType string) string {
	if taskType == uploadTaskTypeReindex {
		return "正在取消重跑解析任务"
	}
	return "正在取消上传任务"
}

func canceledTaskMessage(taskType string) string {
	if taskType == uploadTaskTypeReindex {
		return "重跑解析任务已取消"
	}
	return "上传任务已取消"
}

func failedTaskMessage(taskType string) string {
	if taskType == uploadTaskTypeReindex {
		return "文档重跑解析失败"
	}
	return "文档处理失败"
}

func successTaskMessage(taskType string) string {
	if taskType == uploadTaskTypeReindex {
		return "文档已完成重新解析并更新索引"
	}
	return "文档已完成解析、切片和入库"
}

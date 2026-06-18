package handlers

import (
	"net/http"
	"strconv"

	"backend/models"
	"backend/ws"

	"github.com/labstack/echo/v5"
	"gorm.io/gorm"
)

// MakeListNotes 返回笔记列表 handler，支持 ?q= 全文搜索。
func MakeListNotes(db *gorm.DB) echo.HandlerFunc {
	return func(c *echo.Context) error {
		var notes []models.Note
		q := c.QueryParam("q")
		tx := db.Order("updated_at DESC")
		if q != "" {
			like := "%" + q + "%"
			tx = tx.Where("title LIKE ? OR content LIKE ?", like, like)
		}
		if err := tx.Find(&notes).Error; err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		}
		return c.JSON(http.StatusOK, notes)
	}
}

// MakeGetNote 返回单条笔记 handler。
func MakeGetNote(db *gorm.DB) echo.HandlerFunc {
	return func(c *echo.Context) error {
		id, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "无效的 ID"})
		}
		var note models.Note
		if err := db.First(&note, id).Error; err != nil {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "笔记不存在"})
		}
		return c.JSON(http.StatusOK, note)
	}
}

// MakeCreateNote 返回创建笔记 handler。
func MakeCreateNote(db *gorm.DB) echo.HandlerFunc {
	return func(c *echo.Context) error {
		var note models.Note
		if err := c.Bind(&note); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "无效的请求体"})
		}
		if note.Title == "" {
			note.Title = "未命名笔记"
		}
		if err := db.Create(&note).Error; err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		}
		ws.Broadcast(ws.WsMessage{Type: "note_created", Note: &note})
		return c.JSON(http.StatusCreated, note)
	}
}

// MakeUpdateNote 返回更新笔记 handler。
func MakeUpdateNote(db *gorm.DB) echo.HandlerFunc {
	return func(c *echo.Context) error {
		id, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "无效的 ID"})
		}
		var note models.Note
		if err := db.First(&note, id).Error; err != nil {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "笔记不存在"})
		}
		var input struct {
			Title   string `json:"title"`
			Content string `json:"content"`
			FolderID *uint `json:"folder_id"`
		}
		if err := c.Bind(&input); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "无效的请求体"})
		}
		updates := map[string]any{
			"title":   input.Title,
			"content": input.Content,
		}
		if input.FolderID != nil {
			updates["folder_id"] = *input.FolderID
		}
		if err := db.Model(&note).Updates(updates).Error; err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		}
		ws.Broadcast(ws.WsMessage{Type: "note_updated", Note: &note})
		return c.JSON(http.StatusOK, note)
	}
}

// MakeDeleteNote 返回删除笔记 handler。
func MakeDeleteNote(db *gorm.DB) echo.HandlerFunc {
	return func(c *echo.Context) error {
		id, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "无效的 ID"})
		}
		if err := db.Delete(&models.Note{}, id).Error; err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		}
		ws.Broadcast(ws.WsMessage{Type: "note_deleted", ID: uint(id)})
		return c.JSON(http.StatusOK, map[string]string{"message": "已删除"})
	}
}

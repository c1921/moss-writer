package handlers

import (
	"net/http"
	"strconv"

	"backend/models"
	"backend/ws"

	"github.com/labstack/echo/v5"
	"gorm.io/gorm"
)

// MakeListFolders 返回文件夹列表 handler。
func MakeListFolders(db *gorm.DB) echo.HandlerFunc {
	return func(c *echo.Context) error {
		var folders []models.Folder
		if err := db.Order("name ASC").Find(&folders).Error; err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		}
		return c.JSON(http.StatusOK, folders)
	}
}

// MakeCreateFolder 返回创建文件夹 handler。
func MakeCreateFolder(db *gorm.DB) echo.HandlerFunc {
	return func(c *echo.Context) error {
		var input struct {
			Name     string `json:"name"`
			ParentID *uint  `json:"parent_id"`
		}
		if err := c.Bind(&input); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "无效的请求体"})
		}
		if input.Name == "" {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "文件夹名称不能为空"})
		}
		folder := models.Folder{Name: input.Name, ParentID: input.ParentID}
		if err := db.Create(&folder).Error; err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		}
		ws.Broadcast(ws.WsMessage{Type: "folder_created", Folder: &folder})
		return c.JSON(http.StatusCreated, folder)
	}
}

// MakeRenameFolder 返回重命名文件夹 handler。
func MakeRenameFolder(db *gorm.DB) echo.HandlerFunc {
	return func(c *echo.Context) error {
		id, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "无效的 ID"})
		}
		var folder models.Folder
		if err := db.First(&folder, id).Error; err != nil {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "文件夹不存在"})
		}
		var input struct {
			Name string `json:"name"`
		}
		if err := c.Bind(&input); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "无效的请求体"})
		}
		if input.Name == "" {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "文件夹名称不能为空"})
		}
		if err := db.Model(&folder).Update("name", input.Name).Error; err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		}
		ws.Broadcast(ws.WsMessage{Type: "folder_updated", Folder: &folder})
		return c.JSON(http.StatusOK, folder)
	}
}

// MakeDeleteFolder 返回删除文件夹 handler（笔记的 folder_id 置空）。
func MakeDeleteFolder(db *gorm.DB) echo.HandlerFunc {
	return func(c *echo.Context) error {
		id, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "无效的 ID"})
		}
		// 将该文件夹下的笔记的 folder_id 置空
		if err := db.Model(&models.Note{}).Where("folder_id = ?", id).Update("folder_id", nil).Error; err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		}
		// 删除文件夹
		if err := db.Delete(&models.Folder{}, id).Error; err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		}
		ws.Broadcast(ws.WsMessage{Type: "folder_deleted", ID: uint(id)})
		return c.JSON(http.StatusOK, map[string]string{"message": "已删除"})
	}
}

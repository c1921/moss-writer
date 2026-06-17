package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"

	"backend/models"

	"github.com/labstack/echo/v5"
	"github.com/labstack/echo/v5/middleware"
	"github.com/olahol/melody"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

var (
	db *gorm.DB
	m  *melody.Melody
)

// WsMessage WebSocket 消息结构
type WsMessage struct {
	Type string       `json:"type"`
	Note *models.Note `json:"note,omitempty"`
	ID   uint         `json:"id,omitempty"`
}

func initDB() {
	var err error
	db, err = gorm.Open(sqlite.Open("data/notes.db"), &gorm.Config{})
	if err != nil {
		log.Fatalf("数据库连接失败: %v", err)
	}
	if err := db.AutoMigrate(&models.Note{}); err != nil {
		log.Fatalf("数据库迁移失败: %v", err)
	}
	log.Println("数据库初始化完成")
}

func initMelody() {
	m = melody.New()
	m.Upgrader.CheckOrigin = func(r *http.Request) bool { return true }

	m.HandleConnect(func(s *melody.Session) {
		log.Printf("WebSocket 客户端连接: %s", s.RemoteAddr())
	})

	m.HandleDisconnect(func(s *melody.Session) {
		log.Printf("WebSocket 客户端断开: %s", s.RemoteAddr())
	})
}

// broadcast 广播 WebSocket 消息给所有连接的客户端
func broadcast(msg WsMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("序列化 WebSocket 消息失败: %v", err)
		return
	}
	if err := m.Broadcast(data); err != nil {
		log.Printf("广播消息失败: %v", err)
	}
}

// ---- Handlers ----

// listNotes 获取笔记列表，支持 ?q= 全文搜索
func listNotes(c *echo.Context) error {
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

// getNote 获取单条笔记
func getNote(c *echo.Context) error {
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

// createNote 创建笔记
func createNote(c *echo.Context) error {
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
	broadcast(WsMessage{Type: "note_created", Note: &note})
	return c.JSON(http.StatusCreated, note)
}

// updateNote 更新笔记
func updateNote(c *echo.Context) error {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "无效的 ID"})
	}
	var note models.Note
	if err := db.First(&note, id).Error; err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "笔记不存在"})
	}
	var input models.Note
	if err := c.Bind(&input); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "无效的请求体"})
	}
	note.Title = input.Title
	note.Content = input.Content
	if err := db.Save(&note).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	broadcast(WsMessage{Type: "note_updated", Note: &note})
	return c.JSON(http.StatusOK, note)
}

// deleteNote 删除笔记
func deleteNote(c *echo.Context) error {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "无效的 ID"})
	}
	if err := db.Delete(&models.Note{}, id).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	broadcast(WsMessage{Type: "note_deleted", ID: uint(id)})
	return c.JSON(http.StatusOK, map[string]string{"message": "已删除"})
}

func main() {
	// 初始化
	initDB()
	initMelody()

	// Echo 实例
	e := echo.New()

	// 中间件
	e.Use(middleware.RequestLogger())
	e.Use(middleware.Recover())

	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{"http://localhost:5173", "http://127.0.0.1:5173"},
		AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodOptions},
		AllowHeaders: []string{"Content-Type"},
	}))

	// RESTful 路由
	api := e.Group("/api")
	notes := api.Group("/notes")
	notes.GET("", listNotes)
	notes.GET("/:id", getNote)
	notes.POST("", createNote)
	notes.PUT("/:id", updateNote)
	notes.DELETE("/:id", deleteNote)

	// WebSocket 端点
	e.GET("/ws", func(c *echo.Context) error {
		return m.HandleRequest(c.Response(), c.Request())
	})

	// 启动服务
	addr := ":8080"
	fmt.Printf("服务启动于 http://localhost%s\n", addr)
	if err := e.Start(addr); err != nil {
		log.Fatalf("服务启动失败: %v", err)
	}
}

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

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

// envOrDefault 返回环境变量值或默认值
func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// WsMessage WebSocket 消息结构
type WsMessage struct {
	Type string       `json:"type"`
	Note *models.Note `json:"note,omitempty"`
	ID   uint         `json:"id,omitempty"`
}

func initDB() {
	var err error
	dbPath := envOrDefault("DB_PATH", "data/notes.db")
	// 确保数据目录存在
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		log.Fatalf("创建数据目录失败: %v", err)
	}
	db, err = gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		log.Fatalf("数据库连接失败: %v", err)
	}
	if err := db.AutoMigrate(&models.Note{}); err != nil {
		log.Fatalf("数据库迁移失败: %v", err)
	}
	log.Printf("数据库初始化完成 (%s)", dbPath)
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

	// CORS：仅当 CORS_ORIGINS 环境变量设置时启用（开发模式）
	corsOrigins := os.Getenv("CORS_ORIGINS")
	if corsOrigins != "" {
		origins := strings.Split(corsOrigins, ",")
		for i := range origins {
			origins[i] = strings.TrimSpace(origins[i])
		}
		e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
			AllowOrigins: origins,
			AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodOptions},
			AllowHeaders: []string{"Content-Type"},
		}))
		log.Printf("CORS 已启用，允许来源: %v", origins)
	}

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

	// SPA 静态文件托管（Docker 模式）
	spaDir := os.Getenv("SPA_STATIC_DIR")
	if spaDir != "" {
		log.Printf("静态文件服务启用: %s", spaDir)
		// 静态资源（JS/CSS/图片等）
		e.Static("/assets", filepath.Join(spaDir, "assets"))
		// 直接访问的根文件
		e.File("/favicon.svg", filepath.Join(spaDir, "favicon.svg"))
		e.GET("/", func(c *echo.Context) error {
			return c.File(filepath.Join(spaDir, "index.html"))
		})
		// SPA fallback: 非 API/WS/assets 的路径返回 index.html
		e.RouteNotFound("/*", func(c *echo.Context) error {
			path := c.Request().URL.Path
			if strings.HasPrefix(path, "/api") || strings.HasPrefix(path, "/ws") || strings.HasPrefix(path, "/assets") {
				return c.JSON(http.StatusNotFound, map[string]string{"error": "未找到"})
			}
			return c.File(filepath.Join(spaDir, "index.html"))
		})
	}

	// 启动服务（使用自定义 http.Server 以支持优雅关闭）
	addr := ":" + envOrDefault("PORT", "8080")
	srv := &http.Server{
		Addr:    addr,
		Handler: e,
	}
	fmt.Printf("服务启动于 http://localhost%s\n", addr)

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("服务启动失败: %v", err)
		}
	}()

	// 等待中断信号
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("正在优雅关闭服务…")

	// 关闭 WebSocket（通知客户端并停止接受新连接）
	if err := m.Close(); err != nil {
		log.Printf("关闭 WebSocket 失败: %v", err)
	}

	// 关闭 HTTP 服务，给予 10 秒完成进行中的请求
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("关闭 HTTP 服务失败: %v", err)
	}

	// 关闭数据库连接
	sqlDB, err := db.DB()
	if err != nil {
		log.Printf("获取数据库实例失败: %v", err)
	} else if err := sqlDB.Close(); err != nil {
		log.Printf("关闭数据库失败: %v", err)
	}

	log.Println("服务已关闭")
}

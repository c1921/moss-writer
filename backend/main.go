package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"backend/handlers"
	"backend/store"
	"backend/ws"

	"github.com/labstack/echo/v5"
	"github.com/labstack/echo/v5/middleware"
)

// envOrDefault 返回环境变量值或默认值。
func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	// ---- 初始化 ----
	store.Init()
	ws.Init()

	// ---- Echo 实例 ----
	e := echo.New()

	// ---- 中间件 ----
	e.Use(middleware.RequestLogger())
	e.Use(middleware.Recover())

	// CORS：生产模式（SPA 同源托管）自动禁用；开发模式智能启用
	corsOrigins := os.Getenv("CORS_ORIGINS")
	spaDir := os.Getenv("SPA_STATIC_DIR")
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
	} else if spaDir == "" {
		e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
			AllowOrigins: []string{"http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000", "http://127.0.0.1:3000"},
			AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodOptions},
			AllowHeaders: []string{"Content-Type"},
		}))
		log.Println("CORS 已自动启用（开发模式），允许来源: localhost:5173, localhost:3000")
	}

	// ---- RESTful 路由 ----
	api := e.Group("/api")
	notes := api.Group("/notes")
	notes.GET("", handlers.MakeListNotes(store.DB()))
	notes.GET("/:id", handlers.MakeGetNote(store.DB()))
	notes.POST("", handlers.MakeCreateNote(store.DB()))
	notes.PUT("/:id", handlers.MakeUpdateNote(store.DB()))
	notes.DELETE("/:id", handlers.MakeDeleteNote(store.DB()))

	// Settings 键值配置
	settings := api.Group("/settings")
	settings.GET("/:key", handlers.MakeGetSetting(store.DB()))
	settings.PUT("/:key", handlers.MakePutSetting(store.DB()))

	// WebSocket 端点
	e.GET("/ws", func(c *echo.Context) error {
		return ws.HandleRequest(c.Response(), c.Request())
	})

	// ---- 文件夹路由 ----
	folders := api.Group("/folders")
	folders.GET("", handlers.MakeListFolders(store.DB()))
	folders.POST("", handlers.MakeCreateFolder(store.DB()))
	folders.PUT("/:id", handlers.MakeRenameFolder(store.DB()))
	folders.DELETE("/:id", handlers.MakeDeleteFolder(store.DB()))

	// ---- SPA 静态文件托管（Docker 模式） ----
	if spaDir != "" {
		log.Printf("静态文件服务启用: %s", spaDir)
		e.Static("/assets", filepath.Join(spaDir, "assets"))
		e.File("/favicon.svg", filepath.Join(spaDir, "favicon.svg"))
		e.GET("/", func(c *echo.Context) error {
			return c.File(filepath.Join(spaDir, "index.html"))
		})
		e.RouteNotFound("/*", func(c *echo.Context) error {
			path := c.Request().URL.Path
			if strings.HasPrefix(path, "/api") || strings.HasPrefix(path, "/ws") || strings.HasPrefix(path, "/assets") {
				return c.JSON(http.StatusNotFound, map[string]string{"error": "未找到"})
			}
			return c.File(filepath.Join(spaDir, "index.html"))
		})
	}

	// ---- 启动服务（http.Server 支持优雅关闭） ----
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

	// ---- 优雅关闭 ----
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("正在优雅关闭服务…")

	if err := ws.Close(); err != nil {
		log.Printf("关闭 WebSocket 失败: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("关闭 HTTP 服务失败: %v", err)
	}

	store.Close()
	log.Println("服务已关闭")
}

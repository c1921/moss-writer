package main

import (
	"log/slog"
	"net/http"
	"os"
	"path/filepath"

	"backend/models"

	"github.com/glebarez/sqlite"
	"github.com/labstack/echo/v5"
	"github.com/labstack/echo/v5/middleware"
	"gorm.io/gorm"
)

var db *gorm.DB

func main() {
	// Ensure data directory exists
	dataDir := filepath.Join(".", "data")
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		panic(err)
	}

	// Initialize SQLite
	var err error
	db, err = gorm.Open(sqlite.Open(filepath.Join(dataDir, "notes.db")), &gorm.Config{})
	if err != nil {
		panic(err)
	}

	// AutoMigrate
	if err := db.AutoMigrate(&models.Note{}); err != nil {
		panic(err)
	}

	// Initialize Echo
	e := echo.New()

	// CORS — allow all origins in development MVP
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		UnsafeAllowOriginFunc: func(c *echo.Context, origin string) (string, bool, error) {
			return origin, true, nil
		},
		AllowMethods:     []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodOptions},
		AllowHeaders:     []string{echo.HeaderContentType, echo.HeaderOrigin, echo.HeaderAccept},
		AllowCredentials: true,
	}))

	// Routes
	api := e.Group("/api/notes")

	api.GET("", listNotes)
	api.GET("/:id", getNote)
	api.POST("", createNote)
	api.PUT("/:id", updateNote)
	api.DELETE("/:id", deleteNote)

	// Start server
	if err := e.Start(":8080"); err != nil {
		slog.Error("server error", "error", err)
		os.Exit(1)
	}
}

// listNotes GET /api/notes
func listNotes(c *echo.Context) error {
	var notes []models.Note
	if err := db.Order("updated_at DESC").Find(&notes).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]any{"error": err.Error()})
	}
	return c.JSON(http.StatusOK, notes)
}

// getNote GET /api/notes/:id
func getNote(c *echo.Context) error {
	id := c.Param("id")
	var note models.Note
	if err := db.First(&note, id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return c.JSON(http.StatusNotFound, map[string]any{"error": "note not found"})
		}
		return c.JSON(http.StatusInternalServerError, map[string]any{"error": err.Error()})
	}
	return c.JSON(http.StatusOK, note)
}

// createNote POST /api/notes
func createNote(c *echo.Context) error {
	var note models.Note
	if err := c.Bind(&note); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]any{"error": err.Error()})
	}
	note.ID = 0
	if err := db.Create(&note).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]any{"error": err.Error()})
	}
	return c.JSON(http.StatusCreated, note)
}

// updateNote PUT /api/notes/:id
func updateNote(c *echo.Context) error {
	id := c.Param("id")
	var note models.Note
	if err := db.First(&note, id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return c.JSON(http.StatusNotFound, map[string]any{"error": "note not found"})
		}
		return c.JSON(http.StatusInternalServerError, map[string]any{"error": err.Error()})
	}

	var input models.Note
	if err := c.Bind(&input); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]any{"error": err.Error()})
	}

	note.Title = input.Title
	note.Content = input.Content

	if err := db.Save(&note).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]any{"error": err.Error()})
	}
	return c.JSON(http.StatusOK, note)
}

// deleteNote DELETE /api/notes/:id
func deleteNote(c *echo.Context) error {
	id := c.Param("id")
	var note models.Note
	if err := db.First(&note, id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return c.JSON(http.StatusNotFound, map[string]any{"error": "note not found"})
		}
		return c.JSON(http.StatusInternalServerError, map[string]any{"error": err.Error()})
	}

	if err := db.Delete(&note).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]any{"error": err.Error()})
	}
	return c.NoContent(http.StatusNoContent)
}

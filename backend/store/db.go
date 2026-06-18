package store

import (
	"log"
	"os"
	"path/filepath"

	"backend/models"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// db 是包级数据库实例，由 Init 初始化。外部通过 DB() 获取。
var db *gorm.DB

// envOrDefault 返回环境变量值或默认值
func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// Init 初始化 SQLite 数据库连接并执行自动迁移。
func Init() {
	var err error
	dbPath := envOrDefault("DB_PATH", "data/notes.db")

	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		log.Fatalf("创建数据目录失败: %v", err)
	}

	db, err = gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		log.Fatalf("数据库连接失败: %v", err)
	}

	if err := db.AutoMigrate(&models.Note{}, &models.Setting{}, &models.Folder{}); err != nil {
		log.Fatalf("数据库迁移失败: %v", err)
	}

	log.Printf("数据库初始化完成 (%s)", dbPath)
}

// DB 返回数据库实例。
func DB() *gorm.DB {
	return db
}

// Close 关闭底层 SQLite 连接。
func Close() {
	sqlDB, err := db.DB()
	if err != nil {
		log.Printf("获取数据库实例失败: %v", err)
		return
	}
	if err := sqlDB.Close(); err != nil {
		log.Printf("关闭数据库失败: %v", err)
	}
}

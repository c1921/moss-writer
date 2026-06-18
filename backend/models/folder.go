package models

import "time"

// Folder 文件夹 / 分组模型
type Folder struct {
	ID        uint       `json:"id" gorm:"primaryKey"`
	Name      string     `json:"name" gorm:"not null"`
	ParentID  *uint      `json:"parent_id" gorm:"default:null"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

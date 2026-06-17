package models

// Setting 键值配置表，用于持久化用户偏好等简单设置。
type Setting struct {
	Key   string `json:"key" gorm:"primaryKey;size:64"`
	Value string `json:"value"`
}

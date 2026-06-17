package handlers

import (
	"net/http"

	"backend/models"

	"github.com/labstack/echo/v5"
	"gorm.io/gorm"
)

// MakeGetSetting 返回读取单个设置项的 handler。
func MakeGetSetting(db *gorm.DB) echo.HandlerFunc {
	return func(c *echo.Context) error {
		key := c.Param("key")
		var setting models.Setting
		if err := db.First(&setting, "key = ?", key).Error; err != nil {
			return c.JSON(http.StatusOK, map[string]string{"key": key, "value": ""})
		}
		return c.JSON(http.StatusOK, setting)
	}
}

// MakePutSetting 返回写入单个设置项的 handler。
func MakePutSetting(db *gorm.DB) echo.HandlerFunc {
	return func(c *echo.Context) error {
		key := c.Param("key")
		var input struct {
			Value string `json:"value"`
		}
		if err := c.Bind(&input); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "无效的请求体"})
		}
		setting := models.Setting{Key: key, Value: input.Value}
		if err := db.Save(&setting).Error; err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		}
		return c.JSON(http.StatusOK, setting)
	}
}

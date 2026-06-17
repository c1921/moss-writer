package ws

import (
	"encoding/json"
	"log"
	"net/http"

	"backend/models"

	"github.com/olahol/melody"
)

// hub 是包级 WebSocket 管理器实例，由 Init 初始化。
var hub *melody.Melody

// WsMessage WebSocket 消息结构（与前端协议对齐）。
type WsMessage struct {
	Type string       `json:"type"`
	Note *models.Note `json:"note,omitempty"`
	ID   uint         `json:"id,omitempty"`
}

// Init 初始化 Melody WebSocket 管理器。
func Init() {
	hub = melody.New()
	hub.Upgrader.CheckOrigin = func(r *http.Request) bool { return true }

	hub.HandleConnect(func(s *melody.Session) {
		log.Printf("WebSocket 客户端连接: %s", s.RemoteAddr())
	})
	hub.HandleDisconnect(func(s *melody.Session) {
		log.Printf("WebSocket 客户端断开: %s", s.RemoteAddr())
	})
}

// Broadcast 向所有连接的客户端广播一条 WebSocket 消息。
func Broadcast(msg WsMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("序列化 WebSocket 消息失败: %v", err)
		return
	}
	if err := hub.Broadcast(data); err != nil {
		log.Printf("广播消息失败: %v", err)
	}
}

// HandleRequest 将 HTTP 升级为 WebSocket 连接。
func HandleRequest(w http.ResponseWriter, r *http.Request) error {
	return hub.HandleRequest(w, r)
}

// Close 关闭所有 WebSocket 连接。
func Close() error {
	return hub.Close()
}

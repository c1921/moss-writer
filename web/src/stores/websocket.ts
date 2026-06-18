import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Note } from '@/api/notes'

// WebSocket 消息（与后端协议对齐）
export interface WsMessage {
  type: 'note_created' | 'note_updated' | 'note_deleted'
  note?: Note
  id?: number
}

type MessageHandler = (msg: WsMessage) => void

function getDefaultWsUrl(): string {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}

export const useWebSocketStore = defineStore('websocket', () => {
  const connected = ref(false)

  let ws: WebSocket | null = null
  let handlers: MessageHandler[] = []
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  const maxReconnectDelay = 10000
  let reconnectDelay = 1000
  let shouldReconnect = true

  function connect(wsUrl: string) {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      connected.value = true
      reconnectDelay = 1000
    }

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg: WsMessage = JSON.parse(event.data)
        for (const h of handlers) {
          h(msg)
        }
      } catch {
        // 忽略无法解析的消息
      }
    }

    ws.onclose = () => {
      connected.value = false
      ws = null
      if (shouldReconnect) {
        scheduleReconnect(wsUrl)
      }
    }

    ws.onerror = () => {
      // onclose 会紧接着触发，在 onclose 中处理重连
    }
  }

  function scheduleReconnect(wsUrl: string) {
    if (reconnectTimer) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      reconnectDelay = Math.min(reconnectDelay * 2, maxReconnectDelay)
      connect(wsUrl)
    }, reconnectDelay)
  }

  function addHandler(handler: MessageHandler): () => void {
    handlers.push(handler)
    return () => {
      handlers = handlers.filter((h) => h !== handler)
    }
  }

  function disconnect() {
    shouldReconnect = false
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    ws?.close()
    ws = null
    connected.value = false
  }

  function setup(url?: string) {
    const wsUrl = url || getDefaultWsUrl()
    connect(wsUrl)
  }

  function teardown() {
    disconnect()
  }

  return {
    connected,
    addHandler,
    setup,
    teardown,
  }
})

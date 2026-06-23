import { ref, onMounted, onUnmounted, type Ref } from 'vue'
import type { WsMessage } from '@/api/types'

type MessageHandler = (msg: WsMessage) => void

function getDefaultWsUrl(): string {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}

// ---- 单例状态（模块级，多组件共享同一连接） ----
const connected: Ref<boolean> = ref(false)
let ws: WebSocket | null = null
let handlers: MessageHandler[] = []
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
const maxReconnectDelay = 10000 // 最大重连间隔 10s
let reconnectDelay = 1000
let shouldReconnect = true
let initialized = false

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

/**
 * WebSocket 单例 composable。
 * 整个应用共享一个 WebSocket 连接——多次调用返回同一个 connected 引用和相同的 onMessage / disconnect。
 */
export function useWebSocket(url?: string) {
  const wsUrl = url || getDefaultWsUrl()

  if (!initialized) {
    initialized = true
    onMounted(() => {
      connect(wsUrl)
    })
    onUnmounted(() => {
      disconnect()
    })
  }

  return {
    connected,
    onMessage: addHandler,
    disconnect,
  }
}

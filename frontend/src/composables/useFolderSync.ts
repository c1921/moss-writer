import { onUnmounted } from 'vue'
import { useFoldersStore } from '@/stores/folders'

/** WebSocket 消息结构（与后端 ws.WsMessage 对齐） */
interface WsMessage {
  type: string
  folder?: { id: number; name: string; parent_id: number | null }
  note?: { id: number; title: string; folder_id: number | null }
  id?: number
}

/** 建立 WebSocket 连接，监听文件夹/笔记变更事件后自动刷新 tree */
export function useFolderSync() {
  const wsUrl = import.meta.env.VITE_WS_URL ?? (() => {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${location.host}/ws`
  })()

  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  function connect() {
    ws = new WebSocket(wsUrl)

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data)
        if (
          ['folder_created', 'folder_updated', 'folder_deleted',
           'note_created', 'note_updated', 'note_deleted'].includes(msg.type)
        ) {
          useFoldersStore().fetchFolders()
        }
      } catch {
        // 忽略非 JSON 消息
      }
    }

    ws.onclose = () => {
      // 自动重连（5 秒后）
      reconnectTimer = setTimeout(connect, 5000)
    }
  }

  connect()

  onUnmounted(() => {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    ws?.close()
  })
}

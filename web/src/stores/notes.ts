import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  listNotes, getNote, createNote, updateNote, deleteNote,
  type Note,
} from '@/api/notes'
import { getSetting, putSetting } from '@/api/settings'
import { useWebSocketStore, type WsMessage } from './websocket'

const lastOpenedKey = 'last-note-id'

export const useNotesStore = defineStore('notes', () => {
  const notes = ref<Note[]>([])
  const selectedId = ref<number | null>(null)
  const selectedNote = ref<Note | null>(null)
  const saving = ref(false)
  const saveStatus = ref<'idle' | 'saved'>('idle')
  const errorMessage = ref<string | null>(null)
  const connected = ref(false)

  let saveStatusTimer: ReturnType<typeof setTimeout> | null = null
  let errorTimer: ReturnType<typeof setTimeout> | null = null

  // ---- WebSocket 实时同步 ----
  const ws = useWebSocketStore()
  connected.value = ws.connected

  ws.addHandler((msg: WsMessage) => {
    switch (msg.type) {
      case 'note_created':
        if (msg.note) {
          const exists = notes.value.find((n) => n.id === msg.note!.id)
          if (!exists) notes.value.unshift(msg.note)
        }
        break
      case 'note_updated':
        if (msg.note) {
          const idx = notes.value.findIndex((n) => n.id === msg.note!.id)
          if (idx !== -1) notes.value[idx] = msg.note
          if (selectedId.value === msg.note.id) selectedNote.value = msg.note
        }
        break
      case 'note_deleted':
        if (msg.id) {
          notes.value = notes.value.filter((n) => n.id !== msg.id)
          if (selectedId.value === msg.id) {
            selectedId.value = null
            selectedNote.value = null
          }
        }
        break
    }
  })

  // ---- 错误通知 ----

  function showError(msg: string) {
    console.error(msg)
    errorMessage.value = msg
    if (errorTimer) clearTimeout(errorTimer)
    errorTimer = setTimeout(() => {
      errorMessage.value = null
    }, 5000)
  }

  function clearError() {
    if (errorTimer) clearTimeout(errorTimer)
    errorMessage.value = null
  }

  // ---- CRUD 操作 ----

  async function loadNotes() {
    try {
      notes.value = await listNotes()
      // 尝试恢复上次打开的笔记
      try {
        const setting = await getSetting(lastOpenedKey)
        if (setting.value) {
          const id = Number(setting.value)
          if (!Number.isNaN(id) && notes.value.some((n) => n.id === id)) {
            selectNote(id)
          }
        }
      } catch {
        // 获取上次打开笔记失败，静默忽略
      }
    } catch (err) {
      showError('加载笔记列表失败，请检查后端是否运行')
    }
  }

  async function selectNote(id: number) {
    selectedId.value = id
    const local = notes.value.find((n) => n.id === id)
    if (local) selectedNote.value = local
    try {
      const fresh = await getNote(id)
      selectedNote.value = fresh
      const idx = notes.value.findIndex((n) => n.id === id)
      if (idx !== -1) notes.value[idx] = fresh
      putSetting(lastOpenedKey, String(id)).catch(() => {})
    } catch (err) {
      showError('加载笔记详情失败')
    }
  }

  async function handleCreate() {
    try {
      const note = await createNote({ title: '未命名笔记', content: '' })
      notes.value.unshift(note)
      selectedId.value = note.id
      selectedNote.value = note
    } catch (err) {
      showError('创建笔记失败')
    }
  }

  async function handleUpdate(payload: { id: number; title: string; content: string; folder_id?: number | null }) {
    saving.value = true
    saveStatus.value = 'idle'
    try {
      const updated = await updateNote(payload.id, {
        title: payload.title,
        content: payload.content,
        folder_id: payload.folder_id,
      })
      selectedNote.value = updated
      const idx = notes.value.findIndex((n) => n.id === updated.id)
      if (idx !== -1) notes.value[idx] = updated
      saveStatus.value = 'saved'
      if (saveStatusTimer) clearTimeout(saveStatusTimer)
      saveStatusTimer = setTimeout(() => {
        saveStatus.value = 'idle'
      }, 2000)
    } catch (err) {
      showError('保存笔记失败，请稍后重试')
      saveStatus.value = 'idle'
    } finally {
      saving.value = false
    }
  }

  // 设置笔记的文件夹（通过 handleUpdate 发送到后端）
  async function setNoteFolder(noteId: number, folderId: number | null) {
    const note = notes.value.find((n) => n.id === noteId)
    if (!note) return
    await handleUpdate({
      id: noteId,
      title: note.title,
      content: note.content,
      folder_id: folderId,
    })
  }

  async function handleDelete(id: number) {
    try {
      await deleteNote(id)
      if (selectedId.value === id) {
        selectedId.value = null
        selectedNote.value = null
      }
      notes.value = notes.value.filter((n) => n.id !== id)
      // 如果删除的正是最后打开的笔记，清除记录
      getSetting(lastOpenedKey).then((s) => {
        if (Number(s.value) === id) {
          putSetting(lastOpenedKey, '').catch(() => {})
        }
      }).catch(() => {})
    } catch (err) {
      showError('删除笔记失败')
    }
  }

  function cleanup() {
    if (saveStatusTimer) clearTimeout(saveStatusTimer)
    if (errorTimer) clearTimeout(errorTimer)
  }

  return {
    notes,
    selectedId,
    selectedNote,
    saving,
    saveStatus,
    errorMessage,
    connected,
    loadNotes,
    selectNote,
    handleCreate,
    handleUpdate,
    setNoteFolder,
    handleDelete,
    clearError,
    cleanup,
  }
})

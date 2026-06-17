import { ref, onMounted, onUnmounted } from 'vue'
import { listNotes, getNote, createNote, updateNote, deleteNote, type Note } from '@/api/notes'
import { useWebSocket, type WsMessage } from './useWebSocket'

/**
 * 笔记状态管理与 CRUD 操作。
 * 封装笔记列表、选中、保存状态，以及 WebSocket 实时同步。
 */
export function useNotes() {
  const notes = ref<Note[]>([])
  const selectedId = ref<number | null>(null)
  const selectedNote = ref<Note | null>(null)
  const saving = ref(false)
  const saveStatus = ref<'idle' | 'saved'>('idle')
  let saveStatusTimer: ReturnType<typeof setTimeout> | null = null

  const { connected, onMessage } = useWebSocket()

  // ---- WebSocket 实时同步 ----
  onMessage((msg: WsMessage) => {
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

  // ---- CRUD 操作 ----

  async function loadNotes() {
    try {
      notes.value = await listNotes()
    } catch (err) {
      console.error('加载笔记列表失败:', err)
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
    } catch (err) {
      console.error('加载笔记详情失败:', err)
    }
  }

  async function handleCreate() {
    try {
      const note = await createNote({ title: '未命名笔记', content: '' })
      notes.value.unshift(note)
      selectedId.value = note.id
      selectedNote.value = note
    } catch (err) {
      console.error('创建笔记失败:', err)
    }
  }

  async function handleUpdate(payload: { id: number; title: string; content: string }) {
    saving.value = true
    saveStatus.value = 'idle'
    try {
      const updated = await updateNote(payload.id, {
        title: payload.title,
        content: payload.content,
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
      console.error('保存笔记失败:', err)
      saveStatus.value = 'idle'
    } finally {
      saving.value = false
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteNote(id)
      if (selectedId.value === id) {
        selectedId.value = null
        selectedNote.value = null
      }
      notes.value = notes.value.filter((n) => n.id !== id)
    } catch (err) {
      console.error('删除笔记失败:', err)
    }
  }

  // ---- 生命周期 ----
  onMounted(() => {
    loadNotes()
  })

  onUnmounted(() => {
    if (saveStatusTimer) clearTimeout(saveStatusTimer)
  })

  return {
    notes,
    selectedId,
    selectedNote,
    saving,
    saveStatus,
    connected,
    selectNote,
    handleCreate,
    handleUpdate,
    handleDelete,
  }
}

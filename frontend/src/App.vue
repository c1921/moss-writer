<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import NoteSidebar from './components/NoteSidebar.vue'
import NoteEditor from './components/NoteEditor.vue'
import { listNotes, getNote, createNote, updateNote, deleteNote } from './api/notes'
import { useWebSocket, type WsMessage } from './composables/useWebSocket'
import type { Note } from './api/notes'

const notes = ref<Note[]>([])
const selectedId = ref<number | null>(null)
const selectedNote = ref<Note | null>(null)
const saving = ref(false)
const saveStatus = ref<'idle' | 'saved'>('idle')
let saveStatusTimer: ReturnType<typeof setTimeout> | null = null

// 组件引用（用于键盘快捷键）
const sidebarRef = ref<InstanceType<typeof NoteSidebar> | null>(null)
const editorRef = ref<InstanceType<typeof NoteEditor> | null>(null)

// WebSocket 实时同步
const { connected, onMessage } = useWebSocket()

onMessage((msg: WsMessage) => {
  switch (msg.type) {
    case 'note_created':
      if (msg.note) {
        // 如果本地还没有这条笔记，插入列表头部
        const exists = notes.value.find((n) => n.id === msg.note!.id)
        if (!exists) {
          notes.value.unshift(msg.note)
        }
      }
      break
    case 'note_updated':
      if (msg.note) {
        // 更新列表中的对应笔记
        const idx = notes.value.findIndex((n) => n.id === msg.note!.id)
        if (idx !== -1) {
          notes.value[idx] = msg.note
        }
        // 如果当前正在编辑这篇笔记，刷新编辑区（远端用新数据覆盖）
        if (selectedId.value === msg.note.id) {
          selectedNote.value = msg.note
        }
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

// 加载笔记列表
async function loadNotes() {
  try {
    notes.value = await listNotes()
  } catch (err) {
    console.error('加载笔记列表失败:', err)
  }
}

// 选中笔记
async function selectNote(id: number) {
  selectedId.value = id
  // 先从本地列表获取
  const local = notes.value.find((n) => n.id === id)
  if (local) {
    selectedNote.value = local
  }
  // 再从服务端获取最新版本
  try {
    const fresh = await getNote(id)
    selectedNote.value = fresh
    // 同步到列表
    const idx = notes.value.findIndex((n) => n.id === id)
    if (idx !== -1) {
      notes.value[idx] = fresh
    }
  } catch (err) {
    console.error('加载笔记详情失败:', err)
  }
}

// 新建笔记
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

// 保存笔记（由 NoteEditor 的 debounced update 触发）
async function handleUpdate(payload: { id: number; title: string; content: string }) {
  saving.value = true
  saveStatus.value = 'idle'
  try {
    const updated = await updateNote(payload.id, {
      title: payload.title,
      content: payload.content,
    })
    // 更新本地选中笔记
    selectedNote.value = updated
    // 同步列表
    const idx = notes.value.findIndex((n) => n.id === updated.id)
    if (idx !== -1) {
      notes.value[idx] = updated
    }
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

// 删除笔记
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

// 键盘快捷键
function onKeyDown(e: KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey
  if (!mod) return

  switch (e.key.toLowerCase()) {
    case 'n':
      e.preventDefault()
      handleCreate()
      break
    case 's':
      e.preventDefault()
      editorRef.value?.saveNow()
      break
    case 'k':
      e.preventDefault()
      sidebarRef.value?.focusSearch()
      break
  }
}

onMounted(() => {
  loadNotes()
  window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  if (saveStatusTimer) clearTimeout(saveStatusTimer)
})
</script>

<template>
  <div class="flex h-screen overflow-hidden">
    <!-- 左侧边栏 -->
    <div class="w-72 shrink-0">
      <NoteSidebar
        ref="sidebarRef"
        :notes="notes"
        :selected-id="selectedId"
        @select="selectNote"
        @create="handleCreate"
        @delete="handleDelete"
      />
    </div>

    <!-- 右侧编辑器 -->
    <div class="flex-1 min-w-0">
      <NoteEditor
        ref="editorRef"
        :note="selectedNote"
        :saving="saving"
        :save-status="saveStatus"
        @update="handleUpdate"
      />
    </div>

    <!-- WebSocket 连接状态指示 -->
    <div
      v-if="!connected"
      class="fixed bottom-3 right-3 px-2.5 py-1 rounded-md text-xs font-medium bg-destructive/15 text-destructive border border-destructive/30"
    >
      离线
    </div>
  </div>
</template>

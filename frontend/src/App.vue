<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import NoteSidebar from './components/NoteSidebar.vue'
import NoteEditor from './components/NoteEditor.vue'
import { useNotes } from './composables/useNotes'

const {
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
} = useNotes()

// 组件引用（用于键盘快捷键）
const sidebarRef = ref<InstanceType<typeof NoteSidebar> | null>(null)
const editorRef = ref<InstanceType<typeof NoteEditor> | null>(null)

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
  window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
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

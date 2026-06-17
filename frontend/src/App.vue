<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { IconX } from '@tabler/icons-vue'
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
  errorMessage,
  clearError,
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

    <!-- 错误通知 -->
    <div
      v-if="errorMessage"
      class="fixed bottom-3 left-1/2 -translate-x-1/2 px-4 py-2 rounded-md text-sm font-medium bg-destructive/15 text-destructive border border-destructive/30 flex items-center gap-3 shadow-lg max-w-lg"
    >
      <span class="truncate">{{ errorMessage }}</span>
      <button
        class="shrink-0 hover:text-destructive/70 transition-colors"
        @click="clearError"
      >
        <IconX :size="14" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import NoteSidebar from '@/components/NoteSidebar.vue'
import NoteEditor from '@/components/NoteEditor.vue'
import { useNotesStore } from '@/stores/notes'
import { useWebSocketStore } from '@/stores/websocket'
import { useFoldersStore } from '@/stores/folders'

const notesStore = useNotesStore()
const wsStore = useWebSocketStore()
const foldersStore = useFoldersStore()

const sidebarRef = ref<InstanceType<typeof NoteSidebar> | null>(null)
const editorRef = ref<InstanceType<typeof NoteEditor> | null>(null)

function onKeyDown(e: KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey
  if (!mod) return

  switch (e.key.toLowerCase()) {
    case 'n':
      e.preventDefault()
      notesStore.handleCreate()
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

onMounted(async () => {
  wsStore.setup()
  await notesStore.loadNotes()
  await foldersStore.loadFolders()
  window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  wsStore.teardown()
  notesStore.cleanup()
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-background text-on-surface">
    <!-- 左侧边栏 -->
    <div class="w-72 shrink-0">
      <NoteSidebar ref="sidebarRef" />
    </div>

    <!-- 右侧编辑器 -->
    <div class="flex-1 min-w-0">
      <NoteEditor ref="editorRef" />
    </div>

    <!-- WebSocket 连接状态指示 -->
    <div
      v-if="!wsStore.connected"
      class="fixed bottom-3 right-3 px-2.5 py-1 rounded-md text-xs font-medium"
      style="background-color: color-mix(in srgb, var(--v0-error) 15%, transparent); color: var(--v0-error); border: 1px solid color-mix(in srgb, var(--v0-error) 30%, transparent);"
    >
      离线
    </div>

    <!-- 错误通知 -->
    <div
      v-if="notesStore.errorMessage"
      class="fixed bottom-3 left-1/2 -translate-x-1/2 px-4 py-2 rounded-md text-sm font-medium shadow-lg max-w-lg flex items-center gap-3"
      style="background-color: color-mix(in srgb, var(--v0-error) 15%, transparent); color: var(--v0-error); border: 1px solid color-mix(in srgb, var(--v0-error) 30%, transparent);"
    >
      <span class="truncate">{{ notesStore.errorMessage }}</span>
      <button
        class="shrink-0 hover:opacity-70 transition-opacity"
        @click="notesStore.clearError()"
      >
        <span class="i-tabler-x text-sm block" />
      </button>
    </div>
  </div>
</template>

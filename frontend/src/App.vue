<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import AppSidebar from "@/components/AppSidebar.vue"
import NoteEditor from "@/components/NoteEditor.vue"
import { useNotes } from "@/composables/useNotes"
import { useWebSocket } from "@/composables/useWebSocket"
import { useFoldersStore } from '@/stores/folders'
import type { WsMessage } from '@/api/types'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

const foldersStore = useFoldersStore()

// 使用共享的 WebSocket 单例监听变更事件，自动刷新文件夹树
const { onMessage } = useWebSocket()
const unsubWs = onMessage((msg: WsMessage) => {
  if (
    ['folder_created', 'folder_updated', 'folder_deleted',
     'note_created', 'note_updated', 'note_deleted'].includes(msg.type)
  ) {
    foldersStore.fetchFolders()
  }
})

const {
  selectedNote,
  saving,
  saveStatus,
  connected,
  selectNote,
  handleCreate,
  handleUpdate,
  errorMessage,
  clearError,
} = useNotes()

// 组件引用（用于键盘快捷键）
const editorRef = ref<InstanceType<typeof NoteEditor> | null>(null)

// 键盘快捷键 — 排除编辑器输入区焦点
function onKeyDown(e: KeyboardEvent) {
  const target = e.target as HTMLElement
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  ) return

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
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  unsubWs()
})
</script>

<template>
  <SidebarProvider>
    <AppSidebar @select="selectNote" />
    <SidebarInset>
      <header class="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger class="-ml-1" />
        <Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem class="hidden md:block">
              <BreadcrumbLink href="#">
                {{ selectedNote?.title || '笔记' }}
              </BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>
      <div class="flex-1 overflow-hidden">
        <NoteEditor
          ref="editorRef"
          :note="selectedNote"
          :saving="saving"
          :save-status="saveStatus"
          @update="handleUpdate"
        />
      </div>
    </SidebarInset>

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
        ✕
      </button>
    </div>
  </SidebarProvider>
</template>

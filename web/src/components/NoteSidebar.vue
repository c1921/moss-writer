<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Note } from '@/api/notes'
import { useNotesStore } from '@/stores/notes'
import { useThemeStore } from '@/stores/theme'
import { Dialog } from '@vuetify/v0'

const notesStore = useNotesStore()
const themeStore = useThemeStore()

// 搜索
const searchQuery = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)

function focusSearch() {
  searchInputRef.value?.focus()
}

const filteredNotes = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return notesStore.notes
  return notesStore.notes.filter(
    (n) =>
      n.title.toLowerCase().includes(q) ||
      n.content.toLowerCase().includes(q)
  )
})

defineExpose({ focusSearch })

// 删除确认状态
const deleteOpen = ref(false)
const deleteTarget = ref<Note | null>(null)

function confirmDelete(note: Note) {
  deleteTarget.value = note
  deleteOpen.value = true
}

function doDelete() {
  if (deleteTarget.value) {
    notesStore.handleDelete(deleteTarget.value.id)
    deleteTarget.value = null
    deleteOpen.value = false
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const month = d.getMonth() + 1
  const day = d.getDate()
  const hour = d.getHours().toString().padStart(2, '0')
  const minute = d.getMinutes().toString().padStart(2, '0')
  return `${month}/${day} ${hour}:${minute}`
}
</script>

<template>
  <div class="flex flex-col h-full border-r border-divider">
    <!-- 顶部：新建按钮 + 暗色模式 -->
    <div class="p-3 border-b border-divider flex gap-2">
      <button
        class="flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-md text-sm font-medium bg-primary text-on-primary hover:opacity-90 transition-opacity"
        @click="notesStore.handleCreate()"
      >
        <span class="i-tabler-plus text-sm" />
        新建笔记
      </button>
      <button
        class="size-9 inline-flex items-center justify-center rounded-md border border-divider bg-surface text-on-surface hover:bg-surface-variant/60 transition-colors"
        @click="themeStore.toggle()"
        :title="themeStore.isDark ? '切换亮色模式' : '切换暗色模式'"
      >
        <span v-if="themeStore.isDark" class="i-tabler-sun text-sm" />
        <span v-else class="i-tabler-moon text-sm" />
      </button>
    </div>

    <!-- 搜索框 -->
    <div class="px-3 py-2 border-b border-divider">
      <div class="relative">
        <span class="i-tabler-search absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant pointer-events-none" />
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          placeholder="搜索笔记…"
          class="w-full h-8 pl-8 pr-3 rounded-md border border-divider bg-surface text-on-surface text-sm outline-none focus-visible:border-primary transition-colors placeholder:text-on-surface-variant"
        />
      </div>
    </div>

    <!-- 笔记列表 -->
    <div class="flex-1 overflow-y-auto">
      <div v-if="filteredNotes.length === 0 && notesStore.notes.length === 0" class="p-4 text-center text-on-surface-variant text-sm">
        暂无笔记，点击上方按钮创建
      </div>
      <div v-else-if="filteredNotes.length === 0" class="p-4 text-center text-on-surface-variant text-sm">
        无匹配结果
      </div>
      <div
        v-for="note in filteredNotes"
        :key="note.id"
        class="group flex items-center justify-between px-3 py-2.5 cursor-pointer border-b border-divider/50 hover:bg-surface-variant/60 transition-colors"
        :class="{ 'bg-surface-variant/40': note.id === notesStore.selectedId }"
        @click="notesStore.selectNote(note.id)"
      >
        <div class="min-w-0 flex-1">
          <div class="text-sm font-medium truncate text-on-surface">{{ note.title || '未命名笔记' }}</div>
          <div class="text-xs text-on-surface-variant mt-0.5">{{ formatTime(note.updated_at) }}</div>
        </div>
        <button
          class="ml-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-on-surface-variant hover:text-error p-1 rounded"
          @click.stop="confirmDelete(note)"
        >
          <span class="i-tabler-trash text-sm block" />
        </button>
      </div>
    </div>

    <!-- 删除确认对话框（Vuetify0 headless Dialog） -->
    <Dialog v-model="deleteOpen">
      <Dialog.Content class="rounded-xl border border-divider bg-surface shadow-xl p-6 max-w-md backdrop:bg-black/50">
        <Dialog.Title class="text-lg font-semibold text-on-surface">
          确认删除
        </Dialog.Title>
        <Dialog.Description class="mt-2 text-sm text-on-surface-variant">
          将永久删除笔记「{{ deleteTarget?.title || '未命名笔记' }}」，此操作不可撤销。
        </Dialog.Description>
        <div class="flex items-center justify-end gap-2 mt-6">
          <Dialog.Close renderless v-slot="{ attrs }">
            <button v-bind="attrs" class="h-9 px-4 rounded-md text-sm font-medium border border-divider bg-surface text-on-surface hover:bg-surface-variant/60 transition-colors">
              取消
            </button>
          </Dialog.Close>
          <button
            class="h-9 px-4 rounded-md text-sm font-medium bg-error text-on-error hover:opacity-90 transition-opacity"
            @click="doDelete"
          >
            确认删除
          </button>
        </div>
      </Dialog.Content>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { Note } from '@/api/notes'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const props = defineProps<{
  notes: Note[]
  selectedId: number | null
}>()

const emit = defineEmits<{
  select: [id: number]
  create: []
  delete: [id: number]
}>()

// 删除确认状态
const deleteTarget = ref<Note | null>(null)

function confirmDelete(note: Note) {
  deleteTarget.value = note
}

function doDelete() {
  if (deleteTarget.value) {
    emit('delete', deleteTarget.value.id)
    deleteTarget.value = null
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
  <div class="flex flex-col h-full border-r border-border">
    <!-- 顶部：新建按钮 -->
    <div class="p-3 border-b border-border">
      <Button variant="default" class="w-full" @click="emit('create')">
        新建笔记
      </Button>
    </div>

    <!-- 笔记列表 -->
    <div class="flex-1 overflow-y-auto">
      <div v-if="notes.length === 0" class="p-4 text-center text-muted-foreground text-sm">
        暂无笔记，点击上方按钮创建
      </div>
      <div
        v-for="note in notes"
        :key="note.id"
        class="group flex items-center justify-between px-3 py-2.5 cursor-pointer border-b border-border/50 hover:bg-accent/60 transition-colors"
        :class="{ 'bg-accent/40': note.id === selectedId }"
        @click="emit('select', note.id)"
      >
        <div class="min-w-0 flex-1">
          <div class="text-sm font-medium truncate">{{ note.title || '未命名笔记' }}</div>
          <div class="text-xs text-muted-foreground mt-0.5">{{ formatTime(note.updated_at) }}</div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          class="ml-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
          @click.stop="confirmDelete(note)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-.867 12.142A2 2 0 0 1 16.138 20H7.862a2 2 0 0 1-1.995-1.858L5 6"/><path d="M10 10v5"/><path d="M14 10v5"/></svg>
        </Button>
      </div>
    </div>

    <!-- 删除确认对话框 -->
    <Dialog :open="deleteTarget !== null" @update:open="(v: boolean) => { if (!v) deleteTarget = null }">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>确认删除</DialogTitle>
          <DialogDescription>
            将永久删除笔记「{{ deleteTarget?.title || '未命名笔记' }}」，此操作不可撤销。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="deleteTarget = null">取消</Button>
          <Button variant="destructive" @click="doDelete">确认删除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

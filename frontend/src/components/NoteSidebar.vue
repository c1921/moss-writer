<script setup lang="ts">
import { ref } from "vue"
import { IconPlus, IconTrash, IconFileText } from "@tabler/icons-vue"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog"
import type { Note } from "@/api/notes"

defineProps<{
  notes: Note[]
  selectedId: number | null
}>()

const emit = defineEmits<{
  select: [note: Note]
  create: []
  delete: [note: Note]
}>()

const deleteTarget = ref<Note | null>(null)
const deleteOpen = ref(false)

function onDeleteClick(note: Note, e: Event) {
  e.stopPropagation()
  deleteTarget.value = note
  deleteOpen.value = true
}

function confirmDelete() {
  if (deleteTarget.value) {
    emit("delete", deleteTarget.value)
    deleteTarget.value = null
  }
  deleteOpen.value = false
}

function cancelDelete() {
  deleteTarget.value = null
  deleteOpen.value = false
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const time = d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
  if (isToday) return time
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" }) + " " + time
}
</script>

<template>
  <aside class="w-72 h-screen border-r flex flex-col bg-muted/30 shrink-0">
    <!-- Header -->
    <div class="p-3 border-b">
      <Button class="w-full" @click="emit('create')">
        <IconPlus class="size-4" />
        新建笔记
      </Button>
    </div>

    <!-- Note list -->
    <div class="flex-1 overflow-y-auto">
      <div v-if="notes.length === 0" class="p-4 text-center text-muted-foreground text-sm">
        还没有笔记，点击上方按钮创建
      </div>
      <div
        v-for="note in notes"
        :key="note.id"
        class="group flex items-center gap-2 px-3 py-2.5 cursor-pointer border-b border-border/50 hover:bg-accent transition-colors"
        :class="{ 'bg-accent': note.id === selectedId }"
        @click="emit('select', note)"
      >
        <IconFileText class="size-4 shrink-0 text-muted-foreground" />
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium truncate">
            {{ note.title || '无标题' }}
          </div>
          <div class="text-xs text-muted-foreground mt-0.5">
            {{ formatTime(note.updated_at) }}
          </div>
        </div>

        <!-- Delete button (visible on hover) -->
        <Button
          variant="ghost"
          size="icon-sm"
          class="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          @click="(e: Event) => onDeleteClick(note, e)"
        >
          <IconTrash class="size-3.5 text-destructive" />
        </Button>
      </div>
    </div>

    <!-- Delete confirmation dialog -->
    <Dialog :open="deleteOpen" @update:open="(val: boolean) => { if (!val) cancelDelete() }">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>确认删除</DialogTitle>
          <DialogDescription>
            确定要删除笔记「{{ deleteTarget?.title || '无标题' }}」吗？此操作不可撤销。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose as-child>
            <Button variant="outline" @click="cancelDelete">取消</Button>
          </DialogClose>
          <Button variant="destructive" @click="confirmDelete">删除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </aside>
</template>

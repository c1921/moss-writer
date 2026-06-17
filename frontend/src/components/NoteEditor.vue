<script setup lang="ts">
import { ref, watch, computed } from "vue"
import { MdEditor } from "md-editor-v3"
import "md-editor-v3/lib/style.css"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { IconDeviceFloppy } from "@tabler/icons-vue"
import type { Note } from "@/api/notes"

const props = defineProps<{
  note: Note | null
  saving: boolean
}>()

const emit = defineEmits<{
  "update:title": [title: string]
  "update:content": [content: string]
  save: []
}>()

const title = ref("")
const content = ref("")

// Only sync from props when switching to a different note (id changes),
// not on every API response update — local state is the source of truth while editing.
watch(
  () => props.note?.id ?? null,
  (newId, oldId) => {
    if (newId !== oldId) {
      if (props.note) {
        title.value = props.note.title
        content.value = props.note.content
      } else {
        title.value = ""
        content.value = ""
      }
    }
  },
  { immediate: true }
)

// Debounce timers
let titleTimer: ReturnType<typeof setTimeout> | null = null
let contentTimer: ReturnType<typeof setTimeout> | null = null

function onTitleChange(value: string | number) {
  title.value = String(value)
  if (titleTimer) clearTimeout(titleTimer)
  titleTimer = setTimeout(() => {
    emit("update:title", title.value)
  }, 800)
}

function onContentChange(value: string) {
  content.value = value
  if (contentTimer) clearTimeout(contentTimer)
  contentTimer = setTimeout(() => {
    emit("update:content", content.value)
  }, 800)
}

function onSave() {
  // Flush pending debounced changes immediately
  if (titleTimer) { clearTimeout(titleTimer); titleTimer = null }
  if (contentTimer) { clearTimeout(contentTimer); contentTimer = null }
  emit("update:title", title.value)
  emit("update:content", content.value)
  emit("save")
}
</script>

<template>
  <div v-if="note" class="flex flex-col h-screen flex-1 min-w-0">
    <!-- Top bar: title + save -->
    <div class="flex items-center gap-3 px-4 py-3 border-b shrink-0">
      <Input
        :model-value="title"
        class="flex-1 text-base font-medium"
        placeholder="笔记标题"
        @update:model-value="onTitleChange"
      />
      <Button
        variant="outline"
        size="sm"
        :disabled="saving"
        @click="onSave"
      >
        <IconDeviceFloppy class="size-4" />
        {{ saving ? '保存中…' : '保存' }}
      </Button>
    </div>

    <!-- Editor -->
    <div class="flex-1 min-h-0">
      <MdEditor
        :model-value="content"
        language="zh-CN"
        theme="light"
        preview-theme="github"
        class="h-full"
        @on-change="onContentChange"
      />
    </div>
  </div>

  <!-- Empty state -->
  <div v-else class="flex-1 flex items-center justify-center h-screen text-muted-foreground">
    <div class="text-center">
      <IconDeviceFloppy class="size-12 mx-auto mb-3 opacity-30" />
      <p class="text-lg">选择或创建一篇笔记</p>
      <p class="text-sm mt-1">从左侧列表选择笔记，或点击「新建笔记」开始</p>
    </div>
  </div>
</template>

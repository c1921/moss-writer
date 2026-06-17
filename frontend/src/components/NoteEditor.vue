<script setup lang="ts">
import { ref, watch } from 'vue'
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import type { Note } from '@/api/notes'
import { Input } from '@/components/ui/input'

const props = defineProps<{
  note: Note | null
  saving?: boolean
  saveStatus?: 'idle' | 'saved'
}>()

const emit = defineEmits<{
  update: [payload: { id: number; title: string; content: string }]
}>()

const title = ref('')
const content = ref('')

// 当选中笔记变化时同步到本地编辑状态
watch(
  () => props.note,
  (n) => {
    if (n) {
      title.value = n.title
      content.value = n.content
    } else {
      title.value = ''
      content.value = ''
    }
  },
  { immediate: true }
)

let saveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (props.note) {
      emit('update', {
        id: props.note.id,
        title: title.value,
        content: content.value,
      })
    }
  }, 800)
}

function onTitleChange() {
  scheduleSave()
}

function onContentChange(v: string) {
  content.value = v
  scheduleSave()
}

function saveNow() {
  if (saveTimer) clearTimeout(saveTimer)
  if (props.note) {
    emit('update', {
      id: props.note.id,
      title: title.value,
      content: content.value,
    })
  }
}

defineExpose({ saveNow })
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- 未选中笔记时的占位 -->
    <div v-if="!note" class="flex-1 flex items-center justify-center text-muted-foreground text-sm">
      选择左侧笔记开始编辑，或创建一篇新笔记
    </div>

    <!-- 编辑器 -->
    <template v-else>
      <div class="p-3 border-b border-border flex items-center gap-2">
        <Input
          v-model="title"
          placeholder="笔记标题"
          class="text-lg font-semibold border-0 shadow-none ring-0! px-0 h-auto py-0 flex-1"
          @input="onTitleChange"
        />
        <span
          v-if="saving"
          class="text-xs text-muted-foreground shrink-0 animate-pulse"
        >保存中…</span>
        <span
          v-else-if="saveStatus === 'saved'"
          class="text-xs text-emerald-600 dark:text-emerald-400 shrink-0"
        >已保存</span>
      </div>
      <div class="flex-1 overflow-hidden">
        <MdEditor
          v-model="content"
          language="en-US"
          :preview="true"
          :toolbars="[
            'bold', 'italic', 'strikeThrough', '-',
            'title', '-',
            'unorderedList', 'orderedList', 'code', 'quote', '-',
            'table', 'link', 'image', '-',
            'preview',
          ]"
          class="h-full"
          @onChange="onContentChange"
        />
      </div>
    </template>
  </div>
</template>

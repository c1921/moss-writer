<script setup lang="ts">
import { ref, watch } from 'vue'
import { MilkdownProvider } from '@milkdown/vue'
import type { Note } from '@/api/notes'
import { useNotesStore } from '@/stores/notes'
import MarkdownEditor from './MarkdownEditor.vue'

const notesStore = useNotesStore()

const title = ref('')
const content = ref('')

// 当选中笔记变化时同步到本地编辑状态
watch(
  () => notesStore.selectedNote,
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
    if (notesStore.selectedNote) {
      notesStore.handleUpdate({
        id: notesStore.selectedNote.id,
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
  if (notesStore.selectedNote) {
    notesStore.handleUpdate({
      id: notesStore.selectedNote.id,
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
    <div v-if="!notesStore.selectedNote" class="flex-1 flex items-center justify-center text-on-surface-variant text-sm">
      选择左侧笔记开始编辑，或创建一篇新笔记
    </div>

    <!-- 编辑器 -->
    <template v-else>
      <div class="p-3 border-b border-divider flex items-center gap-2">
        <input
          v-model="title"
          placeholder="笔记标题"
          class="text-lg font-semibold border-0 shadow-none ring-0 outline-none px-0 py-0 flex-1 bg-transparent text-on-surface"
          @input="onTitleChange"
        />
        <span
          v-if="notesStore.saving"
          class="text-xs text-on-surface-variant shrink-0 animate-pulse"
        >保存中…</span>
        <span
          v-else-if="notesStore.saveStatus === 'saved'"
          class="text-xs text-success shrink-0"
        >已保存</span>
      </div>
      <div class="flex-1 overflow-hidden">
        <MilkdownProvider>
          <MarkdownEditor
            :model-value="content"
            @update:model-value="onContentChange"
          />
        </MilkdownProvider>
      </div>
    </template>
  </div>
</template>

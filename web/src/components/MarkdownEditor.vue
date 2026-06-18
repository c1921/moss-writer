<script setup lang="ts">
import { watch } from 'vue'
import { Milkdown, useEditor } from '@milkdown/vue'
import { Editor, rootCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { history } from '@milkdown/kit/plugin/history'
import { clipboard } from '@milkdown/kit/plugin/clipboard'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { nord } from '@milkdown/theme-nord'
import { replaceAll, getMarkdown } from '@milkdown/kit/utils'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

let suppressListener = false

const { loading, get } = useEditor((container) => {
  return Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, container)
      nord(ctx)

      ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
        if (suppressListener) return
        emit('update:modelValue', markdown)
      })
    })
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(clipboard)
    .use(listener)
})

watch(
  () => props.modelValue,
  (val) => {
    const editor = get()
    if (!editor) return

    const currentMd = editor.action(getMarkdown())
    if (currentMd === val) return

    suppressListener = true
    editor.action(replaceAll(val))
    suppressListener = false
  }
)

watch(loading, (isLoading) => {
  if (!isLoading) {
    const editor = get()
    if (editor && props.modelValue !== undefined) {
      const currentMd = editor.action(getMarkdown())
      if (currentMd === props.modelValue) return

      suppressListener = true
      editor.action(replaceAll(props.modelValue))
      suppressListener = false
    }
  }
})

defineExpose({ get, loading })
</script>

<template>
  <Milkdown class="h-full overflow-auto px-6 py-4" />
</template>

<style>
/* Milkdown nord 主题表格暗色适配 + 亮色显式修复 */

/* 亮色模式：奇数列表格单元格浅灰底色 */
.milkdown-theme-nord.prose :where(td, th):nth-child(odd) {
  background-color: oklch(0.97 0.002 248);
}
/* 暗色模式 */
.dark .milkdown-theme-nord.prose :where(td, th):nth-child(odd) {
  background-color: oklch(0.21 0.034 265);
}

/* 亮色：表格行边框 */
.milkdown-theme-nord.prose tr {
  border-color: oklch(0.928 0.006 264);
}
/* 暗色：表格行边框 */
.dark .milkdown-theme-nord.prose tr {
  border-color: oklch(0.446 0.03 257);
}

/* 代码块背景 */
.milkdown-theme-nord pre {
  background-color: oklch(0.967 0.003 264);
}
.dark .milkdown-theme-nord pre {
  background-color: oklch(0.278 0.033 257);
}

/* 内联代码背景 */
.milkdown-theme-nord code {
  background-color: oklch(0.928 0.006 264);
}
.dark .milkdown-theme-nord code {
  background-color: oklch(0.373 0.034 260);
}

/* 选中单元格高亮（亮色/暗色通用） */
.milkdown-theme-nord.prose.ProseMirror .selectedCell:after {
  background-color: oklch(0.75 0.06 230 / 30%);
}

/* Milkdown 编辑器滚动条 */
[data-milkdown-root] {
  scrollbar-width: thin;
  scrollbar-color: oklch(0.928 0.006 264) transparent;
}
.dark [data-milkdown-root] {
  scrollbar-color: oklch(0.373 0.034 260) transparent;
}

[data-milkdown-root]::-webkit-scrollbar {
  width: 6px;
}
[data-milkdown-root]::-webkit-scrollbar-track {
  background: transparent;
}
[data-milkdown-root]::-webkit-scrollbar-thumb {
  background: oklch(0.928 0.006 264);
  border-radius: 3px;
}
.dark [data-milkdown-root]::-webkit-scrollbar-thumb {
  background: oklch(0.373 0.034 260);
}
</style>

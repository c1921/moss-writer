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

      // 监听 markdown 变化 → 通知父组件
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

// 外部内容变化 → 同步到编辑器（仅当内容确实不同时才更新，避免回音循环破坏选区）
watch(
  () => props.modelValue,
  (val) => {
    const editor = get()
    if (!editor) return

    // 与编辑器当前内容比对，相同则跳过
    const currentMd = editor.action(getMarkdown())
    if (currentMd === val) return

    suppressListener = true
    editor.action(replaceAll(val))
    suppressListener = false
  }
)

// 编辑器就绪后，推送初始内容（仅当内容确实不同时）
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

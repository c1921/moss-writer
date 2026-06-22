<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import Vditor from 'vditor'
import 'vditor/dist/index.css'
import '@/assets/vditor-shadcn.css'
import { useColorMode } from '@vueuse/core'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const mode = useColorMode()

const editorRef = ref<HTMLDivElement>()
const vditor = ref<Vditor | null>(null)
const loading = ref(true)

onMounted(() => {
  if (!editorRef.value) return

  loading.value = true

  vditor.value = new Vditor(editorRef.value, {
    mode: 'ir',
    value: props.modelValue || '',
    theme: mode.value === 'dark' ? 'dark' : 'classic',
    preview: {
      theme: {
        current: mode.value === 'dark' ? 'dark' : 'light',
      },
    },
    placeholder: '开始写作…',
    cache: {
      enable: false,
    },
    toolbar: [
      'emoji', 'headings', 'bold', 'italic', 'strike', '|',
      'line', 'quote', 'list', 'ordered-list', 'check', '|',
      'code', 'inline-code', 'undo', 'redo', '|',
      'link', 'table', '|', 'edit-mode', 'both', 'outline',
    ],
    input: (value: string) => {
      emit('update:modelValue', value)
    },
    after: () => {
      loading.value = false
    },
  })
})

// 外部内容变化 → 同步到编辑器（仅当内容确实不同时才更新，避免回音循环）
watch(
  () => props.modelValue,
  (val) => {
    const v = vditor.value
    if (!v) return
    const currentMd = v.getValue()
    if (currentMd === val) return
    v.setValue(val)
  },
)

// 暗色主题同步（跟随 @vueuse/core 的 useColorMode）
watch(mode, (val) => {
  const v = vditor.value
  if (!v) return
  const dark = val === 'dark'
  v.setTheme(dark ? 'dark' : 'classic', dark ? 'dark' : 'light')
})

onUnmounted(() => {
  vditor.value?.destroy()
  vditor.value = null
})

defineExpose({ vditor, loading })
</script>

<template>
  <div ref="editorRef" class="h-full" />
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import Vditor from 'vditor'
import 'vditor/dist/index.css'
import { useDarkMode } from '@/composables/useDarkMode'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const { isDark } = useDarkMode()

const editorRef = ref<HTMLDivElement>()
const vditor = ref<Vditor | null>(null)
const loading = ref(true)

onMounted(() => {
  if (!editorRef.value) return

  loading.value = true

  vditor.value = new Vditor(editorRef.value, {
    mode: 'ir',
    value: props.modelValue || '',
    theme: isDark.value ? 'dark' : 'classic',
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

// 暗色主题同步
watch(isDark, (dark) => {
  vditor.value?.setTheme(dark ? 'dark' : 'classic')
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

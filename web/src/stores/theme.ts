import { computed } from 'vue'
import { defineStore } from 'pinia'
import { useTheme } from '@vuetify/v0'

export const useThemeStore = defineStore('theme', () => {
  const theme = useTheme()

  const isDark = computed(() => theme.selectedId.value === 'dark')

  function toggle() {
    theme.select(isDark.value ? 'light' : 'dark')
  }

  return {
    isDark,
    toggle,
  }
})

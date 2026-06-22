import { ref, watchEffect } from 'vue'

const isDark = ref(false)

// 从 localStorage 读取初始状态
const stored = localStorage.getItem('theme')
if (stored === 'dark') {
  isDark.value = true
} else if (stored === 'light') {
  isDark.value = false
} else {
  // 跟随系统偏好
  isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
}

// 同步 class 和 localStorage
watchEffect(() => {
  document.documentElement.classList.toggle('dark', isDark.value)
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
})

export function useDarkMode() {
  function toggle() {
    isDark.value = !isDark.value
  }

  return { isDark, toggle }
}

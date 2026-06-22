<script setup lang="ts">
import { Sun, Moon } from "@lucide/vue"
import { useColorMode } from '@vueuse/core'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const mode = useColorMode()
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon-sm" class="relative">
        <!-- 亮色时显示太阳，暗色时显示月亮（状态指示，非动作指示） -->
        <Sun
          :size="16"
          class="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"
        />
        <Moon
          :size="16"
          class="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
        />
        <span class="sr-only">切换主题</span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem @click="mode = 'light'">
        亮色
      </DropdownMenuItem>
      <DropdownMenuItem @click="mode = 'dark'">
        暗色
      </DropdownMenuItem>
      <DropdownMenuItem @click="mode = 'auto'">
        跟随系统
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>

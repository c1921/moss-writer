<script setup lang="ts">
import type { DropdownMenuItemEmits, DropdownMenuItemProps } from "reka-ui"
import { DropdownMenuItem, useForwardPropsEmits } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<DropdownMenuItemProps & { class?: HTMLAttributes["class"] }>()
const emits = defineEmits<DropdownMenuItemEmits>()

const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <DropdownMenuItem
    v-bind="forwarded"
    :class="cn(
      'relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none',
      'focus:bg-accent focus:text-accent-foreground',
      'data-disabled:pointer-events-none data-disabled:opacity-50',
      '[&>svg]:size-4 [&>svg]:shrink-0',
      props.class,
    )"
  >
    <slot />
  </DropdownMenuItem>
</template>

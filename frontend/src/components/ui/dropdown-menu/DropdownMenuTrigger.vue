<script setup lang="ts">
import type { DropdownMenuTriggerProps } from "reka-ui"
import { DropdownMenuTrigger, useForwardProps } from "reka-ui"

const props = defineProps<DropdownMenuTriggerProps>()

const forwarded = useForwardProps(props)
</script>

<template>
  <DropdownMenuTrigger v-bind="forwarded" data-slot="dropdown-menu-trigger">
    <slot />
  </DropdownMenuTrigger>
</template>

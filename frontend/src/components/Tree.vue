<script setup lang="ts">
import { ChevronRight, File, Folder } from "@lucide/vue"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from '@/components/ui/sidebar'
import type { TreeNode } from '@/api/types'

defineProps<{
  item: TreeNode
}>()
</script>

<template>
  <!-- 笔记：叶子节点（文件图标，无折叠） -->
  <SidebarMenuButton v-if="item.type === 'note'" class="data-[active=true]:bg-transparent">
    <File />
    {{ item.name }}
  </SidebarMenuButton>

  <!-- 文件夹：可折叠节点 -->
  <SidebarMenuItem v-else>
    <Collapsible
      class="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90"
    >
      <CollapsibleTrigger as-child>
        <SidebarMenuButton>
          <ChevronRight class="transition-transform" />
          <Folder />
          {{ item.name }}
        </SidebarMenuButton>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <SidebarMenuSub v-if="item.children.length > 0">
          <Tree v-for="child in item.children" :key="child.id" :item="child" />
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  </SidebarMenuItem>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import ModeToggle from "@/components/ModeToggle.vue"
import type { SidebarProps } from "@/components/ui/sidebar"
import Tree from "@/components/Tree.vue"
import { useFoldersStore } from '@/stores/folders'
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarRail,
} from "@/components/ui/sidebar"

const props = defineProps<SidebarProps>()

const emit = defineEmits<{
  select: [id: number]
}>()

const foldersStore = useFoldersStore()

onMounted(() => {
    foldersStore.fetchFolders()
})
</script>

<template>
    <Sidebar v-bind="props">
        <SidebarContent>
            <SidebarGroup>
                <SidebarGroupLabel>
                    目录
                    <div class="ml-auto">
                        <ModeToggle />
                    </div>
                </SidebarGroupLabel>
                <SidebarGroupContent>
                    <SidebarMenu v-if="foldersStore.loading">
                        <div class="px-2 text-sm text-muted-foreground">加载中…</div>
                    </SidebarMenu>
                    <SidebarMenu v-else-if="foldersStore.error">
                        <div class="px-2 text-sm text-red-500">{{ foldersStore.error }}</div>
                    </SidebarMenu>
                    <SidebarMenu v-else-if="foldersStore.tree.length === 0">
                        <div class="px-2 text-sm text-muted-foreground">暂无文件夹</div>
                    </SidebarMenu>
                    <SidebarMenu v-else>
                        <Tree
                            v-for="item in foldersStore.tree"
                            :key="item.id"
                            :item="item"
                            @select="(id: number) => emit('select', id)"
                        />
                    </SidebarMenu>
                </SidebarGroupContent>
            </SidebarGroup>
        </SidebarContent>
        <SidebarRail />
    </Sidebar>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Note } from '@/api/notes'
import type { Folder } from '@/api/folders'
import { useNotesStore } from '@/stores/notes'
import { useFoldersStore } from '@/stores/folders'
import { useThemeStore } from '@/stores/theme'
import { Dialog } from '@vuetify/v0'
import { Treeview } from '@vuetify/v0/components'

const notesStore = useNotesStore()
const foldersStore = useFoldersStore()
const themeStore = useThemeStore()

// 搜索
const searchQuery = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)

function focusSearch() {
  searchInputRef.value?.focus()
}

defineExpose({ focusSearch })

// 根据 id 获取 Note 对象
function getNote(id: number): Note | undefined {
  return notesStore.notes.find((n) => n.id === id)
}

// 搜索匹配
function matchSearch(note: Note | undefined): boolean {
  if (!note) return false
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return true
  return (
    note.title.toLowerCase().includes(q) ||
    note.content.toLowerCase().includes(q)
  )
}

// 无文件夹的笔记（folder_id 为 null/undefined）
const uncategorizedNotes = computed(() =>
  notesStore.notes.filter((n) => n.folder_id == null)
)

// 带过滤的分组列表
interface FilteredFolder {
  id: number
  name: string
  noteIds: number[]
}

const filteredFolders = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const hasQuery = q.length > 0
  const result: FilteredFolder[] = []

  // 所有有文件夹的笔记，按 folder_id 分组
  const grouped = new Map<number, Note[]>()
  for (const note of notesStore.notes) {
    if (note.folder_id != null) {
      const list = grouped.get(note.folder_id) || []
      list.push(note)
      grouped.set(note.folder_id, list)
    }
  }

  for (const folder of foldersStore.folders) {
    const notes = grouped.get(folder.id) || []
    const noteIds = notes
      .filter((n) => !hasQuery || matchSearch(n))
      .map((n) => n.id)
    if (!hasQuery || noteIds.length > 0 || folder.name.toLowerCase().includes(q)) {
      result.push({ id: folder.id, name: folder.name, noteIds })
    }
  }

  // 无文件夹的笔记展示为"未分类"段（只在有笔记时显示）
  const uncatIds = uncategorizedNotes.value
    .filter((n) => !hasQuery || matchSearch(n))
    .map((n) => n.id)
  if (!hasQuery || uncatIds.length > 0) {
    result.push({ id: 0, name: '未分类', noteIds: uncatIds })
  }

  return result
})

// 删除确认状态
const deleteOpen = ref(false)
const deleteTarget = ref<Note | null>(null)

function confirmDelete(note: Note) {
  deleteTarget.value = note
  deleteOpen.value = true
}

function doDelete() {
  if (deleteTarget.value) {
    notesStore.handleDelete(deleteTarget.value.id)
    deleteTarget.value = null
    deleteOpen.value = false
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const month = d.getMonth() + 1
  const day = d.getDate()
  const hour = d.getHours().toString().padStart(2, '0')
  const minute = d.getMinutes().toString().padStart(2, '0')
  return `${month}/${day} ${hour}:${minute}`
}

// 文件夹管理
const folderRenameOpen = ref(false)
const folderRenameTarget = ref<Folder | null>(null)
const folderRenameInput = ref('')

function startRenameFolder(folder: Folder) {
  folderRenameTarget.value = folder
  folderRenameInput.value = folder.name
  folderRenameOpen.value = true
}

async function doRenameFolder() {
  if (folderRenameTarget.value && folderRenameInput.value.trim()) {
    await foldersStore.rename(folderRenameTarget.value.id, folderRenameInput.value.trim())
  }
  folderRenameOpen.value = false
  folderRenameTarget.value = null
}

const folderDeleteConfirmOpen = ref(false)
const folderDeleteTarget = ref<Folder | null>(null)

function confirmDeleteFolder(folder: Folder) {
  folderDeleteTarget.value = folder
  folderDeleteConfirmOpen.value = true
}

async function doDeleteFolder() {
  if (folderDeleteTarget.value) {
    await foldersStore.remove(folderDeleteTarget.value.id)
  }
  folderDeleteConfirmOpen.value = false
  folderDeleteTarget.value = null
}

const showAddFolderInput = ref(false)
const newFolderName = ref('')

async function addFolder() {
  const name = newFolderName.value.trim()
  if (name) {
    await foldersStore.add(name)
    newFolderName.value = ''
  }
  showAddFolderInput.value = false
}

// 移动笔记的位置状态
const moveNoteTarget = ref<Note | null>(null)
const moveFolderDialogOpen = ref(false)

function startMoveNote(note: Note) {
  moveNoteTarget.value = note
  moveFolderDialogOpen.value = true
}

async function doMoveNote(folderId: number | null) {
  if (moveNoteTarget.value) {
    await notesStore.setNoteFolder(moveNoteTarget.value.id, folderId)
  }
  moveFolderDialogOpen.value = false
  moveNoteTarget.value = null
}
</script>

<template>
  <div class="flex flex-col h-full border-r border-divider">
    <!-- 顶部：新建按钮 + 暗色模式 -->
    <div class="p-3 border-b border-divider flex gap-2">
      <button
        class="flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-md text-sm font-medium bg-primary text-on-primary hover:opacity-90 transition-opacity"
        @click="notesStore.handleCreate()"
      >
        <span class="i-tabler-plus text-sm" />
        新建笔记
      </button>
      <button
        class="size-9 inline-flex items-center justify-center rounded-md border border-divider bg-surface text-on-surface hover:bg-surface-variant/60 transition-colors"
        @click="themeStore.toggle()"
        :title="themeStore.isDark ? '切换亮色模式' : '切换暗色模式'"
      >
        <span v-if="themeStore.isDark" class="i-tabler-sun text-sm" />
        <span v-else class="i-tabler-moon text-sm" />
      </button>
    </div>

    <!-- 搜索框 + 添加文件夹按钮 -->
    <div class="px-3 py-2 border-b border-divider flex gap-2 items-center">
      <div class="relative flex-1">
        <span class="i-tabler-search absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant pointer-events-none" />
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          placeholder="搜索笔记…"
          class="w-full h-8 pl-8 pr-3 rounded-md border border-divider bg-surface text-on-surface text-sm outline-none focus-visible:border-primary transition-colors placeholder:text-on-surface-variant"
        />
      </div>
      <button
        class="size-8 inline-flex items-center justify-center rounded-md border border-divider bg-surface text-on-surface hover:bg-surface-variant/60 transition-colors shrink-0"
        title="添加文件夹"
        @click="showAddFolderInput = !showAddFolderInput"
      >
        <span class="i-tabler-folder-plus text-sm" />
      </button>
    </div>

    <!-- 新增文件夹输入 -->
    <div v-if="showAddFolderInput" class="px-3 py-2 border-b border-divider">
      <div class="flex gap-2">
        <input
          v-model="newFolderName"
          placeholder="文件夹名称"
          class="flex-1 h-8 px-2 rounded-md border border-divider bg-surface text-on-surface text-sm outline-none focus-visible:border-primary transition-colors"
          @keyup.enter="addFolder"
        />
        <button
          class="h-8 px-3 rounded-md text-sm font-medium bg-primary text-on-primary hover:opacity-90 transition-opacity"
          @click="addFolder"
        >
          创建
        </button>
        <button
          class="h-8 px-3 rounded-md text-sm border border-divider bg-surface text-on-surface hover:bg-surface-variant/60 transition-colors"
          @click="showAddFolderInput = false"
        >
          取消
        </button>
      </div>
    </div>

    <!-- 笔记树 -->
    <div class="flex-1 overflow-y-auto">
      <!-- 空状态 -->
      <div
        v-if="filteredFolders.length === 0 && notesStore.notes.length === 0"
        class="p-4 text-center text-on-surface-variant text-sm"
      >
        暂无笔记，点击上方按钮创建
      </div>
      <div
        v-else-if="filteredFolders.length === 0"
        class="p-4 text-center text-on-surface-variant text-sm"
      >
        无匹配结果
      </div>

      <!-- Treeview -->
      <Treeview.Root
        v-else
        :multiple="false"
        selection="leaf"
        class="select-none"
      >
        <Treeview.List>
          <template v-for="folder in filteredFolders" :key="folder.id">
            <Treeview.Item :id="`f_${folder.id}`">
              <Treeview.Activator
                class="group flex items-center gap-1.5 px-2 py-1.5 text-sm font-medium text-on-surface hover:bg-surface-variant/60 transition-colors rounded-sm mx-1"
              >
                <span class="i-tabler-folder text-sm text-on-surface-variant shrink-0" />
                <span class="truncate">{{ folder.name }}</span>
                <span class="text-xs text-on-surface-variant ml-auto">{{ folder.noteIds.length }}</span>
                <!-- 文件夹操作（仅对真实文件夹） -->
                <span v-if="folder.id !== 0" class="ml-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    class="size-5 inline-flex items-center justify-center rounded hover:bg-surface-variant text-on-surface-variant hover:text-on-surface"
                    title="重命名"
                    @click.stop="startRenameFolder(
                      foldersStore.folders.find((f) => f.id === folder.id)!
                    )"
                  >
                    <span class="i-tabler-edit text-xs" />
                  </button>
                  <button
                    class="size-5 inline-flex items-center justify-center rounded hover:bg-surface-variant text-on-surface-variant hover:text-error"
                    title="删除文件夹"
                    @click.stop="confirmDeleteFolder(
                      foldersStore.folders.find((f) => f.id === folder.id)!
                    )"
                  >
                    <span class="i-tabler-trash text-xs" />
                  </button>
                </span>
              </Treeview.Activator>
              <Treeview.Content>
                <Treeview.Group class="ml-2">
                  <Treeview.Item
                    v-for="noteId in folder.noteIds"
                    :key="noteId"
                    :id="noteId"
                  >
                    <template #default="{ depth }">
                      <div
                        class="group/item flex items-center justify-between px-2 py-1.5 cursor-pointer rounded-sm mx-1 transition-colors text-sm"
                        :class="noteId === notesStore.selectedId ? 'bg-primary/15 text-primary' : 'text-on-surface hover:bg-surface-variant/60'"
                        :style="{ 'padding-left': `${(depth + 1) * 0.5 + 0.5}rem` }"
                        @click="notesStore.selectNote(noteId)"
                      >
                        <div class="min-w-0 flex-1">
                          <div class="truncate font-medium text-sm">
                            {{ getNote(noteId)?.title || '未命名笔记' }}
                          </div>
                          <div class="text-xs text-on-surface-variant mt-0.5">
                            {{ getNote(noteId) ? formatTime(getNote(noteId)!.updated_at) : '' }}
                          </div>
                        </div>
                        <div class="ml-1 flex gap-0.5 shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity">
                          <button
                            v-if="getNote(noteId)"
                            class="size-6 inline-flex items-center justify-center rounded hover:bg-surface-variant text-on-surface-variant hover:text-on-surface"
                            title="移动到文件夹"
                            @click.stop="startMoveNote(getNote(noteId)!)"
                          >
                            <span class="i-tabler-folder-move text-xs" />
                          </button>
                          <button
                            v-if="getNote(noteId)"
                            class="size-6 inline-flex items-center justify-center rounded hover:bg-surface-variant text-on-surface-variant hover:text-error"
                            title="删除"
                            @click.stop="confirmDelete(getNote(noteId)!)"
                          >
                            <span class="i-tabler-trash text-xs" />
                          </button>
                        </div>
                      </div>
                    </template>
                  </Treeview.Item>
                </Treeview.Group>
              </Treeview.Content>
            </Treeview.Item>
          </template>
        </Treeview.List>
      </Treeview.Root>
    </div>

    <!-- 删除笔记确认对话框 -->
    <Dialog v-model="deleteOpen">
      <Dialog.Content class="rounded-xl border border-divider bg-surface shadow-xl p-6 max-w-md backdrop:bg-black/50">
        <Dialog.Title class="text-lg font-semibold text-on-surface">
          确认删除
        </Dialog.Title>
        <Dialog.Description class="mt-2 text-sm text-on-surface-variant">
          将永久删除笔记「{{ deleteTarget?.title || '未命名笔记' }}」，此操作不可撤销。
        </Dialog.Description>
        <div class="flex items-center justify-end gap-2 mt-6">
          <Dialog.Close renderless v-slot="{ attrs }">
            <button v-bind="attrs" class="h-9 px-4 rounded-md text-sm font-medium border border-divider bg-surface text-on-surface hover:bg-surface-variant/60 transition-colors">
              取消
            </button>
          </Dialog.Close>
          <button
            class="h-9 px-4 rounded-md text-sm font-medium bg-error text-on-error hover:opacity-90 transition-opacity"
            @click="doDelete"
          >
            确认删除
          </button>
        </div>
      </Dialog.Content>
    </Dialog>

    <!-- 重命名文件夹对话框 -->
    <Dialog v-model="folderRenameOpen">
      <Dialog.Content class="rounded-xl border border-divider bg-surface shadow-xl p-6 max-w-md backdrop:bg-black/50">
        <Dialog.Title class="text-lg font-semibold text-on-surface">
          重命名文件夹
        </Dialog.Title>
        <div class="mt-3">
          <input
            v-model="folderRenameInput"
            class="w-full h-9 px-3 rounded-md border border-divider bg-surface text-on-surface text-sm outline-none focus-visible:border-primary transition-colors"
            placeholder="文件夹名称"
            @keyup.enter="doRenameFolder"
          />
        </div>
        <div class="flex items-center justify-end gap-2 mt-6">
          <Dialog.Close renderless v-slot="{ attrs }">
            <button v-bind="attrs" class="h-9 px-4 rounded-md text-sm font-medium border border-divider bg-surface text-on-surface hover:bg-surface-variant/60 transition-colors">
              取消
            </button>
          </Dialog.Close>
          <button
            class="h-9 px-4 rounded-md text-sm font-medium bg-primary text-on-primary hover:opacity-90 transition-opacity"
            @click="doRenameFolder"
          >
            确定
          </button>
        </div>
      </Dialog.Content>
    </Dialog>

    <!-- 删除文件夹确认对话框 -->
    <Dialog v-model="folderDeleteConfirmOpen">
      <Dialog.Content class="rounded-xl border border-divider bg-surface shadow-xl p-6 max-w-md backdrop:bg-black/50">
        <Dialog.Title class="text-lg font-semibold text-on-surface">
          确认删除文件夹
        </Dialog.Title>
        <Dialog.Description class="mt-2 text-sm text-on-surface-variant">
          删除文件夹后，其中的笔记将自动移至「未分类」。
        </Dialog.Description>
        <div class="flex items-center justify-end gap-2 mt-6">
          <Dialog.Close renderless v-slot="{ attrs }">
            <button v-bind="attrs" class="h-9 px-4 rounded-md text-sm font-medium border border-divider bg-surface text-on-surface hover:bg-surface-variant/60 transition-colors">
              取消
            </button>
          </Dialog.Close>
          <button
            class="h-9 px-4 rounded-md text-sm font-medium bg-error text-on-error hover:opacity-90 transition-opacity"
            @click="doDeleteFolder"
          >
            确认删除
          </button>
        </div>
      </Dialog.Content>
    </Dialog>

    <!-- 移动到文件夹对话框 -->
    <Dialog v-model="moveFolderDialogOpen">
      <Dialog.Content class="rounded-xl border border-divider bg-surface shadow-xl p-6 max-w-md backdrop:bg-black/50">
        <Dialog.Title class="text-lg font-semibold text-on-surface">
          移动到文件夹
        </Dialog.Title>
        <div class="mt-3 space-y-1 max-h-60 overflow-y-auto">
          <button
            class="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left hover:bg-surface-variant/60 transition-colors text-on-surface"
            @click="doMoveNote(null)"
          >
            <span class="i-tabler-folder-off text-sm text-on-surface-variant" />
            未分类
          </button>
          <button
            v-for="folder in foldersStore.folders"
            :key="folder.id"
            class="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left hover:bg-surface-variant/60 transition-colors text-on-surface"
            @click="doMoveNote(folder.id)"
          >
            <span class="i-tabler-folder text-sm text-on-surface-variant" />
            {{ folder.name }}
          </button>
        </div>
        <div class="flex items-center justify-end gap-2 mt-6">
          <Dialog.Close renderless v-slot="{ attrs }">
            <button v-bind="attrs" class="h-9 px-4 rounded-md text-sm font-medium border border-divider bg-surface text-on-surface hover:bg-surface-variant/60 transition-colors">
              取消
            </button>
          </Dialog.Close>
        </div>
      </Dialog.Content>
    </Dialog>
  </div>
</template>

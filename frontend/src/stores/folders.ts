import { defineStore } from 'pinia'
import { ref } from 'vue'
import { listFolders, createFolder, renameFolder, deleteFolder } from '@/api/folders'
import { listNotes } from '@/api/notes'
import type { Folder, Note, TreeNode } from '@/api/types'

/**
 * 将平坦的文件夹列表转换为树形结构，并将笔记合并到对应文件夹下。
 * - 每个 Folder 的 parent_id 指向父节点 id，根节点 parent_id 为 null
 * - 笔记按 folder_id 分组，挂到对应文件夹下；无文件夹笔记挂在根级
 */
function buildTree(folders: Folder[], notes: Note[]): TreeNode[] {
  const map = new Map<number, TreeNode>()
  const roots: TreeNode[] = []

  // 1. 创建所有文件夹节点
  for (const f of folders) {
    map.set(f.id, { id: f.id, name: f.name, type: 'folder', children: [] })
  }

  // 2. 建立文件夹父子关系
  for (const f of folders) {
    const node = map.get(f.id)!
    if (f.parent_id != null && map.has(f.parent_id)) {
      map.get(f.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  // 3. 将笔记作为叶子节点挂到对应文件夹下
  const notesByFolder = new Map<number | null, Note[]>()
  for (const n of notes) {
    const key = n.folder_id
    if (!notesByFolder.has(key)) notesByFolder.set(key, [])
    notesByFolder.get(key)!.push(n)
  }

  for (const [folderId, noteList] of notesByFolder) {
    const noteNodes: TreeNode[] = noteList.map(n => ({
      id: n.id,
      name: n.title || '未命名笔记',
      type: 'note',
      children: [],
    }))

    if (folderId != null && map.has(folderId)) {
      // 挂到文件夹下
      map.get(folderId)!.children.push(...noteNodes)
    } else {
      // 无文件夹笔记挂在根级
      roots.push(...noteNodes)
    }
  }

  return roots
}

export const useFoldersStore = defineStore('folders', () => {
  // ---- state ----
  const rawFolders = ref<Folder[]>([])
  const rawNotes = ref<Note[]>([])
  const tree = ref<TreeNode[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // ---- actions ----
  async function fetchFolders(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const [folders, notes] = await Promise.all([listFolders(), listNotes()])
      rawFolders.value = folders
      rawNotes.value = notes
      tree.value = buildTree(folders, notes)
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  async function addFolder(name: string, parentId?: number): Promise<void> {
    await createFolder(name, parentId)
    await fetchFolders()
  }

  async function renameFolderById(id: number, name: string): Promise<void> {
    await renameFolder(id, name)
    await fetchFolders()
  }

  async function removeFolder(id: number): Promise<void> {
    await deleteFolder(id)
    await fetchFolders()
  }

  return {
    rawFolders,
    rawNotes,
    tree,
    loading,
    error,
    fetchFolders,
    addFolder,
    renameFolderById,
    removeFolder,
  }
})

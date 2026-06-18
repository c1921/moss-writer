import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  listFolders, createFolder, renameFolder, deleteFolder,
  type Folder,
} from '@/api/folders'

export const useFoldersStore = defineStore('folders', () => {
  const folders = ref<Folder[]>([])

  async function loadFolders() {
    try {
      folders.value = await listFolders()
    } catch {
      // 静默（后续可改为通知）
    }
  }

  async function add(name: string) {
    const folder = await createFolder({ name })
    folders.value.push(folder)
    return folder
  }

  async function rename(id: number, name: string) {
    const updated = await renameFolder(id, { name })
    const idx = folders.value.findIndex((f) => f.id === id)
    if (idx !== -1) folders.value[idx] = updated
  }

  async function remove(id: number) {
    await deleteFolder(id)
    folders.value = folders.value.filter((f) => f.id !== id)
  }

  return {
    folders,
    loadFolders,
    add,
    rename,
    remove,
  }
})

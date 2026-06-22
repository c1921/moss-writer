import { api } from './index'
import type { Folder } from './types'

/** 获取所有文件夹列表（平坦结构） */
export function listFolders(): Promise<Folder[]> {
  return api.get<Folder[]>('/folders')
}

/** 创建文件夹 */
export function createFolder(name: string, parentId?: number): Promise<Folder> {
  return api.post<Folder>('/folders', { name, parent_id: parentId ?? null })
}

/** 重命名文件夹 */
export function renameFolder(id: number, name: string): Promise<Folder> {
  return api.put<Folder>(`/folders/${id}`, { name })
}

/** 删除文件夹 */
export function deleteFolder(id: number): Promise<void> {
  return api.del(`/folders/${id}`)
}

import { api } from './index'
import type { Note } from './types'

/** 获取所有笔记列表 */
export function listNotes(): Promise<Note[]> {
  return api.get<Note[]>('/notes')
}

/** 获取单条笔记 */
export function getNote(id: number): Promise<Note> {
  return api.get<Note>(`/notes/${id}`)
}

/** 创建笔记 */
export function createNote(title?: string, folderId?: number): Promise<Note> {
  return api.post<Note>('/notes', { title, folder_id: folderId ?? null })
}

/** 更新笔记 */
export function updateNote(id: number, data: { title?: string; content?: string; folder_id?: number | null }): Promise<Note> {
  return api.put<Note>(`/notes/${id}`, data)
}

/** 删除笔记 */
export function deleteNote(id: number): Promise<void> {
  return api.del(`/notes/${id}`)
}

import axios from 'axios'

export interface Folder {
  id: number
  name: string
  parent_id: number | null
  created_at: string
  updated_at: string
}

export interface CreateFolderPayload {
  name: string
  parent_id?: number | null
}

export interface RenameFolderPayload {
  name: string
}

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
})

export async function listFolders(): Promise<Folder[]> {
  const res = await client.get<Folder[]>('/folders')
  return res.data
}

export async function createFolder(payload: CreateFolderPayload): Promise<Folder> {
  const res = await client.post<Folder>('/folders', payload)
  return res.data
}

export async function renameFolder(id: number, payload: RenameFolderPayload): Promise<Folder> {
  const res = await client.put<Folder>(`/folders/${id}`, payload)
  return res.data
}

export async function deleteFolder(id: number): Promise<void> {
  await client.delete(`/folders/${id}`)
}

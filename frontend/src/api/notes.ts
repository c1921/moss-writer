import axios from 'axios'

// Note 类型定义（与后端模型对应）
export interface Note {
  id: number
  title: string
  content: string
  created_at: string
  updated_at: string
}

export interface CreateNotePayload {
  title: string
  content: string
}

export interface UpdateNotePayload {
  title: string
  content: string
}

const client = axios.create({
  baseURL: 'http://localhost:8080/api',
  headers: { 'Content-Type': 'application/json' },
})

export async function listNotes(): Promise<Note[]> {
  const res = await client.get<Note[]>('/notes')
  return res.data
}

export async function getNote(id: number): Promise<Note> {
  const res = await client.get<Note>(`/notes/${id}`)
  return res.data
}

export async function createNote(payload: CreateNotePayload): Promise<Note> {
  const res = await client.post<Note>('/notes', payload)
  return res.data
}

export async function updateNote(id: number, payload: UpdateNotePayload): Promise<Note> {
  const res = await client.put<Note>(`/notes/${id}`, payload)
  return res.data
}

export async function deleteNote(id: number): Promise<void> {
  await client.delete(`/notes/${id}`)
}

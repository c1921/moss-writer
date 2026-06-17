import axios from "axios"

export interface Note {
  id: number
  title: string
  content: string
  created_at: string
  updated_at: string
}

const api = axios.create({
  baseURL: "http://localhost:8080/api",
  headers: { "Content-Type": "application/json" },
})

export async function listNotes(): Promise<Note[]> {
  const res = await api.get<Note[]>("/notes")
  return res.data
}

export async function getNote(id: number): Promise<Note> {
  const res = await api.get<Note>(`/notes/${id}`)
  return res.data
}

export async function createNote(data?: Partial<Pick<Note, "title" | "content">>): Promise<Note> {
  const res = await api.post<Note>("/notes", {
    title: data?.title ?? "",
    content: data?.content ?? "",
  })
  return res.data
}

export async function updateNote(id: number, data: Partial<Pick<Note, "title" | "content">>): Promise<Note> {
  const res = await api.put<Note>(`/notes/${id}`, data)
  return res.data
}

export async function deleteNote(id: number): Promise<void> {
  await api.delete(`/notes/${id}`)
}

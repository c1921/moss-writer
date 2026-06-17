import axios from 'axios'

export interface Setting {
  key: string
  value: string
}

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
})

export async function getSetting(key: string): Promise<Setting> {
  const res = await client.get<Setting>(`/settings/${key}`)
  return res.data
}

export async function putSetting(key: string, value: string): Promise<Setting> {
  const res = await client.put<Setting>(`/settings/${key}`, { value })
  return res.data
}

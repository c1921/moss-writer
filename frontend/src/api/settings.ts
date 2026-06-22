import { api } from './index'

export interface Setting {
  key: string
  value: string
}

/** 获取设置值 */
export async function getSetting(key: string): Promise<Setting> {
  return api.get<Setting>(`/settings/${key}`)
}

/** 写入设置值 */
export async function putSetting(key: string, value: string): Promise<Setting> {
  return api.put<Setting>(`/settings/${key}`, { value })
}

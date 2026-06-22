/** 文件夹（与后端 models.Folder 对齐） */
export interface Folder {
  id: number
  name: string
  parent_id: number | null
  created_at: string
  updated_at: string
}

/** 笔记（与后端 models.Note 对齐） */
export interface Note {
  id: number
  title: string
  content: string
  folder_id: number | null
  created_at: string
  updated_at: string
}

/** 树形节点类型 */
export type TreeNodeType = 'folder' | 'note'

/** 树形节点，用于递归渲染 */
export interface TreeNode {
  id: number
  name: string
  type: TreeNodeType
  children: TreeNode[]
}

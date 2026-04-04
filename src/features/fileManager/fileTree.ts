import type { FileEntry } from "@/app/types"
import { stripMarkdownExtension } from "@/shared/utils/fileNames"

export type FileTreeNode = FileTreeDirectoryNode | FileTreeFileNode

export interface FileTreeDirectoryNode {
  type: "directory"
  name: string
  path: string
  children: FileTreeNode[]
}

export interface FileTreeFileNode {
  type: "file"
  name: string
  path: string
  file: FileEntry
}

interface MutableDirectoryNode {
  name: string
  path: string
  directories: Map<string, MutableDirectoryNode>
  files: FileTreeFileNode[]
}

function compareByName(left: string, right: string) {
  return left.localeCompare(right, "zh-CN", { numeric: true, sensitivity: "base" })
}

function createDirectoryNode(name: string, path: string): MutableDirectoryNode {
  return {
    name,
    path,
    directories: new Map(),
    files: [],
  }
}

function finalizeDirectory(directory: MutableDirectoryNode): FileTreeDirectoryNode {
  const children = [
    ...Array.from(directory.directories.values())
      .sort((left, right) => compareByName(left.name, right.name))
      .map(finalizeDirectory),
    ...directory.files.sort((left, right) => compareByName(left.name, right.name)),
  ]

  return {
    type: "directory",
    name: directory.name,
    path: directory.path,
    children,
  }
}

export function buildFileTree(files: FileEntry[]): FileTreeNode[] {
  const root = createDirectoryNode("", "")

  for (const file of files) {
    const segments = file.path.split("/").filter(Boolean)
    if (segments.length === 0) {
      continue
    }

    let currentDirectory = root
    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index]
      const nextPath = currentDirectory.path ? `${currentDirectory.path}/${segment}` : segment
      const existingDirectory =
        currentDirectory.directories.get(segment) ?? createDirectoryNode(segment, nextPath)

      currentDirectory.directories.set(segment, existingDirectory)
      currentDirectory = existingDirectory
    }

    currentDirectory.files.push({
      type: "file",
      name: file.name,
      path: file.path,
      file,
    })
  }

  return [
    ...Array.from(root.directories.values())
      .sort((left, right) => compareByName(left.name, right.name))
      .map(finalizeDirectory),
    ...root.files.sort((left, right) => compareByName(left.name, right.name)),
  ]
}

export function getAncestorDirectoryPaths(filePath: string | null) {
  if (!filePath) {
    return []
  }

  const segments = filePath.split("/").filter(Boolean)
  const ancestors: string[] = []

  for (let index = 0; index < segments.length - 1; index += 1) {
    const path = index === 0 ? segments[index] : `${ancestors[index - 1]}/${segments[index]}`
    ancestors.push(path)
  }

  return ancestors
}

export function getParentDirectoryPath(filePath: string | null) {
  if (!filePath) {
    return null
  }

  const segments = filePath.split("/").filter(Boolean)
  if (segments.length <= 1) {
    return null
  }

  return segments.slice(0, -1).join("/")
}

export function stripMarkdownExtensionFromPath(path: string) {
  const segments = path.split("/").filter(Boolean)
  if (segments.length === 0) {
    return stripMarkdownExtension(path)
  }

  const nextSegments = [...segments]
  nextSegments[nextSegments.length - 1] = stripMarkdownExtension(nextSegments[nextSegments.length - 1])

  return nextSegments.join("/")
}

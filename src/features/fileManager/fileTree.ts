import type { DirectoryEntry, FileEntry } from "@/app/types"
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

function ensureDirectory(root: MutableDirectoryNode, path: string) {
  const segments = path.split("/").filter(Boolean)
  if (segments.length === 0) {
    return
  }

  let currentDirectory = root
  for (const segment of segments) {
    const nextPath = currentDirectory.path ? `${currentDirectory.path}/${segment}` : segment
    const existingDirectory =
      currentDirectory.directories.get(segment) ?? createDirectoryNode(segment, nextPath)

    currentDirectory.directories.set(segment, existingDirectory)
    currentDirectory = existingDirectory
  }
}

export function buildFileTree(files: FileEntry[], directories: DirectoryEntry[] = []): FileTreeNode[] {
  const root = createDirectoryNode("", "")

  for (const directory of directories) {
    ensureDirectory(root, directory.path)
  }

  for (const file of files) {
    const segments = file.path.split("/").filter(Boolean)
    if (segments.length === 0) {
      continue
    }

    const parentDirectoryPath = segments.slice(0, -1).join("/")
    ensureDirectory(root, parentDirectoryPath)

    let currentDirectory = root
    for (let index = 0; index < segments.length - 1; index += 1) {
      currentDirectory = currentDirectory.directories.get(segments[index])!
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

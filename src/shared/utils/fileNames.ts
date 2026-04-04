export function stripMarkdownExtension(fileName: string) {
  return fileName.toLowerCase().endsWith(".md") ? fileName.slice(0, -3) : fileName;
}

export function getBaseName(path: string) {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

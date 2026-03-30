/**
 * File Reference Parser for @Files syntax
 * Supports Cursor-style file references in Agent prompts
 */

export interface FileReference {
  type: 'file' | 'folder' | 'glob'
  path: string
  raw: string
  startIndex: number
  endIndex: number
}

export function parseFileReferences(text: string): FileReference[] {
  const references: FileReference[] = []
  const regex = /@(?:File|Files)\s+(?:"([^"]+)"|([^\s]+))/gi

  let match
  while ((match = regex.exec(text)) !== null) {
    const rawPath = match[1] || match[2]
    if (!rawPath) continue

    const path = rawPath.trim()
    const type = determineReferenceType(path)

    references.push({
      type,
      path,
      raw: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    })
  }

  return references
}

function determineReferenceType(path: string): 'file' | 'folder' | 'glob' {
  if (path.includes('*') || path.includes('?') || path.includes('[')) {
    return 'glob'
  }
  if (path.endsWith('/')) {
    return 'folder'
  }
  return 'file'
}

export function extractFilePaths(references: FileReference[]): string[] {
  const paths = new Set<string>()
  for (const ref of references) {
    paths.add(ref.path)
  }
  return Array.from(paths)
}

export function stripFileReferences(text: string): string {
  return text.replace(/@(?:File|Files)\s+(?:"([^"]+)"|([^\s]+))/gi, '').trim()
}

export function formatFileReferences(
  text: string,
  references: FileReference[],
  fileContents: Map<string, string>
): string {
  let result = text
  const sorted = [...references].sort((a, b) => b.startIndex - a.startIndex)

  for (const ref of sorted) {
    const content = fileContents.get(ref.path)
    if (content) {
      const formatted = formatFileContent(ref.path, content)
      result = result.slice(0, ref.startIndex) + formatted + result.slice(ref.endIndex)
    } else {
      result = result.slice(0, ref.startIndex) + result.slice(ref.endIndex)
    }
  }

  return result.trim()
}

function formatFileContent(path: string, content: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  const lang = getLanguageFromExtension(ext)
  return '\n```' + lang + ':' + path + '\n' + content + '\n```\n'
}

export function getLanguageFromExtension(ext: string): string {
  const mapping: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'typescript',
    'js': 'javascript',
    'jsx': 'javascript',
    'go': 'go',
    'py': 'python',
    'rs': 'rust',
    'java': 'java',
    'kt': 'kotlin',
    'swift': 'swift',
    'c': 'c',
    'cpp': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'cs': 'csharp',
    'rb': 'ruby',
    'php': 'php',
    'scala': 'scala',
    'sh': 'bash',
    'yaml': 'yaml',
    'yml': 'yaml',
    'json': 'json',
    'xml': 'xml',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'less': 'less',
    'sql': 'sql',
    'md': 'markdown',
  }

  return mapping[ext] || ext
}

export function isCursorInFileReference(
  text: string,
  cursorPosition: number
): { inReference: boolean; reference?: FileReference; query?: string } {
  const references = parseFileReferences(text)

  for (const ref of references) {
    if (cursorPosition >= ref.startIndex && cursorPosition <= ref.endIndex) {
      return { inReference: true, reference: ref, query: ref.path }
    }
  }

  const beforeCursor = text.slice(0, cursorPosition)
  const atMatch = beforeCursor.match(/@(?:File|Files)$/i)

  if (atMatch) {
    return { inReference: true, query: '' }
  }

  const partialMatch = beforeCursor.match(/@(?:File|Files)\s+([^\s]*)$/i)
  if (partialMatch) {
    return { inReference: true, query: partialMatch[1] }
  }

  return { inReference: false }
}

export function getFileCompletions(
  query: string,
  availableFiles: string[],
  maxResults = 10
): string[] {
  const normalizedQuery = query.toLowerCase()

  const matches = availableFiles.filter((file) => {
    const normalizedFile = file.toLowerCase()
    return (
      normalizedFile.includes(normalizedQuery) ||
      normalizedQuery.includes(normalizedFile.slice(0, normalizedQuery.length))
    )
  })

  matches.sort((a, b) => {
    const aLower = a.toLowerCase()
    const bLower = b.toLowerCase()

    if (aLower === normalizedQuery) return -1
    if (bLower === normalizedQuery) return 1

    if (aLower.startsWith(normalizedQuery) && !bLower.startsWith(normalizedQuery)) return -1
    if (bLower.startsWith(normalizedQuery) && !aLower.startsWith(normalizedQuery)) return 1

    return a.length - b.length
  })

  return matches.slice(0, maxResults)
}

export interface FileReferenceContext {
  hasReferences: boolean
  references: FileReference[]
  filePaths: string[]
  formattedPrompt: string
}

export function processFileReferences(
  text: string,
  fileContents: Map<string, string>
): FileReferenceContext {
  const references = parseFileReferences(text)
  const filePaths = extractFilePaths(references)
  const formattedPrompt = formatFileReferences(text, references, fileContents)

  return {
    hasReferences: references.length > 0,
    references,
    filePaths,
    formattedPrompt,
  }
}

export function highlightFileReferences(
  text: string
): Array<{ type: 'text' | 'reference'; content: string }> {
  const references = parseFileReferences(text)

  if (references.length === 0) {
    return [{ type: 'text', content: text }]
  }

  const parts: Array<{ type: 'text' | 'reference'; content: string }> = []
  let lastIndex = 0
  const sorted = [...references].sort((a, b) => a.startIndex - b.startIndex)

  for (let i = 0; i < sorted.length; i++) {
    const ref = sorted[i]

    if (ref.startIndex > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, ref.startIndex) })
    }

    parts.push({ type: 'reference', content: ref.raw })

    lastIndex = ref.endIndex
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) })
  }

  return parts
}

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import {
  FileCode2, FileJson, FileTerminal, Image, FileLock, Settings, FileText,
} from 'lucide-react'

// Code file extensions (shared constant for file icon/color lookups)
const CODE_EXTENSIONS = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'go', 'rs', 'py', 'pyi', 'java', 'c', 'cpp', 'cc', 'h', 'hpp', 'cs', 'rb', 'php', 'swift', 'kt', 'scala', 'lua', 'r', 'sql']

/**
 * Get file-type icon component (VS Code/Cursor pattern).
 * Shared by EditorTab, TabSwitcher, and file tree.
 */
export function getFileIcon(filename: string): typeof FileText {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const base = filename.split('/').pop()?.toLowerCase() || ''
  if (CODE_EXTENSIONS.includes(ext)) return FileCode2
  if (['json', 'toml', 'lock'].includes(ext)) return FileJson
  if (['sh', 'bash', 'zsh', 'fish', 'ps1'].includes(ext)) return FileTerminal
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp', 'bmp'].includes(ext)) return Image
  if (['env', 'gitignore', 'dockerignore', 'npmrc', 'editorconfig', 'prettierrc', 'eslintrc', 'tsconfig'].includes(base) || base.startsWith('.env')) return FileLock
  if (['yaml', 'yml', 'ini', 'cfg', 'conf'].includes(ext)) return Settings
  return FileText
}

/**
 * Get file-type icon color (VS Code/Cursor pattern).
 * Language-specific colors for code files, tertiary for unknown.
 */
export function getFileIconColor(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  switch (ext) {
    case 'ts': case 'tsx': return 'text-blue-400'
    case 'js': case 'jsx': case 'mjs': case 'cjs': return 'text-yellow-400'
    case 'go': return 'text-cyan-400'
    case 'py': case 'pyi': return 'text-blue-300'
    case 'rs': return 'text-orange-400'
    case 'c': case 'h': return 'text-blue-500'
    case 'cpp': case 'cc': case 'cxx': case 'hpp': case 'hxx': return 'text-blue-400'
    case 'java': return 'text-red-400'
    case 'cs': return 'text-green-400'
    case 'html': case 'htm': return 'text-orange-500'
    case 'css': case 'scss': case 'sass': case 'less': return 'text-purple-400'
    case 'json': return 'text-yellow-300'
    case 'yaml': case 'yml': return 'text-red-300'
    case 'toml': return 'text-orange-300'
    case 'xml': return 'text-orange-400'
    case 'sh': case 'bash': case 'zsh': return 'text-green-300'
    case 'md': case 'mdx': return 'text-blue-300'
    case 'env': case 'gitignore': case 'dockerignore': return 'text-text-tertiary'
    default: return 'text-text-tertiary'
  }
}

/**
 * Merge class names with Tailwind CSS conflict resolution
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Generate a unique ID
 */
export function generateId(prefix = ''): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 9)
  return prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`
}

/**
 * Truncate a string to a maximum length
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 3) + '...'
}

/**
 * Capitalize the first letter of a string
 */
export function capitalize(str: string): string {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i]
}

/**
 * Format duration in milliseconds to human readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`
  return `${(ms / 3600000).toFixed(1)}h`
}

/**
 * Format a date to a relative time string
 */
export function formatRelativeTime(date: Date | string): string {
  const now = new Date()
  const then = typeof date === 'string' ? new Date(date) : date
  const diffMs = now.getTime() - then.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  return then.toLocaleDateString()
}

/**
 * Group array items by a key
 */
export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce((result, item) => {
    const groupKey = String(item[key])
    if (!result[groupKey]) {
      result[groupKey] = []
    }
    result[groupKey].push(item)
    return result
  }, {} as Record<string, T[]>)
}

/**
 * Remove duplicates from an array
 */
export function unique<T>(array: T[]): T[] {
  return [...new Set(array)]
}

/**
 * Chunk an array into smaller arrays
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size))
  }
  return result
}

/**
 * Pick specific keys from an object
 */
export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>
  keys.forEach(key => {
    if (key in obj) {
      result[key] = obj[key]
    }
  })
  return result
}

/**
 * Omit specific keys from an object
 */
export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj }
  keys.forEach(key => {
    delete result[key]
  })
  return result
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

/**
 * Throttle a function
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Check if a value is defined (not null or undefined)
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

/**
 * Check if running in browser environment
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

/**
 * Logger for development/debugging purposes
 * Uses console.warn/error to comply with ESLint no-console rule
 */
export const logger = {
  debug: (tag: string, ...args: unknown[]) => {
    if (import.meta.env.DEV) {
      console.warn(`[${tag}]`, ...args)
    }
  },
  info: (tag: string, ...args: unknown[]) => {
    console.warn(`[${tag}]`, ...args)
  },
  warn: (tag: string, ...args: unknown[]) => {
    console.warn(`[${tag}]`, ...args)
  },
  error: (tag: string, ...args: unknown[]) => {
    console.error(`[${tag}]`, ...args)
  },
}

/**
 * Convert a file path to a file:// URI matching backend's lsp.FileURI() format.
 * Normalizes backslashes to forward slashes and ensures triple-slash for absolute paths.
 */
export function toFileUri(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  if (normalized.startsWith('/')) {
    return `file://${normalized}`
  }
  return `file:///${normalized}`
}

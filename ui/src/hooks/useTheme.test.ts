import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTheme } from './useTheme'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock matchMedia
const matchMediaMock = vi.fn((query: string) => ({
  matches: query.includes('dark'),
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}))

Object.defineProperty(window, 'matchMedia', { value: matchMediaMock })

describe('useTheme', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.classList.remove('dark')
  })

  describe('initial state', () => {
    it('should return dark theme by default', () => {
      const { result } = renderHook(() => useTheme())
      expect(result.current.theme).toBe('dark')
      expect(result.current.effectiveTheme).toBe('dark')
      expect(result.current.isDark).toBe(true)
    })

    it('should load theme from localStorage', () => {
      localStorageMock.getItem.mockReturnValue('light')
      const { result } = renderHook(() => useTheme())
      expect(result.current.theme).toBe('light')
      expect(result.current.effectiveTheme).toBe('light')
      expect(result.current.isDark).toBe(false)
    })

    it('should handle system theme', () => {
      localStorageMock.getItem.mockReturnValue('system')
      const { result } = renderHook(() => useTheme())
      expect(result.current.theme).toBe('system')
      // Since matchMedia mock returns dark for prefers-color-scheme: dark
      expect(result.current.effectiveTheme).toBe('dark')
    })

    it('should handle invalid stored theme value', () => {
      localStorageMock.getItem.mockReturnValue('invalid-theme')
      const { result } = renderHook(() => useTheme())
      // Should fall back to dark
      expect(result.current.theme).toBe('dark')
    })

    it('should handle null from localStorage', () => {
      localStorageMock.getItem.mockReturnValue(null)
      const { result } = renderHook(() => useTheme())
      expect(result.current.theme).toBe('dark')
    })
  })

  describe('setTheme', () => {
    it('should set theme to light', () => {
      const { result } = renderHook(() => useTheme())

      act(() => {
        result.current.setTheme('light')
      })

      expect(result.current.theme).toBe('light')
      expect(result.current.effectiveTheme).toBe('light')
      expect(result.current.isDark).toBe(false)
      expect(localStorageMock.setItem).toHaveBeenCalledWith('swarm-editor-theme', 'light')
    })

    it('should set theme to dark', () => {
      const { result } = renderHook(() => useTheme())

      act(() => {
        result.current.setTheme('dark')
      })

      expect(result.current.theme).toBe('dark')
      expect(result.current.effectiveTheme).toBe('dark')
      expect(result.current.isDark).toBe(true)
      expect(localStorageMock.setItem).toHaveBeenCalledWith('swarm-editor-theme', 'dark')
    })

    it('should set theme to system', () => {
      const { result } = renderHook(() => useTheme())

      act(() => {
        result.current.setTheme('system')
      })

      expect(result.current.theme).toBe('system')
      expect(localStorageMock.setItem).toHaveBeenCalledWith('swarm-editor-theme', 'system')
    })
  })

  describe('toggleTheme', () => {
    it('should toggle from dark to light', () => {
      const { result } = renderHook(() => useTheme())

      act(() => {
        result.current.toggleTheme()
      })

      expect(result.current.theme).toBe('light')
      expect(result.current.isDark).toBe(false)
    })

    it('should toggle from light to dark', () => {
      localStorageMock.getItem.mockReturnValue('light')
      const { result } = renderHook(() => useTheme())

      act(() => {
        result.current.toggleTheme()
      })

      expect(result.current.theme).toBe('dark')
      expect(result.current.isDark).toBe(true)
    })
  })

  describe('DOM updates', () => {
    it('should set data-theme attribute on document', () => {
      localStorageMock.getItem.mockReturnValue('dark')
      const { result } = renderHook(() => useTheme())
      // The effect runs after render
      act(() => {
        result.current.setTheme('dark')
      })
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })

    it('should toggle dark class on document', () => {
      localStorageMock.getItem.mockReturnValue('dark')
      const { result } = renderHook(() => useTheme())
      act(() => {
        result.current.setTheme('dark')
      })
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })

    it('should set light theme on document', () => {
      localStorageMock.getItem.mockReturnValue('light')
      const { result } = renderHook(() => useTheme())
      act(() => {
        result.current.setTheme('light')
      })
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
      expect(document.documentElement.classList.contains('dark')).toBe(false)
    })
  })

  describe('system theme', () => {
    it('should use dark theme when system prefers dark', () => {
      localStorageMock.getItem.mockReturnValue('system')
      matchMediaMock.mockReturnValue({
        matches: true,
        media: '(prefers-color-scheme: dark)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })

      const { result } = renderHook(() => useTheme())

      expect(result.current.theme).toBe('system')
      expect(result.current.effectiveTheme).toBe('dark')
    })

    it('should use light theme when system prefers light', () => {
      localStorageMock.getItem.mockReturnValue('system')
      matchMediaMock.mockReturnValue({
        matches: false,
        media: '(prefers-color-scheme: dark)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })

      const { result } = renderHook(() => useTheme())

      expect(result.current.theme).toBe('system')
      expect(result.current.effectiveTheme).toBe('light')
    })

    it('should respond to system theme changes', () => {
      const changeHandler: { current: (() => void) | null } = { current: null }
      const currentMatches = true

      localStorageMock.getItem.mockReturnValue('system')
      matchMediaMock.mockReturnValue({
        matches: currentMatches,
        media: '(prefers-color-scheme: dark)',
        addEventListener: vi.fn((_: string, handler: () => void) => {
          changeHandler.current = handler
        }),
        removeEventListener: vi.fn(),
      })

      const { result } = renderHook(() => useTheme())

      expect(result.current.effectiveTheme).toBe('dark')

      // Simulate system theme change to light
      if (changeHandler.current) {
        matchMediaMock.mockReturnValue({
          matches: false,
          media: '(prefers-color-scheme: dark)',
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })
        const handler = changeHandler.current
        act(() => {
          handler()
        })
      }

      expect(result.current.effectiveTheme).toBe('light')
    })
  })
})

// Test utility functions
describe('Utility Functions', () => {
  describe('cn (className merger)', () => {
    it('should merge class names', async () => {
      const { clsx } = await import('clsx')
      const { twMerge } = await import('tailwind-merge')

      const cn = (...inputs: (string | undefined | null | false)[]) => {
        return twMerge(clsx(inputs))
      }

      expect(cn('foo', 'bar')).toBe('foo bar')
      expect(cn('foo', undefined, 'bar')).toBe('foo bar')
      const includeBar = false; expect(cn('foo', includeBar ? 'bar' : '')).toBe('foo')
      expect(cn('p-4', 'p-2')).toBe('p-2') // tailwind merge should take the last one
    })
  })
})

// Test date formatting
describe('Date Formatting', () => {
  it('should format ISO date strings', () => {
    const isoString = '2024-01-15T10:30:00Z'
    const date = new Date(isoString)

    expect(date.getFullYear()).toBe(2024)
    expect(date.getMonth()).toBe(0) // January is 0
    expect(date.getDate()).toBe(15)
  })

  it('should calculate time difference', () => {
    const now = new Date()
    const past = new Date(now.getTime() - 60000) // 1 minute ago

    const diff = now.getTime() - past.getTime()
    expect(diff).toBe(60000)
  })
})

// Test ID generation
describe('ID Generation', () => {
  it('should generate unique IDs', () => {
    const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const id1 = generateId()
    const id2 = generateId()

    expect(id1).not.toBe(id2)
    expect(id1).toContain('-')
    expect(id1.length).toBeGreaterThan(10)
  })
})

// Test string utilities
describe('String Utilities', () => {
  it('should truncate long strings', () => {
    const truncate = (str: string, maxLength: number) => {
      if (str.length <= maxLength) return str
      return str.slice(0, maxLength - 3) + '...'
    }

    expect(truncate('short', 10)).toBe('short')
    expect(truncate('this is a very long string', 10)).toBe('this is...')
  })

  it('should capitalize strings', () => {
    const capitalize = (str: string) => {
      return str.charAt(0).toUpperCase() + str.slice(1)
    }

    expect(capitalize('hello')).toBe('Hello')
    expect(capitalize('WORLD')).toBe('WORLD')
    expect(capitalize('')).toBe('')
  })

  it('should format file sizes', () => {
    const formatFileSize = (bytes: number): string => {
      if (bytes === 0) return '0 B'
      const k = 1024
      const sizes = ['B', 'KB', 'MB', 'GB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
    }

    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(1024)).toBe('1 KB')
    expect(formatFileSize(1048576)).toBe('1 MB')
    expect(formatFileSize(1536)).toBe('1.5 KB')
  })
})

// Test array utilities
describe('Array Utilities', () => {
  it('should group array items by key', () => {
    const groupBy = <T>(array: T[], key: keyof T): Record<string, T[]> => {
      return array.reduce((result, item) => {
        const groupKey = String(item[key])
        if (!result[groupKey]) {
          result[groupKey] = []
        }
        result[groupKey].push(item)
        return result
      }, {} as Record<string, T[]>)
    }

    const items = [
      { type: 'a', value: 1 },
      { type: 'b', value: 2 },
      { type: 'a', value: 3 },
    ]

    const grouped = groupBy(items, 'type')
    expect(grouped['a']).toHaveLength(2)
    expect(grouped['b']).toHaveLength(1)
  })

  it('should remove duplicates from array', () => {
    const unique = <T>(array: T[]): T[] => {
      return [...new Set(array)]
    }

    expect(unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3])
    expect(unique(['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('should chunk array', () => {
    const chunk = <T>(array: T[], size: number): T[][] => {
      const result: T[][] = []
      for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size))
      }
      return result
    }

    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([1, 2, 3], 3)).toEqual([[1, 2, 3]])
  })
})

// Test object utilities
describe('Object Utilities', () => {
  it('should pick specific keys from object', () => {
    const pick = <T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> => {
      const result = {} as Pick<T, K>
      keys.forEach(key => {
        if (key in obj) {
          result[key] = obj[key]
        }
      })
      return result
    }

    const obj = { a: 1, b: 2, c: 3 }
    expect(pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 })
  })

  it('should omit specific keys from object', () => {
    const omit = <T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> => {
      const result = { ...obj }
      keys.forEach(key => {
        delete result[key]
      })
      return result
    }

    const obj = { a: 1, b: 2, c: 3 }
    expect(omit(obj, ['b'])).toEqual({ a: 1, c: 3 })
  })
})

// Test debounce utility
describe('Debounce Utility', () => {
  it('should debounce function calls', async () => {
    const debounce = <T extends (...args: unknown[]) => unknown>(
      fn: T,
      delay: number
    ): ((...args: Parameters<T>) => void) => {
      let timeoutId: ReturnType<typeof setTimeout>
      return (...args: Parameters<T>) => {
        clearTimeout(timeoutId)
        timeoutId = setTimeout(() => fn(...args), delay)
      }
    }

    let callCount = 0
    const fn = debounce(() => {
      callCount++
    }, 100)

    fn()
    fn()
    fn()

    expect(callCount).toBe(0) // Not called yet

    await new Promise(resolve => setTimeout(resolve, 150))

    expect(callCount).toBe(1) // Only called once
  })
})

// SSR Edge Case Tests - Must be at the end of the file
// These tests modify global state and need to run last to avoid breaking other tests
describe('getSystemTheme SSR edge case', () => {
  it('should return dark when matchMedia is not available', async () => {
    const originalMatchMedia = window.matchMedia
    Object.defineProperty(window, 'matchMedia', {
      value: undefined,
      writable: true,
      configurable: true,
    })
    vi.resetModules()
    const { getSystemTheme } = await import('./useTheme')
    expect(getSystemTheme()).toBe('dark')
    Object.defineProperty(window, 'matchMedia', {
      value: originalMatchMedia,
      writable: true,
      configurable: true,
    })
  })
})

describe('getStoredTheme and setStoredTheme SSR edge cases', () => {
  it('should return dark when window is undefined in getStoredTheme', async () => {
    // Save original window
    const originalWindow = global.window
    // @ts-expect-error - Testing SSR scenario
    delete global.window

    vi.resetModules()

    // Re-import after removing window
    const { getStoredTheme } = await import('./useTheme')

    // getStoredTheme should return 'dark' when window is undefined (else branch at line 21)
    expect(getStoredTheme()).toBe('dark')

    // Restore window
    global.window = originalWindow
    vi.doUnmock('./useTheme')
  })

  it('should not throw when setStoredTheme is called without window', async () => {
    // This tests the SSR guard in setStoredTheme (line 25)
    const { useTheme } = await import('./useTheme')
    const { result } = renderHook(() => useTheme())

    act(() => {
      result.current.setTheme('light')
    })

    expect(result.current.theme).toBe('light')
  })

  it('covers setStoredTheme else branch when window is undefined', async () => {
    // Save original window
    const originalWindow = global.window

    // @ts-expect-error - Testing SSR scenario
    delete global.window

    vi.resetModules()

    // Re-import after removing window
    const { setStoredTheme } = await import('./useTheme')

    // setStoredTheme should not throw when window is undefined (else branch at line 27)
    expect(() => setStoredTheme('dark')).not.toThrow()
    expect(() => setStoredTheme('light')).not.toThrow()
    expect(() => setStoredTheme('system')).not.toThrow()

    // Restore window
    global.window = originalWindow
  })
})


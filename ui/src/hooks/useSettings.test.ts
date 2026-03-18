import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSettings, loadSettings, saveSettings, defaultSettings } from './useSettings'

// Use the exported functions in tests
void loadSettings
void saveSettings
void defaultSettings

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

describe('useSettings', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('should return default settings when no stored settings', () => {
      const { result } = renderHook(() => useSettings())

      expect(result.current.settings.theme).toBe('dark')
      expect(result.current.settings.fontSize).toBe(14)
      expect(result.current.settings.fontFamily).toBe('JetBrains Mono')
      expect(result.current.settings.autoSave).toBe(true)
    })

    it('should load settings from localStorage', () => {
      const storedSettings = {
        theme: 'light',
        fontSize: 16,
        fontFamily: 'Fira Code',
        autoSave: false,
      }
      localStorageMock.getItem.mockReturnValue(JSON.stringify(storedSettings))

      const { result } = renderHook(() => useSettings())

      expect(result.current.settings.theme).toBe('light')
      expect(result.current.settings.fontSize).toBe(16)
      expect(result.current.settings.fontFamily).toBe('Fira Code')
      expect(result.current.settings.autoSave).toBe(false)
    })

    it('should merge stored settings with defaults', () => {
      const storedSettings = { fontSize: 18 }
      localStorageMock.getItem.mockReturnValue(JSON.stringify(storedSettings))

      const { result } = renderHook(() => useSettings())

      expect(result.current.settings.fontSize).toBe(18)
      expect(result.current.settings.theme).toBe('dark') // default
      expect(result.current.settings.autoSave).toBe(true) // default
    })
  })

  describe('updateSetting', () => {
    it('should update a single setting', () => {
      const { result } = renderHook(() => useSettings())

      act(() => {
        result.current.updateSetting('fontSize', 20)
      })

      expect(result.current.settings.fontSize).toBe(20)
    })

    it('should persist updated setting to localStorage', () => {
      const { result } = renderHook(() => useSettings())

      act(() => {
        result.current.updateSetting('theme', 'light')
      })

      expect(localStorageMock.setItem).toHaveBeenCalled()
      const savedData = JSON.parse(
        localStorageMock.setItem.mock.calls[
          localStorageMock.setItem.mock.calls.length - 1
        ][1] as string
      )
      expect(savedData.theme).toBe('light')
    })

    it('should update multiple settings independently', () => {
      const { result } = renderHook(() => useSettings())

      act(() => {
        result.current.updateSetting('fontSize', 18)
      })

      act(() => {
        result.current.updateSetting('tabSize', 4)
      })

      expect(result.current.settings.fontSize).toBe(18)
      expect(result.current.settings.tabSize).toBe(4)
    })
  })

  describe('setSettings', () => {
    it('should update multiple settings at once', () => {
      const { result } = renderHook(() => useSettings())

      act(() => {
        result.current.setSettings({
          fontSize: 16,
          fontFamily: 'Fira Code',
          autoSave: false,
        })
      })

      expect(result.current.settings.fontSize).toBe(16)
      expect(result.current.settings.fontFamily).toBe('Fira Code')
      expect(result.current.settings.autoSave).toBe(false)
    })

    it('should preserve other settings when updating', () => {
      const { result } = renderHook(() => useSettings())

      act(() => {
        result.current.setSettings({ fontSize: 20 })
      })

      expect(result.current.settings.fontSize).toBe(20)
      expect(result.current.settings.theme).toBe('dark')
      expect(result.current.settings.autoSave).toBe(true)
    })
  })

  describe('resetSettings', () => {
    it('should reset all settings to defaults', () => {
      const { result } = renderHook(() => useSettings())

      act(() => {
        result.current.setSettings({
          theme: 'light',
          fontSize: 20,
          autoSave: false,
        })
      })

      expect(result.current.settings.theme).toBe('light')
      expect(result.current.settings.fontSize).toBe(20)

      act(() => {
        result.current.resetSettings()
      })

      expect(result.current.settings.theme).toBe('dark')
      expect(result.current.settings.fontSize).toBe(14)
      expect(result.current.settings.autoSave).toBe(true)
    })
  })

  describe('persistence', () => {
    it('should save to localStorage on every change', () => {
      const { result } = renderHook(() => useSettings())

      act(() => {
        result.current.updateSetting('fontSize', 16)
      })

      act(() => {
        result.current.updateSetting('theme', 'light')
      })

      // Initial load + 2 updates
      expect(localStorageMock.setItem).toHaveBeenCalledTimes(3)
    })
  })

  describe('error handling', () => {
    it('should handle localStorage parse errors', () => {
      localStorageMock.getItem.mockReturnValue('invalid json')

      const { result } = renderHook(() => useSettings())

      // Should fall back to defaults
      expect(result.current.settings.theme).toBe('dark')
      expect(result.current.settings.fontSize).toBe(14)
    })

    it('should handle localStorage write errors', () => {
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded')
      })

      const { result } = renderHook(() => useSettings())

      // Should not throw
      act(() => {
        result.current.updateSetting('fontSize', 18)
      })

      expect(result.current.settings.fontSize).toBe(18)
    })
  })
})

// Test SSR edge cases
describe('SSR edge cases', () => {
  describe('loadSettings', () => {
    it('should return default settings when window is undefined', async () => {
      const originalWindow = globalThis.window

      // Temporarily remove window
      // @ts-expect-error - intentionally setting to undefined for SSR test
      globalThis.window = undefined

      // Re-import to get fresh function
      vi.resetModules()
      const { loadSettings: freshLoadSettings, defaultSettings: freshDefaults } = await import('./useSettings')

      expect(freshLoadSettings()).toEqual(freshDefaults)

      // Restore
      globalThis.window = originalWindow
    })
  })

  describe('saveSettings', () => {
    it('should not throw when window is undefined', async () => {
      const originalWindow = globalThis.window

      // Temporarily remove window
      // @ts-expect-error - intentionally setting to undefined for SSR test
      globalThis.window = undefined

      // Re-import to get fresh function
      vi.resetModules()
      const { saveSettings: freshSaveSettings, defaultSettings: freshDefaults } = await import('./useSettings')

      // Should not throw
      expect(() => freshSaveSettings(freshDefaults)).not.toThrow()

      // Restore
      globalThis.window = originalWindow
    })
  })
})

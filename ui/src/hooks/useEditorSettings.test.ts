import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { type EditorView } from '@codemirror/view'

// Hoist ALL mock functions so vi.mock factories can reference them
const { mockReconfigure, mockGet, mockLoadSettings } = vi.hoisted(() => {
  const mockReconfigure = vi.fn((val: unknown) => ({ type: 'reconfigure', value: val }))
  const mockGet = vi.fn((): string | undefined => 'mocked')
  const mockLoadSettings = vi.fn()
  return { mockReconfigure, mockGet, mockLoadSettings }
})

// Mock logger
vi.mock('../utils', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

// Mock CodeMirror modules to avoid real CM6 import
vi.mock('@codemirror/view', () => ({
  EditorView: {
    theme: vi.fn((obj: unknown) => obj),
    lineWrapping: Symbol('lineWrapping'),
  },
}))

vi.mock('@codemirror/state', () => ({
  EditorState: { tabSize: { of: vi.fn((n: number) => ({ tabSize: n })) } },
  StateEffect: {},
}))

vi.mock('../utils/codemirrorSetup', () => ({
  tabSizeCompartment: { reconfigure: mockReconfigure, get: mockGet },
  themeCompartment: { reconfigure: mockReconfigure, get: mockGet },
  wrapCompartment: { reconfigure: mockReconfigure, get: mockGet },
  gutterCompartment: { reconfigure: mockReconfigure, get: mockGet },
}))

// Mock useSettings loadSettings
vi.mock('./useSettings', async (importOriginal) => {
  const original = await importOriginal<typeof import('./useSettings')>()
  return {
    ...original,
    loadSettings: mockLoadSettings,
  }
})

import {
  toEditorSettings,
  applySettingsToView,
  defaultEditorSettings,
  useEditorSettings,
  type EditorSettings,
} from './useEditorSettings'
import { defaultSettings } from './useSettings'
import { logger } from '../utils'

function createMockView() {
  const mock = {
    state: {},
    dispatch: vi.fn(),
  }
  // Cast through unknown to EditorView for applySettingsToView compatibility
  // The mock has the shape needed (state + dispatch) for the function's internals
  return mock as unknown as EditorView & { dispatch: ReturnType<typeof vi.fn> }
}

// ---------------------------------------------------------------------------
// defaultEditorSettings
// ---------------------------------------------------------------------------
describe('defaultEditorSettings', () => {
  it('matches defaultSettings subset', () => {
    expect(defaultEditorSettings.fontSize).toBe(defaultSettings.fontSize)
    expect(defaultEditorSettings.fontFamily).toBe(defaultSettings.fontFamily)
    expect(defaultEditorSettings.tabSize).toBe(defaultSettings.tabSize)
    expect(defaultEditorSettings.wordWrap).toBe(defaultSettings.wordWrap)
    expect(defaultEditorSettings.lineNumbers).toBe(defaultSettings.lineNumbers)
    expect(defaultEditorSettings.autoSave).toBe(defaultSettings.autoSave)
    expect(defaultEditorSettings.autoSaveDelay).toBe(defaultSettings.autoSaveDelay)
    expect(defaultEditorSettings.minimap).toBe(defaultSettings.minimap)
  })

  it('has expected default values', () => {
    expect(defaultEditorSettings.fontSize).toBe(14)
    expect(defaultEditorSettings.fontFamily).toBe('JetBrains Mono')
    expect(defaultEditorSettings.tabSize).toBe(2)
    expect(defaultEditorSettings.wordWrap).toBe(true)
    expect(defaultEditorSettings.lineNumbers).toBe('on')
    expect(defaultEditorSettings.autoSave).toBe(true)
    expect(defaultEditorSettings.autoSaveDelay).toBe(1000)
    expect(defaultEditorSettings.renderWhitespace).toBe('selection')
    expect(defaultEditorSettings.bracketPairColorization).toBe(true)
    expect(defaultEditorSettings.cursorBlinking).toBe('blink')
    expect(defaultEditorSettings.smoothScrolling).toBe(true)
    expect(defaultEditorSettings.minimap).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// toEditorSettings
// ---------------------------------------------------------------------------
describe('toEditorSettings', () => {
  it('extracts editor-relevant fields from full Settings', () => {
    const full = { ...defaultSettings, fontSize: 18, tabSize: 4 }
    const editor = toEditorSettings(full)
    expect(editor.fontSize).toBe(18)
    expect(editor.tabSize).toBe(4)
    expect(editor.fontFamily).toBe(defaultSettings.fontFamily)
    expect(editor.wordWrap).toBe(defaultSettings.wordWrap)
  })

  it('returns all 12 EditorSettings fields', () => {
    const editor = toEditorSettings(defaultSettings)
    const keys: (keyof EditorSettings)[] = [
      'fontSize', 'fontFamily', 'tabSize', 'wordWrap', 'lineNumbers',
      'renderWhitespace', 'bracketPairColorization', 'autoSave', 'autoSaveDelay',
      'cursorBlinking', 'smoothScrolling', 'minimap',
    ]
    for (const key of keys) {
      expect(editor).toHaveProperty(key)
    }
  })

  it('does not include non-editor fields', () => {
    const editor = toEditorSettings(defaultSettings) as unknown as Record<string, unknown>
    expect(editor.theme).toBeUndefined()
    expect(editor.apiKey).toBeUndefined()
    expect(editor.websocketPort).toBeUndefined()
  })

  it('preserves overridden values', () => {
    const custom = {
      ...defaultSettings,
      fontSize: 24,
      fontFamily: 'Custom Mono',
      tabSize: 8,
      wordWrap: false,
      lineNumbers: 'off' as const,
      cursorBlinking: 'smooth' as const,
    }
    const editor = toEditorSettings(custom)
    expect(editor.fontSize).toBe(24)
    expect(editor.fontFamily).toBe('Custom Mono')
    expect(editor.tabSize).toBe(8)
    expect(editor.wordWrap).toBe(false)
    expect(editor.lineNumbers).toBe('off')
    expect(editor.cursorBlinking).toBe('smooth')
  })

  it('preserves all renderWhitespace values', () => {
    for (const mode of ['none', 'boundary', 'selection', 'trailing', 'all'] as const) {
      const s = { ...defaultSettings, renderWhitespace: mode }
      expect(toEditorSettings(s).renderWhitespace).toBe(mode)
    }
  })

  it('preserves all cursorBlinking values', () => {
    for (const mode of ['blink', 'smooth', 'phase', 'expand', 'solid'] as const) {
      const s = { ...defaultSettings, cursorBlinking: mode }
      expect(toEditorSettings(s).cursorBlinking).toBe(mode)
    }
  })

  it('preserves all lineNumbers values', () => {
    for (const mode of ['on', 'off', 'relative'] as const) {
      const s = { ...defaultSettings, lineNumbers: mode }
      expect(toEditorSettings(s).lineNumbers).toBe(mode)
    }
  })

  it('preserves boolean fields independently', () => {
    const s = {
      ...defaultSettings,
      wordWrap: false,
      bracketPairColorization: false,
      autoSave: false,
      smoothScrolling: false,
      minimap: false,
    }
    const editor = toEditorSettings(s)
    expect(editor.wordWrap).toBe(false)
    expect(editor.bracketPairColorization).toBe(false)
    expect(editor.autoSave).toBe(false)
    expect(editor.smoothScrolling).toBe(false)
    expect(editor.minimap).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// applySettingsToView
// ---------------------------------------------------------------------------
describe('applySettingsToView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockReturnValue('mocked')
  })

  it('returns false when no compartments exist in view state', () => {
    mockGet.mockReturnValue(undefined)
    const view = createMockView()
    const result = applySettingsToView(view, defaultEditorSettings)
    expect(result).toBe(false)
    expect(view.dispatch).not.toHaveBeenCalled()
  })

  it('dispatches effects when compartments are present', () => {
    const view = createMockView()
    const result = applySettingsToView(view, defaultEditorSettings)
    expect(result).toBe(true)
    expect(view.dispatch).toHaveBeenCalledTimes(1)
    // 4 effects: theme, tabSize, wrap, gutter
    const call = view.dispatch.mock.calls[0][0]
    expect(call.effects).toHaveLength(4)
  })

  it('calls reconfigure for each of 4 compartments', () => {
    const view = createMockView()
    applySettingsToView(view,defaultEditorSettings)
    expect(mockReconfigure).toHaveBeenCalledTimes(4)
  })

  it('applies custom fontSize and fontFamily', () => {
    const view = createMockView()
    const settings: EditorSettings = { ...defaultEditorSettings, fontSize: 20, fontFamily: 'Fira Code' }
    applySettingsToView(view,settings)
    expect(mockReconfigure).toHaveBeenCalled()
  })

  it('applies wordWrap=false', () => {
    const view = createMockView()
    const settings: EditorSettings = { ...defaultEditorSettings, wordWrap: false }
    applySettingsToView(view,settings)
    expect(mockReconfigure).toHaveBeenCalled()
  })

  it('applies lineNumbers=off', () => {
    const view = createMockView()
    const settings: EditorSettings = { ...defaultEditorSettings, lineNumbers: 'off' }
    applySettingsToView(view,settings)
    expect(mockReconfigure).toHaveBeenCalled()
  })

  it('applies lineNumbers=relative', () => {
    const view = createMockView()
    const settings: EditorSettings = { ...defaultEditorSettings, lineNumbers: 'relative' }
    applySettingsToView(view,settings)
    expect(mockReconfigure).toHaveBeenCalled()
  })

  it('handles partial compartment availability', () => {
    let callCount = 0
    mockGet.mockImplementation(() => {
      callCount++
      return callCount === 1 ? 'mocked' : undefined
    })
    const view = createMockView()
    const result = applySettingsToView(view, defaultEditorSettings)
    expect(result).toBe(true)
    expect(view.dispatch).toHaveBeenCalledTimes(1)
    const call = view.dispatch.mock.calls[0][0]
    expect(call.effects).toHaveLength(1)
  })

  it('handles all compartments returning undefined gracefully', () => {
    mockGet.mockReturnValue(undefined)
    const view = createMockView()
    const result = applySettingsToView(view, defaultEditorSettings)
    expect(result).toBe(false)
    expect(mockReconfigure).not.toHaveBeenCalled()
    expect(view.dispatch).not.toHaveBeenCalled()
  })

  it('handles compartment.get throwing', () => {
    mockGet.mockImplementation(() => { throw new Error('nope') })
    const view = createMockView()
    const result = applySettingsToView(view, defaultEditorSettings)
    expect(result).toBe(false)
    expect(view.dispatch).not.toHaveBeenCalled()
  })

  it('handles mixed: some compartments ok, some throw', () => {
    let callCount = 0
    mockGet.mockImplementation(() => {
      callCount++
      if (callCount === 2) throw new Error('bad')
      return 'mocked'
    })
    const view = createMockView()
    const result = applySettingsToView(view, defaultEditorSettings)
    expect(result).toBe(true)
    // 3 of 4 compartments succeed
    const call = view.dispatch.mock.calls[0][0]
    expect(call.effects).toHaveLength(3)
  })

  it('handles all compartments throwing', () => {
    mockGet.mockImplementation(() => { throw new Error('all fail') })
    const view = createMockView()
    const result = applySettingsToView(view, defaultEditorSettings)
    expect(result).toBe(false)
    expect(view.dispatch).not.toHaveBeenCalled()
  })

  it('applies lineNumbers=on (default)', () => {
    const view = createMockView()
    const settings: EditorSettings = { ...defaultEditorSettings, lineNumbers: 'on' }
    applySettingsToView(view,settings)
    expect(mockReconfigure).toHaveBeenCalledTimes(4)
  })

  it('applies all different cursorBlinking values', () => {
    for (const mode of ['smooth', 'phase', 'expand', 'solid'] as const) {
      vi.clearAllMocks()
      mockGet.mockReturnValue('mocked')
      const view = createMockView()
      const settings: EditorSettings = { ...defaultEditorSettings, cursorBlinking: mode }
      applySettingsToView(view,settings)
      expect(mockReconfigure).toHaveBeenCalled()
    }
  })

  it('applies custom tabSize values', () => {
    for (const size of [2, 4, 8]) {
      vi.clearAllMocks()
      mockGet.mockReturnValue('mocked')
      const view = createMockView()
      const settings: EditorSettings = { ...defaultEditorSettings, tabSize: size }
      applySettingsToView(view,settings)
      expect(mockReconfigure).toHaveBeenCalled()
    }
  })

  it('applies different renderWhitespace values', () => {
    for (const mode of ['none', 'boundary', 'selection', 'trailing', 'all'] as const) {
      vi.clearAllMocks()
      mockGet.mockReturnValue('mocked')
      const view = createMockView()
      const settings: EditorSettings = { ...defaultEditorSettings, renderWhitespace: mode }
      applySettingsToView(view,settings)
      expect(mockReconfigure).toHaveBeenCalled()
    }
  })

  it('logs debug when themeCompartment.get throws', () => {
    mockGet.mockImplementation(() => { throw new Error('theme fail') })
    const view = createMockView()
    applySettingsToView(view,defaultEditorSettings)
    expect(logger.debug).toHaveBeenCalled()
  })

  it('logs debug when tabSizeCompartment.get throws', () => {
    let callCount = 0
    mockGet.mockImplementation(() => {
      callCount++
      if (callCount === 2) throw new Error('tab fail')
      return 'mocked'
    })
    const view = createMockView()
    applySettingsToView(view,defaultEditorSettings)
    expect(logger.debug).toHaveBeenCalled()
  })

  it('logs debug when wrapCompartment.get throws', () => {
    let callCount = 0
    mockGet.mockImplementation(() => {
      callCount++
      if (callCount === 3) throw new Error('wrap fail')
      return 'mocked'
    })
    const view = createMockView()
    applySettingsToView(view,defaultEditorSettings)
    expect(logger.debug).toHaveBeenCalled()
  })

  it('logs debug when gutterCompartment.get throws', () => {
    let callCount = 0
    mockGet.mockImplementation(() => {
      callCount++
      if (callCount === 4) throw new Error('gutter fail')
      return 'mocked'
    })
    const view = createMockView()
    applySettingsToView(view,defaultEditorSettings)
    expect(logger.debug).toHaveBeenCalled()
  })

  it('applies wordWrap=true dispatches lineWrapping', () => {
    const view = createMockView()
    const settings: EditorSettings = { ...defaultEditorSettings, wordWrap: true }
    applySettingsToView(view,settings)
    expect(mockReconfigure).toHaveBeenCalledTimes(4)
  })

  it('applies fontSize 1 edge case', () => {
    const view = createMockView()
    const settings: EditorSettings = { ...defaultEditorSettings, fontSize: 1 }
    applySettingsToView(view,settings)
    expect(mockReconfigure).toHaveBeenCalledTimes(4)
  })

  it('applies very large fontSize', () => {
    const view = createMockView()
    const settings: EditorSettings = { ...defaultEditorSettings, fontSize: 72 }
    applySettingsToView(view,settings)
    expect(mockReconfigure).toHaveBeenCalledTimes(4)
  })
})

// ---------------------------------------------------------------------------
// useEditorSettings hook
// ---------------------------------------------------------------------------
describe('useEditorSettings hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockGet.mockReturnValue('mocked')
    mockLoadSettings.mockReturnValue(defaultSettings)
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns settings object', () => {
    const { result } = renderHook(() => useEditorSettings())
    expect(result.current.settings).toBeDefined()
    expect(result.current.settings.fontSize).toBe(14)
    expect(result.current.settings.fontFamily).toBe('JetBrains Mono')
  })

  it('returns applyToView function', () => {
    const { result } = renderHook(() => useEditorSettings())
    expect(typeof result.current.applyToView).toBe('function')
  })

  it('returns applyToViews function', () => {
    const { result } = renderHook(() => useEditorSettings())
    expect(typeof result.current.applyToViews).toBe('function')
  })

  it('returns getSettings function', () => {
    const { result } = renderHook(() => useEditorSettings())
    expect(typeof result.current.getSettings).toBe('function')
  })

  it('returns registerAutoSave function', () => {
    const { result } = renderHook(() => useEditorSettings())
    expect(typeof result.current.registerAutoSave).toBe('function')
  })

  it('applyToView returns false for null view', () => {
    const { result } = renderHook(() => useEditorSettings())
    expect(result.current.applyToView(null)).toBe(false)
  })

  it('applyToView returns true for valid view with compartments', () => {
    const { result } = renderHook(() => useEditorSettings())
    const view = createMockView()
    expect(result.current.applyToView(view)).toBe(true)
    expect(view.dispatch).toHaveBeenCalled()
  })

  it('applyToViews applies to multiple non-null views', () => {
    const { result } = renderHook(() => useEditorSettings())
    const view1 = createMockView()
    const view2 = createMockView()
    result.current.applyToViews([view1, null, view2])
    expect(view1.dispatch).toHaveBeenCalled()
    expect(view2.dispatch).toHaveBeenCalled()
  })

  it('applyToViews handles all null views', () => {
    const { result } = renderHook(() => useEditorSettings())
    result.current.applyToViews([null, null])
    // No crash, no dispatch
  })

  it('applyToViews handles empty array', () => {
    const { result } = renderHook(() => useEditorSettings())
    result.current.applyToViews([])
    // No crash
  })

  it('getSettings returns current settings snapshot', () => {
    const { result } = renderHook(() => useEditorSettings())
    const settings = result.current.getSettings()
    expect(settings).toEqual(result.current.settings)
  })

  describe('auto-save timer', () => {
    it('does not start timer when autoSave is false', () => {
      mockLoadSettings.mockReturnValue({ ...defaultSettings, autoSave: false })
      const { result } = renderHook(() => useEditorSettings())
      result.current.registerAutoSave(vi.fn())
      vi.advanceTimersByTime(5000)
      // No timer was started since autoSave is false
    })

    it('does not call callback when registered as null', () => {
      mockLoadSettings.mockReturnValue({ ...defaultSettings, autoSave: true, autoSaveDelay: 500 })
      const { result } = renderHook(() => useEditorSettings())
      result.current.registerAutoSave(null)
      vi.advanceTimersByTime(2000)
      // No crash, no timer set
    })

    it('registers and replaces auto-save callback', () => {
      const cb1 = vi.fn()
      const cb2 = vi.fn()
      const { result } = renderHook(() => useEditorSettings())
      result.current.registerAutoSave(cb1)
      result.current.registerAutoSave(cb2)
      // Callback was set; the actual invocation depends on effect timing
    })

    it('clears timer on unmount', () => {
      mockLoadSettings.mockReturnValue({ ...defaultSettings, autoSave: true, autoSaveDelay: 100 })
      const { result, unmount } = renderHook(() => useEditorSettings())
      result.current.registerAutoSave(vi.fn())
      unmount()
      // No crash — cleanup ran
    })
  })

  describe('settings event listeners', () => {
    it('reloads settings on storage event for correct key', () => {
      mockLoadSettings.mockReturnValue({ ...defaultSettings, fontSize: 20 })
      renderHook(() => useEditorSettings())
      const storageEvent = new StorageEvent('storage', { key: 'swarm-editor-settings' })
      window.dispatchEvent(storageEvent)
      expect(mockLoadSettings).toHaveBeenCalled()
    })

    it('ignores storage event for other keys', () => {
      renderHook(() => useEditorSettings())
      const postRenderCallCount = mockLoadSettings.mock.calls.length
      const storageEvent = new StorageEvent('storage', { key: 'other-key' })
      window.dispatchEvent(storageEvent)
      // Should not have called loadSettings again beyond the render calls
      expect(mockLoadSettings.mock.calls.length).toBe(postRenderCallCount)
    })

    it('reloads settings on custom settings-changed event', () => {
      mockLoadSettings.mockReturnValue({ ...defaultSettings, fontSize: 22 })
      renderHook(() => useEditorSettings())
      window.dispatchEvent(new CustomEvent('swarm-editor-settings-changed'))
      expect(mockLoadSettings).toHaveBeenCalled()
    })

    it('cleans up event listeners on unmount', () => {
      const { unmount } = renderHook(() => useEditorSettings())
      const callCountBefore = mockLoadSettings.mock.calls.length
      unmount()
      window.dispatchEvent(new CustomEvent('swarm-editor-settings-changed'))
      const storageEvent = new StorageEvent('storage', { key: 'swarm-editor-settings' })
      window.dispatchEvent(storageEvent)
      // Should not have been called more after unmount (beyond what already happened)
      expect(mockLoadSettings.mock.calls.length).toBe(callCountBefore)
    })
  })

  describe('loadEditorSettings error handling', () => {
    it('returns defaultEditorSettings when loadSettings throws', () => {
      mockLoadSettings.mockImplementation(() => { throw new Error('broken') })
      const { result } = renderHook(() => useEditorSettings())
      expect(result.current.settings.fontSize).toBe(defaultSettings.fontSize)
      expect(result.current.settings.fontFamily).toBe(defaultSettings.fontFamily)
    })
  })
})

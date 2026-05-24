import { describe, it, expect, vi, beforeEach } from 'vitest'
import { type EditorSettings } from './useEditorSettings'
import { defaultSettings } from './useSettings'

// Hoist mock functions so vi.mock factories can reference them
const { mockReconfigure, mockGet } = vi.hoisted(() => {
  const mockReconfigure = vi.fn((val: unknown) => ({ type: 'reconfigure', value: val }))
  const mockGet = vi.fn((): string | undefined => 'mocked')
  return { mockReconfigure, mockGet }
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

import {
  toEditorSettings,
  applySettingsToView,
  defaultEditorSettings,
} from './useEditorSettings'

function createMockView() {
  return {
    state: {},
    dispatch: vi.fn(),
  }
}

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
})

describe('applySettingsToView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockReturnValue('mocked')
  })

  it('returns false when no compartments exist in view state', () => {
    mockGet.mockReturnValue(undefined)
    const view = createMockView()
    const result = applySettingsToView(view as any, defaultEditorSettings)
    expect(result).toBe(false)
    expect(view.dispatch).not.toHaveBeenCalled()
  })

  it('dispatches effects when compartments are present', () => {
    const view = createMockView()
    const result = applySettingsToView(view as any, defaultEditorSettings)
    expect(result).toBe(true)
    expect(view.dispatch).toHaveBeenCalledTimes(1)
    // 4 effects: theme, tabSize, wrap, gutter
    const call = view.dispatch.mock.calls[0][0]
    expect(call.effects).toHaveLength(4)
  })

  it('calls reconfigure for each of 4 compartments', () => {
    const view = createMockView()
    applySettingsToView(view as any, defaultEditorSettings)
    expect(mockReconfigure).toHaveBeenCalledTimes(4)
  })

  it('applies custom fontSize and fontFamily', () => {
    const view = createMockView()
    const settings: EditorSettings = { ...defaultEditorSettings, fontSize: 20, fontFamily: 'Fira Code' }
    applySettingsToView(view as any, settings)
    expect(mockReconfigure).toHaveBeenCalled()
  })

  it('applies wordWrap=false', () => {
    const view = createMockView()
    const settings: EditorSettings = { ...defaultEditorSettings, wordWrap: false }
    applySettingsToView(view as any, settings)
    expect(mockReconfigure).toHaveBeenCalled()
  })

  it('applies lineNumbers=off', () => {
    const view = createMockView()
    const settings: EditorSettings = { ...defaultEditorSettings, lineNumbers: 'off' }
    applySettingsToView(view as any, settings)
    expect(mockReconfigure).toHaveBeenCalled()
  })

  it('applies lineNumbers=relative', () => {
    const view = createMockView()
    const settings: EditorSettings = { ...defaultEditorSettings, lineNumbers: 'relative' }
    applySettingsToView(view as any, settings)
    expect(mockReconfigure).toHaveBeenCalled()
  })

  it('handles partial compartment availability', () => {
    let callCount = 0
    mockGet.mockImplementation(() => {
      callCount++
      return callCount === 1 ? 'mocked' : undefined
    })
    const view = createMockView()
    const result = applySettingsToView(view as any, defaultEditorSettings)
    expect(result).toBe(true)
    expect(view.dispatch).toHaveBeenCalledTimes(1)
    const call = view.dispatch.mock.calls[0][0]
    expect(call.effects).toHaveLength(1)
  })

  it('handles all compartments returning undefined gracefully', () => {
    mockGet.mockReturnValue(undefined)
    const view = createMockView()
    const result = applySettingsToView(view as any, defaultEditorSettings)
    expect(result).toBe(false)
    expect(mockReconfigure).not.toHaveBeenCalled()
    expect(view.dispatch).not.toHaveBeenCalled()
  })
})

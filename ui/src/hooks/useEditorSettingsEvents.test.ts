import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useEditorSettingsEvents } from './useEditorSettingsEvents'

function createSettings(overrides: Record<string, unknown> = {}) {
  return {
    minimap: true,
    wordWrap: true,
    lineNumbers: 'on' as const,
    bracketPairColorization: true,
    stickyScroll: true,
    indentGuides: true,
    renderWhitespace: 'selection' as const,
    smoothScrolling: true,
    linkedEditing: true,
    fontSize: 14,
    inlayHints: true,
    breadcrumbs: true,
    ...overrides,
  }
}

describe('useEditorSettingsEvents', () => {
  it('toggles minimap', () => {
    const updateSetting = vi.fn()
    renderHook(() => useEditorSettingsEvents({
      settings: createSettings(),
      updateSetting,
    }))
    window.dispatchEvent(new CustomEvent('toggle-editor-setting', { detail: { setting: 'minimap' } }))
    expect(updateSetting).toHaveBeenCalledWith('minimap', false)
  })

  it('toggles wordWrap', () => {
    const updateSetting = vi.fn()
    renderHook(() => useEditorSettingsEvents({
      settings: createSettings({ wordWrap: false }),
      updateSetting,
    }))
    window.dispatchEvent(new CustomEvent('toggle-editor-setting', { detail: { setting: 'wordWrap' } }))
    expect(updateSetting).toHaveBeenCalledWith('wordWrap', true)
  })

  it('cycles lineNumbers on → off', () => {
    const updateSetting = vi.fn()
    renderHook(() => useEditorSettingsEvents({
      settings: createSettings({ lineNumbers: 'on' }),
      updateSetting,
    }))
    window.dispatchEvent(new CustomEvent('toggle-editor-setting', { detail: { setting: 'lineNumbers' } }))
    expect(updateSetting).toHaveBeenCalledWith('lineNumbers', 'off')
  })

  it('cycles lineNumbers off → relative', () => {
    const updateSetting = vi.fn()
    renderHook(() => useEditorSettingsEvents({
      settings: createSettings({ lineNumbers: 'off' }),
      updateSetting,
    }))
    window.dispatchEvent(new CustomEvent('toggle-editor-setting', { detail: { setting: 'lineNumbers' } }))
    expect(updateSetting).toHaveBeenCalledWith('lineNumbers', 'relative')
  })

  it('cycles lineNumbers relative → on', () => {
    const updateSetting = vi.fn()
    renderHook(() => useEditorSettingsEvents({
      settings: createSettings({ lineNumbers: 'relative' }),
      updateSetting,
    }))
    window.dispatchEvent(new CustomEvent('toggle-editor-setting', { detail: { setting: 'lineNumbers' } }))
    expect(updateSetting).toHaveBeenCalledWith('lineNumbers', 'on')
  })

  it('toggles bracketPairColorization', () => {
    const updateSetting = vi.fn()
    renderHook(() => useEditorSettingsEvents({
      settings: createSettings(),
      updateSetting,
    }))
    window.dispatchEvent(new CustomEvent('toggle-editor-setting', { detail: { setting: 'bracketPairColorization' } }))
    expect(updateSetting).toHaveBeenCalledWith('bracketPairColorization', false)
  })

  it('toggles stickyScroll', () => {
    const updateSetting = vi.fn()
    renderHook(() => useEditorSettingsEvents({
      settings: createSettings(),
      updateSetting,
    }))
    window.dispatchEvent(new CustomEvent('toggle-editor-setting', { detail: { setting: 'stickyScroll' } }))
    expect(updateSetting).toHaveBeenCalledWith('stickyScroll', false)
  })

  it('toggles indentGuides', () => {
    const updateSetting = vi.fn()
    renderHook(() => useEditorSettingsEvents({
      settings: createSettings(),
      updateSetting,
    }))
    window.dispatchEvent(new CustomEvent('toggle-editor-setting', { detail: { setting: 'indentGuides' } }))
    expect(updateSetting).toHaveBeenCalledWith('indentGuides', false)
  })

  it('cycles renderWhitespace selection → trailing', () => {
    const updateSetting = vi.fn()
    renderHook(() => useEditorSettingsEvents({
      settings: createSettings({ renderWhitespace: 'selection' }),
      updateSetting,
    }))
    window.dispatchEvent(new CustomEvent('toggle-editor-setting', { detail: { setting: 'renderWhitespace' } }))
    expect(updateSetting).toHaveBeenCalledWith('renderWhitespace', 'trailing')
  })

  it('cycles renderWhitespace all → none (wraps)', () => {
    const updateSetting = vi.fn()
    renderHook(() => useEditorSettingsEvents({
      settings: createSettings({ renderWhitespace: 'all' }),
      updateSetting,
    }))
    window.dispatchEvent(new CustomEvent('toggle-editor-setting', { detail: { setting: 'renderWhitespace' } }))
    expect(updateSetting).toHaveBeenCalledWith('renderWhitespace', 'none')
  })

  it('toggles smoothScrolling', () => {
    const updateSetting = vi.fn()
    renderHook(() => useEditorSettingsEvents({
      settings: createSettings(),
      updateSetting,
    }))
    window.dispatchEvent(new CustomEvent('toggle-editor-setting', { detail: { setting: 'smoothScrolling' } }))
    expect(updateSetting).toHaveBeenCalledWith('smoothScrolling', false)
  })

  it('toggles linkedEditing', () => {
    const updateSetting = vi.fn()
    renderHook(() => useEditorSettingsEvents({
      settings: createSettings(),
      updateSetting,
    }))
    window.dispatchEvent(new CustomEvent('toggle-editor-setting', { detail: { setting: 'linkedEditing' } }))
    expect(updateSetting).toHaveBeenCalledWith('linkedEditing', false)
  })

  it('toggles inlayHints', () => {
    const updateSetting = vi.fn()
    renderHook(() => useEditorSettingsEvents({
      settings: createSettings(),
      updateSetting,
    }))
    window.dispatchEvent(new CustomEvent('toggle-editor-setting', { detail: { setting: 'inlayHints' } }))
    expect(updateSetting).toHaveBeenCalledWith('inlayHints', false)
  })

  it('toggles breadcrumbs', () => {
    const updateSetting = vi.fn()
    renderHook(() => useEditorSettingsEvents({
      settings: createSettings(),
      updateSetting,
    }))
    window.dispatchEvent(new CustomEvent('toggle-editor-setting', { detail: { setting: 'breadcrumbs' } }))
    expect(updateSetting).toHaveBeenCalledWith('breadcrumbs', false)
  })

  describe('font size', () => {
    it('adjusts font size via custom event', () => {
      const updateSetting = vi.fn()
      renderHook(() => useEditorSettingsEvents({
        settings: createSettings({ fontSize: 14 }),
        updateSetting,
      }))
      window.dispatchEvent(new CustomEvent('adjust-font-size', { detail: { delta: 2 } }))
      expect(updateSetting).toHaveBeenCalledWith('fontSize', 16)
    })

    it('clamps font size to min 8', () => {
      const updateSetting = vi.fn()
      renderHook(() => useEditorSettingsEvents({
        settings: createSettings({ fontSize: 8 }),
        updateSetting,
      }))
      window.dispatchEvent(new CustomEvent('adjust-font-size', { detail: { delta: -2 } }))
      expect(updateSetting).toHaveBeenCalledWith('fontSize', 8)
    })

    it('clamps font size to max 32', () => {
      const updateSetting = vi.fn()
      renderHook(() => useEditorSettingsEvents({
        settings: createSettings({ fontSize: 32 }),
        updateSetting,
      }))
      window.dispatchEvent(new CustomEvent('adjust-font-size', { detail: { delta: 2 } }))
      expect(updateSetting).toHaveBeenCalledWith('fontSize', 32)
    })

    it('resets font size via adjust event', () => {
      const updateSetting = vi.fn()
      renderHook(() => useEditorSettingsEvents({
        settings: createSettings({ fontSize: 24 }),
        updateSetting,
      }))
      window.dispatchEvent(new CustomEvent('adjust-font-size', { detail: { reset: true } }))
      expect(updateSetting).toHaveBeenCalledWith('fontSize', 14)
    })

    it('resets font size via reset event', () => {
      const updateSetting = vi.fn()
      renderHook(() => useEditorSettingsEvents({
        settings: createSettings({ fontSize: 24 }),
        updateSetting,
      }))
      window.dispatchEvent(new CustomEvent('reset-font-size'))
      expect(updateSetting).toHaveBeenCalledWith('fontSize', 14)
    })
  })

  it('ignores unknown setting names', () => {
    const updateSetting = vi.fn()
    renderHook(() => useEditorSettingsEvents({
      settings: createSettings(),
      updateSetting,
    }))
    window.dispatchEvent(new CustomEvent('toggle-editor-setting', { detail: { setting: 'unknown' } }))
    expect(updateSetting).not.toHaveBeenCalled()
  })
})

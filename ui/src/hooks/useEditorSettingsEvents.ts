import { useEffect } from 'react'

interface Settings {
  minimap: boolean
  wordWrap: boolean
  lineNumbers: 'on' | 'off' | 'relative'
  bracketPairColorization: boolean
  stickyScroll: boolean
  indentGuides: boolean
  renderWhitespace: 'none' | 'boundary' | 'selection' | 'trailing' | 'all'
  smoothScrolling: boolean
  linkedEditing: boolean
  fontSize: number
  inlayHints: boolean
  breadcrumbs: boolean
}

interface UseEditorSettingsEventsOptions {
  settings: Settings
  updateSetting: (key: string, value: any) => void
}

/**
 * Listen for editor setting toggle events from CommandPalette and other UI.
 * Handles: minimap, wordWrap, lineNumbers, bracketPairColorization, stickyScroll,
 * indentGuides, renderWhitespace, smoothScrolling, linkedEditing, inlayHints, breadcrumbs.
 * Also handles font size adjustment via custom events and Ctrl+wheel zoom.
 */
export function useEditorSettingsEvents({ settings, updateSetting }: UseEditorSettingsEventsOptions) {
  useEffect(() => {
    const handleToggleSetting = (e: CustomEvent<{ setting: string }>) => {
      const { setting } = e.detail
      if (setting === 'minimap') {
        updateSetting('minimap', !settings.minimap)
      } else if (setting === 'wordWrap') {
        updateSetting('wordWrap', !settings.wordWrap)
      } else if (setting === 'lineNumbers') {
        // Cycle: on → off → relative → on
        const next = settings.lineNumbers === 'on' ? 'off' : settings.lineNumbers === 'off' ? 'relative' : 'on'
        updateSetting('lineNumbers', next)
      } else if (setting === 'bracketPairColorization') {
        updateSetting('bracketPairColorization', !settings.bracketPairColorization)
      } else if (setting === 'stickyScroll') {
        updateSetting('stickyScroll', !settings.stickyScroll)
      } else if (setting === 'indentGuides') {
        updateSetting('indentGuides', !settings.indentGuides)
      } else if (setting === 'renderWhitespace') {
        const modes = ['none', 'boundary', 'selection', 'trailing', 'all'] as const
        const idx = modes.indexOf(settings.renderWhitespace)
        updateSetting('renderWhitespace', modes[(idx + 1) % modes.length])
      } else if (setting === 'smoothScrolling') {
        updateSetting('smoothScrolling', !settings.smoothScrolling)
      } else if (setting === 'linkedEditing') {
        updateSetting('linkedEditing', !settings.linkedEditing)
      } else if (setting === 'inlayHints') {
        updateSetting('inlayHints', !settings.inlayHints)
      } else if (setting === 'breadcrumbs') {
        updateSetting('breadcrumbs', !settings.breadcrumbs)
      }
    }

    const handleAdjustFontSize = (e: CustomEvent<{ delta?: number; reset?: boolean }>) => {
      if (e.detail.reset) {
        updateSetting('fontSize', 14)
      } else {
        const newSize = Math.max(8, Math.min(32, settings.fontSize + (e.detail.delta || 0)))
        updateSetting('fontSize', newSize)
      }
    }

    // R5168: Reset font size (VS Code Ctrl+0 pattern)
    const handleResetFontSize = () => {
      updateSetting('fontSize', 14)
    }

    // Ctrl+mouse wheel zoom (VS Code/Cursor pattern)
    const handleWheelZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const delta = e.deltaY < 0 ? 1 : -1
        const newSize = Math.max(8, Math.min(32, settings.fontSize + delta))
        updateSetting('fontSize', newSize)
      }
    }

    window.addEventListener('toggle-editor-setting', handleToggleSetting as EventListener)
    window.addEventListener('adjust-font-size', handleAdjustFontSize as EventListener)
    window.addEventListener('reset-font-size', handleResetFontSize)
    window.addEventListener('wheel', handleWheelZoom, { passive: false })
    return () => {
      window.removeEventListener('toggle-editor-setting', handleToggleSetting as EventListener)
      window.removeEventListener('adjust-font-size', handleAdjustFontSize as EventListener)
      window.removeEventListener('reset-font-size', handleResetFontSize)
      window.removeEventListener('wheel', handleWheelZoom)
    }
  }, [settings.minimap, settings.wordWrap, settings.lineNumbers, settings.bracketPairColorization, settings.stickyScroll, settings.indentGuides, settings.renderWhitespace, settings.smoothScrolling, settings.linkedEditing, settings.fontSize, updateSetting])
}

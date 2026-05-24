/**
 * useEditorSettings — bridges localStorage settings to CodeMirror 6 EditorView
 * via Compartment-based dynamic reconfiguration.
 *
 * Reads settings from the shared useSettings store (localStorage-backed) and
 * applies them to CM6 EditorView instances whenever settings change.
 */
import { useRef, useEffect, useCallback } from 'react'
import { EditorView } from '@codemirror/view'
import { EditorState, StateEffect } from '@codemirror/state'
import {
  tabSizeCompartment,
  themeCompartment,
  wrapCompartment,
  gutterCompartment,
} from '../utils/codemirrorSetup'
import { type Settings, loadSettings, defaultSettings } from './useSettings'
import { logger } from '../utils'

// ---------------------------------------------------------------------------
// Editor-relevant subset of Settings
// ---------------------------------------------------------------------------
export interface EditorSettings {
  fontSize: number
  fontFamily: string
  tabSize: number
  wordWrap: boolean
  lineNumbers: 'on' | 'off' | 'relative'
  renderWhitespace: 'none' | 'boundary' | 'selection' | 'trailing' | 'all'
  bracketPairColorization: boolean
  autoSave: boolean
  autoSaveDelay: number
  cursorBlinking: 'blink' | 'smooth' | 'phase' | 'expand' | 'solid'
  smoothScrolling: boolean
  minimap: boolean
}

/** Default editor settings (subset of the global defaults). */
export const defaultEditorSettings: EditorSettings = {
  fontSize: defaultSettings.fontSize,
  fontFamily: defaultSettings.fontFamily,
  tabSize: defaultSettings.tabSize,
  wordWrap: defaultSettings.wordWrap,
  lineNumbers: defaultSettings.lineNumbers,
  renderWhitespace: defaultSettings.renderWhitespace,
  bracketPairColorization: defaultSettings.bracketPairColorization,
  autoSave: defaultSettings.autoSave,
  autoSaveDelay: defaultSettings.autoSaveDelay,
  cursorBlinking: defaultSettings.cursorBlinking,
  smoothScrolling: defaultSettings.smoothScrolling,
  minimap: defaultSettings.minimap,
}

/**
 * Extract the editor-relevant subset from the full Settings object.
 */
export function toEditorSettings(s: Settings): EditorSettings {
  return {
    fontSize: s.fontSize,
    fontFamily: s.fontFamily,
    tabSize: s.tabSize,
    wordWrap: s.wordWrap,
    lineNumbers: s.lineNumbers,
    renderWhitespace: s.renderWhitespace,
    bracketPairColorization: s.bracketPairColorization,
    autoSave: s.autoSave,
    autoSaveDelay: s.autoSaveDelay,
    cursorBlinking: s.cursorBlinking,
    smoothScrolling: s.smoothScrolling,
    minimap: s.minimap,
  }
}

// ---------------------------------------------------------------------------
// Compartment reconfiguration helpers
// ---------------------------------------------------------------------------

/**
 * Build the theme extension for the given font settings.
 */
function buildThemeExt(fontSize: number, fontFamily: string) {
  return EditorView.theme({
    '&': {
      fontSize: `${fontSize}px`,
    },
    '.cm-content': {
      fontFamily: `'${fontFamily}', 'Fira Code', Menlo, monospace`,
    },
  })
}

/**
 * Apply all editor settings to a given EditorView via Compartment reconfiguration.
 * Returns true if all reconfigurations succeeded.
 */
export function applySettingsToView(
  view: EditorView,
  settings: EditorSettings,
): boolean {
  const effects: StateEffect<unknown>[] = []

  // 1. Font size / family -> themeCompartment
  try {
    if (themeCompartment.get(view.state) !== undefined) {
      effects.push(themeCompartment.reconfigure(
        buildThemeExt(settings.fontSize, settings.fontFamily),
      ))
    }
  } catch (e) {
    logger.debug('useEditorSettings', 'themeCompartment reconfigure failed', e)
  }

  // 2. Tab size -> tabSizeCompartment
  try {
    if (tabSizeCompartment.get(view.state) !== undefined) {
      effects.push(tabSizeCompartment.reconfigure(
        EditorState.tabSize.of(settings.tabSize),
      ))
    }
  } catch (e) {
    logger.debug('useEditorSettings', 'tabSizeCompartment reconfigure failed', e)
  }

  // 3. Word wrap -> wrapCompartment
  try {
    if (wrapCompartment.get(view.state) !== undefined) {
      effects.push(wrapCompartment.reconfigure(
        settings.wordWrap ? [EditorView.lineWrapping] : [],
      ))
    }
  } catch (e) {
    logger.debug('useEditorSettings', 'wrapCompartment reconfigure failed', e)
  }

  // 4. Line numbers -> gutterCompartment
  try {
    if (gutterCompartment.get(view.state) !== undefined) {
      const mode = settings.lineNumbers
      effects.push(gutterCompartment.reconfigure(
        mode === 'off'
          ? [EditorView.theme({ '.cm-gutters': { display: 'none' } })]
          : mode === 'relative'
            ? [EditorView.theme({ '.cm-gutter-lint': { display: 'none' } })]
            : [],
      ))
    }
  } catch (e) {
    logger.debug('useEditorSettings', 'gutterCompartment reconfigure failed', e)
  }

  // Dispatch all effects in a single transaction
  if (effects.length > 0) {
    view.dispatch({ effects })
  }

  return effects.length > 0
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useEditorSettings — reads settings from localStorage and provides methods
 * to apply them to CM6 EditorView instances via Compartment-based reconfiguration.
 *
 * Usage:
 *   const { settings, applyToView } = useEditorSettings()
 *   // After editor mount:
 *   applyToView(editorView)
 *   // Settings auto-react to localStorage changes
 */
export function useEditorSettings() {
  // Read current settings from the shared store on every render
  const settingsRef = useRef<EditorSettings>(defaultEditorSettings)
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoSaveCallbackRef = useRef<(() => void) | null>(null)

  // Load settings from localStorage
  const loadEditorSettings = useCallback((): EditorSettings => {
    try {
      const full = loadSettings()
      return toEditorSettings(full)
    } catch {
      return defaultEditorSettings
    }
  }, [])

  // Keep a ref always up to date
  settingsRef.current = loadEditorSettings()

  /**
   * Apply current settings to a specific EditorView.
   * Call this after editor mount and whenever settings change.
   */
  const applyToView = useCallback((view: EditorView | null) => {
    if (!view) return false
    return applySettingsToView(view, settingsRef.current)
  }, [])

  /**
   * Apply current settings to multiple views.
   */
  const applyToViews = useCallback((views: (EditorView | null)[]) => {
    const s = settingsRef.current
    for (const view of views) {
      if (view) {
        applySettingsToView(view, s)
      }
    }
  }, [])

  /**
   * Get the current editor settings snapshot.
   */
  const getSettings = useCallback((): EditorSettings => {
    return settingsRef.current
  }, [])

  /**
   * Register a save callback for auto-save.
   * When auto-save is enabled, this callback will be called periodically.
   */
  const registerAutoSave = useCallback((callback: (() => void) | null) => {
    autoSaveCallbackRef.current = callback
  }, [])

  // Auto-save timer management
  useEffect(() => {
    const s = settingsRef.current

    // Clear existing timer
    if (autoSaveTimerRef.current) {
      clearInterval(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }

    // Set up new timer if auto-save is enabled
    if (s.autoSave && autoSaveCallbackRef.current) {
      autoSaveTimerRef.current = setInterval(() => {
        autoSaveCallbackRef.current?.()
      }, s.autoSaveDelay)
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current)
        autoSaveTimerRef.current = null
      }
    }
  }, [
    settingsRef.current.autoSave,
    settingsRef.current.autoSaveDelay,
  ])

  // Listen for settings changes via storage events (cross-tab) and custom events
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'swarm-editor-settings') {
        // Reload settings into ref
        settingsRef.current = loadEditorSettings()
      }
    }

    // Listen for our custom event when settings change in the same tab
    const handleSettingsUpdate = () => {
      settingsRef.current = loadEditorSettings()
    }

    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('swarm-editor-settings-changed', handleSettingsUpdate)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('swarm-editor-settings-changed', handleSettingsUpdate)
    }
  }, [loadEditorSettings])

  return {
    settings: settingsRef.current,
    applyToView,
    applyToViews,
    getSettings,
    registerAutoSave,
  }
}

export default useEditorSettings

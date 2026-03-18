import { useState, useEffect, useCallback } from 'react'
import { logger } from '../utils'

export interface Settings {
  theme: 'dark' | 'light' | 'system'
  fontSize: number
  fontFamily: string
  tabSize: number
  autoSave: boolean
  autoSaveDelay: number
  minimap: boolean
  lineNumbers: boolean
  wordWrap: boolean
  notifications: boolean
  sounds: boolean
  apiKey: string
  apiEndpoint: string
}

const STORAGE_KEY = 'swarm-editor-settings'

export const defaultSettings: Settings = {
  theme: 'dark',
  fontSize: 14,
  fontFamily: 'JetBrains Mono',
  tabSize: 2,
  autoSave: true,
  autoSaveDelay: 1000,
  minimap: true,
  lineNumbers: true,
  wordWrap: true,
  notifications: true,
  sounds: false,
  apiKey: '',
  apiEndpoint: 'https://api.anthropic.com',
}

export function loadSettings(): Settings {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        return { ...defaultSettings, ...parsed }
      }
    } catch {
      logger.warn('Settings', 'Failed to load settings from localStorage')
    }
  }
  return defaultSettings
}

export function saveSettings(settings: Settings): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      logger.warn('Settings', 'Failed to save settings to localStorage')
    }
  }
}

export function useSettings() {
  const [settings, setSettingsState] = useState<Settings>(loadSettings)

  // Save to localStorage whenever settings change
  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  const updateSetting = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettingsState(prev => ({ ...prev, [key]: value }))
  }, [])

  const setSettings = useCallback((newSettings: Partial<Settings>) => {
    setSettingsState(prev => ({ ...prev, ...newSettings }))
  }, [])

  const resetSettings = useCallback(() => {
    setSettingsState(defaultSettings)
  }, [])

  return {
    settings,
    updateSetting,
    setSettings,
    resetSettings,
  }
}

export default useSettings

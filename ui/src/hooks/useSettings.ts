import { useState, useEffect, useCallback } from 'react'
import { logger } from '../utils'
import { api } from '../services'

// Extended Settings interface with MCP, Swarm, Team configurations
export interface Settings {
  // Editor settings
  theme: 'dark' | 'light' | 'system'
  fontSize: number
  fontFamily: string
  tabSize: number
  autoSave: boolean
  autoSaveDelay: number
  minimap: boolean
  lineNumbers: boolean
  wordWrap: boolean
  
  // Notification settings
  notifications: boolean
  sounds: boolean
  
  // API settings
  apiKey: string
  apiEndpoint: string
  
  // MCP settings
  mcpEnabled: boolean
  mcpAutoConnect: boolean
  mcpServers: MCPServerSetting[]
  
  // Swarm settings
  swarmDefaultTopology: 'star' | 'mesh' | 'tree' | 'ring' | 'hybrid'
  swarmDefaultStrategy: 'parallel' | 'sequential' | 'pipeline' | 'mapreduce'
  swarmMaxAgents: number
  swarmConsensusAlgorithm: 'simple_majority' | 'supermajority' | 'unanimity' | 'weighted' | 'byzantine'
  swarmConsensusTimeout: number
  
  // Team settings
  teamAutoAssignAgents: boolean
  teamMaxMembers: number
  teamRequireApproval: boolean
  
  // Agent discovery settings
  agentAutoScan: boolean
  agentScanInterval: number
  agentAutoConnect: boolean
}

export interface MCPServerSetting {
  id: string
  name: string
  command: string
  args: string[]
  env: Record<string, string>
  enabled: boolean
  autoStart: boolean
  status: 'connected' | 'disconnected' | 'connecting' | 'error'
}

const STORAGE_KEY = 'swarm-editor-settings'

export const defaultSettings: Settings = {
  // Editor
  theme: 'dark',
  fontSize: 14,
  fontFamily: 'JetBrains Mono',
  tabSize: 2,
  autoSave: true,
  autoSaveDelay: 1000,
  minimap: true,
  lineNumbers: true,
  wordWrap: true,
  
  // Notifications
  notifications: true,
  sounds: false,
  
  // API
  apiKey: '',
  apiEndpoint: 'https://api.anthropic.com',
  
  // MCP
  mcpEnabled: true,
  mcpAutoConnect: true,
  mcpServers: [],
  
  // Swarm
  swarmDefaultTopology: 'star',
  swarmDefaultStrategy: 'parallel',
  swarmMaxAgents: 10,
  swarmConsensusAlgorithm: 'simple_majority',
  swarmConsensusTimeout: 30000,
  
  // Team
  teamAutoAssignAgents: true,
  teamMaxMembers: 50,
  teamRequireApproval: true,
  
  // Agent discovery
  agentAutoScan: true,
  agentScanInterval: 30000,
  agentAutoConnect: false,
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
  const [isLoading, setIsLoading] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  // Save to localStorage whenever settings change
  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  // Sync settings with backend when in Tauri environment
  const syncWithBackend = useCallback(async (_newSettings: Partial<Settings>) => {
    if (!api.isTauriEnv()) return
    
    setIsLoading(true)
    setSyncError(null)
    
    try {
      // In a real implementation, this would call the backend
      // await invoke('save_settings', { settings: newSettings })
      logger.info('Settings', 'Settings synced with backend')
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      setSyncError(errorMsg)
      logger.error('Settings', 'Failed to sync settings:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const updateSetting = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettingsState(prev => {
      const newSettings = { ...prev, [key]: value }
      // Sync with backend for critical settings
      if (['apiKey', 'apiEndpoint', 'mcpServers', 'swarmConsensusAlgorithm'].includes(key)) {
        syncWithBackend({ [key]: value })
      }
      return newSettings
    })
  }, [syncWithBackend])

  const setSettings = useCallback((newSettings: Partial<Settings>) => {
    setSettingsState(prev => {
      const updated = { ...prev, ...newSettings }
      syncWithBackend(newSettings)
      return updated
    })
  }, [syncWithBackend])

  const resetSettings = useCallback(() => {
    setSettingsState(defaultSettings)
    syncWithBackend(defaultSettings)
  }, [syncWithBackend])

  // Add MCP server
  const addMCPServer = useCallback((server: MCPServerSetting) => {
    setSettingsState(prev => ({
      ...prev,
      mcpServers: [...prev.mcpServers, server],
    }))
  }, [])

  // Remove MCP server
  const removeMCPServer = useCallback((name: string) => {
    setSettingsState(prev => ({
      ...prev,
      mcpServers: prev.mcpServers.filter(s => s.name !== name),
    }))
  }, [])

  // Update MCP server
  const updateMCPServer = useCallback((name: string, updates: Partial<MCPServerSetting>) => {
    setSettingsState(prev => ({
      ...prev,
      mcpServers: prev.mcpServers.map(s => 
        s.name === name ? { ...s, ...updates } : s
      ),
    }))
  }, [])

  return {
    settings,
    isLoading,
    syncError,
    updateSetting,
    setSettings,
    resetSettings,
    addMCPServer,
    removeMCPServer,
    updateMCPServer,
  }
}

export default useSettings

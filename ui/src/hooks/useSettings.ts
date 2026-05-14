import { useState, useEffect, useCallback } from 'react'
import { logger } from '../utils'

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
  lineNumbers: 'on' | 'off' | 'relative'
  wordWrap: boolean
  bracketPairColorization: boolean
  stickyScroll: boolean
  indentGuides: boolean
  renderWhitespace: 'none' | 'boundary' | 'selection' | 'trailing' | 'all'
  cursorBlinking: 'blink' | 'smooth' | 'phase' | 'expand' | 'solid'
  cursorStyle: 'line' | 'block' | 'underline' | 'line-thin' | 'block-outline' | 'underline-thin'
  // R5121: Additional VS Code parity settings
  smoothScrolling: boolean
  cursorSmoothCaretAnimation: boolean
  linkedEditing: boolean
  scrollBeyondLastLine: boolean
  formatOnPaste: boolean
  mouseWheelZoom: boolean
  semanticHighlighting: boolean
  // R5169: Inlay Hints & Breadcrumbs settings (VS Code parity)
  inlayHints: boolean
  breadcrumbs: boolean
  // R5122: Autocomplete settings (VS Code parity)
  quickSuggestions: boolean
  acceptSuggestionOnEnter: 'on' | 'off' | 'smart'
  tabCompletion: 'on' | 'off' | 'onlySnippets'
  wordBasedSuggestions: 'currentDocument' | 'matchingDocuments' | 'allDocuments'
  suggestOnTriggerCharacters: boolean

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
  
  // Network settings
  websocketPort: number
  networkProxyEnabled: boolean
  networkProxyUrl: string
  networkProxyAuth: boolean
  networkProxyUsername: string
  networkProxyPassword: string
  networkConnectTimeout: number
  networkRequestTimeout: number
  networkRetryAttempts: number
  networkRetryDelay: number
  networkSslVerify: boolean
  networkSslCertPath: string
  
  // Security settings
  securityEnableAuditLog: boolean
  securityAuditLogPath: string
  securityAuditRetention: number
  securityEncryptLocalData: boolean
  securityEncryptionKeyPath: string
  securitySessionTimeout: number
  securityMaxLoginAttempts: number
  securityRequireStrongPasswords: boolean
  securityTwoFactorEnabled: boolean
  securityAllowedIpRanges: string[]
  securityBlockUnknownAgents: boolean
  securityAgentSandboxing: boolean
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
  lineNumbers: 'on',
  wordWrap: true,
  bracketPairColorization: true,
  stickyScroll: true,
  indentGuides: true,
  renderWhitespace: 'selection',
  cursorBlinking: 'blink',
  cursorStyle: 'line',
  // R5121: VS Code parity settings defaults
  smoothScrolling: true,
  cursorSmoothCaretAnimation: false,
  linkedEditing: true,
  scrollBeyondLastLine: true,
  formatOnPaste: true,
  mouseWheelZoom: false,
  semanticHighlighting: true,
  // R5169: Inlay Hints & Breadcrumbs defaults
  inlayHints: true,
  breadcrumbs: true,
  // R5122: Autocomplete settings defaults
  quickSuggestions: true,
  acceptSuggestionOnEnter: 'smart',
  tabCompletion: 'on',
  wordBasedSuggestions: 'matchingDocuments',
  suggestOnTriggerCharacters: true,

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
  swarmConsensusTimeout: 30,
  
  // Team
  teamAutoAssignAgents: true,
  teamMaxMembers: 50,
  teamRequireApproval: true,
  
  // Agent discovery
  agentAutoScan: true,
  agentScanInterval: 30000,
  agentAutoConnect: false,
  
  // Network
  websocketPort: 8080,
  networkProxyEnabled: false,
  networkProxyUrl: '',
  networkProxyAuth: false,
  networkProxyUsername: '',
  networkProxyPassword: '',
  networkConnectTimeout: 30,
  networkRequestTimeout: 60,
  networkRetryAttempts: 3,
  networkRetryDelay: 1000,
  networkSslVerify: true,
  networkSslCertPath: '',
  
  // Security
  securityEnableAuditLog: true,
  securityAuditLogPath: '',
  securityAuditRetention: 30,
  securityEncryptLocalData: false,
  securityEncryptionKeyPath: '',
  securitySessionTimeout: 3600,
  securityMaxLoginAttempts: 5,
  securityRequireStrongPasswords: true,
  securityTwoFactorEnabled: false,
  securityAllowedIpRanges: ['127.0.0.1', '::1'],
  securityBlockUnknownAgents: false,
  securityAgentSandboxing: true,
}

export function loadSettings(): Settings {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        // Migrate lineNumbers from boolean to union type (R5140 change)
        if (typeof parsed.lineNumbers === 'boolean') {
          parsed.lineNumbers = parsed.lineNumbers ? 'on' : 'off'
        }
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

  // Add allowed IP range
  const addAllowedIpRange = useCallback((ipRange: string) => {
    setSettingsState(prev => ({
      ...prev,
      securityAllowedIpRanges: [...prev.securityAllowedIpRanges, ipRange],
    }))
  }, [])

  // Remove allowed IP range
  const removeAllowedIpRange = useCallback((ipRange: string) => {
    setSettingsState(prev => ({
      ...prev,
      securityAllowedIpRanges: prev.securityAllowedIpRanges.filter(ip => ip !== ipRange),
    }))
  }, [])

  return {
    settings,
    updateSetting,
    setSettings,
    resetSettings,
    addMCPServer,
    removeMCPServer,
    updateMCPServer,
    addAllowedIpRange,
    removeAllowedIpRange,
  }
}

export default useSettings

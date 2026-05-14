import { create } from 'zustand'
import type { Agent, Swarm, Team, Session } from '../types'
import { api, type AgentInfo, type PermissionRequestEvent } from '../services'
import { logger, generateId } from '../utils'
import type { Toast, ToastType } from '../components/Toast'

// Storage keys for persistence
const STORAGE_KEY = 'swarm-editor-state'

interface PersistedState {
  swarms: Swarm[]
  teams: Team[]
}

// Permission request stored for UI handling
export interface PermissionRequest {
  id: string
  requestId: string
  sessionId: string
  toolCallId: string
  toolName: string
  description: string
  options: PermissionRequestEvent['options']
  timestamp: number
}

export interface AppState {
  // Connection state
  connected: boolean
  connecting: boolean
  connectionError: string | null

  // Agents
  agents: Agent[]
  agentLoadError: string | null
  selectedAgent: Agent | null

  // Swarm
  swarms: Swarm[]
  activeSwarm: Swarm | null

  // Teams
  teams: Team[]
  activeTeam: Team | null

  // Sessions
  sessions: Session[]
  activeSession: Session | null

  // Permissions
  permissionQueue: PermissionRequest[]
  activePermission: PermissionRequest | null

  // Toast notifications
  toasts: Toast[]
  notificationHistory: Array<{ id: string; type: ToastType; title: string; message?: string; timestamp: number }>

  // UI state
  sidebarCollapsed: boolean
  activePanel: 'editor' | 'swarm' | 'team' | 'settings'
  loading: boolean
  zenMode: boolean

  // Editor state (for StatusBar)
  editorCursorPosition: { line: number; column: number } | null
  editorSelection: { lineCount: number; charCount: number } | null
  editorLanguage: string
  editorEncoding: string
  editorIndent: { type: 'spaces' | 'tabs'; size: number }
  editorLineEnding: 'lf' | 'crlf'
  setEditorLineEnding: (lineEnding: 'lf' | 'crlf') => void

  // Workspace problems (for Problems Panel)
  workspaceProblems: Array<{
    id: string
    file: string
    line: number
    column: number
    message: string
    severity: 'error' | 'warning' | 'info' | 'hint'
    source?: string
  }>

  // Actions
  initialize: (options?: { simulateError?: boolean | string }) => Promise<void>
  loadAgents: () => Promise<void>
  startAgent: (id: string) => Promise<void>
  stopAgent: (id: string) => Promise<void>
  setConnected: (connected: boolean) => void
  setConnectionError: (error: string | null) => void
  setAgents: (agents: Agent[]) => void
  addAgent: (agent: Agent) => void
  removeAgent: (agentId: string) => void
  updateAgent: (agentId: string, updates: Partial<Agent>) => void
  selectAgent: (agent: Agent | null) => void
  setSwarms: (swarms: Swarm[]) => void
  addSwarm: (swarm: Swarm) => void
  removeSwarm: (swarmId: string) => void
  setActiveSwarm: (swarm: Swarm | null) => void
  setTeams: (teams: Team[]) => void
  addTeam: (team: Team) => void
  removeTeam: (teamId: string) => void
  setActiveTeam: (team: Team | null) => void
  setSessions: (sessions: Session[]) => void
  setActiveSession: (session: Session | null) => void
  toggleSidebar: () => void
  setActivePanel: (panel: 'editor' | 'swarm' | 'team' | 'settings') => void
  setLoading: (loading: boolean) => void
  toggleZenMode: () => void

  // Permission actions
  addPermissionRequest: (request: PermissionRequestEvent) => void
  resolvePermission: (requestId: string, optionId: string) => void
  dismissPermission: (requestId: string) => void
  clearPermissionQueue: () => void

  // Toast actions
  addToast: (type: ToastType, title: string, message?: string, options?: Partial<Toast>) => string
  removeToast: (id: string) => void
  clearToasts: () => void
  clearNotificationHistory: () => void

  // Editor state actions
  setEditorCursorPosition: (position: { line: number; column: number } | null) => void
  setEditorSelection: (selection: { lineCount: number; charCount: number } | null) => void
  setEditorLanguage: (language: string) => void
  setEditorEncoding: (encoding: string) => void
  setEditorIndent: (indent: { type: 'spaces' | 'tabs'; size: number }) => void

  // Workspace problems actions
  setWorkspaceProblems: (problems: AppState['workspaceProblems']) => void
  updateFileProblems: (filePath: string, problems: AppState['workspaceProblems']) => void
  clearWorkspaceProblems: () => void

  reset: () => void
  clearPersistedData: () => void
}

// Helper to convert AgentInfo to Agent
export function agentInfoToAgent(info: AgentInfo): Agent {
  // Map status string to AgentState
  const stateMap: Record<string, Agent['state']> = {
    'running': 'executing',
    'stopped': 'idle',
    'idle': 'idle',
    'thinking': 'thinking',
    'executing': 'executing',
    'waiting': 'waiting',
    'error': 'error',
    'unknown': 'idle',
  }

  // Map type string to AgentType
  const typeMap: Record<string, Agent['type']> = {
    'coder': 'coder',
    'reviewer': 'reviewer',
    'architect': 'architect',
    'tester': 'tester',
    'navigator': 'navigator',
    'driver': 'driver',
    'orchestrator': 'orchestrator',
  }

  return {
    id: info.id,
    name: info.name,
    type: typeMap[info.type] || 'coder',
    state: stateMap[info.state || info.status || 'unknown'] || 'idle',
    capabilities: {
      loadSession: info.capabilities?.includes('load_session') ?? false,
      promptCapabilities: {
        image: false,
        audio: false,
        embeddedContext: false,
      },
      mcp: {
        http: false,
        sse: false,
      },
      pairProgramming: info.capabilities?.includes('pair_programming') ?? false,
      teamCollaboration: info.capabilities?.includes('team_collaboration') ?? false,
    },
    createdAt: new Date().toISOString(),
    lastActive: info.lastActive || new Date().toISOString(),
  }
}

// Helper to load persisted data
const loadPersistedData = (): PersistedState | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return {
        swarms: parsed.swarms || [],
        teams: parsed.teams || [],
      }
    }
  } catch {
    logger.warn('Storage', 'Failed to load persisted data')
  }
  return null
}

// Helper to save persisted data
const savePersistedData = (data: PersistedState) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    logger.warn('Storage', 'Failed to save persisted data')
  }
}

export const useAppStore = create<AppState>()((set) => ({
  connected: false,
  connecting: false,
  connectionError: null,
  agents: [] as Agent[],
  agentLoadError: null,
  selectedAgent: null,
  swarms: [] as Swarm[],
  activeSwarm: null,
  teams: [] as Team[],
  activeTeam: null,
  sessions: [] as Session[],
  activeSession: null,
  permissionQueue: [] as PermissionRequest[],
  activePermission: null,
  toasts: [] as Toast[],
  notificationHistory: [],
  sidebarCollapsed: false,
  activePanel: 'editor',
  loading: false,
  zenMode: false,
  editorCursorPosition: null,
  editorSelection: null,
  editorLanguage: 'plaintext',
  editorEncoding: 'UTF-8',
  editorIndent: { type: 'spaces', size: 2 },
  editorLineEnding: 'lf' as 'lf' | 'crlf',
  workspaceProblems: [],

  initialize: async (options?: { simulateError?: boolean | string }) => {
    // Prevent concurrent initialization (e.g., React StrictMode double-mount)
    const currentState = useAppStore.getState()
    if (currentState.connecting || currentState.connected) return
    set({ connecting: true, connectionError: null })
    try {
      // For testing: simulate initialization error
      if (options?.simulateError) {
        // If simulateError is a string that's not 'true', throw it as a non-Error
        if (typeof options.simulateError === 'string' && options.simulateError !== 'true') {
          throw options.simulateError // Throw non-Error value for testing
        }
        throw new Error('Simulated initialization error')
      }

      // Load persisted data
      const persisted = loadPersistedData()

      // Load agents from backend
      try {
        const agentInfos = await api.agent.getAgents()
        const agents = agentInfos.map(agentInfoToAgent)
        set({
          connected: true,
          connecting: false,
          agents,
          agentLoadError: null,
          swarms: persisted?.swarms || [],
          teams: persisted?.teams || [],
        })
      } catch (agentError) {
        logger.warn('Agents', 'Failed to load agents:', agentError)
        const agentErrorMsg = agentError instanceof Error ? agentError.message : 'Failed to load agents'
        set({
          connected: true,
          connecting: false,
          agents: [],
          agentLoadError: agentErrorMsg,
          swarms: persisted?.swarms || [],
          teams: persisted?.teams || [],
        })
      }
    } catch (error) {
      logger.error('Init', 'Failed to initialize:', error)
      // Robust error message extraction
      const errorMessage = error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Failed to connect'
      set({
        connected: false,
        connecting: false,
        connectionError: errorMessage
      })
    }
  },

  loadAgents: async () => {
    try {
      const agentInfos = await api.agent.refreshAgents()
      const agents = agentInfos.map(agentInfoToAgent)
      set({ agents, agentLoadError: null })
    } catch (error) {
      logger.error('Agents', 'Failed to load agents:', error)
      const msg = error instanceof Error ? error.message : 'Failed to load agents'
      set({ agentLoadError: msg })
    }
  },

  startAgent: async (id: string) => {
    try {
      const info = await api.agent.startAgent(id)
      const agent = agentInfoToAgent(info)
      set((state) => ({
        agents: state.agents.map((a) => (a.id === id ? agent : a)),
        selectedAgent: state.selectedAgent?.id === id ? agent : state.selectedAgent,
      }))
    } catch (error) {
      logger.error('Agents', 'Failed to start agent:', error)
      throw error
    }
  },

  stopAgent: async (id: string) => {
    try {
      const info = await api.agent.stopAgent(id)
      const agent = agentInfoToAgent(info)
      set((state) => ({
        agents: state.agents.map((a) => (a.id === id ? agent : a)),
        selectedAgent: state.selectedAgent?.id === id ? agent : state.selectedAgent,
      }))
    } catch (error) {
      logger.error('Agents', 'Failed to stop agent:', error)
      throw error
    }
  },

  setConnected: (connected) => set(connected ? { connected, connectionError: null } : { connected }),

  setConnectionError: (connectionError) => set({ connectionError }),

  setAgents: (agents) => set({ agents }),

  addAgent: (agent) => set((state) => ({ agents: [...state.agents, agent] })),

  removeAgent: (agentId) => set((state) => ({
    agents: state.agents.filter((a) => a.id !== agentId),
    selectedAgent: state.selectedAgent?.id === agentId ? null : state.selectedAgent
  })),

  updateAgent: (agentId, updates) => set((state) => ({
    agents: state.agents.map((a) => (a.id === agentId ? { ...a, ...updates } : a)),
    selectedAgent: state.selectedAgent?.id === agentId
      ? { ...state.selectedAgent, ...updates }
      : state.selectedAgent
  })),

  selectAgent: (agent) => set({ selectedAgent: agent }),

  setSwarms: (swarms) => {
    set((state) => {
      savePersistedData({ swarms, teams: state.teams })
      return { swarms }
    })
  },

  addSwarm: (swarm) => set((state) => {
    const newSwarms = [...state.swarms, swarm]
    savePersistedData({ swarms: newSwarms, teams: state.teams })
    return { swarms: newSwarms }
  }),

  removeSwarm: (swarmId) => set((state) => {
    const newSwarms = state.swarms.filter((s) => s.id !== swarmId)
    savePersistedData({ swarms: newSwarms, teams: state.teams })
    return {
      swarms: newSwarms,
      activeSwarm: state.activeSwarm?.id === swarmId ? null : state.activeSwarm
    }
  }),

  setActiveSwarm: (swarm) => set({ activeSwarm: swarm }),

  setTeams: (teams) => {
    set((state) => {
      savePersistedData({ swarms: state.swarms, teams })
      return { teams }
    })
  },

  addTeam: (team) => set((state) => {
    const newTeams = [...state.teams, team]
    savePersistedData({ swarms: state.swarms, teams: newTeams })
    return { teams: newTeams }
  }),

  removeTeam: (teamId) => set((state) => {
    const newTeams = state.teams.filter((t) => t.id !== teamId)
    savePersistedData({ swarms: state.swarms, teams: newTeams })
    return {
      teams: newTeams,
      activeTeam: state.activeTeam?.id === teamId ? null : state.activeTeam
    }
  }),

  setActiveTeam: (team) => set({ activeTeam: team }),

  setSessions: (sessions) => set({ sessions }),

  setActiveSession: (session) => set({ activeSession: session }),

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  toggleZenMode: () => set((state) => ({ zenMode: !state.zenMode })),

  setActivePanel: (panel) => set({ activePanel: panel }),

  setLoading: (loading) => set({ loading }),

  addPermissionRequest: (event) => set((state) => {
    const request: PermissionRequest = {
      id: event.id,
      requestId: event.id,
      sessionId: event.sessionId,
      toolCallId: event.metadata?.toolCallId as string || '',
      toolName: event.type,
      description: event.description,
      options: event.options,
      timestamp: Date.now(),
    }

    // If no active permission, set this as active
    if (!state.activePermission) {
      return {
        permissionQueue: [...state.permissionQueue, request],
        activePermission: request,
      }
    }

    // Otherwise, just add to queue
    return {
      permissionQueue: [...state.permissionQueue, request],
    }
  }),

  resolvePermission: (requestId, _optionId) => set((state) => {
    // Remove the resolved request
    const remainingQueue = state.permissionQueue.filter((p) => p.requestId !== requestId)

    // Get the next permission from queue if any
    const nextPermission = remainingQueue.length > 0 ? remainingQueue[0] : null

    return {
      permissionQueue: remainingQueue,
      activePermission: state.activePermission?.requestId === requestId ? nextPermission : state.activePermission,
    }
  }),

  dismissPermission: (requestId) => set((state) => {
    const remainingQueue = state.permissionQueue.filter((p) => p.requestId !== requestId)
    const nextPermission = remainingQueue.length > 0 ? remainingQueue[0] : null

    return {
      permissionQueue: remainingQueue,
      activePermission: state.activePermission?.requestId === requestId ? nextPermission : state.activePermission,
    }
  }),

  clearPermissionQueue: () => set({
    permissionQueue: [],
    activePermission: null,
  }),

  addToast: (type, title, message, options = {}) => {
    const id = generateId('toast')
    const toast: Toast = {
      id,
      type,
      title,
      message,
      duration: 5000,
      ...options,
    }
    // Record to history once on creation (not again on dismiss)
    const historyEntry = { id, type, title, message, timestamp: Date.now() }
    set((state) => ({
      toasts: [...state.toasts, toast],
      notificationHistory: [historyEntry, ...state.notificationHistory].slice(0, 50),
    }))
    return id
  },

  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter((t) => t.id !== id),
    // Don't re-add to history — already recorded in addToast
  })),

  clearToasts: () => set({ toasts: [] }),

  clearNotificationHistory: () => set({ notificationHistory: [] }),

  setEditorCursorPosition: (position) => set({ editorCursorPosition: position }),
  setEditorSelection: (selection) => set({ editorSelection: selection }),
  setEditorLanguage: (language) => set({ editorLanguage: language }),
  setEditorEncoding: (encoding) => set({ editorEncoding: encoding }),
  setEditorIndent: (indent) => set({ editorIndent: indent }),
  setEditorLineEnding: (lineEnding: 'lf' | 'crlf') => set({ editorLineEnding: lineEnding }),

  setWorkspaceProblems: (problems) => set({ workspaceProblems: problems }),
  updateFileProblems: (filePath: string, problems: AppState['workspaceProblems']) => set((state) => {
    // Remove old problems for this file, add new ones (accumulate across files)
    const other = state.workspaceProblems.filter(p => p.file !== filePath)
    return { workspaceProblems: [...other, ...problems] }
  }),
  clearWorkspaceProblems: () => set({ workspaceProblems: [] }),

  reset: () => {
    // Clear persisted data
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      logger.warn('Storage', 'Failed to clear persisted data')
    }
    set({
      connected: false,
      connecting: false,
      connectionError: null,
      agents: [] as Agent[],
      selectedAgent: null,
      swarms: [] as Swarm[],
      activeSwarm: null,
      teams: [] as Team[],
      activeTeam: null,
      sessions: [] as Session[],
      activeSession: null,
      permissionQueue: [] as PermissionRequest[],
      activePermission: null,
      toasts: [],
      notificationHistory: [],
      sidebarCollapsed: false,
      activePanel: 'editor',
      loading: false,
    })
  },

  clearPersistedData: () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      logger.warn('Storage', 'Failed to clear persisted data')
    }
  },
}))

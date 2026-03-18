import { create } from 'zustand'
import type { Agent, Swarm, Team, Session } from '../types'
import { api, type AgentInfo, type PermissionRequestEvent } from '../services'

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

interface AppState {
  // Connection state
  connected: boolean
  connecting: boolean
  connectionError: string | null

  // Agents
  agents: Agent[]
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

  // UI state
  sidebarCollapsed: boolean
  activePanel: 'editor' | 'swarm' | 'team' | 'settings'
  loading: boolean

  // Actions
  initialize: (simulateError?: boolean) => Promise<void>
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

  // Permission actions
  addPermissionRequest: (request: PermissionRequestEvent) => void
  resolvePermission: (requestId: string, optionId: string) => void
  dismissPermission: (requestId: string) => void
  clearPermissionQueue: () => void

  reset: () => void
  clearPersistedData: () => void
}

// Helper to convert AgentInfo to Agent
function agentInfoToAgent(info: AgentInfo): Agent {
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
    state: stateMap[info.status] || 'idle',
    capabilities: {
      loadSession: info.capabilities.includes('load_session'),
      promptCapabilities: {
        image: false,
        audio: false,
        embeddedContext: false,
      },
      mcp: {
        http: false,
        sse: false,
      },
      pairProgramming: info.capabilities.includes('pair_programming'),
      teamCollaboration: info.capabilities.includes('team_collaboration'),
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
    console.warn('Failed to load persisted data')
  }
  return null
}

// Helper to save persisted data
const savePersistedData = (data: PersistedState) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    console.warn('Failed to save persisted data')
  }
}

export const useAppStore = create<AppState>()((set, get) => ({
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
  sidebarCollapsed: false,
  activePanel: 'editor',
  loading: false,

  initialize: async (simulateError?: boolean) => {
    set({ connecting: true, connectionError: null })
    try {
      // For testing: simulate initialization error
      if (simulateError) {
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
          swarms: persisted?.swarms || [],
          teams: persisted?.teams || [],
        })
      } catch (agentError) {
        console.warn('Failed to load agents, using empty list:', agentError)
        set({
          connected: true,
          connecting: false,
          agents: [],
          swarms: persisted?.swarms || [],
          teams: persisted?.teams || [],
        })
      }
    } catch (error) {
      console.error('Failed to initialize:', error)
      set({
        connected: false,
        connecting: false,
        connectionError: error instanceof Error ? error.message : 'Failed to connect'
      })
    }
  },

  loadAgents: async () => {
    try {
      const agentInfos = await api.agent.refreshAgents()
      const agents = agentInfos.map(agentInfoToAgent)
      set({ agents })
    } catch (error) {
      console.error('Failed to load agents:', error)
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
      console.error('Failed to start agent:', error)
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
      console.error('Failed to stop agent:', error)
      throw error
    }
  },

  setConnected: (connected) => set({ connected, connectionError: connected ? null : undefined }),

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
    set({ swarms })
    savePersistedData({ swarms, teams: get().teams })
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
    set({ teams })
    savePersistedData({ swarms: get().swarms, teams })
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

  setActivePanel: (panel) => set({ activePanel: panel }),

  setLoading: (loading) => set({ loading }),

  addPermissionRequest: (event) => set((state) => {
    const request: PermissionRequest = {
      id: event.request_id,
      requestId: event.request_id,
      sessionId: event.session_id,
      toolCallId: event.tool_call_id,
      toolName: event.tool_name,
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

  reset: () => {
    // Clear persisted data
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      console.warn('Failed to clear persisted data')
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
      sidebarCollapsed: false,
      activePanel: 'editor',
      loading: false,
    })
  },

  clearPersistedData: () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      console.warn('Failed to clear persisted data')
    }
  },
}))

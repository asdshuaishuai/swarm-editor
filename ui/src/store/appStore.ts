import { create } from 'zustand'
import { Agent, Swarm, Team, Session } from '../types'

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

  // UI state
  sidebarCollapsed: boolean
  activePanel: 'editor' | 'swarm' | 'team' | 'settings'
  loading: boolean

  // Actions
  initialize: () => Promise<void>
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
  reset: () => void
}

const initialState = {
  connected: false,
  connecting: false,
  connectionError: null,
  agents: [],
  selectedAgent: null,
  swarms: [],
  activeSwarm: null,
  teams: [],
  activeTeam: null,
  sessions: [],
  activeSession: null,
  sidebarCollapsed: false,
  activePanel: 'editor' as const,
  loading: false,
}

export const useAppStore = create<AppState>((set) => ({
  ...initialState,

  initialize: async () => {
    set({ connecting: true, connectionError: null })
    try {
      // Initialize connection to backend
      // This will be implemented with Tauri IPC or WebSocket
      set({ connected: true, connecting: false })
    } catch (error) {
      console.error('Failed to initialize:', error)
      set({
        connected: false,
        connecting: false,
        connectionError: error instanceof Error ? error.message : 'Failed to connect'
      })
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

  setSwarms: (swarms) => set({ swarms }),

  addSwarm: (swarm) => set((state) => ({ swarms: [...state.swarms, swarm] })),

  removeSwarm: (swarmId) => set((state) => ({
    swarms: state.swarms.filter((s) => s.id !== swarmId),
    activeSwarm: state.activeSwarm?.id === swarmId ? null : state.activeSwarm
  })),

  setActiveSwarm: (swarm) => set({ activeSwarm: swarm }),

  setTeams: (teams) => set({ teams }),

  addTeam: (team) => set((state) => ({ teams: [...state.teams, team] })),

  removeTeam: (teamId) => set((state) => ({
    teams: state.teams.filter((t) => t.id !== teamId),
    activeTeam: state.activeTeam?.id === teamId ? null : state.activeTeam
  })),

  setActiveTeam: (team) => set({ activeTeam: team }),

  setSessions: (sessions) => set({ sessions }),

  setActiveSession: (session) => set({ activeSession: session }),

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setActivePanel: (panel) => set({ activePanel: panel }),

  setLoading: (loading) => set({ loading }),

  reset: () => set(initialState),
}))
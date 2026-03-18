import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from '@testing-library/react'
import { useAppStore } from './appStore'
import type { PermissionRequest } from './appStore'
import type { Team, Session, Swarm, Agent } from '../types'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
    get store() {
      return store
    },
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock fetch for global fetch calls
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock api from services module
const mockGetAgents = vi.fn()
const mockRefreshAgents = vi.fn()
const mockStartAgent = vi.fn()
const mockStopAgent = vi.fn()

vi.mock('../services', () => ({
  api: {
    agent: {
      getAgents: (...args: unknown[]) => mockGetAgents(...args),
      refreshAgents: (...args: unknown[]) => mockRefreshAgents(...args),
      startAgent: (...args: unknown[]) => mockStartAgent(...args),
      stopAgent: (...args: unknown[]) => mockStopAgent(...args),
    },
  },
}))

describe('appStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAgents.mockReset()
    mockRefreshAgents.mockReset()
    mockStartAgent.mockReset()
    mockStopAgent.mockReset()
    localStorageMock.clear()
    // Reset store to initial state
    useAppStore.setState({
      connected: false,
      connecting: false,
      connectionError: null,
      agents: [],
      swarms: [],
      teams: [],
      sessions: [],
      activeSwarm: null,
      activeTeam: null,
      activeSession: null,
      selectedAgent: null,
      permissionQueue: [],
      activePermission: null,
      sidebarCollapsed: false,
      activePanel: 'editor' as const,
      loading: false,
    })
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  describe('initialize', () => {
    it('initializes successfully with agents', async () => {
      const mockAgents = [
        { id: 'agent-1', name: 'Agent 1', status: 'stopped', type: 'coder', capabilities: [], lastActive: '2024-01-01T00:00:00Z' },
        { id: 'agent-2', name: 'Agent 2', status: 'running', type: 'coder', capabilities: [], lastActive: '2024-01-01T00:00:00Z' },
      ]
      mockGetAgents.mockResolvedValueOnce(mockAgents)

      await act(async () => {
        await useAppStore.getState().initialize()
      })

      const state = useAppStore.getState()
      expect(state.connected).toBe(true)
      expect(state.agents).toHaveLength(2)
      expect(state.agents[0].id).toBe('agent-1')
    })

    it('handles agent without lastActive field', async () => {
      // Agent missing lastActive - tests line 138 fallback
      const mockAgents = [
        { id: 'agent-1', name: 'Agent 1', status: 'stopped', type: 'coder', capabilities: [] },
      ]
      mockGetAgents.mockResolvedValueOnce(mockAgents)

      await act(async () => {
        await useAppStore.getState().initialize()
      })

      const state = useAppStore.getState()
      expect(state.agents).toHaveLength(1)
      expect(state.agents[0].lastActive).toBeDefined()
    })

    it('handles agent with unknown type and status', async () => {
      // Unknown type and status - tests lines 121-122 fallbacks
      const mockAgents = [
        { id: 'agent-1', name: 'Agent 1', status: 'unknown_status', type: 'unknown_type', capabilities: [] },
      ]
      mockGetAgents.mockResolvedValueOnce(mockAgents)

      await act(async () => {
        await useAppStore.getState().initialize()
      })

      const state = useAppStore.getState()
      expect(state.agents).toHaveLength(1)
      expect(state.agents[0].type).toBe('coder') // fallback
      expect(state.agents[0].state).toBe('idle') // fallback
    })

    it('handles initialization errors gracefully', async () => {
      mockGetAgents.mockRejectedValueOnce(new Error('Network error'))

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await act(async () => {
        await useAppStore.getState().initialize()
      })

      const state = useAppStore.getState()
      expect(state.connected).toBe(true)
      expect(state.agents).toHaveLength(0)

      consoleSpy.mockRestore()
    })

    it('loads persisted data from localStorage', async () => {
      const persistedState = {
        swarms: [{ id: 'persisted-1', name: 'Persisted Swarm' }],
        teams: [{ id: 'team-1', name: 'Team' }],
      }
      localStorageMock.setItem('swarm-editor-state', JSON.stringify(persistedState))

      mockGetAgents.mockResolvedValueOnce([])

      await act(async () => {
        await useAppStore.getState().initialize()
      })

      const state = useAppStore.getState()
      expect(state.swarms).toHaveLength(1)
      expect(state.swarms[0].id).toBe('persisted-1')
      expect(state.teams).toHaveLength(1)
    })

    it('loads persisted data with missing swarms array', async () => {
      // Only teams, no swarms - tests line 149 fallback
      const persistedState = {
        teams: [{ id: 'team-1', name: 'Team' }],
      }
      localStorageMock.setItem('swarm-editor-state', JSON.stringify(persistedState))

      mockGetAgents.mockResolvedValueOnce([])

      await act(async () => {
        await useAppStore.getState().initialize()
      })

      const state = useAppStore.getState()
      expect(state.swarms).toHaveLength(0)
      expect(state.teams).toHaveLength(1)
    })

    it('loads persisted data with missing teams array', async () => {
      // Only swarms, no teams - tests line 150 fallback
      const persistedState = {
        swarms: [{ id: 'persisted-1', name: 'Persisted Swarm' }],
      }
      localStorageMock.setItem('swarm-editor-state', JSON.stringify(persistedState))

      mockGetAgents.mockResolvedValueOnce([])

      await act(async () => {
        await useAppStore.getState().initialize()
      })

      const state = useAppStore.getState()
      expect(state.swarms).toHaveLength(1)
      expect(state.teams).toHaveLength(0)
    })

    it('handles localStorage getItem error gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Mock localStorage.getItem to throw an error
      const originalGetItem = localStorageMock.getItem
      localStorageMock.getItem = vi.fn(() => {
        throw new Error('Storage quota exceeded')
      })

      mockGetAgents.mockResolvedValueOnce([])

      await act(async () => {
        await useAppStore.getState().initialize()
      })

      // Should have logged a warning with the logger
      expect(consoleSpy).toHaveBeenCalledWith('[Storage]', 'Failed to load persisted data')

      // State should still initialize (with empty swarms/teams)
      const state = useAppStore.getState()
      expect(state.swarms).toHaveLength(0)
      expect(state.teams).toHaveLength(0)

      // Restore
      localStorageMock.getItem = originalGetItem
      consoleSpy.mockRestore()
    })

    it('sets connecting state during initialization', async () => {
      mockGetAgents.mockImplementationOnce(() =>
        new Promise(resolve => setTimeout(() => resolve([]), 100))
      )

      // Start initialization but don't await yet
      const initPromise = useAppStore.getState().initialize()

      // Check connecting state is set
      expect(useAppStore.getState().connecting).toBe(true)

      await act(async () => {
        await initPromise
      })

      expect(useAppStore.getState().connecting).toBe(false)
    })

    it('handles simulateError flag', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await act(async () => {
        await useAppStore.getState().initialize(true)
      })

      const state = useAppStore.getState()
      expect(state.connected).toBe(false)
      expect(state.connectionError).toBe('Simulated initialization error')

      consoleSpy.mockRestore()
    })
  })

  describe('loadAgents', () => {
    it('loads agents successfully', async () => {
      const mockAgents = [
        { id: 'agent-1', name: 'Agent 1', status: 'stopped', type: 'coder', capabilities: [], lastActive: '2024-01-01T00:00:00Z' },
        { id: 'agent-2', name: 'Agent 2', status: 'running', type: 'coder', capabilities: [], lastActive: '2024-01-01T00:00:00Z' },
      ]
      mockRefreshAgents.mockResolvedValueOnce(mockAgents)

      await act(async () => {
        await useAppStore.getState().loadAgents()
      })

      const state = useAppStore.getState()
      expect(state.agents).toHaveLength(2)
    })

    it('handles loadAgents errors', async () => {
      mockRefreshAgents.mockRejectedValueOnce(new Error('Failed to load'))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await act(async () => {
        await useAppStore.getState().loadAgents()
      })

      const state = useAppStore.getState()
      expect(state.agents).toHaveLength(0)

      consoleSpy.mockRestore()
    })
  })

  describe('startAgent', () => {
    it('starts agent successfully', async () => {
      useAppStore.setState({
        agents: [{ id: 'agent-1', name: 'Agent 1', state: 'idle', type: 'coder', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '2024-01-01T00:00:00Z', lastActive: '2024-01-01T00:00:00Z' }],
      })

      mockStartAgent.mockResolvedValueOnce({
        id: 'agent-1',
        status: 'running',
        pid: 12345,
        name: 'Agent 1',
        type: 'coder',
        capabilities: [],
        lastActive: '2024-01-01T00:00:00Z',
      })

      await act(async () => {
        await useAppStore.getState().startAgent('agent-1')
      })

      const state = useAppStore.getState()
      expect(state.agents[0].state).toBe('executing')
    })

    it('updates selectedAgent when starting the selected one', async () => {
      const agent = { id: 'agent-1', name: 'Agent 1', state: 'idle' as const, type: 'coder' as const, capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '2024-01-01T00:00:00Z', lastActive: '2024-01-01T00:00:00Z' }
      useAppStore.setState({
        agents: [agent],
        selectedAgent: agent,
      })

      mockStartAgent.mockResolvedValueOnce({
        id: 'agent-1',
        status: 'running',
        pid: 12345,
        name: 'Agent 1',
        type: 'coder',
        capabilities: [],
        lastActive: '2024-01-01T00:00:00Z',
      })

      await act(async () => {
        await useAppStore.getState().startAgent('agent-1')
      })

      const state = useAppStore.getState()
      expect(state.selectedAgent?.state).toBe('executing')
    })

    it('does not update selectedAgent when starting a different agent', async () => {
      const agent1 = { id: 'agent-1', name: 'Agent 1', state: 'idle' as const, type: 'coder' as const, capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '2024-01-01T00:00:00Z', lastActive: '2024-01-01T00:00:00Z' }
      const agent2 = { id: 'agent-2', name: 'Agent 2', state: 'idle' as const, type: 'coder' as const, capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '2024-01-01T00:00:00Z', lastActive: '2024-01-01T00:00:00Z' }
      useAppStore.setState({
        agents: [agent1, agent2],
        selectedAgent: agent1,
      })

      mockStartAgent.mockResolvedValueOnce({
        id: 'agent-2',
        status: 'running',
        pid: 12345,
        name: 'Agent 2',
        type: 'coder',
        capabilities: [],
        lastActive: '2024-01-01T00:00:00Z',
      })

      await act(async () => {
        await useAppStore.getState().startAgent('agent-2')
      })

      const state = useAppStore.getState()
      // selectedAgent should remain unchanged (agent1, not agent2)
      expect(state.selectedAgent?.id).toBe('agent-1')
      expect(state.selectedAgent?.state).toBe('idle')
      // But agent2 in the agents list should be updated
      expect(state.agents.find(a => a.id === 'agent-2')?.state).toBe('executing')
    })

    it('handles startAgent errors', async () => {
      useAppStore.setState({
        agents: [{ id: 'agent-1', name: 'Agent 1', state: 'idle', type: 'coder', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '2024-01-01T00:00:00Z', lastActive: '2024-01-01T00:00:00Z' }],
      })

      mockStartAgent.mockRejectedValueOnce(new Error('Start failed'))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await act(async () => {
        try {
          await useAppStore.getState().startAgent('agent-1')
        } catch {
          // Expected to throw
        }
      })

      // Agent state should remain unchanged
      const state = useAppStore.getState()
      expect(state.agents[0].state).toBe('idle')

      consoleSpy.mockRestore()
    })
  })

  describe('stopAgent', () => {
    it('stops agent successfully', async () => {
      useAppStore.setState({
        agents: [{ id: 'agent-1', name: 'Agent 1', state: 'executing', type: 'coder', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '2024-01-01T00:00:00Z', lastActive: '2024-01-01T00:00:00Z' }],
      })

      mockStopAgent.mockResolvedValueOnce({
        id: 'agent-1',
        status: 'stopped',
        name: 'Agent 1',
        type: 'coder',
        capabilities: [],
        lastActive: '2024-01-01T00:00:00Z',
      })

      await act(async () => {
        await useAppStore.getState().stopAgent('agent-1')
      })

      const state = useAppStore.getState()
      expect(state.agents[0].state).toBe('idle')
    })

    it('updates selectedAgent when stopping the selected one', async () => {
      const agent = { id: 'agent-1', name: 'Agent 1', state: 'executing' as const, type: 'coder' as const, capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '2024-01-01T00:00:00Z', lastActive: '2024-01-01T00:00:00Z' }
      useAppStore.setState({
        agents: [agent],
        selectedAgent: agent,
      })

      mockStopAgent.mockResolvedValueOnce({
        id: 'agent-1',
        status: 'stopped',
        name: 'Agent 1',
        type: 'coder',
        capabilities: [],
        lastActive: '2024-01-01T00:00:00Z',
      })

      await act(async () => {
        await useAppStore.getState().stopAgent('agent-1')
      })

      const state = useAppStore.getState()
      expect(state.selectedAgent?.state).toBe('idle')
    })

    it('does not update selectedAgent when stopping a different agent', async () => {
      const agent1 = { id: 'agent-1', name: 'Agent 1', state: 'executing' as const, type: 'coder' as const, capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '2024-01-01T00:00:00Z', lastActive: '2024-01-01T00:00:00Z' }
      const agent2 = { id: 'agent-2', name: 'Agent 2', state: 'executing' as const, type: 'coder' as const, capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '2024-01-01T00:00:00Z', lastActive: '2024-01-01T00:00:00Z' }
      useAppStore.setState({
        agents: [agent1, agent2],
        selectedAgent: agent1,
      })

      mockStopAgent.mockResolvedValueOnce({
        id: 'agent-2',
        status: 'stopped',
        name: 'Agent 2',
        type: 'coder',
        capabilities: [],
        lastActive: '2024-01-01T00:00:00Z',
      })

      await act(async () => {
        await useAppStore.getState().stopAgent('agent-2')
      })

      const state = useAppStore.getState()
      // selectedAgent should remain unchanged (agent1, not agent2)
      expect(state.selectedAgent?.id).toBe('agent-1')
      expect(state.selectedAgent?.state).toBe('executing')
      // But agent2 in the agents list should be updated
      expect(state.agents.find(a => a.id === 'agent-2')?.state).toBe('idle')
    })

    it('handles stopAgent errors', async () => {
      useAppStore.setState({
        agents: [{ id: 'agent-1', name: 'Agent 1', state: 'executing', type: 'coder', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '2024-01-01T00:00:00Z', lastActive: '2024-01-01T00:00:00Z' }],
      })

      mockStopAgent.mockRejectedValueOnce(new Error('Stop failed'))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await act(async () => {
        try {
          await useAppStore.getState().stopAgent('agent-1')
        } catch {
          // Expected to throw
        }
      })

      const state = useAppStore.getState()
      expect(state.agents[0].state).toBe('executing')

      consoleSpy.mockRestore()
    })
  })

  describe('updateAgent', () => {
    it('updates agent successfully', () => {
      useAppStore.setState({
        agents: [{ id: 'agent-1', name: 'Agent 1', state: 'idle', type: 'coder', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '2024-01-01T00:00:00Z', lastActive: '2024-01-01T00:00:00Z' }],
      })

      act(() => {
        useAppStore.getState().updateAgent('agent-1', { name: 'Updated Agent', state: 'thinking' })
      })

      const state = useAppStore.getState()
      expect(state.agents[0].name).toBe('Updated Agent')
      expect(state.agents[0].state).toBe('thinking')
    })

    it('updates selectedAgent when updating the selected one', () => {
      const agent = { id: 'agent-1', name: 'Agent 1', state: 'idle' as const, type: 'coder' as const, capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '2024-01-01T00:00:00Z', lastActive: '2024-01-01T00:00:00Z' }
      useAppStore.setState({
        agents: [agent],
        selectedAgent: agent,
      })

      act(() => {
        useAppStore.getState().updateAgent('agent-1', { name: 'Updated' })
      })

      const state = useAppStore.getState()
      expect(state.selectedAgent?.name).toBe('Updated')
    })

    it('handles non-existent agent', () => {
      useAppStore.setState({
        agents: [{ id: 'agent-1', name: 'Agent 1', state: 'idle', type: 'coder', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '2024-01-01T00:00:00Z', lastActive: '2024-01-01T00:00:00Z' }],
      })

      act(() => {
        useAppStore.getState().updateAgent('non-existent', { name: 'Updated' })
      })

      const state = useAppStore.getState()
      expect(state.agents).toHaveLength(1)
      expect(state.agents[0].name).toBe('Agent 1')
    })
  })

  describe('removeAgent', () => {
    it('removes agent successfully', () => {
      useAppStore.setState({
        agents: [
          { id: 'agent-1', name: 'Agent 1', state: 'idle', type: 'coder', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '2024-01-01T00:00:00Z', lastActive: '2024-01-01T00:00:00Z' },
          { id: 'agent-2', name: 'Agent 2', state: 'idle', type: 'coder', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '2024-01-01T00:00:00Z', lastActive: '2024-01-01T00:00:00Z' },
        ],
      })

      act(() => {
        useAppStore.getState().removeAgent('agent-1')
      })

      const state = useAppStore.getState()
      expect(state.agents).toHaveLength(1)
      expect(state.agents[0].id).toBe('agent-2')
    })

    it('clears selectedAgent when removing it', () => {
      const agent = { id: 'agent-1', name: 'Agent 1', state: 'idle' as const, type: 'coder' as const, capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '2024-01-01T00:00:00Z', lastActive: '2024-01-01T00:00:00Z' }
      useAppStore.setState({
        agents: [agent],
        selectedAgent: agent,
      })

      act(() => {
        useAppStore.getState().removeAgent('agent-1')
      })

      const state = useAppStore.getState()
      expect(state.selectedAgent).toBeNull()
    })
  })

  describe('swarm management', () => {
    it('setSwarms updates swarms', () => {
      const swarms = [{ id: 'swarm-1', name: 'Swarm 1', state: 'active' as const, topology: 'star' as const, strategy: 'parallel' as const, agents: [], stats: { agentCount: 0, idleAgents: 0, executingAgents: 0, pendingTasks: 0, completedTasks: 0, topology: 'star', strategy: 'parallel', state: 'active' } }]

      act(() => {
        useAppStore.getState().setSwarms(swarms as Swarm[])
      })

      expect(useAppStore.getState().swarms).toEqual(swarms)
    })

    it('setSwarms handles localStorage setItem error gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Mock localStorage.setItem to throw an error
      const originalSetItem = localStorageMock.setItem
      localStorageMock.setItem = vi.fn(() => {
        throw new Error('Storage quota exceeded')
      })

      const swarms = [{ id: 'swarm-1', name: 'Swarm 1', state: 'active' as const, topology: 'star' as const, strategy: 'parallel' as const, agents: [], stats: { agentCount: 0, idleAgents: 0, executingAgents: 0, pendingTasks: 0, completedTasks: 0, topology: 'star', strategy: 'parallel', state: 'active' } }]

      act(() => {
        useAppStore.getState().setSwarms(swarms as Swarm[])
      })

      // Should have logged a warning with the logger
      expect(consoleSpy).toHaveBeenCalledWith('[Storage]', 'Failed to save persisted data')

      // State should still be updated
      expect(useAppStore.getState().swarms).toEqual(swarms)

      // Restore
      localStorageMock.setItem = originalSetItem
      consoleSpy.mockRestore()
    })

    it('addSwarm adds a new swarm', () => {
      useAppStore.setState({ swarms: [] })

      const newSwarm = { id: 'swarm-1', name: 'New Swarm', state: 'active' as const, topology: 'star' as const, strategy: 'parallel' as const, agents: [], stats: { agentCount: 0, idleAgents: 0, executingAgents: 0, pendingTasks: 0, completedTasks: 0, topology: 'star', strategy: 'parallel', state: 'active' } }

      act(() => {
        useAppStore.getState().addSwarm(newSwarm as Swarm)
      })

      const state = useAppStore.getState()
      expect(state.swarms).toHaveLength(1)
      expect(state.swarms[0].id).toBe('swarm-1')
    })

    it('removeSwarm removes a swarm', () => {
      const swarm = { id: 'swarm-1', name: 'Swarm 1', state: 'active' as const, topology: 'star' as const, strategy: 'parallel' as const, agents: [], stats: { agentCount: 0, idleAgents: 0, executingAgents: 0, pendingTasks: 0, completedTasks: 0, topology: 'star', strategy: 'parallel', state: 'active' } }
      useAppStore.setState({ swarms: [swarm] as Swarm[] })

      act(() => {
        useAppStore.getState().removeSwarm('swarm-1')
      })

      expect(useAppStore.getState().swarms).toHaveLength(0)
    })

    it('removeSwarm clears activeSwarm when removing the active swarm', () => {
      const swarm1 = { id: 'swarm-1', name: 'Swarm 1', state: 'active' as const, topology: 'star' as const, strategy: 'parallel' as const, agents: [], stats: { agentCount: 0, idleAgents: 0, executingAgents: 0, pendingTasks: 0, completedTasks: 0, topology: 'star', strategy: 'parallel', state: 'active' } }
      const swarm2 = { id: 'swarm-2', name: 'Swarm 2', state: 'active' as const, topology: 'star' as const, strategy: 'parallel' as const, agents: [], stats: { agentCount: 0, idleAgents: 0, executingAgents: 0, pendingTasks: 0, completedTasks: 0, topology: 'star', strategy: 'parallel', state: 'active' } }
      useAppStore.setState({ swarms: [swarm1, swarm2] as Swarm[], activeSwarm: swarm1 as Swarm })

      act(() => {
        useAppStore.getState().removeSwarm('swarm-1')
      })

      const state = useAppStore.getState()
      expect(state.swarms).toHaveLength(1)
      expect(state.activeSwarm).toBeNull()
    })

    it('removeSwarm keeps activeSwarm when removing a different swarm', () => {
      const swarm1 = { id: 'swarm-1', name: 'Swarm 1', state: 'active' as const, topology: 'star' as const, strategy: 'parallel' as const, agents: [], stats: { agentCount: 0, idleAgents: 0, executingAgents: 0, pendingTasks: 0, completedTasks: 0, topology: 'star', strategy: 'parallel', state: 'active' } }
      const swarm2 = { id: 'swarm-2', name: 'Swarm 2', state: 'active' as const, topology: 'star' as const, strategy: 'parallel' as const, agents: [], stats: { agentCount: 0, idleAgents: 0, executingAgents: 0, pendingTasks: 0, completedTasks: 0, topology: 'star', strategy: 'parallel', state: 'active' } }
      useAppStore.setState({ swarms: [swarm1, swarm2] as Swarm[], activeSwarm: swarm1 as Swarm })

      act(() => {
        useAppStore.getState().removeSwarm('swarm-2')
      })

      const state = useAppStore.getState()
      expect(state.swarms).toHaveLength(1)
      expect(state.activeSwarm?.id).toBe('swarm-1')
    })

    it('setActiveSwarm updates active swarm', () => {
      const swarm = { id: 'swarm-1', name: 'Active Swarm', state: 'active' as const, topology: 'star' as const, strategy: 'parallel' as const, agents: [], stats: { agentCount: 0, idleAgents: 0, executingAgents: 0, pendingTasks: 0, completedTasks: 0, topology: 'star', strategy: 'parallel', state: 'active' } }

      act(() => {
        useAppStore.getState().setActiveSwarm(swarm as Swarm)
      })

      expect(useAppStore.getState().activeSwarm?.id).toBe('swarm-1')
    })
  })

  describe('team management', () => {
    it('setTeams updates teams', () => {
      const teams = [{ id: 'team-1', name: 'Team 1', description: 'Test team', owner: 'user-1', members: [], agents: [], workspaces: [], stats: { memberCount: 0, onlineMembers: 0, agentCount: 0, idleAgents: 0, workspaceCount: 0 } }]

      act(() => {
        useAppStore.getState().setTeams(teams as Team[])
      })

      expect(useAppStore.getState().teams).toEqual(teams)
    })

    it('addTeam adds a new team', () => {
      useAppStore.setState({ teams: [] })

      const newTeam = { id: 'team-1', name: 'New Team', description: 'Test team', owner: 'user-1', members: [], agents: [], workspaces: [], stats: { memberCount: 0, onlineMembers: 0, agentCount: 0, idleAgents: 0, workspaceCount: 0 } }

      act(() => {
        useAppStore.getState().addTeam(newTeam as Team)
      })

      expect(useAppStore.getState().teams).toHaveLength(1)
    })

    it('removeTeam removes a team', () => {
      const team = { id: 'team-1', name: 'Team 1', description: 'Test team', owner: 'user-1', members: [], agents: [], workspaces: [], stats: { memberCount: 0, onlineMembers: 0, agentCount: 0, idleAgents: 0, workspaceCount: 0 } }
      useAppStore.setState({ teams: [team] as Team[] })

      act(() => {
        useAppStore.getState().removeTeam('team-1')
      })

      expect(useAppStore.getState().teams).toHaveLength(0)
    })

    it('removeTeam clears activeTeam when removing the active team', () => {
      const team1 = { id: 'team-1', name: 'Team 1', description: 'Test team', owner: 'user-1', members: [], agents: [], workspaces: [], stats: { memberCount: 0, onlineMembers: 0, agentCount: 0, idleAgents: 0, workspaceCount: 0 } }
      const team2 = { id: 'team-2', name: 'Team 2', description: 'Test team', owner: 'user-1', members: [], agents: [], workspaces: [], stats: { memberCount: 0, onlineMembers: 0, agentCount: 0, idleAgents: 0, workspaceCount: 0 } }
      useAppStore.setState({ teams: [team1, team2] as Team[], activeTeam: team1 as Team })

      act(() => {
        useAppStore.getState().removeTeam('team-1')
      })

      const state = useAppStore.getState()
      expect(state.teams).toHaveLength(1)
      expect(state.activeTeam).toBeNull()
    })

    it('removeTeam keeps activeTeam when removing a different team', () => {
      const team1 = { id: 'team-1', name: 'Team 1', description: 'Test team', owner: 'user-1', members: [], agents: [], workspaces: [], stats: { memberCount: 0, onlineMembers: 0, agentCount: 0, idleAgents: 0, workspaceCount: 0 } }
      const team2 = { id: 'team-2', name: 'Team 2', description: 'Test team', owner: 'user-1', members: [], agents: [], workspaces: [], stats: { memberCount: 0, onlineMembers: 0, agentCount: 0, idleAgents: 0, workspaceCount: 0 } }
      useAppStore.setState({ teams: [team1, team2] as Team[], activeTeam: team1 as Team })

      act(() => {
        useAppStore.getState().removeTeam('team-2')
      })

      const state = useAppStore.getState()
      expect(state.teams).toHaveLength(1)
      expect(state.activeTeam?.id).toBe('team-1')
    })

    it('setActiveTeam updates active team', () => {
      const team = { id: 'team-1', name: 'Active Team', description: 'Test team', owner: 'user-1', members: [], agents: [], workspaces: [], stats: { memberCount: 0, onlineMembers: 0, agentCount: 0, idleAgents: 0, workspaceCount: 0 } }

      act(() => {
        useAppStore.getState().setActiveTeam(team as Team)
      })

      expect(useAppStore.getState().activeTeam?.id).toBe('team-1')
    })
  })

  describe('session management', () => {
    it('setSessions updates sessions', () => {
      const sessions = [{ id: 'session-1', mode: 'default' as const, state: 'active' as const, agents: [], messages: [], files: [], createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' }]

      act(() => {
        useAppStore.getState().setSessions(sessions as Session[])
      })

      expect(useAppStore.getState().sessions).toEqual(sessions)
    })

    it('setActiveSession updates active session', () => {
      const session = { id: 'session-1', mode: 'default' as const, state: 'active' as const, agents: [], messages: [], files: [], createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' }

      act(() => {
        useAppStore.getState().setActiveSession(session as Session)
      })

      expect(useAppStore.getState().activeSession?.id).toBe('session-1')
    })
  })

  describe('permission management', () => {
    it('addPermissionRequest adds to queue', () => {
      useAppStore.setState({ permissionQueue: [], activePermission: null })

      const request = {
        request_id: 'perm-1',
        session_id: 'session-1',
        tool_call_id: 'tool-1',
        tool_name: 'test-tool',
        description: 'Test permission',
        options: [{ option_id: 'opt-1', name: 'Allow', kind: 'allow' as const }],
      }

      act(() => {
        useAppStore.getState().addPermissionRequest(request)
      })

      const state = useAppStore.getState()
      expect(state.permissionQueue).toHaveLength(1)
      expect(state.activePermission?.requestId).toBe('perm-1')
    })

    it('addPermissionRequest queues when active exists', () => {
      const existingRequest = {
        id: 'perm-0',
        requestId: 'perm-0',
        sessionId: 'session-1',
        toolCallId: 'tool-0',
        toolName: 'existing-tool',
        description: 'Existing permission',
        options: [],
        timestamp: Date.now(),
      }
      useAppStore.setState({ permissionQueue: [], activePermission: existingRequest })

      const request = {
        request_id: 'perm-1',
        session_id: 'session-1',
        tool_call_id: 'tool-1',
        tool_name: 'test-tool',
        description: 'Test permission',
        options: [{ option_id: 'opt-1', name: 'Allow', kind: 'allow' as const }],
      }

      act(() => {
        useAppStore.getState().addPermissionRequest(request)
      })

      const state = useAppStore.getState()
      expect(state.permissionQueue).toHaveLength(1)
      expect(state.activePermission?.requestId).toBe('perm-0') // Active unchanged
    })

    it('resolvePermission removes from queue and updates active', () => {
      const request: PermissionRequest = {
        id: 'perm-1',
        requestId: 'perm-1',
        sessionId: 'session-1',
        toolCallId: 'tool-1',
        toolName: 'test-tool',
        description: 'Test permission',
        options: [{ option_id: 'opt-1', name: 'Allow', kind: 'allow' }],
        timestamp: Date.now(),
      }
      useAppStore.setState({
        permissionQueue: [request],
        activePermission: request,
      })

      act(() => {
        useAppStore.getState().resolvePermission('perm-1', 'opt-1')
      })

      const state = useAppStore.getState()
      expect(state.permissionQueue).toHaveLength(0)
      expect(state.activePermission).toBeNull()
    })

    it('dismissPermission removes from queue', () => {
      const request: PermissionRequest = {
        id: 'perm-1',
        requestId: 'perm-1',
        sessionId: 'session-1',
        toolCallId: 'tool-1',
        toolName: 'test-tool',
        description: 'Test permission',
        options: [],
        timestamp: Date.now(),
      }
      useAppStore.setState({
        permissionQueue: [request],
        activePermission: request,
      })

      act(() => {
        useAppStore.getState().dismissPermission('perm-1')
      })

      expect(useAppStore.getState().permissionQueue).toHaveLength(0)
    })

    it('resolvePermission sets next permission when queue has more items', () => {
      const request1: PermissionRequest = {
        id: 'perm-1',
        requestId: 'perm-1',
        sessionId: 'session-1',
        toolCallId: 'tool-1',
        toolName: 'test-tool',
        description: 'Test permission 1',
        options: [{ option_id: 'opt-1', name: 'Allow', kind: 'allow' }],
        timestamp: Date.now(),
      }
      const request2: PermissionRequest = {
        id: 'perm-2',
        requestId: 'perm-2',
        sessionId: 'session-1',
        toolCallId: 'tool-2',
        toolName: 'test-tool-2',
        description: 'Test permission 2',
        options: [{ option_id: 'opt-2', name: 'Allow', kind: 'allow' }],
        timestamp: Date.now(),
      }
      useAppStore.setState({
        permissionQueue: [request1, request2],
        activePermission: request1,
      })

      act(() => {
        useAppStore.getState().resolvePermission('perm-1', 'opt-1')
      })

      const state = useAppStore.getState()
      expect(state.permissionQueue).toHaveLength(1)
      expect(state.activePermission?.requestId).toBe('perm-2')
    })

    it('resolvePermission keeps activePermission when resolving different request', () => {
      const request1: PermissionRequest = {
        id: 'perm-1',
        requestId: 'perm-1',
        sessionId: 'session-1',
        toolCallId: 'tool-1',
        toolName: 'test-tool',
        description: 'Test permission 1',
        options: [{ option_id: 'opt-1', name: 'Allow', kind: 'allow' }],
        timestamp: Date.now(),
      }
      const request2: PermissionRequest = {
        id: 'perm-2',
        requestId: 'perm-2',
        sessionId: 'session-1',
        toolCallId: 'tool-2',
        toolName: 'test-tool-2',
        description: 'Test permission 2',
        options: [],
        timestamp: Date.now(),
      }
      useAppStore.setState({
        permissionQueue: [request1, request2],
        activePermission: request1,
      })

      act(() => {
        useAppStore.getState().resolvePermission('perm-2', 'opt-1')
      })

      const state = useAppStore.getState()
      expect(state.permissionQueue).toHaveLength(1)
      expect(state.activePermission?.requestId).toBe('perm-1')
    })

    it('dismissPermission sets next permission when queue has more items', () => {
      const request1: PermissionRequest = {
        id: 'perm-1',
        requestId: 'perm-1',
        sessionId: 'session-1',
        toolCallId: 'tool-1',
        toolName: 'test-tool',
        description: 'Test permission 1',
        options: [],
        timestamp: Date.now(),
      }
      const request2: PermissionRequest = {
        id: 'perm-2',
        requestId: 'perm-2',
        sessionId: 'session-1',
        toolCallId: 'tool-2',
        toolName: 'test-tool-2',
        description: 'Test permission 2',
        options: [],
        timestamp: Date.now(),
      }
      useAppStore.setState({
        permissionQueue: [request1, request2],
        activePermission: request1,
      })

      act(() => {
        useAppStore.getState().dismissPermission('perm-1')
      })

      const state = useAppStore.getState()
      expect(state.permissionQueue).toHaveLength(1)
      expect(state.activePermission?.requestId).toBe('perm-2')
    })

    it('dismissPermission keeps activePermission when dismissing different request', () => {
      const request1: PermissionRequest = {
        id: 'perm-1',
        requestId: 'perm-1',
        sessionId: 'session-1',
        toolCallId: 'tool-1',
        toolName: 'test-tool',
        description: 'Test permission 1',
        options: [],
        timestamp: Date.now(),
      }
      const request2: PermissionRequest = {
        id: 'perm-2',
        requestId: 'perm-2',
        sessionId: 'session-1',
        toolCallId: 'tool-2',
        toolName: 'test-tool-2',
        description: 'Test permission 2',
        options: [],
        timestamp: Date.now(),
      }
      useAppStore.setState({
        permissionQueue: [request1, request2],
        activePermission: request1,
      })

      act(() => {
        useAppStore.getState().dismissPermission('perm-2')
      })

      const state = useAppStore.getState()
      expect(state.permissionQueue).toHaveLength(1)
      expect(state.activePermission?.requestId).toBe('perm-1')
    })

    it('clearPermissionQueue clears all permissions', () => {
      const perm1: PermissionRequest = {
        id: 'perm-1', requestId: 'perm-1', sessionId: 's1', toolCallId: 't1', toolName: 'tool1', description: 'd1', options: [], timestamp: 1
      }
      const perm2: PermissionRequest = {
        id: 'perm-2', requestId: 'perm-2', sessionId: 's2', toolCallId: 't2', toolName: 'tool2', description: 'd2', options: [], timestamp: 2
      }
      useAppStore.setState({
        permissionQueue: [perm1, perm2],
        activePermission: perm1,
      })

      act(() => {
        useAppStore.getState().clearPermissionQueue()
      })

      const state = useAppStore.getState()
      expect(state.permissionQueue).toHaveLength(0)
      expect(state.activePermission).toBeNull()
    })
  })

  describe('UI state', () => {
    it('toggleSidebar toggles sidebar state', () => {
      useAppStore.setState({ sidebarCollapsed: false })

      act(() => {
        useAppStore.getState().toggleSidebar()
      })

      expect(useAppStore.getState().sidebarCollapsed).toBe(true)

      act(() => {
        useAppStore.getState().toggleSidebar()
      })

      expect(useAppStore.getState().sidebarCollapsed).toBe(false)
    })

    it('setActivePanel updates active panel', () => {
      useAppStore.setState({ activePanel: 'editor' })

      act(() => {
        useAppStore.getState().setActivePanel('swarm')
      })

      expect(useAppStore.getState().activePanel).toBe('swarm')
    })

    it('setLoading updates loading state', () => {
      useAppStore.setState({ loading: false })

      act(() => {
        useAppStore.getState().setLoading(true)
      })

      expect(useAppStore.getState().loading).toBe(true)
    })
  })

  describe('reset and persistence', () => {
    it('reset clears all state', () => {
      useAppStore.setState({
        connected: true,
        agents: [{ id: 'agent-1', name: 'Agent 1', state: 'idle', type: 'coder', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '2024-01-01T00:00:00Z', lastActive: '2024-01-01T00:00:00Z' }] as Agent[],
        swarms: [{ id: 'swarm-1', name: 'Swarm 1', state: 'active', topology: 'star', strategy: 'parallel', agents: [], stats: { agentCount: 0, idleAgents: 0, executingAgents: 0, pendingTasks: 0, completedTasks: 0, topology: 'star', strategy: 'parallel', state: 'active' } }] as Swarm[],
        teams: [{ id: 'team-1', name: 'Team 1', description: 'Test', owner: 'user-1', members: [], agents: [], workspaces: [], stats: { memberCount: 0, onlineMembers: 0, agentCount: 0, idleAgents: 0, workspaceCount: 0 } }] as Team[],
        sessions: [{ id: 'session-1', mode: 'default', state: 'active', agents: [], messages: [], files: [], createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' }] as Session[],
        sidebarCollapsed: true,
        activePanel: 'swarm',
      })

      act(() => {
        useAppStore.getState().reset()
      })

      const state = useAppStore.getState()
      expect(state.agents).toHaveLength(0)
      expect(state.swarms).toHaveLength(0)
      expect(state.teams).toHaveLength(0)
      expect(state.sessions).toHaveLength(0)
      expect(state.sidebarCollapsed).toBe(false)
      expect(state.activePanel).toBe('editor')
      expect(state.connected).toBe(false)
    })

    it('clearPersistedData removes localStorage item', () => {
      localStorageMock.setItem('swarm-editor-state', '{"agents":[]}')

      act(() => {
        useAppStore.getState().clearPersistedData()
      })

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('swarm-editor-state')
    })

    it('clearPersistedData handles localStorage removeItem error gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Mock localStorage.removeItem to throw an error
      const originalRemoveItem = localStorageMock.removeItem
      localStorageMock.removeItem = vi.fn(() => {
        throw new Error('Storage error')
      })

      act(() => {
        useAppStore.getState().clearPersistedData()
      })

      // Should have logged a warning with the logger
      expect(consoleSpy).toHaveBeenCalledWith('[Storage]', 'Failed to clear persisted data')

      // Restore
      localStorageMock.removeItem = originalRemoveItem
      consoleSpy.mockRestore()
    })

    it('reset handles localStorage removeItem error gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Mock localStorage.removeItem to throw an error
      const originalRemoveItem = localStorageMock.removeItem
      localStorageMock.removeItem = vi.fn(() => {
        throw new Error('Storage error')
      })

      useAppStore.setState({
        connected: true,
        agents: [{ id: 'agent-1', name: 'Agent 1', state: 'idle', type: 'coder', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '2024-01-01T00:00:00Z', lastActive: '2024-01-01T00:00:00Z' }] as Agent[],
      })

      act(() => {
        useAppStore.getState().reset()
      })

      // Should have logged a warning with the logger
      expect(consoleSpy).toHaveBeenCalledWith('[Storage]', 'Failed to clear persisted data')

      // State should still be reset
      expect(useAppStore.getState().agents).toHaveLength(0)

      // Restore
      localStorageMock.removeItem = originalRemoveItem
      consoleSpy.mockRestore()
    })
  })

  describe('setAgents', () => {
    it('setAgents updates agents array', () => {
      const agents = [
        { id: 'agent-1', name: 'Agent 1', state: 'idle' as const, type: 'coder' as const, capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '2024-01-01T00:00:00Z', lastActive: '2024-01-01T00:00:00Z' },
        { id: 'agent-2', name: 'Agent 2', state: 'idle' as const, type: 'coder' as const, capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '2024-01-01T00:00:00Z', lastActive: '2024-01-01T00:00:00Z' },
      ]

      act(() => {
        useAppStore.getState().setAgents(agents as Agent[])
      })

      expect(useAppStore.getState().agents).toHaveLength(2)
    })
  })

  describe('selectAgent', () => {
    it('sets selected agent', () => {
      const agent = { id: 'agent-1', name: 'Agent 1', state: 'idle' as const, type: 'coder' as const, capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '2024-01-01T00:00:00Z', lastActive: '2024-01-01T00:00:00Z' }

      act(() => {
        useAppStore.getState().selectAgent(agent as Agent)
      })

      expect(useAppStore.getState().selectedAgent?.id).toBe('agent-1')
    })

    it('clears selected agent when null', () => {
      const agent = { id: 'agent-1', name: 'Agent 1', state: 'idle' as const, type: 'coder' as const, capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '2024-01-01T00:00:00Z', lastActive: '2024-01-01T00:00:00Z' }
      useAppStore.setState({
        selectedAgent: agent as Agent,
      })

      act(() => {
        useAppStore.getState().selectAgent(null)
      })

      expect(useAppStore.getState().selectedAgent).toBeNull()
    })
  })

  describe('setConnected', () => {
    it('updates connected state', () => {
      useAppStore.setState({ connected: false })

      act(() => {
        useAppStore.getState().setConnected(true)
      })

      expect(useAppStore.getState().connected).toBe(true)
    })

    it('clears connectionError when connected', () => {
      useAppStore.setState({ connectionError: 'Some error' })

      act(() => {
        useAppStore.getState().setConnected(true)
      })

      expect(useAppStore.getState().connectionError).toBeNull()
    })

    it('sets connectionError to undefined when disconnected', () => {
      useAppStore.setState({ connectionError: 'Some error' })

      act(() => {
        useAppStore.getState().setConnected(false)
      })

      expect(useAppStore.getState().connected).toBe(false)
      expect(useAppStore.getState().connectionError).toBeUndefined()
    })
  })

  describe('setConnectionError', () => {
    it('updates connection error', () => {
      useAppStore.setState({ connectionError: null })

      act(() => {
        useAppStore.getState().setConnectionError('Connection failed')
      })

      expect(useAppStore.getState().connectionError).toBe('Connection failed')
    })
  })

  describe('addAgent', () => {
    it('adds agent to the list', () => {
      useAppStore.setState({ agents: [] })

      const agent = { id: 'agent-1', name: 'New Agent', state: 'idle' as const, type: 'coder' as const, capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '2024-01-01T00:00:00Z', lastActive: '2024-01-01T00:00:00Z' }

      act(() => {
        useAppStore.getState().addAgent(agent as Agent)
      })

      expect(useAppStore.getState().agents).toHaveLength(1)
      expect(useAppStore.getState().agents[0].id).toBe('agent-1')
    })
  })
})
import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from './appStore'
import type { Agent, Swarm, Team, Session } from '../types'

describe('appStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useAppStore.getState().reset()
  })

  describe('initial state', () => {
    it('should have correct initial values', () => {
      const state = useAppStore.getState()
      expect(state.connected).toBe(false)
      expect(state.connecting).toBe(false)
      expect(state.connectionError).toBeNull()
      expect(state.agents).toEqual([])
      expect(state.selectedAgent).toBeNull()
      expect(state.swarms).toEqual([])
      expect(state.activeSwarm).toBeNull()
      expect(state.teams).toEqual([])
      expect(state.activeTeam).toBeNull()
      expect(state.sessions).toEqual([])
      expect(state.activeSession).toBeNull()
      expect(state.sidebarCollapsed).toBe(false)
      expect(state.activePanel).toBe('editor')
      expect(state.loading).toBe(false)
    })
  })

  describe('connection actions', () => {
    it('should set connected state', () => {
      const { setConnected } = useAppStore.getState()
      setConnected(true)
      expect(useAppStore.getState().connected).toBe(true)
      expect(useAppStore.getState().connectionError).toBeNull()
    })

    it('should set connection error', () => {
      const { setConnectionError } = useAppStore.getState()
      setConnectionError('Connection failed')
      expect(useAppStore.getState().connectionError).toBe('Connection failed')
    })
  })

  describe('agent actions', () => {
    const mockAgent: Agent = {
      id: 'agent-1',
      name: 'Test Agent',
      type: 'coder',
      state: 'idle',
      capabilities: {
        loadSession: true,
        promptCapabilities: { image: false, audio: false, embeddedContext: false },
        mcp: { http: false, sse: false },
        pairProgramming: true,
        teamCollaboration: true,
      },
      createdAt: '2024-01-01T00:00:00Z',
      lastActive: '2024-01-01T00:00:00Z',
    }

    it('should set agents', () => {
      const { setAgents } = useAppStore.getState()
      setAgents([mockAgent])
      expect(useAppStore.getState().agents).toHaveLength(1)
      expect(useAppStore.getState().agents[0].id).toBe('agent-1')
    })

    it('should add an agent', () => {
      const { addAgent } = useAppStore.getState()
      addAgent(mockAgent)
      expect(useAppStore.getState().agents).toHaveLength(1)
      expect(useAppStore.getState().agents[0].id).toBe('agent-1')
    })

    it('should remove an agent', () => {
      const { setAgents, removeAgent } = useAppStore.getState()
      setAgents([mockAgent])
      removeAgent('agent-1')
      expect(useAppStore.getState().agents).toHaveLength(0)
    })

    it('should clear selectedAgent when removing that agent', () => {
      const { setAgents, selectAgent, removeAgent } = useAppStore.getState()
      setAgents([mockAgent])
      selectAgent(mockAgent)
      expect(useAppStore.getState().selectedAgent).not.toBeNull()
      removeAgent('agent-1')
      expect(useAppStore.getState().selectedAgent).toBeNull()
    })

    it('should update an agent', () => {
      const { setAgents, updateAgent } = useAppStore.getState()
      setAgents([mockAgent])
      updateAgent('agent-1', { name: 'Updated Agent' })
      expect(useAppStore.getState().agents[0].name).toBe('Updated Agent')
    })

    it('should update selectedAgent when updating that agent', () => {
      const { setAgents, selectAgent, updateAgent } = useAppStore.getState()
      setAgents([mockAgent])
      selectAgent(mockAgent)
      updateAgent('agent-1', { name: 'Updated Agent' })
      expect(useAppStore.getState().selectedAgent?.name).toBe('Updated Agent')
    })

    it('should select an agent', () => {
      const { selectAgent } = useAppStore.getState()
      selectAgent(mockAgent)
      expect(useAppStore.getState().selectedAgent).toEqual(mockAgent)
    })
  })

  describe('swarm actions', () => {
    const mockSwarm: Swarm = {
      id: 'swarm-1',
      name: 'Test Swarm',
      topology: 'star',
      strategy: 'parallel',
      state: 'active',
      agents: [],
      stats: {
        agentCount: 0,
        idleAgents: 0,
        executingAgents: 0,
        pendingTasks: 0,
        completedTasks: 0,
        topology: 'star',
        strategy: 'parallel',
        state: 'active',
      },
    }

    it('should set swarms', () => {
      const { setSwarms } = useAppStore.getState()
      setSwarms([mockSwarm])
      expect(useAppStore.getState().swarms).toHaveLength(1)
    })

    it('should add a swarm', () => {
      const { addSwarm } = useAppStore.getState()
      addSwarm(mockSwarm)
      expect(useAppStore.getState().swarms).toHaveLength(1)
    })

    it('should remove a swarm', () => {
      const { setSwarms, removeSwarm } = useAppStore.getState()
      setSwarms([mockSwarm])
      removeSwarm('swarm-1')
      expect(useAppStore.getState().swarms).toHaveLength(0)
    })

    it('should clear activeSwarm when removing that swarm', () => {
      const { setSwarms, setActiveSwarm, removeSwarm } = useAppStore.getState()
      setSwarms([mockSwarm])
      setActiveSwarm(mockSwarm)
      expect(useAppStore.getState().activeSwarm).not.toBeNull()
      removeSwarm('swarm-1')
      expect(useAppStore.getState().activeSwarm).toBeNull()
    })

    it('should set active swarm', () => {
      const { setActiveSwarm } = useAppStore.getState()
      setActiveSwarm(mockSwarm)
      expect(useAppStore.getState().activeSwarm).toEqual(mockSwarm)
    })
  })

  describe('team actions', () => {
    const mockTeam: Team = {
      id: 'team-1',
      name: 'Test Team',
      description: 'A test team',
      owner: 'user-1',
      members: [],
      agents: [],
      workspaces: [],
      stats: {
        memberCount: 0,
        onlineMembers: 0,
        agentCount: 0,
        idleAgents: 0,
        workspaceCount: 0,
      },
    }

    it('should set teams', () => {
      const { setTeams } = useAppStore.getState()
      setTeams([mockTeam])
      expect(useAppStore.getState().teams).toHaveLength(1)
    })

    it('should add a team', () => {
      const { addTeam } = useAppStore.getState()
      addTeam(mockTeam)
      expect(useAppStore.getState().teams).toHaveLength(1)
    })

    it('should remove a team', () => {
      const { setTeams, removeTeam } = useAppStore.getState()
      setTeams([mockTeam])
      removeTeam('team-1')
      expect(useAppStore.getState().teams).toHaveLength(0)
    })

    it('should clear activeTeam when removing that team', () => {
      const { setTeams, setActiveTeam, removeTeam } = useAppStore.getState()
      setTeams([mockTeam])
      setActiveTeam(mockTeam)
      expect(useAppStore.getState().activeTeam).not.toBeNull()
      removeTeam('team-1')
      expect(useAppStore.getState().activeTeam).toBeNull()
    })

    it('should set active team', () => {
      const { setActiveTeam } = useAppStore.getState()
      setActiveTeam(mockTeam)
      expect(useAppStore.getState().activeTeam).toEqual(mockTeam)
    })
  })

  describe('session actions', () => {
    const mockSession: Session = {
      id: 'session-1',
      mode: 'default',
      state: 'active',
      agents: [],
      messages: [],
      files: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    it('should set sessions', () => {
      const { setSessions } = useAppStore.getState()
      setSessions([mockSession])
      expect(useAppStore.getState().sessions).toHaveLength(1)
    })

    it('should set active session', () => {
      const { setActiveSession } = useAppStore.getState()
      setActiveSession(mockSession)
      expect(useAppStore.getState().activeSession).toEqual(mockSession)
    })
  })

  describe('UI actions', () => {
    it('should toggle sidebar', () => {
      const { toggleSidebar } = useAppStore.getState()
      expect(useAppStore.getState().sidebarCollapsed).toBe(false)
      toggleSidebar()
      expect(useAppStore.getState().sidebarCollapsed).toBe(true)
      toggleSidebar()
      expect(useAppStore.getState().sidebarCollapsed).toBe(false)
    })

    it('should set active panel', () => {
      const { setActivePanel } = useAppStore.getState()
      setActivePanel('swarm')
      expect(useAppStore.getState().activePanel).toBe('swarm')
      setActivePanel('team')
      expect(useAppStore.getState().activePanel).toBe('team')
      setActivePanel('settings')
      expect(useAppStore.getState().activePanel).toBe('settings')
    })

    it('should set loading state', () => {
      const { setLoading } = useAppStore.getState()
      setLoading(true)
      expect(useAppStore.getState().loading).toBe(true)
      setLoading(false)
      expect(useAppStore.getState().loading).toBe(false)
    })
  })

  describe('reset', () => {
    it('should reset all state to initial values', () => {
      const state = useAppStore.getState()

      // Modify state
      state.setConnected(true)
      state.setConnectionError('Error')
      state.addAgent({
        id: 'agent-1',
        name: 'Test',
        type: 'coder',
        state: 'idle',
        capabilities: {
          loadSession: true,
          promptCapabilities: { image: false, audio: false, embeddedContext: false },
          mcp: { http: false, sse: false },
          pairProgramming: false,
          teamCollaboration: false,
        },
        createdAt: '',
        lastActive: '',
      })
      state.toggleSidebar()
      state.setActivePanel('swarm')
      state.setLoading(true)

      // Reset
      state.reset()

      // Verify initial state
      const resetState = useAppStore.getState()
      expect(resetState.connected).toBe(false)
      expect(resetState.connectionError).toBeNull()
      expect(resetState.agents).toEqual([])
      expect(resetState.sidebarCollapsed).toBe(false)
      expect(resetState.activePanel).toBe('editor')
      expect(resetState.loading).toBe(false)
    })
  })

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      const { initialize } = useAppStore.getState()
      await initialize()
      expect(useAppStore.getState().connected).toBe(true)
      expect(useAppStore.getState().connecting).toBe(false)
      expect(useAppStore.getState().connectionError).toBeNull()
    })

    it('should handle error state correctly', () => {
      // Simulate what happens when error occurs
      const { setConnected, setConnectionError } = useAppStore.getState()
      setConnected(false)
      setConnectionError('Failed to connect')
      expect(useAppStore.getState().connected).toBe(false)
      expect(useAppStore.getState().connectionError).toBe('Failed to connect')
    })

    it('should clear error when connected', () => {
      const { setConnectionError, setConnected } = useAppStore.getState()
      setConnectionError('Some error')
      setConnected(true)
      expect(useAppStore.getState().connectionError).toBeNull()
    })
  })

  describe('edge cases', () => {
    it('should handle updating non-existent agent', () => {
      const { updateAgent } = useAppStore.getState()
      updateAgent('non-existent', { name: 'Updated' })
      expect(useAppStore.getState().agents).toHaveLength(0)
    })

    it('should handle removing non-existent agent', () => {
      const { removeAgent } = useAppStore.getState()
      removeAgent('non-existent')
      expect(useAppStore.getState().agents).toHaveLength(0)
    })

    it('should handle updating non-existent swarm', () => {
      const mockSwarm: Swarm = {
        id: 'swarm-1',
        name: 'Test Swarm',
        topology: 'star',
        strategy: 'parallel',
        state: 'active',
        agents: [],
        stats: {
          agentCount: 0,
          idleAgents: 0,
          executingAgents: 0,
          pendingTasks: 0,
          completedTasks: 0,
          topology: 'star',
          strategy: 'parallel',
          state: 'active',
        },
      }
      const { setSwarms, setActiveSwarm } = useAppStore.getState()
      setSwarms([mockSwarm])
      setActiveSwarm(mockSwarm)

      // Remove non-existent swarm
      const { removeSwarm } = useAppStore.getState()
      removeSwarm('non-existent')
      expect(useAppStore.getState().swarms).toHaveLength(1)
      expect(useAppStore.getState().activeSwarm).not.toBeNull()
    })

    it('should handle updating non-existent team', () => {
      const mockTeam: Team = {
        id: 'team-1',
        name: 'Test Team',
        description: 'A test team',
        owner: 'user-1',
        members: [],
        agents: [],
        workspaces: [],
        stats: {
          memberCount: 0,
          onlineMembers: 0,
          agentCount: 0,
          idleAgents: 0,
          workspaceCount: 0,
        },
      }
      const { setTeams, setActiveTeam } = useAppStore.getState()
      setTeams([mockTeam])
      setActiveTeam(mockTeam)

      // Remove non-existent team
      const { removeTeam } = useAppStore.getState()
      removeTeam('non-existent')
      expect(useAppStore.getState().teams).toHaveLength(1)
      expect(useAppStore.getState().activeTeam).not.toBeNull()
    })

    it('should handle deselecting agent', () => {
      const { selectAgent } = useAppStore.getState()
      selectAgent(null)
      expect(useAppStore.getState().selectedAgent).toBeNull()
    })

    it('should handle deselecting swarm', () => {
      const { setActiveSwarm } = useAppStore.getState()
      setActiveSwarm(null)
      expect(useAppStore.getState().activeSwarm).toBeNull()
    })

    it('should handle deselecting team', () => {
      const { setActiveTeam } = useAppStore.getState()
      setActiveTeam(null)
      expect(useAppStore.getState().activeTeam).toBeNull()
    })

    it('should handle deselecting session', () => {
      const { setActiveSession } = useAppStore.getState()
      setActiveSession(null)
      expect(useAppStore.getState().activeSession).toBeNull()
    })

    it('should add multiple agents', () => {
      const { addAgent } = useAppStore.getState()
      const agent1: Agent = {
        id: 'agent-1',
        name: 'Agent 1',
        type: 'coder',
        state: 'idle',
        capabilities: {
          loadSession: true,
          promptCapabilities: { image: false, audio: false, embeddedContext: false },
          mcp: { http: false, sse: false },
          pairProgramming: false,
          teamCollaboration: false,
        },
        createdAt: '',
        lastActive: '',
      }
      const agent2: Agent = {
        id: 'agent-2',
        name: 'Agent 2',
        type: 'reviewer',
        state: 'idle',
        capabilities: {
          loadSession: true,
          promptCapabilities: { image: false, audio: false, embeddedContext: false },
          mcp: { http: false, sse: false },
          pairProgramming: false,
          teamCollaboration: false,
        },
        createdAt: '',
        lastActive: '',
      }
      addAgent(agent1)
      addAgent(agent2)
      expect(useAppStore.getState().agents).toHaveLength(2)
    })

    it('should add multiple swarms', () => {
      const swarm1: Swarm = {
        id: 'swarm-1',
        name: 'Swarm 1',
        topology: 'star',
        strategy: 'parallel',
        state: 'active',
        agents: [],
        stats: {
          agentCount: 0,
          idleAgents: 0,
          executingAgents: 0,
          pendingTasks: 0,
          completedTasks: 0,
          topology: 'star',
          strategy: 'parallel',
          state: 'active',
        },
      }
      const swarm2: Swarm = {
        id: 'swarm-2',
        name: 'Swarm 2',
        topology: 'mesh',
        strategy: 'sequential',
        state: 'active',
        agents: [],
        stats: {
          agentCount: 0,
          idleAgents: 0,
          executingAgents: 0,
          pendingTasks: 0,
          completedTasks: 0,
          topology: 'mesh',
          strategy: 'sequential',
          state: 'active',
        },
      }
      const { addSwarm } = useAppStore.getState()
      addSwarm(swarm1)
      addSwarm(swarm2)
      expect(useAppStore.getState().swarms).toHaveLength(2)
    })

    it('should add multiple teams', () => {
      const team1: Team = {
        id: 'team-1',
        name: 'Team 1',
        description: 'First team',
        owner: 'user-1',
        members: [],
        agents: [],
        workspaces: [],
        stats: {
          memberCount: 0,
          onlineMembers: 0,
          agentCount: 0,
          idleAgents: 0,
          workspaceCount: 0,
        },
      }
      const team2: Team = {
        id: 'team-2',
        name: 'Team 2',
        description: 'Second team',
        owner: 'user-2',
        members: [],
        agents: [],
        workspaces: [],
        stats: {
          memberCount: 0,
          onlineMembers: 0,
          agentCount: 0,
          idleAgents: 0,
          workspaceCount: 0,
        },
      }
      const { addTeam } = useAppStore.getState()
      addTeam(team1)
      addTeam(team2)
      expect(useAppStore.getState().teams).toHaveLength(2)
    })

    it('should set multiple sessions', () => {
      const session1: Session = {
        id: 'session-1',
        mode: 'default',
        state: 'active',
        agents: [],
        messages: [],
        files: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }
      const session2: Session = {
        id: 'session-2',
        mode: 'planning',
        state: 'paused',
        agents: [],
        messages: [],
        files: [],
        createdAt: '2024-01-02T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      }
      const { setSessions } = useAppStore.getState()
      setSessions([session1, session2])
      expect(useAppStore.getState().sessions).toHaveLength(2)
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api } from './index'

// Mock IPC client
const mockInvoke = vi.fn()
const mockSubscribe = vi.fn()
const mockIsConnected = vi.fn()

vi.mock('./ipcClient', () => ({
  getIPCClient: () => ({
    invoke: mockInvoke,
    subscribe: mockSubscribe,
    isConnected: mockIsConnected,
  }),
  initializeIPCClient: vi.fn(),
  createIPCClient: vi.fn(),
  IPCError: class IPCError extends Error {},
  listen: vi.fn().mockResolvedValue(vi.fn()),
}))

describe('api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsConnected.mockReturnValue(true)
  })

  describe('agent', () => {
    it('getAgents calls WebSocket invoke', async () => {
      const mockAgents = [
        { id: 'agent-1', name: 'Test Agent', type: 'claude', state: 'idle' },
      ]
      mockInvoke.mockResolvedValueOnce(mockAgents)

      const result = await api.agent.getAgents()
      expect(mockInvoke).toHaveBeenCalledWith('get_agents')
      expect(result).toEqual(mockAgents)
    })

    it('startAgent calls WebSocket invoke', async () => {
      const mockAgent = { id: 'agent-1', name: 'Test', state: 'running' }
      mockInvoke.mockResolvedValueOnce(mockAgent)
      mockInvoke.mockResolvedValueOnce(mockAgent)

      await api.agent.startAgent('agent-1')
      expect(mockInvoke).toHaveBeenCalledWith('start_agent', { id: 'agent-1' })
    })

    it('stopAgent calls WebSocket invoke', async () => {
      const mockAgent = { id: 'agent-1', name: 'Test', state: 'stopped' }
      mockInvoke.mockResolvedValueOnce(mockAgent)
      mockInvoke.mockResolvedValueOnce(mockAgent)

      await api.agent.stopAgent('agent-1')
      expect(mockInvoke).toHaveBeenCalledWith('stop_agent', { id: 'agent-1' })
    })

    it('createSession calls WebSocket invoke', async () => {
      const mockSession = {
        id: 'session-1',
        agentId: 'agent-1',
        mode: 'default',
        messages: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }
      mockInvoke.mockResolvedValueOnce(mockSession)

      await api.agent.createSession('agent-1', 'default')
      expect(mockInvoke).toHaveBeenCalledWith('create_session', { agentId: 'agent-1', mode: 'default' })
    })
  })

  describe('swarm', () => {
    it('getSwarms calls WebSocket invoke', async () => {
      const mockSwarms = [
        {
          id: 'swarm-1',
          name: 'Test Swarm',
          topology: 'star',
          strategy: 'parallel',
          status: 'active',
          agentCount: 1,
          taskCount: 0,
        },
      ]
      mockInvoke.mockResolvedValueOnce(mockSwarms)

      await api.swarm.getSwarms()
      expect(mockInvoke).toHaveBeenCalledWith('get_swarms')
    })

    it('createSwarm calls WebSocket invoke', async () => {
      const mockSwarm = {
        id: 'swarm-1',
        name: 'Test Swarm',
        topology: 'star',
        strategy: 'parallel',
        status: 'created',
        agentCount: 1,
        taskCount: 0,
      }
      mockInvoke.mockResolvedValueOnce(mockSwarm)

      await api.swarm.createSwarm({
        name: 'Test Swarm',
        topology: 'star',
        strategy: 'parallel',
        agentIds: ['agent-1'],
      })
      expect(mockInvoke).toHaveBeenCalledWith('create_swarm', {
        name: 'Test Swarm',
        topology: 'star',
        strategy: 'parallel',
        agentIds: ['agent-1'],
      })
    })

    it('submitTask calls WebSocket invoke', async () => {
      const mockTask = {
        id: 'task-1',
        title: 'Test Task',
        description: 'Test',
        status: 'pending',
        priority: 1,
        createdAt: '2024-01-01T00:00:00Z',
      }
      mockInvoke.mockResolvedValueOnce(mockTask)

      await api.swarm.submitTask({
        swarmId: 'swarm-1',
        title: 'Test Task',
        description: 'Test',
      })
      expect(mockInvoke).toHaveBeenCalledWith('submit_task', {
        swarmId: 'swarm-1',
        title: 'Test Task',
        description: 'Test',
        priority: undefined,
      })
    })
  })

  describe('team', () => {
    it('getTeams calls WebSocket invoke', async () => {
      const mockTeams = [
        {
          id: 'team-1',
          name: 'Test Team',
          ownerId: 'user-1',
          members: [],
          agents: [],
          createdAt: '2024-01-01T00:00:00Z',
        },
      ]
      mockInvoke.mockResolvedValueOnce(mockTeams)

      await api.team.getTeams()
      expect(mockInvoke).toHaveBeenCalledWith('get_teams')
    })

    it('createTeam calls WebSocket invoke', async () => {
      const mockTeam = {
        id: 'team-1',
        name: 'Test Team',
        ownerId: 'user-1',
        members: [],
        agents: [],
        createdAt: '2024-01-01T00:00:00Z',
      }
      mockInvoke.mockResolvedValueOnce(mockTeam)

      await api.team.createTeam('Test Team', 'user-1')
      expect(mockInvoke).toHaveBeenCalledWith('create_team', { name: 'Test Team', ownerId: 'user-1' })
    })
  })

  describe('backend', () => {
    it('getStatus returns connection status', async () => {
      mockIsConnected.mockReturnValue(true)

      const result = await api.backend.getStatus()
      expect(result.connected).toBe(true)
      expect(result.backendType).toBe('unix-socket')
    })

    it('connect performs ping check', async () => {
      mockInvoke.mockResolvedValueOnce('pong')

      const result = await api.backend.connect()
      expect(result).toBe('connected')
    })

    it('disconnect is a no-op for Unix socket', async () => {
      const result = await api.backend.disconnect()
      expect(result).toBe('disconnected')
    })
  })
})

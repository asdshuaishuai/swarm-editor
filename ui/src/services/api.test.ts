import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mock setup ---

const mockInvoke = vi.fn()
const mockSubscribe = vi.fn()
const mockIsConnected = vi.fn()

vi.mock('./ipcClient', () => ({
  getIPCClient: () => ({
    invoke: mockInvoke,
    subscribe: mockSubscribe,
    isConnected: mockIsConnected,
  }),
  listen: vi.fn().mockResolvedValue(vi.fn()),
}))

// Mock scheduling and byzantine so their module-level state does not interfere
vi.mock('./scheduling', () => ({}))
vi.mock('./byzantine', () => ({}))

// Import AFTER mocks are registered
import {
  agentApi,
  swarmApi,
  teamApi,
  mcpApi,
  monitoringApi,
  fsApi,
  gitApi,
  gitDiffApi,
  gitBlameApi,
  worktreeApi,
  executeApi,
  backendApi,
  instructionsApi,
  workflowApi,
  workspaceApi,
  events,
  api,
} from './api'
import type {
  AgentInfo,
  SkillInfo,
  LogEntry,
  PendingPatch,
  FileEntry,
  ContentSearchResult,
  ReplaceResult,
  SwarmInfo,
  SwarmCreateRequest,
  SwarmTaskRequest,
  TaskInfo,
  TeamInfo,
  SessionInfo,
  MCPServerInfo,
  MCPToolInfo,
  EmergenceData,
  SupervisorStats,
  GitFileStatus,
  GitCommit,
  WorkflowInfo,
  WorkflowExecutionReport,
  CheckpointInfo,

  AuditEvent,
  AuditStats,
  ScheduleRunnerStatus,
  ConsensusInfo,
  SwarmTaskResult,
} from './api'

// ---------------------------------------------------------------------------
// Helper: reset all mocks before each test
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks()
  mockInvoke.mockResolvedValue(undefined)
  mockSubscribe.mockReturnValue(() => {})
  mockIsConnected.mockReturnValue(true)
})

// ===========================================================================
// agentApi
// ===========================================================================
describe('agentApi', () => {
  const sampleAgent: AgentInfo = {
    id: 'agent-1',
    name: 'TestAgent',
    type: 'cli',
    state: 'idle',
  }

  describe('getAgents', () => {
    it('invokes get_agents and returns agent list', async () => {
      const agents: AgentInfo[] = [sampleAgent]
      mockInvoke.mockResolvedValueOnce(agents)

      const result = await agentApi.getAgents()

      expect(mockInvoke).toHaveBeenCalledWith('get_agents')
      expect(result).toEqual(agents)
    })

    it('returns empty array when backend returns []', async () => {
      mockInvoke.mockResolvedValueOnce([])
      const result = await agentApi.getAgents()
      expect(result).toEqual([])
    })
  })

  describe('refreshAgents', () => {
    it('invokes refresh_agents', async () => {
      mockInvoke.mockResolvedValueOnce([sampleAgent])
      const result = await agentApi.refreshAgents()
      expect(mockInvoke).toHaveBeenCalledWith('refresh_agents')
      expect(result).toEqual([sampleAgent])
    })
  })

  describe('getAgent', () => {
    it('invokes get_agent with id', async () => {
      mockInvoke.mockResolvedValueOnce(sampleAgent)
      const result = await agentApi.getAgent('agent-1')
      expect(mockInvoke).toHaveBeenCalledWith('get_agent', { id: 'agent-1' })
      expect(result).toEqual(sampleAgent)
    })
  })

  describe('startAgent', () => {
    it('invokes start_agent then get_agent', async () => {
      mockInvoke.mockResolvedValueOnce(undefined) // start_agent
      mockInvoke.mockResolvedValueOnce({ ...sampleAgent, state: 'active' })

      const result = await agentApi.startAgent('agent-1')

      expect(mockInvoke).toHaveBeenNthCalledWith(1, 'start_agent', { id: 'agent-1' })
      expect(mockInvoke).toHaveBeenNthCalledWith(2, 'get_agent', { id: 'agent-1' })
      expect(result.state).toBe('active')
    })
  })

  describe('stopAgent', () => {
    it('invokes stop_agent then get_agent', async () => {
      mockInvoke.mockResolvedValueOnce(undefined)
      mockInvoke.mockResolvedValueOnce({ ...sampleAgent, state: 'stopped' })

      const result = await agentApi.stopAgent('agent-1')

      expect(mockInvoke).toHaveBeenNthCalledWith(1, 'stop_agent', { id: 'agent-1' })
      expect(mockInvoke).toHaveBeenNthCalledWith(2, 'get_agent', { id: 'agent-1' })
      expect(result.state).toBe('stopped')
    })
  })

  describe('addAgent', () => {
    it('invokes add_agent with config', async () => {
      const config = { id: 'new', name: 'New', command: 'echo', args: [] } as unknown as import('../types').AgentConfig
      mockInvoke.mockResolvedValueOnce({ id: 'new', name: 'New', type: 'cli', state: 'idle' })

      await agentApi.addAgent(config)

      expect(mockInvoke).toHaveBeenCalledWith('add_agent', { config })
    })
  })

  describe('updateAgent', () => {
    it('invokes update_agent with config', async () => {
      const config = { id: 'agent-1', name: 'Updated', command: 'echo', args: [] } as unknown as import('../types').AgentConfig
      mockInvoke.mockResolvedValueOnce(sampleAgent)

      await agentApi.updateAgent(config)

      expect(mockInvoke).toHaveBeenCalledWith('update_agent', { config })
    })
  })

  describe('deleteAgent', () => {
    it('invokes delete_agent with id', async () => {
      await agentApi.deleteAgent('agent-1')
      expect(mockInvoke).toHaveBeenCalledWith('delete_agent', { id: 'agent-1' })
    })
  })

  describe('createSession', () => {
    it('invokes create_session with agentId and mode', async () => {
      const session: SessionInfo = {
        id: 'sess-1',
        agentId: 'agent-1',
        mode: 'default',
        messages: [],
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      }
      mockInvoke.mockResolvedValueOnce(session)

      const result = await agentApi.createSession('agent-1', 'code')

      expect(mockInvoke).toHaveBeenCalledWith('create_session', { agentId: 'agent-1', mode: 'code' })
      expect(result.sessionId).toBe('sess-1')
      expect(result.agentName).toBe('')
    })

    it('uses default mode when mode not provided', async () => {
      mockInvoke.mockResolvedValueOnce({
        id: 'sess-2', agentId: 'a', mode: 'default', messages: [], createdAt: '', updatedAt: '',
      })

      await agentApi.createSession('a')

      expect(mockInvoke).toHaveBeenCalledWith('create_session', { agentId: 'a', mode: 'default' })
    })
  })

  describe('getSessions', () => {
    it('returns session list', async () => {
      const sessions: SessionInfo[] = [{
        id: 's1', agentId: 'a1', mode: 'default', messages: [], createdAt: '', updatedAt: '',
      }]
      mockInvoke.mockResolvedValueOnce(sessions)
      const result = await agentApi.getSessions()
      expect(result).toEqual(sessions)
    })
  })

  describe('sendMessage', () => {
    it('invokes send_message with correct params', async () => {
      const response = { sessionId: 's1', stopReason: 'end_turn', content: 'done' }
      mockInvoke.mockResolvedValueOnce(response)

      const result = await agentApi.sendMessage('s1', 'hello')

      expect(mockInvoke).toHaveBeenCalledWith('send_message', { sessionId: 's1', message: 'hello' })
      expect(result).toEqual(response)
    })
  })

  describe('closeSession', () => {
    it('invokes close_session', async () => {
      await agentApi.closeSession('s1')
      expect(mockInvoke).toHaveBeenCalledWith('close_session', { sessionId: 's1' })
    })
  })

  describe('scanSkills', () => {
    it('returns skill list', async () => {
      const skills: SkillInfo[] = [{ id: 'sk1', name: 'review', source: 'filesystem' }]
      mockInvoke.mockResolvedValueOnce(skills)
      const result = await agentApi.scanSkills()
      expect(result).toEqual(skills)
    })
  })

  describe('testAgent', () => {
    it('returns test result', async () => {
      const resp = { id: 'agent-1', status: 'ok' }
      mockInvoke.mockResolvedValueOnce(resp)
      const result = await agentApi.testAgent('agent-1')
      expect(result).toEqual(resp)
    })
  })

  describe('getConfigPath', () => {
    it('returns config path string', async () => {
      mockInvoke.mockResolvedValueOnce('/home/user/.swarm-editor')
      const result = await agentApi.getConfigPath()
      expect(result).toBe('/home/user/.swarm-editor')
    })
  })

  describe('getAgentLogs', () => {
    it('fetches logs with default count 100', async () => {
      const logs: LogEntry[] = [{ line: 'out', stream: 'stdout', timestamp: '' }]
      mockInvoke.mockResolvedValueOnce(logs)

      const result = await agentApi.getAgentLogs('agent-1')

      expect(mockInvoke).toHaveBeenCalledWith('get_agent_logs', { agentId: 'agent-1', count: 100 })
      expect(result).toEqual(logs)
    })

    it('fetches logs with custom count', async () => {
      mockInvoke.mockResolvedValueOnce([])
      await agentApi.getAgentLogs('agent-1', 50)
      expect(mockInvoke).toHaveBeenCalledWith('get_agent_logs', { agentId: 'agent-1', count: 50 })
    })
  })

  describe('stagePatch', () => {
    it('stages a patch and returns result', async () => {
      const resp = { id: 'p1', agentId: 'a1', path: '/foo.ts', createdAt: '' }
      mockInvoke.mockResolvedValueOnce(resp)

      const result = await agentApi.stagePatch('a1', '/foo.ts', 'old', 'new')

      expect(mockInvoke).toHaveBeenCalledWith('stage_patch', {
        agentId: 'a1', path: '/foo.ts', oldContent: 'old', newContent: 'new',
      })
      expect(result).toEqual(resp)
    })
  })

  describe('listPatches', () => {
    it('lists patches with empty agentId when not provided', async () => {
      mockInvoke.mockResolvedValueOnce([])
      await agentApi.listPatches()
      expect(mockInvoke).toHaveBeenCalledWith('list_patches', { agentId: '' })
    })

    it('lists patches for specific agent', async () => {
      const patches: PendingPatch[] = [{
        id: 'p1', agentId: 'a1', path: '/f.ts', oldContent: '', newContent: '', createdAt: '',
      }]
      mockInvoke.mockResolvedValueOnce(patches)
      const result = await agentApi.listPatches('a1')
      expect(mockInvoke).toHaveBeenCalledWith('list_patches', { agentId: 'a1' })
      expect(result).toEqual(patches)
    })
  })

  describe('commitPatch', () => {
    it('commits a patch', async () => {
      mockInvoke.mockResolvedValueOnce({ id: 'p1', status: 'committed' })
      const result = await agentApi.commitPatch('p1')
      expect(result).toEqual({ id: 'p1', status: 'committed' })
    })
  })

  describe('rejectPatch', () => {
    it('rejects a patch', async () => {
      mockInvoke.mockResolvedValueOnce({ id: 'p1', status: 'rejected' })
      const result = await agentApi.rejectPatch('p1')
      expect(result).toEqual({ id: 'p1', status: 'rejected' })
    })
  })

  describe('error handling', () => {
    it('propagates error when invoke rejects', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('WS error'))
      await expect(agentApi.getAgents()).rejects.toThrow('WS error')
    })
  })
})

// ===========================================================================
// swarmApi
// ===========================================================================
describe('swarmApi', () => {
  const baseSwarm: SwarmInfo = {
    id: 'sw1',
    name: 'TestSwarm',
    topology: 'mesh',
    strategy: 'round_robin',
    status: 'active',
    agentCount: 2,
    taskCount: 3,
  }

  describe('getSwarms', () => {
    it('returns swarms with state and default stats populated', async () => {
      mockInvoke.mockResolvedValueOnce([baseSwarm])

      const result = await swarmApi.getSwarms()

      expect(mockInvoke).toHaveBeenCalledWith('get_swarms')
      expect(result[0].state).toBe('active')
      expect(result[0].agents).toEqual([])
      expect(result[0].stats).toBeDefined()
      expect(result[0].stats!.pendingTasks).toBe(3)
      expect(result[0].stats!.agentCount).toBe(2)
    })

    it('uses existing stats when present', async () => {
      const withStats = {
        ...baseSwarm,
        stats: {
          agentCount: 2, idleAgents: 1, executingAgents: 1, pendingTasks: 2,
          completedTasks: 5, topology: 'mesh', strategy: 'round_robin', state: 'active',
        },
      }
      mockInvoke.mockResolvedValueOnce([withStats])

      const result = await swarmApi.getSwarms()
      expect(result[0].stats!.completedTasks).toBe(5)
    })
  })

  describe('getSwarm', () => {
    it('returns single swarm with enriched data', async () => {
      mockInvoke.mockResolvedValueOnce(baseSwarm)
      const result = await swarmApi.getSwarm('sw1')
      expect(mockInvoke).toHaveBeenCalledWith('get_swarm', { id: 'sw1' })
      expect(result.state).toBe('active')
      expect(result.agents).toEqual([])
    })
  })

  describe('createSwarm', () => {
    it('creates a swarm and enriches response', async () => {
      const request: SwarmCreateRequest = {
        name: 'NewSwarm', topology: 'star', strategy: 'priority', agentIds: ['a1', 'a2'],
      }
      mockInvoke.mockResolvedValueOnce({ ...baseSwarm, id: 'sw2', name: 'NewSwarm' })

      const result = await swarmApi.createSwarm(request)

      expect(mockInvoke).toHaveBeenCalledWith('create_swarm', request)
      expect(result.agents).toEqual(['a1', 'a2'])
      expect(result.stats!.agentCount).toBe(2)
      expect(result.stats!.idleAgents).toBe(2)
    })
  })

  describe('startSwarm', () => {
    it('starts swarm then fetches updated state', async () => {
      mockInvoke.mockResolvedValueOnce(undefined) // start_swarm
      mockInvoke.mockResolvedValueOnce({ ...baseSwarm, status: 'running' })

      const result = await swarmApi.startSwarm('sw1')

      expect(mockInvoke).toHaveBeenNthCalledWith(1, 'start_swarm', { id: 'sw1' })
      expect(mockInvoke).toHaveBeenNthCalledWith(2, 'get_swarm', { id: 'sw1' })
      expect(result.state).toBe('running')
    })
  })

  describe('stopSwarm', () => {
    it('stops swarm then fetches updated state', async () => {
      mockInvoke.mockResolvedValueOnce(undefined)
      mockInvoke.mockResolvedValueOnce({ ...baseSwarm, status: 'stopped' })

      const result = await swarmApi.stopSwarm('sw1')
      expect(result.state).toBe('stopped')
    })
  })

  describe('deleteSwarm', () => {
    it('invokes delete_swarm', async () => {
      await swarmApi.deleteSwarm('sw1')
      expect(mockInvoke).toHaveBeenCalledWith('delete_swarm', { id: 'sw1' })
    })
  })

  describe('submitTask', () => {
    it('submits task and returns task id', async () => {
      const task: TaskInfo = {
        id: 'task-1', title: 'Do stuff', description: '', status: 'pending',
        priority: 'high', createdAt: '',
      }
      mockInvoke.mockResolvedValueOnce(task)

      const request: SwarmTaskRequest = {
        swarmId: 'sw1', title: 'Do stuff', priority: 'high',
        constraints: ['c1'], acceptance: ['a1'], riskTolerance: 'low',
      }
      const result = await swarmApi.submitTask(request)

      expect(mockInvoke).toHaveBeenCalledWith('submit_task', {
        swarmId: 'sw1', title: 'Do stuff', description: undefined,
        priority: 'high', constraints: ['c1'], acceptance: ['a1'], riskTolerance: 'low',
      })
      expect(result).toBe('task-1')
    })
  })

  describe('executeTask', () => {
    it('executes task and returns result', async () => {
      const taskResult: SwarmTaskResult = {
        taskId: 't1', status: 'completed', agentResults: {},
      }
      mockInvoke.mockResolvedValueOnce(taskResult)

      const result = await swarmApi.executeTask('sw1', 't1')

      expect(mockInvoke).toHaveBeenCalledWith('execute_task', { swarmId: 'sw1', taskId: 't1' })
      expect(result).toEqual(taskResult)
    })
  })

  describe('getSwarmTasks', () => {
    it('returns task list', async () => {
      mockInvoke.mockResolvedValueOnce([])
      await swarmApi.getSwarmTasks('sw1')
      expect(mockInvoke).toHaveBeenCalledWith('get_swarm_tasks', { swarmId: 'sw1' })
    })
  })

  describe('cancelTask', () => {
    it('cancels task with reason', async () => {
      mockInvoke.mockResolvedValueOnce({ taskId: 't1', status: 'cancelled' })
      const result = await swarmApi.cancelTask('sw1', 't1', 'duplicate')
      expect(result).toEqual({ taskId: 't1', status: 'cancelled' })
    })

    it('cancels task without reason', async () => {
      mockInvoke.mockResolvedValueOnce({ taskId: 't1', status: 'cancelled' })
      await swarmApi.cancelTask('sw1', 't1')
      expect(mockInvoke).toHaveBeenCalledWith('cancel_task', { swarmId: 'sw1', taskId: 't1', reason: undefined })
    })
  })

  describe('assignTask', () => {
    it('assigns task to agent', async () => {
      mockInvoke.mockResolvedValueOnce({ taskId: 't1', agentId: 'a1', status: 'assigned' })
      const result = await swarmApi.assignTask('sw1', 't1', 'a1')
      expect(result.status).toBe('assigned')
    })
  })

  describe('getConsensus', () => {
    it('fetches consensus with swarmId', async () => {
      const resp = { consensus: [] as ConsensusInfo[], algorithm: 'pbft', threshold: 0.66 }
      mockInvoke.mockResolvedValueOnce(resp)
      const result = await swarmApi.getConsensus('sw1')
      expect(result.algorithm).toBe('pbft')
    })

    it('fetches consensus without swarmId', async () => {
      mockInvoke.mockResolvedValueOnce({ consensus: [], algorithm: 'simple', threshold: 0.5 })
      await swarmApi.getConsensus()
      expect(mockInvoke).toHaveBeenCalledWith('get_consensus', { swarmId: undefined })
    })
  })

  describe('resolveHandoff', () => {
    it('resolves handoff', async () => {
      mockInvoke.mockResolvedValueOnce({ requestId: 'r1', accepted: true, status: 'resolved' })
      const result = await swarmApi.resolveHandoff('r1', true, 'looks good', 'sw1')
      expect(result.accepted).toBe(true)
    })
  })

  describe('getQueenStatus', () => {
    it('returns queen status', async () => {
      const queen = {
        swarmId: 'sw1', queenId: 'q1', backupId: 'b1', state: 'active',
        round: 3, electedAt: '', abdication: '',
      }
      mockInvoke.mockResolvedValueOnce(queen)
      const result = await swarmApi.getQueenStatus('sw1')
      expect(result.queenId).toBe('q1')
    })
  })

  describe('triggerElection', () => {
    it('triggers election', async () => {
      mockInvoke.mockResolvedValueOnce({ swarmId: 'sw1', queenId: 'q2', round: 4 })
      const result = await swarmApi.triggerElection('sw1')
      expect(result.round).toBe(4)
    })
  })

  describe('abdicateQueen', () => {
    it('abdicates queen', async () => {
      mockInvoke.mockResolvedValueOnce({ swarmId: 'sw1', success: true })
      const result = await swarmApi.abdicateQueen('sw1', 'health')
      expect(result.success).toBe(true)
    })
  })

  describe('interruptAgent', () => {
    it('interrupts agent', async () => {
      mockInvoke.mockResolvedValueOnce({ checkpointId: 'cp1', success: true })
      const result = await swarmApi.interruptAgent('sw1', 'a1', 't1', 'stuck')
      expect(result.checkpointId).toBe('cp1')
    })
  })

  describe('resumeTask', () => {
    it('resumes task with optional agentId', async () => {
      mockInvoke.mockResolvedValueOnce({ checkpointId: 'cp1', success: true })
      const result = await swarmApi.resumeTask('cp1', 'a2')
      expect(result.success).toBe(true)
    })

    it('resumes task without agentId', async () => {
      mockInvoke.mockResolvedValueOnce({ checkpointId: 'cp1', success: true })
      await swarmApi.resumeTask('cp1')
      expect(mockInvoke).toHaveBeenCalledWith('resume_task', { checkpointId: 'cp1', agentId: undefined })
    })
  })

  describe('getCheckpoints', () => {
    it('returns checkpoint list', async () => {
      mockInvoke.mockResolvedValueOnce([])
      await swarmApi.getCheckpoints('sw1')
      expect(mockInvoke).toHaveBeenCalledWith('get_checkpoints', { swarmId: 'sw1' })
    })
  })

  describe('recoverTask', () => {
    it('recovers task with strategy', async () => {
      mockInvoke.mockResolvedValueOnce({ checkpointId: 'cp1', success: true })
      const result = await swarmApi.recoverTask('cp1', 'retry')
      expect(result.success).toBe(true)
    })
  })

  describe('getRoleAssignments', () => {
    it('returns role assignments', async () => {
      mockInvoke.mockResolvedValueOnce([])
      await swarmApi.getRoleAssignments('sw1')
      expect(mockInvoke).toHaveBeenCalledWith('get_role_assignments', { swarmId: 'sw1' })
    })
  })
})

// ===========================================================================
// teamApi
// ===========================================================================
describe('teamApi', () => {
  describe('getTeams', () => {
    it('returns team list', async () => {
      const teams: TeamInfo[] = [{
        id: 't1', name: 'Alpha', ownerId: 'u1', members: [], agents: [], createdAt: '',
      }]
      mockInvoke.mockResolvedValueOnce(teams)
      const result = await teamApi.getTeams()
      expect(result).toEqual(teams)
    })
  })

  describe('createTeam', () => {
    it('creates a team', async () => {
      const team: TeamInfo = {
        id: 't2', name: 'Beta', ownerId: 'u1', members: [], agents: [], createdAt: '',
      }
      mockInvoke.mockResolvedValueOnce(team)

      const result = await teamApi.createTeam('Beta', 'u1')

      expect(mockInvoke).toHaveBeenCalledWith('create_team', { name: 'Beta', ownerId: 'u1' })
      expect(result.id).toBe('t2')
    })
  })

  describe('addAgentToTeam', () => {
    it('adds agent to team', async () => {
      mockInvoke.mockResolvedValueOnce({ status: 'ok' })
      const result = await teamApi.addAgentToTeam('t1', 'a1')
      expect(mockInvoke).toHaveBeenCalledWith('add_agent_to_team', { teamId: 't1', agentId: 'a1' })
      expect(result).toEqual({ status: 'ok' })
    })
  })

  describe('deleteTeam', () => {
    it('deletes a team', async () => {
      await teamApi.deleteTeam('t1')
      expect(mockInvoke).toHaveBeenCalledWith('delete_team', { teamId: 't1' })
    })
  })

  describe('removeAgentFromTeam', () => {
    it('removes agent from team', async () => {
      await teamApi.removeAgentFromTeam('t1', 'a1')
      expect(mockInvoke).toHaveBeenCalledWith('remove_agent_from_team', { teamId: 't1', agentId: 'a1' })
    })
  })
})

// ===========================================================================
// mcpApi
// ===========================================================================
describe('mcpApi', () => {
  const baseServer: MCPServerInfo = {
    id: 'mcp1', name: 'TestMCP', status: 'connected',
  }

  describe('getServers', () => {
    it('returns servers with resources and status cast', async () => {
      mockInvoke.mockResolvedValueOnce([baseServer])

      const result = await mcpApi.getServers()

      expect(mockInvoke).toHaveBeenCalledWith('get_mcp_servers')
      expect(result[0]).toMatchObject({ id: 'mcp1', resources: [] })
    })

    it('returns empty array when backend returns []', async () => {
      mockInvoke.mockResolvedValueOnce([])
      const result = await mcpApi.getServers()
      expect(result).toEqual([])
    })
  })

  describe('startServer', () => {
    it('starts server and returns updated server', async () => {
      // invoke for start_mcp_server
      mockInvoke.mockResolvedValueOnce(undefined)
      // invoke for getServers -> get_mcp_servers
      mockInvoke.mockResolvedValueOnce([{ ...baseServer, status: 'connected' }])

      const result = await mcpApi.startServer('mcp1')

      expect(mockInvoke).toHaveBeenNthCalledWith(1, 'start_mcp_server', { serverId: 'mcp1' })
      expect(result.id).toBe('mcp1')
    })

    it('throws when server not found after start', async () => {
      mockInvoke.mockResolvedValueOnce(undefined)
      mockInvoke.mockResolvedValueOnce([{ id: 'other', name: 'Other', status: 'connected' }])

      await expect(mcpApi.startServer('mcp1')).rejects.toThrow('Server not found: mcp1')
    })
  })

  describe('stopServer', () => {
    it('stops server and returns updated server', async () => {
      mockInvoke.mockResolvedValueOnce(undefined)
      mockInvoke.mockResolvedValueOnce([{ ...baseServer, status: 'disconnected' }])

      const result = await mcpApi.stopServer('mcp1')
      expect(result.status).toBe('disconnected')
    })

    it('throws when server not found after stop', async () => {
      mockInvoke.mockResolvedValueOnce(undefined)
      mockInvoke.mockResolvedValueOnce([])

      await expect(mcpApi.stopServer('mcp1')).rejects.toThrow('Server not found: mcp1')
    })
  })

  describe('callTool', () => {
    it('calls tool with args', async () => {
      mockInvoke.mockResolvedValueOnce({ result: 'ok' })
      const result = await mcpApi.callTool('mcp1', 'read', { path: '/a' })
      expect(mockInvoke).toHaveBeenCalledWith('call_mcp_tool', {
        serverId: 'mcp1', toolName: 'read', arguments: { path: '/a' },
      })
      expect(result).toEqual({ result: 'ok' })
    })
  })

  describe('addServer', () => {
    it('adds server with config', async () => {
      mockInvoke.mockResolvedValueOnce(baseServer)
      const result = await mcpApi.addServer({ name: 'Test', command: 'npx foo', args: ['--port', '3000'] })
      expect(result.id).toBe('mcp1')
    })
  })

  describe('removeServer', () => {
    it('removes server', async () => {
      await mcpApi.removeServer('mcp1')
      expect(mockInvoke).toHaveBeenCalledWith('remove_mcp_server', { serverId: 'mcp1' })
    })
  })

  describe('scanServers', () => {
    it('returns scanned servers', async () => {
      mockInvoke.mockResolvedValueOnce([baseServer])
      const result = await mcpApi.scanServers()
      expect(mockInvoke).toHaveBeenCalledWith('scan_mcp_servers')
      expect(result).toEqual([baseServer])
    })
  })

  describe('listTools', () => {
    it('returns tool list', async () => {
      const tools: MCPToolInfo[] = [{ name: 'read', description: 'Read file' }]
      mockInvoke.mockResolvedValueOnce(tools)
      const result = await mcpApi.listTools('mcp1')
      expect(result).toEqual(tools)
    })
  })
})

// ===========================================================================
// monitoringApi
// ===========================================================================
describe('monitoringApi', () => {
  describe('getSupervisorStats', () => {
    it('returns supervisor stats', async () => {
      const stats: SupervisorStats = {
        totalAgents: 5, healthyAgents: 4, degradedAgents: 1, unhealthyAgents: 0,
        busyAgents: 2, avgResponseTime: 120, throughput: 50,
      }
      mockInvoke.mockResolvedValueOnce(stats)
      const result = await monitoringApi.getSupervisorStats()
      expect(result).toEqual(stats)
    })
  })

  describe('getEmergenceData', () => {
    it('returns emergence data', async () => {
      const data: EmergenceData = {
        health: {
          overallScore: 0.9, congestionLevel: 0.1, collaborationIndex: 0.8,
          innovationRate: 0.3, agentUtilization: 0.7,
        },
        signals: [], agents: [], flows: [],
      }
      mockInvoke.mockResolvedValueOnce(data)
      const result = await monitoringApi.getEmergenceData()
      expect(result.health.overallScore).toBe(0.9)
    })
  })

  describe('listAuditEvents', () => {
    it('lists events with filter', async () => {
      const events: AuditEvent[] = [{
        id: 'e1', timestamp: '', eventType: 'task', actor: 'a1', action: 'create',
        resourceType: 'task', resourceId: 't1', success: true,
      }]
      mockInvoke.mockResolvedValueOnce(events)

      const result = await monitoringApi.listAuditEvents({ eventType: 'task', limit: 10 })

      expect(mockInvoke).toHaveBeenCalledWith('list_audit_events', { eventType: 'task', limit: 10 })
      expect(result).toEqual(events)
    })

    it('lists events without filter', async () => {
      mockInvoke.mockResolvedValueOnce([])
      await monitoringApi.listAuditEvents()
      expect(mockInvoke).toHaveBeenCalledWith('list_audit_events', {})
    })
  })

  describe('getAuditStats', () => {
    it('returns audit stats', async () => {
      const stats: AuditStats = { count: 42, enabled: true }
      mockInvoke.mockResolvedValueOnce(stats)
      const result = await monitoringApi.getAuditStats()
      expect(result.count).toBe(42)
    })
  })

  describe('clearAuditLog', () => {
    it('clears audit log', async () => {
      await monitoringApi.clearAuditLog()
      expect(mockInvoke).toHaveBeenCalledWith('clear_audit_log', { confirm: true })
    })
  })

  describe('getScheduleRunnerStatus', () => {
    it('returns schedule runner status', async () => {
      const status: ScheduleRunnerStatus = { running: true, scheduleCount: 3 }
      mockInvoke.mockResolvedValueOnce(status)
      const result = await monitoringApi.getScheduleRunnerStatus()
      expect(result.running).toBe(true)
    })
  })

  describe('startScheduleRunner', () => {
    it('returns updated status', async () => {
      mockInvoke.mockResolvedValueOnce({ running: true, scheduleCount: 0 })
      const result = await monitoringApi.startScheduleRunner()
      expect(result.running).toBe(true)
    })
  })

  describe('stopScheduleRunner', () => {
    it('returns updated status', async () => {
      mockInvoke.mockResolvedValueOnce({ running: false, scheduleCount: 0 })
      const result = await monitoringApi.stopScheduleRunner()
      expect(result.running).toBe(false)
    })
  })
})

// ===========================================================================
// fsApi
// ===========================================================================
describe('fsApi', () => {
  describe('listDir', () => {
    it('lists directory contents', async () => {
      const entries: FileEntry[] = [{ name: 'a.ts', path: '/a.ts', isDirectory: false }]
      mockInvoke.mockResolvedValueOnce(entries)
      const result = await fsApi.listDir('/src')
      expect(mockInvoke).toHaveBeenCalledWith('list_dir', { path: '/src' })
      expect(result).toEqual(entries)
    })
  })

  describe('readFile', () => {
    it('reads file and returns content string', async () => {
      mockInvoke.mockResolvedValueOnce({ content: 'hello world' })
      const result = await fsApi.readFile('/src/a.ts')
      expect(mockInvoke).toHaveBeenCalledWith('read_file', { path: '/src/a.ts' })
      expect(result).toBe('hello world')
    })
  })

  describe('writeFile', () => {
    it('writes content to file', async () => {
      await fsApi.writeFile('/src/a.ts', 'content')
      expect(mockInvoke).toHaveBeenCalledWith('write_file', { path: '/src/a.ts', content: 'content' })
    })
  })

  describe('searchFiles', () => {
    it('searches files with default limit 50', async () => {
      const files: FileEntry[] = [{ name: 'b.ts', path: '/b.ts', isDirectory: false }]
      mockInvoke.mockResolvedValueOnce({ files })

      const result = await fsApi.searchFiles('b.ts')

      expect(mockInvoke).toHaveBeenCalledWith('search_files', { query: 'b.ts', limit: 50 })
      expect(result).toEqual(files)
    })

    it('searches files with custom limit', async () => {
      mockInvoke.mockResolvedValueOnce({ files: [] })
      await fsApi.searchFiles('query', 20)
      expect(mockInvoke).toHaveBeenCalledWith('search_files', { query: 'query', limit: 20 })
    })
  })

  describe('searchContent', () => {
    it('searches content with all options', async () => {
      const results: ContentSearchResult[] = [
        { path: '/a.ts', line: 1, column: 0, content: 'foo' },
      ]
      mockInvoke.mockResolvedValueOnce({ results })

      const result = await fsApi.searchContent('foo', true, 50, {
        wholeWord: true, regex: false, includeFiles: ['*.ts'], excludeFiles: ['*.d.ts'], folder: '/src',
      })

      expect(mockInvoke).toHaveBeenCalledWith('search_content', {
        query: 'foo', caseSensitive: true, wholeWord: true, regex: false, limit: 50,
        includeFiles: ['*.ts'], excludeFiles: ['*.d.ts'], folder: '/src',
      })
      expect(result).toEqual(results)
    })

    it('uses default values for optional params', async () => {
      mockInvoke.mockResolvedValueOnce({ results: [] })
      await fsApi.searchContent('bar')
      expect(mockInvoke).toHaveBeenCalledWith('search_content', {
        query: 'bar', caseSensitive: false, wholeWord: false, regex: false, limit: 100,
        includeFiles: [], excludeFiles: [], folder: '',
      })
    })
  })

  describe('replaceContent', () => {
    it('replaces content with all options', async () => {
      const expected: { results: ReplaceResult[]; changedFiles: number; dryRun: boolean } = {
        results: [], changedFiles: 3, dryRun: true,
      }
      mockInvoke.mockResolvedValueOnce(expected)

      const result = await fsApi.replaceContent('old', 'new', {
        caseSensitive: true, wholeWord: true, regex: false, dryRun: true,
        files: ['a.ts'], preserveCase: true,
      })

      expect(mockInvoke).toHaveBeenCalledWith('replace_content', {
        query: 'old', replacement: 'new', caseSensitive: true, wholeWord: true,
        regex: false, dryRun: true, files: ['a.ts'], preserveCase: true,
      })
      expect(result.changedFiles).toBe(3)
    })

    it('uses default values', async () => {
      mockInvoke.mockResolvedValueOnce({ results: [], changedFiles: 0, dryRun: false })
      await fsApi.replaceContent('x', 'y')
      expect(mockInvoke).toHaveBeenCalledWith('replace_content', {
        query: 'x', replacement: 'y', caseSensitive: false, wholeWord: false,
        regex: false, dryRun: false, files: [], preserveCase: false,
      })
    })
  })

  describe('getWorkspace', () => {
    it('returns workspace path', async () => {
      mockInvoke.mockResolvedValueOnce({ path: '/home/user/project' })
      const result = await fsApi.getWorkspace()
      expect(result).toBe('/home/user/project')
    })
  })

  describe('setWorkspace', () => {
    it('sets workspace path', async () => {
      await fsApi.setWorkspace('/new/path')
      expect(mockInvoke).toHaveBeenCalledWith('set_workspace', { path: '/new/path' })
    })
  })

  describe('deleteFile', () => {
    it('deletes a file', async () => {
      await fsApi.deleteFile('/old.ts')
      expect(mockInvoke).toHaveBeenCalledWith('delete_file', { path: '/old.ts' })
    })
  })

  describe('renameFile', () => {
    it('renames a file', async () => {
      await fsApi.renameFile('/old.ts', '/new.ts')
      expect(mockInvoke).toHaveBeenCalledWith('rename_file', { oldPath: '/old.ts', newPath: '/new.ts' })
    })
  })

  describe('createFile', () => {
    it('creates a file', async () => {
      await fsApi.createFile('/new.ts')
      expect(mockInvoke).toHaveBeenCalledWith('create_file', { path: '/new.ts' })
    })
  })

  describe('mkdir', () => {
    it('creates a directory', async () => {
      await fsApi.mkdir('/new/dir')
      expect(mockInvoke).toHaveBeenCalledWith('mkdir', { path: '/new/dir' })
    })
  })

  describe('copyFile', () => {
    it('copies a file', async () => {
      await fsApi.copyFile('/src.ts', '/dst.ts')
      expect(mockInvoke).toHaveBeenCalledWith('copy_file', { srcPath: '/src.ts', dstPath: '/dst.ts' })
    })
  })

  describe('revealFile', () => {
    it('reveals file in OS file manager', async () => {
      await fsApi.revealFile('/src/a.ts')
      expect(mockInvoke).toHaveBeenCalledWith('reveal_file', { path: '/src/a.ts' })
    })
  })
})

// ===========================================================================
// gitApi
// ===========================================================================
describe('gitApi', () => {
  const fileStatus: GitFileStatus = { path: 'a.ts', status: 'M', staged: false }

  describe('getStatus', () => {
    it('returns file status list', async () => {
      mockInvoke.mockResolvedValueOnce({ files: [fileStatus] })
      const result = await gitApi.getStatus()
      expect(mockInvoke).toHaveBeenCalledWith('git_status')
      expect(result).toEqual([fileStatus])
    })

    it('returns empty array when files is null', async () => {
      mockInvoke.mockResolvedValueOnce({})
      const result = await gitApi.getStatus()
      expect(result).toEqual([])
    })
  })

  describe('stage', () => {
    it('stages specific path', async () => {
      mockInvoke.mockResolvedValueOnce({ files: [{ ...fileStatus, staged: true }] })
      const result = await gitApi.stage('a.ts')
      expect(mockInvoke).toHaveBeenCalledWith('git_stage', { path: 'a.ts' })
      expect(result[0].staged).toBe(true)
    })

    it('stages all when no path given', async () => {
      mockInvoke.mockResolvedValueOnce({ files: [] })
      await gitApi.stage()
      expect(mockInvoke).toHaveBeenCalledWith('git_stage', { path: '' })
    })
  })

  describe('unstage', () => {
    it('unstages path', async () => {
      mockInvoke.mockResolvedValueOnce({ files: [] })
      await gitApi.unstage('a.ts')
      expect(mockInvoke).toHaveBeenCalledWith('git_unstage', { path: 'a.ts' })
    })
  })

  describe('commit', () => {
    it('commits with message', async () => {
      mockInvoke.mockResolvedValueOnce({ hash: 'abc123', message: 'init' })
      const result = await gitApi.commit('init')
      expect(result.hash).toBe('abc123')
    })
  })

  describe('discard', () => {
    it('discards changes to path', async () => {
      mockInvoke.mockResolvedValueOnce({ files: [] })
      await gitApi.discard('a.ts')
      expect(mockInvoke).toHaveBeenCalledWith('git_discard', { path: 'a.ts' })
    })
  })

  describe('log', () => {
    it('returns commit log with defaults', async () => {
      const commits: GitCommit[] = [{ hash: 'h1', message: 'first', author: 'me', date: '' }]
      mockInvoke.mockResolvedValueOnce({ commits })

      const result = await gitApi.log()

      expect(mockInvoke).toHaveBeenCalledWith('git_log', { path: '', limit: 20 })
      expect(result).toEqual(commits)
    })

    it('passes path and limit', async () => {
      mockInvoke.mockResolvedValueOnce({ commits: [] })
      await gitApi.log('a.ts', 5)
      expect(mockInvoke).toHaveBeenCalledWith('git_log', { path: 'a.ts', limit: 5 })
    })

    it('returns empty array when commits is null', async () => {
      mockInvoke.mockResolvedValueOnce({})
      const result = await gitApi.log()
      expect(result).toEqual([])
    })
  })

  describe('getBranch', () => {
    it('returns current branch', async () => {
      mockInvoke.mockResolvedValueOnce({ branch: 'main' })
      const result = await gitApi.getBranch()
      expect(result).toBe('main')
    })

    it('returns empty string when branch is null', async () => {
      mockInvoke.mockResolvedValueOnce({})
      const result = await gitApi.getBranch()
      expect(result).toBe('')
    })
  })

  describe('listBranches', () => {
    it('returns branches', async () => {
      const branches = [{ name: 'main', current: true }]
      mockInvoke.mockResolvedValueOnce({ branches })
      const result = await gitApi.listBranches()
      expect(result).toEqual(branches)
    })

    it('returns empty when branches is null', async () => {
      mockInvoke.mockResolvedValueOnce({})
      const result = await gitApi.listBranches()
      expect(result).toEqual([])
    })
  })

  describe('createBranch', () => {
    it('creates branch with checkout default true', async () => {
      mockInvoke.mockResolvedValueOnce({ branch: 'feature' })
      const result = await gitApi.createBranch('feature')
      expect(mockInvoke).toHaveBeenCalledWith('git_branch_create', { name: 'feature', checkout: true })
      expect(result.branch).toBe('feature')
    })

    it('creates branch without checkout', async () => {
      mockInvoke.mockResolvedValueOnce({ branch: 'feature' })
      await gitApi.createBranch('feature', false)
      expect(mockInvoke).toHaveBeenCalledWith('git_branch_create', { name: 'feature', checkout: false })
    })
  })

  describe('checkoutBranch', () => {
    it('checks out branch', async () => {
      mockInvoke.mockResolvedValueOnce({ branch: 'main' })
      const result = await gitApi.checkoutBranch('main')
      expect(result.branch).toBe('main')
    })
  })

  describe('push', () => {
    it('pushes with defaults', async () => {
      mockInvoke.mockResolvedValueOnce({ output: 'ok' })
      await gitApi.push()
      expect(mockInvoke).toHaveBeenCalledWith('git_push', { remote: 'origin', branch: '', force: false })
    })

    it('pushes with all params', async () => {
      mockInvoke.mockResolvedValueOnce({ output: 'ok' })
      await gitApi.push('upstream', 'main', true)
      expect(mockInvoke).toHaveBeenCalledWith('git_push', { remote: 'upstream', branch: 'main', force: true })
    })
  })

  describe('pull', () => {
    it('pulls with defaults', async () => {
      mockInvoke.mockResolvedValueOnce({ output: 'ok' })
      await gitApi.pull()
      expect(mockInvoke).toHaveBeenCalledWith('git_pull', { remote: 'origin', branch: '' })
    })

    it('pulls with params', async () => {
      mockInvoke.mockResolvedValueOnce({ output: 'ok' })
      await gitApi.pull('upstream', 'develop')
      expect(mockInvoke).toHaveBeenCalledWith('git_pull', { remote: 'upstream', branch: 'develop' })
    })
  })

  describe('stash', () => {
    it('stashes changes', async () => {
      mockInvoke.mockResolvedValueOnce({ output: 'saved' })
      const result = await gitApi.stash()
      expect(result.output).toBe('saved')
    })
  })

  describe('stashPop', () => {
    it('pops stash', async () => {
      mockInvoke.mockResolvedValueOnce({ output: 'popped' })
      const result = await gitApi.stashPop()
      expect(result.output).toBe('popped')
    })
  })

  describe('undoCommit', () => {
    it('undoes last commit', async () => {
      mockInvoke.mockResolvedValueOnce({ output: 'undone' })
      const result = await gitApi.undoCommit()
      expect(result.output).toBe('undone')
    })
  })
})

// ===========================================================================
// gitDiffApi
// ===========================================================================
describe('gitDiffApi', () => {
  describe('getFileDiff', () => {
    it('returns file diff', async () => {
      const diff = { original: 'old', modified: 'new', path: 'a.ts' }
      mockInvoke.mockResolvedValueOnce(diff)

      const result = await gitDiffApi.getFileDiff('a.ts', true)

      expect(mockInvoke).toHaveBeenCalledWith('git_diff', { path: 'a.ts', staged: true })
      expect(result).toEqual(diff)
    })

    it('works without staged param', async () => {
      mockInvoke.mockResolvedValueOnce({ original: '', modified: '', path: 'b.ts' })
      await gitDiffApi.getFileDiff('b.ts')
      expect(mockInvoke).toHaveBeenCalledWith('git_diff', { path: 'b.ts', staged: undefined })
    })
  })

  describe('getLineDiff', () => {
    it('returns line diff ranges', async () => {
      const lineDiff = {
        ranges: [{ startOld: 1, endOld: 3, startNew: 1, endNew: 5, type: 'modified' as const }],
        path: 'a.ts',
      }
      mockInvoke.mockResolvedValueOnce(lineDiff)

      const result = await gitDiffApi.getLineDiff('a.ts')

      expect(mockInvoke).toHaveBeenCalledWith('git_diff_lines', { path: 'a.ts', staged: undefined })
      expect(result.ranges).toHaveLength(1)
    })
  })
})

// ===========================================================================
// gitBlameApi
// ===========================================================================
describe('gitBlameApi', () => {
  describe('blame', () => {
    it('returns blame lines', async () => {
      const lines = [{ line: 1, commit: 'h1', author: 'me', authorMail: 'm@e.com', authorTime: '', summary: '' }]
      mockInvoke.mockResolvedValueOnce({ lines })
      const result = await gitBlameApi.blame('a.ts')
      expect(result).toEqual(lines)
    })

    it('returns empty array when lines is null', async () => {
      mockInvoke.mockResolvedValueOnce({})
      const result = await gitBlameApi.blame('a.ts')
      expect(result).toEqual([])
    })
  })
})

// ===========================================================================
// worktreeApi
// ===========================================================================
describe('worktreeApi', () => {
  describe('list', () => {
    it('returns worktree list', async () => {
      const worktrees = [{ path: '/w1', branch: 'main', commit: 'h1', isMain: true }]
      mockInvoke.mockResolvedValueOnce({ worktrees })
      const result = await worktreeApi.list()
      expect(result).toEqual(worktrees)
    })

    it('returns empty array when null', async () => {
      mockInvoke.mockResolvedValueOnce({})
      const result = await worktreeApi.list()
      expect(result).toEqual([])
    })
  })

  describe('add', () => {
    it('adds worktree with branch', async () => {
      mockInvoke.mockResolvedValueOnce({ path: '/w2', branch: 'feat' })
      const result = await worktreeApi.add('/w2', 'feat')
      expect(mockInvoke).toHaveBeenCalledWith('git_worktree_add', { path: '/w2', branch: 'feat' })
      expect(result.branch).toBe('feat')
    })

    it('adds worktree without branch', async () => {
      mockInvoke.mockResolvedValueOnce({ path: '/w3', branch: '' })
      await worktreeApi.add('/w3')
      expect(mockInvoke).toHaveBeenCalledWith('git_worktree_add', { path: '/w3', branch: '' })
    })
  })

  describe('remove', () => {
    it('removes worktree', async () => {
      mockInvoke.mockResolvedValueOnce({ path: '/w1' })
      const result = await worktreeApi.remove('/w1')
      expect(result.path).toBe('/w1')
    })
  })
})

// ===========================================================================
// executeApi
// ===========================================================================
describe('executeApi', () => {
  describe('executeCode', () => {
    it('executes code with all params', async () => {
      const resp = { success: true, output: 'hello', error: undefined }
      mockInvoke.mockResolvedValueOnce(resp)

      const result = await executeApi.executeCode('test.py', 'print("hi")', 'python', 'agent-1')

      expect(mockInvoke).toHaveBeenCalledWith('execute_code', {
        filePath: 'test.py', content: 'print("hi")', language: 'python', agentId: 'agent-1',
      })
      expect(result.success).toBe(true)
    })

    it('executes code without agentId', async () => {
      mockInvoke.mockResolvedValueOnce({ success: true, output: '' })
      await executeApi.executeCode('a.ts', '1+1', 'typescript')
      expect(mockInvoke).toHaveBeenCalledWith('execute_code', {
        filePath: 'a.ts', content: '1+1', language: 'typescript', agentId: undefined,
      })
    })
  })
})

// ===========================================================================
// instructionsApi
// ===========================================================================
describe('instructionsApi', () => {
  describe('get', () => {
    it('returns custom instructions', async () => {
      const data = { content: 'rules', files: ['.cursorrules'] }
      mockInvoke.mockResolvedValueOnce(data)
      const result = await instructionsApi.get()
      expect(result).toEqual(data)
    })
  })

  describe('save', () => {
    it('saves custom instructions', async () => {
      mockInvoke.mockResolvedValueOnce({ status: 'ok', path: '.cursorrules' })
      const result = await instructionsApi.save('new rules')
      expect(mockInvoke).toHaveBeenCalledWith('save_custom_instructions', { content: 'new rules' })
      expect(result.path).toBe('.cursorrules')
    })
  })
})

// ===========================================================================
// workflowApi
// ===========================================================================
describe('workflowApi', () => {
  describe('list', () => {
    it('returns workflow list', async () => {
      const wfs: WorkflowInfo[] = [{
        id: 'wf1', name: 'Build', description: '', mode: 'sequential', status: 'idle',
        nodes: [], edges: [], createdAt: '', updatedAt: '',
      }]
      mockInvoke.mockResolvedValueOnce(wfs)
      const result = await workflowApi.list()
      expect(result).toEqual(wfs)
    })
  })

  describe('get', () => {
    it('returns single workflow', async () => {
      const wf: WorkflowInfo = {
        id: 'wf1', name: 'Build', description: '', mode: 'sequential', status: 'idle',
        nodes: [], edges: [], createdAt: '', updatedAt: '',
      }
      mockInvoke.mockResolvedValueOnce(wf)
      const result = await workflowApi.get('wf1')
      expect(mockInvoke).toHaveBeenCalledWith('get_workflow', { id: 'wf1' })
      expect(result.name).toBe('Build')
    })
  })

  describe('create', () => {
    it('creates workflow with defaults', async () => {
      mockInvoke.mockResolvedValueOnce({ id: 'wf2', name: 'New Workflow', status: 'idle' })

      const result = await workflowApi.create({})

      expect(mockInvoke).toHaveBeenCalledWith('create_workflow', {
        name: 'New Workflow', description: '', mode: 'sequential',
      })
      expect(result.id).toBe('wf2')
    })

    it('creates workflow with custom values', async () => {
      mockInvoke.mockResolvedValueOnce({ id: 'wf3', name: 'Custom', status: 'idle' })

      await workflowApi.create({ name: 'Custom', description: 'desc', mode: 'parallel' })

      expect(mockInvoke).toHaveBeenCalledWith('create_workflow', {
        name: 'Custom', description: 'desc', mode: 'parallel',
      })
    })
  })

  describe('update', () => {
    it('updates workflow', async () => {
      await workflowApi.update('wf1', { name: 'Updated' })
      expect(mockInvoke).toHaveBeenCalledWith('update_workflow', { id: 'wf1', workflow: { name: 'Updated' } })
    })
  })

  describe('delete', () => {
    it('deletes workflow', async () => {
      await workflowApi.delete('wf1')
      expect(mockInvoke).toHaveBeenCalledWith('delete_workflow', { id: 'wf1' })
    })
  })

  describe('execute', () => {
    it('executes workflow', async () => {
      await workflowApi.execute('wf1')
      expect(mockInvoke).toHaveBeenCalledWith('execute_workflow', { id: 'wf1' })
    })
  })

  describe('getCheckpoints', () => {
    it('returns checkpoints', async () => {
      const cps: CheckpointInfo[] = [{ id: 'cp1', workflowId: 'wf1', createdAt: '', currentNode: 'n1' }]
      mockInvoke.mockResolvedValueOnce(cps)
      const result = await workflowApi.getCheckpoints('wf1')
      expect(result).toEqual(cps)
    })
  })

  describe('restore', () => {
    it('restores from checkpoint', async () => {
      const wf: WorkflowInfo = {
        id: 'wf1', name: 'Restored', description: '', mode: 'sequential', status: 'idle',
        nodes: [], edges: [], createdAt: '', updatedAt: '',
      }
      mockInvoke.mockResolvedValueOnce(wf)
      const result = await workflowApi.restore('wf1', 'cp1')
      expect(mockInvoke).toHaveBeenCalledWith('restore_workflow', { id: 'wf1', checkpointId: 'cp1' })
      expect(result.name).toBe('Restored')
    })
  })

  describe('getReport', () => {
    it('returns execution report', async () => {
      const report: WorkflowExecutionReport = {
        workflowId: 'wf1', executionId: 'ex1', createdAt: '', status: 'completed',
        mode: 'sequential', durationMs: 1000, succeededNodes: [], failedNodes: [],
        skippedNodes: [], totalNodes: 0, successCount: 0, failureCount: 0, skippedCount: 0,
      }
      mockInvoke.mockResolvedValueOnce(report)
      const result = await workflowApi.getReport('wf1')
      expect(result.status).toBe('completed')
    })
  })

  describe('resume', () => {
    it('resumes workflow with input', async () => {
      mockInvoke.mockResolvedValueOnce({
        id: 'wf1', name: '', description: '', mode: '', status: 'running',
        nodes: [], edges: [], createdAt: '', updatedAt: '',
      })
      await workflowApi.resume('wf1', { key: 'value' })
      expect(mockInvoke).toHaveBeenCalledWith('resume_workflow', { id: 'wf1', input: { key: 'value' } })
    })

    it('resumes workflow without input', async () => {
      mockInvoke.mockResolvedValueOnce({
        id: 'wf1', name: '', description: '', mode: '', status: 'running',
        nodes: [], edges: [], createdAt: '', updatedAt: '',
      })
      await workflowApi.resume('wf1')
      expect(mockInvoke).toHaveBeenCalledWith('resume_workflow', { id: 'wf1', input: undefined })
    })
  })

  describe('clearNodeCache', () => {
    it('clears node cache', async () => {
      await workflowApi.clearNodeCache('n1')
      expect(mockInvoke).toHaveBeenCalledWith('clear_node_cache', { nodeId: 'n1' })
    })
  })

  describe('clearAllCaches', () => {
    it('clears all caches', async () => {
      await workflowApi.clearAllCaches()
      expect(mockInvoke).toHaveBeenCalledWith('clear_all_caches', {})
    })
  })

  describe('addNode', () => {
    it('adds node with all fields', async () => {
      const node = { agentId: 'a1', name: 'Step1', type: 'task', position: { x: 0, y: 0 } }
      mockInvoke.mockResolvedValueOnce({ id: 'n1', ...node, status: 'idle' })

      await workflowApi.addNode('wf1', node)

      expect(mockInvoke).toHaveBeenCalledWith('add_workflow_node', { id: 'wf1', node })
    })
  })

  describe('addEdge', () => {
    it('adds edge', async () => {
      const edge = { from: 'n1', to: 'n2', condition: '', label: '' }
      mockInvoke.mockResolvedValueOnce({ id: 'e1', ...edge })

      await workflowApi.addEdge('wf1', edge)

      expect(mockInvoke).toHaveBeenCalledWith('add_workflow_edge', { id: 'wf1', edge })
    })
  })

  describe('exportWorkflow', () => {
    it('exports workflow', async () => {
      mockInvoke.mockResolvedValueOnce({ data: '{}', format: 'json', size: 2, exported: '' })
      const result = await workflowApi.exportWorkflow('wf1')
      expect(result.format).toBe('json')
    })
  })

  describe('importWorkflow', () => {
    it('imports workflow', async () => {
      mockInvoke.mockResolvedValueOnce({ id: 'wf-new', name: 'Imported' })
      const result = await workflowApi.importWorkflow('{}', 'Imported')
      expect(mockInvoke).toHaveBeenCalledWith('import_workflow', { data: '{}', name: 'Imported' })
      expect(result.name).toBe('Imported')
    })
  })

  describe('validate', () => {
    it('returns validation result', async () => {
      mockInvoke.mockResolvedValueOnce({ valid: true, errors: [] })
      const result = await workflowApi.validate('wf1')
      expect(result.valid).toBe(true)
    })
  })

  describe('getStatus', () => {
    it('returns workflow status', async () => {
      mockInvoke.mockResolvedValueOnce({ status: 'running' })
      const result = await workflowApi.getStatus('wf1')
      expect(result).toEqual({ status: 'running' })
    })
  })
})

// ===========================================================================
// backendApi
// ===========================================================================
describe('backendApi', () => {
  describe('getStatus (connected)', () => {
    it('returns connected status', async () => {
      mockIsConnected.mockReturnValue(true)
      const result = await backendApi.getStatus()

      expect(result.connected).toBe(true)
      expect(result.state).toBe('connected')
      expect(result.backendType).toBe('unix-socket')
      expect(result.retryCount).toBe(0)
      expect(result.reconnectEnabled).toBe(false)
    })
  })

  describe('getStatus (disconnected)', () => {
    it('returns disconnected status', async () => {
      mockIsConnected.mockReturnValue(false)
      const result = await backendApi.getStatus()

      expect(result.connected).toBe(false)
      expect(result.state).toBe('disconnected')
    })
  })

  describe('connect', () => {
    it('connects and returns string', async () => {
      mockInvoke.mockResolvedValueOnce('pong')
      const result = await backendApi.connect()
      expect(result).toBe('connected')
    })
  })

  describe('disconnect', () => {
    it('disconnects and returns string (no-op for Unix socket)', async () => {
      const result = await backendApi.disconnect()
      expect(result).toBe('disconnected')
    })
  })
})

// ===========================================================================
// workspaceApi (uses tauriInvoke, not WebSocket)
// ===========================================================================
describe('workspaceApi', () => {
  describe('openFolderDialog', () => {
    it('throws when Tauri runtime not available', async () => {
      // In test environment, window.__TAURI__ is not defined
      await expect(workspaceApi.openFolderDialog()).rejects.toThrow('Tauri runtime not available')
    })
  })
})

// ===========================================================================
// events
// ===========================================================================
describe('events', () => {
  const mockUnsubscribe = vi.fn()

  beforeEach(() => {
    mockSubscribe.mockReturnValue(mockUnsubscribe)
  })

  describe('subscribe', () => {
    it('delegates to getClient().subscribe', () => {
      const handler = vi.fn()
      const unsub = events.subscribe('custom_event', handler)

      expect(mockSubscribe).toHaveBeenCalledWith('custom_event', handler)
      expect(unsub).toBe(mockUnsubscribe)
    })
  })

  describe('onAgentStatusChange', () => {
    it('subscribes to agent_status_change', () => {
      const handler = vi.fn()
      events.onAgentStatusChange(handler)
      expect(mockSubscribe).toHaveBeenCalledWith('agent_status_change', expect.any(Function))
    })
  })

  describe('onSwarmTaskUpdate', () => {
    it('subscribes to swarm_task_update', () => {
      const handler = vi.fn()
      events.onSwarmTaskUpdate(handler)
      expect(mockSubscribe).toHaveBeenCalledWith('swarm_task_update', expect.any(Function))
    })
  })

  describe('onSwarmStatusChange', () => {
    it('subscribes to swarm_status_change', () => {
      const handler = vi.fn()
      events.onSwarmStatusChange(handler)
      expect(mockSubscribe).toHaveBeenCalledWith('swarm_status_change', expect.any(Function))
    })
  })

  describe('onPermissionRequest', () => {
    it('subscribes to permission_request', () => {
      const handler = vi.fn()
      events.onPermissionRequest(handler)
      expect(mockSubscribe).toHaveBeenCalledWith('permission_request', expect.any(Function))
    })
  })

  describe('sendPermissionResponse', () => {
    it('sends permission response', async () => {
      mockInvoke.mockResolvedValueOnce(undefined)
      await events.sendPermissionResponse('r1', true, 'user', 'approved')
      expect(mockInvoke).toHaveBeenCalledWith('permission_response', {
        requestId: 'r1', approved: true, resolvedBy: 'user', reason: 'approved',
      })
    })

    it('sends permission response without reason', async () => {
      mockInvoke.mockResolvedValueOnce(undefined)
      await events.sendPermissionResponse('r1', false, 'admin')
      expect(mockInvoke).toHaveBeenCalledWith('permission_response', {
        requestId: 'r1', approved: false, resolvedBy: 'admin', reason: undefined,
      })
    })
  })

  describe('onAgentMessage', () => {
    it('subscribes to agent_message', () => {
      events.onAgentMessage(vi.fn())
      expect(mockSubscribe).toHaveBeenCalledWith('agent_message', expect.any(Function))
    })
  })

  describe('onAgentStats', () => {
    it('subscribes to agent_stats', () => {
      events.onAgentStats(vi.fn())
      expect(mockSubscribe).toHaveBeenCalledWith('agent_stats', expect.any(Function))
    })
  })

  describe('onSwarmStats', () => {
    it('subscribes to swarm_stats', () => {
      events.onSwarmStats(vi.fn())
      expect(mockSubscribe).toHaveBeenCalledWith('swarm_stats', expect.any(Function))
    })
  })

  describe('onLSPDiagnosticsUpdate', () => {
    it('subscribes to lsp_diagnostics_update', () => {
      events.onLSPDiagnosticsUpdate(vi.fn())
      expect(mockSubscribe).toHaveBeenCalledWith('lsp_diagnostics_update', expect.any(Function))
    })
  })

  describe('workflow streaming events', () => {
    it('onWorkflowNodeStart subscribes correctly', () => {
      events.onWorkflowNodeStart(vi.fn())
      expect(mockSubscribe).toHaveBeenCalledWith('workflow_node_start', expect.any(Function))
    })

    it('onWorkflowNodeComplete subscribes correctly', () => {
      events.onWorkflowNodeComplete(vi.fn())
      expect(mockSubscribe).toHaveBeenCalledWith('workflow_node_complete', expect.any(Function))
    })

    it('onWorkflowNodeCached subscribes correctly', () => {
      events.onWorkflowNodeCached(vi.fn())
      expect(mockSubscribe).toHaveBeenCalledWith('workflow_node_cached', expect.any(Function))
    })

    it('onWorkflowStatusChange subscribes correctly', () => {
      events.onWorkflowStatusChange(vi.fn())
      expect(mockSubscribe).toHaveBeenCalledWith('workflow_status_change', expect.any(Function))
    })
  })

  describe('agent lifecycle events', () => {
    it('onAgentTurnStart subscribes correctly', () => {
      events.onAgentTurnStart(vi.fn())
      expect(mockSubscribe).toHaveBeenCalledWith('agent_turn_start', expect.any(Function))
    })

    it('onAgentTurnEnd subscribes correctly', () => {
      events.onAgentTurnEnd(vi.fn())
      expect(mockSubscribe).toHaveBeenCalledWith('agent_turn_end', expect.any(Function))
    })
  })

  describe('handoff events', () => {
    it('onHandoffRequested subscribes correctly', () => {
      events.onHandoffRequested(vi.fn())
      expect(mockSubscribe).toHaveBeenCalledWith('handoff_requested', expect.any(Function))
    })

    it('onHandoffAccepted subscribes correctly', () => {
      events.onHandoffAccepted(vi.fn())
      expect(mockSubscribe).toHaveBeenCalledWith('handoff_accepted', expect.any(Function))
    })

    it('onHandoffRejected subscribes correctly', () => {
      events.onHandoffRejected(vi.fn())
      expect(mockSubscribe).toHaveBeenCalledWith('handoff_rejected', expect.any(Function))
    })

    it('onHandoffCompleted subscribes correctly', () => {
      events.onHandoffCompleted(vi.fn())
      expect(mockSubscribe).toHaveBeenCalledWith('handoff_completed', expect.any(Function))
    })
  })

  describe('supervisor health events', () => {
    it('onAgentStuck subscribes correctly', () => {
      events.onAgentStuck(vi.fn())
      expect(mockSubscribe).toHaveBeenCalledWith('agent_stuck', expect.any(Function))
    })

    it('onAgentRecovered subscribes correctly', () => {
      events.onAgentRecovered(vi.fn())
      expect(mockSubscribe).toHaveBeenCalledWith('agent_recovered', expect.any(Function))
    })

    it('onAgentHealthDegraded subscribes correctly', () => {
      events.onAgentHealthDegraded(vi.fn())
      expect(mockSubscribe).toHaveBeenCalledWith('agent_health_degraded', expect.any(Function))
    })

    it('onSupervisorAlert subscribes correctly', () => {
      events.onSupervisorAlert(vi.fn())
      expect(mockSubscribe).toHaveBeenCalledWith('supervisor_alert', expect.any(Function))
    })
  })

  describe('automation & schedule events', () => {
    it('onAutomationTriggered subscribes correctly', () => {
      events.onAutomationTriggered(vi.fn())
      expect(mockSubscribe).toHaveBeenCalledWith('automation_triggered', expect.any(Function))
    })

    it('onScheduleExecutionStarted subscribes correctly', () => {
      events.onScheduleExecutionStarted(vi.fn())
      expect(mockSubscribe).toHaveBeenCalledWith('schedule_execution_started', expect.any(Function))
    })

    it('onScheduleExecutionCompleted subscribes correctly', () => {
      events.onScheduleExecutionCompleted(vi.fn())
      expect(mockSubscribe).toHaveBeenCalledWith('schedule_execution_completed', expect.any(Function))
    })
  })

  describe('team & workflow events', () => {
    it('onTeamMessage subscribes correctly', () => {
      events.onTeamMessage(vi.fn())
      expect(mockSubscribe).toHaveBeenCalledWith('team_message', expect.any(Function))
    })

    it('onWorkflowChainCompleted subscribes correctly', () => {
      events.onWorkflowChainCompleted(vi.fn())
      expect(mockSubscribe).toHaveBeenCalledWith('workflow_chain_completed', expect.any(Function))
    })

    it('onWorkflowNodeHeartbeat subscribes correctly', () => {
      events.onWorkflowNodeHeartbeat(vi.fn())
      expect(mockSubscribe).toHaveBeenCalledWith('workflow_node_heartbeat', expect.any(Function))
    })
  })
})

// ===========================================================================
// api (unified export)
// ===========================================================================
describe('api (unified export)', () => {
  it('has agent property', () => {
    expect(api.agent).toBe(agentApi)
  })

  it('has fs property', () => {
    expect(api.fs).toBe(fsApi)
  })

  it('has execute property', () => {
    expect(api.execute).toBe(executeApi)
  })

  it('has swarm property', () => {
    expect(api.swarm).toBe(swarmApi)
  })

  it('has team property', () => {
    expect(api.team).toBe(teamApi)
  })

  it('has mcp property', () => {
    expect(api.mcp).toBe(mcpApi)
  })

  it('has backend property', () => {
    expect(api.backend).toBe(backendApi)
  })

  it('has monitoring property', () => {
    expect(api.monitoring).toBe(monitoringApi)
  })

  it('has a2a property', () => {
    expect(api.a2a).toBeDefined()
  })

  it('has workflows property', () => {
    expect(api.workflows).toBe(workflowApi)
  })

  it('has instructions property', () => {
    expect(api.instructions).toBe(instructionsApi)
  })

  it('has workspace property', () => {
    expect(api.workspace).toBe(workspaceApi)
  })

  it('has gitBlame property', () => {
    expect(api.gitBlame).toBe(gitBlameApi)
  })

  it('has worktree property', () => {
    expect(api.worktree).toBe(worktreeApi)
  })

  it('has events property', () => {
    expect(api.events).toBe(events)
  })
})

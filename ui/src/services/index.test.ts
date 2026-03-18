import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { api, mockApi, isTauriEnv, agentApi, swarmApi, fsApi, executeApi } from './index'

// Mock Tauri invoke
const mockInvoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}))

describe('isTauriEnv', () => {
  it('returns false when __TAURI__ is not in window', () => {
    expect(isTauriEnv()).toBe(false)
  })
})

describe('mockApi', () => {
  describe('agent', () => {
    it('getAgents returns mock agents', async () => {
      const agents = await mockApi.agent.getAgents()
      expect(agents).toHaveLength(3)
      expect(agents[0].id).toBe('claude-code')
      expect(agents[0].status).toBe('stopped')
    })

    it('startAgent returns running agent', async () => {
      const agent = await mockApi.agent.startAgent('claude-code')
      expect(agent.status).toBe('running')
      expect(agent.pid).toBeDefined()
    })

    it('startAgent throws for unknown agent', async () => {
      await expect(mockApi.agent.startAgent('unknown')).rejects.toThrow('Agent not found')
    })

    it('stopAgent returns stopped agent', async () => {
      const agent = await mockApi.agent.stopAgent('claude-code')
      expect(agent.status).toBe('stopped')
      expect(agent.pid).toBeUndefined()
    })

    it('stopAgent throws for unknown agent', async () => {
      await expect(mockApi.agent.stopAgent('unknown')).rejects.toThrow('Agent not found')
    })
  })

  describe('fs', () => {
    it('listDir returns mock file entries', async () => {
      const entries = await mockApi.fs.listDir('/test/path')
      expect(entries).toHaveLength(3)
      expect(entries[0].name).toBe('src')
      expect(entries[0].isDirectory).toBe(true)
    })

    it('readFile returns mock content', async () => {
      const content = await mockApi.fs.readFile('/test/file.ts')
      expect(content).toContain('// File: /test/file.ts')
    })

    it('writeFile does not throw', async () => {
      await expect(mockApi.fs.writeFile('/test/file.ts', 'content')).resolves.toBeUndefined()
    })

    it('getWorkspace returns mock workspace', async () => {
      const workspace = await mockApi.fs.getWorkspace()
      expect(workspace).toBe('/home/user/project')
    })
  })

  describe('execute', () => {
    it('executeCode returns success result', async () => {
      const result = await mockApi.execute.executeCode('/test/file.ts', 'code', 'typescript')
      expect(result.success).toBe(true)
      expect(result.output).toContain('Mock execution')
    })

    it('executeCode with agentId includes agent in output', async () => {
      const result = await mockApi.execute.executeCode('/test/file.ts', 'code', 'typescript', 'agent-1')
      expect(result.output).toContain('agent-1')
    })
  })

  describe('swarm', () => {
    it('createSwarm returns new swarm', async () => {
      const swarm = await mockApi.swarm.createSwarm({
        name: 'Test Swarm',
        topology: 'star',
        strategy: 'parallel',
        agentIds: ['agent-1', 'agent-2'],
      })
      expect(swarm.name).toBe('Test Swarm')
      expect(swarm.topology).toBe('star')
      expect(swarm.state).toBe('stopped')
      expect(swarm.stats.agentCount).toBe(2)
    })

    it('getSwarms returns empty array', async () => {
      const swarms = await mockApi.swarm.getSwarms()
      expect(swarms).toEqual([])
    })

    it('startSwarm returns active swarm', async () => {
      const swarm = await mockApi.swarm.startSwarm('swarm-1')
      expect(swarm.state).toBe('active')
    })

    it('stopSwarm returns stopped swarm', async () => {
      const swarm = await mockApi.swarm.stopSwarm('swarm-1')
      expect(swarm.state).toBe('stopped')
    })

    it('deleteSwarm does not throw', async () => {
      await expect(mockApi.swarm.deleteSwarm('swarm-1')).resolves.toBeUndefined()
    })

    it('submitTask returns task id', async () => {
      const taskId = await mockApi.swarm.submitTask({
        swarmId: 'swarm-1',
        title: 'Test Task',
        prompt: 'test prompt',
      })
      expect(taskId).toMatch(/^task-/)
    })

    it('executeTask returns completed result', async () => {
      const result = await mockApi.swarm.executeTask('swarm-1', 'task-1')
      expect(result.status).toBe('completed')
      expect(result.agentResults).toHaveProperty('claude-code')
    })
  })
})

describe('api (non-Tauri environment)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('agent', () => {
    it('getAgents uses mock in non-Tauri env', async () => {
      const agents = await api.agent.getAgents()
      expect(agents).toHaveLength(3)
    })

    it('refreshAgents uses mock in non-Tauri env', async () => {
      const agents = await api.agent.refreshAgents()
      expect(agents).toHaveLength(3)
    })

    it('getAgent uses mock and finds agent', async () => {
      const agent = await api.agent.getAgent('claude-code')
      expect(agent.id).toBe('claude-code')
    })

    it('getAgent throws for unknown agent', async () => {
      await expect(api.agent.getAgent('unknown')).rejects.toThrow('Agent not found')
    })

    it('startAgent uses mock in non-Tauri env', async () => {
      const agent = await api.agent.startAgent('claude-code')
      expect(agent.status).toBe('running')
    })

    it('stopAgent uses mock in non-Tauri env', async () => {
      const agent = await api.agent.stopAgent('claude-code')
      expect(agent.status).toBe('stopped')
    })

    it('addAgent throws in non-Tauri env', async () => {
      await expect(agentApi.addAgent({ id: 'test', name: 'Test', enabled: true, command: 'test' }))
        .rejects.toThrow('Not available in mock mode')
    })

    it('updateAgent throws in non-Tauri env', async () => {
      await expect(agentApi.updateAgent({ id: 'test', name: 'Test', enabled: true, command: 'test' }))
        .rejects.toThrow('Not available in mock mode')
    })

    it('deleteAgent throws in non-Tauri env', async () => {
      await expect(agentApi.deleteAgent('test'))
        .rejects.toThrow('Not available in mock mode')
    })

    it('getConfigPath returns mock path in non-Tauri env', async () => {
      const path = await api.agent.getConfigPath()
      expect(path).toBe('~/.swarm-editor/agents.json')
    })
  })

  describe('fs', () => {
    it('listDir uses mock in non-Tauri env', async () => {
      const entries = await api.fs.listDir('/test')
      expect(entries.length).toBeGreaterThan(0)
    })

    it('readFile uses mock in non-Tauri env', async () => {
      const content = await api.fs.readFile('/test/file.ts')
      expect(content).toContain('File:')
    })

    it('writeFile uses mock in non-Tauri env', async () => {
      await expect(api.fs.writeFile('/test/file.ts', 'content')).resolves.toBeUndefined()
    })

    it('getWorkspace uses mock in non-Tauri env', async () => {
      const workspace = await api.fs.getWorkspace()
      expect(workspace).toBe('/home/user/project')
    })
  })

  describe('execute', () => {
    it('executeCode uses mock in non-Tauri env', async () => {
      const result = await api.execute.executeCode('/test/file.ts', 'code', 'typescript')
      expect(result.success).toBe(true)
    })
  })

  describe('swarm', () => {
    it('createSwarm uses mock in non-Tauri env', async () => {
      const swarm = await api.swarm.createSwarm({
        name: 'Test',
        topology: 'star',
        strategy: 'parallel',
        agentIds: ['agent-1'],
      })
      expect(swarm.name).toBe('Test')
    })

    it('getSwarms uses mock in non-Tauri env', async () => {
      const swarms = await api.swarm.getSwarms()
      expect(swarms).toEqual([])
    })

    it('getSwarm finds swarm from mock', async () => {
      // First create a swarm
      await api.swarm.createSwarm({
        name: 'Find Test',
        topology: 'star',
        strategy: 'parallel',
        agentIds: ['agent-1'],
      })
      // getSwarms will return empty, so getSwarm will throw
      await expect(api.swarm.getSwarm('nonexistent')).rejects.toThrow('Swarm not found')
    })

    it('getSwarm returns swarm when found', async () => {
      const mockSwarm = {
        id: 'test-swarm',
        name: 'Test Swarm',
        topology: 'star',
        strategy: 'parallel',
        state: 'stopped',
        agents: ['agent-1'],
        stats: { agentCount: 1, idleAgents: 1, executingAgents: 0, pendingTasks: 0, completedTasks: 0 },
        createdAt: '2024-01-01T00:00:00Z',
      }
      vi.spyOn(mockApi.swarm, 'getSwarms').mockResolvedValue([mockSwarm])

      const swarm = await api.swarm.getSwarm('test-swarm')
      expect(swarm.id).toBe('test-swarm')
      expect(swarm.name).toBe('Test Swarm')
    })

    it('startSwarm uses mock in non-Tauri env', async () => {
      const swarm = await api.swarm.startSwarm('swarm-1')
      expect(swarm.state).toBe('active')
    })

    it('stopSwarm uses mock in non-Tauri env', async () => {
      const swarm = await api.swarm.stopSwarm('swarm-1')
      expect(swarm.state).toBe('stopped')
    })

    it('deleteSwarm uses mock in non-Tauri env', async () => {
      await expect(api.swarm.deleteSwarm('swarm-1')).resolves.toBeUndefined()
    })

    it('submitTask uses mock in non-Tauri env', async () => {
      const taskId = await api.swarm.submitTask({
        swarmId: 'swarm-1',
        title: 'Test',
        prompt: 'test',
      })
      expect(taskId).toMatch(/^task-/)
    })

    it('executeTask uses mock in non-Tauri env', async () => {
      const result = await api.swarm.executeTask('swarm-1', 'task-1')
      expect(result.status).toBe('completed')
    })
  })
})

describe('api (Tauri environment simulation)', () => {
  // These tests simulate Tauri environment by setting window.__TAURI__

  beforeEach(() => {
    vi.clearAllMocks()
    // Set up Tauri environment
    Object.defineProperty(window, '__TAURI__', { value: {}, writable: true, configurable: true })
  })

  afterEach(() => {
    // Clean up Tauri environment
    delete (window as unknown as Record<string, unknown>).__TAURI__
  })

  it('calls invoke for getAgents in Tauri env', async () => {
    const mockAgents = [
      { id: 'agent-1', name: 'Test Agent', status: 'stopped' },
    ]
    mockInvoke.mockResolvedValueOnce(mockAgents)

    const result = await agentApi.getAgents()
    expect(mockInvoke).toHaveBeenCalledWith('get_agents')
    expect(result).toEqual(mockAgents)
  })

  it('calls invoke for refreshAgents in Tauri env', async () => {
    const mockAgents = [
      { id: 'agent-1', name: 'Test Agent', status: 'stopped' },
    ]
    mockInvoke.mockResolvedValueOnce(mockAgents)

    const result = await agentApi.refreshAgents()
    expect(mockInvoke).toHaveBeenCalledWith('refresh_agents')
    expect(result).toEqual(mockAgents)
  })

  it('calls invoke for getAgent in Tauri env', async () => {
    const mockSwarm = {
      id: 'swarm-1',
      name: 'Test Swarm',
      topology: 'star',
      strategy: 'parallel',
      state: 'active',
      agents: ['agent-1'],
      stats: { agentCount: 1, idleAgents: 1, executingAgents: 0, pendingTasks: 0, completedTasks: 0 },
      createdAt: '2024-01-01T00:00:00Z',
    }
    mockInvoke.mockResolvedValueOnce(mockSwarm)

    const result = await swarmApi.getSwarm('swarm-1')
    expect(mockInvoke).toHaveBeenCalledWith('get_swarm', { id: 'swarm-1' })
    expect(result).toEqual(mockSwarm)
  })

  it('calls invoke for startSwarm in Tauri env', async () => {
    const mockSwarm = {
      id: 'swarm-1',
      name: 'Test Swarm',
      topology: 'star',
      strategy: 'parallel',
      state: 'active',
      agents: ['agent-1'],
      stats: { agentCount: 1, idleAgents: 1, executingAgents: 0, pendingTasks: 0, completedTasks: 0 },
      createdAt: '2024-01-01T00:00:00Z',
    }
    mockInvoke.mockResolvedValueOnce(mockSwarm)

    const result = await swarmApi.startSwarm('swarm-1')
    expect(mockInvoke).toHaveBeenCalledWith('start_swarm', { id: 'swarm-1' })
    expect(result).toEqual(mockSwarm)
  })

  it('calls invoke for stopSwarm in Tauri env', async () => {
    const mockSwarm = {
      id: 'swarm-1',
      name: 'Test Swarm',
      topology: 'star',
      strategy: 'parallel',
      state: 'stopped',
      agents: ['agent-1'],
      stats: { agentCount: 1, idleAgents: 1, executingAgents: 0, pendingTasks: 0, completedTasks: 0 },
      createdAt: '2024-01-01T00:00:00Z',
    }
    mockInvoke.mockResolvedValueOnce(mockSwarm)

    const result = await swarmApi.stopSwarm('swarm-1')
    expect(mockInvoke).toHaveBeenCalledWith('stop_swarm', { id: 'swarm-1' })
    expect(result).toEqual(mockSwarm)
  })

  it('calls invoke for deleteSwarm in Tauri env', async () => {
    mockInvoke.mockResolvedValueOnce(undefined)

    await swarmApi.deleteSwarm('swarm-1')
    expect(mockInvoke).toHaveBeenCalledWith('delete_swarm', { id: 'swarm-1' })
  })

  it('calls invoke for submitTask in Tauri env', async () => {
    mockInvoke.mockResolvedValueOnce('task-123')

    const result = await swarmApi.submitTask({
      swarmId: 'swarm-1',
      title: 'Test',
      prompt: 'test',
    })
    expect(mockInvoke).toHaveBeenCalledWith('submit_swarm_task', {
      request: {
        swarmId: 'swarm-1',
        title: 'Test',
        prompt: 'test',
      },
    })
    expect(result).toBe('task-123')
  })

  it('calls invoke for executeTask in Tauri env', async () => {
    const mockResult = {
      taskId: 'task-1',
      status: 'completed',
      output: 'Test output',
      agentResults: {},
    }
    mockInvoke.mockResolvedValueOnce(mockResult)

    const result = await swarmApi.executeTask('swarm-1', 'task-1')
    expect(mockInvoke).toHaveBeenCalledWith('execute_swarm_task', { swarmId: 'swarm-1', taskId: 'task-1' })
    expect(result).toEqual(mockResult)
  })

  it('calls invoke for readFile in Tauri env', async () => {
    mockInvoke.mockResolvedValueOnce('file content')

    const result = await fsApi.readFile('/test/file.ts')
    expect(mockInvoke).toHaveBeenCalledWith('read_file', { path: '/test/file.ts' })
    expect(result).toBe('file content')
  })

  it('calls invoke for getWorkspace in Tauri env', async () => {
    mockInvoke.mockResolvedValueOnce('/home/user/project')

    const result = await fsApi.getWorkspace()
    expect(mockInvoke).toHaveBeenCalledWith('get_workspace')
    expect(result).toBe('/home/user/project')
  })

  it('calls invoke for executeCode in Tauri env', async () => {
    const mockResult = { success: true, output: 'executed' }
    mockInvoke.mockResolvedValueOnce(mockResult)

    const result = await executeApi.executeCode('/test/file.ts', 'code', 'typescript')
    expect(mockInvoke).toHaveBeenCalledWith('execute_code', {
      filePath: '/test/file.ts',
      content: 'code',
      language: 'typescript',
      agentId: undefined,
    })
    expect(result).toEqual(mockResult)
  })

  it('calls invoke for createSwarm in Tauri env', async () => {
    const mockSwarm = {
      id: 'swarm-1',
      name: 'Test Swarm',
      topology: 'star',
      strategy: 'parallel',
      state: 'stopped',
      agents: ['agent-1'],
      stats: { agentCount: 1, idleAgents: 1, executingAgents: 0, pendingTasks: 0, completedTasks: 0 },
      createdAt: '2024-01-01T00:00:00Z',
    }
    mockInvoke.mockResolvedValueOnce(mockSwarm)

    const result = await swarmApi.createSwarm({
      name: 'Test',
      topology: 'star',
      strategy: 'parallel',
      agentIds: ['agent-1'],
    })
    expect(mockInvoke).toHaveBeenCalledWith('create_swarm', {
      request: {
        name: 'Test',
        topology: 'star',
        strategy: 'parallel',
        agentIds: ['agent-1'],
      },
    })
    expect(result).toEqual(mockSwarm)
  })

  it('calls invoke for getSwarms in Tauri env', async () => {
    const mockSwarms = [
      {
        id: 'swarm-1',
        name: 'Test Swarm',
        topology: 'star',
        strategy: 'parallel',
        state: 'active',
        agents: ['agent-1'],
        stats: { agentCount: 1, idleAgents: 1, executingAgents: 0, pendingTasks: 0, completedTasks: 0 },
        createdAt: '2024-01-01T00:00:00Z',
      },
    ]
    mockInvoke.mockResolvedValueOnce(mockSwarms)

    const result = await swarmApi.getSwarms()
    expect(mockInvoke).toHaveBeenCalledWith('get_swarms')
    expect(result).toEqual(mockSwarms)
  })

  it('calls invoke for listDir in Tauri env', async () => {
    const mockEntries = [{ name: 'file.ts', path: '/test/file.ts', isDirectory: false }]
    mockInvoke.mockResolvedValueOnce(mockEntries)

    const result = await fsApi.listDir('/test')
    expect(mockInvoke).toHaveBeenCalledWith('list_dir', { path: '/test' })
    expect(result).toEqual(mockEntries)
  })

  it('calls invoke for updateAgent in Tauri env', async () => {
    const mockAgent = { id: 'agent-1', name: 'Test', status: 'stopped' }
    mockInvoke.mockResolvedValueOnce(mockAgent)

    const result = await agentApi.updateAgent({ id: 'agent-1', name: 'Test', enabled: true, command: 'test' })
    expect(mockInvoke).toHaveBeenCalledWith('update_agent', {
      config: { id: 'agent-1', name: 'Test', enabled: true, command: 'test' },
    })
    expect(result).toEqual(mockAgent)
  })

  it('calls invoke for deleteAgent in Tauri env', async () => {
    mockInvoke.mockResolvedValueOnce(undefined)

    await agentApi.deleteAgent('agent-1')
    expect(mockInvoke).toHaveBeenCalledWith('delete_agent', { id: 'agent-1' })
  })

  it('calls invoke for getConfigPath in Tauri env', async () => {
    mockInvoke.mockResolvedValueOnce('/custom/path/agents.json')

    const result = await agentApi.getConfigPath()
    expect(mockInvoke).toHaveBeenCalledWith('get_config_path')
    expect(result).toBe('/custom/path/agents.json')
  })

  it('calls invoke for getAgent in Tauri env', async () => {
    const mockAgent = { id: 'agent-1', name: 'Test Agent', status: 'stopped' }
    mockInvoke.mockResolvedValueOnce(mockAgent)

    const result = await agentApi.getAgent('agent-1')
    expect(mockInvoke).toHaveBeenCalledWith('get_agent', { id: 'agent-1' })
    expect(result).toEqual(mockAgent)
  })

  it('calls invoke for startAgent in Tauri env', async () => {
    const mockAgent = { id: 'agent-1', name: 'Test Agent', status: 'running' }
    mockInvoke.mockResolvedValueOnce(mockAgent)

    const result = await agentApi.startAgent('agent-1')
    expect(mockInvoke).toHaveBeenCalledWith('start_agent', { id: 'agent-1' })
    expect(result).toEqual(mockAgent)
  })

  it('calls invoke for stopAgent in Tauri env', async () => {
    const mockAgent = { id: 'agent-1', name: 'Test Agent', status: 'stopped' }
    mockInvoke.mockResolvedValueOnce(mockAgent)

    const result = await agentApi.stopAgent('agent-1')
    expect(mockInvoke).toHaveBeenCalledWith('stop_agent', { id: 'agent-1' })
    expect(result).toEqual(mockAgent)
  })

  it('calls invoke for addAgent in Tauri env', async () => {
    const mockAgent = { id: 'agent-1', name: 'New Agent', status: 'stopped' }
    mockInvoke.mockResolvedValueOnce(mockAgent)

    const result = await agentApi.addAgent({ id: 'agent-1', name: 'New Agent', enabled: true, command: 'test' })
    expect(mockInvoke).toHaveBeenCalledWith('add_agent', {
      config: { id: 'agent-1', name: 'New Agent', enabled: true, command: 'test' },
    })
    expect(result).toEqual(mockAgent)
  })

  it('calls invoke for writeFile in Tauri env', async () => {
    mockInvoke.mockResolvedValueOnce(undefined)

    await fsApi.writeFile('/test/file.ts', 'content')
    expect(mockInvoke).toHaveBeenCalledWith('write_file', { path: '/test/file.ts', content: 'content' })
  })
})

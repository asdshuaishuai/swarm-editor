import { describe, it, expect, vi, beforeEach } from 'vitest'
import { tauri, isTauriEnv, agentApi, fsApi, executeApi, eventApi } from './tauri'

// Mock Tauri invoke
const mockInvoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}))

// Mock Tauri listen
const mockUnlisten = vi.fn()
const mockListen = vi.fn().mockResolvedValue(mockUnlisten)
vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}))

describe('isTauriEnv', () => {
  it('returns false when __TAURI__ is not in window', () => {
    expect(isTauriEnv()).toBe(false)
  })
})

describe('tauri object', () => {
  it('exports isTauriEnv function', () => {
    expect(tauri.isTauriEnv).toBe(isTauriEnv)
  })

  it('exports agent API', () => {
    expect(tauri.agent).toBe(agentApi)
  })

  it('exports fs API', () => {
    expect(tauri.fs).toBe(fsApi)
  })

  it('exports execute API', () => {
    expect(tauri.execute).toBe(executeApi)
  })
})

describe('agentApi (Tauri invoke calls)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getAgents calls invoke with correct command', async () => {
    const mockAgents = [{ id: 'agent-1', name: 'Test Agent' }]
    mockInvoke.mockResolvedValueOnce(mockAgents)

    const result = await agentApi.getAgents()

    expect(mockInvoke).toHaveBeenCalledWith('get_agents')
    expect(result).toEqual(mockAgents)
  })

  it('startAgent calls invoke with correct command and id', async () => {
    const mockAgent = { id: 'agent-1', name: 'Test Agent', status: 'running' }
    mockInvoke.mockResolvedValueOnce(mockAgent)

    const result = await agentApi.startAgent('agent-1')

    expect(mockInvoke).toHaveBeenCalledWith('start_agent', { id: 'agent-1' })
    expect(result).toEqual(mockAgent)
  })

  it('stopAgent calls invoke with correct command and id', async () => {
    const mockAgent = { id: 'agent-1', name: 'Test Agent', status: 'stopped' }
    mockInvoke.mockResolvedValueOnce(mockAgent)

    const result = await agentApi.stopAgent('agent-1')

    expect(mockInvoke).toHaveBeenCalledWith('stop_agent', { id: 'agent-1' })
    expect(result).toEqual(mockAgent)
  })
})

describe('fsApi (Tauri invoke calls)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('listDir calls invoke with correct command and path', async () => {
    const mockEntries = [{ name: 'file.ts', path: '/test/file.ts', isDirectory: false }]
    mockInvoke.mockResolvedValueOnce(mockEntries)

    const result = await fsApi.listDir('/test')

    expect(mockInvoke).toHaveBeenCalledWith('list_dir', { path: '/test' })
    expect(result).toEqual(mockEntries)
  })

  it('readFile calls invoke with correct command and path', async () => {
    const mockContent = 'file content'
    mockInvoke.mockResolvedValueOnce(mockContent)

    const result = await fsApi.readFile('/test/file.ts')

    expect(mockInvoke).toHaveBeenCalledWith('read_file', { path: '/test/file.ts' })
    expect(result).toBe(mockContent)
  })

  it('writeFile calls invoke with correct command, path and content', async () => {
    mockInvoke.mockResolvedValueOnce(undefined)

    await fsApi.writeFile('/test/file.ts', 'content')

    expect(mockInvoke).toHaveBeenCalledWith('write_file', { path: '/test/file.ts', content: 'content' })
  })

  it('getWorkspace calls invoke with correct command', async () => {
    const mockWorkspace = '/home/user/project'
    mockInvoke.mockResolvedValueOnce(mockWorkspace)

    const result = await fsApi.getWorkspace()

    expect(mockInvoke).toHaveBeenCalledWith('get_workspace')
    expect(result).toBe(mockWorkspace)
  })
})

describe('executeApi (Tauri invoke calls)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('executeCode calls invoke with correct parameters', async () => {
    const mockResult = { success: true, output: 'output' }
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

  it('executeCode calls invoke with agentId when provided', async () => {
    const mockResult = { success: true, output: 'output' }
    mockInvoke.mockResolvedValueOnce(mockResult)

    const result = await executeApi.executeCode('/test/file.ts', 'code', 'typescript', 'agent-1')

    expect(mockInvoke).toHaveBeenCalledWith('execute_code', {
      filePath: '/test/file.ts',
      content: 'code',
      language: 'typescript',
      agentId: 'agent-1',
    })
    expect(result).toEqual(mockResult)
  })
})

describe('eventApi (Tauri event listeners)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exports events API', () => {
    expect(tauri.events).toBe(eventApi)
  })

  it('onSwarmTaskUpdate registers listener and returns unlisten function', async () => {
    const handler = vi.fn()
    const unlisten = await eventApi.onSwarmTaskUpdate(handler)

    expect(mockListen).toHaveBeenCalledWith('swarm-task-update', expect.any(Function))
    expect(unlisten).toBe(mockUnlisten)
  })

  it('onSwarmTaskUpdate handler receives event payload', async () => {
    const handler = vi.fn()
    await eventApi.onSwarmTaskUpdate(handler)

    // Get the callback passed to listen
    const listenCallback = mockListen.mock.calls[0][1]
    const mockEvent = {
      payload: {
        task_id: 'task-1',
        swarm_id: 'swarm-1',
        status: 'completed',
        progress: 100,
        agent_results: {},
      },
    }

    // Simulate event being fired
    listenCallback(mockEvent)

    expect(handler).toHaveBeenCalledWith(mockEvent.payload)
  })

  it('onSwarmStatusChange registers listener and returns unlisten function', async () => {
    const handler = vi.fn()
    const unlisten = await eventApi.onSwarmStatusChange(handler)

    expect(mockListen).toHaveBeenCalledWith('swarm-status-change', expect.any(Function))
    expect(unlisten).toBe(mockUnlisten)
  })

  it('onSwarmStatusChange handler receives event payload', async () => {
    const handler = vi.fn()
    await eventApi.onSwarmStatusChange(handler)

    const listenCallback = mockListen.mock.calls[0][1]
    const mockEvent = {
      payload: {
        swarm_id: 'swarm-1',
        old_state: 'idle',
        new_state: 'running',
      },
    }

    listenCallback(mockEvent)

    expect(handler).toHaveBeenCalledWith(mockEvent.payload)
  })

  it('onAgentStatusChange registers listener and returns unlisten function', async () => {
    const handler = vi.fn()
    const unlisten = await eventApi.onAgentStatusChange(handler)

    expect(mockListen).toHaveBeenCalledWith('agent-status-change', expect.any(Function))
    expect(unlisten).toBe(mockUnlisten)
  })

  it('onAgentStatusChange handler receives event payload', async () => {
    const handler = vi.fn()
    await eventApi.onAgentStatusChange(handler)

    const listenCallback = mockListen.mock.calls[0][1]
    const mockEvent = {
      payload: {
        agent_id: 'agent-1',
        status: 'running',
        pid: 12345,
      },
    }

    listenCallback(mockEvent)

    expect(handler).toHaveBeenCalledWith(mockEvent.payload)
  })

  it('onPermissionRequest registers listener and returns unlisten function', async () => {
    const handler = vi.fn()
    const unlisten = await eventApi.onPermissionRequest(handler)

    expect(mockListen).toHaveBeenCalledWith('permission-request', expect.any(Function))
    expect(unlisten).toBe(mockUnlisten)
  })

  it('onPermissionRequest handler receives event payload', async () => {
    const handler = vi.fn()
    await eventApi.onPermissionRequest(handler)

    const listenCallback = mockListen.mock.calls[0][1]
    const mockEvent = {
      payload: {
        request_id: 'perm-1',
        session_id: 'session-1',
        tool_call_id: 'tool-1',
        tool_name: 'test-tool',
        description: 'Test permission',
        options: [{ option_id: 'opt-1', name: 'Allow', kind: 'allow' }],
      },
    }

    listenCallback(mockEvent)

    expect(handler).toHaveBeenCalledWith(mockEvent.payload)
  })

  it('onLog registers listener and returns unlisten function', async () => {
    const handler = vi.fn()
    const unlisten = await eventApi.onLog(handler)

    expect(mockListen).toHaveBeenCalledWith('log', expect.any(Function))
    expect(unlisten).toBe(mockUnlisten)
  })

  it('onLog handler receives event payload', async () => {
    const handler = vi.fn()
    await eventApi.onLog(handler)

    const listenCallback = mockListen.mock.calls[0][1]
    const mockEvent = {
      payload: {
        level: 'info',
        source: 'test',
        message: 'Test log message',
        timestamp: Date.now(),
      },
    }

    listenCallback(mockEvent)

    expect(handler).toHaveBeenCalledWith(mockEvent.payload)
  })

  it('unlisten function can be called to unsubscribe', async () => {
    const handler = vi.fn()
    const unlisten = await eventApi.onSwarmTaskUpdate(handler)

    unlisten()

    expect(mockUnlisten).toHaveBeenCalled()
  })
})
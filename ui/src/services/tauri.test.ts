import { describe, it, expect, vi, beforeEach } from 'vitest'
import { tauri, isTauriEnv, agentApi, fsApi, executeApi } from './tauri'

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
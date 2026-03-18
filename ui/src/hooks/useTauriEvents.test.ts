import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import { useTauriEvents, useTauriEventStatus } from './useTauriEvents'
import * as tauriModule from '../services/tauri'
import * as appStoreModule from '../store/appStore'

// Mock the tauri module
vi.mock('../services/tauri', () => ({
  tauri: {
    isTauriEnv: vi.fn(),
    events: {
      onSwarmTaskUpdate: vi.fn(),
      onSwarmStatusChange: vi.fn(),
      onAgentStatusChange: vi.fn(),
      onPermissionRequest: vi.fn(),
      onLog: vi.fn(),
    },
  },
}))

// Mock the appStore
vi.mock('../store/appStore', () => ({
  useAppStore: vi.fn(),
}))

describe('useTauriEvents', () => {
  const mockUnlisten = vi.fn()
  const mockSetSwarms = vi.fn()
  const mockSetAgents = vi.fn()
  const mockSetActiveSwarm = vi.fn()
  const mockUpdateAgent = vi.fn()
  const mockAddPermissionRequest = vi.fn()

  const createMockStore = (overrides = {}) => {
    vi.mocked(appStoreModule.useAppStore).mockReturnValue({
      swarms: [],
      agents: [],
      activeSwarm: null,
      setSwarms: mockSetSwarms,
      setAgents: mockSetAgents,
      setActiveSwarm: mockSetActiveSwarm,
      updateAgent: mockUpdateAgent,
      addPermissionRequest: mockAddPermissionRequest,
      connected: false,
      ...overrides,
    } as unknown as ReturnType<typeof appStoreModule.useAppStore>)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Default: not in Tauri environment
    vi.mocked(tauriModule.tauri.isTauriEnv).mockReturnValue(false)
    // Setup event listeners to return unlisten functions
    vi.mocked(tauriModule.tauri.events.onSwarmTaskUpdate).mockResolvedValue(mockUnlisten)
    vi.mocked(tauriModule.tauri.events.onSwarmStatusChange).mockResolvedValue(mockUnlisten)
    vi.mocked(tauriModule.tauri.events.onAgentStatusChange).mockResolvedValue(mockUnlisten)
    vi.mocked(tauriModule.tauri.events.onPermissionRequest).mockResolvedValue(mockUnlisten)
    vi.mocked(tauriModule.tauri.events.onLog).mockResolvedValue(mockUnlisten)
    // Default store mock
    createMockStore()
  })

  afterEach(() => {
    cleanup()
  })

  it('should not subscribe to events when not in Tauri environment', () => {
    vi.mocked(tauriModule.tauri.isTauriEnv).mockReturnValue(false)

    renderHook(() => useTauriEvents())

    expect(tauriModule.tauri.events.onSwarmTaskUpdate).not.toHaveBeenCalled()
    expect(tauriModule.tauri.events.onSwarmStatusChange).not.toHaveBeenCalled()
    expect(tauriModule.tauri.events.onAgentStatusChange).not.toHaveBeenCalled()
    expect(tauriModule.tauri.events.onPermissionRequest).not.toHaveBeenCalled()
    expect(tauriModule.tauri.events.onLog).not.toHaveBeenCalled()
  })

  it('should subscribe to all events when in Tauri environment', async () => {
    vi.mocked(tauriModule.tauri.isTauriEnv).mockReturnValue(true)

    renderHook(() => useTauriEvents())

    // Wait for async subscription with longer timeout
    await vi.waitFor(() => {
      expect(tauriModule.tauri.events.onSwarmTaskUpdate).toHaveBeenCalled()
    }, { timeout: 3000 })

    await vi.waitFor(() => {
      expect(tauriModule.tauri.events.onSwarmStatusChange).toHaveBeenCalled()
    }, { timeout: 3000 })

    await vi.waitFor(() => {
      expect(tauriModule.tauri.events.onAgentStatusChange).toHaveBeenCalled()
    }, { timeout: 3000 })

    await vi.waitFor(() => {
      expect(tauriModule.tauri.events.onPermissionRequest).toHaveBeenCalled()
    }, { timeout: 3000 })

    await vi.waitFor(() => {
      expect(tauriModule.tauri.events.onLog).toHaveBeenCalled()
    }, { timeout: 3000 })
  })

  it('should call unlisten functions on cleanup', async () => {
    vi.mocked(tauriModule.tauri.isTauriEnv).mockReturnValue(true)

    const { unmount } = renderHook(() => useTauriEvents())

    // Wait for all subscriptions
    await vi.waitFor(() => {
      expect(tauriModule.tauri.events.onLog).toHaveBeenCalled()
    }, { timeout: 3000 })

    unmount()

    // Each of the 5 event subscriptions should call unlisten
    await vi.waitFor(() => {
      expect(mockUnlisten).toHaveBeenCalledTimes(5)
    }, { timeout: 3000 })
  })

  it('should handle subscription errors gracefully', async () => {
    vi.mocked(tauriModule.tauri.isTauriEnv).mockReturnValue(true)
    vi.mocked(tauriModule.tauri.events.onSwarmTaskUpdate).mockRejectedValue(new Error('Subscription failed'))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    renderHook(() => useTauriEvents())

    await vi.waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
    })

    consoleSpy.mockRestore()
  })

  it('should invoke log handler with correct log level', async () => {
    vi.mocked(tauriModule.tauri.isTauriEnv).mockReturnValue(true)

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    renderHook(() => useTauriEvents())

    // Wait for onLog to be called
    await vi.waitFor(() => {
      expect(tauriModule.tauri.events.onLog).toHaveBeenCalled()
    })

    // Get the callback passed to onLog
    const logCallback = vi.mocked(tauriModule.tauri.events.onLog).mock.calls[0][0]

    // Test different log levels
    logCallback({ level: 'info', source: 'TestSource', message: 'Info message', timestamp: 123 })
    expect(consoleSpy).toHaveBeenCalledWith('[TestSource]', 'Info message')

    logCallback({ level: 'warn', source: 'WarnSource', message: 'Warn message', timestamp: 456 })
    expect(consoleSpy).toHaveBeenCalledWith('[WarnSource]', 'Warn message')

    logCallback({ level: 'error', source: 'ErrorSource', message: 'Error message', timestamp: 789 })
    // error uses console.error
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logCallback({ level: 'error', source: 'ErrorSource', message: 'Error message', timestamp: 789 })
    expect(consoleErrorSpy).toHaveBeenCalledWith('[ErrorSource]', 'Error message')
    consoleErrorSpy.mockRestore()

    consoleSpy.mockRestore()
  })

  it('should handle cleanup errors gracefully', async () => {
    vi.mocked(tauriModule.tauri.isTauriEnv).mockReturnValue(true)

    // Create a mock unlisten that throws an error
    const mockUnlistenError = vi.fn().mockImplementation(() => {
      throw new Error('Cleanup failed')
    })
    vi.mocked(tauriModule.tauri.events.onSwarmTaskUpdate).mockResolvedValue(mockUnlistenError)
    vi.mocked(tauriModule.tauri.events.onSwarmStatusChange).mockResolvedValue(mockUnlistenError)
    vi.mocked(tauriModule.tauri.events.onAgentStatusChange).mockResolvedValue(mockUnlistenError)
    vi.mocked(tauriModule.tauri.events.onPermissionRequest).mockResolvedValue(mockUnlistenError)
    vi.mocked(tauriModule.tauri.events.onLog).mockResolvedValue(mockUnlistenError)

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { unmount } = renderHook(() => useTauriEvents())

    // Wait for subscriptions
    await vi.waitFor(() => {
      expect(tauriModule.tauri.events.onLog).toHaveBeenCalled()
    }, { timeout: 3000 })

    unmount()

    // Should have logged errors during cleanup
    await vi.waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    consoleErrorSpy.mockRestore()
  })

  it('should update swarm stats on task update event', async () => {
    vi.mocked(tauriModule.tauri.isTauriEnv).mockReturnValue(true)

    // Create mock swarm data with valid SwarmState
    const mockSwarm = {
      id: 'swarm-1',
      name: 'Test Swarm',
      state: 'active' as const,
      stats: {
        agentCount: 1,
        idleAgents: 0,
        executingAgents: 1,
        pendingTasks: 0,
        completedTasks: 0,
        topology: 'star',
        strategy: 'parallel',
        state: 'active',
      },
    }
    createMockStore({ swarms: [mockSwarm] })

    renderHook(() => useTauriEvents())

    await vi.waitFor(() => {
      expect(tauriModule.tauri.events.onSwarmTaskUpdate).toHaveBeenCalled()
    })

    // Get the callback passed to onSwarmTaskUpdate
    const taskUpdateCallback = vi.mocked(tauriModule.tauri.events.onSwarmTaskUpdate).mock.calls[0][0]

    // Trigger task completed event
    taskUpdateCallback({
      task_id: 'task-1',
      swarm_id: 'swarm-1',
      status: 'completed',
      progress: 100,
      agent_results: {},
    })

    expect(mockSetSwarms).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'swarm-1',
        stats: expect.objectContaining({
          completedTasks: 1,
        }),
      }),
    ])
  })

  it('should update pending tasks on pending status', async () => {
    vi.mocked(tauriModule.tauri.isTauriEnv).mockReturnValue(true)

    const mockSwarm = {
      id: 'swarm-1',
      name: 'Test Swarm',
      state: 'active' as const,
      stats: {
        agentCount: 1,
        idleAgents: 0,
        executingAgents: 1,
        pendingTasks: 0,
        completedTasks: 0,
        topology: 'star',
        strategy: 'parallel',
        state: 'active',
      },
    }
    createMockStore({ swarms: [mockSwarm] })

    renderHook(() => useTauriEvents())

    await vi.waitFor(() => {
      expect(tauriModule.tauri.events.onSwarmTaskUpdate).toHaveBeenCalled()
    })

    const taskUpdateCallback = vi.mocked(tauriModule.tauri.events.onSwarmTaskUpdate).mock.calls[0][0]

    // Trigger task pending event
    taskUpdateCallback({
      task_id: 'task-1',
      swarm_id: 'swarm-1',
      status: 'pending',
      progress: 0,
      agent_results: {},
    })

    expect(mockSetSwarms).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'swarm-1',
        stats: expect.objectContaining({
          pendingTasks: 1,
        }),
      }),
    ])
  })

  it('should not update swarm if not found in store', async () => {
    vi.mocked(tauriModule.tauri.isTauriEnv).mockReturnValue(true)

    // Empty swarms array
    createMockStore({ swarms: [] })

    renderHook(() => useTauriEvents())

    await vi.waitFor(() => {
      expect(tauriModule.tauri.events.onSwarmTaskUpdate).toHaveBeenCalled()
    })

    const taskUpdateCallback = vi.mocked(tauriModule.tauri.events.onSwarmTaskUpdate).mock.calls[0][0]

    taskUpdateCallback({
      task_id: 'task-1',
      swarm_id: 'unknown-swarm',
      status: 'completed',
      progress: 100,
      agent_results: {},
    })

    expect(mockSetSwarms).not.toHaveBeenCalled()
  })

  it('should update swarm state on status change event', async () => {
    vi.mocked(tauriModule.tauri.isTauriEnv).mockReturnValue(true)

    const mockSwarm = {
      id: 'swarm-1',
      name: 'Test Swarm',
      state: 'initializing' as const,
      stats: {
        agentCount: 1,
        idleAgents: 0,
        executingAgents: 1,
        pendingTasks: 0,
        completedTasks: 0,
        topology: 'star',
        strategy: 'parallel',
        state: 'initializing',
      },
    }
    createMockStore({ swarms: [mockSwarm] })

    renderHook(() => useTauriEvents())

    await vi.waitFor(() => {
      expect(tauriModule.tauri.events.onSwarmStatusChange).toHaveBeenCalled()
    })

    const statusCallback = vi.mocked(tauriModule.tauri.events.onSwarmStatusChange).mock.calls[0][0]

    statusCallback({
      swarm_id: 'swarm-1',
      old_state: 'initializing',
      new_state: 'active',
    })

    expect(mockSetSwarms).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'swarm-1',
        state: 'active',
      }),
    ])
  })

  it('should update active swarm on status change if it matches', async () => {
    vi.mocked(tauriModule.tauri.isTauriEnv).mockReturnValue(true)

    const mockSwarm = {
      id: 'swarm-1',
      name: 'Test Swarm',
      state: 'initializing' as const,
      stats: {
        agentCount: 1,
        idleAgents: 0,
        executingAgents: 1,
        pendingTasks: 0,
        completedTasks: 0,
        topology: 'star',
        strategy: 'parallel',
        state: 'initializing',
      },
    }
    createMockStore({ swarms: [mockSwarm], activeSwarm: mockSwarm })

    renderHook(() => useTauriEvents())

    await vi.waitFor(() => {
      expect(tauriModule.tauri.events.onSwarmStatusChange).toHaveBeenCalled()
    })

    const statusCallback = vi.mocked(tauriModule.tauri.events.onSwarmStatusChange).mock.calls[0][0]

    statusCallback({
      swarm_id: 'swarm-1',
      old_state: 'initializing',
      new_state: 'active',
    })

    expect(mockSetActiveSwarm).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'swarm-1',
        state: 'active',
      })
    )
  })

  it('should update agent state on agent status change event', async () => {
    vi.mocked(tauriModule.tauri.isTauriEnv).mockReturnValue(true)

    const mockAgent = {
      id: 'agent-1',
      name: 'Test Agent',
      state: 'idle' as const,
      type: 'default',
      capabilities: [],
    }
    createMockStore({ agents: [mockAgent] })

    renderHook(() => useTauriEvents())

    await vi.waitFor(() => {
      expect(tauriModule.tauri.events.onAgentStatusChange).toHaveBeenCalled()
    })

    const agentCallback = vi.mocked(tauriModule.tauri.events.onAgentStatusChange).mock.calls[0][0]

    agentCallback({
      agent_id: 'agent-1',
      status: 'running',
    })

    expect(mockUpdateAgent).toHaveBeenCalledWith('agent-1', { state: 'running' })
  })

  it('should fallback to setAgents when updateAgent is not available', async () => {
    vi.mocked(tauriModule.tauri.isTauriEnv).mockReturnValue(true)

    const mockAgent = {
      id: 'agent-1',
      name: 'Test Agent',
      state: 'idle' as const,
      type: 'default',
      capabilities: [],
    }
    // Create store without updateAgent
    vi.mocked(appStoreModule.useAppStore).mockReturnValue({
      swarms: [],
      agents: [mockAgent],
      activeSwarm: null,
      setSwarms: mockSetSwarms,
      setAgents: mockSetAgents,
      setActiveSwarm: mockSetActiveSwarm,
      updateAgent: undefined,
      addPermissionRequest: mockAddPermissionRequest,
      connected: false,
    } as unknown as ReturnType<typeof appStoreModule.useAppStore>)

    renderHook(() => useTauriEvents())

    await vi.waitFor(() => {
      expect(tauriModule.tauri.events.onAgentStatusChange).toHaveBeenCalled()
    })

    const agentCallback = vi.mocked(tauriModule.tauri.events.onAgentStatusChange).mock.calls[0][0]

    agentCallback({
      agent_id: 'agent-1',
      status: 'running',
    })

    expect(mockSetAgents).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'agent-1',
        state: 'running',
      }),
    ])
  })

  it('should add permission request on permission request event', async () => {
    vi.mocked(tauriModule.tauri.isTauriEnv).mockReturnValue(true)

    renderHook(() => useTauriEvents())

    await vi.waitFor(() => {
      expect(tauriModule.tauri.events.onPermissionRequest).toHaveBeenCalled()
    })

    const permCallback = vi.mocked(tauriModule.tauri.events.onPermissionRequest).mock.calls[0][0]

    permCallback({
      request_id: 'perm-1',
      session_id: 'session-1',
      tool_call_id: 'tool-1',
      tool_name: 'test-tool',
      description: 'Test permission',
      options: [{ option_id: 'opt-1', name: 'Allow', kind: 'allow' }],
    })

    expect(mockAddPermissionRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        request_id: 'perm-1',
        tool_name: 'test-tool',
      })
    )
  })
})

describe('useTauriEventStatus', () => {
  it('should return connected status from store', () => {
    const { result } = renderHook(() => useTauriEventStatus())

    expect(result.current).toHaveProperty('connected')
    expect(result.current).toHaveProperty('isTauriEnv')
  })

  it('should reflect Tauri environment status', () => {
    vi.mocked(tauriModule.tauri.isTauriEnv).mockReturnValue(true)

    const { result } = renderHook(() => useTauriEventStatus())

    expect(result.current.isTauriEnv).toBe(true)
  })

  it('should reflect non-Tauri environment status', () => {
    vi.mocked(tauriModule.tauri.isTauriEnv).mockReturnValue(false)

    const { result } = renderHook(() => useTauriEventStatus())

    expect(result.current.isTauriEnv).toBe(false)
  })
})
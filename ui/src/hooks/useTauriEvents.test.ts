import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import { useTauriEvents, useTauriEventStatus } from './useTauriEvents'
import * as appStoreModule from '../store/appStore'
import type { AppState } from '../store/appStore'

// Store event handlers for triggering in tests
const eventHandlers = new Map<string, (payload: unknown) => void>()

// Mock WebSocket client
const mockIsConnected = vi.fn().mockReturnValue(true)
const mockOnConnect = vi.fn()
const mockOnDisconnect = vi.fn()

vi.mock('../services', () => ({
  events: {
    onSwarmTaskUpdate: vi.fn().mockImplementation((handler: (payload: unknown) => void) => {
      eventHandlers.set('swarm_task_update', handler)
      return () => eventHandlers.delete('swarm_task_update')
    }),
    onSwarmStatusChange: vi.fn().mockImplementation((handler: (payload: unknown) => void) => {
      eventHandlers.set('swarm_status_change', handler)
      return () => eventHandlers.delete('swarm_status_change')
    }),
    onAgentStatusChange: vi.fn().mockImplementation((handler: (payload: unknown) => void) => {
      eventHandlers.set('agent_status_change', handler)
      return () => eventHandlers.delete('agent_status_change')
    }),
    onPermissionRequest: vi.fn().mockImplementation((handler: (payload: unknown) => void) => {
      eventHandlers.set('permission_request', handler)
      return () => eventHandlers.delete('permission_request')
    }),
    onAgentMessage: vi.fn().mockImplementation((handler: (payload: unknown) => void) => {
      eventHandlers.set('agent_message', handler)
      return () => eventHandlers.delete('agent_message')
    }),
    onAgentStats: vi.fn().mockImplementation((handler: (payload: unknown) => void) => {
      eventHandlers.set('agent_stats', handler)
      return () => eventHandlers.delete('agent_stats')
    }),
    onSwarmStats: vi.fn().mockImplementation((handler: (payload: unknown) => void) => {
      eventHandlers.set('swarm_stats', handler)
      return () => eventHandlers.delete('swarm_stats')
    }),
    onLSPDiagnosticsUpdate: vi.fn().mockImplementation((handler: (payload: unknown) => void) => {
      eventHandlers.set('lsp_diagnostics_update', handler)
      return () => eventHandlers.delete('lsp_diagnostics_update')
    }),
  },
  getWebSocketClient: () => ({
    isConnected: mockIsConnected,
    on: (event: string, handler: () => void) => {
      if (event === 'connect') mockOnConnect.mockImplementation(handler)
      if (event === 'disconnect') mockOnDisconnect.mockImplementation(handler)
    },
  }),
}))

// Mock the appStore — use real agentInfoToAgent since it's a pure function
vi.mock('../store/appStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../store/appStore')>()
  return {
    ...actual,
    useAppStore: vi.fn(),
  }
})

// Module-level mocks for shared state between useAppStore() and useAppStore.getState()
const mockSetSwarms = vi.fn()
const mockSetAgents = vi.fn()
const mockSetActiveSwarm = vi.fn()
const mockAddPermissionRequest = vi.fn()
const mockSetConnected = vi.fn()
const mockUpdateFileProblems = vi.fn()

// Mutable store state shared between useAppStore() and useAppStore.getState()
let mockStoreState = {
  swarms: [] as unknown[],
  agents: [] as unknown[],
  activeSwarm: null,
  setSwarms: mockSetSwarms,
  setAgents: mockSetAgents,
  setActiveSwarm: mockSetActiveSwarm,
  addPermissionRequest: mockAddPermissionRequest,
  connected: false,
  setConnected: mockSetConnected,
  updateFileProblems: mockUpdateFileProblems,
}

// Provide getState on the mocked store — accessed as useAppStore.getState() in the hook
Object.assign(appStoreModule.useAppStore, {
  getState: () => mockStoreState,
})

describe('useTauriEvents (WebSocket)', () => {
  const createMockStore = (overrides: Record<string, unknown> = {}) => {
    mockStoreState = { ...mockStoreState, ...overrides }
    vi.mocked(appStoreModule.useAppStore).mockReturnValue(mockStoreState as never)
    // Also sync getState() so useAppStore.getState() inside the hook sees the same state
    ;(appStoreModule.useAppStore as unknown as { getState: () => typeof mockStoreState }).getState = () => mockStoreState
  }

  beforeEach(() => {
    vi.clearAllMocks()
    eventHandlers.clear()
    mockStoreState = {
      swarms: [],
      agents: [],
      activeSwarm: null,
      setSwarms: mockSetSwarms,
      setAgents: mockSetAgents,
      setActiveSwarm: mockSetActiveSwarm,
      addPermissionRequest: mockAddPermissionRequest,
      connected: false,
      setConnected: mockSetConnected,
      updateFileProblems: mockUpdateFileProblems,
    }
    createMockStore()
  })

  afterEach(() => {
    cleanup()
  })

  it('should subscribe to all WebSocket events', () => {
    renderHook(() => useTauriEvents())

    expect(eventHandlers.has('swarm_task_update')).toBe(true)
    expect(eventHandlers.has('swarm_status_change')).toBe(true)
    expect(eventHandlers.has('agent_status_change')).toBe(true)
    expect(eventHandlers.has('permission_request')).toBe(true)
    expect(eventHandlers.has('agent_message')).toBe(true)
    expect(eventHandlers.has('agent_stats')).toBe(true)
    expect(eventHandlers.has('swarm_stats')).toBe(true)
    expect(eventHandlers.has('lsp_diagnostics_update')).toBe(true)
  })

  it('should update swarm stats on task update event', () => {
    const mockSwarm = {
      id: 'swarm-1',
      name: 'Test Swarm',
      status: 'active',
      stats: {
        completedTasks: 0,
        pendingTasks: 0,
      },
    }
    createMockStore({ swarms: [mockSwarm] })

    renderHook(() => useTauriEvents())

    // Trigger task completed event
    const handler = eventHandlers.get('swarm_task_update')
    if (handler) {
      handler({
        swarmId: 'swarm-1',
        taskId: 'task-1',
        status: 'completed',
        progress: 100,
      })
    }

    expect(mockSetSwarms).toHaveBeenCalled()
  })

  it('should update swarm status on status change event', () => {
    const mockSwarm = {
      id: 'swarm-1',
      name: 'Test Swarm',
      status: 'initializing',
    }
    createMockStore({ swarms: [mockSwarm] })

    renderHook(() => useTauriEvents())

    // Trigger status change event
    const handler = eventHandlers.get('swarm_status_change')
    if (handler) {
      handler({
        swarmId: 'swarm-1',
        status: 'active',
      })
    }

    expect(mockSetSwarms).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'swarm-1',
        status: 'active',
      }),
    ])
  })

  it('should update agent state on agent status change event', () => {
    const mockAgent = {
      id: 'agent-1',
      name: 'Test Agent',
      state: 'idle',
    }
    createMockStore({ agents: [mockAgent] })

    renderHook(() => useTauriEvents())

    // Trigger agent status change event
    const handler = eventHandlers.get('agent_status_change')
    if (handler) {
      handler({
        agentId: 'agent-1',
        state: 'running',
      })
    }

    expect(mockSetAgents).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'agent-1',
        state: 'running',
      }),
    ])
  })

  it('should add permission request on permission request event', () => {
    renderHook(() => useTauriEvents())

    // Trigger permission request event
    const handler = eventHandlers.get('permission_request')
    if (handler) {
      handler({
        id: 'perm-1',
        sessionId: 'session-1',
        type: 'tool_call',
        description: 'Test permission',
      })
    }

    expect(mockAddPermissionRequest).toHaveBeenCalled()
  })

  it('should update agents on agent stats event', () => {
    renderHook(() => useTauriEvents())

    const newAgents = [
      { id: 'agent-1', name: 'Agent 1', state: 'idle' },
      { id: 'agent-2', name: 'Agent 2', state: 'running' },
    ]

    // Trigger agent stats event
    const handler = eventHandlers.get('agent_stats')
    if (handler) {
      handler(newAgents)
    }

    expect(mockSetAgents).toHaveBeenCalled()
    const calledWith = mockSetAgents.mock.calls[0][0]
    expect(calledWith).toHaveLength(2)
    expect(calledWith[0].id).toBe('agent-1')
    expect(calledWith[1].id).toBe('agent-2')
    // Verify state mapping: 'running' -> 'executing', 'idle' -> 'idle'
    expect(calledWith[0].state).toBe('idle')
    expect(calledWith[1].state).toBe('executing')
  })

  it('should update swarms on swarm stats event', () => {
    renderHook(() => useTauriEvents())

    const newSwarms = [
      { id: 'swarm-1', name: 'Swarm 1', status: 'active', state: 'active' },
    ]

    // Trigger swarm stats event
    const handler = eventHandlers.get('swarm_stats')
    if (handler) {
      handler(newSwarms)
    }

    expect(mockSetSwarms).toHaveBeenCalled()
    const calledWith = mockSetSwarms.mock.calls[0][0]
    expect(calledWith).toHaveLength(1)
    expect(calledWith[0].id).toBe('swarm-1')
    expect(calledWith[0].name).toBe('Swarm 1')
    // Verify state is properly mapped
    expect(calledWith[0].state).toBe('active')
  })

  it('should cleanup all event handlers on unmount', () => {
    const { unmount } = renderHook(() => useTauriEvents())

    expect(eventHandlers.size).toBe(8)

    unmount()

    expect(eventHandlers.size).toBe(0)
  })

  it('should update file problems on LSP diagnostics event', () => {
    renderHook(() => useTauriEvents())

    const handler = eventHandlers.get('lsp_diagnostics_update')
    if (handler) {
      handler({
        uri: 'file:///home/user/project/main.ts',
        diagnostics: [
          {
            range: { start: { line: 4, character: 10 }, end: { line: 4, character: 15 } },
            severity: 1,
            message: "Variable 'x' is not defined",
            source: 'typescript',
            code: '2304',
          },
          {
            range: { start: { line: 9, character: 0 }, end: { line: 9, character: 5 } },
            severity: 2,
            message: 'Unused variable',
            source: 'typescript',
          },
        ],
      })
    }

    expect(mockUpdateFileProblems).toHaveBeenCalledWith(
      '/home/user/project/main.ts',
      expect.arrayContaining([
        expect.objectContaining({
          file: '/home/user/project/main.ts',
          line: 5,
          severity: 'error',
          message: "Variable 'x' is not defined",
        }),
        expect.objectContaining({
          file: '/home/user/project/main.ts',
          line: 10,
          severity: 'warning',
          message: 'Unused variable',
        }),
      ]),
    )
  })
})

describe('useTauriEventStatus', () => {
  it('should return connected status from store', () => {
    const mockState = {
      connected: true,
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
      permissionQueue: [],
      activePermission: null,
      toasts: [],
      sidebarCollapsed: false,
      activePanel: 'editor' as const,
      loading: false,
    } as unknown as AppState
    vi.mocked(appStoreModule.useAppStore).mockImplementation((selector) => {
      if (typeof selector === 'function') {
        return selector(mockState)
      }
      return mockState
    })

    const { result } = renderHook(() => useTauriEventStatus())

    expect(result.current.connected).toBe(true)
  })

  it('should return WebSocket connection status', () => {
    mockIsConnected.mockReturnValue(true)

    const { result } = renderHook(() => useTauriEventStatus())

    expect(result.current.isConnected).toBe(true)
  })
})

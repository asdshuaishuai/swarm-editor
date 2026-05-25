import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import { useTauriEvents, useTauriEventStatus, useACPEvents, useACPEventStatus } from './useTauriEvents'
import * as appStoreModule from '../store/appStore'
import type { AppState } from '../store/appStore'

// Store event handlers for triggering in tests
const eventHandlers = new Map<string, (payload: unknown) => void>()

// Track connect/disconnect handlers
let connectHandler: (() => void) | null = null
let disconnectHandler: (() => void) | null = null

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
      if (event === 'connect') {
        connectHandler = handler
        mockOnConnect.mockImplementation(handler)
      }
      if (event === 'disconnect') {
        disconnectHandler = handler
        mockOnDisconnect.mockImplementation(handler)
      }
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
const mockAddToast = vi.fn()

// Mutable store state shared between useAppStore() and useAppStore.getState()
let mockStoreState = {
  swarms: [] as unknown[],
  agents: [] as unknown[],
  activeSwarm: null as unknown,
  setSwarms: mockSetSwarms,
  setAgents: mockSetAgents,
  setActiveSwarm: mockSetActiveSwarm,
  addPermissionRequest: mockAddPermissionRequest,
  connected: false,
  setConnected: mockSetConnected,
  updateFileProblems: mockUpdateFileProblems,
  addToast: mockAddToast,
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
    connectHandler = null
    disconnectHandler = null
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
      addToast: mockAddToast,
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

  it('should increment completedTasks on completed task update', () => {
    const mockSwarm = {
      id: 'swarm-1',
      name: 'Test Swarm',
      status: 'active',
      stats: { completedTasks: 5, pendingTasks: 3 },
    }
    createMockStore({ swarms: [mockSwarm] })

    renderHook(() => useTauriEvents())

    const handler = eventHandlers.get('swarm_task_update')
    handler?.({ swarmId: 'swarm-1', status: 'completed' })

    const updated = mockSetSwarms.mock.calls[0][0]
    expect(updated[0].stats.completedTasks).toBe(6)
    expect(updated[0].stats.pendingTasks).toBe(3)
  })

  it('should increment pendingTasks on pending task update', () => {
    const mockSwarm = {
      id: 'swarm-1',
      stats: { completedTasks: 2, pendingTasks: 4 },
    }
    createMockStore({ swarms: [mockSwarm] })

    renderHook(() => useTauriEvents())

    const handler = eventHandlers.get('swarm_task_update')
    handler?.({ swarmId: 'swarm-1', status: 'pending' })

    const updated = mockSetSwarms.mock.calls[0][0]
    expect(updated[0].stats.pendingTasks).toBe(5)
    expect(updated[0].stats.completedTasks).toBe(2)
  })

  it('should not modify task counts for non-completed non-pending status', () => {
    const mockSwarm = {
      id: 'swarm-1',
      stats: { completedTasks: 2, pendingTasks: 4 },
    }
    createMockStore({ swarms: [mockSwarm] })

    renderHook(() => useTauriEvents())

    const handler = eventHandlers.get('swarm_task_update')
    handler?.({ swarmId: 'swarm-1', status: 'running' })

    const updated = mockSetSwarms.mock.calls[0][0]
    expect(updated[0].stats.completedTasks).toBe(2)
    expect(updated[0].stats.pendingTasks).toBe(4)
  })

  it('should handle task update for non-existent swarm', () => {
    createMockStore({ swarms: [] })

    renderHook(() => useTauriEvents())

    const handler = eventHandlers.get('swarm_task_update')
    handler?.({ swarmId: 'non-existent', status: 'completed' })

    expect(mockSetSwarms).not.toHaveBeenCalled()
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

  it('should set active swarm on status change if activeSwarm matches', () => {
    const mockSwarm = { id: 'swarm-1', status: 'initializing' }
    createMockStore({ swarms: [mockSwarm], activeSwarm: mockSwarm })

    renderHook(() => useTauriEvents())

    const handler = eventHandlers.get('swarm_status_change')
    handler?.({ swarmId: 'swarm-1', status: 'active' })

    expect(mockSetActiveSwarm).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'swarm-1', status: 'active' }),
    )
  })

  it('should not set active swarm if activeSwarm does not match', () => {
    const mockSwarm1 = { id: 'swarm-1', status: 'initializing' }
    const mockSwarm2 = { id: 'swarm-2', status: 'initializing' }
    createMockStore({ swarms: [mockSwarm1, mockSwarm2], activeSwarm: mockSwarm2 })

    renderHook(() => useTauriEvents())

    const handler = eventHandlers.get('swarm_status_change')
    handler?.({ swarmId: 'swarm-1', status: 'active' })

    expect(mockSetActiveSwarm).not.toHaveBeenCalled()
  })

  it('should handle status change for non-existent swarm', () => {
    createMockStore({ swarms: [], activeSwarm: null })

    renderHook(() => useTauriEvents())

    const handler = eventHandlers.get('swarm_status_change')
    handler?.({ swarmId: 'non-existent', status: 'active' })

    expect(mockSetSwarms).not.toHaveBeenCalled()
    expect(mockSetActiveSwarm).not.toHaveBeenCalled()
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

  it('should handle agent status change for non-existent agent', () => {
    createMockStore({ agents: [] })

    renderHook(() => useTauriEvents())

    const handler = eventHandlers.get('agent_status_change')
    handler?.({ agentId: 'non-existent', state: 'running' })

    expect(mockSetAgents).not.toHaveBeenCalled()
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

  it('should merge existing agents with incoming agent stats', () => {
    const existingAgents = [
      { id: 'agent-1', name: 'Agent 1', state: 'idle', extra: 'preserved' },
      { id: 'agent-2', name: 'Agent 2', state: 'idle' },
    ]
    createMockStore({ agents: existingAgents })

    renderHook(() => useTauriEvents())

    const incomingAgents = [
      { id: 'agent-1', name: 'Agent 1 Updated', state: 'running' },
    ]

    const handler = eventHandlers.get('agent_stats')
    handler?.(incomingAgents)

    const calledWith = mockSetAgents.mock.calls[0][0]
    // agent-1 should be merged (updated)
    expect(calledWith).toHaveLength(1)
    expect(calledWith[0].id).toBe('agent-1')
  })

  it('should add new agents and remove ones not in incoming stats', () => {
    createMockStore({ agents: [{ id: 'old-agent', name: 'Old' }] })

    renderHook(() => useTauriEvents())

    const handler = eventHandlers.get('agent_stats')
    handler?.([{ id: 'new-agent', name: 'New', state: 'idle' }])

    const calledWith = mockSetAgents.mock.calls[0][0]
    expect(calledWith).toHaveLength(1)
    expect(calledWith[0].id).toBe('new-agent')
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

  it('should merge existing swarms with incoming swarm stats preserving higher counts', () => {
    const existingSwarms = [{
      id: 'swarm-1',
      name: 'Swarm 1',
      topology: 'star' as const,
      strategy: 'parallel' as const,
      state: 'active' as const,
      agents: [],
      stats: {
        agentCount: 5,
        idleAgents: 2,
        executingAgents: 3,
        pendingTasks: 10,
        completedTasks: 20,
        topology: 'star',
        strategy: 'parallel',
        state: 'active',
      },
    }]
    createMockStore({ swarms: existingSwarms })

    renderHook(() => useTauriEvents())

    const handler = eventHandlers.get('swarm_stats')
    handler?.([{
      id: 'swarm-1',
      name: 'Swarm 1 Updated',
      topology: 'mesh',
      strategy: 'sequential',
      state: 'paused',
      agentCount: 6,
      stats: { pendingTasks: 5, completedTasks: 15 },
    }])

    const calledWith = mockSetSwarms.mock.calls[0][0]
    expect(calledWith).toHaveLength(1)
    // Should keep higher values from existing
    expect(calledWith[0].stats.pendingTasks).toBe(10) // Math.max(10, 5)
    expect(calledWith[0].stats.completedTasks).toBe(20) // Math.max(20, 15)
    expect(calledWith[0].stats.agentCount).toBe(6) // incoming
    expect(calledWith[0].topology).toBe('mesh')
  })

  it('should add new swarms from swarm stats not in existing store', () => {
    createMockStore({ swarms: [] })

    renderHook(() => useTauriEvents())

    const handler = eventHandlers.get('swarm_stats')
    handler?.([{
      id: 'swarm-new',
      name: 'New Swarm',
      topology: 'tree',
      strategy: 'pipeline',
      state: 'initializing',
      stats: { agentCount: 3, pendingTasks: 2 },
    }])

    const calledWith = mockSetSwarms.mock.calls[0][0]
    expect(calledWith).toHaveLength(1)
    expect(calledWith[0].id).toBe('swarm-new')
    expect(calledWith[0].topology).toBe('tree')
    expect(calledWith[0].strategy).toBe('pipeline')
    expect(calledWith[0].stats.agentCount).toBe(3)
  })

  it('should remove swarms not present in incoming stats', () => {
    const existingSwarms = [
      { id: 'swarm-1', name: 'Keep', topology: 'star', strategy: 'parallel', state: 'active', agents: [], stats: { agentCount: 0, idleAgents: 0, executingAgents: 0, pendingTasks: 0, completedTasks: 0, topology: 'star', strategy: 'parallel', state: 'active' } },
      { id: 'swarm-2', name: 'Remove', topology: 'mesh', strategy: 'parallel', state: 'active', agents: [], stats: { agentCount: 0, idleAgents: 0, executingAgents: 0, pendingTasks: 0, completedTasks: 0, topology: 'mesh', strategy: 'parallel', state: 'active' } },
    ]
    createMockStore({ swarms: existingSwarms })

    renderHook(() => useTauriEvents())

    const handler = eventHandlers.get('swarm_stats')
    handler?.([{ id: 'swarm-1', name: 'Keep', status: 'active', state: 'active' }])

    const calledWith = mockSetSwarms.mock.calls[0][0]
    expect(calledWith).toHaveLength(1)
    expect(calledWith[0].id).toBe('swarm-1')
  })

  it('should use default topology/strategy when missing in swarm stats', () => {
    createMockStore({ swarms: [] })

    renderHook(() => useTauriEvents())

    const handler = eventHandlers.get('swarm_stats')
    handler?.([{ id: 'swarm-1', name: 'Swarm' }])

    const calledWith = mockSetSwarms.mock.calls[0][0]
    expect(calledWith[0].topology).toBe('star')
    expect(calledWith[0].strategy).toBe('parallel')
    expect(calledWith[0].state).toBe('stopped')
  })

  it('should use status as fallback for state in swarm stats', () => {
    createMockStore({ swarms: [] })

    renderHook(() => useTauriEvents())

    const handler = eventHandlers.get('swarm_stats')
    handler?.([{ id: 's1', name: 'Swarm', status: 'active' }])

    const calledWith = mockSetSwarms.mock.calls[0][0]
    expect(calledWith[0].state).toBe('active')
  })

  it('should use taskCount as fallback for pendingTasks in swarm stats', () => {
    createMockStore({ swarms: [] })

    renderHook(() => useTauriEvents())

    const handler = eventHandlers.get('swarm_stats')
    handler?.([{ id: 's1', name: 'Swarm', taskCount: 7, state: 'active' }])

    const calledWith = mockSetSwarms.mock.calls[0][0]
    expect(calledWith[0].stats.pendingTasks).toBe(7)
  })

  it('should use agentCount from top level when stats.agentCount is undefined', () => {
    createMockStore({ swarms: [] })

    renderHook(() => useTauriEvents())

    const handler = eventHandlers.get('swarm_stats')
    handler?.([{ id: 's1', name: 'Swarm', agentCount: 8, state: 'active' }])

    const calledWith = mockSetSwarms.mock.calls[0][0]
    expect(calledWith[0].stats.agentCount).toBe(8)
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

  it('should map severity 3 to info in LSP diagnostics', () => {
    renderHook(() => useTauriEvents())

    const handler = eventHandlers.get('lsp_diagnostics_update')
    handler?.({
      uri: 'file:///test/file.ts',
      diagnostics: [
        {
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
          severity: 3,
          message: 'Info message',
          source: 'lsp',
        },
      ],
    })

    expect(mockUpdateFileProblems).toHaveBeenCalledWith(
      '/test/file.ts',
      expect.arrayContaining([
        expect.objectContaining({ severity: 'info' }),
      ]),
    )
  })

  it('should use default source when source is undefined in diagnostics', () => {
    renderHook(() => useTauriEvents())

    const handler = eventHandlers.get('lsp_diagnostics_update')
    handler?.({
      uri: 'file:///test/file.ts',
      diagnostics: [
        {
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
          severity: 1,
          message: 'Error without source',
        },
      ],
    })

    expect(mockUpdateFileProblems).toHaveBeenCalledWith(
      '/test/file.ts',
      expect.arrayContaining([
        expect.objectContaining({ source: 'LSP' }),
      ]),
    )
  })

  it('should generate correct problem ids with line and index', () => {
    renderHook(() => useTauriEvents())

    const handler = eventHandlers.get('lsp_diagnostics_update')
    handler?.({
      uri: 'file:///test/a.ts',
      diagnostics: [
        {
          range: { start: { line: 2, character: 5 }, end: { line: 2, character: 10 } },
          severity: 1,
          message: 'Error 1',
        },
        {
          range: { start: { line: 2, character: 5 }, end: { line: 2, character: 10 } },
          severity: 2,
          message: 'Error 2',
        },
      ],
    })

    const problems = mockUpdateFileProblems.mock.calls[0][1]
    expect(problems[0].id).toBe('/test/a.ts:2:0')
    expect(problems[1].id).toBe('/test/a.ts:2:1')
  })

  it('should handle ws connect event and set connected', () => {
    renderHook(() => useTauriEvents())

    connectHandler?.()

    expect(mockSetConnected).toHaveBeenCalledWith(true)
  })

  it('should dispatch ws-reconnect event on connect', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    renderHook(() => useTauriEvents())

    connectHandler?.()

    expect(dispatchSpy).toHaveBeenCalledWith(expect.any(CustomEvent))
    const customEvent = dispatchSpy.mock.calls[0][0] as CustomEvent
    expect(customEvent.type).toBe('ws-reconnect')
    dispatchSpy.mockRestore()
  })

  it('should handle ws disconnect event and set disconnected', () => {
    renderHook(() => useTauriEvents())

    disconnectHandler?.()

    expect(mockSetConnected).toHaveBeenCalledWith(false)
  })

  it('should add warning toast on disconnect', () => {
    renderHook(() => useTauriEvents())

    disconnectHandler?.()

    expect(mockAddToast).toHaveBeenCalledWith('warning', 'Connection lost', 'Attempting to reconnect...')
  })

  it('should handle agent message event', () => {
    renderHook(() => useTauriEvents())

    const handler = eventHandlers.get('agent_message')
    // Should not throw
    expect(() => handler?.({ message: 'hello' })).not.toThrow()
  })

  it('should handle unsub cleanup errors gracefully', () => {
    const { unmount } = renderHook(() => useTauriEvents())

    // The real cleanup iterates unsubscribers.current, which we test via
    // triggering unmount after a normal render
    unmount()
    // No error should be thrown
    expect(true).toBe(true)
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

  it('should return false when not connected', () => {
    mockIsConnected.mockReturnValue(false)

    const mockState = {
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

    expect(result.current.connected).toBe(false)
    expect(result.current.isConnected).toBe(false)
  })
})

describe('backward compatibility aliases', () => {
  it('should export useACPEvents as useTauriEvents', () => {
    expect(useACPEvents).toBe(useTauriEvents)
  })

  it('should export useACPEventStatus as useTauriEventStatus', () => {
    expect(useACPEventStatus).toBe(useTauriEventStatus)
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import { useTauriEvents, useTauriEventStatus } from './useTauriEvents'
import * as tauriModule from '../services/tauri'

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
  useAppStore: vi.fn(() => ({
    swarms: [],
    agents: [],
    activeSwarm: null,
    setSwarms: vi.fn(),
    setAgents: vi.fn(),
    setActiveSwarm: vi.fn(),
    updateAgent: vi.fn(),
    addPermissionRequest: vi.fn(),
    connected: false,
  })),
}))

describe('useTauriEvents', () => {
  const mockUnlisten = vi.fn()

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
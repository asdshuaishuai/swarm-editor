import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { PermissionDialog, PermissionQueueIndicator } from './PermissionDialog'
import { useAppStore } from '../store/appStore'

// Mock the store
vi.mock('../store/appStore', () => {
  const mockFn = vi.fn() as ReturnType<typeof vi.fn> & { getState: ReturnType<typeof vi.fn> }
  mockFn.getState = vi.fn()
  return { useAppStore: mockFn }
})

describe('PermissionDialog', () => {
  const mockResolvePermission = vi.fn()
  const mockDismissPermission = vi.fn()
  let mockState: Record<string, unknown>

  beforeEach(() => {
    vi.clearAllMocks()
    mockState = {
      activePermission: null,
      resolvePermission: mockResolvePermission,
      dismissPermission: mockDismissPermission,
    }
    // Mock useAppStore as both a selector hook and a store with getState
    const store = useAppStore as unknown as ReturnType<typeof vi.fn> & { getState: ReturnType<typeof vi.fn> }
    store.mockImplementation((selector: (state: unknown) => unknown) =>
      selector ? selector(mockState) : mockState
    )
    store.getState.mockReturnValue(mockState)
  })

  it('should not render when no active permission', () => {
    const { container } = render(<PermissionDialog />)
    expect(container.firstChild).toBeNull()
  })

  it('should render permission dialog with tool name and description', () => {
    mockState.activePermission = {
      id: 'perm-1',
      requestId: 'req-1',
      sessionId: 'session-1',
      agentId: 'agent-1',
      toolName: 'Bash',
      description: 'Execute shell command',
      options: [],
      timestamp: Date.now(),
    }

    render(<PermissionDialog />)

    expect(screen.getByText('Permission Request')).toBeInTheDocument()
    expect(screen.getByText(/Agent is requesting permission/)).toBeInTheDocument()
    expect(screen.getByText('Tool: Bash')).toBeInTheDocument()
    expect(screen.getByText('Execute shell command')).toBeInTheDocument()
  })

  it('should call dismissPermission when Deny button is clicked', () => {
    mockState.activePermission = {
      id: 'perm-1',
      requestId: 'req-1',
      sessionId: 'session-1',
      agentId: 'agent-1',
      toolName: 'Bash',
      description: 'Execute shell command',
      options: [],
      timestamp: Date.now(),
    }

    render(<PermissionDialog />)

    const denyButton = screen.getByRole('button', { name: /deny/i })
    fireEvent.click(denyButton)

    expect(mockDismissPermission).toHaveBeenCalledWith('req-1')
  })

  it('should call resolvePermission when Approve button is clicked', () => {
    mockState.activePermission = {
      id: 'perm-1',
      requestId: 'req-1',
      sessionId: 'session-1',
      agentId: 'agent-1',
      toolName: 'Bash',
      description: 'Execute shell command',
      options: [],
      timestamp: Date.now(),
    }

    render(<PermissionDialog />)

    const approveButton = screen.getByRole('button', { name: /approve/i })
    fireEvent.click(approveButton)

    expect(mockResolvePermission).toHaveBeenCalledWith('req-1', 'default')
  })

  it('should show options when available', () => {
    mockState.activePermission = {
      id: 'perm-1',
      requestId: 'req-1',
      sessionId: 'session-1',
      agentId: 'agent-1',
      toolName: 'Read',
      description: 'Read file',
      options: [
        { id: 'opt-1', label: 'Allow once', description: 'Allow this operation once' },
        { id: 'opt-2', label: 'Allow always', description: 'Allow all future operations' },
      ],
      timestamp: Date.now(),
    }

    render(<PermissionDialog />)

    // Should show toggle for options
    expect(screen.getByText(/Show 2 option/)).toBeInTheDocument()

    // Click to expand options
    const toggleButton = screen.getByText(/Show 2 option/)
    fireEvent.click(toggleButton)

    // "Allow once" and "Allow always" appear in both the options list and buttons
    expect(screen.getAllByText('Allow once').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Allow always').length).toBeGreaterThan(0)
  })

  it('should dismiss when X button is clicked', () => {
    mockState.activePermission = {
      id: 'perm-1',
      requestId: 'req-1',
      sessionId: 'session-1',
      agentId: 'agent-1',
      toolName: 'Bash',
      description: 'Execute shell command',
      options: [],
      timestamp: Date.now(),
    }

    render(<PermissionDialog />)

    // Find the X button in the header (not the Deny button)
    const closeButton = screen.getAllByRole('button')[0]
    fireEvent.click(closeButton)

    expect(mockDismissPermission).toHaveBeenCalledWith('req-1')
  })

  it('should dismiss on Escape key press', () => {
    mockState.activePermission = {
      id: 'perm-1',
      requestId: 'req-1',
      sessionId: 'session-1',
      agentId: 'agent-1',
      toolName: 'Bash',
      description: 'Execute shell command',
      options: [],
      timestamp: Date.now(),
    }

    render(<PermissionDialog />)

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })

    expect(mockDismissPermission).toHaveBeenCalledWith('req-1')
  })

  it('should not dismiss on Escape when activePermission becomes null', () => {
    // Render with active permission
    mockState.activePermission = {
      id: 'perm-1',
      requestId: 'req-1',
      sessionId: 'session-1',
      agentId: 'agent-1',
      toolName: 'Bash',
      description: 'Execute shell command',
      options: [],
      timestamp: Date.now(),
    }

    render(<PermissionDialog />)

    // Simulate the permission being cleared before Escape is pressed
    mockState.activePermission = null

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })

    expect(mockDismissPermission).not.toHaveBeenCalled()
  })

  it('should clean up Escape key listener on unmount', () => {
    mockState.activePermission = {
      id: 'perm-1',
      requestId: 'req-1',
      sessionId: 'session-1',
      agentId: 'agent-1',
      toolName: 'Bash',
      description: 'Execute shell command',
      options: [],
      timestamp: Date.now(),
    }

    const { unmount } = render(<PermissionDialog />)
    unmount()

    // After unmount, pressing Escape should not call dismiss
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })

    expect(mockDismissPermission).not.toHaveBeenCalled()
  })

  it('should call resolvePermission with option id when option button is clicked', () => {
    mockState.activePermission = {
      id: 'perm-1',
      requestId: 'req-1',
      sessionId: 'session-1',
      agentId: 'agent-1',
      toolName: 'Read',
      description: 'Read file',
      options: [
        { id: 'opt-1', label: 'Allow once', description: 'Allow once' },
        { id: 'opt-2', label: 'Allow always', description: 'Allow always' },
      ],
      timestamp: Date.now(),
    }

    render(<PermissionDialog />)

    // Find the "Allow once" option button (in the actions area)
    const allowOnceButtons = screen.getAllByText('Allow once')
    // The last one should be the action button
    const allowOnceButton = allowOnceButtons[allowOnceButtons.length - 1].closest('button')!
    fireEvent.click(allowOnceButton)

    expect(mockResolvePermission).toHaveBeenCalledWith('req-1', 'opt-1')
  })

  it('should show "Approve" as fallback when option has no label', () => {
    mockState.activePermission = {
      id: 'perm-1',
      requestId: 'req-1',
      sessionId: 'session-1',
      agentId: 'agent-1',
      toolName: 'Write',
      description: 'Write to file',
      options: [
        { id: 'opt-default' },
      ],
      timestamp: Date.now(),
    }

    render(<PermissionDialog />)

    expect(screen.getAllByText('Approve').length).toBeGreaterThanOrEqual(1)
  })

  it('should toggle options visibility', () => {
    mockState.activePermission = {
      id: 'perm-1',
      requestId: 'req-1',
      sessionId: 'session-1',
      agentId: 'agent-1',
      toolName: 'Read',
      description: 'Read file',
      options: [
        { id: 'opt-1', label: 'Allow once', description: 'Allow once' },
      ],
      timestamp: Date.now(),
    }

    render(<PermissionDialog />)

    // Expand options
    const toggleButton = screen.getByText(/Show 1 option/)
    fireEvent.click(toggleButton)

    expect(screen.getByText('Hide options')).toBeInTheDocument()
    expect(screen.getAllByText('Allow once').length).toBeGreaterThanOrEqual(1)

    // Collapse options
    fireEvent.click(screen.getByText('Hide options'))
    expect(screen.getByText(/Show 1 option/)).toBeInTheDocument()
  })

  it('should show option id as fallback when option has no label in expanded list', () => {
    mockState.activePermission = {
      id: 'perm-1',
      requestId: 'req-1',
      sessionId: 'session-1',
      agentId: 'agent-1',
      toolName: 'Read',
      description: 'Read file',
      options: [
        { id: 'custom-opt-id' },
      ],
      timestamp: Date.now(),
    }

    render(<PermissionDialog />)

    // Expand options
    fireEvent.click(screen.getByText(/Show 1 option/))

    // The option card should show the id as fallback
    expect(screen.getByText('custom-opt-id')).toBeInTheDocument()
  })
})

describe('PermissionQueueIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should not render when no pending permissions', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (state: unknown) => unknown) => {
      const state = {
        permissionQueue: [],
        activePermission: null,
      }
      return selector ? selector(state) : state
    })

    const { container } = render(<PermissionQueueIndicator />)
    expect(container.firstChild).toBeNull()
  })

  it('should show permission pending when active permission exists', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (state: unknown) => unknown) => {
      const state = {
        permissionQueue: [],
        activePermission: {
          id: 'perm-1',
          requestId: 'req-1',
          toolName: 'Bash',
          description: 'Test',
          options: [],
        },
      }
      return selector ? selector(state) : state
    })

    render(<PermissionQueueIndicator />)

    expect(screen.getByText('Permission pending...')).toBeInTheDocument()
  })

  it('should show queue count when permissions are queued', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (state: unknown) => unknown) => {
      const state = {
        permissionQueue: [
          { id: 'perm-1', requestId: 'req-1', toolName: 'Bash', description: 'Test 1', options: [] },
          { id: 'perm-2', requestId: 'req-2', toolName: 'Read', description: 'Test 2', options: [] },
        ],
        activePermission: null,
      }
      return selector ? selector(state) : state
    })

    render(<PermissionQueueIndicator />)

    expect(screen.getByText('2 permission(s) queued')).toBeInTheDocument()
  })
})

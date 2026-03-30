import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

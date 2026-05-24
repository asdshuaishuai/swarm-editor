import { render, screen, act, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

// Mock the store
const mockInitialize = vi.fn()
const mockRemoveToast = vi.fn()
const mockToggleZenMode = vi.fn()

vi.mock('./store/appStore', () => ({
  useAppStore: vi.fn((selector: (state: Record<string, unknown>) => unknown) => {
    const state = {
      initialize: mockInitialize,
      toasts: [] as unknown[],
      removeToast: mockRemoveToast,
      toggleZenMode: mockToggleZenMode,
    }
    return selector(state)
  }),
}))

// Mock hooks
const mockToggleTheme = vi.fn()
const mockUseACPEvents = vi.fn()

vi.mock('./hooks', () => ({
  useACPEvents: () => mockUseACPEvents(),
  useTheme: () => ({
    theme: 'dark',
    effectiveTheme: 'dark',
    setTheme: vi.fn(),
    toggleTheme: mockToggleTheme,
    isDark: true,
  }),
}))

// Mock MainLayout
vi.mock('./components/layouts/MainLayout', () => ({
  default: () => <div data-testid="main-layout">MainLayout</div>,
}))

// Mock lazy loaded panels
vi.mock('./panels/SettingsPanel', () => ({
  default: () => <div data-testid="settings-panel">Settings</div>,
}))

vi.mock('./components/Toast', () => ({
  ToastContainer: ({ toasts, onDismiss }: { toasts: unknown[]; onDismiss: (id: string) => void }) => (
    <div data-testid="toast-container">
      <span>{toasts.length} toasts</span>
      {toasts.length > 0 && <button data-testid="dismiss-toast" onClick={() => onDismiss('test-id')}>Dismiss</button>}
    </div>
  ),
}))

vi.mock('./components/PermissionDialog', () => ({
  PermissionDialog: () => <div data-testid="permission-dialog" />,
  PermissionQueueIndicator: () => <div data-testid="permission-queue-indicator" />,
}))

vi.mock('./components/CommandPalette', () => ({
  CommandPalette: () => <div data-testid="command-palette" />,
}))

vi.mock('./components/SearchPanel', () => ({
  SearchPanel: ({ isOpen, onClose, initialFolder, initialReplace }: {
    isOpen: boolean
    onClose: () => void
    initialFolder?: string
    initialReplace?: boolean
  }) => (
    <div data-testid="search-panel" data-open={isOpen} data-folder={initialFolder ?? ''} data-replace={String(initialReplace)}>
      {isOpen && <button data-testid="close-search" onClick={onClose}>Close</button>}
    </div>
  ),
}))

vi.mock('./components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('./components/StatusBar', () => ({
  default: () => <div data-testid="status-bar" />,
}))

const mockResolveHandoff = vi.fn()
const mockClearActiveHandoff = vi.fn()
let mockActiveHandoff: Record<string, unknown> | null = null

vi.mock('./components/HandoffDialog', () => {
  const storeFn = () => ({
    get activeHandoff() { return mockActiveHandoff },
    resolveHandoff: mockResolveHandoff,
    clearActiveHandoff: mockClearActiveHandoff,
  })
  storeFn.getState = () => ({
    clearActiveHandoff: mockClearActiveHandoff,
  })
  return {
    useHandoffStore: storeFn,
    HandoffDialog: ({ onAccept, onReject, onClose }: {
      request: unknown
      onAccept: (id: string, summary: string) => void
      onReject: () => void
      onClose: () => void
    }) => (
      <div data-testid="handoff-dialog">
        <button data-testid="accept-handoff" onClick={() => onAccept('test-id', 'summary')}>Accept</button>
        <button data-testid="reject-handoff" onClick={onReject}>Reject</button>
        <button data-testid="close-handoff" onClick={onClose}>Close</button>
      </div>
    ),
  }
})

vi.mock('./components/TabSwitcher', () => ({
  TabSwitcher: () => <div data-testid="tab-switcher" />,
}))

function renderApp(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>
  )
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockActiveHandoff = null
    mockUseACPEvents.mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('routing', () => {
    it('renders MainLayout on root route', async () => {
      await act(async () => { renderApp('/') })
      expect(screen.getByTestId('main-layout')).toBeInTheDocument()
    })

    it('renders MainLayout on /editor route', async () => {
      await act(async () => { renderApp('/editor') })
      expect(screen.getByTestId('main-layout')).toBeInTheDocument()
    })

    it('renders MainLayout on /swarm route', async () => {
      await act(async () => { renderApp('/swarm') })
      expect(screen.getByTestId('main-layout')).toBeInTheDocument()
    })

    it('renders MainLayout on /team route', async () => {
      await act(async () => { renderApp('/team') })
      expect(screen.getByTestId('main-layout')).toBeInTheDocument()
    })

    it('renders MainLayout on /workflow route', async () => {
      await act(async () => { renderApp('/workflow') })
      expect(screen.getByTestId('main-layout')).toBeInTheDocument()
    })

    it('renders SettingsPanel on /settings route', async () => {
      await act(async () => { renderApp('/settings') })
      expect(screen.getByTestId('settings-panel')).toBeInTheDocument()
    })

    it('redirects unknown routes to root', async () => {
      await act(async () => { renderApp('/unknown-route') })
      expect(screen.getByTestId('main-layout')).toBeInTheDocument()
    })
  })

  describe('global component rendering', () => {
    it('renders StatusBar', async () => {
      await act(async () => { renderApp() })
      expect(screen.getByTestId('status-bar')).toBeInTheDocument()
    })

    it('renders CommandPalette', async () => {
      await act(async () => { renderApp() })
      expect(screen.getByTestId('command-palette')).toBeInTheDocument()
    })

    it('renders TabSwitcher', async () => {
      await act(async () => { renderApp() })
      expect(screen.getByTestId('tab-switcher')).toBeInTheDocument()
    })

    it('renders PermissionDialog', async () => {
      await act(async () => { renderApp() })
      expect(screen.getByTestId('permission-dialog')).toBeInTheDocument()
    })

    it('renders PermissionQueueIndicator', async () => {
      await act(async () => { renderApp() })
      expect(screen.getByTestId('permission-queue-indicator')).toBeInTheDocument()
    })

    it('renders ToastContainer', async () => {
      await act(async () => { renderApp() })
      expect(screen.getByTestId('toast-container')).toBeInTheDocument()
    })

    it('renders SearchPanel (closed by default)', async () => {
      await act(async () => { renderApp() })
      expect(screen.getByTestId('search-panel')).toBeInTheDocument()
    })
  })

  describe('initialization', () => {
    it('calls initialize on mount', async () => {
      await act(async () => { renderApp() })
      expect(mockInitialize).toHaveBeenCalledTimes(1)
    })

    it('calls useACPEvents on mount', async () => {
      await act(async () => { renderApp() })
      expect(mockUseACPEvents).toHaveBeenCalledTimes(1)
    })
  })

  describe('keyboard shortcuts - search', () => {
    it('Ctrl+Shift+F toggles search panel', async () => {
      await act(async () => { renderApp() })
      expect(screen.getByTestId('search-panel').getAttribute('data-open')).toBe('false')

      await act(async () => {
        fireEvent.keyDown(window, { key: 'F', shiftKey: true, ctrlKey: true })
      })
      expect(screen.getByTestId('search-panel').getAttribute('data-open')).toBe('true')

      // Toggle off
      await act(async () => {
        fireEvent.keyDown(window, { key: 'F', shiftKey: true, ctrlKey: true })
      })
      expect(screen.getByTestId('search-panel').getAttribute('data-open')).toBe('false')
    })

    it('Meta+Shift+F toggles search panel (Mac)', async () => {
      await act(async () => { renderApp() })

      await act(async () => {
        fireEvent.keyDown(window, { key: 'F', shiftKey: true, metaKey: true })
      })
      expect(screen.getByTestId('search-panel').getAttribute('data-open')).toBe('true')
    })

    it('Ctrl+Shift+H opens search panel in replace mode', async () => {
      await act(async () => { renderApp() })

      await act(async () => {
        fireEvent.keyDown(window, { key: 'H', shiftKey: true, ctrlKey: true })
      })
      expect(screen.getByTestId('search-panel').getAttribute('data-open')).toBe('true')
      expect(screen.getByTestId('search-panel').getAttribute('data-replace')).toBe('true')
    })
  })

  describe('keyboard shortcuts - navigation', () => {
    it('Ctrl+Shift+E dispatches focus-file-tree event', async () => {
      const listener = vi.fn()
      window.addEventListener('focus-file-tree', listener)
      await act(async () => { renderApp() })

      await act(async () => {
        fireEvent.keyDown(window, { key: 'E', shiftKey: true, ctrlKey: true })
      })
      expect(listener).toHaveBeenCalledTimes(1)
      window.removeEventListener('focus-file-tree', listener)
    })

    it('Ctrl+G dispatches open-goto-line event', async () => {
      const listener = vi.fn()
      window.addEventListener('open-goto-line', listener)
      await act(async () => { renderApp() })

      await act(async () => {
        fireEvent.keyDown(window, { key: 'g', ctrlKey: true })
      })
      expect(listener).toHaveBeenCalledTimes(1)
      window.removeEventListener('open-goto-line', listener)
    })

    it('Ctrl+\\ dispatches toggle-split event', async () => {
      const listener = vi.fn()
      window.addEventListener('toggle-split', listener)
      await act(async () => { renderApp() })

      await act(async () => {
        fireEvent.keyDown(window, { key: '\\', ctrlKey: true })
      })
      expect(listener).toHaveBeenCalledTimes(1)
      window.removeEventListener('toggle-split', listener)
    })
  })

  describe('keyboard shortcuts - panels', () => {
    it('Ctrl+` dispatches toggle-terminal event', async () => {
      const listener = vi.fn()
      window.addEventListener('toggle-terminal', listener)
      await act(async () => { renderApp() })

      await act(async () => {
        fireEvent.keyDown(window, { key: '`', ctrlKey: true })
      })
      expect(listener).toHaveBeenCalledTimes(1)
      window.removeEventListener('toggle-terminal', listener)
    })

    it('Ctrl+B dispatches toggle-sidebar event', async () => {
      const listener = vi.fn()
      window.addEventListener('toggle-sidebar', listener)
      await act(async () => { renderApp() })

      await act(async () => {
        fireEvent.keyDown(window, { key: 'b', ctrlKey: true })
      })
      expect(listener).toHaveBeenCalledTimes(1)
      window.removeEventListener('toggle-sidebar', listener)
    })

    it('Ctrl+Shift+G dispatches toggle-source-control event', async () => {
      const listener = vi.fn()
      window.addEventListener('toggle-source-control', listener)
      await act(async () => { renderApp() })

      await act(async () => {
        fireEvent.keyDown(window, { key: 'G', shiftKey: true, ctrlKey: true })
      })
      expect(listener).toHaveBeenCalledTimes(1)
      window.removeEventListener('toggle-source-control', listener)
    })

    it('Ctrl+Shift+M dispatches show-problems event', async () => {
      const listener = vi.fn()
      window.addEventListener('show-problems', listener)
      await act(async () => { renderApp() })

      await act(async () => {
        fireEvent.keyDown(window, { key: 'M', shiftKey: true, ctrlKey: true })
      })
      expect(listener).toHaveBeenCalledTimes(1)
      window.removeEventListener('show-problems', listener)
    })

    it('Ctrl+J dispatches toggle-bottom-panel event', async () => {
      const listener = vi.fn()
      window.addEventListener('toggle-bottom-panel', listener)
      await act(async () => { renderApp() })

      await act(async () => {
        fireEvent.keyDown(window, { key: 'j', ctrlKey: true })
      })
      expect(listener).toHaveBeenCalledTimes(1)
      window.removeEventListener('toggle-bottom-panel', listener)
    })
  })

  describe('keyboard shortcuts - zoom', () => {
    it('Ctrl+= dispatches adjust-font-size with delta 1', async () => {
      const listener = vi.fn()
      window.addEventListener('adjust-font-size', listener)
      await act(async () => { renderApp() })

      await act(async () => {
        fireEvent.keyDown(window, { key: '=', ctrlKey: true })
      })
      expect(listener).toHaveBeenCalledTimes(1)
      const detail = (listener.mock.calls[0][0] as CustomEvent).detail
      expect(detail.delta).toBe(1)
      window.removeEventListener('adjust-font-size', listener)
    })

    it('Ctrl++ dispatches adjust-font-size with delta 1', async () => {
      const listener = vi.fn()
      window.addEventListener('adjust-font-size', listener)
      await act(async () => { renderApp() })

      await act(async () => {
        fireEvent.keyDown(window, { key: '+', ctrlKey: true })
      })
      expect(listener).toHaveBeenCalledTimes(1)
      const detail = (listener.mock.calls[0][0] as CustomEvent).detail
      expect(detail.delta).toBe(1)
      window.removeEventListener('adjust-font-size', listener)
    })

    it('Ctrl+- dispatches adjust-font-size with delta -1', async () => {
      const listener = vi.fn()
      window.addEventListener('adjust-font-size', listener)
      await act(async () => { renderApp() })

      await act(async () => {
        fireEvent.keyDown(window, { key: '-', ctrlKey: true })
      })
      expect(listener).toHaveBeenCalledTimes(1)
      const detail = (listener.mock.calls[0][0] as CustomEvent).detail
      expect(detail.delta).toBe(-1)
      window.removeEventListener('adjust-font-size', listener)
    })

    it('Ctrl+_ dispatches adjust-font-size with delta -1', async () => {
      const listener = vi.fn()
      window.addEventListener('adjust-font-size', listener)
      await act(async () => { renderApp() })

      await act(async () => {
        fireEvent.keyDown(window, { key: '_', ctrlKey: true })
      })
      expect(listener).toHaveBeenCalledTimes(1)
      const detail = (listener.mock.calls[0][0] as CustomEvent).detail
      expect(detail.delta).toBe(-1)
      window.removeEventListener('adjust-font-size', listener)
    })

    it('Ctrl+0 dispatches adjust-font-size with reset', async () => {
      const listener = vi.fn()
      window.addEventListener('adjust-font-size', listener)
      await act(async () => { renderApp() })

      await act(async () => {
        fireEvent.keyDown(window, { key: '0', ctrlKey: true })
      })
      expect(listener).toHaveBeenCalledTimes(1)
      const detail = (listener.mock.calls[0][0] as CustomEvent).detail
      expect(detail.reset).toBe(true)
      window.removeEventListener('adjust-font-size', listener)
    })
  })

  describe('keyboard shortcuts - word wrap and settings', () => {
    it('Alt+Z dispatches toggle-editor-setting with wordWrap', async () => {
      const listener = vi.fn()
      window.addEventListener('toggle-editor-setting', listener)
      await act(async () => { renderApp() })

      await act(async () => {
        fireEvent.keyDown(window, { key: 'z', altKey: true })
      })
      expect(listener).toHaveBeenCalledTimes(1)
      const detail = (listener.mock.calls[0][0] as CustomEvent).detail
      expect(detail.setting).toBe('wordWrap')
      window.removeEventListener('toggle-editor-setting', listener)
    })

    it('Ctrl+, navigates to settings', async () => {
      await act(async () => { renderApp() })

      await act(async () => {
        fireEvent.keyDown(window, { key: ',', ctrlKey: true })
      })
      expect(window.location.hash).toBe('#/settings')
    })
  })

  describe('custom events - search panel', () => {
    it('open-search-panel event opens the search panel', async () => {
      await act(async () => { renderApp() })
      expect(screen.getByTestId('search-panel').getAttribute('data-open')).toBe('false')

      await act(async () => {
        window.dispatchEvent(new CustomEvent('open-search-panel'))
      })
      expect(screen.getByTestId('search-panel').getAttribute('data-open')).toBe('true')
    })

    it('open-search-panel event with replaceMode opens in replace mode', async () => {
      await act(async () => { renderApp() })

      await act(async () => {
        window.dispatchEvent(new CustomEvent('open-search-panel', { detail: { replaceMode: true } }))
      })
      expect(screen.getByTestId('search-panel').getAttribute('data-open')).toBe('true')
      expect(screen.getByTestId('search-panel').getAttribute('data-replace')).toBe('true')
    })

    it('search-in-folder event opens search with folder', async () => {
      await act(async () => { renderApp() })

      await act(async () => {
        window.dispatchEvent(new CustomEvent('search-in-folder', { detail: { folder: '/src/components' } }))
      })
      expect(screen.getByTestId('search-panel').getAttribute('data-open')).toBe('true')
      expect(screen.getByTestId('search-panel').getAttribute('data-folder')).toBe('/src/components')
    })
  })

  describe('custom events - zen mode and theme', () => {
    it('toggle-zen-mode event calls toggleZenMode', async () => {
      await act(async () => { renderApp() })

      await act(async () => {
        window.dispatchEvent(new CustomEvent('toggle-zen-mode'))
      })
      expect(mockToggleZenMode).toHaveBeenCalledTimes(1)
    })

    it('toggle-theme event calls toggleTheme', async () => {
      await act(async () => { renderApp() })

      await act(async () => {
        window.dispatchEvent(new CustomEvent('toggle-theme'))
      })
      expect(mockToggleTheme).toHaveBeenCalledTimes(1)
    })
  })

  describe('search panel close', () => {
    it('close button resets search panel state', async () => {
      await act(async () => { renderApp() })

      // Open search panel first
      await act(async () => {
        window.dispatchEvent(new CustomEvent('search-in-folder', { detail: { folder: '/src' } }))
      })
      expect(screen.getByTestId('search-panel').getAttribute('data-open')).toBe('true')
      expect(screen.getByTestId('search-panel').getAttribute('data-folder')).toBe('/src')

      // Close it
      const closeBtn = screen.getByTestId('close-search')
      await act(async () => {
        fireEvent.click(closeBtn)
      })
      expect(screen.getByTestId('search-panel').getAttribute('data-open')).toBe('false')
      expect(screen.getByTestId('search-panel').getAttribute('data-folder')).toBe('')
    })
  })

  describe('handoff dialog', () => {
    it('does not show handoff dialog when no active handoff', async () => {
      await act(async () => { renderApp() })
      expect(screen.queryByTestId('handoff-dialog')).not.toBeInTheDocument()
    })

    it('shows handoff dialog when activeHandoff is pending', async () => {
      mockActiveHandoff = {
        id: 'h1',
        fromAgent: 'agent-a',
        toAgent: 'agent-b',
        taskId: 't1',
        reason: 'test',
        status: 'pending',
        createdAt: new Date(),
      }

      await act(async () => { renderApp() })
      expect(screen.getByTestId('handoff-dialog')).toBeInTheDocument()
    })

    it('does not show handoff dialog when status is accepted', async () => {
      mockActiveHandoff = {
        id: 'h1',
        fromAgent: 'agent-a',
        toAgent: 'agent-b',
        taskId: 't1',
        reason: 'test',
        status: 'accepted',
        createdAt: new Date(),
      }

      await act(async () => { renderApp() })
      expect(screen.queryByTestId('handoff-dialog')).not.toBeInTheDocument()
    })

    it('does not show handoff dialog when status is rejected', async () => {
      mockActiveHandoff = {
        id: 'h1',
        fromAgent: 'agent-a',
        toAgent: 'agent-b',
        taskId: 't1',
        reason: 'test',
        status: 'rejected',
        createdAt: new Date(),
      }

      await act(async () => { renderApp() })
      expect(screen.queryByTestId('handoff-dialog')).not.toBeInTheDocument()
    })

    it('accept handoff calls resolveHandoff with true', async () => {
      mockActiveHandoff = {
        id: 'h1',
        fromAgent: 'agent-a',
        toAgent: 'agent-b',
        taskId: 't1',
        reason: 'test',
        status: 'pending',
        createdAt: new Date(),
      }

      await act(async () => { renderApp() })
      const acceptBtn = screen.getByTestId('accept-handoff')
      await act(async () => {
        fireEvent.click(acceptBtn)
      })
      expect(mockResolveHandoff).toHaveBeenCalledWith(true, 'summary')
    })

    it('reject handoff calls resolveHandoff with false', async () => {
      mockActiveHandoff = {
        id: 'h1',
        fromAgent: 'agent-a',
        toAgent: 'agent-b',
        taskId: 't1',
        reason: 'test',
        status: 'pending',
        createdAt: new Date(),
      }

      await act(async () => { renderApp() })
      const rejectBtn = screen.getByTestId('reject-handoff')
      await act(async () => {
        fireEvent.click(rejectBtn)
      })
      expect(mockResolveHandoff).toHaveBeenCalledWith(false)
    })

    it('close handoff calls clearActiveHandoff', async () => {
      mockActiveHandoff = {
        id: 'h1',
        fromAgent: 'agent-a',
        toAgent: 'agent-b',
        taskId: 't1',
        reason: 'test',
        status: 'pending',
        createdAt: new Date(),
      }

      await act(async () => { renderApp() })
      const closeBtn = screen.getByTestId('close-handoff')
      await act(async () => {
        fireEvent.click(closeBtn)
      })
      expect(mockClearActiveHandoff).toHaveBeenCalledTimes(1)
    })
  })

  describe('cleanup', () => {
    it('removes keyboard event listener on unmount', async () => {
      const addSpy = vi.spyOn(window, 'addEventListener')
      const removeSpy = vi.spyOn(window, 'removeEventListener')

      let unmount: () => void
      await act(async () => {
        const result = renderApp()
        unmount = result.unmount
      })

      const keydownAddCalls = addSpy.mock.calls.filter(c => c[0] === 'keydown').length
      expect(keydownAddCalls).toBeGreaterThan(0)

      await act(async () => { unmount() })

      const keydownRemoveCalls = removeSpy.mock.calls.filter(c => c[0] === 'keydown').length
      expect(keydownRemoveCalls).toBeGreaterThan(0)

      addSpy.mockRestore()
      removeSpy.mockRestore()
    })

    it('removes custom event listeners on unmount', async () => {
      const addSpy = vi.spyOn(window, 'addEventListener')
      const removeSpy = vi.spyOn(window, 'removeEventListener')

      let unmount: () => void
      await act(async () => {
        const result = renderApp()
        unmount = result.unmount
      })

      const customEvents = ['open-search-panel', 'search-in-folder', 'toggle-zen-mode', 'toggle-theme']
      for (const evt of customEvents) {
        const added = addSpy.mock.calls.some(c => c[0] === evt)
        expect(added).toBe(true)
      }

      await act(async () => { unmount() })

      for (const evt of customEvents) {
        const removed = removeSpy.mock.calls.some(c => c[0] === evt)
        expect(removed).toBe(true)
      }

      addSpy.mockRestore()
      removeSpy.mockRestore()
    })
  })
})

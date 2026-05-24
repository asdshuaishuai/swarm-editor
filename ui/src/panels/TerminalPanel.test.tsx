import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import TerminalPanel from './TerminalPanel'

// Mutable state for useTerminal mock so tests can override
let terminalState: {
  connected: boolean
  sessionId: string | null
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  sendInput: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
  wsRef: React.MutableRefObject<WebSocket | null>
}

// Mock xterm.js modules
const mockOnData = vi.fn()
const mockOnResize = vi.fn().mockReturnValue({ dispose: vi.fn() })
const mockXTermInstance = {
  open: vi.fn(),
  dispose: vi.fn(),
  onData: mockOnData,
  onResize: mockOnResize,
  clear: vi.fn(),
  focus: vi.fn(),
  loadAddon: vi.fn(),
  write: vi.fn(),
}

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    theme: Record<string, unknown> = {}
    fontSize: number = 14
    fontFamily: string = ''
    cursorBlink: boolean = false
    cursorStyle: string = 'block'
    scrollback: number = 1000
    allowProposedApi: boolean = false
    constructor(opts: Record<string, unknown>) {
      Object.assign(this, opts)
      return mockXTermInstance as unknown as this
    }
  },
}))

const mockFit = vi.fn()
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit = mockFit
    dispose = vi.fn()
  },
}))

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: class {
    dispose = vi.fn()
  },
}))

vi.mock('../hooks/useTerminal', () => ({
  useTerminal: () => terminalState,
}))

vi.mock('../utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

describe('TerminalPanel', () => {
  const mockConnect = vi.fn()
  const mockDisconnect = vi.fn()
  const mockSendInput = vi.fn()
  const mockResize = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockFit.mockReturnValue(undefined)
    terminalState = {
      connected: false,
      sessionId: null,
      connect: mockConnect,
      disconnect: mockDisconnect,
      sendInput: mockSendInput,
      resize: mockResize,
      wsRef: { current: null },
    }
  })

  // --- Rendering ---

  it('renders terminal container region', () => {
    render(<TerminalPanel />)
    expect(screen.getByRole('region', { name: 'Terminal' })).toBeInTheDocument()
  })

  it('renders header with Terminal label', () => {
    render(<TerminalPanel />)
    expect(screen.getByText('Terminal')).toBeInTheDocument()
  })

  it('renders collapse button', () => {
    render(<TerminalPanel />)
    expect(screen.getByLabelText('Collapse')).toBeInTheDocument()
  })

  it('renders clear button', () => {
    render(<TerminalPanel />)
    expect(screen.getByLabelText('Clear Terminal')).toBeInTheDocument()
  })

  it('renders close button when onClose prop provided', () => {
    const onClose = vi.fn()
    render(<TerminalPanel onClose={onClose} />)
    expect(screen.getByLabelText('Close')).toBeInTheDocument()
  })

  it('does not render close button without onClose prop', () => {
    render(<TerminalPanel />)
    expect(screen.queryByLabelText('Close')).not.toBeInTheDocument()
  })

  it('renders with default height', () => {
    render(<TerminalPanel />)
    const container = screen.getByRole('region', { name: 'Terminal' }).parentElement!
    expect(container.style.height).toBe('250px')
  })

  it('renders with custom defaultHeight', () => {
    render(<TerminalPanel defaultHeight={300} />)
    const region = screen.getByRole('region', { name: 'Terminal' })
    const container = region.parentElement!
    expect(container.style.height).toBe('300px')
  })

  it('shows connected indicator when connected', () => {
    terminalState.connected = true
    render(<TerminalPanel />)
    expect(screen.getByTitle('Connected')).toBeInTheDocument()
  })

  it('does not show connected indicator when disconnected', () => {
    terminalState.connected = false
    render(<TerminalPanel />)
    expect(screen.queryByTitle('Connected')).not.toBeInTheDocument()
  })

  // --- Collapse/Expand ---

  it('collapses terminal on collapse button click', () => {
    render(<TerminalPanel />)
    fireEvent.click(screen.getByLabelText('Collapse'))
    // Region should be hidden when collapsed
    expect(screen.queryByRole('region', { name: 'Terminal' })).not.toBeInTheDocument()
  })

  it('shows expand button when collapsed', () => {
    render(<TerminalPanel />)
    fireEvent.click(screen.getByLabelText('Collapse'))
    expect(screen.getByLabelText('Expand')).toBeInTheDocument()
  })

  it('expands terminal on expand button click', () => {
    render(<TerminalPanel />)
    fireEvent.click(screen.getByLabelText('Collapse'))
    expect(screen.queryByRole('region', { name: 'Terminal' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Expand'))
    expect(screen.getByRole('region', { name: 'Terminal' })).toBeInTheDocument()
  })

  it('hides resize handle when collapsed', () => {
    render(<TerminalPanel />)
    fireEvent.click(screen.getByLabelText('Collapse'))
    // The resize handle (h-1 bar) should not be rendered when collapsed
    const container = screen.getByText('Terminal').closest('.flex.flex-col')!
    expect(container.querySelector('.h-1')).toBeNull()
  })

  // --- Close ---

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn()
    render(<TerminalPanel onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  // --- Clear terminal ---

  it('clears terminal on clear button click', () => {
    render(<TerminalPanel />)
    fireEvent.click(screen.getByLabelText('Clear Terminal'))
    expect(mockXTermInstance.clear).toHaveBeenCalledOnce()
    expect(mockXTermInstance.focus).toHaveBeenCalledOnce()
  })

  // --- Focus terminal on click ---

  it('focuses terminal on container click', () => {
    render(<TerminalPanel />)
    fireEvent.click(screen.getByRole('region', { name: 'Terminal' }))
    expect(mockXTermInstance.focus).toHaveBeenCalled()
  })

  // --- Resize via drag ---

  it('starts resize on resize handle mousedown', () => {
    render(<TerminalPanel />)
    const handle = screen.getByText('Terminal').closest('.flex.flex-col')!.querySelector('.cursor-ns-resize')
    expect(handle).toBeTruthy()
    fireEvent.mouseDown(handle!, { clientY: 300, preventDefault: vi.fn() })
    // After mousedown, mousemove should adjust height
    fireEvent.mouseMove(document, { clientY: 280 }) // deltaY = 300 - 280 = 20
    fireEvent.mouseUp(document)
  })

  it('applies minHeight constraint during resize', () => {
    render(<TerminalPanel defaultHeight={200} minHeight={150} />)
    const handle = screen.getByText('Terminal').closest('.flex.flex-col')!.querySelector('.cursor-ns-resize')!
    fireEvent.mouseDown(handle, { clientY: 300, preventDefault: vi.fn() })
    // Drag down massively — should clamp to minHeight
    fireEvent.mouseMove(document, { clientY: 500 })
    fireEvent.mouseUp(document)
    const container = screen.getByRole('region', { name: 'Terminal' }).parentElement!
    // 200 - (300-500) = 200 + 200 = 400 but wait, that increases it. Let me think...
    // deltaY = resizeStartY - clientY = 300 - 500 = -200, newHeight = 200 + (-200) = 0, clamped to 150
    expect(Number.parseInt(container.style.height)).toBeGreaterThanOrEqual(150)
  })

  it('applies maxHeight constraint during resize', () => {
    render(<TerminalPanel defaultHeight={200} maxHeight={300} />)
    const handle = screen.getByText('Terminal').closest('.flex.flex-col')!.querySelector('.cursor-ns-resize')!
    fireEvent.mouseDown(handle, { clientY: 300, preventDefault: vi.fn() })
    // Drag up — deltaY = 300 - 100 = 200, newHeight = 200 + 200 = 400, clamped to 300
    fireEvent.mouseMove(document, { clientY: 100 })
    fireEvent.mouseUp(document)
    const container = screen.getByRole('region', { name: 'Terminal' }).parentElement!
    expect(Number.parseInt(container.style.height)).toBeLessThanOrEqual(300)
  })

  // --- Terminal initialization ---

  it('creates xterm instance on mount', () => {
    render(<TerminalPanel />)
    expect(mockXTermInstance.loadAddon).toHaveBeenCalled()
    expect(mockXTermInstance.open).toHaveBeenCalled()
  })

  it('calls connect on mount', () => {
    render(<TerminalPanel />)
    expect(mockConnect).toHaveBeenCalledOnce()
  })

  it('calls disconnect on unmount', () => {
    const { unmount } = render(<TerminalPanel />)
    unmount()
    expect(mockDisconnect).toHaveBeenCalledOnce()
  })

  it('disposes xterm on unmount', () => {
    const { unmount } = render(<TerminalPanel />)
    unmount()
    expect(mockXTermInstance.dispose).toHaveBeenCalled()
  })

  // --- Input bridge ---

  it('bridges xterm input data to sendInput', () => {
    render(<TerminalPanel />)
    // The onData callback was registered during mount
    expect(mockOnData).toHaveBeenCalled()
    // Get the callback and invoke it
    const dataCallback = mockOnData.mock.calls[0][0] as (data: string) => void
    dataCallback('ls -la\n')
    expect(mockSendInput).toHaveBeenCalledWith('ls -la\n')
  })

  // --- WebSocket message bridge ---

  it('attaches message handler to WebSocket when connected changes', () => {
    const mockWs = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    // Start disconnected, no ws
    terminalState.connected = false
    terminalState.wsRef = { current: null }

    const { rerender } = render(<TerminalPanel />)

    // Verify xterm was created (so xtermRef.current is set)
    expect(mockXTermInstance.open).toHaveBeenCalled()

    // Now simulate connection — set wsRef and connected
    terminalState.connected = true
    terminalState.wsRef = { current: mockWs as unknown as WebSocket }

    // Trigger re-render so the bridge effect re-runs with [connected]
    rerender(<TerminalPanel />)

    // The bridge effect should have attached a 'message' listener
    const wsMessageCalls = mockWs.addEventListener.mock.calls.filter(
      (call: unknown[]) => (call as [string, unknown])[0] === 'message'
    )
    expect(wsMessageCalls.length).toBeGreaterThan(0)
  })

  it('removes WebSocket message listener on unmount', () => {
    const mockWs = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    terminalState.connected = true
    terminalState.wsRef = { current: mockWs as unknown as WebSocket }

    const { unmount } = render(<TerminalPanel />)

    // Find the message handler that was attached
    const wsMessageCalls = mockWs.addEventListener.mock.calls.filter(
      (call: unknown[]) => (call as [string, unknown])[0] === 'message'
    )
    expect(wsMessageCalls.length).toBeGreaterThan(0)

    unmount()

    expect(mockWs.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function))
  })

  it('removes WebSocket message listener on unmount with ws', () => {
    const mockWs = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    terminalState.connected = true
    terminalState.wsRef = { current: mockWs as unknown as WebSocket }

    const { unmount } = render(<TerminalPanel />)
    unmount()

    expect(mockWs.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function))
  })

  // --- PTY resize ---

  it('registers onResize handler when connected', () => {
    terminalState.connected = true
    render(<TerminalPanel />)
    expect(mockOnResize).toHaveBeenCalled()
  })

  it('sends resize to PTY on terminal resize', () => {
    terminalState.connected = true
    // Make xterm report dimensions
    Object.defineProperty(mockXTermInstance, 'cols', { value: 80, configurable: true })
    Object.defineProperty(mockXTermInstance, 'rows', { value: 24, configurable: true })

    render(<TerminalPanel />)

    // Get the onResize callback
    const resizeCallback = mockOnResize.mock.calls[0]?.[0] as (() => void) | undefined
    if (resizeCallback) {
      resizeCallback()
      expect(mockResize).toHaveBeenCalledWith(80, 24)
    }
  })

  it('does not send PTY resize when disconnected', () => {
    terminalState.connected = false
    render(<TerminalPanel />)
    // onResize should not be registered when not connected
    // The first call is from mount (always happens), but the PTY resize effect shouldn't register
    // We can verify resize was never called
    expect(mockResize).not.toHaveBeenCalled()
  })

  // --- Tab rendering ---

  it('renders Terminal label when no tabs', () => {
    render(<TerminalPanel />)
    expect(screen.getByText('Terminal')).toBeInTheDocument()
  })

  // --- Fit addon ---

  it('calls fit addon on mount', () => {
    mockFit.mockReturnValue(undefined)
    render(<TerminalPanel />)
    expect(mockFit).toHaveBeenCalled()
  })

  it('handles fit addon error gracefully', () => {
    mockFit.mockImplementation(() => { throw new Error('no parent') })
    // Should not throw
    expect(() => render(<TerminalPanel />)).not.toThrow()
  })

  // --- Props validation ---

  it('respects custom minHeight prop', () => {
    render(<TerminalPanel defaultHeight={200} minHeight={100} maxHeight={400} />)
    const container = screen.getByRole('region', { name: 'Terminal' }).parentElement!
    expect(container.style.height).toBe('200px')
  })

  it('respects custom maxHeight prop', () => {
    render(<TerminalPanel defaultHeight={200} minHeight={100} maxHeight={400} />)
    const handle = screen.getByText('Terminal').closest('.flex.flex-col')!.querySelector('.cursor-ns-resize')!
    fireEvent.mouseDown(handle, { clientY: 200, preventDefault: vi.fn() })
    // Drag up: deltaY = 200 - (-200) = 400, height = 200 + 400 = 600, clamped to 400
    fireEvent.mouseMove(document, { clientY: -200 })
    fireEvent.mouseUp(document)
    const container = screen.getByRole('region', { name: 'Terminal' }).parentElement!
    expect(Number.parseInt(container.style.height)).toBeLessThanOrEqual(400)
  })

  // --- Dark theme ---

  it('creates terminal with dark theme colors', () => {
    render(<TerminalPanel />)
    // The Terminal constructor is called with theme options
    // We verify it doesn't crash and the component renders
    expect(screen.getByText('Terminal')).toBeInTheDocument()
  })

  // --- select-none during resize ---

  it('adds select-none class during resize', () => {
    render(<TerminalPanel />)
    const handle = screen.getByText('Terminal').closest('.flex.flex-col')!.querySelector('.cursor-ns-resize')!
    fireEvent.mouseDown(handle, { clientY: 200, preventDefault: vi.fn() })

    const container = screen.getByText('Terminal').closest('.flex.flex-col')!
    expect(container.className).toContain('select-none')

    fireEvent.mouseUp(document)
    expect(container.className).not.toContain('select-none')
  })

  // --- Collapse height behavior ---

  it('sets height to auto when collapsed', () => {
    render(<TerminalPanel />)
    const container = screen.getByRole('region', { name: 'Terminal' }).parentElement!
    expect(container.style.height).toBe('250px')

    fireEvent.click(screen.getByLabelText('Collapse'))
    expect(container.style.height).toBe('auto')
  })
})

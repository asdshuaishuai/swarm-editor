import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import TerminalPanel from './TerminalPanel'

// Mock xterm.js modules
const mockXTermInstance = {
  open: vi.fn(),
  dispose: vi.fn(),
  onData: vi.fn(),
  onResize: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  clear: vi.fn(),
  focus: vi.fn(),
  loadAddon: vi.fn(),
}

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    constructor() { return mockXTermInstance }
  },
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit = vi.fn()
    dispose = vi.fn()
  },
}))

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: class {
    dispose = vi.fn()
  },
}))

vi.mock('../hooks/useTerminal', () => ({
  useTerminal: () => ({
    connected: false,
    sessionId: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendInput: vi.fn(),
    resize: vi.fn(),
    wsRef: { current: null },
  }),
}))

describe('TerminalPanel', () => {
  it('should render terminal container', () => {
    render(<TerminalPanel />)
    expect(screen.getByRole('region', { name: 'Terminal' })).toBeInTheDocument()
  })

  it('should render header with Terminal label', () => {
    render(<TerminalPanel />)
    expect(screen.getByText('Terminal')).toBeInTheDocument()
  })

  it('should render collapse button', () => {
    render(<TerminalPanel />)
    expect(screen.getByLabelText('Collapse')).toBeInTheDocument()
  })

  it('should call onClose when close button clicked', () => {
    const onClose = vi.fn()
    render(<TerminalPanel onClose={onClose} />)
    screen.getByLabelText('Close').click()
    expect(onClose).toHaveBeenCalled()
  })
})

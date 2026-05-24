import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AgentConfigModal from './AgentConfigModal'

const mockAddAgent = vi.fn().mockResolvedValue({})
const mockUpdateAgent = vi.fn().mockResolvedValue({})
const mockAddToast = vi.fn()

vi.mock('../services', () => ({
  api: {
    agent: {
      addAgent: (...args: any[]) => mockAddAgent(...args),
      updateAgent: (...args: any[]) => mockUpdateAgent(...args),
    },
  },
}))

vi.mock('../utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('../store/appStore', () => ({
  useAppStore: (selector: any) => selector({ addToast: mockAddToast }),
}))

vi.mock('lucide-react', () => ({
  Bot: () => <span data-testid="bot-icon" />,
  Loader2: (props: any) => <span data-testid="loader" className={props.className} />,
  X: () => <span data-testid="x-icon" />,
}))

describe('AgentConfigModal', () => {
  const onClose = vi.fn()
  const onSaved = vi.fn()

  beforeEach(() => vi.clearAllMocks())

  it('renders "Add New Agent" title for new agent', () => {
    render(<AgentConfigModal onClose={onClose} onSaved={onSaved} />)
    expect(screen.getByText('Add New Agent')).toBeInTheDocument()
  })

  it('renders "Edit Agent" title when editing', () => {
    render(
      <AgentConfigModal
        agent={{ id: 'test', name: 'Test Agent', command: '/bin/test', enabled: true }}
        onClose={onClose}
        onSaved={onSaved}
      />,
    )
    expect(screen.getByText('Edit Agent')).toBeInTheDocument()
  })

  it('has role=dialog', () => {
    render(<AgentConfigModal onClose={onClose} onSaved={onSaved} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes on X button click', () => {
    render(<AgentConfigModal onClose={onClose} onSaved={onSaved} />)
    fireEvent.click(screen.getByTestId('x-icon'))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Cancel click', () => {
    render(<AgentConfigModal onClose={onClose} onSaved={onSaved} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows required field labels', () => {
    render(<AgentConfigModal onClose={onClose} onSaved={onSaved} />)
    expect(screen.getByText('Agent ID *')).toBeInTheDocument()
    expect(screen.getByText('Display Name *')).toBeInTheDocument()
    expect(screen.getByText('Command Path *')).toBeInTheDocument()
  })

  it('shows swarm config section', () => {
    render(<AgentConfigModal onClose={onClose} onSaved={onSaved} />)
    expect(screen.getByText('Swarm Configuration')).toBeInTheDocument()
    expect(screen.getByText('Can be Coordinator')).toBeInTheDocument()
    expect(screen.getByText('Can be Worker')).toBeInTheDocument()
  })

  it('shows preferred roles checkboxes', () => {
    render(<AgentConfigModal onClose={onClose} onSaved={onSaved} />)
    expect(screen.getByText('coder')).toBeInTheDocument()
    expect(screen.getByText('reviewer')).toBeInTheDocument()
    expect(screen.getByText('tester')).toBeInTheDocument()
    expect(screen.getByText('architect')).toBeInTheDocument()
  })

  it('shows validation error when required fields are empty', () => {
    render(<AgentConfigModal onClose={onClose} onSaved={onSaved} />)
    fireEvent.click(screen.getByText('Add Agent'))
    expect(screen.getByText('ID, Name, and Command are required')).toBeInTheDocument()
  })

  it('calls addAgent when creating new agent', async () => {
    render(<AgentConfigModal onClose={onClose} onSaved={onSaved} />)
    fireEvent.change(screen.getByPlaceholderText('claude-code'), { target: { value: 'test-agent' } })
    fireEvent.change(screen.getByPlaceholderText('Claude Code'), { target: { value: 'Test Agent' } })
    fireEvent.change(screen.getByPlaceholderText('/usr/local/bin/claude-code'), { target: { value: '/bin/test' } })
    fireEvent.click(screen.getByText('Add Agent'))
    await screen.findByText('Add Agent')
    expect(mockAddAgent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'test-agent', name: 'Test Agent', command: '/bin/test' }),
    )
  })

  it('populates form from defaults', () => {
    render(
      <AgentConfigModal
        defaults={{ id: 'scanner-1', name: 'Scanned Agent', command: '/usr/bin/scan' }}
        onClose={onClose}
        onSaved={onSaved}
      />,
    )
    expect(screen.getByDisplayValue('scanner-1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Scanned Agent')).toBeInTheDocument()
    expect(screen.getByDisplayValue('/usr/bin/scan')).toBeInTheDocument()
  })

  it('disables Agent ID input when editing existing agent', () => {
    render(
      <AgentConfigModal
        agent={{ id: 'existing', name: 'Existing', command: '/bin/existing', enabled: true }}
        onClose={onClose}
        onSaved={onSaved}
      />,
    )
    expect(screen.getByDisplayValue('existing').closest('input')?.disabled).toBe(true)
  })

  it('shows Save Changes button when editing', () => {
    render(
      <AgentConfigModal
        agent={{ id: 'x', name: 'X', command: '/bin/x', enabled: true }}
        onClose={onClose}
        onSaved={onSaved}
      />,
    )
    expect(screen.getByText('Save Changes')).toBeInTheDocument()
  })
})

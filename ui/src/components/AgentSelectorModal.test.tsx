import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AgentSelectorModal } from './AgentSelectorModal'

vi.mock('lucide-react', () => ({
  X: () => <svg data-testid="x-icon" />,
  Zap: () => <svg data-testid="zap-icon" />,
}))

const swarms = [
  { id: 's1', name: 'Dev Team', agents: [{ id: 'a1', name: 'A1', type: 'coder', state: 'idle' }, { id: 'a2', name: 'A2', type: 'coder', state: 'idle' }], topology: 'star' },
  { id: 's2', name: 'Test Team', agents: [{ id: 'a3', name: 'A3', type: 'reviewer', state: 'idle' }], topology: 'mesh' },
]

const defaults = {
  swarms,
  onSelect: vi.fn(),
  onClose: vi.fn(),
}

describe('AgentSelectorModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders modal with title', () => {
    render(<AgentSelectorModal {...defaults} />)
    expect(screen.getByText('Select Execution Mode')).toBeInTheDocument()
  })

  it('lists swarm options', () => {
    render(<AgentSelectorModal {...defaults} />)
    expect(screen.getByText('Dev Team')).toBeInTheDocument()
    expect(screen.getByText('Test Team')).toBeInTheDocument()
  })

  it('shows agent count and topology', () => {
    render(<AgentSelectorModal {...defaults} />)
    expect(screen.getByText('2 agents • star')).toBeInTheDocument()
    expect(screen.getByText('1 agents • mesh')).toBeInTheDocument()
  })

  it('calls onSelect with swarmId when swarm clicked', () => {
    render(<AgentSelectorModal {...defaults} />)
    fireEvent.click(screen.getByText('Dev Team'))
    expect(defaults.onSelect).toHaveBeenCalledWith('s1')
  })

  it('calls onClose when close button clicked', () => {
    render(<AgentSelectorModal {...defaults} />)
    fireEvent.click(screen.getByLabelText('Close modal'))
    expect(defaults.onClose).toHaveBeenCalled()
  })

  it('shows Execute Directly option', () => {
    render(<AgentSelectorModal {...defaults} />)
    expect(screen.getByText('Execute Directly')).toBeInTheDocument()
  })

  it('calls onSelect with undefined when Execute Directly clicked', () => {
    render(<AgentSelectorModal {...defaults} />)
    fireEvent.click(screen.getByText('Execute Directly'))
    expect(defaults.onSelect).toHaveBeenCalledWith(undefined)
  })

  it('shows empty message when no swarms', () => {
    render(<AgentSelectorModal {...defaults} swarms={[]} />)
    expect(screen.getByText(/No swarms available/)).toBeInTheDocument()
  })

  it('has dialog role', () => {
    render(<AgentSelectorModal {...defaults} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

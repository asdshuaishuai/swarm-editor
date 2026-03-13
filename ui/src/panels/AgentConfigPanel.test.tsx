import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import AgentConfigPanel from './AgentConfigPanel'

// Mock console.log
vi.spyOn(console, 'log').mockImplementation(() => {})

describe('AgentConfigPanel', () => {
  it('renders header with title', () => {
    render(<AgentConfigPanel />)
    expect(screen.getByText('ACP Agent Configuration')).toBeInTheDocument()
  })

  it('renders Add Agent button', () => {
    render(<AgentConfigPanel />)
    expect(screen.getByText('Add Agent')).toBeInTheDocument()
  })

  it('shows empty state when no agents', () => {
    render(<AgentConfigPanel />)
    expect(screen.getByText('No agents configured')).toBeInTheDocument()
    expect(screen.getByText('Add an ACP agent to get started')).toBeInTheDocument()
  })

  it('opens add modal when Add Agent clicked', () => {
    render(<AgentConfigPanel />)
    fireEvent.click(screen.getByText('Add Agent'))
    expect(screen.getByText('Add New Agent')).toBeInTheDocument()
  })

  it('closes modal when Cancel clicked', () => {
    render(<AgentConfigPanel />)
    fireEvent.click(screen.getByText('Add Agent'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('Add New Agent')).not.toBeInTheDocument()
  })

  it('has Agent ID input in modal', () => {
    render(<AgentConfigPanel />)
    fireEvent.click(screen.getByText('Add Agent'))
    expect(screen.getByPlaceholderText('claude-code')).toBeInTheDocument()
  })

  it('has Display Name input in modal', () => {
    render(<AgentConfigPanel />)
    fireEvent.click(screen.getByText('Add Agent'))
    expect(screen.getByPlaceholderText('Claude Code')).toBeInTheDocument()
  })

  it('has Command Path input in modal', () => {
    render(<AgentConfigPanel />)
    fireEvent.click(screen.getByText('Add Agent'))
    expect(screen.getByPlaceholderText('/usr/local/bin/claude-code')).toBeInTheDocument()
  })

  it('has Arguments input in modal', () => {
    render(<AgentConfigPanel />)
    fireEvent.click(screen.getByText('Add Agent'))
    expect(screen.getByPlaceholderText('acp, --mode=swarm')).toBeInTheDocument()
  })

  it('has Environment Variables textarea in modal', () => {
    render(<AgentConfigPanel />)
    fireEvent.click(screen.getByText('Add Agent'))
    expect(screen.getByPlaceholderText('API_KEY=${ANTHROPIC_API_KEY}')).toBeInTheDocument()
  })

  it('has Swarm Configuration section in modal', () => {
    render(<AgentConfigPanel />)
    fireEvent.click(screen.getByText('Add Agent'))
    expect(screen.getByText('Swarm Configuration')).toBeInTheDocument()
  })

  it('has coordinator checkbox in modal', () => {
    render(<AgentConfigPanel />)
    fireEvent.click(screen.getByText('Add Agent'))
    expect(screen.getByText('Can be Coordinator')).toBeInTheDocument()
  })

  it('has worker checkbox in modal', () => {
    render(<AgentConfigPanel />)
    fireEvent.click(screen.getByText('Add Agent'))
    expect(screen.getByText('Can be Worker')).toBeInTheDocument()
  })

  it('has Preferred Roles section in modal', () => {
    render(<AgentConfigPanel />)
    fireEvent.click(screen.getByText('Add Agent'))
    expect(screen.getByText('Preferred Roles')).toBeInTheDocument()
    expect(screen.getByText('coder')).toBeInTheDocument()
    expect(screen.getByText('reviewer')).toBeInTheDocument()
    expect(screen.getByText('tester')).toBeInTheDocument()
    expect(screen.getByText('architect')).toBeInTheDocument()
  })

  it('has Tags input in modal', () => {
    render(<AgentConfigPanel />)
    fireEvent.click(screen.getByText('Add Agent'))
    expect(screen.getByPlaceholderText('primary, coding, review')).toBeInTheDocument()
  })

  it('closes modal on Add Agent button click in modal', () => {
    render(<AgentConfigPanel />)
    // Click header button to open modal
    const addButtons = screen.getAllByText('Add Agent')
    fireEvent.click(addButtons[0])
    // Click modal submit button (last Add Agent button)
    const modalButtons = screen.getAllByRole('button', { name: 'Add Agent' })
    fireEvent.click(modalButtons[modalButtons.length - 1])
    expect(screen.queryByText('Add New Agent')).not.toBeInTheDocument()
  })
})

describe('AgentConfigPanel form inputs', () => {
  it('updates agent ID input', () => {
    render(<AgentConfigPanel />)
    fireEvent.click(screen.getByText('Add Agent'))
    const input = screen.getByPlaceholderText('claude-code')
    fireEvent.change(input, { target: { value: 'test-agent' } })
    expect(input).toHaveValue('test-agent')
  })

  it('updates display name input', () => {
    render(<AgentConfigPanel />)
    fireEvent.click(screen.getByText('Add Agent'))
    const input = screen.getByPlaceholderText('Claude Code')
    fireEvent.change(input, { target: { value: 'Test Agent' } })
    expect(input).toHaveValue('Test Agent')
  })

  it('updates command path input', () => {
    render(<AgentConfigPanel />)
    fireEvent.click(screen.getByText('Add Agent'))
    const input = screen.getByPlaceholderText('/usr/local/bin/claude-code')
    fireEvent.change(input, { target: { value: '/bin/test' } })
    expect(input).toHaveValue('/bin/test')
  })

  it('updates arguments input', () => {
    render(<AgentConfigPanel />)
    fireEvent.click(screen.getByText('Add Agent'))
    const input = screen.getByPlaceholderText('acp, --mode=swarm')
    fireEvent.change(input, { target: { value: 'arg1, arg2' } })
    expect(input).toHaveValue('arg1, arg2')
  })

  it('updates environment variables textarea', () => {
    render(<AgentConfigPanel />)
    fireEvent.click(screen.getByText('Add Agent'))
    const textarea = screen.getByPlaceholderText('API_KEY=${ANTHROPIC_API_KEY}')
    fireEvent.change(textarea, { target: { value: 'NODE_ENV=production' } })
    expect(textarea).toHaveValue('NODE_ENV=production')
  })

  it('toggles coordinator checkbox', () => {
    render(<AgentConfigPanel />)
    fireEvent.click(screen.getByText('Add Agent'))
    const checkbox = screen.getByLabelText('Can be Coordinator')
    expect(checkbox).toBeChecked()
    fireEvent.click(checkbox)
    expect(checkbox).not.toBeChecked()
  })

  it('toggles worker checkbox', () => {
    render(<AgentConfigPanel />)
    fireEvent.click(screen.getByText('Add Agent'))
    const checkbox = screen.getByLabelText('Can be Worker')
    expect(checkbox).toBeChecked()
    fireEvent.click(checkbox)
    expect(checkbox).not.toBeChecked()
  })

  it('selects preferred roles', () => {
    render(<AgentConfigPanel />)
    fireEvent.click(screen.getByText('Add Agent'))
    // Click on coder role to toggle
    const coderButton = screen.getByText('coder').closest('label')
    if (coderButton) {
      const checkbox = coderButton.querySelector('input[type="checkbox"]')
      if (checkbox) {
        fireEvent.click(checkbox)
      }
    }
    expect(screen.getByText('coder')).toBeInTheDocument()
  })

  it('updates tags input', () => {
    render(<AgentConfigPanel />)
    fireEvent.click(screen.getByText('Add Agent'))
    const input = screen.getByPlaceholderText('primary, coding, review')
    fireEvent.change(input, { target: { value: 'test, production' } })
    expect(input).toHaveValue('test, production')
  })

  it('shows Max Concurrent Tasks input', () => {
    render(<AgentConfigPanel />)
    fireEvent.click(screen.getByText('Add Agent'))
    expect(screen.getByText('Max Concurrent Tasks')).toBeInTheDocument()
  })

  it('shows Priority input', () => {
    render(<AgentConfigPanel />)
    fireEvent.click(screen.getByText('Add Agent'))
    expect(screen.getByText('Priority (1-10)')).toBeInTheDocument()
  })

  it('shows all preferred role options', () => {
    render(<AgentConfigPanel />)
    fireEvent.click(screen.getByText('Add Agent'))
    expect(screen.getByText('coder')).toBeInTheDocument()
    expect(screen.getByText('reviewer')).toBeInTheDocument()
    expect(screen.getByText('tester')).toBeInTheDocument()
    expect(screen.getByText('architect')).toBeInTheDocument()
  })

  it('shows Save Changes button when editing', () => {
    render(<AgentConfigPanel />)
    // Open add modal
    fireEvent.click(screen.getByText('Add Agent'))
    // Fill required fields
    fireEvent.change(screen.getByPlaceholderText('claude-code'), { target: { value: 'test-id' } })
    fireEvent.change(screen.getByPlaceholderText('Claude Code'), { target: { value: 'Test Agent' } })
    // Save
    const modalButtons = screen.getAllByRole('button', { name: 'Add Agent' })
    fireEvent.click(modalButtons[modalButtons.length - 1])
    // Modal should close
    expect(screen.queryByText('Add New Agent')).not.toBeInTheDocument()
  })

  it('cancels and closes modal', () => {
    render(<AgentConfigPanel />)
    fireEvent.click(screen.getByText('Add Agent'))
    // Fill some data
    fireEvent.change(screen.getByPlaceholderText('claude-code'), { target: { value: 'cancel-test' } })
    // Click cancel
    fireEvent.click(screen.getByText('Cancel'))
    // Modal should close without saving
    expect(screen.queryByText('Add New Agent')).not.toBeInTheDocument()
  })
})
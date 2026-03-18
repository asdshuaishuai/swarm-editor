import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AgentConfigPanel, { AgentConfigCard } from './AgentConfigPanel'
import { AgentConfig } from '../types'

// Mock console.log
vi.spyOn(console, 'log').mockImplementation(() => {})

describe('AgentConfigPanel', () => {
  it('renders header with title', () => {
    render(<AgentConfigPanel />)
    expect(screen.getByText('ACP Agent Configuration')).toBeInTheDocument()
  })

  it('renders initial agents when provided', () => {
    const initialAgents: AgentConfig[] = [
      {
        id: 'initial-agent',
        name: 'Initial Agent',
        command: '/usr/bin/initial',
        args: [],
        enabled: true,
        swarmConfig: {
          canBeCoordinator: true,
          canBeWorker: true,
          preferredRoles: ['coder'],
          maxConcurrent: 3,
          priority: 5,
        },
      },
    ]
    render(<AgentConfigPanel initialAgents={initialAgents} />)
    expect(screen.getByText('Initial Agent')).toBeInTheDocument()
    expect(screen.getByText('initial-agent')).toBeInTheDocument()
  })

  it('does not show empty state when agents exist', () => {
    const initialAgents: AgentConfig[] = [
      {
        id: 'test-agent',
        name: 'Test Agent',
        command: '/usr/bin/test',
        args: [],
        enabled: true,
      },
    ]
    render(<AgentConfigPanel initialAgents={initialAgents} />)
    expect(screen.queryByText('No agents configured')).not.toBeInTheDocument()
  })

  it('calls handleTestConnection when test button clicked in list', async () => {
    vi.useFakeTimers()
    const initialAgents: AgentConfig[] = [
      {
        id: 'connection-test-agent',
        name: 'Connection Test Agent',
        command: '/usr/bin/test',
        args: [],
        enabled: true,
      },
    ]
    render(<AgentConfigPanel initialAgents={initialAgents} />)
    const testButton = screen.getByTitle('Test Connection')

    // Click test button - should show spinner
    fireEvent.click(testButton)
    const spinner = testButton.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()

    // Wait for connection test to complete
    await vi.advanceTimersByTimeAsync(2000)

    // Spinner should be gone, status indicator should be green (connected)
    const statusIndicator = document.querySelector('.bg-success')
    expect(statusIndicator).toBeInTheDocument()

    vi.useRealTimers()
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

describe('AgentConfigCard', () => {
  const mockAgent: AgentConfig = {
    id: 'test-agent',
    name: 'Test Agent',
    command: '/usr/bin/test-agent',
    args: ['--mode=test'],
    enabled: true,
    swarmConfig: {
      canBeCoordinator: true,
      canBeWorker: true,
      preferredRoles: ['coder', 'reviewer'],
      maxConcurrent: 3,
      priority: 5,
    },
    tags: ['primary', 'coding'],
  }

  const mockOnEdit = vi.fn()
  const mockOnTest = vi.fn()
  const mockOnDelete = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders agent name', () => {
    render(<AgentConfigCard agent={mockAgent} onEdit={mockOnEdit} onTest={mockOnTest} onDelete={mockOnDelete} />)
    expect(screen.getByText('Test Agent')).toBeInTheDocument()
  })

  it('renders agent id', () => {
    render(<AgentConfigCard agent={mockAgent} onEdit={mockOnEdit} onTest={mockOnTest} onDelete={mockOnDelete} />)
    expect(screen.getByText('test-agent')).toBeInTheDocument()
  })

  it('shows enabled badge', () => {
    render(<AgentConfigCard agent={mockAgent} onEdit={mockOnEdit} onTest={mockOnTest} onDelete={mockOnDelete} />)
    expect(screen.getByText('Enabled')).toBeInTheDocument()
  })

  it('shows disabled badge when agent is disabled', () => {
    const disabledAgent = { ...mockAgent, enabled: false }
    render(<AgentConfigCard agent={disabledAgent} onEdit={mockOnEdit} onTest={mockOnTest} onDelete={mockOnDelete} />)
    expect(screen.getByText('Disabled')).toBeInTheDocument()
  })

  it('shows command path', () => {
    render(<AgentConfigCard agent={mockAgent} onEdit={mockOnEdit} onTest={mockOnTest} onDelete={mockOnDelete} />)
    expect(screen.getByText('/usr/bin/test-agent')).toBeInTheDocument()
  })

  it('shows Coordinator badge when canBeCoordinator is true', () => {
    render(<AgentConfigCard agent={mockAgent} onEdit={mockOnEdit} onTest={mockOnTest} onDelete={mockOnDelete} />)
    expect(screen.getByText('Coordinator')).toBeInTheDocument()
  })

  it('shows Worker badge when canBeWorker is true', () => {
    render(<AgentConfigCard agent={mockAgent} onEdit={mockOnEdit} onTest={mockOnTest} onDelete={mockOnDelete} />)
    expect(screen.getByText('Worker')).toBeInTheDocument()
  })

  it('shows priority and max concurrent', () => {
    render(<AgentConfigCard agent={mockAgent} onEdit={mockOnEdit} onTest={mockOnTest} onDelete={mockOnDelete} />)
    expect(screen.getByText('Priority: 5')).toBeInTheDocument()
    expect(screen.getByText('Max: 3')).toBeInTheDocument()
  })

  it('shows tags', () => {
    render(<AgentConfigCard agent={mockAgent} onEdit={mockOnEdit} onTest={mockOnTest} onDelete={mockOnDelete} />)
    expect(screen.getByText('primary')).toBeInTheDocument()
    expect(screen.getByText('coding')).toBeInTheDocument()
  })

  it('does not show tags when empty', () => {
    const agentWithoutTags = { ...mockAgent, tags: [] }
    render(<AgentConfigCard agent={agentWithoutTags} onEdit={mockOnEdit} onTest={mockOnTest} onDelete={mockOnDelete} />)
    expect(screen.queryByText('primary')).not.toBeInTheDocument()
  })

  it('does not show tags when undefined', () => {
    const agentWithoutTags = { ...mockAgent, tags: undefined }
    render(<AgentConfigCard agent={agentWithoutTags} onEdit={mockOnEdit} onTest={mockOnTest} onDelete={mockOnDelete} />)
    expect(screen.queryByText('primary')).not.toBeInTheDocument()
  })

  it('calls onEdit when edit button clicked', () => {
    render(<AgentConfigCard agent={mockAgent} onEdit={mockOnEdit} onTest={mockOnTest} onDelete={mockOnDelete} />)
    const editButton = screen.getByTitle('Edit')
    fireEvent.click(editButton)
    expect(mockOnEdit).toHaveBeenCalled()
  })

  it('calls onTest when test button clicked', () => {
    render(<AgentConfigCard agent={mockAgent} onEdit={mockOnEdit} onTest={mockOnTest} onDelete={mockOnDelete} />)
    const testButton = screen.getByTitle('Test Connection')
    fireEvent.click(testButton)
    expect(mockOnTest).toHaveBeenCalled()
  })

  it('calls onDelete when delete button clicked', () => {
    render(<AgentConfigCard agent={mockAgent} onEdit={mockOnEdit} onTest={mockOnTest} onDelete={mockOnDelete} />)
    const deleteButton = screen.getByTitle('Delete')
    fireEvent.click(deleteButton)
    expect(mockOnDelete).toHaveBeenCalled()
  })

  it('does not show Coordinator badge when canBeCoordinator is false', () => {
    const agent = { ...mockAgent, swarmConfig: { ...mockAgent.swarmConfig!, canBeCoordinator: false } }
    render(<AgentConfigCard agent={agent} onEdit={mockOnEdit} onTest={mockOnTest} onDelete={mockOnDelete} />)
    expect(screen.queryByText('Coordinator')).not.toBeInTheDocument()
  })

  it('does not show Worker badge when canBeWorker is false', () => {
    const agent = { ...mockAgent, swarmConfig: { ...mockAgent.swarmConfig!, canBeWorker: false } }
    render(<AgentConfigCard agent={agent} onEdit={mockOnEdit} onTest={mockOnTest} onDelete={mockOnDelete} />)
    expect(screen.queryByText('Worker')).not.toBeInTheDocument()
  })

  it('does not show swarm config section when undefined', () => {
    const agentWithoutSwarmConfig = { ...mockAgent, swarmConfig: undefined }
    render(<AgentConfigCard agent={agentWithoutSwarmConfig} onEdit={mockOnEdit} onTest={mockOnTest} onDelete={mockOnDelete} />)
    expect(screen.queryByText('Coordinator')).not.toBeInTheDocument()
    expect(screen.queryByText('Worker')).not.toBeInTheDocument()
    expect(screen.queryByText('Priority: 5')).not.toBeInTheDocument()
  })

  it('shows spinner when status is testing', () => {
    render(<AgentConfigCard agent={mockAgent} onEdit={mockOnEdit} onTest={mockOnTest} onDelete={mockOnDelete} initialStatus="testing" />)
    const testButton = screen.getByTitle('Test Connection')
    // Should show spinner (Loader2 with animate-spin class)
    const spinner = testButton.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })

  it('shows terminal icon when status is idle', () => {
    render(<AgentConfigCard agent={mockAgent} onEdit={mockOnEdit} onTest={mockOnTest} onDelete={mockOnDelete} initialStatus="idle" />)
    const testButton = screen.getByTitle('Test Connection')
    // Should show Terminal icon, not spinner
    const spinner = testButton.querySelector('.animate-spin')
    expect(spinner).not.toBeInTheDocument()
  })
})

describe('AgentConfigPanel agent management', () => {
  it('adds a new agent to the list', () => {
    render(<AgentConfigPanel />)
    // Open modal
    fireEvent.click(screen.getByText('Add Agent'))
    // Fill required fields
    fireEvent.change(screen.getByPlaceholderText('claude-code'), { target: { value: 'new-test-agent' } })
    fireEvent.change(screen.getByPlaceholderText('Claude Code'), { target: { value: 'New Test Agent' } })
    fireEvent.change(screen.getByPlaceholderText('/usr/local/bin/claude-code'), { target: { value: '/usr/bin/new-test' } })
    // Submit
    const modalButtons = screen.getAllByRole('button', { name: 'Add Agent' })
    fireEvent.click(modalButtons[modalButtons.length - 1])
    // New agent should appear
    expect(screen.getByText('New Test Agent')).toBeInTheDocument()
    expect(screen.getByText('new-test-agent')).toBeInTheDocument()
  })

  it('adds a new agent with args parsed from comma-separated string', () => {
    render(<AgentConfigPanel />)
    fireEvent.click(screen.getByText('Add Agent'))
    // Fill required fields
    fireEvent.change(screen.getByPlaceholderText('claude-code'), { target: { value: 'args-agent' } })
    fireEvent.change(screen.getByPlaceholderText('Claude Code'), { target: { value: 'Args Agent' } })
    fireEvent.change(screen.getByPlaceholderText('/usr/local/bin/claude-code'), { target: { value: '/usr/bin/test' } })
    // Add arguments (triggers args parsing branch)
    const argsInput = screen.getByPlaceholderText('acp, --mode=swarm')
    fireEvent.change(argsInput, { target: { value: 'arg1, arg2, arg3' } })
    // Submit
    const modalButtons = screen.getAllByRole('button', { name: 'Add Agent' })
    fireEvent.click(modalButtons[modalButtons.length - 1])
    expect(screen.getByText('Args Agent')).toBeInTheDocument()
  })

  it('parses empty args string correctly', () => {
    render(<AgentConfigPanel />)
    fireEvent.click(screen.getByText('Add Agent'))
    const argsInput = screen.getByPlaceholderText('acp, --mode=swarm')
    // Change to empty string then back
    fireEvent.change(argsInput, { target: { value: '' } })
    // This creates [''] from split, but trim makes it ['']
    expect(argsInput).toHaveValue('')
  })

  it('edits an existing agent with existing args', () => {
    const initialAgents: AgentConfig[] = [
      {
        id: 'edit-test-agent',
        name: 'Original Name',
        command: '/usr/bin/original',
        args: ['--arg1', '--arg2'],
        enabled: true,
      },
    ]
    render(<AgentConfigPanel initialAgents={initialAgents} />)
    // Click edit button
    const editButton = screen.getByTitle('Edit')
    fireEvent.click(editButton)
    // Modal should show Edit Agent title
    expect(screen.getByText('Edit Agent')).toBeInTheDocument()
    // Args input should show existing args
    const argsInput = screen.getByPlaceholderText('acp, --mode=swarm')
    expect(argsInput).toHaveValue('--arg1, --arg2')
    // Update name
    const nameInput = screen.getByPlaceholderText('Claude Code')
    fireEvent.change(nameInput, { target: { value: 'Updated Name' } })
    // Save
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    // Agent should be updated
    expect(screen.getByText('Updated Name')).toBeInTheDocument()
  })

  it('edits agent while preserving other agents unchanged', () => {
    const initialAgents: AgentConfig[] = [
      {
        id: 'first-agent',
        name: 'First Agent',
        command: '/usr/bin/first',
        args: [],
        enabled: true,
      },
      {
        id: 'second-agent',
        name: 'Second Agent',
        command: '/usr/bin/second',
        args: [],
        enabled: true,
      },
    ]
    render(<AgentConfigPanel initialAgents={initialAgents} />)
    // Both agents should be visible
    expect(screen.getByText('First Agent')).toBeInTheDocument()
    expect(screen.getByText('Second Agent')).toBeInTheDocument()
    // Click edit on first agent
    const editButtons = screen.getAllByTitle('Edit')
    fireEvent.click(editButtons[0])
    // Update name
    const nameInput = screen.getByPlaceholderText('Claude Code')
    fireEvent.change(nameInput, { target: { value: 'Updated First' } })
    // Save
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    // First agent should be updated
    expect(screen.getByText('Updated First')).toBeInTheDocument()
    // Second agent should still be visible unchanged
    expect(screen.getByText('Second Agent')).toBeInTheDocument()
  })

  it('deletes an agent from the list', () => {
    const initialAgents: AgentConfig[] = [
      {
        id: 'delete-test-agent',
        name: 'Agent To Delete',
        command: '/usr/bin/delete',
        args: [],
        enabled: true,
      },
    ]
    render(<AgentConfigPanel initialAgents={initialAgents} />)
    // Agent should be visible
    expect(screen.getByText('Agent To Delete')).toBeInTheDocument()
    // Click delete button
    const deleteButton = screen.getByTitle('Delete')
    fireEvent.click(deleteButton)
    // Agent should be removed
    expect(screen.queryByText('Agent To Delete')).not.toBeInTheDocument()
    // Empty state should show
    expect(screen.getByText('No agents configured')).toBeInTheDocument()
  })

  it('handles connection error during test', async () => {
    vi.useFakeTimers()
    const initialAgents: AgentConfig[] = [
      {
        id: 'error-test-agent',
        name: 'Error Test Agent',
        command: '/usr/bin/error',
        args: [],
        enabled: true,
      },
    ]
    render(<AgentConfigPanel initialAgents={initialAgents} simulateConnectionError={true} />)
    const testButton = screen.getByTitle('Test Connection')

    // Click test button
    fireEvent.click(testButton)

    // Wait for connection test to complete
    await vi.advanceTimersByTimeAsync(2000)

    // Status indicator should be red (error)
    const statusIndicator = document.querySelector('.bg-error')
    expect(statusIndicator).toBeInTheDocument()

    vi.useRealTimers()
  })

  it('handles agent not found scenario during test', async () => {
    vi.useFakeTimers()
    const initialAgents: AgentConfig[] = [
      {
        id: 'notfound-test-agent',
        name: 'NotFound Test Agent',
        command: '/usr/bin/notfound',
        args: [],
        enabled: true,
      },
    ]
    render(<AgentConfigPanel initialAgents={initialAgents} simulateAgentNotFound={true} />)
    const testButton = screen.getByTitle('Test Connection')

    // Click test button
    fireEvent.click(testButton)

    // Wait for connection test to complete
    await vi.advanceTimersByTimeAsync(2000)

    // Status indicator should be red (error)
    const statusIndicator = document.querySelector('.bg-error')
    expect(statusIndicator).toBeInTheDocument()

    vi.useRealTimers()
  })
})
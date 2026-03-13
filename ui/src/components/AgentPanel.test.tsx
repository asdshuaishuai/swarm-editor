import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import AgentPanel from './AgentPanel'
import { useAppStore } from '../store/appStore'

vi.mock('../store/appStore', () => ({
  useAppStore: vi.fn(),
}))

describe('AgentPanel', () => {
  const mockSelectAgent = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector?: (state: unknown) => unknown) => {
      const state = {
        agents: [
          { id: '1', name: 'Agent 1', type: 'coder' },
          { id: '2', name: 'Agent 2', type: 'reviewer' },
        ],
        selectedAgent: null,
        selectAgent: mockSelectAgent,
      }
      return selector ? selector(state) : state
    })
  })

  it('renders agent selector', () => {
    render(<AgentPanel />)
    expect(screen.getByText('Select Agent')).toBeInTheDocument()
  })

  it('renders agents in dropdown', () => {
    render(<AgentPanel />)
    expect(screen.getByText('Agent 1 (coder)')).toBeInTheDocument()
    expect(screen.getByText('Agent 2 (reviewer)')).toBeInTheDocument()
  })

  it('renders empty state message', () => {
    render(<AgentPanel />)
    expect(screen.getByText('Start a conversation with an agent')).toBeInTheDocument()
  })

  it('renders input placeholder', () => {
    render(<AgentPanel />)
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument()
  })

  it('send button is disabled when input is empty', () => {
    render(<AgentPanel />)
    const sendButton = screen.getByRole('button')
    expect(sendButton).toBeDisabled()
  })

  it('enables send button when input has text', () => {
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(input, { target: { value: 'Hello' } })
    const sendButton = screen.getByRole('button')
    expect(sendButton).not.toBeDisabled()
  })

  it('calls selectAgent when agent is selected', () => {
    render(<AgentPanel />)
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: '1' } })
    expect(mockSelectAgent).toHaveBeenCalled()
  })

  it('sends message on button click', async () => {
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(input, { target: { value: 'Hello agent' } })
    const sendButton = screen.getByRole('button')
    fireEvent.click(sendButton)

    // Check user message appears
    expect(screen.getByText('Hello agent')).toBeInTheDocument()
    // Input should be cleared
    expect(input).toHaveValue('')
  })

  it('sends message on Enter key', async () => {
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(input, { target: { value: 'Test message' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false })

    expect(screen.getByText('Test message')).toBeInTheDocument()
  })

  it('does not send message on Shift+Enter', async () => {
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(input, { target: { value: 'Test message' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })

    // Message should not appear in chat (only in input)
    expect(screen.getByText('Start a conversation with an agent')).toBeInTheDocument()
  })

  it('shows loading indicator after sending', async () => {
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(input, { target: { value: 'Hello' } })
    const sendButton = screen.getByRole('button')
    fireEvent.click(sendButton)

    // Loading indicator should appear
    const spinners = document.querySelectorAll('.animate-spin')
    expect(spinners.length).toBeGreaterThan(0)
  })

  it('receives agent response after delay', async () => {
    vi.useFakeTimers()
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(input, { target: { value: 'Hello' } })
    const sendButton = screen.getByRole('button')
    fireEvent.click(sendButton)

    // Fast-forward timers and wrap in act
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })

    expect(screen.getByText('I understand your request. Let me help you with that.')).toBeInTheDocument()
    vi.useRealTimers()
  })
})

describe('AgentPanel with selected agent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        agents: [{ id: '1', name: 'Selected Agent', type: 'coder' }],
        selectedAgent: { id: '1', name: 'Selected Agent', type: 'coder' },
        selectAgent: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  it('shows selected agent in dropdown', () => {
    render(<AgentPanel />)
    const select = screen.getByRole('combobox')
    expect(select).toHaveValue('1')
  })
})
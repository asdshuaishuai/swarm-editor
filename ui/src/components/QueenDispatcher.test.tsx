import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import QueenDispatcher from './QueenDispatcher'

const mockGetSwarms = vi.fn().mockResolvedValue([])
const mockSubmitTask = vi.fn().mockResolvedValue({})
const mockGetSessions = vi.fn().mockResolvedValue([])
const mockSendMessage = vi.fn().mockResolvedValue({})
const mockAddToast = vi.fn()

vi.mock('../services', () => ({
  api: {
    swarm: {
      getSwarms: () => mockGetSwarms(),
      submitTask: (...args: any[]) => mockSubmitTask(...args),
    },
    agent: {
      getSessions: () => mockGetSessions(),
      sendMessage: (...args: any[]) => mockSendMessage(...args),
    },
  },
}))

vi.mock('../utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('../store/appStore', () => ({
  useAppStore: (selector: any) => selector({ addToast: mockAddToast }),
}))

const emptyTaskFlow = { tasks: new Map() }

vi.mock('../stores/taskFlowStore', () => ({
  useTaskFlowStore: (selector: any) => selector(emptyTaskFlow),
}))

describe('QueenDispatcher', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders strategy selector', () => {
    render(<QueenDispatcher />)
    expect(screen.getByText(/蜂王策略/)).toBeInTheDocument()
  })

  it('renders all strategy options', () => {
    render(<QueenDispatcher />)
    expect(screen.getByText(/轮询调度/)).toBeInTheDocument()
    expect(screen.getByText(/最小负载/)).toBeInTheDocument()
    expect(screen.getByText(/优先级调度/)).toBeInTheDocument()
    expect(screen.getByText(/能力匹配/)).toBeInTheDocument()
  })

  it('renders goal input', () => {
    render(<QueenDispatcher />)
    expect(screen.getByPlaceholderText(/下发全域调度目标/)).toBeInTheDocument()
  })

  it('disables submit when goal is empty', () => {
    render(<QueenDispatcher />)
    const btn = screen.getByTitle('下发目标')
    expect(btn).toBeDisabled()
  })

  it('enables submit when goal has text', () => {
    render(<QueenDispatcher />)
    fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: '重构主布局' } })
    const btn = screen.getByTitle('下发目标')
    expect(btn).not.toBeDisabled()
  })

  it('shows warning when no swarms or sessions available', async () => {
    mockGetSwarms.mockResolvedValueOnce([])
    mockGetSessions.mockResolvedValueOnce([])
    render(<QueenDispatcher />)
    fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'test goal' } })
    fireEvent.click(screen.getByTitle('下发目标'))
    const { waitFor } = await import('@testing-library/react')
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('warning', expect.any(String), expect.any(String))
    })
  })

  it('submits task to swarm when swarms available', async () => {
    mockGetSwarms.mockResolvedValueOnce([{ id: 'swarm-1', strategy: 'priority' }])
    render(<QueenDispatcher />)
    fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'build feature' } })
    fireEvent.click(screen.getByTitle('下发目标'))
    await screen.findByPlaceholderText(/下发全域调度目标/)
    expect(mockSubmitTask).toHaveBeenCalledWith(
      expect.objectContaining({ swarmId: 'swarm-1', title: 'build feature' }),
    )
  })

  it('changes strategy on select', () => {
    render(<QueenDispatcher />)
    // Default strategy is 'priority'
    const select = screen.getByRole('combobox')
    expect(select).toHaveValue('priority')
    fireEvent.change(select, { target: { value: 'least_loaded' } })
    expect(select).toHaveValue('least_loaded')
  })

  it('submits on Enter key', async () => {
    mockGetSwarms.mockResolvedValueOnce([{ id: 's1', strategy: 'priority' }])
    render(<QueenDispatcher />)
    const input = screen.getByPlaceholderText(/下发全域调度目标/)
    fireEvent.change(input, { target: { value: 'test task' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await screen.findByPlaceholderText(/下发全域调度目标/)
    expect(mockGetSwarms).toHaveBeenCalled()
  })
})

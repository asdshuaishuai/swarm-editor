import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SwarmVisualization from './SwarmVisualization'

const mockStore: {
  agents: { id: string; name: string; status: string }[]
  activeSwarm: { coordinatorId: string } | null
} = {
  agents: [
    { id: 'coordinator-1', name: 'Queen', status: 'idle' },
    { id: 'worker-1', name: 'Worker A', status: 'executing' },
    { id: 'worker-2', name: 'Worker B', status: 'thinking' },
  ],
  activeSwarm: { coordinatorId: 'coordinator-1' },
}

vi.mock('../store/appStore', () => ({
  useAppStore: (selector: any) => selector(mockStore),
}))

vi.mock('lucide-react', () => ({
  Network: () => 'svg',
  Zap: () => 'svg',
  Target: () => 'svg',
  CheckCircle: () => 'svg',
  XCircle: () => 'svg',
  Clock: () => 'svg',
  Loader2: () => 'svg',
  ArrowRight: () => 'svg',
  GitBranch: () => 'svg',
  Layers: () => 'svg',
}))

describe('SwarmVisualization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStore.agents = [
      { id: 'coordinator-1', name: 'Queen', status: 'idle' },
      { id: 'worker-1', name: 'Worker A', status: 'executing' },
      { id: 'worker-2', name: 'Worker B', status: 'thinking' },
    ]
    mockStore.activeSwarm = { coordinatorId: 'coordinator-1' }
  })

  it('renders with default topology', () => {
    const { container } = render(<SwarmVisualization />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renders agent nodes', () => {
    render(<SwarmVisualization />)
    expect(screen.getByText('Queen')).toBeInTheDocument()
    expect(screen.getByText('Worker A')).toBeInTheDocument()
    expect(screen.getByText('Worker B')).toBeInTheDocument()
  })

  it('renders view mode toggle buttons', () => {
    render(<SwarmVisualization />)
    expect(screen.getByRole('tab', { name: /Topology/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Tasks/ })).toBeInTheDocument()
  })

  it('renders topology label in uppercase', () => {
    render(<SwarmVisualization />)
    expect(screen.getByText(/STAR.*3 agents/)).toBeInTheDocument()
  })

  it('renders with mesh topology', () => {
    render(<SwarmVisualization topology="mesh" />)
    expect(screen.getByText(/MESH/)).toBeInTheDocument()
  })

  it('renders with ring topology', () => {
    render(<SwarmVisualization topology="ring" />)
    expect(screen.getByText(/RING/)).toBeInTheDocument()
  })

  it('switches to tasks view on tab click', () => {
    render(<SwarmVisualization />)
    fireEvent.click(screen.getByRole('tab', { name: /Tasks/ }))
    expect(screen.getByRole('tab', { name: /Tasks/ }).getAttribute('aria-selected')).toBe('true')
  })

  it('renders swarm topology header', () => {
    render(<SwarmVisualization />)
    expect(screen.getByText('Swarm Topology')).toBeInTheDocument()
  })

  it('renders empty topology when no agents', () => {
    mockStore.agents = []
    mockStore.activeSwarm = null
    const { container } = render(<SwarmVisualization />)
    // Should still render the SVG container with grid
    expect(container.querySelector('svg')).toBeInTheDocument()
    expect(screen.getByText(/0 agents/)).toBeInTheDocument()
  })

  it('shows no tasks message in tasks view', () => {
    render(<SwarmVisualization />)
    fireEvent.click(screen.getByRole('tab', { name: /Tasks/ }))
    expect(screen.getByText('No tasks to visualize')).toBeInTheDocument()
  })
})

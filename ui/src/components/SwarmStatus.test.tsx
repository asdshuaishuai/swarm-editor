import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SwarmStatus } from './SwarmStatus'
import type { SwarmTask } from './SwarmStatus'

const tasks: SwarmTask[] = [
  { id: '1', name: 'Task A', status: 'completed' },
  { id: '2', name: 'Task B', status: 'running' },
  { id: '3', name: 'Task C', status: 'pending' },
]

describe('SwarmStatus', () => {
  it('renders status header', () => {
    render(<SwarmStatus tasks={[]} />)
    expect(screen.getByText('蜂群状态')).toBeInTheDocument()
  })

  it('shows expand button', () => {
    render(<SwarmStatus tasks={[]} />)
    expect(screen.getByText('展开')).toBeInTheDocument()
  })

  it('toggles to collapse on click', () => {
    render(<SwarmStatus tasks={[]} />)
    fireEvent.click(screen.getByText('展开'))
    expect(screen.getByText('收起')).toBeInTheDocument()
  })

  it('shows task stats', () => {
    render(<SwarmStatus tasks={tasks} />)
    expect(screen.getByText(/任务: 1\/3/)).toBeInTheDocument()
    expect(screen.getByText(/运行中: 1/)).toBeInTheDocument()
  })

  it('shows progress when provided', () => {
    render(<SwarmStatus tasks={tasks} progress={65} />)
    expect(screen.getByText('65%')).toBeInTheDocument()
    expect(screen.getByText('任务进度')).toBeInTheDocument()
  })

  it('hides progress when not provided', () => {
    render(<SwarmStatus tasks={tasks} />)
    expect(screen.queryByText('任务进度')).toBeNull()
  })

  it('shows primary agent when provided', () => {
    render(<SwarmStatus tasks={[]} primaryAgentId="queen-1" />)
    expect(screen.getByText('当前主导:')).toBeInTheDocument()
    expect(screen.getByText('queen-1')).toBeInTheDocument()
  })

  it('hides primary agent when not provided', () => {
    render(<SwarmStatus tasks={[]} />)
    expect(screen.queryByText('当前主导:')).toBeNull()
  })

  it('shows consensus section when provided', () => {
    render(<SwarmStatus tasks={[]} consensus={{ total: 3, agreed: 2, votes: [] }} />)
    expect(screen.getByText('共识投票')).toBeInTheDocument()
  })

  it('hides consensus when not provided', () => {
    render(<SwarmStatus tasks={[]} />)
    expect(screen.queryByText('共识投票')).toBeNull()
  })

  it('shows emergence section when expanded', () => {
    render(<SwarmStatus tasks={[]} emergence={{ health: { overallScore: 85 } }} />)
    fireEvent.click(screen.getByText('展开'))
    expect(screen.getByText(/85/)).toBeInTheDocument()
  })

  it('handles empty tasks', () => {
    render(<SwarmStatus tasks={[]} />)
    expect(screen.getByText(/任务: 0\/0/)).toBeInTheDocument()
  })
})

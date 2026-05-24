import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActivityBar } from './ActivityBar'

vi.mock('lucide-react', () => ({
  Files: () => <svg data-testid="files-icon" />,
  GitBranch: (props: any) => <svg {...props} data-testid="git-icon" />,
  ListTree: () => <svg data-testid="list-icon" />,
}))

describe('ActivityBar', () => {
  const onViewChange = vi.fn()

  it('renders all activity buttons', () => {
    render(<ActivityBar activityView="explorer" onViewChange={onViewChange} gitStatusCount={0} errorCount={0} />)
    expect(screen.getByTitle(/Explorer/)).toBeInTheDocument()
    expect(screen.getByTitle(/Source Control/)).toBeInTheDocument()
    expect(screen.getByTitle(/Problems/)).toBeInTheDocument()
  })

  it('calls onViewChange with explorer when explorer clicked', () => {
    render(<ActivityBar activityView="sourceControl" onViewChange={onViewChange} gitStatusCount={0} errorCount={0} />)
    fireEvent.click(screen.getByTitle(/Explorer/))
    expect(onViewChange).toHaveBeenCalledWith('explorer')
  })

  it('calls onViewChange with sourceControl when git clicked', () => {
    render(<ActivityBar activityView="explorer" onViewChange={onViewChange} gitStatusCount={0} errorCount={0} />)
    fireEvent.click(screen.getByTitle(/Source Control/))
    expect(onViewChange).toHaveBeenCalledWith('sourceControl')
  })

  it('shows git status count badge', () => {
    render(<ActivityBar activityView="explorer" onViewChange={onViewChange} gitStatusCount={5} errorCount={0} />)
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('shows error count badge', () => {
    render(<ActivityBar activityView="explorer" onViewChange={onViewChange} gitStatusCount={0} errorCount={3} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('formats large git count with K', () => {
    render(<ActivityBar activityView="explorer" onViewChange={onViewChange} gitStatusCount={1500} errorCount={0} />)
    expect(screen.getByText('1K')).toBeInTheDocument()
  })

  it('caps error count at 99+', () => {
    render(<ActivityBar activityView="explorer" onViewChange={onViewChange} gitStatusCount={0} errorCount={150} />)
    expect(screen.getByText('99+')).toBeInTheDocument()
  })

  it('does not show badge when count is 0', () => {
    render(<ActivityBar activityView="explorer" onViewChange={onViewChange} gitStatusCount={0} errorCount={0} />)
    expect(screen.queryByText('0')).toBeNull()
  })
})

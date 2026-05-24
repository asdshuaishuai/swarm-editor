import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActivityBar } from './ActivityBar'

vi.mock('lucide-react', () => ({
  Files: (props: Record<string, unknown>) => <svg data-testid="files-icon" {...props} />,
  GitBranch: (props: Record<string, unknown>) => <svg data-testid="git-icon" {...props} />,
  ListTree: (props: Record<string, unknown>) => <svg data-testid="list-icon" {...props} />,
}))

describe('ActivityBar', () => {
  const onViewChange = vi.fn()

  beforeEach(() => vi.clearAllMocks())

  // ── Button rendering ──

  it('renders all activity buttons', () => {
    render(<ActivityBar activityView="explorer" onViewChange={onViewChange} gitStatusCount={0} errorCount={0} />)
    expect(screen.getByTitle(/Explorer/)).toBeInTheDocument()
    expect(screen.getByTitle(/Source Control/)).toBeInTheDocument()
    expect(screen.getByTitle(/Problems/)).toBeInTheDocument()
  })

  it('renders icons for each button', () => {
    render(<ActivityBar activityView="explorer" onViewChange={onViewChange} gitStatusCount={0} errorCount={0} />)
    expect(screen.getByTestId('files-icon')).toBeInTheDocument()
    expect(screen.getByTestId('git-icon')).toBeInTheDocument()
    expect(screen.getByTestId('list-icon')).toBeInTheDocument()
  })

  // ── View change callbacks ──

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

  it('calls onViewChange with outline when outline clicked', () => {
    render(<ActivityBar activityView="explorer" onViewChange={onViewChange} gitStatusCount={0} errorCount={0} />)
    fireEvent.click(screen.getByTitle(/Problems/))
    expect(onViewChange).toHaveBeenCalledWith('outline')
  })

  // ── Active indicator ──

  it('shows active indicator on explorer button when active', () => {
    render(<ActivityBar activityView="explorer" onViewChange={onViewChange} gitStatusCount={0} errorCount={0} />)
    const explorerBtn = screen.getByTitle(/Explorer/)
    // Active indicator is the left border div
    const indicator = explorerBtn.querySelector('.bg-accent')
    expect(indicator).toBeInTheDocument()
  })

  it('shows active indicator on sourceControl button when active', () => {
    render(<ActivityBar activityView="sourceControl" onViewChange={onViewChange} gitStatusCount={0} errorCount={0} />)
    const scBtn = screen.getByTitle(/Source Control/)
    const indicator = scBtn.querySelector('.bg-accent')
    expect(indicator).toBeInTheDocument()
  })

  it('shows active indicator on outline button when active', () => {
    render(<ActivityBar activityView="outline" onViewChange={onViewChange} gitStatusCount={0} errorCount={0} />)
    const outlineBtn = screen.getByTitle(/Problems/)
    const indicator = outlineBtn.querySelector('.bg-accent')
    expect(indicator).toBeInTheDocument()
  })

  it('does not show active indicator on inactive button', () => {
    render(<ActivityBar activityView="explorer" onViewChange={onViewChange} gitStatusCount={0} errorCount={0} />)
    const scBtn = screen.getByTitle(/Source Control/)
    const indicator = scBtn.querySelector('.bg-accent')
    expect(indicator).not.toBeInTheDocument()
  })

  it('applies text-text-primary class to active button', () => {
    render(<ActivityBar activityView="sourceControl" onViewChange={onViewChange} gitStatusCount={0} errorCount={0} />)
    const scBtn = screen.getByTitle(/Source Control/)
    expect(scBtn.className).toContain('text-text-primary')
  })

  it('applies text-text-tertiary class to inactive button', () => {
    render(<ActivityBar activityView="explorer" onViewChange={onViewChange} gitStatusCount={0} errorCount={0} />)
    const scBtn = screen.getByTitle(/Source Control/)
    expect(scBtn.className).toContain('text-text-tertiary')
  })

  // ── Git status badge ──

  it('shows git status count badge', () => {
    render(<ActivityBar activityView="explorer" onViewChange={onViewChange} gitStatusCount={5} errorCount={0} />)
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('formats large git count with K', () => {
    render(<ActivityBar activityView="explorer" onViewChange={onViewChange} gitStatusCount={1500} errorCount={0} />)
    expect(screen.getByText('1K')).toBeInTheDocument()
  })

  it('does not show badge when gitStatusCount is 0', () => {
    render(<ActivityBar activityView="explorer" onViewChange={onViewChange} gitStatusCount={0} errorCount={0} />)
    expect(screen.queryByText('0')).toBeNull()
  })

  it('shows exact count for gitStatusCount under 1000', () => {
    render(<ActivityBar activityView="explorer" onViewChange={onViewChange} gitStatusCount={999} errorCount={0} />)
    expect(screen.getByText('999')).toBeInTheDocument()
  })

  it('shows 2K for 2500 git changes', () => {
    render(<ActivityBar activityView="explorer" onViewChange={onViewChange} gitStatusCount={2500} errorCount={0} />)
    expect(screen.getByText('2K')).toBeInTheDocument()
  })

  it('shows 1K at exactly 1000', () => {
    render(<ActivityBar activityView="explorer" onViewChange={onViewChange} gitStatusCount={1000} errorCount={0} />)
    expect(screen.getByText('1K')).toBeInTheDocument()
  })

  // ── Error count badge ──

  it('shows error count badge', () => {
    render(<ActivityBar activityView="explorer" onViewChange={onViewChange} gitStatusCount={0} errorCount={3} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('caps error count at 99+', () => {
    render(<ActivityBar activityView="explorer" onViewChange={onViewChange} gitStatusCount={0} errorCount={150} />)
    expect(screen.getByText('99+')).toBeInTheDocument()
  })

  it('does not show error badge when count is 0', () => {
    render(<ActivityBar activityView="explorer" onViewChange={onViewChange} gitStatusCount={0} errorCount={0} />)
    // There should be no "0" text node anywhere for badges
    const allButtons = screen.getAllByRole('button')
    const badgeTexts = allButtons
      .map(btn => btn.textContent)
      .filter(text => text !== null && text.trim().length > 0 && !text.includes('Explorer') && !text.includes('Source') && !text.includes('Problems'))
    // Only icon SVGs remain inside buttons, no "0" text
    expect(badgeTexts.length).toBe(0)
  })

  it('shows exact count for errorCount at 99', () => {
    render(<ActivityBar activityView="explorer" onViewChange={onViewChange} gitStatusCount={0} errorCount={99} />)
    expect(screen.getByText('99')).toBeInTheDocument()
  })

  it('shows 99+ at exactly 100 errors', () => {
    render(<ActivityBar activityView="explorer" onViewChange={onViewChange} gitStatusCount={0} errorCount={100} />)
    expect(screen.getByText('99+')).toBeInTheDocument()
  })

  // ── Both badges together ──

  it('shows both badges simultaneously', () => {
    render(<ActivityBar activityView="explorer" onViewChange={onViewChange} gitStatusCount={7} errorCount={2} />)
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  // ── Keyboard shortcut hints in title ──

  it('shows Ctrl+Shift+E in explorer title', () => {
    render(<ActivityBar activityView="explorer" onViewChange={onViewChange} gitStatusCount={0} errorCount={0} />)
    expect(screen.getByTitle(/Ctrl\+Shift\+E/)).toBeInTheDocument()
  })

  it('shows Ctrl+Shift+G in source control title', () => {
    render(<ActivityBar activityView="explorer" onViewChange={onViewChange} gitStatusCount={0} errorCount={0} />)
    expect(screen.getByTitle(/Ctrl\+Shift\+G/)).toBeInTheDocument()
  })

  it('shows Ctrl+Shift+O in outline title', () => {
    render(<ActivityBar activityView="explorer" onViewChange={onViewChange} gitStatusCount={0} errorCount={0} />)
    expect(screen.getByTitle(/Ctrl\+Shift\+O/)).toBeInTheDocument()
  })

  // ── Container structure ──

  it('renders with correct container classes', () => {
    const { container } = render(<ActivityBar activityView="explorer" onViewChange={onViewChange} gitStatusCount={0} errorCount={0} />)
    const bar = container.firstChild as HTMLElement
    expect(bar.className).toContain('w-12')
    expect(bar.className).toContain('flex')
    expect(bar.className).toContain('flex-col')
  })
})

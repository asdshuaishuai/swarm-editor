import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WelcomePanel } from './WelcomePanel'

vi.mock('lucide-react', () => ({
  Keyboard: () => <svg data-testid="kb-icon" />,
  Command: () => <svg data-testid="cmd-icon" />,
  Search: () => <svg data-testid="search-icon" />,
}))

vi.mock('../utils', () => ({
  getFileIcon: () => (props: any) => <svg {...props} data-testid="file-icon" />,
  getFileIconColor: () => '',
}))

describe('WelcomePanel', () => {
  it('renders Swarm Editor title', () => {
    render(<WelcomePanel recentFiles={[]} onFileClick={vi.fn()} />)
    expect(screen.getByText('Swarm Editor')).toBeInTheDocument()
  })

  it('shows keyboard shortcut hints', () => {
    render(<WelcomePanel recentFiles={[]} onFileClick={vi.fn()} />)
    expect(screen.getByText('Quick Open')).toBeInTheDocument()
    expect(screen.getByText('Command Palette')).toBeInTheDocument()
  })

  it('shows recent files when provided', () => {
    render(<WelcomePanel recentFiles={['src/App.tsx', 'src/utils.ts']} onFileClick={vi.fn()} />)
    expect(screen.getByText('App.tsx')).toBeInTheDocument()
    expect(screen.getByText('utils.ts')).toBeInTheDocument()
  })

  it('hides recent files when empty', () => {
    render(<WelcomePanel recentFiles={[]} onFileClick={vi.fn()} />)
    expect(screen.queryByText('Recent Files')).toBeNull()
  })

  it('limits recent files to 5', () => {
    const files = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts']
    render(<WelcomePanel recentFiles={files} onFileClick={vi.fn()} />)
    expect(screen.queryAllByText('f.ts').length).toBe(0)
    expect(screen.getAllByText('e.ts').length).toBeGreaterThan(0)
  })

  it('calls onFileClick when recent file clicked', () => {
    const onFileClick = vi.fn()
    render(<WelcomePanel recentFiles={['src/App.tsx']} onFileClick={onFileClick} />)
    fireEvent.click(screen.getByText('App.tsx'))
    expect(onFileClick).toHaveBeenCalledWith('src/App.tsx')
  })

  it('shows full path as secondary text', () => {
    render(<WelcomePanel recentFiles={['src/components/App.tsx']} onFileClick={vi.fn()} />)
    expect(screen.getByText('src/components/App.tsx')).toBeInTheDocument()
  })
})

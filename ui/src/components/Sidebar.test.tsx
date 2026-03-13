import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import Sidebar from './Sidebar'
import { useAppStore } from '../store/appStore'

// Mock the store
vi.mock('../store/appStore', () => ({
  useAppStore: vi.fn(),
}))

describe('Sidebar', () => {
  const mockToggleSidebar = vi.fn()
  const mockSetActivePanel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        sidebarCollapsed: false,
        activePanel: 'editor',
        toggleSidebar: mockToggleSidebar,
        setActivePanel: mockSetActivePanel,
      }
      return selector ? selector(state) : state
    })
  })

  it('renders navigation items', () => {
    render(<Sidebar />)
    expect(screen.getByText('Editor')).toBeInTheDocument()
    expect(screen.getByText('Swarm')).toBeInTheDocument()
    expect(screen.getByText('Team')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('renders header with title when not collapsed', () => {
    render(<Sidebar />)
    expect(screen.getByText('Swarm Editor')).toBeInTheDocument()
  })

  it('calls toggleSidebar when collapse button is clicked', () => {
    render(<Sidebar />)
    const button = screen.getByRole('button', { name: '' })
    fireEvent.click(button)
    expect(mockToggleSidebar).toHaveBeenCalled()
  })

  it('calls setActivePanel when nav item is clicked', () => {
    render(<Sidebar />)
    const swarmButton = screen.getByText('Swarm').closest('button')
    if (swarmButton) {
      fireEvent.click(swarmButton)
    }
    expect(mockSetActivePanel).toHaveBeenCalledWith('swarm')
  })

  it('renders agent count in footer', () => {
    render(<Sidebar />)
    expect(screen.getByText('Agents: 0')).toBeInTheDocument()
  })

  it('applies active styling to active panel', () => {
    render(<Sidebar />)
    const editorButton = screen.getByText('Editor').closest('button')
    expect(editorButton).toHaveClass('bg-accent/20')
  })
})

describe('Sidebar collapsed state', () => {
  const mockToggleSidebar = vi.fn()
  const mockSetActivePanel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        sidebarCollapsed: true,
        activePanel: 'editor',
        toggleSidebar: mockToggleSidebar,
        setActivePanel: mockSetActivePanel,
      }
      return selector ? selector(state) : state
    })
  })

  it('hides title when collapsed', () => {
    render(<Sidebar />)
    expect(screen.queryByText('Swarm Editor')).not.toBeInTheDocument()
  })

  it('hides nav labels when collapsed', () => {
    render(<Sidebar />)
    expect(screen.queryByText('Editor')).not.toBeInTheDocument()
    expect(screen.queryByText('Swarm')).not.toBeInTheDocument()
  })

  it('hides footer when collapsed', () => {
    render(<Sidebar />)
    expect(screen.queryByText('Agents: 0')).not.toBeInTheDocument()
  })

  it('has correct width class when collapsed', () => {
    const { container } = render(<Sidebar />)
    const sidebar = container.firstChild as HTMLElement
    expect(sidebar).toHaveClass('w-12')
  })
})
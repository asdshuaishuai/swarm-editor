import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BreadcrumbsBar } from './BreadcrumbsBar'

vi.mock('../utils', () => ({
  getFileIcon: () => (props: any) => <svg data-testid="file-icon" {...props} />,
  getFileIconColor: () => '',
}))

vi.mock('../hooks/useMenuKeyboardNav', () => ({
  useMenuKeyboardNav: () => () => {},
}))

describe('BreadcrumbsBar', () => {
  it('renders nothing when no filePath', () => {
    const { container } = render(<BreadcrumbsBar />)
    expect(container.firstChild).toBeNull()
  })

  it('renders segments from filePath', () => {
    render(<BreadcrumbsBar filePath="src/components/App.tsx" />)
    expect(screen.getByText('src')).toBeInTheDocument()
    expect(screen.getByText('components')).toBeInTheDocument()
    expect(screen.getByText('App.tsx')).toBeInTheDocument()
  })

  it('shows separators between segments', () => {
    const { container } = render(<BreadcrumbsBar filePath="src/App.tsx" />)
    // 'src/App.tsx' → segments ['src', 'App.tsx'] → 1 separator
    const separators = container.querySelectorAll('span[aria-hidden="true"]')
    expect(separators.length).toBe(1)
  })

  it('marks last segment with aria-current="page"', () => {
    render(<BreadcrumbsBar filePath="src/App.tsx" />)
    const lastBtn = screen.getByText('App.tsx').closest('button')
    expect(lastBtn).toHaveAttribute('aria-current', 'page')
  })

  it('does not call onNavigate on single click of directory', () => {
    const onNavigate = vi.fn()
    render(<BreadcrumbsBar filePath="src/App.tsx" onNavigate={onNavigate} />)
    fireEvent.click(screen.getByText('src'))
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('calls onNavigate on double click of directory segment', () => {
    const onNavigate = vi.fn()
    render(<BreadcrumbsBar filePath="src/App.tsx" onNavigate={onNavigate} />)
    fireEvent.doubleClick(screen.getByText('src'))
    expect(onNavigate).toHaveBeenCalledWith('src')
  })

  it('does not call onNavigate on double click of last segment', () => {
    const onNavigate = vi.fn()
    render(<BreadcrumbsBar filePath="src/App.tsx" onNavigate={onNavigate} />)
    fireEvent.doubleClick(screen.getByText('App.tsx'))
    // targetPath ('src/App.tsx') === filePath, so onNavigate is NOT called
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('opens dropdown on click of directory segment', () => {
    const fileTree = [
      { name: 'src', path: 'src', isDirectory: true, children: [
        { name: 'App.tsx', path: 'src/App.tsx', isDirectory: false },
        { name: 'index.ts', path: 'src/index.ts', isDirectory: false },
      ]},
    ]
    render(<BreadcrumbsBar filePath="src/App.tsx" fileTree={fileTree as any} />)
    const srcBtn = screen.getByText('src').closest('button')!
    expect(srcBtn).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(srcBtn)
    expect(srcBtn).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows sibling files in dropdown when fileTree provided', () => {
    // Need 3+ segments so middle segment (index 1) can open dropdown
    const fileTree = [
      { name: 'src', path: 'src', isDirectory: true, children: [
        { name: 'components', path: 'src/components', isDirectory: true, children: [
          { name: 'App.tsx', path: 'src/components/App.tsx', isDirectory: false },
          { name: 'Button.tsx', path: 'src/components/Button.tsx', isDirectory: false },
        ]},
        { name: 'utils', path: 'src/utils', isDirectory: true },
        { name: 'index.ts', path: 'src/index.ts', isDirectory: false },
      ]},
    ]
    render(<BreadcrumbsBar filePath="src/components/App.tsx" fileTree={fileTree as any} />)
    // Click 'components' (index=1) → dirPath='src' → shows src's children
    fireEvent.click(screen.getByText('components'))
    expect(screen.getByText('utils')).toBeInTheDocument()
    expect(screen.getByText('index.ts')).toBeInTheDocument()
  })

  it('calls onFileSelect when clicking a sibling', () => {
    const onFileSelect = vi.fn()
    const fileTree = [
      { name: 'src', path: 'src', isDirectory: true, children: [
        { name: 'components', path: 'src/components', isDirectory: true, children: [
          { name: 'App.tsx', path: 'src/components/App.tsx', isDirectory: false },
        ]},
        { name: 'index.ts', path: 'src/index.ts', isDirectory: false },
      ]},
    ]
    render(
      <BreadcrumbsBar
        filePath="src/components/App.tsx"
        fileTree={fileTree as any}
        onFileSelect={onFileSelect}
      />
    )
    // Click 'components' (index=1) → shows src's children
    fireEvent.click(screen.getByText('components'))
    fireEvent.click(screen.getByText('index.ts'))
    expect(onFileSelect).toHaveBeenCalledWith('src/index.ts')
  })

  it('renders nav with aria-label', () => {
    render(<BreadcrumbsBar filePath="a/b.ts" />)
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(nav).toBeInTheDocument()
  })
})

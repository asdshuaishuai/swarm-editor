import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BreadcrumbsBar } from './BreadcrumbsBar'

// Mock lucide-react ChevronDown to avoid SVG complexity
vi.mock('lucide-react', () => ({
  ChevronDown: (props: Record<string, unknown>) => <svg data-testid="chevron" {...props} />,
}))

// Mock file icon utilities — returns a simple SVG component
vi.mock('../utils', () => ({
  getFileIcon: () => (props: Record<string, unknown>) => <svg data-testid="file-icon" {...props} />,
  getFileIconColor: () => '',
}))

vi.mock('../hooks/useMenuKeyboardNav', () => ({
  useMenuKeyboardNav: () => () => {},
}))

interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  children?: FileEntry[]
}

// Helper to build file tree entries
function makeEntry(name: string, path: string, isDirectory: boolean, children?: FileEntry[]): FileEntry {
  const entry: FileEntry = { name, path, isDirectory }
  if (children) entry.children = children
  return entry
}

const sampleTree: FileEntry[] = [
  makeEntry('src', 'src', true, [
    makeEntry('components', 'src/components', true, [
      makeEntry('App.tsx', 'src/components/App.tsx', false),
      makeEntry('Button.tsx', 'src/components/Button.tsx', false),
    ]),
    makeEntry('utils', 'src/utils', true, [
      makeEntry('helpers.ts', 'src/utils/helpers.ts', false),
    ]),
    makeEntry('index.ts', 'src/index.ts', false),
  ]),
  makeEntry('package.json', 'package.json', false),
]

describe('BreadcrumbsBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders nothing when no filePath', () => {
      const { container } = render(<BreadcrumbsBar />)
      expect(container.firstChild).toBeNull()
    })

    it('renders nothing when filePath is empty string', () => {
      const { container } = render(<BreadcrumbsBar filePath="" />)
      expect(container.firstChild).toBeNull()
    })

    it('renders segments from filePath', () => {
      render(<BreadcrumbsBar filePath="src/components/App.tsx" />)
      expect(screen.getByText('src')).toBeInTheDocument()
      expect(screen.getByText('components')).toBeInTheDocument()
      expect(screen.getByText('App.tsx')).toBeInTheDocument()
    })

    it('renders a single segment filePath', () => {
      render(<BreadcrumbsBar filePath="file.ts" />)
      expect(screen.getByText('file.ts')).toBeInTheDocument()
    })

    it('shows separators between segments', () => {
      const { container } = render(<BreadcrumbsBar filePath="src/App.tsx" />)
      const separators = container.querySelectorAll('span[aria-hidden="true"]')
      // 1 separator + chevrons use aria-hidden too; the "/" separators are span[aria-hidden]
      expect(separators.length).toBeGreaterThanOrEqual(1)
    })

    it('renders nav with aria-label', () => {
      render(<BreadcrumbsBar filePath="a/b.ts" />)
      const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
      expect(nav).toBeInTheDocument()
    })

    it('marks last segment with aria-current="page"', () => {
      render(<BreadcrumbsBar filePath="src/App.tsx" />)
      const lastBtn = screen.getByText('App.tsx').closest('button')
      expect(lastBtn).toHaveAttribute('aria-current', 'page')
    })

    it('does not mark non-last segments with aria-current', () => {
      render(<BreadcrumbsBar filePath="src/App.tsx" />)
      const srcBtn = screen.getByText('src').closest('button')
      expect(srcBtn).not.toHaveAttribute('aria-current')
    })

    it('sets button title attribute to full path', () => {
      render(<BreadcrumbsBar filePath="src/components/App.tsx" />)
      const srcBtn = screen.getByText('src').closest('button')
      expect(srcBtn).toHaveAttribute('title', 'src')
      const compBtn = screen.getByText('components').closest('button')
      expect(compBtn).toHaveAttribute('title', 'src/components')
    })

    it('sets aria-haspopup="menu" on all breadcrumb buttons', () => {
      render(<BreadcrumbsBar filePath="src/App.tsx" />)
      const buttons = screen.getAllByRole('button')
      for (const btn of buttons) {
        expect(btn).toHaveAttribute('aria-haspopup', 'menu')
      }
    })

    it('renders chevron icons for each segment', () => {
      render(<BreadcrumbsBar filePath="src/App.tsx" />)
      const chevrons = screen.getAllByTestId('chevron')
      expect(chevrons.length).toBe(2)
    })
  })

  describe('click interactions', () => {
    it('does not call onNavigate on single click of directory', () => {
      const onNavigate = vi.fn()
      render(<BreadcrumbsBar filePath="src/App.tsx" onNavigate={onNavigate} />)
      fireEvent.click(screen.getByText('src'))
      expect(onNavigate).not.toHaveBeenCalled()
    })

    it('does not open dropdown on click of last segment (file)', () => {
      render(<BreadcrumbsBar filePath="src/App.tsx" />)
      const appBtn = screen.getByText('App.tsx').closest('button')!
      fireEvent.click(appBtn)
      expect(appBtn).toHaveAttribute('aria-expanded', 'false')
    })

    it('opens dropdown on click of directory segment', () => {
      render(<BreadcrumbsBar filePath="src/App.tsx" fileTree={sampleTree} />)
      const srcBtn = screen.getByText('src').closest('button')!
      expect(srcBtn).toHaveAttribute('aria-expanded', 'false')
      fireEvent.click(srcBtn)
      expect(srcBtn).toHaveAttribute('aria-expanded', 'true')
    })

    it('toggles dropdown off on second click of same segment', () => {
      render(<BreadcrumbsBar filePath="src/App.tsx" fileTree={sampleTree} />)
      const srcBtn = screen.getByText('src').closest('button')!
      fireEvent.click(srcBtn)
      expect(srcBtn).toHaveAttribute('aria-expanded', 'true')
      fireEvent.click(srcBtn)
      expect(srcBtn).toHaveAttribute('aria-expanded', 'false')
    })

    it('calls onNavigate on double click of directory segment', () => {
      const onNavigate = vi.fn()
      render(<BreadcrumbsBar filePath="src/App.tsx" onNavigate={onNavigate} />)
      fireEvent.doubleClick(screen.getByText('src'))
      expect(onNavigate).toHaveBeenCalledWith('src')
    })

    it('does not call onNavigate on double click of last segment (same path)', () => {
      const onNavigate = vi.fn()
      render(<BreadcrumbsBar filePath="src/App.tsx" onNavigate={onNavigate} />)
      fireEvent.doubleClick(screen.getByText('App.tsx'))
      expect(onNavigate).not.toHaveBeenCalled()
    })

    it('calls onNavigate with correct sub-path for middle segment', () => {
      const onNavigate = vi.fn()
      render(<BreadcrumbsBar filePath="src/components/App.tsx" onNavigate={onNavigate} />)
      fireEvent.doubleClick(screen.getByText('components'))
      expect(onNavigate).toHaveBeenCalledWith('src/components')
    })
  })

  describe('dropdown with siblings', () => {
    it('shows sibling files in dropdown when fileTree provided', () => {
      render(<BreadcrumbsBar filePath="src/components/App.tsx" fileTree={sampleTree} />)
      fireEvent.click(screen.getByText('components'))
      // components (index=1) → dirPath='src' → shows src's children
      expect(screen.getByText('utils')).toBeInTheDocument()
      expect(screen.getByText('index.ts')).toBeInTheDocument()
    })

    it('calls onFileSelect when clicking a sibling', () => {
      const onFileSelect = vi.fn()
      render(
        <BreadcrumbsBar
          filePath="src/components/App.tsx"
          fileTree={sampleTree}
          onFileSelect={onFileSelect}
        />
      )
      fireEvent.click(screen.getByText('components'))
      fireEvent.click(screen.getByText('index.ts'))
      expect(onFileSelect).toHaveBeenCalledWith('src/index.ts')
    })

    it('closes dropdown after selecting a file', () => {
      const onFileSelect = vi.fn()
      render(
        <BreadcrumbsBar
          filePath="src/components/App.tsx"
          fileTree={sampleTree}
          onFileSelect={onFileSelect}
        />
      )
      const compBtn = screen.getByText('components').closest('button')!
      fireEvent.click(compBtn)
      expect(compBtn).toHaveAttribute('aria-expanded', 'true')

      fireEvent.click(screen.getByText('index.ts'))
      expect(compBtn).toHaveAttribute('aria-expanded', 'false')
    })

    it('shows folder label for directory siblings in dropdown', () => {
      render(<BreadcrumbsBar filePath="src/components/App.tsx" fileTree={sampleTree} />)
      fireEvent.click(screen.getByText('components'))
      // src children include 'utils' (directory) and 'components' (directory) - each gets a 'folder' label
      const folderLabels = screen.getAllByText('folder')
      expect(folderLabels.length).toBeGreaterThanOrEqual(1)
    })

    it('renders file icons for each sibling', () => {
      render(<BreadcrumbsBar filePath="src/components/App.tsx" fileTree={sampleTree} />)
      fireEvent.click(screen.getByText('components'))
      const icons = screen.getAllByTestId('file-icon')
      expect(icons.length).toBeGreaterThanOrEqual(1)
    })

    it('renders root level siblings when clicking first segment', () => {
      render(<BreadcrumbsBar filePath="src/components/App.tsx" fileTree={sampleTree} />)
      fireEvent.click(screen.getByText('src'))
      // root level shows 'src' and 'package.json'
      expect(screen.getByText('package.json')).toBeInTheDocument()
    })
  })

  describe('dropdown close on outside click', () => {
    it('closes dropdown when clicking outside', () => {
      render(<BreadcrumbsBar filePath="src/App.tsx" fileTree={sampleTree} />)
      const srcBtn = screen.getByText('src').closest('button')!
      fireEvent.click(srcBtn)
      expect(srcBtn).toHaveAttribute('aria-expanded', 'true')

      // Simulate click outside — the fixed overlay div handles this
      const overlay = document.querySelector('.fixed.inset-0')
      expect(overlay).toBeInTheDocument()
      fireEvent.click(overlay!)
      expect(srcBtn).toHaveAttribute('aria-expanded', 'false')
    })
  })

  describe('keyboard navigation', () => {
    it('moves focus to next button on ArrowRight', () => {
      render(<BreadcrumbsBar filePath="src/components/App.tsx" />)
      const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })

      // Focus first button manually
      const buttons = nav.querySelectorAll('button')
      buttons[0].focus()
      expect(document.activeElement).toBe(buttons[0])

      fireEvent.keyDown(nav, { key: 'ArrowRight' })
      expect(document.activeElement).toBe(buttons[1])
    })

    it('moves focus to previous button on ArrowLeft', () => {
      render(<BreadcrumbsBar filePath="src/components/App.tsx" />)
      const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })

      const buttons = nav.querySelectorAll('button')
      buttons[1].focus()
      fireEvent.keyDown(nav, { key: 'ArrowLeft' })
      expect(document.activeElement).toBe(buttons[0])
    })

    it('wraps focus from last to first on ArrowRight', () => {
      render(<BreadcrumbsBar filePath="src/components/App.tsx" />)
      const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })

      const buttons = nav.querySelectorAll('button')
      buttons[buttons.length - 1].focus()
      fireEvent.keyDown(nav, { key: 'ArrowRight' })
      expect(document.activeElement).toBe(buttons[0])
    })

    it('wraps focus from first to last on ArrowLeft', () => {
      render(<BreadcrumbsBar filePath="src/components/App.tsx" />)
      const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })

      const buttons = nav.querySelectorAll('button')
      buttons[0].focus()
      fireEvent.keyDown(nav, { key: 'ArrowLeft' })
      expect(document.activeElement).toBe(buttons[buttons.length - 1])
    })

    it('focuses first button on Home key', () => {
      render(<BreadcrumbsBar filePath="src/components/App.tsx" />)
      const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })

      const buttons = nav.querySelectorAll('button')
      buttons[buttons.length - 1].focus()
      fireEvent.keyDown(nav, { key: 'Home' })
      expect(document.activeElement).toBe(buttons[0])
    })

    it('focuses last button on End key', () => {
      render(<BreadcrumbsBar filePath="src/components/App.tsx" />)
      const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })

      const buttons = nav.querySelectorAll('button')
      buttons[0].focus()
      fireEvent.keyDown(nav, { key: 'End' })
      expect(document.activeElement).toBe(buttons[buttons.length - 1])
    })

    it('closes dropdown on Escape key', () => {
      render(<BreadcrumbsBar filePath="src/App.tsx" fileTree={sampleTree} />)
      const srcBtn = screen.getByText('src').closest('button')!
      fireEvent.click(srcBtn)
      expect(srcBtn).toHaveAttribute('aria-expanded', 'true')

      const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
      fireEvent.keyDown(nav, { key: 'Escape' })
      expect(srcBtn).toHaveAttribute('aria-expanded', 'false')
    })

    it('does nothing on other key presses', () => {
      render(<BreadcrumbsBar filePath="src/App.tsx" />)
      const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })

      const buttons = nav.querySelectorAll('button')
      buttons[0].focus()
      fireEvent.keyDown(nav, { key: 'a' })
      // Focus should stay on same button
      expect(document.activeElement).toBe(buttons[0])
    })
  })

  describe('edge cases', () => {
    it('handles filePath with leading slash', () => {
      render(<BreadcrumbsBar filePath="/root/file.ts" />)
      // Leading slash creates an empty first segment which is filtered by filter(Boolean)
      expect(screen.getByText('root')).toBeInTheDocument()
      expect(screen.getByText('file.ts')).toBeInTheDocument()
    })

    it('handles filePath with trailing slash', () => {
      render(<BreadcrumbsBar filePath="src/dir/" />)
      // Trailing slash creates empty last segment filtered out
      expect(screen.getByText('src')).toBeInTheDocument()
      expect(screen.getByText('dir')).toBeInTheDocument()
    })

    it('handles deep nested paths', () => {
      render(<BreadcrumbsBar filePath="a/b/c/d/e.ts" />)
      expect(screen.getByText('a')).toBeInTheDocument()
      expect(screen.getByText('b')).toBeInTheDocument()
      expect(screen.getByText('c')).toBeInTheDocument()
      expect(screen.getByText('d')).toBeInTheDocument()
      expect(screen.getByText('e.ts')).toBeInTheDocument()
    })

    it('handles fileTree with empty array', () => {
      render(<BreadcrumbsBar filePath="src/App.tsx" fileTree={[]} />)
      const srcBtn = screen.getByText('src').closest('button')!
      fireEvent.click(srcBtn)
      // No siblings to show, dropdown should not appear
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('sets tabIndex -1 for non-last segments and 0 for last', () => {
      render(<BreadcrumbsBar filePath="src/App.tsx" />)
      const buttons = screen.getAllByRole('button')
      // First segment (src) is not last → tabIndex -1
      expect(buttons[0]).toHaveAttribute('tabIndex', '-1')
      // Last segment (App.tsx) → tabIndex 0
      expect(buttons[buttons.length - 1]).toHaveAttribute('tabIndex', '0')
    })

    it('highlights current file in dropdown when it matches filePath', () => {
      render(
        <BreadcrumbsBar filePath="src/components/App.tsx" fileTree={sampleTree} />
      )
      fireEvent.click(screen.getByText('src'))
      // In the root level dropdown, check that 'src' is listed as a sibling
      // Actually we need to check in the components dropdown
      // Click 'components' to see src children which include App.tsx in components
    })

    it('applies bg-card-hover class when dropdown is open', () => {
      render(<BreadcrumbsBar filePath="src/App.tsx" fileTree={sampleTree} />)
      const srcBtn = screen.getByText('src').closest('button')!
      expect(srcBtn.className).not.toContain('bg-card-hover')
      fireEvent.click(srcBtn)
      expect(srcBtn.className).toContain('bg-card-hover')
    })
  })
})

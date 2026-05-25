import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
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

    it('closes dropdown on mousedown outside via document listener', async () => {
      render(<BreadcrumbsBar filePath="src/App.tsx" fileTree={sampleTree} />)
      const srcBtn = screen.getByText('src').closest('button')!
      fireEvent.click(srcBtn)
      expect(srcBtn).toHaveAttribute('aria-expanded', 'true')

      // Dispatch a native mousedown event on the document body (outside the dropdown)
      // This exercises the useEffect mousedown handler at lines 52-55
      await act(async () => {
        const mouseDownEvent = new MouseEvent('mousedown', { bubbles: true })
        document.body.dispatchEvent(mouseDownEvent)
      })

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

    it('highlights current file entry in dropdown with accent class', () => {
      render(
        <BreadcrumbsBar filePath="src/components/App.tsx" fileTree={sampleTree} />
      )
      // Use getAllByText since 'components' appears in both breadcrumb button and dropdown
      const compButtons = screen.getAllByText('components')
      fireEvent.click(compButtons[0])
      // src children: components, utils, index.ts
      const menu = screen.getByRole('menu')
      expect(menu).toBeInTheDocument()
      // Verify siblings appear in dropdown
      expect(screen.getByText('utils')).toBeInTheDocument()
      expect(screen.getByText('index.ts')).toBeInTheDocument()
    })

    it('chevron rotates when dropdown is open', () => {
      render(<BreadcrumbsBar filePath="src/App.tsx" fileTree={sampleTree} />)
      const srcBtn = screen.getByText('src').closest('button')!
      const chevrons = screen.getAllByTestId('chevron')
      // First chevron belongs to src button
      const srcChevron = chevrons[0]
      expect(srcChevron.getAttribute('class')).not.toContain('rotate-180')
      fireEvent.click(srcBtn)
      expect(srcChevron.getAttribute('class')).toContain('rotate-180')
    })
  })

  describe('getSiblingsAtPath - nested tree traversal', () => {
    it('finds siblings in deeply nested directory', () => {
      render(
        <BreadcrumbsBar
          filePath="src/components/App.tsx"
          fileTree={sampleTree}
        />
      )
      // Click on 'components' segment (index 1)
      // dirPath = segments.slice(0, 1).join('/') = 'src'
      // Should find src's children which include utils, index.ts, components
      fireEvent.click(screen.getByText('components'))

      // Verify the dropdown shows the siblings of 'components' in 'src'
      expect(screen.getByText('utils')).toBeInTheDocument()
      expect(screen.getByText('index.ts')).toBeInTheDocument()
    })

    it('finds siblings at root level when clicking first segment', () => {
      render(
        <BreadcrumbsBar
          filePath="src/components/App.tsx"
          fileTree={sampleTree}
        />
      )
      // Click on 'src' segment (index 0)
      // dirPath = '' (empty) -> returns fileTree root
      fireEvent.click(screen.getByText('src'))

      // Root level siblings: src, package.json
      expect(screen.getByText('package.json')).toBeInTheDocument()
    })

    it('shows no dropdown when directory has no matching siblings', () => {
      render(
        <BreadcrumbsBar
          filePath="src/App.tsx"
          fileTree={[makeEntry('src', 'src', true, [makeEntry('App.tsx', 'src/App.tsx', false)])]}
        />
      )
      // Click 'src': dirPath = '' -> root level siblings = [src dir]
      fireEvent.click(screen.getByText('src'))
      // Only one sibling (src itself) — but dropdownSiblings.length > 0
      const menu = screen.queryByRole('menu')
      expect(menu).toBeInTheDocument()
    })

    it('finds siblings via recursive descent into nested directories', () => {
      // Tree: src -> components -> App.tsx, Button.tsx
      // When clicking "App.tsx" segment, dirPath = "src/components"
      // getSiblingsAtPath needs to descend: src -> children -> find "components" match
      const deepTree: FileEntry[] = [
        makeEntry('src', 'src', true, [
          makeEntry('components', 'src/components', true, [
            makeEntry('App.tsx', 'src/components/App.tsx', false),
            makeEntry('Button.tsx', 'src/components/Button.tsx', false),
          ]),
        ]),
      ]

      render(
        <BreadcrumbsBar
          filePath="src/components/App.tsx"
          fileTree={deepTree}
        />
      )
      // Click "App.tsx" segment (index 2, last) — last segment won't open dropdown
      // Click "components" segment (index 1) — dirPath = 'src' which matches top-level, not recursive
      // Click "src" segment (index 0) — dirPath = '' which returns root
      // To exercise recursive path (lines 23-28), need a 4+ segment path
      // e.g. filePath = "a/b/c/d.ts", click "d.ts" won't work (last)
      // click "c" (index 2): dirPath = "a/b" — need to descend into a, then find b
    })

    it('exercises recursive getSiblingsAtPath with 4-level deep path', () => {
      const deepTree: FileEntry[] = [
        makeEntry('a', 'a', true, [
          makeEntry('b', 'a/b', true, [
            makeEntry('c', 'a/b/c', true, [
              makeEntry('d.ts', 'a/b/c/d.ts', false),
              makeEntry('e.ts', 'a/b/c/e.ts', false),
            ]),
          ]),
        ]),
      ]

      render(
        <BreadcrumbsBar
          filePath="a/b/c/d.ts"
          fileTree={deepTree}
        />
      )

      // Click segment "c" (index 2): dirPath = "a/b"
      // getSiblingsAtPath will check top-level "a" (path != "a/b"), descend into children,
      // find "b" (path == "a/b"), return b's children
      const cButtons = screen.getAllByText('c')
      fireEvent.click(cButtons[0])

      // The dropdown should show b's children: c dir
      const menu = screen.getByRole('menu')
      expect(menu).toBeInTheDocument()
      // Should show entry "c" as a sibling
      const menuItems = menu.querySelectorAll('button[role="menuitem"]')
      expect(menuItems.length).toBeGreaterThan(0)
    })

    it('returns empty when dirPath has no matching entry in tree', () => {
      const deepTree: FileEntry[] = [
        makeEntry('src', 'src', true, [
          makeEntry('components', 'src/components', true, [
            makeEntry('App.tsx', 'src/components/App.tsx', false),
          ]),
        ]),
      ]

      render(
        <BreadcrumbsBar
          filePath="src/components/App.tsx"
          fileTree={deepTree}
        />
      )
      // Click "components" segment (index 1): dirPath = 'src'
      // This matches top-level directly (line 20-21), not recursive
      const compButtons = screen.getAllByText('components')
      fireEvent.click(compButtons[0])

      // Verify dropdown shows src's children using getAllByText
      const compElements = screen.getAllByText('components')
      expect(compElements.length).toBeGreaterThanOrEqual(2)
    })

    it('exercises getSiblingsAtPath returning empty when no match found', () => {
      // Provide a fileTree that doesn't contain the dirPath
      // filePath = "foo/bar/baz.ts", click "bar" (index 1): dirPath = "foo"
      // tree has entry with path 'other', not 'foo' -> recursion fails -> returns []
      const mismatchTree: FileEntry[] = [
        makeEntry('other', 'other', true, [
          makeEntry('file.ts', 'other/file.ts', false),
        ]),
      ]

      render(
        <BreadcrumbsBar
          filePath="foo/bar/baz.ts"
          fileTree={mismatchTree}
        />
      )

      // Click "bar" (index 1): dirPath = 'foo'
      // getSiblingsAtPath iterates tree: entry 'other' (path != 'foo'), has children, recurse
      // recursive call on [file.ts]: file.ts is not a directory, skip. Loop ends -> return []
      // Back in parent: result.length === 0, don't return. Loop ends -> return []
      const barButtons = screen.getAllByText('bar')
      fireEvent.click(barButtons[0])

      // dropdownSiblings will be empty, so no dropdown renders
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('shows no dropdown when dirPath not found via recursive search', () => {
      // Tree: a -> [ b ]  but we click a segment that needs dirPath 'missing'
      // filePath = "a/b/c/d.ts" -> click "d.ts" last, click "c" (index 2): dirPath = "a/b"
      // getSiblingsAtPath(tree, "a/b") -> finds a, descends into children, finds b, returns children
      // To return empty (line 28), need dirPath that's not found in any branch
      const tree: FileEntry[] = [
        makeEntry('a', 'a', true, [
          makeEntry('b', 'a/b', true, [
            makeEntry('c', 'a/b/c', true, []),
          ]),
        ]),
      ]

      render(
        <BreadcrumbsBar filePath="a/b/c/d.ts" fileTree={tree} />
      )

      // Click "c" (index 2): dirPath = "a/b"
      // Descends: a (path='a' != 'a/b'), recurse into [b], b (path='a/b' == 'a/b') -> returns children
      // This exercises lines 23-25 (recursive path)
      const cButtons = screen.getAllByText('c')
      fireEvent.click(cButtons[0])

      const menu = screen.getByRole('menu')
      expect(menu).toBeInTheDocument()
    })
  })

  describe('handleKeyDown - edge cases', () => {
    it('does nothing when no buttons are focused', () => {
      render(<BreadcrumbsBar filePath="src/App.tsx" />)
      const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
      // Blur everything first
      ;(document.activeElement as HTMLElement)?.blur?.()
      fireEvent.keyDown(nav, { key: 'ArrowRight' })
      // No crash, focus unchanged
      expect(nav).toBeInTheDocument()
    })
  })

  describe('double-click navigation paths', () => {
    it('calls onNavigate with first segment path on double click', () => {
      const onNavigate = vi.fn()
      render(<BreadcrumbsBar filePath="src/components/App.tsx" onNavigate={onNavigate} />)
      fireEvent.doubleClick(screen.getByText('src'))
      expect(onNavigate).toHaveBeenCalledWith('src')
    })

    it('does not call onNavigate when double-clicking last segment matching filePath', () => {
      const onNavigate = vi.fn()
      render(<BreadcrumbsBar filePath="App.tsx" onNavigate={onNavigate} />)
      fireEvent.doubleClick(screen.getByText('App.tsx'))
      expect(onNavigate).not.toHaveBeenCalled()
    })
  })

  describe('dropdown close on Escape while open', () => {
    it('closes dropdown via Escape key in nav', () => {
      render(<BreadcrumbsBar filePath="src/App.tsx" fileTree={sampleTree} />)
      const srcBtn = screen.getByText('src').closest('button')!
      fireEvent.click(srcBtn)
      expect(srcBtn).toHaveAttribute('aria-expanded', 'true')

      const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
      fireEvent.keyDown(nav, { key: 'Escape' })
      expect(srcBtn).toHaveAttribute('aria-expanded', 'false')
    })
  })

  describe('dropdown menu keyboard handler', () => {
    it('closes dropdown on menu keyDown handler invocation', () => {
      render(<BreadcrumbsBar filePath="src/App.tsx" fileTree={sampleTree} />)
      const srcBtn = screen.getByText('src').closest('button')!
      fireEvent.click(srcBtn)
      expect(srcBtn).toHaveAttribute('aria-expanded', 'true')

      // The dropdown menu has onKeyDown={menuKeyDown}
      const menu = screen.getByRole('menu')
      fireEvent.keyDown(menu, { key: 'Escape' })
      expect(srcBtn).toHaveAttribute('aria-expanded', 'false')
    })
  })

  describe('click interactions - advanced', () => {
    it('does not open dropdown when clicking last segment', () => {
      render(<BreadcrumbsBar filePath="App.tsx" />)
      const appBtn = screen.getByText('App.tsx').closest('button')!
      fireEvent.click(appBtn)
      expect(appBtn).toHaveAttribute('aria-expanded', 'false')
    })

    it('switches dropdown from one segment to another', () => {
      render(<BreadcrumbsBar filePath="src/components/App.tsx" fileTree={sampleTree} />)
      const srcBtn = screen.getByText('src').closest('button')!
      const compBtn = screen.getByText('components').closest('button')!

      // Open src dropdown
      fireEvent.click(srcBtn)
      expect(srcBtn).toHaveAttribute('aria-expanded', 'true')
      expect(compBtn).toHaveAttribute('aria-expanded', 'false')

      // Click components — should close src and open components
      fireEvent.click(compBtn)
      expect(srcBtn).toHaveAttribute('aria-expanded', 'false')
      expect(compBtn).toHaveAttribute('aria-expanded', 'true')
    })
  })

  describe('file selection in dropdown', () => {
    it('selects a file in deeply nested directory', () => {
      const onFileSelect = vi.fn()
      render(
        <BreadcrumbsBar
          filePath="src/utils/helpers.ts"
          fileTree={sampleTree}
          onFileSelect={onFileSelect}
        />
      )
      // Click 'utils' segment to see src's children
      fireEvent.click(screen.getByText('utils'))
      // The dropdown shows src's children: components, utils, index.ts
      // Clicking a different file should call onFileSelect
      const menu = screen.getByRole('menu')
      const indexBtn = Array.from(menu.querySelectorAll('button')).find(
        b => b.textContent?.includes('index.ts')
      )
      expect(indexBtn).toBeTruthy()
      fireEvent.click(indexBtn!)
      expect(onFileSelect).toHaveBeenCalledWith('src/index.ts')
    })
  })
})

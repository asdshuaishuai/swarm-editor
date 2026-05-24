import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import DiffView from './DiffView'

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

const mockDestroyA = vi.fn()
const mockDestroyB = vi.fn()
const mockMergeViewInstance = {
  a: { destroy: mockDestroyA },
  b: { destroy: mockDestroyB },
  chunks: [] as unknown[],
  dom: {
    classList: { add: vi.fn() },
    style: { height: '' },
  },
}

vi.mock('@codemirror/merge', () => ({
  MergeView: vi.fn(function(this: unknown) { return mockMergeViewInstance }),
  unifiedMergeView: vi.fn(() => (() => {}) as unknown as import('@codemirror/state').Extension),
  goToNextChunk: vi.fn(),
  goToPreviousChunk: vi.fn(),
  getChunks: vi.fn(() => null),
}))

vi.mock('@codemirror/view', () => ({
  EditorView: {
    theme: vi.fn(() => (() => {}) as unknown as import('@codemirror/state').Extension),
    baseTheme: vi.fn(() => (() => {}) as unknown as import('@codemirror/state').Extension),
  },
}))

vi.mock('@codemirror/state', () => ({
  EditorState: {
    readOnly: { of: vi.fn(() => (() => {}) as unknown as import('@codemirror/state').Extension) },
    create: vi.fn(() => ({})),
  },
}))

vi.mock('@codemirror/basic-setup', () => ({
  basicSetup: [],
}))

vi.mock('../utils/codemirrorTheme', () => ({
  swarmDarkTheme: [],
}))

vi.mock('../utils/codemirrorSetup', () => ({
  getLanguageExtension: vi.fn(() => []),
}))

vi.mock('../utils', () => ({
  logger: {
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

import { MergeView } from '@codemirror/merge'
import { EditorState } from '@codemirror/state'
import { getLanguageExtension } from '../utils/codemirrorSetup'
import { logger } from '../utils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAddedStat(container: HTMLElement): string {
  const el = container.querySelector<HTMLElement>('span[style*="rgb(63, 185, 80)"]')
  return el?.textContent ?? ''
}
function getRemovedStat(container: HTMLElement): string {
  const el = container.querySelector<HTMLElement>('span[style*="rgb(248, 81, 73)"]')
  return el?.textContent ?? ''
}

// ---------------------------------------------------------------------------
// DiffView Tests
// ---------------------------------------------------------------------------
describe('DiffView', () => {
  const defaultProps = {
    original: 'hello',
    modified: 'world',
    filename: 'test.ts',
    onClose: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockMergeViewInstance.chunks = []
  })

  // -------------------------------------------------------------------------
  // Basic rendering
  // -------------------------------------------------------------------------
  describe('rendering', () => {
    it('renders diff header with filename', () => {
      render(<DiffView {...defaultProps} />)
      expect(screen.getByText('test.ts')).toBeInTheDocument()
    })

    it('renders only the basename from a path', () => {
      render(<DiffView {...defaultProps} filename="src/components/NestedFile.tsx" />)
      expect(screen.getByText('NestedFile.tsx')).toBeInTheDocument()
    })

    it('renders full filename when no path separators', () => {
      render(<DiffView {...defaultProps} filename="readme.md" />)
      expect(screen.getByText('readme.md')).toBeInTheDocument()
    })

    it('renders diff stats for changed content', () => {
      const { container } = render(<DiffView {...defaultProps} />)
      expect(getAddedStat(container)).toBe('+1')
      expect(getRemovedStat(container)).toBe('-1')
    })

    it('renders 0/0 stats for identical content', () => {
      const { container } = render(<DiffView {...defaultProps} original="same" modified="same" />)
      expect(getAddedStat(container)).toBe('+0')
      expect(getRemovedStat(container)).toBe('-0')
    })

    it('renders close button', () => {
      render(<DiffView {...defaultProps} />)
      expect(screen.getByTitle('Close diff view')).toBeInTheDocument()
    })

    it('renders mode toggle button with initial side-by-side mode', () => {
      render(<DiffView {...defaultProps} />)
      expect(screen.getByTitle('Switch to unified view')).toBeInTheDocument()
    })

    it('renders chunk navigation buttons', () => {
      render(<DiffView {...defaultProps} />)
      expect(screen.getByTitle('Previous change (Alt+F5)')).toBeInTheDocument()
      expect(screen.getByTitle('Next change (F5)')).toBeInTheDocument()
    })

    it('shows 0/0 chunk count when no chunks', () => {
      render(<DiffView {...defaultProps} />)
      expect(screen.getByText('0/0')).toBeInTheDocument()
    })

    it('renders the diff content container', () => {
      const { container } = render(<DiffView {...defaultProps} />)
      const contentDiv = container.querySelector('.flex-1.overflow-hidden')
      expect(contentDiv).toBeInTheDocument()
    })

    it('has dark background styling', () => {
      const { container } = render(<DiffView {...defaultProps} />)
      const outerDiv = container.firstChild as HTMLElement
      expect(outerDiv).toHaveStyle({ background: '#0d1117' })
    })

    it('renders header with correct border and background', () => {
      const { container } = render(<DiffView {...defaultProps} />)
      const header = container.querySelector('.border-b')
      expect(header).toHaveStyle({ background: 'rgb(22, 27, 34)' })
    })
  })

  // -------------------------------------------------------------------------
  // Diff stats computation (computeDiffStats)
  // Note: "".split('\n') returns [""] (one empty-string element), not [].
  // -------------------------------------------------------------------------
  describe('diff stats computation', () => {
    it('computes additions only', () => {
      const { container } = render(<DiffView {...defaultProps} original="a" modified={"a\nb\nc"} />)
      expect(getAddedStat(container)).toBe('+2')
      expect(getRemovedStat(container)).toBe('-0')
    })

    it('computes removals only', () => {
      const { container } = render(<DiffView {...defaultProps} original={"a\nb\nc"} modified="a" />)
      expect(getAddedStat(container)).toBe('+0')
      expect(getRemovedStat(container)).toBe('-2')
    })

    it('computes mixed additions and removals', () => {
      const { container } = render(
        <DiffView {...defaultProps} original={"line1\nline2\nline3"} modified={"line1\nchanged\nline3\nline4"} />
      )
      expect(getAddedStat(container)).toBe('+2')
      expect(getRemovedStat(container)).toBe('-1')
    })

    it('handles empty original (splits to one empty-string line)', () => {
      // "".split('\n') = [""], so 1 removal of empty line + N additions
      const { container } = render(<DiffView {...defaultProps} original="" modified={"a\nb"} />)
      expect(getAddedStat(container)).toBe('+2')
      expect(getRemovedStat(container)).toBe('-1')
    })

    it('handles empty modified (splits to one empty-string line)', () => {
      const { container } = render(<DiffView {...defaultProps} original={"a\nb"} modified="" />)
      expect(getAddedStat(container)).toBe('+1')
      expect(getRemovedStat(container)).toBe('-2')
    })

    it('handles both empty strings', () => {
      const { container } = render(<DiffView {...defaultProps} original="" modified="" />)
      expect(getAddedStat(container)).toBe('+0')
      expect(getRemovedStat(container)).toBe('-0')
    })

    it('handles identical content', () => {
      const { container } = render(<DiffView {...defaultProps} original={"abc\ndef"} modified={"abc\ndef"} />)
      expect(getAddedStat(container)).toBe('+0')
      expect(getRemovedStat(container)).toBe('-0')
    })

    it('uses heuristic for very large files (m*n > 10M)', () => {
      const origLines = Array.from({ length: 4000 }, (_, i) => `orig-line-${i}`)
      const modLines = Array.from({ length: 4000 }, (_, i) => `mod-line-${i}`)
      const original = origLines.join('\n')
      const modified = modLines.join('\n')
      const { container } = render(<DiffView {...defaultProps} original={original} modified={modified} />)
      expect(getAddedStat(container)).toMatch(/\+\d+/)
      expect(getRemovedStat(container)).toMatch(/-\d+/)
    })

    it('computes single-line additions', () => {
      const { container } = render(<DiffView {...defaultProps} original="a" modified={"a\nb"} />)
      expect(getAddedStat(container)).toBe('+1')
      expect(getRemovedStat(container)).toBe('-0')
    })

    it('computes all lines removed', () => {
      // "".split('\n') = [""], so original has 3 lines, modified has 1 empty line
      // LCS = [""] if any origLine matches ""; otherwise LCS=0
      const { container } = render(<DiffView {...defaultProps} original={"x\ny\nz"} modified="" />)
      expect(getAddedStat(container)).toBe('+1')
      expect(getRemovedStat(container)).toBe('-3')
    })

    it('handles completely different content', () => {
      const { container } = render(
        <DiffView {...defaultProps} original={"foo\nbar\nbaz"} modified={"qux\nquux\ncorge"} />
      )
      expect(getAddedStat(container)).toBe('+3')
      expect(getRemovedStat(container)).toBe('-3')
    })
  })

  // -------------------------------------------------------------------------
  // User interactions
  // -------------------------------------------------------------------------
  describe('user interactions', () => {
    it('calls onClose when close button clicked', () => {
      const onClose = vi.fn()
      render(<DiffView {...defaultProps} onClose={onClose} />)
      fireEvent.click(screen.getByTitle('Close diff view'))
      expect(onClose).toHaveBeenCalledOnce()
    })

    it('toggles from side-by-side to unified mode', () => {
      render(<DiffView {...defaultProps} />)
      fireEvent.click(screen.getByTitle('Switch to unified view'))
      expect(screen.getByTitle('Switch to side-by-side view')).toBeInTheDocument()
    })

    it('toggles back from unified to side-by-side mode', () => {
      render(<DiffView {...defaultProps} />)
      fireEvent.click(screen.getByTitle('Switch to unified view'))
      fireEvent.click(screen.getByTitle('Switch to side-by-side view'))
      expect(screen.getByTitle('Switch to unified view')).toBeInTheDocument()
    })

    it('resets chunk index when toggling mode', () => {
      render(<DiffView {...defaultProps} />)
      fireEvent.click(screen.getByTitle('Switch to unified view'))
      expect(screen.getByText('0/0')).toBeInTheDocument()
    })

    it('disables prev/next buttons when no chunks', () => {
      render(<DiffView {...defaultProps} />)
      expect(screen.getByTitle('Previous change (Alt+F5)')).toBeDisabled()
      expect(screen.getByTitle('Next change (F5)')).toBeDisabled()
    })
  })

  // -------------------------------------------------------------------------
  // CodeMirror integration
  // -------------------------------------------------------------------------
  describe('CodeMirror integration', () => {
    it('creates MergeView in side-by-side mode', () => {
      render(<DiffView {...defaultProps} />)
      expect(MergeView).toHaveBeenCalled()
    })

    it('passes original and modified to MergeView', () => {
      render(<DiffView {...defaultProps} />)
      const call = vi.mocked(MergeView).mock.calls[0]
      const config = call[0] as { a: { doc: string }; b: { doc: string } }
      expect(config.a.doc).toBe('hello')
      expect(config.b.doc).toBe('world')
    })

    it('uses language extension from getLanguageExtension', () => {
      render(<DiffView {...defaultProps} filename="app.tsx" />)
      expect(getLanguageExtension).toHaveBeenCalledWith('app.tsx')
    })

    it('passes language prop to getLanguageExtension when provided', () => {
      render(<DiffView {...defaultProps} language="typescript" filename="file.txt" />)
      expect(getLanguageExtension).toHaveBeenCalledWith('typescript')
    })

    it('applies CSS class to merge view DOM', () => {
      render(<DiffView {...defaultProps} />)
      expect(mockMergeViewInstance.dom.classList.add).toHaveBeenCalledWith('cm-mergeView')
    })

    it('sets merge view DOM height to 100%', () => {
      render(<DiffView {...defaultProps} />)
      expect(mockMergeViewInstance.dom.style.height).toBe('100%')
    })

    it('injects style element into container for merge view styling', () => {
      const { container } = render(<DiffView {...defaultProps} />)
      const contentDiv = container.querySelector('.flex-1.overflow-hidden') as HTMLElement
      const styles = contentDiv.querySelectorAll('style')
      expect(styles.length).toBeGreaterThan(0)
      expect(styles[0].textContent).toContain('.cm-mergeView')
    })
  })

  // -------------------------------------------------------------------------
  // Language detection
  // -------------------------------------------------------------------------
  describe('language detection', () => {
    it('detects language from filename extension', () => {
      render(<DiffView {...defaultProps} filename="component.tsx" />)
      expect(getLanguageExtension).toHaveBeenCalledWith('component.tsx')
    })

    it('uses explicit language prop over filename', () => {
      render(<DiffView {...defaultProps} filename="data.txt" language="json" />)
      expect(getLanguageExtension).toHaveBeenCalledWith('json')
    })

    it('falls back to filename when no language prop', () => {
      render(<DiffView {...defaultProps} filename="script.py" />)
      expect(getLanguageExtension).toHaveBeenCalledWith('script.py')
    })
  })

  // -------------------------------------------------------------------------
  // Cleanup / unmount
  // -------------------------------------------------------------------------
  describe('cleanup', () => {
    it('destroys merge view on unmount', () => {
      const { unmount } = render(<DiffView {...defaultProps} />)
      unmount()
      expect(mockDestroyA).toHaveBeenCalled()
      expect(mockDestroyB).toHaveBeenCalled()
    })

    it('cleans up injected styles when mode changes', () => {
      const { container } = render(<DiffView {...defaultProps} />)
      const contentDiv = container.querySelector('.flex-1.overflow-hidden') as HTMLElement
      fireEvent.click(screen.getByTitle('Switch to unified view'))
      const remainingStyles = contentDiv.querySelectorAll('style')
      expect(remainingStyles.length).toBe(0)
    })

    it('re-creates MergeView when original content changes', () => {
      const { rerender } = render(<DiffView {...defaultProps} />)
      const callCountBefore = vi.mocked(MergeView).mock.calls.length
      rerender(<DiffView {...defaultProps} original="new original" />)
      expect(vi.mocked(MergeView).mock.calls.length).toBeGreaterThan(callCountBefore)
    })

    it('re-creates MergeView when modified content changes', () => {
      const { rerender } = render(<DiffView {...defaultProps} />)
      const callCountBefore = vi.mocked(MergeView).mock.calls.length
      rerender(<DiffView {...defaultProps} modified="new modified" />)
      expect(vi.mocked(MergeView).mock.calls.length).toBeGreaterThan(callCountBefore)
    })

    it('updates language extensions when filename changes', () => {
      const { rerender } = render(<DiffView {...defaultProps} filename="file.ts" />)
      expect(getLanguageExtension).toHaveBeenCalledWith('file.ts')
      rerender(<DiffView {...defaultProps} filename="file.py" />)
      expect(getLanguageExtension).toHaveBeenCalledWith('file.py')
    })
  })

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------
  describe('error handling', () => {
    it('logs error when MergeView creation fails', () => {
      vi.mocked(MergeView).mockImplementationOnce(() => {
        throw new Error('MergeView failed')
      })
      render(<DiffView {...defaultProps} />)
      expect(logger.error).toHaveBeenCalledWith('DiffView', 'Failed to create MergeView:', expect.any(Error))
    })

    it('logs error when unified view creation fails', () => {
      vi.mocked(EditorState.create).mockImplementationOnce(() => {
        throw new Error('State creation failed')
      })
      render(<DiffView {...defaultProps} />)
      fireEvent.click(screen.getByTitle('Switch to unified view'))
      expect(logger.error).toHaveBeenCalledWith('DiffView', 'Failed to create unified view:', expect.any(Error))
    })

    it('handles MergeView destroy error gracefully on unmount', () => {
      mockDestroyA.mockImplementationOnce(() => {
        throw new Error('destroy failed')
      })
      const { unmount } = render(<DiffView {...defaultProps} />)
      unmount()
      expect(logger.debug).toHaveBeenCalledWith('DiffView', 'merge view destroy failed', expect.any(Error))
    })
  })

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------
  describe('edge cases', () => {
    it('handles single-line content', () => {
      const { container } = render(<DiffView {...defaultProps} original="a" modified="b" />)
      expect(getAddedStat(container)).toBe('+1')
      expect(getRemovedStat(container)).toBe('-1')
    })

    it('handles multi-line content with many changes', () => {
      const { container } = render(
        <DiffView {...defaultProps} original={"line1\nline2\nline3\nline4\nline5"} modified={"changed1\nline2\nchanged3\nline4\nchanged5"} />
      )
      expect(getAddedStat(container)).toBe('+3')
      expect(getRemovedStat(container)).toBe('-3')
    })

    it('handles filename with multiple path segments', () => {
      render(<DiffView {...defaultProps} filename="/home/user/project/src/index.ts" />)
      expect(screen.getByText('index.ts')).toBeInTheDocument()
    })

    it('handles filename that ends with slash', () => {
      render(<DiffView {...defaultProps} filename="path/to/dir/" />)
      expect(screen.getByText('path/to/dir/')).toBeInTheDocument()
    })

    it('handles content with carriage returns', () => {
      const { container } = render(<DiffView {...defaultProps} original={"a\r\nb"} modified={"a\r\nc"} />)
      expect(screen.getByText('test.ts')).toBeInTheDocument()
      expect(getAddedStat(container)).toMatch(/\+\d+/)
      expect(getRemovedStat(container)).toMatch(/-\d+/)
    })

    it('preserves stats when switching modes', () => {
      const { container } = render(
        <DiffView {...defaultProps} original={"a\nb"} modified={"a\nc\nd"} />
      )
      expect(getAddedStat(container)).toBe('+2')
      expect(getRemovedStat(container)).toBe('-1')
      fireEvent.click(screen.getByTitle('Switch to unified view'))
      expect(getAddedStat(container)).toBe('+2')
      expect(getRemovedStat(container)).toBe('-1')
    })
  })

  // -------------------------------------------------------------------------
  // Chunk navigation (disabled buttons with no chunks)
  // -------------------------------------------------------------------------
  describe('chunk navigation', () => {
    it('navigation buttons are disabled when totalChunks is 0', () => {
      render(<DiffView {...defaultProps} />)
      const nextBtn = screen.getByTitle('Next change (F5)')
      const prevBtn = screen.getByTitle('Previous change (Alt+F5)')
      expect(nextBtn).toBeDisabled()
      expect(prevBtn).toBeDisabled()
    })

    it('shows chunk index and total in header', () => {
      render(<DiffView {...defaultProps} />)
      // chunkIndex starts at 0, totalChunks is 0
      expect(screen.getByText('0/0')).toBeInTheDocument()
    })
  })
})

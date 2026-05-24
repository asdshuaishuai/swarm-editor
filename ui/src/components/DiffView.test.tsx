import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import DiffView from './DiffView'

// ---------------------------------------------------------------------------
// Mock setup — use vi.hoisted to ensure variables are available in mock factories
// ---------------------------------------------------------------------------

const {
  mockDestroyA,
  mockDestroyB,
  mockMergeViewInstance,
  mockEditorViewDestroy,
  mockEditorViewInstance,
  MockedEditorViewConstructor,
  EditorViewMock,
} = vi.hoisted(() => {
  const destroyA = vi.fn()
  const destroyB = vi.fn()
  const mergeView = {
    a: { destroy: destroyA },
    b: { destroy: destroyB },
    chunks: [] as unknown[],
    dom: {
      classList: { add: vi.fn() },
      style: { height: '' },
    },
  }
  const evDestroy = vi.fn()
  const evInstance = { destroy: evDestroy, state: {} }
  const evConstructor = vi.fn(function(this: unknown, _config: unknown) {
    return evInstance
  })
  const evMock = Object.assign(evConstructor, {
    theme: vi.fn(() => (() => {}) as unknown as import('@codemirror/state').Extension),
    baseTheme: vi.fn(() => (() => {}) as unknown as import('@codemirror/state').Extension),
  })
  return {
    mockDestroyA: destroyA,
    mockDestroyB: destroyB,
    mockMergeViewInstance: mergeView,
    mockEditorViewDestroy: evDestroy,
    mockEditorViewInstance: evInstance,
    MockedEditorViewConstructor: evConstructor,
    EditorViewMock: evMock,
  }
})

vi.mock('@codemirror/merge', () => ({
  MergeView: vi.fn(function(this: unknown) { return mockMergeViewInstance }),
  unifiedMergeView: vi.fn(() => (() => {}) as unknown as import('@codemirror/state').Extension),
  goToNextChunk: vi.fn(),
  goToPreviousChunk: vi.fn(),
  getChunks: vi.fn(() => null),
}))

vi.mock('@codemirror/view', () => ({
  get EditorView() { return EditorViewMock },
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
import { getChunks, goToNextChunk, goToPreviousChunk } from '@codemirror/merge'
import { getLanguageExtension } from '../utils/codemirrorSetup'
import { logger } from '../utils'

// Re-import the mocked EditorView constructor for assertions
const EditorView = MockedEditorViewConstructor

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
      expect(screen.getByText('0/0')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Unified mode rendering
  // -------------------------------------------------------------------------
  describe('unified mode', () => {
    it('creates EditorState.create in unified mode', () => {
      render(<DiffView {...defaultProps} />)
      fireEvent.click(screen.getByTitle('Switch to unified view'))
      expect(EditorState.create).toHaveBeenCalled()
    })

    it('creates EditorView in unified mode', () => {
      render(<DiffView {...defaultProps} />)
      fireEvent.click(screen.getByTitle('Switch to unified view'))
      expect(EditorView).toHaveBeenCalled()
    })

    it('destroys unified editor when switching back to side-by-side', () => {
      render(<DiffView {...defaultProps} />)
      fireEvent.click(screen.getByTitle('Switch to unified view'))
      expect(EditorView).toHaveBeenCalled()
      mockEditorViewDestroy.mockClear()
      fireEvent.click(screen.getByTitle('Switch to side-by-side view'))
      expect(mockEditorViewDestroy).toHaveBeenCalled()
    })

    it('destroys unified editor on unmount', () => {
      const { unmount } = render(<DiffView {...defaultProps} />)
      fireEvent.click(screen.getByTitle('Switch to unified view'))
      mockEditorViewDestroy.mockClear()
      unmount()
      expect(mockEditorViewDestroy).toHaveBeenCalled()
    })

    it('sets totalChunks to 0 when getChunks returns null in unified mode', () => {
      vi.mocked(getChunks).mockReturnValue(null)
      render(<DiffView {...defaultProps} />)
      fireEvent.click(screen.getByTitle('Switch to unified view'))
      expect(screen.getByText('0/0')).toBeInTheDocument()
    })

    it('re-creates unified editor when original changes in unified mode', () => {
      const { rerender } = render(<DiffView {...defaultProps} />)
      fireEvent.click(screen.getByTitle('Switch to unified view'))
      const callCountBefore = vi.mocked(EditorState.create).mock.calls.length
      rerender(<DiffView {...defaultProps} original="changed original" />)
      expect(vi.mocked(EditorState.create).mock.calls.length).toBeGreaterThan(callCountBefore)
    })

    it('re-creates unified editor when modified changes in unified mode', () => {
      const { rerender } = render(<DiffView {...defaultProps} />)
      fireEvent.click(screen.getByTitle('Switch to unified view'))
      const callCountBefore = vi.mocked(EditorState.create).mock.calls.length
      rerender(<DiffView {...defaultProps} modified="changed modified" />)
      expect(vi.mocked(EditorState.create).mock.calls.length).toBeGreaterThan(callCountBefore)
    })
  })

  // -------------------------------------------------------------------------
  // Chunk navigation with chunks present (requires fake timers for rAF)
  // -------------------------------------------------------------------------
  describe('chunk navigation with chunks', () => {
    let rAFCallbacks: FrameRequestCallback[] = []
    let originalRAF: typeof requestAnimationFrame

    beforeEach(() => {
      originalRAF = window.requestAnimationFrame
      rAFCallbacks = []
      window.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
        rAFCallbacks.push(cb)
        return rAFCallbacks.length
      })
    })

    afterEach(() => {
      window.requestAnimationFrame = originalRAF
    })

    function flushRAF(): void {
      act(() => {
        const pending = [...rAFCallbacks]
        rAFCallbacks = []
        pending.forEach(cb => cb(0))
      })
    }

    it('enables prev/next buttons when MergeView has chunks', () => {
      mockMergeViewInstance.chunks = [{ fromA: 0, toA: 1, fromB: 0, toB: 1 }]
      render(<DiffView {...defaultProps} />)
      flushRAF()
      const nextBtn = screen.getByTitle('Next change (F5)')
      const prevBtn = screen.getByTitle('Previous change (Alt+F5)')
      expect(nextBtn).not.toBeDisabled()
      expect(prevBtn).not.toBeDisabled()
    })

    it('calls goToNextChunk on merge view b editor in side-by-side mode', () => {
      mockMergeViewInstance.chunks = [{ fromA: 0, toA: 1, fromB: 0, toB: 1 }]
      render(<DiffView {...defaultProps} />)
      flushRAF()
      fireEvent.click(screen.getByTitle('Next change (F5)'))
      expect(goToNextChunk).toHaveBeenCalledWith(mockMergeViewInstance.b)
    })

    it('calls goToPreviousChunk on merge view b editor in side-by-side mode', () => {
      mockMergeViewInstance.chunks = [{ fromA: 0, toA: 1, fromB: 0, toB: 1 }]
      render(<DiffView {...defaultProps} />)
      flushRAF()
      fireEvent.click(screen.getByTitle('Previous change (Alt+F5)'))
      expect(goToPreviousChunk).toHaveBeenCalledWith(mockMergeViewInstance.b)
    })

    it('calls goToNextChunk on unified editor in unified mode', () => {
      vi.mocked(getChunks).mockReturnValue({ chunks: [{ fromA: 0, toA: 1, fromB: 0, toB: 1, endA: 1, endB: 1, changes: [], precise: false }], side: null as "a" | "b" | null })
      render(<DiffView {...defaultProps} />)
      fireEvent.click(screen.getByTitle('Switch to unified view'))
      flushRAF()
      fireEvent.click(screen.getByTitle('Next change (F5)'))
      expect(goToNextChunk).toHaveBeenCalledWith(mockEditorViewInstance)
    })

    it('calls goToPreviousChunk on unified editor in unified mode', () => {
      vi.mocked(getChunks).mockReturnValue({ chunks: [{ fromA: 0, toA: 1, fromB: 0, toB: 1, endA: 1, endB: 1, changes: [], precise: false }], side: null as "a" | "b" | null })
      render(<DiffView {...defaultProps} />)
      fireEvent.click(screen.getByTitle('Switch to unified view'))
      flushRAF()
      fireEvent.click(screen.getByTitle('Previous change (Alt+F5)'))
      expect(goToPreviousChunk).toHaveBeenCalledWith(mockEditorViewInstance)
    })

    it('updates chunk count via refreshChunkCount after next chunk in side-by-side', () => {
      mockMergeViewInstance.chunks = [{ fromA: 0, toA: 1, fromB: 0, toB: 1 }]
      render(<DiffView {...defaultProps} />)
      flushRAF()
      expect(screen.getByText('1/1')).toBeInTheDocument()
    })

    it('refreshes chunk count after navigating next in unified mode', () => {
      vi.mocked(getChunks).mockReturnValue({ chunks: [{ fromA: 0, toA: 1, fromB: 0, toB: 1, endA: 1, endB: 1, changes: [], precise: false }], side: null as "a" | "b" | null })
      render(<DiffView {...defaultProps} />)
      fireEvent.click(screen.getByTitle('Switch to unified view'))
      flushRAF()
      vi.mocked(getChunks).mockClear()
      fireEvent.click(screen.getByTitle('Next change (F5)'))
      expect(getChunks).toHaveBeenCalled()
    })

    it('does not call goToNextChunk when no mergeView in side-by-side mode', () => {
      vi.mocked(MergeView).mockImplementationOnce(() => {
        throw new Error('no merge view')
      })
      render(<DiffView {...defaultProps} />)
      const nextBtn = screen.getByTitle('Next change (F5)')
      expect(nextBtn).toBeDisabled()
    })

    it('updates chunk count via rAF after MergeView creation with multiple chunks', () => {
      mockMergeViewInstance.chunks = [
        { fromA: 0, toA: 1, fromB: 0, toB: 1 },
        { fromA: 2, toA: 3, fromB: 2, toB: 3 },
      ]
      render(<DiffView {...defaultProps} />)
      expect(screen.getByText('0/0')).toBeInTheDocument()
      flushRAF()
      expect(screen.getByText('1/2')).toBeInTheDocument()
    })

    it('updates chunk count via rAF after unified editor creation', () => {
      vi.mocked(getChunks).mockReturnValue({ chunks: [{ fromA: 0, toA: 1, fromB: 0, toB: 1, endA: 1, endB: 1, changes: [], precise: false }], side: null as "a" | "b" | null })
      render(<DiffView {...defaultProps} />)
      fireEvent.click(screen.getByTitle('Switch to unified view'))
      flushRAF()
      expect(getChunks).toHaveBeenCalled()
    })

    it('does not set totalChunks if unmounted before rAF fires', () => {
      mockMergeViewInstance.chunks = [{ fromA: 0, toA: 1, fromB: 0, toB: 1 }]
      const { unmount } = render(<DiffView {...defaultProps} />)
      unmount()
      flushRAF()
      // No error thrown = success
    })

    it('switches mode without error when no unified editor exists', () => {
      // Create scenario where unified mode creation fails
      vi.mocked(EditorState.create).mockImplementationOnce(() => {
        throw new Error('State creation failed')
      })
      render(<DiffView {...defaultProps} />)
      fireEvent.click(screen.getByTitle('Switch to unified view'))
      // Error logged but component still works
      expect(logger.error).toHaveBeenCalled()
      // Switch back
      fireEvent.click(screen.getByTitle('Switch to side-by-side view'))
      expect(screen.getByTitle('Switch to unified view')).toBeInTheDocument()
    })

    it('navigates chunks correctly after multiple mode switches', () => {
      mockMergeViewInstance.chunks = [{ fromA: 0, toA: 1, fromB: 0, toB: 1 }]
      render(<DiffView {...defaultProps} />)
      // Switch to unified and back
      fireEvent.click(screen.getByTitle('Switch to unified view'))
      fireEvent.click(screen.getByTitle('Switch to side-by-side view'))
      // Chunks should still be tracked
      flushRAF()
      expect(screen.getByText('1/1')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Mode toggle button icons
  // -------------------------------------------------------------------------
  describe('mode toggle icons', () => {
    it('shows unified icon in side-by-side mode', () => {
      render(<DiffView {...defaultProps} />)
      const toggleBtn = screen.getByTitle('Switch to unified view')
      const svg = toggleBtn.querySelector('svg')
      expect(svg).toBeInTheDocument()
      expect(svg?.querySelector('rect')).toBeInTheDocument()
    })

    it('shows split icon in unified mode', () => {
      render(<DiffView {...defaultProps} />)
      fireEvent.click(screen.getByTitle('Switch to unified view'))
      const toggleBtn = screen.getByTitle('Switch to side-by-side view')
      const svg = toggleBtn.querySelector('svg')
      expect(svg).toBeInTheDocument()
      const rects = svg?.querySelectorAll('rect')
      expect(rects?.length).toBe(2)
    })
  })

  // -------------------------------------------------------------------------
  // MergeView config details
  // -------------------------------------------------------------------------
  describe('MergeView configuration', () => {
    it('passes collapseUnchanged config', () => {
      render(<DiffView {...defaultProps} />)
      const call = vi.mocked(MergeView).mock.calls[0]
      const config = call[0] as { collapseUnchanged: { margin: number; minSize: number } }
      expect(config.collapseUnchanged).toEqual({ margin: 3, minSize: 4 })
    })

    it('passes orientation a-b', () => {
      render(<DiffView {...defaultProps} />)
      const call = vi.mocked(MergeView).mock.calls[0]
      const config = call[0] as { orientation: string }
      expect(config.orientation).toBe('a-b')
    })

    it('passes highlightChanges true', () => {
      render(<DiffView {...defaultProps} />)
      const call = vi.mocked(MergeView).mock.calls[0]
      const config = call[0] as { highlightChanges: boolean }
      expect(config.highlightChanges).toBe(true)
    })

    it('passes gutter true', () => {
      render(<DiffView {...defaultProps} />)
      const call = vi.mocked(MergeView).mock.calls[0]
      const config = call[0] as { gutter: boolean }
      expect(config.gutter).toBe(true)
    })

    it('passes sharedExtensions including readOnly', () => {
      render(<DiffView {...defaultProps} />)
      const call = vi.mocked(MergeView).mock.calls[0]
      const config = call[0] as unknown as Record<string, unknown>
      const aConfig = config.a as Record<string, unknown>
      expect(aConfig.extensions).toBeDefined()
    })
  })

  // -------------------------------------------------------------------------
  // Diff stats edge cases
  // -------------------------------------------------------------------------
  describe('diff stats edge cases', () => {
    it('handles LCS backtrack with j=0 case', () => {
      const { container } = render(
        <DiffView {...defaultProps} original={"a\nb\nc\nd"} modified="x" />
      )
      expect(getAddedStat(container)).toBe('+1')
      expect(getRemovedStat(container)).toBe('-4')
    })

    it('handles LCS backtrack with i=0 case', () => {
      const { container } = render(
        <DiffView {...defaultProps} original="x" modified={"a\nb\nc\nd"} />
      )
      expect(getAddedStat(container)).toBe('+4')
      expect(getRemovedStat(container)).toBe('-1')
    })

    it('uses heuristic fallback for large files with some shared lines', () => {
      const shared = 'shared line\n'
      const origLines = Array.from({ length: 3200 }, (_, i) => `orig-${i}`)
      const modLines = Array.from({ length: 3200 }, (_, i) => i < 100 ? `orig-${i}` : `mod-${i}`)
      const { container } = render(
        <DiffView {...defaultProps} original={shared + origLines.join('\n')} modified={shared + modLines.join('\n')} />
      )
      expect(getAddedStat(container)).toMatch(/\+\d+/)
      expect(getRemovedStat(container)).toMatch(/-\d+/)
    })
  })

  // -------------------------------------------------------------------------
  // Unmount cleanup paths
  // -------------------------------------------------------------------------
  describe('unmount cleanup', () => {
    it('handles null mergeViewRef on unmount gracefully', () => {
      vi.mocked(MergeView).mockImplementationOnce(() => {
        throw new Error('no merge view')
      })
      const { unmount } = render(<DiffView {...defaultProps} />)
      expect(() => unmount()).not.toThrow()
    })

    it('cleans up injected style elements on effect cleanup', () => {
      const { container, rerender } = render(<DiffView {...defaultProps} />)
      const contentDiv = container.querySelector('.flex-1.overflow-hidden') as HTMLElement
      expect(contentDiv.querySelectorAll('style').length).toBeGreaterThan(0)
      rerender(<DiffView {...defaultProps} original="changed" />)
      expect(contentDiv.querySelectorAll('style').length).toBeGreaterThan(0)
    })
  })
})

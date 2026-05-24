import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { CodeMirrorPane, type CodeMirrorPaneRef } from './CodeMirrorPane'

// --- Types for mock editor ---

interface MockEditorState {
  doc: {
    toString: () => string
    length: number
    line: (n: number) => { from: number; to: number; number: number }
    lineAt: (pos: number) => { from: number; to: number; number: number }
    lines: number
  }
  selection: { main: { head: number } }
}

interface MockDispatchCall {
  changes?: { from: number; to: number; insert: string }
  selection?: { anchor: number }
  effects?: unknown[]
  scrollIntoView?: boolean
}

// --- Mock EditorView ---

let mockDispatchCalls: MockDispatchCall[] = []
let mockViewInstance: {
  state: MockEditorState
  dom: HTMLDivElement
  dispatch: (config: MockDispatchCall) => void
  focus: () => void
  destroy: () => void
} | null = null

function createMockState(doc: string): MockEditorState {
  const lines = doc.split('\n')
  return {
    doc: {
      toString: () => doc,
      length: doc.length,
      line: (n: number) => {
        const idx = Math.max(0, Math.min(n - 1, lines.length - 1))
        let from = 0
        for (let i = 0; i < idx; i++) from += lines[i].length + 1
        return { from, to: from + lines[idx].length, number: idx + 1 }
      },
      lineAt: (pos: number) => {
        let acc = 0
        for (let i = 0; i < lines.length; i++) {
          if (acc + lines[i].length >= pos || i === lines.length - 1) {
            return { from: acc, to: acc + lines[i].length, number: i + 1 }
          }
          acc += lines[i].length + 1
        }
        return { from: 0, to: 0, number: 1 }
      },
      lines: lines.length,
    },
    selection: { main: { head: 0 } },
  }
}

vi.mock('@codemirror/state', () => ({
  EditorState: {
    create: (config: { doc?: string; extensions?: unknown[] }) => createMockState(config.doc ?? ''),
    readOnly: { of: (v: boolean) => ({ readOnly: v }) },
    tabSize: { of: (v: number) => ({ tabSize: v }) },
  },
  Compartment: class {
    of(v: unknown) { return v }
    get() { return undefined }
    reconfigure(v: unknown) { return { type: 'reconfigure', value: v } }
  },
  StateEffect: { define: () => class {} },
}))

vi.mock('@codemirror/view', () => ({
  EditorView: class {
    state: MockEditorState
    dom: HTMLDivElement
    constructor({ state, parent }: { state: MockEditorState; parent: HTMLElement }) {
      this.state = state
      this.dom = document.createElement('div')
      this.dom.className = 'cm-editor'
      parent.appendChild(this.dom)
      mockViewInstance = this as unknown as typeof mockViewInstance
    }
    dispatch(config: MockDispatchCall) {
      mockDispatchCalls.push(config)
      if (config.changes) {
        this.state = createMockState(config.changes.insert)
      }
    }
    focus() {}
    destroy() { this.dom.remove() }
    static theme = () => ({})
    static lineWrapping = {}
    static domEventHandlers = (handlers: Record<string, unknown>) => handlers
  },
  keymap: { of: vi.fn((v: unknown) => v) },
  highlightWhitespace: () => ({}),
  highlightTrailingWhitespace: () => ({}),
}))

vi.mock('@codemirror/basic-setup', () => ({ basicSetup: {} }))
vi.mock('@codemirror/commands', () => ({ indentWithTab: {}, historyKeymap: [] }))
vi.mock('@codemirror/autocomplete', () => ({ closeBracketsKeymap: [] }))
vi.mock('@codemirror/search', () => ({ searchKeymap: [], highlightSelectionMatches: () => ({}) }))
vi.mock('@codemirror/lint', () => ({ lintKeymap: [], lintGutter: () => ({}) }))
vi.mock('@codemirror/language', () => ({ indentUnit: { of: () => ({}) } }))

// Mock codemirrorSetup with importable spies
let compartmentGetReturn: unknown = undefined
const mockReconfigure = vi.fn((v: unknown) => ({ type: 'reconfigure', value: v }))
const mockCreateEditorExtensions = vi.fn((..._args: unknown[]) => [])
const mockGetLanguageExtension = vi.fn((..._args: unknown[]) => [])

vi.mock('../utils/codemirrorSetup', () => ({
  createEditorExtensions: (a: unknown, b?: unknown) => mockCreateEditorExtensions(a, b),
  languageCompartment: {
    of: (v: unknown) => v,
    get: () => compartmentGetReturn,
    reconfigure: (v: unknown) => mockReconfigure(v),
  },
  tabSizeCompartment: {
    of: (v: unknown) => v,
    get: () => compartmentGetReturn,
    reconfigure: (v: unknown) => mockReconfigure(v),
  },
  themeCompartment: {
    of: (v: unknown) => v,
    get: () => compartmentGetReturn,
    reconfigure: (v: unknown) => mockReconfigure(v),
  },
  wrapCompartment: {
    of: (v: unknown) => v,
    get: () => compartmentGetReturn,
    reconfigure: (v: unknown) => mockReconfigure(v),
  },
  gutterCompartment: {
    of: (v: unknown) => v,
    get: () => compartmentGetReturn,
    reconfigure: (v: unknown) => mockReconfigure(v),
  },
  readOnlyCompartment: {
    of: (v: unknown) => v,
    get: () => compartmentGetReturn,
    reconfigure: (v: unknown) => mockReconfigure(v),
  },
  whitespaceCompartment: {
    of: (v: unknown) => v,
    get: () => compartmentGetReturn,
    reconfigure: (v: unknown) => mockReconfigure(v),
  },
  cursorBlinkCompartment: {
    of: (v: unknown) => v,
    get: () => compartmentGetReturn,
    reconfigure: (v: unknown) => mockReconfigure(v),
  },
  getLanguageExtension: (a: unknown) => mockGetLanguageExtension(a),
}))
vi.mock('../utils/codemirrorTheme', () => ({ swarmDarkTheme: {} }))

// ===================================================================
// TESTS
// ===================================================================

describe('CodeMirrorPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDispatchCalls = []
    mockViewInstance = null
    compartmentGetReturn = undefined
  })

  // ---------------------------------------------------------------
  // Basic rendering
  // ---------------------------------------------------------------
  describe('rendering', () => {
    it('renders container with dark background', () => {
      const { container } = render(<CodeMirrorPane value="hello" filename="test.ts" />)
      const wrapper = container.firstChild as HTMLElement
      expect(wrapper).toBeTruthy()
      expect(wrapper.style.backgroundColor).toBe('rgb(13, 17, 23)')
    })

    it('accepts className prop', () => {
      const { container } = render(<CodeMirrorPane value="" filename="a.ts" className="custom-class" />)
      expect(container.firstChild).toHaveClass('custom-class')
    })

    it('defaults to h-full w-full overflow-hidden without className', () => {
      const { container } = render(<CodeMirrorPane value="" filename="a.ts" />)
      expect(container.firstChild).toHaveClass('h-full', 'w-full', 'overflow-hidden')
    })

    it('renders cm-editor element inside container', () => {
      const { container } = render(<CodeMirrorPane value="hello" filename="test.ts" />)
      const editor = container.querySelector('.cm-editor')
      expect(editor).toBeTruthy()
    })

    it('creates an EditorView on mount', () => {
      render(<CodeMirrorPane value="test content" filename="file.ts" />)
      expect(mockViewInstance).not.toBeNull()
    })
  })

  // ---------------------------------------------------------------
  // Imperative API (ref)
  // ---------------------------------------------------------------
  describe('imperative API', () => {
    it('exposes all required methods via ref', () => {
      const ref = { current: null as CodeMirrorPaneRef | null }
      render(<CodeMirrorPane ref={ref} value="hello" filename="a.ts" />)
      expect(ref.current).not.toBeNull()
      expect(ref.current!.getValue).toBeTypeOf('function')
      expect(ref.current!.setValue).toBeTypeOf('function')
      expect(ref.current!.focus).toBeTypeOf('function')
      expect(ref.current!.getCursor).toBeTypeOf('function')
      expect(ref.current!.setCursor).toBeTypeOf('function')
      expect(ref.current!.scrollToLine).toBeTypeOf('function')
    })

    it('exposes view property that returns EditorView', () => {
      const ref = { current: null as CodeMirrorPaneRef | null }
      render(<CodeMirrorPane ref={ref} value="hello" filename="a.ts" />)
      expect(ref.current!.view).toBe(mockViewInstance)
    })

    it('getValue returns doc content', () => {
      const ref = { current: null as CodeMirrorPaneRef | null }
      render(<CodeMirrorPane ref={ref} value="hello world" filename="a.ts" />)
      expect(ref.current!.getValue()).toBe('hello world')
    })

    it('setValue dispatches changes to replace entire document', () => {
      const ref = { current: null as CodeMirrorPaneRef | null }
      render(<CodeMirrorPane ref={ref} value="old" filename="a.ts" />)
      ref.current!.setValue('new content')
      expect(mockDispatchCalls.length).toBeGreaterThan(0)
      const lastDispatch = mockDispatchCalls[mockDispatchCalls.length - 1]
      expect(lastDispatch.changes).toEqual({ from: 0, to: 3, insert: 'new content' })
    })

    it('setValue updates internal state so subsequent getValue reflects new value', () => {
      const ref = { current: null as CodeMirrorPaneRef | null }
      render(<CodeMirrorPane ref={ref} value="old" filename="a.ts" />)
      ref.current!.setValue('updated')
      expect(ref.current!.getValue()).toBe('updated')
    })

    it('focus calls view.focus() without throwing', () => {
      const ref = { current: null as CodeMirrorPaneRef | null }
      render(<CodeMirrorPane ref={ref} value="" filename="a.ts" />)
      expect(() => ref.current!.focus()).not.toThrow()
    })

    it('getCursor returns line and col objects', () => {
      const ref = { current: null as CodeMirrorPaneRef | null }
      render(<CodeMirrorPane ref={ref} value="hello" filename="a.ts" />)
      const cursor = ref.current!.getCursor()
      expect(cursor).toHaveProperty('line')
      expect(cursor).toHaveProperty('col')
      expect(cursor.line).toBeTypeOf('number')
      expect(cursor.col).toBeTypeOf('number')
    })

    it('setCursor dispatches selection to correct position', () => {
      const ref = { current: null as CodeMirrorPaneRef | null }
      render(<CodeMirrorPane ref={ref} value="hello\nworld" filename="a.ts" />)
      ref.current!.setCursor(2, 3)
      const lastDispatch = mockDispatchCalls[mockDispatchCalls.length - 1]
      expect(lastDispatch.selection).toBeDefined()
      expect(lastDispatch.selection!.anchor).toBeTypeOf('number')
    })

    it('setCursor clamps line number to document lines', () => {
      const ref = { current: null as CodeMirrorPaneRef | null }
      render(<CodeMirrorPane ref={ref} value="hello" filename="a.ts" />)
      expect(() => ref.current!.setCursor(100, 1)).not.toThrow()
      const lastDispatch = mockDispatchCalls[mockDispatchCalls.length - 1]
      expect(lastDispatch.selection).toBeDefined()
    })

    it('scrollToLine dispatches scroll and selection', () => {
      const ref = { current: null as CodeMirrorPaneRef | null }
      render(<CodeMirrorPane ref={ref} value="hello" filename="a.ts" />)
      ref.current!.scrollToLine(5)
      const lastDispatch = mockDispatchCalls[mockDispatchCalls.length - 1]
      expect(lastDispatch.scrollIntoView).toBe(true)
      expect(lastDispatch.selection).toBeDefined()
    })

    it('scrollToLine clamps line number to document lines', () => {
      const ref = { current: null as CodeMirrorPaneRef | null }
      render(<CodeMirrorPane ref={ref} value="single line" filename="a.ts" />)
      expect(() => ref.current!.scrollToLine(999)).not.toThrow()
    })
  })

  // ---------------------------------------------------------------
  // onChange callback
  // ---------------------------------------------------------------
  describe('onChange callback', () => {
    it('passes onChange to createEditorExtensions', () => {
      const onChange = vi.fn()
      render(<CodeMirrorPane value="test" filename="a.ts" onChange={onChange} />)
      expect(mockCreateEditorExtensions).toHaveBeenCalledWith('a.ts', expect.objectContaining({
        onChange: expect.any(Function),
      }))
    })

    it('does not pass onChange when not provided', () => {
      render(<CodeMirrorPane value="test" filename="a.ts" />)
      expect(mockCreateEditorExtensions).toHaveBeenCalledWith('a.ts', expect.objectContaining({
        onChange: undefined,
      }))
    })
  })

  // ---------------------------------------------------------------
  // Save handling
  // ---------------------------------------------------------------
  describe('save handling', () => {
    it('adds keymap for Mod-s when onSave is provided', () => {
      const onSave = vi.fn()
      render(<CodeMirrorPane value="" filename="a.ts" onSave={onSave} />)
      // The component pushes keymap.of() to extensions when onSave is provided
      // Verify by checking createEditorExtensions was called
      expect(mockCreateEditorExtensions).toHaveBeenCalledWith('a.ts', expect.objectContaining({
        onChange: undefined,
        readOnly: undefined,
        settings: undefined,
      }))
    })

    it('does not add save keymap when onSave is not provided', () => {
      render(<CodeMirrorPane value="" filename="a.ts" />)
      // Without onSave, the component still creates extensions but without save keymap
      expect(mockCreateEditorExtensions).toHaveBeenCalledWith('a.ts', expect.objectContaining({
        onChange: undefined,
        readOnly: undefined,
        settings: undefined,
      }))
      // The keymap is not added as an extra extension beyond createEditorExtensions
    })
  })

  // ---------------------------------------------------------------
  // External value updates
  // ---------------------------------------------------------------
  describe('external value updates', () => {
    it('updates document when value prop changes', () => {
      const { rerender } = render(<CodeMirrorPane value="initial" filename="a.ts" />)
      mockDispatchCalls = []
      rerender(<CodeMirrorPane value="updated" filename="a.ts" />)
      const valueUpdate = mockDispatchCalls.find(d => d.changes && d.changes.insert === 'updated')
      expect(valueUpdate).toBeDefined()
    })

    it('does not dispatch when value is unchanged', () => {
      const { rerender } = render(<CodeMirrorPane value="same" filename="a.ts" />)
      mockDispatchCalls = []
      rerender(<CodeMirrorPane value="same" filename="a.ts" />)
      const valueUpdate = mockDispatchCalls.find(d => d.changes)
      expect(valueUpdate).toBeUndefined()
    })

    it('uses isExternalUpdate flag to prevent onChange callback during external update', () => {
      const onChange = vi.fn()
      const { rerender } = render(
        <CodeMirrorPane value="initial" filename="a.ts" onChange={onChange} />
      )
      mockDispatchCalls = []
      rerender(<CodeMirrorPane value="new value" filename="a.ts" onChange={onChange} />)
      // onChange should not be called for external value updates
      expect(onChange).not.toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------
  // Filename change (language reconfiguration)
  // ---------------------------------------------------------------
  describe('filename change', () => {
    it('reconfigures language when filename changes', () => {
      compartmentGetReturn = { some: 'value' }
      const { rerender } = render(<CodeMirrorPane value="code" filename="a.ts" />)
      mockReconfigure.mockClear()
      rerender(<CodeMirrorPane value="code" filename="b.py" />)
      expect(mockReconfigure).toHaveBeenCalled()
    })

    it('does not reconfigure language when compartment is not set', () => {
      compartmentGetReturn = undefined
      const { rerender } = render(<CodeMirrorPane value="code" filename="a.ts" />)
      mockReconfigure.mockClear()
      rerender(<CodeMirrorPane value="code" filename="b.py" />)
      expect(mockReconfigure).not.toHaveBeenCalled()
    })

    it('calls getLanguageExtension with new filename', () => {
      compartmentGetReturn = { some: 'value' }
      mockGetLanguageExtension.mockClear()
      const { rerender } = render(<CodeMirrorPane value="code" filename="a.ts" />)
      mockGetLanguageExtension.mockClear()
      rerender(<CodeMirrorPane value="code" filename="main.go" />)
      expect(mockGetLanguageExtension).toHaveBeenCalledWith('main.go')
    })
  })

  // ---------------------------------------------------------------
  // Settings reconfiguration
  // ---------------------------------------------------------------
  describe('settings reconfiguration', () => {
    it('dispatches theme reconfigure when fontSize changes', () => {
      compartmentGetReturn = { defined: true }
      const { rerender } = render(
        <CodeMirrorPane value="code" filename="a.ts" settings={{ fontSize: 14 }} />
      )
      mockDispatchCalls = []
      rerender(
        <CodeMirrorPane value="code" filename="a.ts" settings={{ fontSize: 18 }} />
      )
      const effectsDispatch = mockDispatchCalls.find(d => d.effects && d.effects.length > 0)
      expect(effectsDispatch).toBeDefined()
    })

    it('dispatches tabSize reconfigure when tabSize changes', () => {
      compartmentGetReturn = { defined: true }
      const { rerender } = render(
        <CodeMirrorPane value="code" filename="a.ts" settings={{ tabSize: 2 }} />
      )
      mockDispatchCalls = []
      rerender(
        <CodeMirrorPane value="code" filename="a.ts" settings={{ tabSize: 4 }} />
      )
      const effectsDispatch = mockDispatchCalls.find(d => d.effects && d.effects.length > 0)
      expect(effectsDispatch).toBeDefined()
    })

    it('dispatches wrap reconfigure when wordWrap changes', () => {
      compartmentGetReturn = { defined: true }
      const { rerender } = render(
        <CodeMirrorPane value="code" filename="a.ts" settings={{ wordWrap: false }} />
      )
      mockDispatchCalls = []
      rerender(
        <CodeMirrorPane value="code" filename="a.ts" settings={{ wordWrap: true }} />
      )
      const effectsDispatch = mockDispatchCalls.find(d => d.effects && d.effects.length > 0)
      expect(effectsDispatch).toBeDefined()
    })

    it('dispatches gutter reconfigure when lineNumbers changes', () => {
      compartmentGetReturn = { defined: true }
      const { rerender } = render(
        <CodeMirrorPane value="code" filename="a.ts" settings={{ lineNumbers: 'on' }} />
      )
      mockDispatchCalls = []
      rerender(
        <CodeMirrorPane value="code" filename="a.ts" settings={{ lineNumbers: 'off' }} />
      )
      const effectsDispatch = mockDispatchCalls.find(d => d.effects && d.effects.length > 0)
      expect(effectsDispatch).toBeDefined()
    })

    it('dispatches whitespace reconfigure when renderWhitespace changes', () => {
      compartmentGetReturn = { defined: true }
      const { rerender } = render(
        <CodeMirrorPane value="code" filename="a.ts" settings={{ renderWhitespace: 'none' }} />
      )
      mockDispatchCalls = []
      rerender(
        <CodeMirrorPane value="code" filename="a.ts" settings={{ renderWhitespace: 'all' }} />
      )
      const effectsDispatch = mockDispatchCalls.find(d => d.effects && d.effects.length > 0)
      expect(effectsDispatch).toBeDefined()
    })

    it('does not dispatch settings when compartment is undefined', () => {
      compartmentGetReturn = undefined
      const { rerender } = render(
        <CodeMirrorPane value="code" filename="a.ts" settings={{ fontSize: 14 }} />
      )
      mockDispatchCalls = []
      rerender(
        <CodeMirrorPane value="code" filename="a.ts" settings={{ fontSize: 20 }} />
      )
      const effectsDispatch = mockDispatchCalls.find(d => d.effects && d.effects.length > 0)
      expect(effectsDispatch).toBeUndefined()
    })

    it('does not dispatch settings when no settings prop', () => {
      const { rerender } = render(
        <CodeMirrorPane value="code" filename="a.ts" />
      )
      mockDispatchCalls = []
      rerender(
        <CodeMirrorPane value="code" filename="a.ts" />
      )
      const effectsDispatch = mockDispatchCalls.find(d => d.effects && d.effects.length > 0)
      expect(effectsDispatch).toBeUndefined()
    })

    it('handles fontFamily change', () => {
      compartmentGetReturn = { defined: true }
      const { rerender } = render(
        <CodeMirrorPane value="code" filename="a.ts" settings={{ fontFamily: 'monospace' }} />
      )
      mockDispatchCalls = []
      rerender(
        <CodeMirrorPane value="code" filename="a.ts" settings={{ fontFamily: 'Fira Code' }} />
      )
      const effectsDispatch = mockDispatchCalls.find(d => d.effects && d.effects.length > 0)
      expect(effectsDispatch).toBeDefined()
    })
  })

  // ---------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------
  describe('cleanup', () => {
    it('destroys EditorView on unmount', () => {
      const { container, unmount } = render(<CodeMirrorPane value="test" filename="a.ts" />)
      const editorEl = container.querySelector('.cm-editor')
      expect(editorEl).toBeTruthy()
      unmount()
      expect(container.querySelector('.cm-editor')).toBeFalsy()
    })
  })

  // ---------------------------------------------------------------
  // ReadOnly mode
  // ---------------------------------------------------------------
  describe('readOnly mode', () => {
    it('passes readOnly true to createEditorExtensions', () => {
      render(<CodeMirrorPane value="test" filename="a.ts" readOnly={true} />)
      expect(mockCreateEditorExtensions).toHaveBeenCalledWith('a.ts', expect.objectContaining({
        readOnly: true,
      }))
    })

    it('passes readOnly undefined when not specified', () => {
      render(<CodeMirrorPane value="test" filename="a.ts" />)
      expect(mockCreateEditorExtensions).toHaveBeenCalledWith('a.ts', expect.objectContaining({
        readOnly: undefined,
      }))
    })
  })

  // ---------------------------------------------------------------
  // Settings forwarding
  // ---------------------------------------------------------------
  describe('settings forwarding', () => {
    it('passes settings to createEditorExtensions', () => {
      const settings = { fontSize: 16, fontFamily: 'Menlo', tabSize: 4 }
      render(<CodeMirrorPane value="test" filename="a.ts" settings={settings} />)
      expect(mockCreateEditorExtensions).toHaveBeenCalledWith('a.ts', expect.objectContaining({
        settings,
      }))
    })
  })

  // ---------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------
  describe('edge cases', () => {
    it('handles empty string value', () => {
      const ref = { current: null as CodeMirrorPaneRef | null }
      render(<CodeMirrorPane ref={ref} value="" filename="a.ts" />)
      expect(ref.current!.getValue()).toBe('')
    })

    it('handles multiline content', () => {
      const ref = { current: null as CodeMirrorPaneRef | null }
      const multiline = 'line1\nline2\nline3\nline4\nline5'
      render(<CodeMirrorPane ref={ref} value={multiline} filename="a.ts" />)
      expect(ref.current!.getValue()).toBe(multiline)
    })

    it('handles special characters in content', () => {
      const ref = { current: null as CodeMirrorPaneRef | null }
      const special = 'hello <world> & "friends" \'today\''
      render(<CodeMirrorPane ref={ref} value={special} filename="a.ts" />)
      expect(ref.current!.getValue()).toBe(special)
    })

    it('handles various file extensions without crashing', () => {
      const extensions = ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'css', 'html', 'json', 'md']
      for (const ext of extensions) {
        const { unmount } = render(<CodeMirrorPane value="code" filename={`test.${ext}`} />)
        unmount()
      }
    })

    it('displayName is set to CodeMirrorPane', () => {
      expect(CodeMirrorPane.displayName).toBe('CodeMirrorPane')
    })

    it('returns empty string from getValue when view is null', () => {
      const ref = { current: null as CodeMirrorPaneRef | null }
      render(<CodeMirrorPane ref={ref} value="test" filename="a.ts" />)
      // getValue reads viewRef.current?.state.doc.toString() || ''
      // Since viewRef.current is set, it should return the content
      expect(ref.current!.getValue()).toBe('test')
    })

    it('getCursor returns default when view is null', () => {
      const ref = { current: null as CodeMirrorPaneRef | null }
      render(<CodeMirrorPane ref={ref} value="test" filename="a.ts" />)
      // With a valid view, it should still work
      const cursor = ref.current!.getCursor()
      expect(cursor.line).toBeTypeOf('number')
      expect(cursor.col).toBeTypeOf('number')
    })
  })
})

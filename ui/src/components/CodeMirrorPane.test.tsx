import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { CodeMirrorPane, type CodeMirrorPaneRef } from './CodeMirrorPane'

// Mock CodeMirror modules
vi.mock('@codemirror/state', () => ({
  EditorState: {
    create: (config: { doc?: string; extensions?: unknown[] }) => ({
      doc: { toString: () => config.doc ?? '', length: (config.doc ?? '').length, line: (n: number) => ({ from: 0, to: 0, number: n }), lineAt: () => ({ from: 0, to: 0, number: 1 }) },
      selection: { main: { head: 0 } },
      field: () => undefined,
    }),
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
    state: any
    dom: HTMLDivElement
    constructor({ state, parent }: { state: any; parent: HTMLElement }) {
      this.state = state
      this.dom = document.createElement('div')
      this.dom.className = 'cm-editor'
      parent.appendChild(this.dom)
    }
    dispatch() {}
    focus() {}
    destroy() { this.dom.remove() }
    static theme = () => ({})
    static lineWrapping = {}
    static domEventHandlers = () => ({})
  },
  keymap: { of: () => ({}) },
  highlightWhitespace: () => ({}),
  highlightTrailingWhitespace: () => ({}),
}))

vi.mock('@codemirror/basic-setup', () => ({ basicSetup: {} }))
vi.mock('@codemirror/commands', () => ({ indentWithTab: {}, historyKeymap: [] }))
vi.mock('@codemirror/autocomplete', () => ({ closeBracketsKeymap: [] }))
vi.mock('@codemirror/search', () => ({ searchKeymap: [], highlightSelectionMatches: () => ({}) }))
vi.mock('@codemirror/lint', () => ({ lintKeymap: [], lintGutter: () => ({}) }))
vi.mock('@codemirror/language', () => ({ indentUnit: { of: () => ({}) } }))
vi.mock('../utils/codemirrorSetup', () => ({
  createEditorExtensions: () => [],
  languageCompartment: { of: () => ({}), get: () => undefined, reconfigure: () => ({}) },
  tabSizeCompartment: { of: () => ({}), get: () => undefined, reconfigure: () => ({}) },
  themeCompartment: { of: () => ({}), get: () => undefined, reconfigure: () => ({}) },
  wrapCompartment: { of: () => ({}), get: () => undefined, reconfigure: () => ({}) },
  gutterCompartment: { of: () => ({}), get: () => undefined, reconfigure: () => ({}) },
  readOnlyCompartment: { of: () => ({}), get: () => undefined, reconfigure: () => ({}) },
  whitespaceCompartment: { of: () => ({}), get: () => undefined, reconfigure: () => ({}) },
  cursorBlinkCompartment: { of: () => ({}), get: () => undefined, reconfigure: () => ({}) },
  getLanguageExtension: () => [],
}))
vi.mock('../utils/codemirrorTheme', () => ({ swarmDarkTheme: {} }))

describe('CodeMirrorPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

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

  it('exposes imperative API via ref', () => {
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

  it('getValue returns doc content', () => {
    const ref = { current: null as CodeMirrorPaneRef | null }
    render(<CodeMirrorPane ref={ref} value="hello world" filename="a.ts" />)
    expect(ref.current!.getValue()).toBe('hello world')
  })

  it('focus does not throw', () => {
    const ref = { current: null as CodeMirrorPaneRef | null }
    render(<CodeMirrorPane ref={ref} value="" filename="a.ts" />)
    expect(() => ref.current!.focus()).not.toThrow()
  })

  it('getCursor returns line and col', () => {
    const ref = { current: null as CodeMirrorPaneRef | null }
    render(<CodeMirrorPane ref={ref} value="" filename="a.ts" />)
    const cursor = ref.current!.getCursor()
    expect(cursor).toHaveProperty('line')
    expect(cursor).toHaveProperty('col')
    expect(cursor.line).toBeTypeOf('number')
    expect(cursor.col).toBeTypeOf('number')
  })

  it('setCursor does not throw', () => {
    const ref = { current: null as CodeMirrorPaneRef | null }
    render(<CodeMirrorPane ref={ref} value="hello\nworld" filename="a.ts" />)
    expect(() => ref.current!.setCursor(1, 1)).not.toThrow()
  })

  it('scrollToLine does not throw', () => {
    const ref = { current: null as CodeMirrorPaneRef | null }
    render(<CodeMirrorPane ref={ref} value="hello" filename="a.ts" />)
    expect(() => ref.current!.scrollToLine(5)).not.toThrow()
  })

  it('setValue does not throw', () => {
    const ref = { current: null as CodeMirrorPaneRef | null }
    render(<CodeMirrorPane ref={ref} value="old" filename="a.ts" />)
    expect(() => ref.current!.setValue('new')).not.toThrow()
  })

  it('renders cm-editor element inside container', () => {
    const { container } = render(<CodeMirrorPane value="hello" filename="test.ts" />)
    const editor = container.querySelector('.cm-editor')
    expect(editor).toBeTruthy()
  })
})

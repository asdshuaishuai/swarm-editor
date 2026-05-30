/**
 * CodeMirror 6 React wrapper with forwardRef.
 * Exposes the EditorView and an imperative API for parent components.
 */
import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { EditorState, StateEffect } from '@codemirror/state'
import { EditorView, keymap, highlightWhitespace, highlightTrailingWhitespace } from '@codemirror/view'
import { createEditorExtensions, languageCompartment, getLanguageExtension, tabSizeCompartment, themeCompartment, wrapCompartment, gutterCompartment, whitespaceCompartment } from '../utils/codemirrorSetup'
import type { EditorSettingsInput } from '../utils/codemirrorSetup'
import { lspDidOpen, lspDidChange, lspDidClose } from '../utils/codemirrorLSP'

export interface CodeMirrorPaneRef {
  view: EditorView | null
  getValue: () => string
  setValue: (value: string) => void
  focus: () => void
  getCursor: () => { line: number; col: number }
  setCursor: (line: number, col: number) => void
  scrollToLine: (line: number) => void
}

interface CodeMirrorPaneProps {
  value: string
  filename: string
  onChange?: (value: string) => void
  onSave?: () => void
  readOnly?: boolean
  className?: string
  settings?: EditorSettingsInput
}

export const CodeMirrorPane = forwardRef<CodeMirrorPaneRef, CodeMirrorPaneProps>(
  function CodeMirrorPane({ value, filename, onChange, onSave, readOnly, className, settings }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)
    const onChangeRef = useRef(onChange)
    const onSaveRef = useRef(onSave)
    const isExternalUpdate = useRef(false)

    // Keep callbacks current without re-creating the editor
    onChangeRef.current = onChange
    onSaveRef.current = onSave

    // Expose imperative API
    useImperativeHandle(ref, () => ({
      get view() { return viewRef.current },
      getValue: () => viewRef.current?.state.doc.toString() || '',
      setValue: (v: string) => {
        const view = viewRef.current
        if (!view) return
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: v },
        })
      },
      focus: () => viewRef.current?.focus(),
      getCursor: () => {
        const pos = viewRef.current?.state.selection.main.head || 0
        const line = viewRef.current?.state.doc.lineAt(pos)
        return { line: line?.number || 1, col: pos - (line?.from || 0) + 1 }
      },
      setCursor: (line: number, col: number) => {
        const view = viewRef.current
        if (!view) return
        const l = view.state.doc.line(Math.min(line, view.state.doc.lines))
        view.dispatch({ selection: { anchor: l.from + col - 1 } })
      },
      scrollToLine: (line: number) => {
        const view = viewRef.current
        if (!view) return
        const l = view.state.doc.line(Math.min(line, view.state.doc.lines))
        view.dispatch({ scrollIntoView: true, selection: { anchor: l.from } })
      },
    }), [])

    // Create editor on mount
    useEffect(() => {
      if (!containerRef.current) return

      const extensions = createEditorExtensions(filename, {
        onChange: onChangeRef.current
          ? (v: string) => {
              if (!isExternalUpdate.current) {
                onChangeRef.current?.(v)
              }
            }
          : undefined,
        readOnly,
        settings,
      })

      // Add Ctrl+S save keybinding via keymap
      if (onSave) {
        extensions.push(keymap.of([{
          key: 'Mod-s',
          run: () => { onSaveRef.current?.(); return true },
        }]))
      }

      // Fallback save handler via DOM events (catches Cmd+S on macOS)
      extensions.push(EditorView.domEventHandlers({
        keydown: (event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 's') {
            event.preventDefault()
            onSaveRef.current?.()
            return true
          }
          return false
        },
      }))

      const state = EditorState.create({
        doc: value,
        extensions,
      })

      const view = new EditorView({
        state,
        parent: containerRef.current,
      })

      viewRef.current = view

      // Notify LSP server that document is open
      const lang = filename.split('.').pop()?.toLowerCase() || 'text'
      lspDidOpen(filename, lang, value)

      return () => {
        lspDidClose(filename)
        view.destroy()
        viewRef.current = null
      }
      // Only create once on mount
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Update document content when value changes externally (e.g. file switch)
    useEffect(() => {
      const view = viewRef.current
      if (!view) return

      const currentDoc = view.state.doc.toString()
      if (currentDoc === value) return

      isExternalUpdate.current = true
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      })
      isExternalUpdate.current = false
      lspDidChange(filename, value)
    }, [value])

    // Reconfigure language extensions when filename changes
    useEffect(() => {
      const view = viewRef.current
      if (!view) return

      // Use compartment to dynamically swap language
      if (languageCompartment.get(view.state) !== undefined) {
        view.dispatch({
          effects: languageCompartment.reconfigure(getLanguageExtension(filename)),
        })
      }
    }, [filename])

    // Reconfigure editor settings via Compartments when settings change
    useEffect(() => {
      const view = viewRef.current
      if (!view || !settings) return

      const effects: StateEffect<unknown>[] = []

      // Font size / family
      if (themeCompartment.get(view.state) !== undefined) {
        effects.push(themeCompartment.reconfigure(
          EditorView.theme({
            '&': {
              fontSize: `${settings.fontSize ?? 14}px`,
            },
            '.cm-content': {
              fontFamily: `'${settings.fontFamily ?? 'JetBrains Mono'}', 'Fira Code', Menlo, monospace`,
            },
          }),
        ))
      }

      // Tab size
      if (tabSizeCompartment.get(view.state) !== undefined) {
        effects.push(tabSizeCompartment.reconfigure(
          EditorState.tabSize.of(settings.tabSize ?? 2),
        ))
      }

      // Word wrap
      if (wrapCompartment.get(view.state) !== undefined) {
        effects.push(wrapCompartment.reconfigure(
          settings.wordWrap ? [EditorView.lineWrapping] : [],
        ))
      }

      // Line numbers
      if (gutterCompartment.get(view.state) !== undefined) {
        const mode = settings.lineNumbers ?? 'on'
        effects.push(gutterCompartment.reconfigure(
          mode === 'off'
            ? [EditorView.theme({ '.cm-gutters': { display: 'none' } })]
            : mode === 'relative'
              ? [EditorView.theme({ '.cm-gutter-lint': { display: 'none' } })]
              : [],
        ))
      }

      // Whitespace rendering
      if (whitespaceCompartment.get(view.state) !== undefined) {
        const wsMode = settings.renderWhitespace ?? 'none'
        effects.push(whitespaceCompartment.reconfigure(
          wsMode === 'all' ? [highlightWhitespace()]
            : wsMode === 'trailing' ? [highlightTrailingWhitespace()]
            : [],
        ))
      }

      if (effects.length > 0) {
        view.dispatch({ effects })
      }
    }, [
      settings?.fontSize,
      settings?.fontFamily,
      settings?.tabSize,
      settings?.wordWrap,
      settings?.lineNumbers,
      settings?.smoothScrolling,
      settings?.cursorSmoothCaretAnimation,
      settings?.scrollBeyondLastLine,
      settings?.renderWhitespace,
      settings?.cursorBlinking,
    ])

    return (
      <div
        ref={containerRef}
        className={className ?? 'h-full w-full overflow-hidden'}
        style={{ backgroundColor: '#0d1117' }}
      />
    )
  }
)

CodeMirrorPane.displayName = 'CodeMirrorPane'
export default CodeMirrorPane

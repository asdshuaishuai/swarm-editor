/**
 * CodeMirror 6 editor setup for Swarm Editor.
 *
 * Provides:
 * - basicSetup (line numbers, history, bracket matching, fold gutter, etc.)
 * - Swarm dark theme
 * - Language detection from filename -> CM6 language package
 * - Editor configuration (tab size, line wrapping, etc.)
 */
import { basicSetup } from '@codemirror/basic-setup'
import { EditorView, keymap, highlightWhitespace, highlightTrailingWhitespace } from '@codemirror/view'
import { EditorState, Extension, Compartment } from '@codemirror/state'
import { indentWithTab, historyKeymap } from '@codemirror/commands'
import { closeBracketsKeymap } from '@codemirror/autocomplete'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { lintKeymap, lintGutter } from '@codemirror/lint'
import { indentUnit } from '@codemirror/language'

import { swarmDarkTheme } from './codemirrorTheme'

// ---------------------------------------------------------------------------
// Language packages
// ---------------------------------------------------------------------------
import { javascript } from '@codemirror/lang-javascript'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { json } from '@codemirror/lang-json'
import { python } from '@codemirror/lang-python'
import { rust } from '@codemirror/lang-rust'
import { go } from '@codemirror/lang-go'
import { markdown } from '@codemirror/lang-markdown'
import { xml } from '@codemirror/lang-xml'
import { java } from '@codemirror/lang-java'
import { cpp } from '@codemirror/lang-cpp'
import { php } from '@codemirror/lang-php'

// ---------------------------------------------------------------------------
// Language detection: filename -> CM6 Extension[]
// ---------------------------------------------------------------------------

/**
 * Map a filename to the appropriate CodeMirror 6 language extensions.
 * Returns an empty array for unknown file types (plain text).
 */
export function getLanguageExtension(filename: string): Extension[] {
  const ext = filename.split('.').pop()?.toLowerCase() || ''

  switch (ext) {
    // JavaScript / TypeScript
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return [javascript({ jsx: true, typescript: false })]

    case 'ts':
    case 'tsx':
      return [javascript({ jsx: true, typescript: true })]

    // CSS
    case 'css':
    case 'scss':
    case 'less':
      return [css()]

    // HTML
    case 'html':
    case 'htm':
    case 'svg':
      return [html()]

    // JSON
    case 'json':
    case 'jsonc':
      return [json()]

    // Python
    case 'py':
    case 'pyw':
      return [python()]

    // Rust
    case 'rs':
      return [rust()]

    // Go
    case 'go':
      return [go()]

    // Markdown
    case 'md':
    case 'markdown':
      return [markdown()]

    // XML / config
    case 'xml':
    case 'yaml':
    case 'yml':
    case 'toml':
    case 'plist':
      return [xml()]

    // Java
    case 'java':
      return [java()]

    // C / C++
    case 'c':
    case 'h':
      return [cpp()]
    case 'cpp':
    case 'hpp':
    case 'cc':
    case 'cxx':
    case 'hxx':
      return [cpp()]

    // PHP
    case 'php':
    case 'phtml':
      return [php()]

    default:
      return []
  }
}

// ---------------------------------------------------------------------------
// Compartments for dynamic reconfiguration
// ---------------------------------------------------------------------------

/**
 * Compartment for language -- allows changing language without recreating state.
 */
export const languageCompartment = new Compartment()

/**
 * Compartment for read-only mode.
 */
export const readOnlyCompartment = new Compartment()

/**
 * Compartment for tab size.
 */
export const tabSizeCompartment = new Compartment()

/**
 * Compartment for theme overrides (font size, font family).
 */
export const themeCompartment = new Compartment()

/**
 * Compartment for line wrapping toggle.
 */
export const wrapCompartment = new Compartment()

/**
 * Compartment for gutter config (line numbers on/off/relative).
 */
export const gutterCompartment = new Compartment()

/**
 * Compartment for whitespace rendering.
 */
export const whitespaceCompartment = new Compartment()

/**
 * Compartment for cursor blinking style.
 */
export const cursorBlinkCompartment = new Compartment()

// ---------------------------------------------------------------------------
// Complete extension factory
// ---------------------------------------------------------------------------

/**
 * Create the full set of CodeMirror 6 extensions for a given file.
 *
 * @param filename  - Used to detect language and configure tab size
 * @param options   - Optional overrides
 */
export interface EditorSettingsInput {
  fontSize?: number
  fontFamily?: string
  tabSize?: number
  wordWrap?: boolean
  lineNumbers?: 'on' | 'off' | 'relative'
  smoothScrolling?: boolean
  cursorSmoothCaretAnimation?: boolean
  scrollBeyondLastLine?: boolean
  renderWhitespace?: 'none' | 'boundary' | 'selection' | 'trailing' | 'all'
  cursorBlinking?: 'blink' | 'smooth' | 'phase' | 'expand' | 'solid'
}

export function createEditorExtensions(
  filename: string,
  options: {
    onChange?: (value: string) => void
    onSave?: () => void
    readOnly?: boolean
    tabSize?: number
    settings?: EditorSettingsInput
  } = {}
): Extension[] {
  const {
    onChange,
    onSave,
    readOnly = false,
    tabSize = detectTabSize(filename),
    settings,
  } = options

  const fontSize = settings?.fontSize ?? 14
  const fontFamily = settings?.fontFamily ?? 'JetBrains Mono'
  const wordWrap = settings?.wordWrap ?? false
  const smoothScroll = settings?.smoothScrolling ?? true
  const cursorSmoothAnim = settings?.cursorSmoothCaretAnimation ?? false
  const scrollBeyond = settings?.scrollBeyondLastLine ?? true

  const extensions: Extension[] = []

  // 1. basicSetup -- line numbers, history, fold gutter, highlight special chars,
  //    draw selection, drop cursor, multiple selections, indent on input,
  //    default highlight style, bracket matching, close brackets, autocompletion,
  //    rectangular selection, crosshair cursor, active line, active line gutter,
  //    selection match highlighting, search keymap
  extensions.push(basicSetup)

  // 2. Theme
  extensions.push(swarmDarkTheme)

  // 2b. Dynamic theme compartment (font size / family override)
  extensions.push(themeCompartment.of(
    EditorView.theme({
      '&': {
        fontSize: `${fontSize}px`,
      },
      '.cm-content': {
        fontFamily: `'${fontFamily}', 'Fira Code', Menlo, monospace`,
      },
    }),
  ))

  // 3. Language (in compartment for dynamic switching)
  const langExts = getLanguageExtension(filename)
  extensions.push(languageCompartment.of(langExts))

  // 4. Editor config
  extensions.push(EditorState.tabSize.of(tabSize))
  extensions.push(tabSizeCompartment.of(EditorState.tabSize.of(tabSize)))
  extensions.push(indentUnit.of(' '.repeat(tabSize)))

  // 4b. Line wrapping compartment
  extensions.push(wrapCompartment.of(
    wordWrap ? [EditorView.lineWrapping] : []
  ))

  // 4c. Scroll behavior
  extensions.push(
    EditorView.theme({
      '&': { height: '100%' },
      '.cm-scroller': {
        overflow: 'auto',
        ...(smoothScroll ? { scrollBehavior: 'smooth' } : {}),
      },
      ...(scrollBeyond ? { '.cm-content': { paddingBottom: '80vh' } } : {}),
    }),
  )

  // 4d. Smooth cursor animation
  if (cursorSmoothAnim) {
    extensions.push(
      EditorView.theme({
        '.cm-cursor': {
          transition: 'left 80ms linear, top 80ms linear',
        },
      }),
    )
  }

  // 5. Read-only
  extensions.push(readOnlyCompartment.of(
    readOnly ? [EditorState.readOnly.of(true)] : []
  ))

  // 5b. Gutter config (line numbers visibility)
  const lineNumbersMode = settings?.lineNumbers ?? 'on'
  extensions.push(gutterCompartment.of(
    lineNumbersMode === 'off'
      ? [EditorView.theme({ '.cm-gutters': { display: 'none' } })]
      : lineNumbersMode === 'relative'
        ? [EditorView.theme({ '.cm-gutter-lint': { display: 'none' } })]
        : []
  ))

  // 5c. Whitespace rendering
  const wsMode = settings?.renderWhitespace ?? 'none'
  extensions.push(whitespaceCompartment.of(
    wsMode === 'all' ? [highlightWhitespace()]
      : wsMode === 'trailing' ? [highlightTrailingWhitespace()]
      : []
  ))

  // 5d. Cursor blinking style
  const cursorBlink = settings?.cursorBlinking ?? 'blink'
  const cursorStyle = buildCursorBlinkStyle(cursorBlink)
  extensions.push(cursorBlinkCompartment.of(
    cursorStyle ? [cursorStyle] : []
  ))

  // 6. Keymaps (order matters -- earlier entries take priority)
  const extraKeys: { key: string; run: (view: EditorView) => boolean }[] = []
  if (onSave) {
    extraKeys.push({
      key: 'Mod-s',
      run: () => { onSave(); return true },
    })
  }
  if (extraKeys.length > 0) {
    extensions.push(keymap.of(extraKeys))
  }

  // Standard keymaps
  extensions.push(keymap.of([
    indentWithTab,
    ...closeBracketsKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...lintKeymap,
  ]))

  // 7. Change listener
  if (onChange) {
    extensions.push(
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChange(update.state.doc.toString())
        }
      }),
    )
  }

  // 8. Selection match highlighting
  extensions.push(highlightSelectionMatches())

  // 9. Lint gutter (for diagnostic markers)
  extensions.push(lintGutter())

  return extensions
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Detect a reasonable tab size based on filename.
 * Go uses tabs (size 4), most others use 2 spaces.
 */
function detectTabSize(filename: string): number {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  // Go and Python commonly use 4-space (or tab) indentation
  if (ext === 'go' || ext === 'py' || ext === 'pyw') return 4
  // Most web languages use 2-space
  return 2
}

/**
 * Build a CM6 theme extension for cursor blinking style.
 */
function buildCursorBlinkStyle(mode: string): Extension | null {
  switch (mode) {
    case 'solid':
      return EditorView.theme({
        '.cm-cursor': { animation: 'none', opacity: '1' },
      })
    case 'smooth':
      return EditorView.theme({
        '.cm-cursor': { animation: 'cm-blink 1.2s ease-in-out infinite' },
      })
    case 'phase':
      return EditorView.theme({
        '.cm-cursor': { animation: 'cm-blink 1s steps(1) infinite', transition: 'opacity 0.3s' },
      })
    case 'expand':
      return EditorView.theme({
        '.cm-cursor': {
          animation: 'none',
          opacity: '1',
          borderLeftWidth: '2px',
          transition: 'border-left-width 0.1s',
        },
      })
    default: // 'blink' is CM6 default
      return null
  }
}

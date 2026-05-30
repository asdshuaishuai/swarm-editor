/**
 * CodeMirror 6 LSP integration — completion, hover, diagnostics.
 *
 * Bridges lspApi (WebSocket JSON-RPC) to CodeMirror 6 extensions.
 */
import { Extension } from '@codemirror/state'
import { autocompletion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { hoverTooltip, Tooltip, EditorView } from '@codemirror/view'
import { linter, Diagnostic } from '@codemirror/lint'
import { lspApi, type CompletionItem, type HoverResult, type Diagnostic as LSPDiagnostic } from '../services/lspApi'

// ---------------------------------------------------------------------------
// Position conversion helpers
// ---------------------------------------------------------------------------

/** CM6 pos (char offset) → LSP 1-indexed line/character */
function posToLSP(doc: { lineAt(pos: number): { number: number; from: number } }, pos: number) {
  const line = doc.lineAt(pos)
  return { line: line.number, character: pos - line.from + 1 }
}

// ---------------------------------------------------------------------------
// LSP CompletionItem.kind → CM6 completion type
// ---------------------------------------------------------------------------
const KIND_MAP: Record<number, string> = {
  1: 'class',      // Text
  2: 'property',   // Method
  3: 'function',   // Function
  4: 'function',   // Constructor
  5: 'property',   // Field
  6: 'variable',   // Variable
  7: 'class',      // Class
  8: 'interface',  // Interface
  9: 'namespace',  // Module
  10: 'property',  // Property
  11: 'variable',  // Unit
  12: 'variable',  // Value
  13: 'enum',      // Enum
  14: 'keyword',   // Keyword
  15: 'text',      // Snippet
  16: 'palette',   // Color
  17: 'text',      // File
  18: 'text',      // Reference
  19: 'folder',    // Folder
  20: 'enum',      // EnumMember
  21: 'type',      // Constant
  22: 'type',      // Struct
  23: 'type',      // Event
  24: 'keyword',   // Operator
  25: 'type',      // TypeParameter
}

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

function createLSPCompletionSource(filename: string) {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    // Require at least 1 character typed or explicit trigger
    if (!context.explicit && !context.matchBefore(/[\w.]/)) return null

    const pos = posToLSP(context.state.doc, context.pos)
    let result: { items: CompletionItem[] }
    try {
      result = await lspApi.completion(filename, pos.line, pos.character)
    } catch {
      return null
    }

    if (!result?.items?.length) return null

    // Find word boundary for replacement
    const word = context.matchBefore(/[\w.]*/)
    const from = word ? word.from : context.pos

    return {
      from,
      options: result.items.map((item) => ({
        label: item.label,
        type: KIND_MAP[item.kind ?? 0] || 'text',
        detail: item.detail,
        apply: item.insertText || item.label,
      })),
    }
  }
}

// ---------------------------------------------------------------------------
// Hover
// ---------------------------------------------------------------------------

function formatHoverContents(contents: HoverResult['contents']): string {
  if (typeof contents === 'string') return contents
  if ('kind' in contents && 'value' in contents) return contents.value
  if (Array.isArray(contents)) {
    return contents.map((c) => (typeof c === 'string' ? c : c.value)).join('\n\n')
  }
  return ''
}

function createLSPHover(filename: string): Extension {
  return hoverTooltip(async (view: EditorView, pos: number): Promise<Tooltip | null> => {
    const lspPos = posToLSP(view.state.doc, pos)
    let result: HoverResult
    try {
      result = await lspApi.hover(filename, lspPos.line, lspPos.character)
    } catch {
      return null
    }

    const text = formatHoverContents(result.contents)
    if (!text) return null

    // Determine range from LSP result
    let from = pos, end = pos
    if (result.range) {
      const startLine = view.state.doc.line(result.range.start.line)
      const endLine = view.state.doc.line(result.range.end.line)
      from = startLine.from + result.range.start.character - 1
      end = endLine.from + result.range.end.character - 1
    }

    return {
      pos: from,
      end,
      above: true,
      create() {
        const dom = document.createElement('div')
        dom.className = 'cm-lsp-hover'
        dom.style.cssText = 'padding:6px 10px;max-width:400px;font-size:12px;white-space:pre-wrap;color:#d1d5db;background:#1e293b;border:1px solid #334155;border-radius:4px;'
        dom.textContent = text
        return { dom }
      },
    }
  })
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

function mapSeverity(severity?: number): 'error' | 'warning' | 'info' | 'hint' {
  if (severity === 1) return 'error'
  if (severity === 2) return 'warning'
  if (severity === 3) return 'info'
  if (severity === 4) return 'hint'
  return 'info'
}

function createLSPDiagnostics(filename: string): Extension {
  return linter(async (view): Promise<Diagnostic[]> => {
    let result: { diagnostics: Record<string, LSPDiagnostic[]> }
    try {
      result = await lspApi.diagnostics(`file://${filename}`)
    } catch {
      return []
    }

    const fileDiags = result.diagnostics[`file://${filename}`] || result.diagnostics[filename] || []
    return fileDiags.map((d) => {
      const startLine = view.state.doc.line(Math.max(1, d.range.start.line))
      const endLine = view.state.doc.line(Math.min(view.state.doc.lines, d.range.end.line || d.range.start.line))
      return {
        from: startLine.from + Math.max(0, d.range.start.character - 1),
        to: endLine.from + Math.max(0, (d.range.end.character || d.range.start.character) - 1),
        severity: mapSeverity(d.severity),
        message: d.message,
        source: d.source,
      }
    })
  })
}

// ---------------------------------------------------------------------------
// Document sync — call from CodeMirrorPane lifecycle
// ---------------------------------------------------------------------------

let lspOpenFile = ''

export async function lspDidOpen(filename: string, language: string, content: string) {
  lspOpenFile = filename
  try {
    await lspApi.didOpen(`file://${filename}`, filename, language, content)
  } catch {
    // LSP server may not be running — non-fatal
  }
}

export async function lspDidChange(filename: string, content: string) {
  try {
    await lspApi.didChange(filename, content)
  } catch {
    // non-fatal
  }
}

export async function lspDidClose(filename: string) {
  try {
    await lspApi.didClose(filename)
  } catch {
    // non-fatal
  }
  if (lspOpenFile === filename) lspOpenFile = ''
}

// ---------------------------------------------------------------------------
// Public: create all LSP extensions for a file
// ---------------------------------------------------------------------------

export function createLSPExtensions(filename: string): Extension[] {
  if (!filename) return []

  return [
    autocompletion({ override: [createLSPCompletionSource(filename)], activateOnTyping: true }),
    createLSPHover(filename),
    createLSPDiagnostics(filename),
  ]
}

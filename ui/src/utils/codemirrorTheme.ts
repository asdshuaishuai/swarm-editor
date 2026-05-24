/**
 * Swarm Editor dark theme for CodeMirror 6.
 *
 * Design palette:
 *   editor.bg    = #0d1117
 *   sidebar      = #161b22
 *   card         = #21262d
 *   border       = #30363d
 *   accent       = #58a6ff
 */
import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { Extension } from '@codemirror/state'
import { tags } from '@lezer/highlight'

// ---------------------------------------------------------------------------
// Color tokens
// ---------------------------------------------------------------------------
const colors = {
  background:       '#0d1117',
  gutter:           '#161b22',
  selection:        '#264f78',
  cursor:           '#aeafad',
  lineHighlight:    '#161b22',
  foreground:       '#d1d5db',
  comment:          '#6a9955',
  keyword:          '#569cd6',
  string:           '#ce9178',
  number:           '#b5cea8',
  type:             '#4ec9b0',
  function:         '#dcdcaa',
  variable:         '#9cdcfe',
  operator:         '#d4d4d4',
  error:            '#f44747',
  accent:           '#58a6ff',
  border:           '#30363d',
  inactiveCursor:   '#5a5a5a',
  matchingBracket:  '#58a6ff',
  nonmatchingBracket: '#f44747',
  whitespace:       '#3b3b3b',
} as const

// ---------------------------------------------------------------------------
// Editor chrome theme (gutter, cursor, selection, active line, etc.)
// ---------------------------------------------------------------------------
export const swarmTheme = EditorView.theme({
  '&': {
    backgroundColor: colors.background,
    color: colors.foreground,
    fontSize: '14px',
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  },
  '&.cm-focused': {
    outline: 'none',
  },

  // Content area
  '.cm-content': {
    caretColor: colors.cursor,
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    padding: '16px 0',
  },
  '.cm-cursor': {
    borderLeftColor: colors.cursor,
    borderLeftWidth: '2px',
  },
  '&.cm-focused .cm-cursor': {
    borderLeftColor: colors.cursor,
  },
  '&:not(.cm-focused) .cm-cursor': {
    borderLeftColor: colors.inactiveCursor,
  },

  // Selection
  '.cm-selectionBackground': {
    backgroundColor: colors.selection,
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: colors.selection,
  },

  // Active line
  '.cm-activeLine': {
    backgroundColor: colors.lineHighlight,
  },
  '.cm-activeLineGutter': {
    backgroundColor: colors.lineHighlight,
  },

  // Gutter
  '.cm-gutters': {
    backgroundColor: colors.gutter,
    color: '#8b949e',
    border: 'none',
    borderRight: `1px solid ${colors.border}`,
    paddingLeft: '8px',
    paddingRight: '8px',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    minWidth: '3em',
    textAlign: 'right',
  },
  '.cm-foldGutter .cm-gutterElement': {
    cursor: 'pointer',
    color: '#8b949e',
  },
  '.cm-foldGutter .cm-gutterElement:hover': {
    color: colors.accent,
  },

  // Scroller
  '.cm-scroller': {
    overflow: 'auto',
    lineHeight: '1.5',
  },

  // Scrollbar styling
  '.cm-scroller::-webkit-scrollbar': {
    width: '10px',
    height: '10px',
  },
  '.cm-scroller::-webkit-scrollbar-track': {
    background: colors.background,
  },
  '.cm-scroller::-webkit-scrollbar-thumb': {
    backgroundColor: '#30363d',
    borderRadius: '5px',
  },
  '.cm-scroller::-webkit-scrollbar-thumb:hover': {
    backgroundColor: '#484f58',
  },

  // Matching brackets
  '.cm-matchingBracket': {
    backgroundColor: 'rgba(88, 166, 255, 0.25)',
    outline: `1px solid ${colors.matchingBracket}`,
    color: colors.accent + ' !important',
  },
  '.cm-nonmatchingBracket': {
    backgroundColor: 'rgba(244, 71, 71, 0.25)',
    outline: `1px solid ${colors.nonmatchingBracket}`,
    color: colors.error + ' !important',
  },

  // Search
  '.cm-searchMatch': {
    backgroundColor: 'rgba(234, 179, 8, 0.3)',
    outline: '1px solid rgba(234, 179, 8, 0.6)',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'rgba(234, 179, 8, 0.5)',
  },

  // Selection match (highlight same words on select)
  '.cm-selectionMatch': {
    backgroundColor: 'rgba(88, 166, 255, 0.15)',
  },

  // Cursor line when crosshair selection
  '.cm-crosshairCursor': {
    borderLeftColor: colors.accent,
  },

  // Tooltip / autocomplete
  '.cm-tooltip': {
    backgroundColor: colors.gutter,
    border: `1px solid ${colors.border}`,
    borderRadius: '6px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete': {
    backgroundColor: colors.gutter,
    border: `1px solid ${colors.border}`,
    borderRadius: '6px',
  },
  '.cm-tooltip ul li[aria-selected]': {
    backgroundColor: colors.selection,
  },
  '.cm-tooltip .cm-completionLabel': {
    color: colors.foreground,
  },
  '.cm-tooltip .cm-completionDetail': {
    color: '#8b949e',
    fontStyle: 'italic',
  },

  // Panels (e.g. search panel)
  '.cm-panels': {
    backgroundColor: colors.gutter,
    borderBottom: `1px solid ${colors.border}`,
    color: colors.foreground,
  },
  '.cm-panels input': {
    backgroundColor: colors.background,
    border: `1px solid ${colors.border}`,
    color: colors.foreground,
    borderRadius: '4px',
    padding: '2px 6px',
  },
  '.cm-panels button': {
    backgroundColor: colors.background,
    border: `1px solid ${colors.border}`,
    color: colors.foreground,
    borderRadius: '4px',
    padding: '2px 8px',
    cursor: 'pointer',
  },
  '.cm-panels button:hover': {
    backgroundColor: '#21262d',
  },

  // Whitespace rendering
  '.cm-highlightWhitespace': {
    position: 'relative',
  },
  '.cm-highlightWhitespace::before': {
    content: "'\\00B7'",
    color: colors.whitespace,
    position: 'absolute',
  },

  // Indentation guides
  '.cm-indent-guide': {
    borderLeftColor: 'rgba(255, 255, 255, 0.06)',
  },
  '.cm-activeIndent-guide': {
    borderLeftColor: 'rgba(255, 255, 255, 0.12)',
  },
}, { dark: true })

// ---------------------------------------------------------------------------
// Syntax highlighting style
// ---------------------------------------------------------------------------
const swarmHighlightStyle = HighlightStyle.define([
  // Comments
  { tag: tags.comment,                     color: colors.comment,    fontStyle: 'italic' },
  { tag: tags.lineComment,                 color: colors.comment,    fontStyle: 'italic' },
  { tag: tags.blockComment,                color: colors.comment,    fontStyle: 'italic' },
  { tag: tags.docComment,                  color: colors.comment,    fontStyle: 'italic' },

  // Names
  { tag: tags.name,                        color: colors.foreground },
  { tag: tags.variableName,                color: colors.variable },
  { tag: tags.typeName,                    color: colors.type },
  { tag: tags.tagName,                     color: '#569cd6' },
  { tag: tags.propertyName,                color: '#9cdcfe' },
  { tag: tags.attributeName,               color: '#9cdcfe' },
  { tag: tags.className,                   color: colors.type },
  { tag: tags.labelName,                   color: colors.function },
  { tag: tags.namespace,                   color: colors.type },
  { tag: tags.macroName,                   color: colors.function },

  // Literals
  { tag: tags.literal,                     color: colors.foreground },
  { tag: tags.string,                      color: colors.string },
  { tag: tags.docString,                   color: colors.string },
  { tag: tags.character,                   color: colors.string },
  { tag: tags.attributeValue,              color: colors.string },
  { tag: tags.number,                      color: colors.number },
  { tag: tags.integer,                     color: colors.number },
  { tag: tags.float,                       color: colors.number },
  { tag: tags.bool,                        color: colors.keyword },
  { tag: tags.regexp,                      color: '#d16969' },
  { tag: tags.escape,                      color: '#d7ba7d' },
  { tag: tags.color,                       color: colors.number },
  { tag: tags.url,                         color: colors.accent },

  // Keywords
  { tag: tags.keyword,                     color: colors.keyword },
  { tag: tags.self,                        color: colors.keyword },
  { tag: tags.null,                        color: colors.keyword },
  { tag: tags.atom,                        color: colors.keyword },
  { tag: tags.unit,                        color: colors.number },
  { tag: tags.modifier,                    color: colors.keyword },
  { tag: tags.operatorKeyword,             color: colors.keyword },
  { tag: tags.controlKeyword,              color: '#c586c0' },
  { tag: tags.definitionKeyword,           color: colors.keyword },
  { tag: tags.moduleKeyword,               color: colors.keyword },

  // Operators
  { tag: tags.operator,                    color: colors.operator },
  { tag: tags.derefOperator,               color: colors.operator },
  { tag: tags.arithmeticOperator,          color: colors.operator },
  { tag: tags.logicOperator,               color: colors.keyword },
  { tag: tags.bitwiseOperator,             color: colors.operator },
  { tag: tags.compareOperator,             color: colors.operator },
  { tag: tags.updateOperator,              color: colors.operator },
  { tag: tags.definitionOperator,          color: colors.keyword },
  { tag: tags.typeOperator,                color: colors.keyword },
  { tag: tags.controlOperator,             color: colors.keyword },

  // Punctuation
  { tag: tags.punctuation,                 color: colors.operator },
  { tag: tags.separator,                   color: '#8b949e' },
  { tag: tags.bracket,                     color: colors.foreground },
  { tag: tags.angleBracket,                color: colors.foreground },
  { tag: tags.squareBracket,               color: '#d4d4d4' },
  { tag: tags.paren,                       color: '#d4d4d4' },
  { tag: tags.brace,                       color: '#d4d4d4' },

  // Special
  { tag: tags.content,                     color: colors.foreground },
  { tag: tags.contentSeparator,            color: '#6e7681' },
  { tag: tags.list,                        color: colors.foreground },
  { tag: tags.quote,                       color: '#6a9955' },
  { tag: tags.emphasis,                    color: colors.foreground, fontStyle: 'italic' },
  { tag: tags.strong,                      color: colors.foreground, fontWeight: 'bold' },
  { tag: tags.link,                        color: colors.accent,     textDecoration: 'underline' },
  { tag: tags.monospace,                   color: colors.string },

  // Errors / invalid
  { tag: tags.invalid,                     color: colors.error },
  { tag: tags.inserted,                    color: '#3fb950' },
  { tag: tags.deleted,                     color: colors.error },
  { tag: tags.changed,                     color: '#e3b341' },

  // Definition modifiers (definition(variableName) etc.)
  { tag: tags.definition(tags.variableName), color: colors.function },
  { tag: tags.definition(tags.propertyName), color: '#9cdcfe' },
])

// ---------------------------------------------------------------------------
// Combined extension — import this as your theme
// ---------------------------------------------------------------------------
export const swarmDarkTheme: Extension = [
  swarmTheme,
  syntaxHighlighting(swarmHighlightStyle),
]

// Re-export for convenience
export { colors as swarmColors }

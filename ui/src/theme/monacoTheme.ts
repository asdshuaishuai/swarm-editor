import type { editor } from 'monaco-editor'

/**
 * Custom Swarm Editor dark theme for Monaco
 * Used by both EditorPanel and DiffEditorPanel for consistent styling
 */
export const swarmDarkTheme: editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'c084fc' },
    { token: 'keyword.control', foreground: 'c084fc' },
    { token: 'keyword.other', foreground: 'c084fc' },
    { token: 'string', foreground: '34d399' },
    { token: 'string.escape', foreground: '6ee7b7' },
    { token: 'number', foreground: 'f472b6' },
    { token: 'constant', foreground: 'f472b6' },
    { token: 'type', foreground: '60a5fa' },
    { token: 'class', foreground: '60a5fa' },
    { token: 'interface', foreground: '60a5fa' },
    { token: 'function', foreground: 'fbbf24' },
    { token: 'function.call', foreground: 'fbbf24' },
    { token: 'variable', foreground: 'e5e7eb' },
    { token: 'variable.parameter', foreground: '93c5fd' },
    { token: 'variable.property', foreground: 'a78bfa' },
    { token: 'operator', foreground: 'f97316' },
    { token: 'delimiter', foreground: '9ca3af' },
    { token: 'delimiter.bracket', foreground: '9ca3af' },
    { token: 'tag', foreground: 'f472b6' },
    { token: 'tag.id', foreground: 'f472b6' },
    { token: 'tag.class', foreground: 'f472b6' },
    { token: 'attribute.name', foreground: '34d399' },
    { token: 'attribute.value', foreground: '34d399' },
  ],
  colors: {
    'editor.background': '#0f1117',
    'editor.foreground': '#e5e7eb',
    'editor.lineHighlightBackground': '#1e2028',
    'editor.selectionBackground': '#3b82f640',
    'editor.inactiveSelectionBackground': '#3b82f620',
    'editorCursor.foreground': '#60a5fa',
    'editorLineNumber.foreground': '#4b5563',
    'editorLineNumber.activeForeground': '#9ca3af',
    'editor.selectionHighlightBackground': '#3b82f615',
    'editorIndentGuide.background': '#374151',
    'editorIndentGuide.activeBackground': '#4b5563',
    'editorWhitespace.foreground': '#374151',
    'editorBracketMatch.background': '#3b82f620',
    'editorBracketMatch.border': '#3b82f6',
  },
}

/**
 * Register the swarm-dark theme with Monaco
 * Call this before creating any editor instance
 */
export function registerSwarmTheme(monaco: typeof import('monaco-editor')) {
  monaco.editor.defineTheme('swarm-dark', swarmDarkTheme)
}

/**
 * Get the appropriate Monaco theme based on app theme
 */
export function getMonacoTheme(appTheme: 'dark' | 'light'): string {
  return appTheme === 'dark' ? 'swarm-dark' : 'light'
}

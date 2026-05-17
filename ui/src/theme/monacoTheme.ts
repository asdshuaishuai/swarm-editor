import type { editor } from 'monaco-editor'

/**
 * Swarm Editor 统一主题 - 与 CSS 变量同步
 */
export const swarmDarkTheme: editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '71717a', fontStyle: 'italic' },
    { token: 'keyword', foreground: '818cf8' },
    { token: 'keyword.control', foreground: '818cf8' },
    { token: 'string', foreground: '22c55e' },
    { token: 'string.escape', foreground: '4ade80' },
    { token: 'number', foreground: 'f472b6' },
    { token: 'constant', foreground: 'f472b6' },
    { token: 'type', foreground: '60a5fa' },
    { token: 'class', foreground: '60a5fa' },
    { token: 'interface', foreground: '60a5fa' },
    { token: 'function', foreground: 'fbbf24' },
    { token: 'function.call', foreground: 'fbbf24' },
    { token: 'variable', foreground: 'ffffff' },
    { token: 'variable.parameter', foreground: '93c5fd' },
    { token: 'variable.property', foreground: 'a78bfa' },
    { token: 'operator', foreground: 'f97316' },
    { token: 'delimiter', foreground: 'a1a1aa' },
    { token: 'tag', foreground: 'f472b6' },
    { token: 'attribute.name', foreground: '22c55e' },
    { token: 'attribute.value', foreground: '22c55e' },
  ],
  colors: {
    'editor.background': '#0f0f10',
    'editor.foreground': '#ffffff',
    'editor.lineHighlightBackground': '#1a1a1c',
    'editor.selectionBackground': '#6366f140',
    'editor.inactiveSelectionBackground': '#6366f120',
    'editorCursor.foreground': '#6366f1',
    'editorLineNumber.foreground': '#52525b',
    'editorLineNumber.activeForeground': '#a1a1aa',
    'editorIndentGuide.background': '#242426',
    'editorIndentGuide.activeBackground': '#3f3f46',
    'editorWhitespace.foreground': '#242426',
    'editorBracketMatch.background': '#6366f120',
    'editorBracketMatch.border': '#6366f1',
    'editor.selectionHighlightBackground': '#6366f115',
  },
}

export function registerSwarmTheme(monaco: typeof import('monaco-editor')) {
  monaco.editor.defineTheme('swarm-dark', swarmDarkTheme)
}

export function getMonacoTheme(appTheme: 'dark' | 'light'): string {
  return appTheme === 'dark' ? 'swarm-dark' : 'light'
}

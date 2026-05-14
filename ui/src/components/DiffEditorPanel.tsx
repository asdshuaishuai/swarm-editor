import { useMemo, useEffect } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import type { DiffOnMount } from '@monaco-editor/react'
import { X } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'
import { useSettings } from '../hooks/useSettings'
import { registerSwarmTheme, getMonacoTheme } from '../theme/monacoTheme'

// Extension → Monaco language ID mapping
const EXT_LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescriptreact',
  js: 'javascript', jsx: 'javascriptreact',
  go: 'go', rs: 'rust', py: 'python',
  json: 'json', yaml: 'yaml', yml: 'yaml',
  md: 'markdown', css: 'css', scss: 'scss',
  html: 'html', xml: 'xml', sql: 'sql',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  toml: 'ini', dockerfile: 'dockerfile',
}

function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  if (EXT_LANG_MAP[ext]) return EXT_LANG_MAP[ext]
  // Check for Dockerfile (no extension)
  const base = filePath.split('/').pop()?.toLowerCase() || ''
  if (base === 'dockerfile') return 'dockerfile'
  return 'plaintext'
}

interface DiffEditorPanelProps {
  original: string
  modified: string
  language?: string
  filePath: string
  onClose: () => void
}

export default function DiffEditorPanel({ original, modified, language, filePath, onClose }: DiffEditorPanelProps) {
  const { effectiveTheme } = useTheme()
  const { settings } = useSettings()
  const monacoTheme = getMonacoTheme(effectiveTheme)

  // Register swarm-dark theme when diff editor mounts
  const handleDiffMount: DiffOnMount = (_editor, monaco) => {
    registerSwarmTheme(monaco)
  }

  const detectedLang = language || getLanguageFromPath(filePath)

  // Escape to close (VS Code pattern — all modal/overlay panels)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const diffStats = useMemo(() => {
    const origLines = original.split('\n')
    const modLines = modified.split('\n')
    const maxLen = Math.max(origLines.length, modLines.length)
    let additions = 0
    let deletions = 0
    for (let i = 0; i < maxLen; i++) {
      const ol = origLines[i] ?? ''
      const ml = modLines[i] ?? ''
      if (ol !== ml) {
        if (ol === '') additions++
        else if (ml === '') deletions++
        else {
          // Changed line — count as one addition + one deletion
          additions++
          deletions++
        }
      }
    }
    return { additions, deletions }
  }, [original, modified])

  const fileName = filePath.split('/').pop() || filePath

  return (
    <div className="flex flex-col h-full" role="region" aria-label={`Diff view: ${fileName}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-mac-panel/80 border-b border-glass-border">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-text-primary">{fileName}</span>
          <div className="flex items-center gap-2 text-xs" aria-label={`${diffStats.additions} additions, ${diffStats.deletions} deletions`}>
            {diffStats.additions > 0 && (
              <span className="text-green-500">+{diffStats.additions}</span>
            )}
            {diffStats.deletions > 0 && (
              <span className="text-red-500">-{diffStats.deletions}</span>
            )}
            {(diffStats.additions === 0 && diffStats.deletions === 0) && (
              <span className="text-text-tertiary">No changes</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary">Diff: HEAD → Working Tree</span>
          <button
            onClick={onClose}
            className="p-1 hover:bg-card-hover rounded transition-colors"
            title="Close diff view"
            aria-label="Close diff view"
          >
            <X size={16} className="text-text-secondary" />
          </button>
        </div>
      </div>

      {/* Diff Editor */}
      <div className="flex-1">
        <DiffEditor
          height="100%"
          language={detectedLang}
          original={original}
          modified={modified}
          theme={monacoTheme}
          onMount={handleDiffMount}
          options={{
            readOnly: true,
            renderSideBySide: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            folding: false,
            lineNumbers: settings.lineNumbers,
            renderOverviewRuler: true,
            fontSize: settings.fontSize,
            fontFamily: `${settings.fontFamily}, Fira Code, monospace`,
            fontLigatures: true,
            smoothScrolling: settings.smoothScrolling,
          }}
        />
      </div>
    </div>
  )
}

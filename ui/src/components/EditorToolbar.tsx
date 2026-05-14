import { useRef, useState, useEffect } from 'react'
import { PanelLeft, Columns2, Wand2, Save, Play, MoreHorizontal, Map as MapIcon, WrapText } from 'lucide-react'

interface EditorToolbarProps {
  showFileTree: boolean
  onToggleFileTree: () => void
  currentFile: string | null
  workspace: string
  language: string
  onLanguageChange: (lang: string) => void
  loading: boolean
  splitDirection: string
  onToggleSplit: () => void
  onFormat: () => void
  onSave: () => void
  onRun: () => void
  settings: { minimap: boolean; wordWrap: boolean }
  updateSetting: (key: string, value: boolean) => void
}

export function EditorToolbar({
  showFileTree,
  onToggleFileTree,
  currentFile,
  workspace,
  language,
  onLanguageChange,
  loading,
  splitDirection,
  onToggleSplit,
  onFormat,
  onSave,
  onRun,
  settings,
  updateSetting,
}: EditorToolbarProps) {
  const [showMoreActions, setShowMoreActions] = useState(false)
  const moreActionsRef = useRef<HTMLDivElement>(null)
  const moreActionsMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showMoreActions) return
    const handleClick = (e: MouseEvent) => {
      if (moreActionsMenuRef.current && !moreActionsMenuRef.current.contains(e.target as Node)) {
        setShowMoreActions(false)
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowMoreActions(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [showMoreActions])

  const disabled = !currentFile || loading

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-panel-bg/50 border-b border-glass-border">
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleFileTree}
          className="p-1.5 hover:bg-card-hover rounded-mac transition-colors duration-200"
          title="Toggle File Tree"
          aria-label="Toggle file tree"
          aria-expanded={showFileTree}
        >
          <PanelLeft size={16} className="text-text-secondary" />
        </button>

        <div className="flex items-center gap-3 ml-2">
          <span className="text-sm text-text-primary font-medium truncate max-w-48">
            {currentFile ? currentFile.split('/').pop() : workspace.split('/').pop()}
          </span>
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
            className="input-mac py-0.5 min-w-0"
          >
            <option value="typescript">TypeScript</option>
            <option value="typescriptreact">TypeScript React</option>
            <option value="javascript">JavaScript</option>
            <option value="javascriptreact">JavaScript React</option>
            <option value="python">Python</option>
            <option value="go">Go</option>
            <option value="rust">Rust</option>
            <option value="java">Java</option>
            <option value="c">C</option>
            <option value="cpp">C++</option>
            <option value="csharp">C#</option>
            <option value="json">JSON</option>
            <option value="yaml">YAML</option>
            <option value="markdown">Markdown</option>
            <option value="html">HTML</option>
            <option value="css">CSS</option>
            <option value="scss">SCSS</option>
            <option value="shell">Shell</option>
            <option value="sql">SQL</option>
            <option value="plaintext">Plain Text</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onToggleSplit}
          disabled={disabled}
          className={`btn-secondary ${splitDirection !== 'none' ? 'bg-accent/20 border-accent' : ''}`}
          title="Split Editor (Ctrl+\\)"
        >
          <Columns2 size={14} />
        </button>

        <button
          onClick={onFormat}
          disabled={disabled}
          className="btn-secondary"
          title="Format Document (Shift+Alt+F)"
        >
          <Wand2 size={14} />
        </button>

        <button
          onClick={onSave}
          disabled={disabled}
          className="btn-secondary"
        >
          <Save size={14} />
          <span>Save</span>
        </button>

        <button
          onClick={onRun}
          disabled={disabled}
          className="btn-primary"
        >
          <Play size={14} />
          <span>Run</span>
        </button>

        <div className="relative" ref={moreActionsRef}>
          <button
            onClick={() => setShowMoreActions(!showMoreActions)}
            className="p-1.5 hover:bg-card-hover rounded transition-colors"
            title="More Actions"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={showMoreActions}
          >
            <MoreHorizontal size={16} className="text-text-secondary" />
          </button>
          {showMoreActions && (
            <div ref={moreActionsMenuRef} role="menu" id="more-actions-menu" className="absolute right-0 top-full mt-1 w-48 bg-card border border-glass-border rounded-mac shadow-lg z-50 py-1">
              <button
                onClick={() => { updateSetting('minimap', !settings.minimap); setShowMoreActions(false) }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-card-hover transition-colors"
                role="menuitem"
              >
                <MapIcon size={14} />
                <span>Minimap</span>
                <span className="ml-auto text-text-tertiary">{settings.minimap ? 'On' : 'Off'}</span>
              </button>
              <button
                onClick={() => { updateSetting('wordWrap', !settings.wordWrap); setShowMoreActions(false) }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-card-hover transition-colors"
                role="menuitem"
              >
                <WrapText size={14} />
                <span>Word Wrap</span>
                <span className="ml-auto text-text-tertiary">{settings.wordWrap ? 'On' : 'Off'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

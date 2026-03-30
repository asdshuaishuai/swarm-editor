import { useState, useEffect, useCallback, useRef } from 'react'
import Editor, { OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { useAppStore } from '../store/appStore'
import { PanelLeft, Play, Save, ChevronRight, ChevronDown, Folder, FileText, X, Zap } from 'lucide-react'
import { api, FileEntry } from '../services'
import TerminalPanel, { TerminalEntry } from './TerminalPanel'
import { logger } from '../utils'

// 现代化深色主题 - 摆脱 VSCode 风格
const swarmDarkTheme: editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'c084fc' },
    { token: 'string', foreground: '34d399' },
    { token: 'number', foreground: 'f472b6' },
    { token: 'type', foreground: '60a5fa' },
    { token: 'function', foreground: 'fbbf24' },
    { token: 'variable', foreground: 'e5e7eb' },
    { token: 'constant', foreground: 'f472b6' },
    { token: 'delimiter', foreground: '9ca3af' },
    { token: 'delimiter.bracket', foreground: 'd1d5db' },
  ],
  colors: {
    'editor.background': '#0f1117',
    'editor.foreground': '#e5e7eb',
    'editor.lineHighlightBackground': '#1f293740',
    'editor.selectionBackground': '#3b82f640',
    'editor.inactiveSelectionBackground': '#3b82f620',
    'editorLineNumber.foreground': '#4b5563',
    'editorLineNumber.activeForeground': '#9ca3af',
    'editorCursor.foreground': '#60a5fa',
    'editor.selectionHighlightBackground': '#3b82f620',
    'editorIndentGuide.background': '#374151',
    'editorIndentGuide.activeBackground': '#4b5563',
    'editorBracketMatch.background': '#3b82f640',
    'editorBracketMatch.border': '#3b82f6',
    'minimap.background': '#0f1117',
    'scrollbarSlider.background': '#37415180',
    'scrollbarSlider.hoverBackground': '#4b556380',
    'scrollbarSlider.activeBackground': '#3b82f680',
  }
}

export default function EditorPanel() {
  const swarms = useAppStore(state => state.swarms)
  const addToast = useAppStore(state => state.addToast)
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('typescript')
  const [showFileTree, setShowFileTree] = useState(true)
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [fileTree, setFileTree] = useState<FileEntry[]>([])
  const [workspace, setWorkspace] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>([])
  const [showAgentSelector, setShowAgentSelector] = useState(false)
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const mountedRef = useRef(true)

  const addTerminalEntry = useCallback((
    type: TerminalEntry['type'],
    message: string,
    details?: string
  ) => {
    const entry: TerminalEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      message,
      timestamp: new Date(),
      details,
    }
    setTerminalEntries(prev => [...prev, entry])
  }, [])

  const clearTerminal = useCallback(() => {
    setTerminalEntries([])
  }, [])

  // Monaco Editor 初始化 - 注册自定义主题
  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monaco.editor.defineTheme('swarm-dark', swarmDarkTheme)
    monaco.editor.setTheme('swarm-dark')
  }

  // Track mounted state to prevent setState on unmounted component
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const loadWorkspace = async () => {
      try {
        setLoading(true)
        const ws = await api.fs.getWorkspace()
        if (!mountedRef.current) return
        setWorkspace(ws)
        const entries = await api.fs.listDir(ws)
        if (!mountedRef.current) return
        setFileTree(entries)
      } catch (err) {
        logger.error('Editor', 'Failed to load workspace:', err)
        if (!mountedRef.current) return
        addToast('error', 'Failed to load workspace', err instanceof Error ? err.message : String(err))
      } finally {
        if (mountedRef.current) {
          setLoading(false)
        }
      }
    }
    loadWorkspace()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadFile = async (entry: FileEntry) => {
    if (entry.isDirectory) {
      toggleDir(entry)
      return
    }

    try {
      setLoading(true)
      const content = await api.fs.readFile(entry.path)
      if (!mountedRef.current) return
      setCode(content)
      setCurrentFile(entry.path)
      setLanguage(getLanguageFromPath(entry.path))
    } catch (err) {
      logger.error('Editor', 'Failed to load file:', err)
      if (!mountedRef.current) return
      addToast('error', 'Failed to load file', err instanceof Error ? err.message : String(err))
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }

  const handleSave = async () => {
    if (!currentFile) return

    try {
      setLoading(true)
      await api.fs.writeFile(currentFile, code)
      if (!mountedRef.current) return
      addTerminalEntry('success', `Saved: ${currentFile.split('/').pop()}`)
    } catch (err) {
      logger.error('Editor', 'Failed to save file:', err)
      if (!mountedRef.current) return
      addTerminalEntry('error', `Failed to save file: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }

  const handleRun = () => {
    if (!currentFile) return
    setShowAgentSelector(true)
  }

  const executeWithAgent = async (swarmId?: string) => {
    if (!currentFile) return

    const swarm = swarmId ? swarms.find(s => s.id === swarmId) : null
    const execMode = swarm ? `via ${swarm.name}` : 'directly'
    addTerminalEntry('command', `Executing ${currentFile.split('/').pop()} (${execMode})`)

    try {
      setLoading(true)
      const result = await api.execute.executeCode(
        currentFile,
        code,
        language,
        swarmId
      )

      if (!mountedRef.current) return

      if (result.success) {
        addTerminalEntry('success', 'Execution completed successfully', result.output)
      } else {
        addTerminalEntry('error', 'Execution failed', result.error || result.output)
      }
    } catch (err) {
      logger.error('Editor', 'Failed to execute code:', err)
      if (!mountedRef.current) return
      addTerminalEntry('error', `Execution error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      if (mountedRef.current) {
        setLoading(false)
        setShowAgentSelector(false)
      }
    }
  }

  const getLanguageFromPath = (path: string): string => {
    const ext = path.split('.').pop()?.toLowerCase() || ''
    const langMap: Record<string, string> = {
      'ts': 'typescript',
      'tsx': 'typescript',
      'js': 'javascript',
      'jsx': 'javascript',
      'py': 'python',
      'go': 'go',
      'rs': 'rust',
      'json': 'json',
      'md': 'markdown',
      'html': 'html',
      'css': 'css',
    }
    return langMap[ext] || 'plaintext'
  }

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setCode(value)
    }
  }

  const toggleDir = async (entry: FileEntry) => {
    if (!entry.isDirectory) return

    const newExpanded = new Set(expandedDirs)
    if (newExpanded.has(entry.path)) {
      newExpanded.delete(entry.path)
    } else {
      newExpanded.add(entry.path)
      if (!entry.children || entry.children.length === 0) {
        try {
          const children = await api.fs.listDir(entry.path)
          // Use functional update to avoid stale closure over fileTree
          setFileTree(prev => {
            const updateChildren = (entries: FileEntry[], path: string): FileEntry[] => {
              return entries.map(e => {
                if (e.path === path && e.isDirectory) {
                  return { ...e, children }
                }
                if (e.isDirectory && e.children) {
                  return { ...e, children: updateChildren(e.children, path) }
                }
                return e
              })
            }
            return updateChildren(prev, entry.path)
          })
        } catch (err) {
          logger.error('Editor', 'Failed to load directory:', err)
        }
      }
    }
    setExpandedDirs(newExpanded)
  }

  const getIconColor = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase() || ''
    const colorMap: Record<string, string> = {
      'ts': 'text-blue-400',
      'tsx': 'text-blue-400',
      'js': 'text-yellow-400',
      'jsx': 'text-yellow-400',
      'py': 'text-green-400',
      'go': 'text-cyan-400',
      'rs': 'text-orange-400',
      'json': 'text-yellow-500',
      'md': 'text-blue-300',
    }
    return colorMap[ext] || 'text-text-tertiary'
  }

  const renderFileTree = (entries: FileEntry[], level: number = 0) => {
    return entries.map((entry) => {
      const isExpanded = expandedDirs.has(entry.path)
      const isActive = currentFile === entry.path

      const Icon = entry.isDirectory ? Folder : FileText
      const iconColor = entry.isDirectory ? 'text-accent' : getIconColor(entry.name)

      return (
        <div key={entry.path}>
          <button
            onClick={() => loadFile(entry)}
            className={`w-full flex items-center px-2 py-1.5 text-left text-sm transition-all duration-150 rounded-mac ${
              isActive ? 'bg-accent-muted text-text-primary' : 'text-text-secondary hover:bg-card-hover hover:text-text-primary'
            }`}
            style={{ paddingLeft: `${level * 12 + 8}px` }}
          >
            {entry.isDirectory && (
              <span className="mr-1" onClick={(e) => { e.stopPropagation(); toggleDir(entry); }}>
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            )}
            <Icon size={14} className={`mr-2 ${iconColor}`} />
            <span className="truncate">{entry.name}</span>
          </button>
          {entry.isDirectory && isExpanded && entry.children && entry.children.length > 0 && (
            <div>
              {renderFileTree(entry.children, level + 1)}
            </div>
          )}
        </div>
      )
    })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-panel-bg/50 border-b border-glass-border">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFileTree(!showFileTree)}
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
              onChange={(e) => setLanguage(e.target.value)}
              className="input-mac py-0.5 min-w-0"
            >
              <option value="typescript">TypeScript</option>
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
              <option value="go">Go</option>
              <option value="rust">Rust</option>
              <option value="json">JSON</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={!currentFile || loading}
            className="btn-secondary"
          >
            <Save size={14} />
            <span>Save</span>
          </button>

          <button
            onClick={handleRun}
            disabled={!currentFile || loading}
            className="btn-primary"
          >
            <Play size={14} />
            <span>Run</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* File Tree */}
        {showFileTree && (
          <div className="w-52 bg-panel-bg/30 border-r border-glass-border overflow-y-auto">
            <div className="panel-header">
              Explorer
            </div>
            <div className="p-2 space-y-0.5">
              {loading && fileTree.length === 0 ? (
                <div className="text-xs text-text-tertiary p-2">Loading...</div>
              ) : (
                renderFileTree(fileTree, 0)
              )}
            </div>
          </div>
        )}

        {/* Editor and Terminal Container */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Editor */}
          <div className="flex-1 overflow-hidden">
            <Editor
              height="100%"
              language={language}
              value={code}
              onChange={handleEditorChange}
              onMount={handleEditorMount}
              options={{
                fontSize: 14,
                fontFamily: "'SF Mono', 'JetBrains Mono', Monaco, Menlo, monospace",
                minimap: { enabled: true },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                wordWrap: 'on',
                lineNumbers: 'on',
                renderWhitespace: 'selection',
                bracketPairColorization: { enabled: true },
                padding: { top: 16 },
              }}
            />
          </div>

          {/* Terminal Panel */}
          <TerminalPanel
            entries={terminalEntries}
            onClear={clearTerminal}
          />
        </div>
      </div>

      {/* Agent Selector Modal */}
      {showAgentSelector && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-panel-bg border border-glass-border rounded-mac-xl p-4 w-96 max-w-md shadow-mac" role="dialog" aria-modal="true" aria-label="Select Execution Mode">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <Zap size={18} className="text-accent" />
                Select Execution Mode
              </h3>
              <button
                onClick={() => setShowAgentSelector(false)}
                className="p-1 hover:bg-card-hover rounded-mac transition-colors"
                aria-label="Close modal"
              >
                <X size={18} className="text-text-secondary" />
              </button>
            </div>

            <div className="space-y-2 mb-4">
              {swarms.length > 0 ? (
                swarms.map((swarm) => (
                  <button
                    key={swarm.id}
                    onClick={() => executeWithAgent(swarm.id)}
                    className="w-full text-left px-4 py-3 rounded-mac hover:bg-card-hover transition-colors group"
                  >
                    <div className="font-medium text-text-primary">{swarm.name}</div>
                    <div className="text-xs text-text-secondary mt-0.5">
                      {swarm.agents.length} agents • {swarm.topology}
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-sm text-text-tertiary py-2">
                  No swarms available. Create one in the Swarm panel.
                </div>
              )}
            </div>

            <div className="border-t border-glass-border pt-3">
              <button
                onClick={() => executeWithAgent(undefined)}
                className="w-full text-left px-4 py-3 rounded-mac hover:bg-card-hover transition-colors"
              >
                <div className="font-medium text-text-primary">Execute Directly</div>
                <div className="text-xs text-text-secondary mt-0.5">
                  Run without agent coordination
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

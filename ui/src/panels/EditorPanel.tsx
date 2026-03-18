import { useState, useEffect, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import { useAppStore } from '../store/appStore'
import { PanelLeft, Play, Save, ChevronRight, ChevronDown, Folder, FileText, X } from 'lucide-react'
import { api, FileEntry } from '../services'
import TerminalPanel, { TerminalEntry } from './TerminalPanel'
import { logger } from '../utils'

export default function EditorPanel() {
  const { swarms } = useAppStore()
  const [code, setCode] = useState(`// Welcome to Swarm Editor
// A multi-agent collaborative development environment

function main() {
  console.log("Hello, Swarm!")
}

main()
`)
  const [language, setLanguage] = useState('typescript')
  const [showFileTree, setShowFileTree] = useState(true)
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [fileTree, setFileTree] = useState<FileEntry[]>([])
  const [workspace, setWorkspace] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>([])
  const [showAgentSelector, setShowAgentSelector] = useState(false)
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())

  // Helper function to add terminal entry
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

  // Helper function to clear terminal
  const clearTerminal = useCallback(() => {
    setTerminalEntries([])
  }, [])

  // 加载工作区
  useEffect(() => {
    loadWorkspace()
  }, [])

  const loadWorkspace = async () => {
    try {
      setLoading(true)
      const ws = await api.fs.getWorkspace()
      setWorkspace(ws)
      const entries = await api.fs.listDir(ws)
      setFileTree(entries)
    } catch (err) {
      logger.error('Editor', 'Failed to load workspace:', err)
    } finally {
      setLoading(false)
    }
  }

  // 加载文件内容
  const loadFile = async (entry: FileEntry) => {
    if (entry.isDirectory) {
      toggleDir(entry)
      return
    }

    try {
      setLoading(true)
      const content = await api.fs.readFile(entry.path)
      setCode(content)
      setCurrentFile(entry.path)
      setLanguage(getLanguageFromPath(entry.path))
    } catch (err) {
      logger.error('Editor', 'Failed to load file:', err)
    } finally {
      setLoading(false)
    }
  }

  // 保存文件
  const handleSave = async () => {
    if (!currentFile) return

    try {
      setLoading(true)
      await api.fs.writeFile(currentFile, code)
      addTerminalEntry('success', `Saved: ${currentFile.split('/').pop()}`)
    } catch (err) {
      logger.error('Editor', 'Failed to save file:', err)
      addTerminalEntry('error', `Failed to save file: ${err}`)
    } finally {
      setLoading(false)
    }
  }

  // 运行代码
  const handleRun = () => {
    if (!currentFile) return
    setShowAgentSelector(true)
  }

  // 执行代码（通过 Agent 或直接）
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

      if (result.success) {
        addTerminalEntry('success', 'Execution completed successfully', result.output)
      } else {
        addTerminalEntry('error', 'Execution failed', result.error || result.output)
      }
    } catch (err) {
      logger.error('Editor', 'Failed to execute code:', err)
      addTerminalEntry('error', `Execution error: ${err}`)
    } finally {
      setLoading(false)
    }

    setShowAgentSelector(false)
  }

  // 根据文件扩展名获取语言
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

  // 切换目录展开
  const toggleDir = async (entry: FileEntry) => {
    if (!entry.isDirectory) return

    const newExpanded = new Set(expandedDirs)
    if (newExpanded.has(entry.path)) {
      newExpanded.delete(entry.path)
    } else {
      newExpanded.add(entry.path)
      // 如果目录还没有加载子节点，加载它们
      if (!entry.children || entry.children.length === 0) {
        try {
          const children = await api.fs.listDir(entry.path)
          // 更新 fileTree
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
          setFileTree(updateChildren(fileTree, entry.path))
        } catch (err) {
          logger.error('Editor', 'Failed to load directory:', err)
        }
      }
    }
    setExpandedDirs(newExpanded)
  }

  // 获取图标颜色
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
    return colorMap[ext] || 'text-gray-500'
  }

  // 渲染文件树
  const renderFileTree = (entries: FileEntry[], level: number = 0) => {
    return entries.map((entry) => {
      const isExpanded = expandedDirs.has(entry.path)
      const isActive = currentFile === entry.path

      const Icon = entry.isDirectory ? Folder : FileText
      const iconColor = entry.isDirectory
        ? 'text-yellow-500'
        : getIconColor(entry.name)
      const nameColor = entry.isDirectory
        ? 'text-white'
        : isActive
          ? 'text-blue-400'
          : 'text-gray-400'

      return (
        <div key={entry.path}>
          <div
            className={`flex items-center px-1 py-0.5 text-xs cursor-pointer hover:bg-gray-700 rounded ${isActive ? 'bg-blue-900/50' : ''}`}
            style={{ paddingLeft: `${level * 12 + 4}px` }}
            onClick={() => loadFile(entry)}
          >
            {entry.isDirectory && (
              <span className="mr-1" onClick={(e) => { e.stopPropagation(); toggleDir(entry); }}>
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            )}
            <Icon size={14} className={`mr-1 ${iconColor}`} />
            <span className={nameColor}>{entry.name}</span>
          </div>
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
      <div className="flex items-center justify-between px-2 py-1 bg-gray-900 border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowFileTree(!showFileTree)}
            className="p-1 hover:bg-gray-700 rounded"
            title="Toggle File Tree"
          >
            <PanelLeft size={16} />
          </button>

          <div className="flex items-center space-x-2 ml-2">
            <span className="text-xs text-gray-400 truncate max-w-48">
              {currentFile ? currentFile.split('/').pop() : workspace.split('/').pop()}
            </span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs"
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

        <div className="flex items-center space-x-2">
          <button
            onClick={handleSave}
            disabled={!currentFile || loading}
            className="flex items-center space-x-1 px-2 py-1 hover:bg-gray-700 rounded text-xs disabled:opacity-50"
          >
            <Save size={14} />
            <span>Save</span>
          </button>

          <button
            onClick={handleRun}
            disabled={!currentFile || loading}
            className="flex items-center space-x-1 px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs text-white"
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
          <div className="w-48 bg-gray-900 border-r border-gray-700 overflow-y-auto">
            <div className="p-2 text-xs text-gray-400 font-semibold border-b border-gray-700">
              EXPLORER
            </div>
            <div className="p-1">
              {loading && fileTree.length === 0 ? (
                <div className="text-xs text-gray-500 p-2">Loading...</div>
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
              theme="vs-dark"
              options={{
                fontSize: 14,
                fontFamily: 'JetBrains Mono',
                minimap: { enabled: true },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                wordWrap: 'on',
                lineNumbers: 'on',
                renderWhitespace: 'selection',
                bracketPairColorization: { enabled: true },
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-4 w-96 max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Select Execution Mode</h3>
              <button
                onClick={() => setShowAgentSelector(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2 mb-4">
              {swarms.map((swarm) => (
                <button
                  key={swarm.id}
                  onClick={() => executeWithAgent(swarm.id)}
                  className="w-full text-left px-3 py-2 rounded hover:bg-gray-700 text-sm"
                >
                  <div className="font-medium">{swarm.name}</div>
                  <div className="text-xs text-gray-400">
                    {swarm.agents.length} agents • {swarm.topology}
                  </div>
                </button>
              ))}
            </div>

            <div className="border-t border-gray-700 pt-2 mt-2">
              <button
                onClick={() => executeWithAgent(undefined)}
                className="w-full text-left px-3 py-2 rounded hover:bg-gray-700 text-sm"
              >
                <div className="font-medium">Execute Directly</div>
                <div className="text-xs text-gray-400">
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

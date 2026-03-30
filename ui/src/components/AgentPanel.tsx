import { useState, useRef, useEffect, useCallback } from 'react'
import { useAppStore } from '../store/appStore'
import { Send, Loader2, Bot, User, Play, Square, RefreshCw } from 'lucide-react'
import { logger } from '../utils'
import { api, events, fsApi } from '../services'
import { isCursorInFileReference, parseFileReferences, getLanguageFromExtension, expandGlob } from '../utils/fileReference'
import { FileAutocompleteWrapper, FileItem } from './FileAutocomplete'

// Directories to exclude from file scanning (module-level constant)
const EXCLUDE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'vendor', 'target', 'bin']
interface ChatSession {
  agentId: string
  sessionId: string
}

export default function AgentPanel() {
  const agents = useAppStore(state => state.agents)
  const selectedAgent = useAppStore(state => state.selectedAgent)
  const selectAgent = useAppStore(state => state.selectAgent)
  const startAgent = useAppStore(state => state.startAgent)
  const stopAgent = useAppStore(state => state.stopAgent)
  const loadAgents = useAppStore(state => state.loadAgents)
  const addToast = useAppStore(state => state.addToast)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Array<{
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: Date
  }>>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isToggling, setIsToggling] = useState<string | null>(null)
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null)
  const sessionRef = useRef<ChatSession | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [showFileAutocomplete, setShowFileAutocomplete] = useState(false)
  const [fileQuery, setFileQuery] = useState('')
  const [availableFiles, setAvailableFiles] = useState<FileItem[]>([])

  // Load available files for autocomplete from backend
  const loadFilesFromBackend = useCallback(async (dirPath: string = '.'): Promise<FileItem[]> => {
    // Skip if already in an excluded directory
    if (EXCLUDE_DIRS.some(d => dirPath.includes('/' + d) || dirPath === d)) {
      return []
    }

    try {
      const entries = await fsApi.listDir(dirPath)
      const files: FileItem[] = []

      for (const entry of entries) {
        if (entry.isDirectory) {
          // Skip excluded directories and limit recursion depth
          if (!EXCLUDE_DIRS.includes(entry.name) && dirPath.split('/').length < 5) {
            const subPath = dirPath === '.' ? entry.name : `${dirPath}/${entry.name}`
            const subFiles = await loadFilesFromBackend(subPath)
            files.push(...subFiles)
          }
        } else {
          files.push({
            path: dirPath === '.' ? entry.name : `${dirPath}/${entry.name}`,
            type: 'file',
            name: entry.name,
          })
        }
      }
      return files
    } catch (e) {
      logger.warn('AgentPanel', 'Failed to load files:', e)
      return []
    }
  }, [])

  // Load files on mount
  useEffect(() => {
    let mounted = true
    loadFilesFromBackend('.').then(files => {
      if (mounted) {
        setAvailableFiles(files)
      }
    })
    return () => { mounted = false }
  }, [loadFilesFromBackend])

  // Handle file autocomplete detection
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    const cursorPos = e.target.selectionStart || 0
    setInput(value)

    const result = isCursorInFileReference(value, cursorPos)
    if (result.inReference) {
      setFileQuery(result.query || '')
      setShowFileAutocomplete(true)
    } else {
      setShowFileAutocomplete(false)
    }
  }, [])

  // Handle file selection from autocomplete
  const handleFileSelect = useCallback((path: string) => {
    if (!inputRef.current) return

    const cursorPos = inputRef.current.selectionStart || 0
    const beforeCursor = input.slice(0, cursorPos)
    const afterCursor = input.slice(cursorPos)

    // Find the start of the @File reference
    const match = beforeCursor.match(/@(?:File|Files)\s+(\S*)$/i)
    if (match) {
      const beforeRef = beforeCursor.slice(0, beforeCursor.length - match[0].length)
      const newPath = `@File ${path} `
      setInput(beforeRef + newPath + afterCursor)

      // Move cursor after the inserted path
      setTimeout(() => {
        if (inputRef.current) {
          const newPos = beforeRef.length + newPath.length
          inputRef.current.setSelectionRange(newPos, newPos)
          inputRef.current.focus()
        }
      }, 0)
    }
    setShowFileAutocomplete(false)
  }, [input])

  // 监听后端事件 (WebSocket)
  useEffect(() => {
    const unlisten = events.onAgentMessage((payload) => {
      const { sessionId, content } = payload as { sessionId: string; content: string }
      if (sessionRef.current?.sessionId === sessionId) {
        // 添加 Agent 响应消息
        const agentMessage = {
          id: Date.now().toString(),
          role: 'assistant' as const,
          content: content || 'Task completed.',
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, agentMessage])
        setIsLoading(false)
      }
    })

    return () => {
      unlisten()
    }
  }, [])

  // 切换 Agent 时关闭旧会话
  useEffect(() => {
    if (currentSession && selectedAgent?.id !== currentSession.agentId) {
      api.agent.closeSession(currentSession.sessionId).catch(e => {
        logger.warn('AgentPanel', 'Failed to close session:', e)
      })
      setCurrentSession(null)
      sessionRef.current = null
      setMessages([])
    }
  }, [selectedAgent?.id, currentSession])

  // 确保会话存在
  const ensureSession = async (): Promise<ChatSession | null> => {
    if (!selectedAgent) return null

    // 如果已有会话且 Agent 匹配，复用
    if (currentSession && currentSession.agentId === selectedAgent.id) {
      return currentSession
    }

    // 创建新会话
    try {
      const result = await api.agent.createSession(selectedAgent.id)
      const session: ChatSession = {
        agentId: selectedAgent.id,
        sessionId: result.sessionId || result.id,
      }
      setCurrentSession(session)
      sessionRef.current = session
      return session
    } catch (e) {
      logger.error('AgentPanel', 'Failed to create session:', e)
      addToast('error', 'Session Error', `Failed to create session: ${e instanceof Error ? e.message : String(e)}`)
      return null
    }
  }

  // Resolve @File references and format message with file content
  const resolveFileReferences = async (text: string): Promise<string> => {
    const references = parseFileReferences(text)
    if (references.length === 0) return text

    const fileContents = new Map<string, string>()
    const filePaths = availableFiles.map(f => f.path)

    // Load file content for each reference
    for (const ref of references) {
      if (ref.type === 'file') {
        // Single file reference
        try {
          const content = await fsApi.readFile(ref.path)
          fileContents.set(ref.path, content)
        } catch (e) {
          logger.warn('AgentPanel', `Failed to read file ${ref.path}:`, e)
          fileContents.set(ref.path, `[Error: Could not read file ${ref.path}]`)
        }
      } else if (ref.type === 'glob') {
        // Glob pattern - expand and read all matching files
        const matchedFiles = expandGlob(ref.path, filePaths)
        if (matchedFiles.length === 0) {
          logger.warn('AgentPanel', `No files matched glob pattern: ${ref.path}`)
          fileContents.set(ref.path, `[No files matched: ${ref.path}]`)
        } else {
          // Limit to 10 files per glob to avoid token overflow
          const limitedFiles = matchedFiles.slice(0, 10)
          for (const filePath of limitedFiles) {
            try {
              const content = await fsApi.readFile(filePath)
              fileContents.set(filePath, content)
            } catch (e) {
              logger.warn('AgentPanel', `Failed to read file ${filePath}:`, e)
              fileContents.set(filePath, `[Error: Could not read file ${filePath}]`)
            }
          }
          if (matchedFiles.length > 10) {
            logger.info('AgentPanel', `Glob matched ${matchedFiles.length} files, limited to 10`)
          }
        }
      }
      // Note: 'folder' type is not yet implemented - would require recursive listing
    }

    // Replace @File references with formatted content
    let result = text
    const sorted = [...references].sort((a, b) => b.startIndex - a.startIndex)

    for (const ref of sorted) {
      if (ref.type === 'file') {
        const content = fileContents.get(ref.path)
        if (content) {
          const ext = ref.path.split('.').pop()?.toLowerCase() || ''
          const lang = getLanguageFromExtension(ext)
          const formatted = `\n\`\`\`${lang}:${ref.path}\n${content}\n\`\`\`\n`
          result = result.slice(0, ref.startIndex) + formatted + result.slice(ref.endIndex)
        } else {
          result = result.slice(0, ref.startIndex) + result.slice(ref.endIndex)
        }
      } else if (ref.type === 'glob') {
        // For glob patterns, insert all matched file contents
        const matchedFiles = expandGlob(ref.path, filePaths).slice(0, 10)
        const parts: string[] = []

        for (const filePath of matchedFiles) {
          const content = fileContents.get(filePath)
          if (content) {
            const ext = filePath.split('.').pop()?.toLowerCase() || ''
            const lang = getLanguageFromExtension(ext)
            parts.push(`\n\`\`\`${lang}:${filePath}\n${content}\n\`\`\`\n`)
          }
        }

        if (matchedFiles.length > 10) {
          parts.push(`\n[... and ${matchedFiles.length - 10} more files]\n`)
        }

        const replacement = parts.join('')
        result = result.slice(0, ref.startIndex) + replacement + result.slice(ref.endIndex)
      } else {
        // For unhandled types (folder), just remove the reference
        result = result.slice(0, ref.startIndex) + result.slice(ref.endIndex)
      }
    }

    return result.trim()
  }

  const handleSend = async () => {
    if (!input.trim() || isLoading || !selectedAgent) return

    // Capture input before clearing
    const originalInput = input

    // Update UI immediately for responsive UX
    const userMessage = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: originalInput,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      // Resolve @File references asynchronously
      const resolvedContent = await resolveFileReferences(originalInput)

      const session = await ensureSession()
      if (!session) {
        setIsLoading(false)
        return
      }

      // Send resolved content (with file contents) to backend
      await api.agent.sendMessage(session.sessionId, resolvedContent)

      // Note: isLoading will be set to false in the event listener
    } catch (e) {
      logger.error('AgentPanel', 'Failed to send message:', e)
      addToast('error', 'Send Error', `Failed to send message: ${e instanceof Error ? e.message : String(e)}`)
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await loadAgents()
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleToggleAgent = async (agentId: string, currentState: string) => {
    setIsToggling(agentId)
    try {
      if (currentState === 'running' || currentState === 'executing') {
        await stopAgent(agentId)
      } else {
        await startAgent(agentId)
      }
    } catch (error) {
      logger.error('Agents', 'Failed to toggle agent:', error)
    } finally {
      setIsToggling(null)
    }
  }

  const getStateColor = (state: string) => {
    switch (state) {
      case 'executing':
      case 'running':
        return 'text-success'
      case 'thinking':
        return 'text-warning'
      case 'error':
        return 'text-error'
      case 'idle':
      case 'stopped':
      default:
        return 'text-text-tertiary'
    }
  }

  const getStateLabel = (state: string) => {
    switch (state) {
      case 'executing':
      case 'running':
        return 'Running'
      case 'thinking':
        return 'Thinking'
      case 'error':
        return 'Error'
      case 'idle':
      case 'stopped':
      default:
        return 'Idle'
    }
  }

  const getStateDotColor = (state: string) => {
    switch (state) {
      case 'executing':
      case 'running':
        return 'bg-success'
      case 'thinking':
        return 'bg-warning'
      case 'error':
        return 'bg-error'
      default:
        return 'bg-text-tertiary'
    }
  }

  return (
    <div className="flex flex-col w-80 bg-mac-panel/95 border-l border-glass-border backdrop-blur-xl">
      {/* Agent Selector */}
      <div className="p-3 border-b border-glass-border">
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-accent" />
          <select
            className="flex-1 input-mac py-1.5"
            value={selectedAgent?.id || ''}
            onChange={(e) => {
              const agent = agents.find((a) => a.id === e.target.value)
              selectAgent(agent || null)
            }}
          >
            <option value="">Select Agent</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name} ({agent.type})
              </option>
            ))}
          </select>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-1.5 hover:bg-card-hover rounded-mac transition-colors disabled:opacity-50"
            title="Refresh agents"
            aria-label="Refresh agents"
          >
            <RefreshCw size={14} className={`text-text-secondary ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Agent List with Controls */}
      <div className="border-b border-glass-border max-h-52 overflow-y-auto">
        {agents.length === 0 ? (
          <div className="p-4 text-center text-text-tertiary text-sm">
            No agents available
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className={`flex items-center justify-between p-2.5 rounded-mac cursor-pointer transition-all duration-200 ${
                  selectedAgent?.id === agent.id
                    ? 'bg-accent-muted border border-accent/30'
                    : 'hover:bg-card-hover'
                }`}
                onClick={() => selectAgent(agent)}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Bot size={14} className={getStateColor(agent.state)} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate text-text-primary">{agent.name}</div>
                    <div className="text-xs text-text-secondary flex items-center gap-1.5 mt-0.5">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${getStateDotColor(agent.state)}`}></span>
                      <span>{getStateLabel(agent.state)}</span>
                      <span className="text-glass-border">•</span>
                      <span className="capitalize">{agent.type}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleToggleAgent(agent.id, agent.state)
                  }}
                  disabled={isToggling === agent.id}
                  className={`p-1.5 rounded-mac transition-colors disabled:opacity-50 ${
                    agent.state === 'executing'
                      ? 'text-error hover:bg-error/10'
                      : 'text-success hover:bg-success/10'
                  }`}
                  title={agent.state === 'executing' ? 'Stop agent' : 'Start agent'}
                >
                  {isToggling === agent.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : agent.state === 'executing' ? (
                    <Square size={14} />
                  ) : (
                    <Play size={14} />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Selected Agent Info */}
      {selectedAgent && (
        <div className="p-3 border-b border-glass-border bg-glass/30">
          <div className="text-xs text-text-secondary">
            <div className="font-medium text-text-primary mb-1">{selectedAgent.name}</div>
            <div className="flex flex-wrap gap-1">
              {selectedAgent.capabilities?.pairProgramming && (
                <span className="px-1.5 py-0.5 bg-accent/10 text-accent rounded text-xs">Pair Programming</span>
              )}
              {selectedAgent.capabilities?.teamCollaboration && (
                <span className="px-1.5 py-0.5 bg-success/10 text-success rounded text-xs">Team Collaboration</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-text-tertiary text-sm mt-8">
            {selectedAgent
              ? `Chat with ${selectedAgent.name}`
              : 'Select an agent to start chatting'}
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-mac px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-accent text-white'
                    : 'bg-glass border border-glass-border text-text-primary'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1 opacity-75">
                  {msg.role === 'user' ? (
                    <User size={11} />
                  ) : (
                    <Bot size={11} className="text-accent" />
                  )}
                  <span className="text-xs">
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-glass border border-glass-border rounded-mac px-3 py-2">
              <Loader2 size={14} className="animate-spin text-accent" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-glass-border relative">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={selectedAgent ? "Type a message... (@File to reference files)" : "Select an agent first..."}
            className="flex-1 input-mac resize-none focus:outline-none focus:border-accent disabled:opacity-50"
            rows={2}
            disabled={!selectedAgent}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading || !selectedAgent}
            className="p-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-mac transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
        {/* File Autocomplete */}
        <FileAutocompleteWrapper
          visible={showFileAutocomplete}
          query={fileQuery}
          files={availableFiles}
          onSelect={handleFileSelect}
          onClose={() => setShowFileAutocomplete(false)}
          inputRef={inputRef}
        />
      </div>
    </div>
  )
}

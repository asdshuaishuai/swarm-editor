import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { api, FileEntry } from '../services'
import { logger } from '../utils'

interface WorktreeInfo {
  id: string
  path: string
  branch: string
  head: string
  isCurrent: boolean
  agentId?: string
  agentName?: string
  status: 'available' | 'busy' | 'locked'
}

export function WorktreePanel() {
  const navigate = useNavigate()
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([])
  const [selectedWorktree, setSelectedWorktree] = useState<string | null>(null)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const mountedRef = useRef(true)

  // Track mounted state to prevent setState on unmounted component
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Load worktrees function
  const loadWorktrees = useCallback(async () => {
    setLoading(true)
    try {
      // 获取当前工作目录作为主 worktree
      const workspace = await api.fs.getWorkspace()

      // 扫描 agents 配置获取关联的 worktrees
      const agents = await api.agent.getAgents()

      if (!mountedRef.current) return []

      // 构建主 worktree
      const mainWorktree: WorktreeInfo = {
        id: 'main',
        path: workspace,
        branch: 'main', // TODO: 从 git 获取真实分支
        head: 'current',
        isCurrent: true,
        status: 'available'
      }

      // 构建所有 worktrees（主 + agent worktrees）
      const allWorktrees: WorktreeInfo[] = [mainWorktree]

      // 为运行中的 agent 创建 worktree 条目
      agents.forEach(agent => {
        if (agent.status === 'running' && agent.id !== 'main') {
          allWorktrees.push({
            id: agent.id,
            path: `${workspace}/.worktrees/${agent.id}`,
            branch: `agent/${agent.name}`,
            head: 'active',
            isCurrent: false,
            agentId: agent.id,
            agentName: agent.name,
            status: agent.status === 'running' ? 'busy' : 'available'
          })
        }
      })

      setWorktrees(allWorktrees)
      return allWorktrees
    } catch (error) {
      logger.error('WorktreePanel', 'Failed to load worktrees:', error)
      if (!mountedRef.current) return []
      // 回退到基本显示
      const fallback: WorktreeInfo[] = [{
        id: 'main',
        path: '.',
        branch: 'main',
        head: 'current',
        isCurrent: true,
        status: 'available'
      }]
      setWorktrees(fallback)
      return fallback
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [])

  // Load files function
  const loadFiles = useCallback(async (worktreeId: string, worktreeList: WorktreeInfo[]) => {
    const worktree = worktreeList.find(w => w.id === worktreeId)
    if (!worktree) return

    try {
      const entries = await api.fs.listDir(worktree.path)
      if (!mountedRef.current) return
      setFiles(entries)
    } catch (error) {
      logger.error('WorktreePanel', 'Failed to load files:', error)
      if (!mountedRef.current) return
      setFiles([])
    }
  }, [])

  // Load worktrees on mount
  useEffect(() => {
    let cancelled = false
    const init = async () => {
      const allWorktrees = await loadWorktrees()
      if (cancelled) return
      if (allWorktrees.length > 0) {
        setSelectedWorktree(allWorktrees[0].id)
      }
    }
    init()
    return () => { cancelled = true }
  }, [loadWorktrees])

  // Load files when worktree is selected
  useEffect(() => {
    if (selectedWorktree && worktrees.length > 0) {
      loadFiles(selectedWorktree, worktrees)
    }
  }, [selectedWorktree, worktrees, loadFiles])

  const toggleDir = (path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const getStatusColor = (status: WorktreeInfo['status']) => {
    switch (status) {
      case 'available': return 'bg-green-500'
      case 'busy': return 'bg-yellow-500'
      case 'locked': return 'bg-red-500'
    }
  }

  const getAgentColor = (agentName?: string) => {
    const colors: Record<string, string> = {
      'claude-code': 'text-orange-400',
      'kimi-code': 'text-purple-400',
      'opencode': 'text-green-400',
      'gemini-cli': 'text-blue-400'
    }
    return agentName ? colors[agentName] || 'text-slate-400' : 'text-slate-400'
  }

  const getFileIcon = (name: string, isDirectory: boolean) => {
    if (isDirectory) {
      return (
        <svg className="w-4 h-4 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      )
    }

    const ext = name.split('.').pop()?.toLowerCase()
    const iconColors: Record<string, string> = {
      'go': 'text-cyan-400',
      'ts': 'text-blue-400',
      'tsx': 'text-blue-400',
      'js': 'text-yellow-400',
      'jsx': 'text-yellow-400',
      'rs': 'text-orange-400',
      'py': 'text-green-400',
      'md': 'text-slate-400',
      'json': 'text-yellow-500',
      'yaml': 'text-red-400',
      'yml': 'text-red-400'
    }

    const color = iconColors[ext || ''] || 'text-slate-500'

    return (
      <svg className={`w-4 h-4 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )
  }

  const renderFileTree = (entries: FileEntry[], depth = 0) => {
    return entries.map((entry) => (
      <div key={entry.path}>
        <button
          onClick={() => entry.isDirectory && toggleDir(entry.path)}
          className="w-full flex items-center gap-1.5 px-2 py-0.5 hover:bg-slate-800/50 transition-colors text-left"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          {entry.isDirectory && (
            <svg
              className={`w-3 h-3 text-slate-500 transition-transform ${expandedDirs.has(entry.path) ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
          {!entry.isDirectory && <span className="w-3" />}
          {getFileIcon(entry.name, entry.isDirectory)}
          <span className="text-xs text-slate-300 truncate">{entry.name}</span>
        </button>
        {entry.isDirectory && expandedDirs.has(entry.path) && entry.children && (
          renderFileTree(entry.children, depth + 1)
        )}
      </div>
    ))
  }

  return (
    <div className="flex flex-col h-full bg-[#0f0f10] border-r border-[#1f1f21]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1f1f21]">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Worktrees</h3>
        <button
          onClick={() => navigate('/settings')}
          className="p-1 rounded hover:bg-slate-800 transition-colors"
          title="Create Worktree"
          aria-label="Create Worktree"
        >
          <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Worktree List */}
      <div className="border-b border-[#1f1f21]">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
          </div>
        ) : (
          worktrees.map((wt) => (
            <button
              key={wt.id}
              onClick={() => setSelectedWorktree(wt.id)}
              className={`w-full px-3 py-2 text-left hover:bg-slate-800/50 transition-colors border-l-2 ${
                selectedWorktree === wt.id
                  ? 'bg-slate-800/50 border-blue-500'
                  : 'border-transparent hover:border-slate-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${getStatusColor(wt.status)}`} />
                <span className="text-xs font-medium text-white truncate flex-1">
                  {wt.branch}
                </span>
                {wt.agentName && (
                  <span className={`text-[10px] ${getAgentColor(wt.agentName)}`}>
                    {wt.agentName}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 pl-4">
                <span className="text-[10px] text-slate-500 font-mono">{wt.head.slice(0, 7)}</span>
                {wt.isCurrent && (
                  <span className="text-[10px] px-1 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                    current
                  </span>
                )}
              </div>
            </button>
          ))
        )}
      </div>

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {selectedWorktree && (
          <div>
            <div className="px-2 py-1 text-[10px] text-slate-500 uppercase tracking-wider font-medium">
              Files
            </div>
            {renderFileTree(files)}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-[#1f1f21]">
        <div className="flex items-center justify-between text-[10px] text-slate-500">
          <span>{worktrees.length} worktrees</span>
          <span>{files.length} items</span>
        </div>
      </div>
    </div>
  )
}

export default WorktreePanel
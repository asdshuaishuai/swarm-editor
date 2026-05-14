import { useState, useCallback, useRef, useEffect } from 'react'
import { gitApi, GitFileStatus, GitCommit } from '../services/api'
import { useAppStore } from '../store/appStore'
import { useMenuKeyboardNav } from '../hooks/useMenuKeyboardNav'
import { logger } from '../utils'
import {
  GitBranch, Plus, Minus, Send, ChevronDown,
  ChevronRight, RotateCcw, Clock, Upload, Download,
  Archive, Undo2, MoreHorizontal,
} from 'lucide-react'

interface SourceControlPanelProps {
  /** Called when files change (stage/unstage/discard) to refresh EditorPanel state */
  onStatusChange?: (files: GitFileStatus[]) => void
  /** Called to open a file in the editor */
  onOpenFile?: (path: string) => void
}

export default function SourceControlPanel({ onStatusChange, onOpenFile }: SourceControlPanelProps) {
  const [stagedFiles, setStagedFiles] = useState<GitFileStatus[]>([])
  const [unstagedFiles, setUnstagedFiles] = useState<GitFileStatus[]>([])
  const [commitMessage, setCommitMessage] = useState('')
  const [committing, setCommitting] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [showStaged, setShowStaged] = useState(true)
  const [showUnstaged, setShowUnstaged] = useState(true)
  const [discardTarget, setDiscardTarget] = useState<string | null>(null)
  const [currentBranch, setCurrentBranch] = useState('')
  const [branches, setBranches] = useState<{ name: string; current: boolean }[]>([])
  const [showBranchMenu, setShowBranchMenu] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [isOperating, setIsOperating] = useState(false)
  const addToast = useAppStore(state => state.addToast)
  const mountedRef = useRef(true)
  const branchMenuRef = useRef<HTMLDivElement>(null)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const branchMenuKeyDown = useMenuKeyboardNav(branchMenuRef, () => setShowBranchMenu(false))
  const moreMenuKeyDown = useMenuKeyboardNav(moreMenuRef, () => setShowMoreMenu(false))

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const refreshStatus = useCallback(async () => {
    try {
      const [files, branch] = await Promise.all([
        gitApi.getStatus(),
        gitApi.getBranch(),
      ])
      if (!mountedRef.current) return
      const staged = files.filter(f => f.staged)
      const unstaged = files.filter(f => !f.staged)
      setStagedFiles(staged)
      setUnstagedFiles(unstaged)
      setCurrentBranch(branch)
      onStatusChange?.(files)
    } catch (err) {
      logger.error('SourceControl', 'Failed to refresh status:', err)
    }
  }, [onStatusChange])

  // Initial load
  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  const loadBranches = useCallback(async () => {
    try {
      const list = await gitApi.listBranches()
      if (!mountedRef.current) return
      setBranches(list)
      const current = list.find(b => b.current)
      if (current) setCurrentBranch(current.name)
    } catch (err) {
      logger.error('SourceControl', 'Failed to load branches:', err)
    }
  }, [])

  // R5182: Handle git-checkout event from Command Palette - open branch menu
  useEffect(() => {
    const handleGitCheckout = async () => {
      await loadBranches()
      setShowBranchMenu(true)
    }
    window.addEventListener('git-checkout', handleGitCheckout)
    return () => { window.removeEventListener('git-checkout', handleGitCheckout) }
  }, [loadBranches])

  const handleStage = async (path: string) => {
    try {
      await gitApi.stage(path)
      if (!mountedRef.current) return
      await refreshStatus()
    } catch (err) {
      addToast('error', 'Stage failed', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const handleStageAll = async () => {
    try {
      await gitApi.stage()
      if (!mountedRef.current) return
      await refreshStatus()
    } catch (err) {
      addToast('error', 'Stage all failed', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const handleUnstage = async (path: string) => {
    try {
      await gitApi.unstage(path)
      if (!mountedRef.current) return
      await refreshStatus()
    } catch (err) {
      addToast('error', 'Unstage failed', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const handleUnstageAll = async () => {
    try {
      await gitApi.unstage()
      if (!mountedRef.current) return
      await refreshStatus()
    } catch (err) {
      addToast('error', 'Unstage all failed', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const handleDiscard = async (path: string) => {
    try {
      await gitApi.discard(path)
      if (!mountedRef.current) return
      await refreshStatus()
    } catch (err) {
      addToast('error', 'Discard failed', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const handleCommit = async () => {
    if (!commitMessage.trim() || stagedFiles.length === 0) return
    setCommitting(true)
    try {
      const result = await gitApi.commit(commitMessage.trim())
      if (!mountedRef.current) return
      setCommitMessage('')
      addToast('success', 'Committed', `${result.hash} ${result.message.slice(0, 40)}`)
      await refreshStatus()
    } catch (err) {
      addToast('error', 'Commit failed', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      if (mountedRef.current) setCommitting(false)
    }
  }

  const loadLog = async () => {
    if (showLog) {
      setShowLog(false)
      return
    }
    try {
      const log = await gitApi.log()
      if (!mountedRef.current) return
      setCommits(log)
      setShowLog(true)
    } catch (err) {
      addToast('error', 'Git log failed', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const handleCheckoutBranch = async (name: string) => {
    setShowBranchMenu(false)
    setIsOperating(true)
    try {
      await gitApi.checkoutBranch(name)
      if (!mountedRef.current) return
      addToast('info', 'Branch switched', `Checked out ${name}`)
      await refreshStatus()
    } catch (err) {
      addToast('error', 'Checkout failed', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      if (mountedRef.current) setIsOperating(false)
    }
  }

  const handleCreateBranch = async (name: string) => {
    setShowBranchMenu(false)
    setIsOperating(true)
    try {
      await gitApi.createBranch(name, true)
      if (!mountedRef.current) return
      addToast('success', 'Branch created', `Created and checked out ${name}`)
      await refreshStatus()
    } catch (err) {
      addToast('error', 'Create branch failed', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      if (mountedRef.current) setIsOperating(false)
    }
  }

  const handlePush = async () => {
    setIsOperating(true)
    try {
      const result = await gitApi.push('origin', currentBranch)
      if (!mountedRef.current) return
      addToast('success', 'Pushed', result.output.slice(0, 80) || `Pushed to origin/${currentBranch}`)
    } catch (err) {
      addToast('error', 'Push failed', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      if (mountedRef.current) setIsOperating(false)
    }
  }

  const handlePull = async () => {
    setIsOperating(true)
    try {
      const result = await gitApi.pull('origin', currentBranch)
      if (!mountedRef.current) return
      addToast('success', 'Pulled', result.output.slice(0, 80) || `Pulled from origin/${currentBranch}`)
      await refreshStatus()
    } catch (err) {
      addToast('error', 'Pull failed', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      if (mountedRef.current) setIsOperating(false)
    }
  }

  const handleStash = async () => {
    setIsOperating(true)
    try {
      await gitApi.stash()
      if (!mountedRef.current) return
      addToast('info', 'Stashed', 'Working changes stashed')
      await refreshStatus()
    } catch (err) {
      addToast('error', 'Stash failed', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      if (mountedRef.current) setIsOperating(false)
    }
  }

  const handleStashPop = async () => {
    setIsOperating(true)
    try {
      await gitApi.stashPop()
      if (!mountedRef.current) return
      addToast('info', 'Stash popped', 'Stashed changes restored')
      await refreshStatus()
    } catch (err) {
      addToast('error', 'Stash pop failed', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      if (mountedRef.current) setIsOperating(false)
    }
  }

  const handleUndoCommit = async () => {
    setIsOperating(true)
    try {
      await gitApi.undoCommit()
      if (!mountedRef.current) return
      addToast('info', 'Commit undone', 'Last commit moved to staged changes')
      await refreshStatus()
    } catch (err) {
      addToast('error', 'Undo commit failed', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      if (mountedRef.current) setIsOperating(false)
    }
  }

  const totalChanges = stagedFiles.length + unstagedFiles.length

  const statusLabel = (status: string) => {
    switch (status) {
      case 'M': return { label: 'M', color: 'text-yellow-400', title: 'Modified' }
      case 'A': return { label: 'A', color: 'text-green-400', title: 'Added' }
      case 'D': return { label: 'D', color: 'text-red-400', title: 'Deleted' }
      case 'R': return { label: 'R', color: 'text-blue-400', title: 'Renamed' }
      case '??': return { label: 'U', color: 'text-text-tertiary', title: 'Untracked' }
      default: return { label: status, color: 'text-text-tertiary', title: status }
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="panel-header flex items-center justify-between">
        <span>Source Control</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={loadLog}
            className={`p-0.5 rounded transition-colors ${showLog ? 'bg-accent/20 text-accent' : 'hover:bg-card-hover text-text-tertiary'}`}
            title="Git Log"
          >
            <Clock size={12} />
          </button>
        </div>
      </div>

      {/* Branch selector + action bar — VS Code pattern */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-glass-border">
        {/* Branch selector */}
        <div className="relative flex-1 min-w-0">
          <button
            onClick={async () => {
              await loadBranches()
              setShowBranchMenu(!showBranchMenu)
              setShowMoreMenu(false)
            }}
            className="flex items-center gap-1.5 w-full px-1.5 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-card-hover rounded-mac transition-colors"
            disabled={isOperating}
          >
            <GitBranch size={12} className="flex-shrink-0" />
            <span className="truncate">{currentBranch || 'no branch'}</span>
            <ChevronDown size={10} className="ml-auto flex-shrink-0" />
          </button>
          {showBranchMenu && (
            <>
              <div className="fixed inset-0 z-[100]" onClick={() => setShowBranchMenu(false)} />
              <div ref={branchMenuRef} onKeyDown={branchMenuKeyDown} className="absolute top-full left-0 right-0 mt-1 bg-mac-panel border border-glass-border rounded-mac-lg shadow-mac z-[101] max-h-60 overflow-y-auto" role="menu">
                <div className="p-1">
                  {branches.map(b => (
                    <button
                      key={b.name}
                      onClick={() => handleCheckoutBranch(b.name)}
                      role="menuitem"
                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-mac transition-colors ${
                        b.current
                          ? 'bg-accent/10 text-accent font-medium'
                          : 'text-text-primary hover:bg-card-hover'
                      }`}
                    >
                      <GitBranch size={12} />
                      <span className="truncate">{b.name}</span>
                      {b.current && <span className="ml-auto text-[10px] text-accent">current</span>}
                    </button>
                  ))}
                  {branches.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-text-tertiary">Loading...</div>
                  )}
                </div>
                <div className="border-t border-glass-border p-1">
                  <CreateBranchItem
                    disabled={isOperating}
                    onCreate={handleCreateBranch}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Push / Pull buttons */}
        <button
          onClick={handlePull}
          className="p-1 text-text-tertiary hover:text-text-primary hover:bg-card-hover rounded-mac transition-colors"
          title="Pull (git pull)"
          disabled={isOperating}
        >
          <Download size={12} />
        </button>
        <button
          onClick={handlePush}
          className="p-1 text-text-tertiary hover:text-text-primary hover:bg-card-hover rounded-mac transition-colors"
          title="Push (git push)"
          disabled={isOperating || !currentBranch}
        >
          <Upload size={12} />
        </button>

        {/* More actions */}
        <div className="relative">
          <button
            onClick={() => { setShowMoreMenu(!showMoreMenu); setShowBranchMenu(false) }}
            className="p-1 text-text-tertiary hover:text-text-primary hover:bg-card-hover rounded-mac transition-colors"
            title="More actions"
          >
            <MoreHorizontal size={12} />
          </button>
          {showMoreMenu && (
            <>
              <div className="fixed inset-0 z-[100]" onClick={() => setShowMoreMenu(false)} />
              <div ref={moreMenuRef} onKeyDown={moreMenuKeyDown} className="absolute right-0 top-full mt-1 bg-mac-panel border border-glass-border rounded-mac-lg shadow-mac z-[101] min-w-[160px]" role="menu">
                <div className="p-1">
                  <button
                    onClick={() => { setShowMoreMenu(false); handleStash() }}
                    role="menuitem"
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-text-primary hover:bg-card-hover rounded-mac transition-colors"
                    disabled={isOperating}
                  >
                    <Archive size={12} />
                    Stash Changes
                  </button>
                  <button
                    onClick={() => { setShowMoreMenu(false); handleStashPop() }}
                    role="menuitem"
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-text-primary hover:bg-card-hover rounded-mac transition-colors"
                    disabled={isOperating}
                  >
                    <Archive size={12} />
                    Pop Stash
                  </button>
                  <button
                    onClick={() => { setShowMoreMenu(false); handleUndoCommit() }}
                    role="menuitem"
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-text-primary hover:bg-card-hover rounded-mac transition-colors"
                    disabled={isOperating}
                  >
                    <Undo2 size={12} />
                    Undo Last Commit
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {showLog ? (
        /* Git Log View */
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          <button
            onClick={loadLog}
            className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary mb-2"
          >
            <ChevronRight size={12} />
            Back to changes
          </button>
          {commits.length === 0 ? (
            <div className="text-xs text-text-tertiary p-2">No commits</div>
          ) : (
            commits.map(c => (
              <div key={c.hash} className="px-2 py-1.5 hover:bg-card-hover rounded-mac cursor-default">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-accent">{c.hash}</span>
                  <span className="text-[10px] text-text-tertiary">{c.author}</span>
                  <span className="text-[10px] text-text-tertiary ml-auto">{c.date}</span>
                </div>
                <p className="text-xs text-text-primary mt-0.5 truncate">{c.message}</p>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Changes View */
        <div className="flex-1 overflow-y-auto">
          {/* Commit message input */}
          <div className="px-2 pb-2">
            <div className="flex flex-col gap-1">
              <input
                type="text"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleCommit()
                  }
                }}
                placeholder="Commit message"
                className="w-full bg-surface rounded-mac px-2 py-1.5 text-xs text-text-primary placeholder-text-tertiary outline-none focus:ring-1 focus:ring-accent/50"
                disabled={committing}
              />
              <button
                onClick={handleCommit}
                disabled={!commitMessage.trim() || stagedFiles.length === 0 || committing}
                className="flex items-center justify-center gap-1.5 w-full py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed rounded-mac text-xs text-text-primary font-medium transition-colors"
                title={`Ctrl+Enter to commit`}
              >
                <Send size={12} />
                {committing ? 'Committing...' : `Commit${stagedFiles.length > 0 ? ` (${stagedFiles.length})` : ''}`}
              </button>
            </div>
          </div>

          {/* Staged changes */}
          {stagedFiles.length > 0 && (
            <div className="border-t border-glass-border">
              <button
                onClick={() => setShowStaged(!showStaged)}
                className="flex items-center justify-between w-full px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
                aria-expanded={showStaged}
                aria-controls="staged-changes"
              >
                <span className="flex items-center gap-1.5">
                  {showStaged ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  Staged Changes
                  <span className="text-text-tertiary">{stagedFiles.length}</span>
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleUnstageAll() }}
                  className="text-text-tertiary hover:text-text-primary"
                  title="Unstage all"
                >
                  <Minus size={12} />
                </button>
              </button>
              {showStaged && (
                <div id="staged-changes" className="space-y-0.5 px-1 pb-1">
                  {stagedFiles.map(file => (
                    <div
                      key={file.path}
                      className="flex items-center gap-1.5 px-2 py-1 hover:bg-card-hover rounded-mac group cursor-default"
                    >
                      <button
                        onClick={() => handleUnstage(file.path)}
                        className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-yellow-400 transition-opacity"
                        title="Unstage"
                      >
                        <Minus size={12} />
                      </button>
                      <span className={`text-[10px] font-mono ${statusLabel(file.status).color}`} title={statusLabel(file.status).title}>
                        {statusLabel(file.status).label}
                      </span>
                      <span
                        className="text-xs text-text-primary truncate flex-1 cursor-pointer hover:underline"
                        onClick={() => onOpenFile?.(file.path)}
                        title={`Open ${file.path}`}
                      >{file.path}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Unstaged changes */}
          {unstagedFiles.length > 0 && (
            <div className="border-t border-glass-border">
              <button
                onClick={() => setShowUnstaged(!showUnstaged)}
                className="flex items-center justify-between w-full px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
                aria-expanded={showUnstaged}
                aria-controls="unstaged-changes"
              >
                <span className="flex items-center gap-1.5">
                  {showUnstaged ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  Changes
                  <span className="text-text-tertiary">{unstagedFiles.length}</span>
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleStageAll() }}
                  className="text-text-tertiary hover:text-text-primary"
                  title="Stage all"
                >
                  <Plus size={12} />
                </button>
              </button>
              {showUnstaged && (
                <div id="unstaged-changes" className="space-y-0.5 px-1 pb-1">
                  {unstagedFiles.map(file => (
                    <div
                      key={file.path}
                      className="flex items-center gap-1.5 px-2 py-1 hover:bg-card-hover rounded-mac group cursor-default"
                    >
                      <button
                        onClick={() => handleStage(file.path)}
                        className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-green-400 transition-opacity"
                        title="Stage"
                      >
                        <Plus size={12} />
                      </button>
                      <span className={`text-[10px] font-mono ${statusLabel(file.status).color}`} title={statusLabel(file.status).title}>
                        {statusLabel(file.status).label}
                      </span>
                      <span
                        className="text-xs text-text-primary truncate flex-1 cursor-pointer hover:underline"
                        onClick={() => onOpenFile?.(file.path)}
                        title={`Open ${file.path}`}
                      >{file.path}</span>
                      <button
                        onClick={() => setDiscardTarget(file.path)}
                        className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-red-400 transition-opacity"
                        title="Discard changes"
                      >
                        <RotateCcw size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {totalChanges === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-text-tertiary">
              <GitBranch size={24} className="mb-2 opacity-50" />
              <p className="text-xs">No changes</p>
            </div>
          )}
        </div>
      )}

      {/* Discard confirmation dialog — VS Code always confirms before discarding changes */}
      {discardTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200]" onClick={() => setDiscardTarget(null)}>
          <div className="bg-mac-panel border border-glass-border rounded-mac-lg shadow-mac p-4 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-text-primary mb-2">Discard Changes?</h3>
            <p className="text-xs text-text-secondary mb-4">
              Are you sure you want to discard all changes to <span className="text-text-primary font-mono">{discardTarget.split('/').pop()}</span>? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDiscardTarget(null)}
                className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-card-hover rounded-mac transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const path = discardTarget
                  setDiscardTarget(null)
                  await handleDiscard(path)
                }}
                className="px-3 py-1.5 text-xs font-medium text-error bg-error/10 hover:bg-error/20 rounded-mac transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Inline branch creation input — VS Code pattern (type to create) */
function CreateBranchItem({ disabled, onCreate }: { disabled: boolean; onCreate: (name: string) => void }) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = () => {
    const name = value.trim()
    if (name) {
      onCreate(name)
      setValue('')
    }
  }

  return (
    <div className="flex items-center gap-1 px-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit()
          if (e.key === 'Escape') setValue('')
        }}
        placeholder="Create branch..."
        className="flex-1 bg-transparent px-1 py-1 text-xs text-text-primary placeholder-text-tertiary outline-none"
        disabled={disabled}
      />
      {value.trim() && (
        <button
          onClick={handleSubmit}
          className="p-0.5 text-accent hover:text-accent-hover"
          disabled={disabled}
        >
          <Plus size={12} />
        </button>
      )}
    </div>
  )
}

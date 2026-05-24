import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useAppStore } from '../store/appStore'
import { useSettings } from '../hooks/useSettings'
import { gitApi } from '../services/api'
import { logger } from '../utils'
import { Wifi, WifiOff, Loader2, Zap, Bell, CheckCircle, AlertCircle, AlertTriangle, Info, XCircle, GitBranch, Check } from 'lucide-react'
import type { ToastType } from './Toast'
import { onTabFocusModeChange, getTabMovesFocus } from './TabSwitcher'
import { useMenuKeyboardNav } from '../hooks/useMenuKeyboardNav'

// Language display names mapping
const LANGUAGE_DISPLAY: Record<string, string> = {
  'go': 'Go',
  'typescript': 'TypeScript',
  'typescriptreact': 'TypeScript React',
  'javascript': 'JavaScript',
  'javascriptreact': 'JavaScript React',
  'python': 'Python',
  'rust': 'Rust',
  'java': 'Java',
  'c': 'C',
  'cpp': 'C++',
  'csharp': 'C#',
  'json': 'JSON',
  'yaml': 'YAML',
  'markdown': 'Markdown',
  'html': 'HTML',
  'css': 'CSS',
  'scss': 'SCSS',
  'shell': 'Shell',
  'bash': 'Bash',
  'sql': 'SQL',
  'plaintext': 'Plain Text',
}

function getLanguageDisplay(languageId: string): string {
  return LANGUAGE_DISPLAY[languageId] || languageId.toUpperCase()
}

const notifIconMap: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}
const notifColorMap: Record<ToastType, string> = {
  success: 'text-success',
  error: 'text-error',
  warning: 'text-warning',
  info: 'text-info',
}

/**
 * Status bar item wrapper — adds role="button" and tabIndex for keyboard navigation.
 * VS Code pattern: status bar is a toolbar, items are navigable with arrow keys.
 */
function StatusItem({ children, title, className = '', onClick }: {
  children: React.ReactNode
  title: string
  className?: string
  onClick?: () => void
}) {
  return (
    <div
      role="button"
      tabIndex={-1}
      aria-label={title}
      title={title}
      onClick={onClick}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && onClick) {
          e.preventDefault()
          onClick()
        }
      }}
      className={`flex items-center gap-1 text-text-secondary hover:text-text-primary cursor-pointer transition-colors outline-none focus-visible:ring-1 focus-visible:ring-accent focus-visible:rounded-sm ${onClick ? 'cursor-pointer' : 'cursor-default'} ${className}`}
    >
      {children}
    </div>
  )
}

/**
 * Inline picker for status bar items (VS Code pattern).
 * Shows a dropdown menu when clicking on status bar items like encoding, indent, etc.
 */
function InlinePicker<T extends string>({
  isOpen,
  onClose,
  options,
  currentValue,
  onSelect,
  position = 'right',
  maxHeight,
}: {
  isOpen: boolean
  onClose: () => void
  options: { value: T; label: string }[]
  currentValue: T
  onSelect: (value: T) => void
  position?: 'left' | 'right'
  maxHeight?: number
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const handleKeyDown = useMenuKeyboardNav(menuRef, onClose)

  if (!isOpen) return null

  return (
    <>
      <div
        ref={menuRef}
        role="menu"
        aria-label="Select option"
        onKeyDown={handleKeyDown}
        className={`absolute bottom-full ${position === 'right' ? 'right-0' : 'left-0'} mb-1 min-w-[120px] bg-mac-panel/95 border border-glass-border rounded-mac shadow-mac backdrop-blur-xl z-50 ${maxHeight ? 'overflow-y-auto' : 'overflow-hidden'}`}
        style={maxHeight ? { maxHeight: `${maxHeight}px` } : undefined}
      >
        {options.map((option) => (
          <button
            key={option.value}
            role="menuitem"
            tabIndex={-1}
            onClick={() => { onSelect(option.value); onClose() }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent/20 transition-colors text-left"
          >
            {currentValue === option.value && <Check size={12} className="text-accent flex-shrink-0" />}
            {currentValue !== option.value && <span className="w-3" />}
            <span className={currentValue === option.value ? 'text-text-primary' : 'text-text-secondary'}>{option.label}</span>
          </button>
        ))}
      </div>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
    </>
  )
}

export default function StatusBar() {
  const connected = useAppStore(state => state.connected)
  const connecting = useAppStore(state => state.connecting)
  const agents = useAppStore(state => state.agents)
  const activeSwarm = useAppStore(state => state.activeSwarm)
  // Use lazy initial state to avoid setState in useEffect
  const [tabMovesFocus, setTabMovesFocus] = useState(() => getTabMovesFocus())
  const activeTeam = useAppStore(state => state.activeTeam)
  const notificationHistory = useAppStore(state => state.notificationHistory)
  const clearNotificationHistory = useAppStore(state => state.clearNotificationHistory)

  // Editor state
  const cursorPosition = useAppStore(state => state.editorCursorPosition)
  const selection = useAppStore(state => state.editorSelection)
  const language = useAppStore(state => state.editorLanguage)
  const encoding = useAppStore(state => state.editorEncoding)
  const indent = useAppStore(state => state.editorIndent)
  const lineEnding = useAppStore(state => state.editorLineEnding)

  // Editor setters
  const setEditorEncoding = useAppStore(state => state.setEditorEncoding)
  const setEditorIndent = useAppStore(state => state.setEditorIndent)
  const setEditorLineEnding = useAppStore(state => state.setEditorLineEnding)
  const setEditorLanguage = useAppStore(state => state.setEditorLanguage)

  // Picker visibility states
  const [showNotifications, setShowNotifications] = useState(false)
  const [showIndentPicker, setShowIndentPicker] = useState(false)
  const [showLineEndingPicker, setShowLineEndingPicker] = useState(false)
  const [showEncodingPicker, setShowEncodingPicker] = useState(false)
  const [showLanguagePicker, setShowLanguagePicker] = useState(false)
  const [gitBranch, setGitBranch] = useState('')
  const statusBarRef = useRef<HTMLDivElement>(null)

  // Listen for Tab Moves Focus mode changes (Ctrl+M toggle)
  useEffect(() => {
    return onTabFocusModeChange(() => setTabMovesFocus(getTabMovesFocus()))
  }, [])

  // Fetch git branch
  useEffect(() => {
    const fetchBranch = async () => {
      try {
        const branch = await gitApi.getBranch()
        setGitBranch(branch)
      } catch {
        logger.debug('StatusBar', 'Not a git repo or branch fetch failed')
      }
    }
    fetchBranch()
    const interval = setInterval(fetchBranch, 15000) // Poll every 15s
    return () => clearInterval(interval)
  }, [])

  // Problems indicator (VS Code pattern)
  const workspaceProblems = useAppStore(state => state.workspaceProblems)
  const problemCounts = useMemo(() => {
    const errors = workspaceProblems.filter(p => p.severity === 'error').length
    const warnings = workspaceProblems.filter(p => p.severity === 'warning').length
    return { errors, warnings }
  }, [workspaceProblems])

  // Settings for clickable indicators
  const { settings, updateSetting } = useSettings()

  // Close notification popup on Escape
  useEffect(() => {
    if (!showNotifications) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowNotifications(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showNotifications])

  // Arrow key navigation between status bar items (VS Code pattern)
  // Key Insight #43: VS Code status bar is a toolbar with roving tabindex.
  // Left/Right arrows move between items, Home/End jump to first/last.
  // Items have tabIndex=-1 except the focused one which gets tabIndex=0.
  const handleToolbarKeyDown = useCallback((e: React.KeyboardEvent) => {
    const container = statusBarRef.current
    if (!container) return

    const items = Array.from(container.querySelectorAll<HTMLElement>('[role="button"]'))
    if (items.length === 0) return

    const focusedIdx = items.indexOf(document.activeElement as HTMLElement)

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      const nextIdx = (focusedIdx + 1) % items.length
      items[nextIdx].focus()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const prevIdx = (focusedIdx - 1 + items.length) % items.length
      items[prevIdx].focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      items[0].focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      items[items.length - 1].focus()
    }
  }, [])

  return (
    <div
      ref={statusBarRef}
      data-focus-region="statusbar"
      role="toolbar"
      aria-label="Status bar"
      className="flex items-center justify-between px-4 py-1.5 bg-mac-bg border-t border-glass-border text-xs"
      onKeyDown={handleToolbarKeyDown}
    >
      {/* Left Section */}
      <div className="flex items-center gap-4">
        {/* Tab Moves Focus indicator (VS Code pattern — Ctrl+M toggle) */}
        {tabMovesFocus && (
          <StatusItem title="Tab Moves Focus: Tab key moves focus between UI elements (Ctrl+M to toggle)">
            <span className="text-warning">Tab Moves Focus</span>
          </StatusItem>
        )}

        {/* Git Branch (VS Code pattern — click to open Source Control) */}
        {gitBranch && (
          <StatusItem title={`Git Branch: ${gitBranch} (click to switch)`} onClick={() => window.dispatchEvent(new CustomEvent('toggle-source-control'))}>
            <GitBranch size={12} className="text-text-tertiary" />
            <span>{gitBranch}</span>
          </StatusItem>
        )}

        {/* Connection Status */}
        <StatusItem title={connecting ? 'Connecting to server' : connected ? 'Connected to server' : 'Disconnected from server'}>
          {connecting ? (
            <Loader2 size={12} className="animate-spin text-warning" />
          ) : connected ? (
            <Wifi size={12} className="text-success" />
          ) : (
            <WifiOff size={12} className="text-error" />
          )}
          <span className="text-text-secondary">
            {connecting ? 'Connecting...' : connected ? 'Connected' : 'Disconnected'}
          </span>
        </StatusItem>

        {/* Active Context */}
        {activeSwarm && (
          <StatusItem title={`Active Swarm: ${activeSwarm.name}`}>
            <Zap size={10} className="text-accent" />
            <span className="text-text-secondary">
              <span className="text-accent font-medium">{activeSwarm.name}</span>
            </span>
          </StatusItem>
        )}

        {activeTeam && !activeSwarm && (
          <StatusItem title={`Active Team: ${activeTeam.name}`}>
            <span className="text-text-secondary">
              Team: <span className="text-text-primary">{activeTeam.name}</span>
            </span>
          </StatusItem>
        )}
      </div>

      {/* Right Section - Editor Info */}
      <div className="flex items-center gap-4">
        {/* Cursor Position */}
        {cursorPosition && (
          <StatusItem
            title="Go to Line"
            onClick={() => window.dispatchEvent(new CustomEvent('open-goto-line'))}
          >
            <span>
              Ln {cursorPosition.line}, Col {cursorPosition.column}
            </span>
            {selection && (
              <span className="text-text-tertiary">
                ({selection.lineCount > 1 ? `${selection.lineCount} lines` : `${selection.charCount} chars`} selected)
              </span>
            )}
          </StatusItem>
        )}

        {/* Indentation - R5119: inline picker */}
        <div className="relative">
          <StatusItem
            title={`Indent: ${indent.type === 'tabs' ? 'Tabs' : `Spaces: ${indent.size}`}`}
            onClick={() => setShowIndentPicker(prev => !prev)}
          >
            <span>{indent.type === 'tabs' ? 'Tab' : `Spaces: ${indent.size}`}</span>
          </StatusItem>
          <InlinePicker
            isOpen={showIndentPicker}
            onClose={() => setShowIndentPicker(false)}
            currentValue={`${indent.type}-${indent.size}`}
            onSelect={(value) => {
              const [type, sizeStr] = value.split('-')
              setEditorIndent({ type: type as 'spaces' | 'tabs', size: parseInt(sizeStr, 10) })
            }}
            options={[
              { value: 'spaces-2', label: 'Spaces: 2' },
              { value: 'spaces-4', label: 'Spaces: 4' },
              { value: 'spaces-8', label: 'Spaces: 8' },
              { value: 'tabs-4', label: 'Tab Size: 4' },
            ]}
          />
        </div>

        {/* Line Ending - R5119: inline picker */}
        <div className="relative">
          <StatusItem
            title={`Line Ending: ${lineEnding.toUpperCase()}`}
            onClick={() => setShowLineEndingPicker(prev => !prev)}
          >
            <span>{lineEnding.toUpperCase()}</span>
          </StatusItem>
          <InlinePicker
            isOpen={showLineEndingPicker}
            onClose={() => setShowLineEndingPicker(false)}
            currentValue={lineEnding}
            onSelect={(value) => setEditorLineEnding(value as 'lf' | 'crlf')}
            options={[
              { value: 'lf', label: 'LF' },
              { value: 'crlf', label: 'CRLF' },
            ]}
          />
        </div>

        {/* Encoding - R5119: inline picker */}
        <div className="relative">
          <StatusItem
            title={`Encoding: ${encoding}`}
            onClick={() => setShowEncodingPicker(prev => !prev)}
          >
            <span>{encoding}</span>
          </StatusItem>
          <InlinePicker
            isOpen={showEncodingPicker}
            onClose={() => setShowEncodingPicker(false)}
            currentValue={encoding}
            onSelect={(value) => setEditorEncoding(value)}
            options={[
              { value: 'UTF-8', label: 'UTF-8' },
              { value: 'UTF-8 BOM', label: 'UTF-8 with BOM' },
              { value: 'UTF-16 LE', label: 'UTF-16 LE' },
              { value: 'ISO-8859-1', label: 'Western (ISO-8859-1)' },
            ]}
          />
        </div>

        {/* Language Mode Picker (VS Code pattern — click to change syntax highlighting) */}
        <div className="relative">
          <StatusItem
            title={`Language Mode: ${getLanguageDisplay(language)}`}
            onClick={() => setShowLanguagePicker(prev => !prev)}
          >
            <span>{getLanguageDisplay(language)}</span>
          </StatusItem>
          <InlinePicker
            isOpen={showLanguagePicker}
            onClose={() => setShowLanguagePicker(false)}
            currentValue={language}
            onSelect={(value) => setEditorLanguage(value)}
            position="right"
            maxHeight={250}
            options={Object.entries(LANGUAGE_DISPLAY).map(([value, label]) => ({ value, label }))}
          />
        </div>

        {/* Word Wrap Toggle (VS Code pattern - clickable) */}
        <StatusItem
          title="Toggle Word Wrap"
          onClick={() => updateSetting('wordWrap', !settings.wordWrap)}
        >
          <span>{settings.wordWrap ? 'Wrap' : 'No Wrap'}</span>
        </StatusItem>

        {/* Problems Indicator (VS Code pattern — only show count when problems exist) */}
        {(problemCounts.errors > 0 || problemCounts.warnings > 0) && (
        <StatusItem
          title={`Problems: ${problemCounts.errors} errors, ${problemCounts.warnings} warnings`}
          onClick={() => window.dispatchEvent(new CustomEvent('toggle-problems'))}
        >
          {problemCounts.errors > 0 ? (
            <span className="flex items-center gap-0.5">
              <XCircle size={12} className="text-error" />
              <span>{problemCounts.errors}</span>
            </span>
          ) : (
            <span className="flex items-center gap-0.5">
              <AlertTriangle size={12} className="text-warning" />
              <span>{problemCounts.warnings}</span>
            </span>
          )}
        </StatusItem>
        )}

        {/* Notification Bell (VS Code/Cursor pattern) */}
        <div className="relative">
          <StatusItem
            title={`Notifications (${notificationHistory.length})`}
            onClick={() => setShowNotifications(prev => !prev)}
          >
            <Bell size={12} />
            {notificationHistory.length > 0 && (
              <span className="min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-accent text-white text-[9px] font-bold leading-none px-0.5">
                {notificationHistory.length > 99 ? '99' : notificationHistory.length}
              </span>
            )}
          </StatusItem>
          {showNotifications && (
            <>
              <div className="absolute bottom-full right-0 mb-1 w-80 bg-mac-panel/95 border border-glass-border rounded-mac shadow-mac backdrop-blur-xl overflow-hidden z-50">
                <div className="flex items-center justify-between px-3 py-2 border-b border-glass-border">
                  <span className="text-xs font-semibold text-text-primary">Notifications</span>
                  {notificationHistory.length > 0 && (
                    <button
                      onClick={() => { clearNotificationHistory(); setShowNotifications(false) }}
                      className="text-[10px] text-text-tertiary hover:text-text-primary transition-colors"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                <div className="max-h-[300px] overflow-y-auto" role="list" aria-label="Notifications">
                  {notificationHistory.length === 0 ? (
                    <div className="px-3 py-6 text-center text-text-tertiary text-xs">
                      No notifications
                    </div>
                  ) : (
                    notificationHistory.map((notif) => {
                      const Icon = notifIconMap[notif.type]
                      const color = notifColorMap[notif.type]
                      const time = new Date(notif.timestamp)
                      const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      return (
                        <div key={notif.id} role="listitem" className="flex items-start gap-2 px-3 py-2 hover:bg-surface/50 transition-colors border-b border-glass-border/50 last:border-0">
                          <Icon size={14} className={`flex-shrink-0 mt-0.5 ${color}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-text-primary truncate">{notif.title}</span>
                              <span className="text-[10px] text-text-tertiary flex-shrink-0">{timeStr}</span>
                            </div>
                            {notif.message && (
                              <p className="text-[11px] text-text-secondary truncate mt-0.5">{notif.message}</p>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
              <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} aria-hidden="true" />
            </>
          )}
        </div>

        {/* Agent Count */}
        <StatusItem title={`${agents.length} agents connected`}>
          <span>{agents.length} agents</span>
        </StatusItem>

        {/* Version */}
        <StatusItem title="Version 0.1.0">
          <span className="text-text-tertiary">v0.1.0</span>
        </StatusItem>
      </div>
    </div>
  )
}

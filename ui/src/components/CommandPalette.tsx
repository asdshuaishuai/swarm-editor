import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  FileCode,
  Users,
  Network,
  Settings,
  Plus,
  Play,
  Pause,
  Square,
  Command,
  Code,
  Type,
  Hash,
  List,
  X,
  ChevronRight,
  ChevronDown,
  Pin,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Files,
  Keyboard,
  GitCompare,
  GitBranch,
  Upload,
  Download,
  Archive,
  Undo2,
  Braces,
  AlignVerticalSpaceAround,
  Indent,
  Eye,
  Link,
  Save,
  Sun,
  Clipboard,
  ClipboardCopy,
  Maximize,
  Minimize,
  XCircle,
  RefreshCw,
  FileDown,
  Lightbulb,
  Zap,
  CaseSensitive,
  WholeWord,
  Regex,
  Replace,
  Columns,
  TextCursorInput,
  Highlighter,
  StepForward,
  StepBack,
  ChevronsUpDown,
  Layers,
  Filter,
  Hexagon,
  Box,
} from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { api, gitApi } from '../services'
import { getFileIcon, getFileIconColor, logger } from '../utils'
import { lspApi } from '../services/lspApi'
import type { SwarmInfo } from '../services'
import type { Swarm } from '../types'

interface CommandAction {
  id: string
  label: string
  description?: string
  icon: React.ReactNode
  shortcut?: string
  action: () => void
  category: 'navigation' | 'agent' | 'swarm' | 'settings' | 'view' | 'editing'
}

function swarmInfoToSwarm(info: SwarmInfo): Swarm {
  const agents = useAppStore.getState().agents
  return {
    id: info.id,
    name: info.name,
    topology: info.topology as Swarm['topology'],
    strategy: info.strategy as Swarm['strategy'],
    state: (info.state || info.status) as Swarm['state'],
    agents: agents.filter(a => (info.agents || []).includes(a.id)),
    stats: {
      agentCount: info.stats?.agentCount ?? info.agentCount,
      idleAgents: info.stats?.idleAgents ?? 0,
      executingAgents: info.stats?.executingAgents ?? 0,
      pendingTasks: info.stats?.pendingTasks ?? info.taskCount,
      completedTasks: info.stats?.completedTasks ?? 0,
      topology: info.topology,
      strategy: info.strategy,
      state: info.state || info.status || 'idle',
    },
  }
}

interface PaletteItem {
  id: string
  label: React.ReactNode
  description?: React.ReactNode
  icon: React.ReactNode
  shortcut?: string
  action: () => void
  isFile?: boolean
  filePath?: string
}

function flattenFileTree(entries: import('../stores/workspaceStore').FileEntry[]): Array<{ name: string; path: string }> {
  const result: Array<{ name: string; path: string }> = []
  for (const entry of entries) {
    if (entry.isDirectory && entry.children) {
      result.push(...flattenFileTree(entry.children))
    } else if (!entry.isDirectory) {
      result.push({ name: entry.name, path: entry.path })
    }
  }
  return result
}

function fuzzyScore(query: string, text: string): number {
  const lowerQuery = query.toLowerCase()
  const lowerText = text.toLowerCase()
  let qi = 0
  let score = 0
  let lastMatchIdx = -1
  for (let ti = 0; ti < lowerText.length && qi < lowerQuery.length; ti++) {
    if (lowerText[ti] === lowerQuery[qi]) {
      score += ti === lastMatchIdx + 1 ? 2 : 1
      if (ti === 0 || lowerText[ti - 1] === ' ' || lowerText[ti - 1] === '-' || lowerText[ti - 1] === '_') score += 3
      lastMatchIdx = ti
      qi++
    }
  }
  return qi === lowerQuery.length ? score : -1
}

// Get matched character indices for highlighting (VS Code pattern)
function getFuzzyMatchIndices(query: string, text: string): number[] {
  const lowerQuery = query.toLowerCase()
  const lowerText = text.toLowerCase()
  const indices: number[] = []
  let qi = 0
  for (let ti = 0; ti < lowerText.length && qi < lowerQuery.length; ti++) {
    if (lowerText[ti] === lowerQuery[qi]) {
      indices.push(ti)
      qi++
    }
  }
  return indices
}

// Render text with highlighted fuzzy matches
function highlightFuzzyMatch(text: string, indices: number[]): React.ReactNode {
  if (indices.length === 0) return text
  const result: React.ReactNode[] = []
  let lastIdx = 0
  for (const idx of indices) {
    if (idx > lastIdx) {
      result.push(<span key={`text-${lastIdx}`}>{text.slice(lastIdx, idx)}</span>)
    }
    result.push(<span key={`match-${idx}`} className="text-accent font-semibold">{text[idx]}</span>)
    lastIdx = idx + 1
  }
  if (lastIdx < text.length) {
    result.push(<span key={`text-${lastIdx}`}>{text.slice(lastIdx)}</span>)
  }
  return result
}

// Symbol kind icons (LSP SymbolKind enum)
const SymbolKindIcons: Record<number, { icon: typeof Code; color: string }> = {
  5: { icon: Hexagon, color: 'text-amber-400' },       // Class
  11: { icon: Layers, color: 'text-cyan-400' },       // Interface
  6: { icon: Code, color: 'text-purple-400' },        // Method
  12: { icon: Code, color: 'text-purple-400' },       // Function
  9: { icon: Code, color: 'text-purple-400' },        // Constructor
  7: { icon: Braces, color: 'text-blue-400' },        // Property
  8: { icon: Braces, color: 'text-blue-400' },        // Field
  13: { icon: Type, color: 'text-blue-300' },         // Variable
  14: { icon: Zap, color: 'text-green-400' },         // Constant
  10: { icon: List, color: 'text-orange-400' },       // Enum
  22: { icon: List, color: 'text-orange-300' },       // EnumMember
  23: { icon: Box, color: 'text-teal-400' },          // Struct
  2: { icon: Layers, color: 'text-yellow-400' },      // Module
  3: { icon: Layers, color: 'text-yellow-400' },      // Namespace
  4: { icon: Layers, color: 'text-yellow-400' },      // Package
  24: { icon: Zap, color: 'text-red-400' },           // Event
  26: { icon: Type, color: 'text-pink-400' },         // TypeParameter
}
function getSymbolIcon(kind: number): React.ReactNode {
  const entry = SymbolKindIcons[kind]
  if (!entry) return <Braces size={16} className="text-text-tertiary" />
  const Icon = entry.icon
  return <Icon size={16} className={entry.color} />
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isQuickOpen, setIsQuickOpen] = useState(false)
  const prevFilteredLengthRef = useRef(0)
  const navigate = useNavigate()

  const agents = useAppStore(state => state.agents)
  const activeSwarm = useAppStore(state => state.activeSwarm)
  const setActiveSwarm = useAppStore(state => state.setActiveSwarm)
  const startAgent = useAppStore(state => state.startAgent)
  const stopAgent = useAppStore(state => state.stopAgent)
  const addToast = useAppStore(state => state.addToast)

  // Generate commands dynamically
  const commands = useMemo<CommandAction[]>(() => {
    const cmds: CommandAction[] = [
      // Navigation
      {
        id: 'nav-editor',
        label: 'Go to Editor',
        description: 'Open the code editor',
        icon: <FileCode size={18} />,
        action: () => navigate('/'),
        category: 'navigation',
      },
      {
        id: 'nav-swarm',
        label: 'Go to Swarm',
        description: 'Open swarm management',
        icon: <Network size={18} />,
        action: () => navigate('/swarm'),
        category: 'navigation',
      },
      {
        id: 'nav-team',
        label: 'Go to Team',
        description: 'Open team management',
        icon: <Users size={18} />,
        action: () => navigate('/team'),
        category: 'navigation',
      },
      {
        id: 'nav-settings',
        label: 'Go to Settings',
        description: 'Open application settings',
        icon: <Settings size={18} />,
        action: () => navigate('/settings'),
        category: 'navigation',
        shortcut: 'Ctrl+,',
      },
      // Swarm commands
      {
        id: 'swarm-create',
        label: 'Create New Swarm',
        description: 'Create a new agent swarm',
        icon: <Plus size={18} />,
        action: () => {
          navigate('/swarm')
          // Trigger create swarm modal
        },
        category: 'swarm',
      },
      {
        id: 'swarm-start',
        label: 'Start Active Swarm',
        description: activeSwarm ? `Start ${activeSwarm.name}` : 'No active swarm',
        icon: <Play size={18} />,
        action: async () => {
          if (!activeSwarm) {
            addToast('error', 'No active swarm', 'Start a swarm first')
            return
          }
          try {
            const info = await api.swarm.startSwarm(activeSwarm.id)
            setActiveSwarm(swarmInfoToSwarm(info))
            addToast('success', 'Swarm started', activeSwarm.name)
          } catch (err) {
            addToast('error', 'Failed to start swarm', err instanceof Error ? err.message : 'Unknown error')
          }
        },
        category: 'swarm',
      },
      {
        id: 'swarm-stop',
        label: 'Stop Active Swarm',
        description: activeSwarm ? `Stop ${activeSwarm.name}` : 'No active swarm',
        icon: <Square size={18} />,
        action: async () => {
          if (!activeSwarm) {
            addToast('error', 'No active swarm', 'Stop a swarm first')
            return
          }
          try {
            const info = await api.swarm.stopSwarm(activeSwarm.id)
            setActiveSwarm(swarmInfoToSwarm(info))
            addToast('success', 'Swarm stopped', activeSwarm.name)
          } catch (err) {
            addToast('error', 'Failed to stop swarm', err instanceof Error ? err.message : 'Unknown error')
          }
        },
        category: 'swarm',
      },
      // Editor settings commands
      {
        id: 'toggle-minimap', label: 'Toggle Minimap', description: 'Show or hide the code minimap', icon: <List size={18} />, action: () => { window.dispatchEvent(new CustomEvent('toggle-editor-setting', { detail: { setting: 'minimap' } })) }, category: 'settings',
      },
      { id: 'toggle-word-wrap', label: 'Toggle Word Wrap', description: 'Enable or disable word wrap', icon: <Code size={18} />, action: () => { window.dispatchEvent(new CustomEvent('toggle-editor-setting', { detail: { setting: 'wordWrap' } })) }, category: 'settings' },
      { id: 'toggle-line-numbers', label: 'Toggle Line Numbers', description: 'Show or hide line numbers', icon: <Hash size={18} />, action: () => { window.dispatchEvent(new CustomEvent('toggle-editor-setting', { detail: { setting: 'lineNumbers' } })) }, category: 'settings' },
      { id: 'toggle-bracket-pair-colorization', label: 'Toggle Bracket Pair Colorization', description: 'Colorize matching brackets', icon: <Braces size={18} />, action: () => { window.dispatchEvent(new CustomEvent('toggle-editor-setting', { detail: { setting: 'bracketPairColorization' } })) }, category: 'settings' },
      { id: 'toggle-sticky-scroll', label: 'Toggle Sticky Scroll', description: 'Pin scope headers at the top while scrolling', icon: <AlignVerticalSpaceAround size={18} />, action: () => { window.dispatchEvent(new CustomEvent('toggle-editor-setting', { detail: { setting: 'stickyScroll' } })) }, category: 'settings' },
      { id: 'toggle-indent-guides', label: 'Toggle Indent Guides', description: 'Show indentation guides', icon: <Indent size={18} />, action: () => { window.dispatchEvent(new CustomEvent('toggle-editor-setting', { detail: { setting: 'indentGuides' } })) }, category: 'settings' },
      { id: 'toggle-render-whitespace', label: 'Toggle Render Whitespace', description: 'Cycle whitespace rendering mode', icon: <Eye size={18} />, action: () => { window.dispatchEvent(new CustomEvent('toggle-editor-setting', { detail: { setting: 'renderWhitespace' } })) }, category: 'settings' },
      { id: 'toggle-smooth-scrolling', label: 'Toggle Smooth Scrolling', description: 'Enable or disable smooth scrolling', icon: <ChevronsUpDown size={18} />, action: () => { window.dispatchEvent(new CustomEvent('toggle-editor-setting', { detail: { setting: 'smoothScrolling' } })) }, category: 'settings' },
      { id: 'toggle-linked-editing', label: 'Toggle Linked Editing', description: 'Auto-edit matching HTML/XML tags', icon: <Link size={18} />, action: () => { window.dispatchEvent(new CustomEvent('toggle-editor-setting', { detail: { setting: 'linkedEditing' } })) }, category: 'settings' },
      { id: 'toggle-inlay-hints', label: 'Toggle Inlay Hints', description: 'Show type annotations and parameter names inline', icon: <Type size={18} />, action: () => { window.dispatchEvent(new CustomEvent('toggle-editor-setting', { detail: { setting: 'inlayHints' } })) }, category: 'settings' },
      { id: 'toggle-breadcrumbs', label: 'Toggle Breadcrumbs', description: 'Show file path and symbol navigation bar', icon: <Hash size={18} />, action: () => { window.dispatchEvent(new CustomEvent('toggle-editor-setting', { detail: { setting: 'breadcrumbs' } })) }, category: 'settings' },
      { id: 'toggle-zen-mode', label: 'Toggle Zen Mode', description: 'Distraction-free editing (hides all panels)', icon: <Square size={18} />, action: () => { window.dispatchEvent(new CustomEvent('toggle-zen-mode')) }, category: 'view', shortcut: 'Ctrl+K Z' },
      { id: 'toggle-color-theme', label: 'Toggle Color Theme', description: 'Switch between dark and light themes', icon: <Sun size={18} />, action: () => { window.dispatchEvent(new CustomEvent('toggle-theme')) }, category: 'view', shortcut: 'Ctrl+K Ctrl+T' },
      { id: 'increase-font-size', label: 'Increase Font Size', description: 'Make editor text larger', icon: <Type size={18} />, action: () => { window.dispatchEvent(new CustomEvent('adjust-font-size', { detail: { delta: 2 } })) }, category: 'settings', shortcut: 'Ctrl+=' },
      { id: 'decrease-font-size', label: 'Decrease Font Size', description: 'Make editor text smaller', icon: <Type size={18} />, action: () => { window.dispatchEvent(new CustomEvent('adjust-font-size', { detail: { delta: -2 } })) }, category: 'settings', shortcut: 'Ctrl+-' },
      { id: 'reset-font-size', label: 'Reset Font Size', description: 'Reset editor font size to default', icon: <RotateCcw size={18} />, action: () => { window.dispatchEvent(new CustomEvent('reset-font-size')) }, category: 'settings', shortcut: 'Ctrl+0' },
      // Tab management
      { id: 'close-all-tabs', label: 'Close All Tabs', description: 'Close all open editor tabs', icon: <X size={18} />, action: () => { window.dispatchEvent(new CustomEvent('close-all-tabs')) }, category: 'navigation' },
      { id: 'close-to-right', label: 'Close Tabs to Right', description: 'Close all tabs to the right of the active tab', icon: <ChevronRight size={18} />, action: () => { window.dispatchEvent(new CustomEvent('close-to-right')) }, category: 'navigation' },
      { id: 'close-saved-tabs', label: 'Close Saved Tabs', description: 'Close all saved (non-dirty) editor tabs', icon: <X size={18} />, action: () => { window.dispatchEvent(new CustomEvent('close-saved-tabs')) }, category: 'navigation' },
      { id: 'close-other-tabs', label: 'Close Other Tabs', description: 'Close all editor tabs except the active one', icon: <X size={18} />, action: () => { window.dispatchEvent(new CustomEvent('close-other-tabs')) }, category: 'navigation' },
      { id: 'pin-tab', label: 'Pin Tab', description: 'Pin the active editor tab', icon: <Pin size={18} />, action: () => { window.dispatchEvent(new CustomEvent('pin-current-tab')) }, category: 'navigation' },
      { id: 'new-file', label: 'New File', description: 'Create a new untitled file', icon: <Plus size={18} />, action: () => { window.dispatchEvent(new CustomEvent('new-file')) }, category: 'navigation' },
      { id: 'open-file', label: 'Open File...', description: 'Open a file from disk', icon: <Files size={18} />, action: () => { window.dispatchEvent(new CustomEvent('open-file')) }, category: 'navigation', shortcut: 'Ctrl+O' },
      { id: 'open-folder', label: 'Open Folder...', description: 'Open a folder as workspace', icon: <Files size={18} />, action: () => { window.dispatchEvent(new CustomEvent('open-folder')) }, category: 'navigation', shortcut: 'Ctrl+K Ctrl+O' },
      { id: 'go-to-file', label: 'Go to File...', description: 'Quick file navigation', icon: <Files size={18} />, action: () => { window.dispatchEvent(new CustomEvent('go-to-file')) }, category: 'navigation', shortcut: 'Ctrl+P' },
      { id: 'go-to-line', label: 'Go to Line...', description: 'Jump to a specific line number', icon: <Hash size={18} />, action: () => { window.dispatchEvent(new CustomEvent('go-to-line')) }, category: 'navigation', shortcut: 'Ctrl+G' },
      { id: 'find-in-files', label: 'Find in Files', description: 'Search across all files', icon: <Search size={18} />, action: () => { window.dispatchEvent(new CustomEvent('find-in-files')) }, category: 'navigation', shortcut: 'Ctrl+Shift+F' },
      { id: 'replace-in-files', label: 'Replace in Files', description: 'Search and replace across all files', icon: <Replace size={18} />, action: () => { window.dispatchEvent(new CustomEvent('replace-in-files')) }, category: 'navigation', shortcut: 'Ctrl+Shift+H' },
      { id: 'save', label: 'Save', description: 'Save the current file', icon: <Save size={18} />, action: () => { window.dispatchEvent(new CustomEvent('save-file')) }, category: 'navigation', shortcut: 'Ctrl+S' },
      { id: 'save-all', label: 'Save All', description: 'Save all open files with unsaved changes', icon: <Save size={18} />, action: () => { window.dispatchEvent(new CustomEvent('save-all')) }, category: 'navigation', shortcut: 'Ctrl+K S' },
      { id: 'format-document', label: 'Format Document', description: 'Format the current file using the editor formatter', icon: <Braces size={18} />, action: () => { window.dispatchEvent(new CustomEvent('format-document')) }, category: 'settings', shortcut: 'Shift+Alt+F' },
      // Panel toggle commands
      { id: 'toggle-sidebar', label: 'Toggle Sidebar', description: 'Show or hide the file explorer', icon: <List size={18} />, action: () => { window.dispatchEvent(new CustomEvent('toggle-sidebar')) }, category: 'navigation', shortcut: 'Ctrl+B' },
      { id: 'toggle-terminal', label: 'Toggle Terminal', description: 'Show or hide the terminal panel', icon: <Code size={18} />, action: () => { window.dispatchEvent(new CustomEvent('toggle-terminal')) }, category: 'navigation', shortcut: 'Ctrl+~' },
      { id: 'show-problems', label: 'Show Problems', description: 'Show the Problems panel', icon: <AlertCircle size={18} />, action: () => { window.dispatchEvent(new CustomEvent('show-problems')) }, category: 'navigation', shortcut: 'Ctrl+Shift+M' },
      { id: 'split-editor', label: 'Split Editor Right', description: 'Split the editor into two side-by-side panes', icon: <Columns size={18} />, action: () => { window.dispatchEvent(new CustomEvent('toggle-split')) }, category: 'navigation', shortcut: 'Ctrl+\\' },
      { id: 'close-split', label: 'Close Split Editor', description: 'Return to single editor pane', icon: <Columns size={18} />, action: () => { window.dispatchEvent(new CustomEvent('close-split')) }, category: 'navigation' },
      { id: 'toggle-bottom-panel', label: 'Toggle Bottom Panel', description: 'Show or hide the bottom panel', icon: <AlignVerticalSpaceAround size={18} />, action: () => { window.dispatchEvent(new CustomEvent('toggle-bottom-panel')) }, category: 'view', shortcut: 'Ctrl+J' },
      { id: 'toggle-output', label: 'Toggle Output Panel', description: 'Show or hide the output panel', icon: <Archive size={18} />, action: () => { window.dispatchEvent(new CustomEvent('toggle-output')) }, category: 'view', shortcut: 'Ctrl+Shift+U' },
      { id: 'toggle-debug-console', label: 'Toggle Debug Console', description: 'Show or hide the debug console', icon: <Zap size={18} />, action: () => { window.dispatchEvent(new CustomEvent('toggle-debug-console')) }, category: 'view', shortcut: 'Ctrl+Shift+Y' },
      { id: 'fold-all', label: 'Fold All', description: 'Collapse all code regions', icon: <ChevronRight size={18} />, action: () => { window.dispatchEvent(new CustomEvent('fold-all')) }, category: 'settings', shortcut: 'Ctrl+K Ctrl+0' },
      { id: 'unfold-all', label: 'Unfold All', description: 'Expand all code regions', icon: <ChevronRight size={18} />, action: () => { window.dispatchEvent(new CustomEvent('unfold-all')) }, category: 'settings', shortcut: 'Ctrl+K Ctrl+J' },
      { id: 'navigate-back', label: 'Go Back', description: 'Navigate to previous location in history', icon: <ArrowLeft size={18} />, action: () => { window.history.back() }, category: 'navigation', shortcut: 'Ctrl+Alt+←' },
      { id: 'navigate-forward', label: 'Go Forward', description: 'Navigate to next location in history', icon: <ArrowRight size={18} />, action: () => { window.history.forward() }, category: 'navigation', shortcut: 'Ctrl+Alt+→' },
      { id: 'focus-group-1', label: 'Focus First Editor Group', description: 'Switch focus to the first editor pane', icon: <Layers size={18} />, action: () => { window.dispatchEvent(new CustomEvent('focus-editor-group', { detail: { group: 1 } })) }, category: 'navigation', shortcut: 'Ctrl+1' },
      { id: 'focus-group-2', label: 'Focus Second Editor Group', description: 'Switch focus to the second editor pane (split mode)', icon: <Layers size={18} />, action: () => { window.dispatchEvent(new CustomEvent('focus-editor-group', { detail: { group: 2 } })) }, category: 'navigation', shortcut: 'Ctrl+2' },
      { id: 'accessibility-help', label: 'Accessibility Help', description: 'Show keyboard shortcuts reference', icon: <Keyboard size={18} />, action: () => { window.dispatchEvent(new CustomEvent('open-accessibility-help')) }, category: 'navigation', shortcut: 'Alt+F1' },
      { id: 'open-diff', label: 'Open Diff', description: 'Open diff view for the current file (HEAD vs Working Tree)', icon: <GitCompare size={18} />, action: () => { window.dispatchEvent(new CustomEvent('open-diff')) }, category: 'navigation' },
      // Git commands
      { id: 'git-push', label: 'Git: Push', description: 'Push current branch to remote', icon: <Upload size={18} />, action: async () => { try { const branch = await gitApi.getBranch(); const result = await gitApi.push('origin', branch); useAppStore.getState().addToast('success', 'Pushed', result.output.slice(0, 80)) } catch (err) { useAppStore.getState().addToast('error', 'Push failed', err instanceof Error ? err.message : 'Unknown') } }, category: 'settings' },
      { id: 'git-pull', label: 'Git: Pull', description: 'Pull from remote', icon: <Download size={18} />, action: async () => { try { const branch = await gitApi.getBranch(); const result = await gitApi.pull('origin', branch); useAppStore.getState().addToast('success', 'Pulled', result.output.slice(0, 80)); window.dispatchEvent(new CustomEvent('refresh-git-status')) } catch (err) { useAppStore.getState().addToast('error', 'Pull failed', err instanceof Error ? err.message : 'Unknown') } }, category: 'settings' },
      { id: 'git-stash', label: 'Git: Stash', description: 'Stash current working changes', icon: <Archive size={18} />, action: async () => { try { await gitApi.stash(); useAppStore.getState().addToast('info', 'Stashed', 'Working changes stashed') } catch (err) { useAppStore.getState().addToast('error', 'Stash failed', err instanceof Error ? err.message : 'Unknown') } }, category: 'settings' },
      { id: 'git-stash-pop', label: 'Git: Stash Pop', description: 'Restore most recent stash', icon: <Archive size={18} />, action: async () => { try { await gitApi.stashPop(); useAppStore.getState().addToast('info', 'Stash popped', 'Stashed changes restored') } catch (err) { useAppStore.getState().addToast('error', 'Stash pop failed', err instanceof Error ? err.message : 'Unknown') } }, category: 'settings' },
      { id: 'git-undo-commit', label: 'Git: Undo Last Commit', description: 'Soft reset to previous commit', icon: <Undo2 size={18} />, action: async () => { try { await gitApi.undoCommit(); useAppStore.getState().addToast('info', 'Commit undone', 'Last commit moved to staged changes') } catch (err) { useAppStore.getState().addToast('error', 'Undo failed', err instanceof Error ? err.message : 'Unknown') } }, category: 'settings' },
      { id: 'git-show-source-control', label: 'Git: Show Source Control', description: 'Show Source Control panel', icon: <GitBranch size={18} />, action: () => { window.dispatchEvent(new CustomEvent('toggle-source-control')) }, category: 'settings', shortcut: 'Ctrl+Shift+G' },
      { id: 'git-checkout', label: 'Git: Checkout...', description: 'Switch branches or restore files', icon: <GitBranch size={18} />, action: () => { window.dispatchEvent(new CustomEvent('git-checkout')) }, category: 'settings' },
      // R5175: Missing navigation commands
      { id: 'go-to-symbol', label: 'Go to Symbol in File...', description: 'Jump to a symbol in the current file', icon: <Code size={18} />, action: () => { setIsOpen(true); setIsQuickOpen(true); setQuery('@') }, category: 'navigation' },
      { id: 'go-to-symbol-workspace', label: 'Go to Symbol in Workspace...', description: 'Search for symbols across the entire workspace', icon: <Search size={18} />, action: () => { setIsOpen(true); setIsQuickOpen(true); setQuery('#') }, category: 'navigation' },
      // R5175: Missing tab commands
      { id: 'close-tab', label: 'Close Tab', description: 'Close the current tab', icon: <X size={18} />, action: () => { window.dispatchEvent(new CustomEvent('close-current-tab')) }, category: 'navigation', shortcut: 'Ctrl+W' },
      // Tab navigation
      { id: 'next-tab', label: 'Next Tab', description: 'Switch to the next tab', icon: <ArrowRight size={18} />, action: () => { const store = useWorkspaceStore.getState(); const files = store.openFiles; const cur = store.currentFile; if (!cur || files.length <= 1) return; const idx = files.indexOf(cur); if (idx === -1 || idx >= files.length - 1) return; store.openFile(files[idx + 1]).catch((e) => { logger.warn('CommandPalette', 'Failed to open next tab', e) }) }, category: 'navigation', shortcut: 'Ctrl+PageDown' },
      { id: 'prev-tab', label: 'Previous Tab', description: 'Switch to the previous tab', icon: <ArrowLeft size={18} />, action: () => { const store = useWorkspaceStore.getState(); const files = store.openFiles; const cur = store.currentFile; if (!cur || files.length <= 1) return; const idx = files.indexOf(cur); if (idx === -1 || idx <= 0) return; store.openFile(files[idx - 1]).catch((e) => { logger.warn('CommandPalette', 'Failed to open prev tab', e) }) }, category: 'navigation', shortcut: 'Ctrl+PageUp' },
      { id: 'reopen-closed-tab', label: 'Reopen Closed Tab', description: 'Reopen the last closed tab', icon: <RotateCcw size={18} />, action: () => { useWorkspaceStore.getState().undoCloseFile().catch((e) => { logger.warn('CommandPalette', 'Failed to reopen tab', e) }) }, category: 'navigation', shortcut: 'Ctrl+Shift+T' },
      { id: 'reveal-active-file', label: 'Reveal Active File in Explorer', description: 'Show the current file in the file tree', icon: <Files size={18} />, action: () => { window.dispatchEvent(new CustomEvent('reveal-active-file')) }, category: 'navigation' },
      // Copy Path commands
      { id: 'copy-path', label: 'Copy Path', description: 'Copy the absolute path of the active file', icon: <Clipboard size={18} />, action: () => { const currentFile = useWorkspaceStore.getState().currentFile; if (currentFile) { navigator.clipboard.writeText(currentFile); addToast('success', 'Copied', currentFile) } else { addToast('error', 'No file open', 'Open a file first') } }, category: 'navigation', shortcut: 'Ctrl+K P' },
      { id: 'copy-relative-path', label: 'Copy Relative Path', description: 'Copy the path relative to workspace root', icon: <ClipboardCopy size={18} />, action: () => { const { currentFile, workspacePath } = useWorkspaceStore.getState(); if (!currentFile) { addToast('error', 'No file open', 'Open a file first'); return } if (!workspacePath) { addToast('error', 'No workspace', 'Open a folder first'); return } const relativePath = currentFile.startsWith(workspacePath) ? currentFile.slice(workspacePath.length).replace(/^\/+/, '') : currentFile; navigator.clipboard.writeText(relativePath); addToast('success', 'Copied', relativePath) }, category: 'navigation', shortcut: 'Ctrl+K Ctrl+P' },
      { id: 'toggle-full-screen', label: 'Toggle Full Screen', description: document.fullscreenElement ? 'Exit full screen mode' : 'Enter full screen mode', icon: document.fullscreenElement ? <Minimize size={18} /> : <Maximize size={18} />, action: () => { if (document.fullscreenElement) { document.exitFullscreen() } else { document.documentElement.requestFullscreen() } }, category: 'view', shortcut: 'F11' },
      { id: 'close-window', label: 'Close Window', description: 'Close the current window', icon: <XCircle size={18} />, action: () => { window.close(); addToast('info', 'Close Window', 'Use browser controls to close this tab') }, category: 'navigation', shortcut: 'Ctrl+Shift+W' },
      { id: 'select-all', label: 'Select All', description: 'Select all content in the editor', icon: <List size={18} />, action: () => { window.dispatchEvent(new CustomEvent('select-all')) }, category: 'editing', shortcut: 'Ctrl+A' },
      { id: 'revert-file', label: 'Revert File', description: 'Discard all unsaved changes and reload from disk', icon: <FileDown size={18} />, action: () => { window.dispatchEvent(new CustomEvent('revert-file')) }, category: 'navigation' },
      { id: 'reload-window', label: 'Reload Window', description: 'Reload the editor (clears in-memory state)', icon: <RefreshCw size={18} />, action: () => { location.reload() }, category: 'navigation', shortcut: 'Ctrl+Shift+R' },
      // R5174: VS Code editing commands — Monaco built-in actions
      { id: 'toggle-line-comment', label: 'Toggle Line Comment', description: 'Comment or uncomment the current line', icon: <Code size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.commentLine' } })) }, category: 'editing', shortcut: 'Ctrl+/' },
      { id: 'toggle-block-comment', label: 'Toggle Block Comment', description: 'Toggle block comment around selection', icon: <Code size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.blockComment' } })) }, category: 'editing', shortcut: 'Shift+Alt+A' },
      { id: 'find-replace', label: 'Find and Replace', description: 'Open find and replace widget', icon: <Search size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.startFindReplaceAction' } })) }, category: 'editing', shortcut: 'Ctrl+H' },
      { id: 'move-line-up', label: 'Move Line Up', description: 'Move the current line up', icon: <ArrowUp size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.moveLinesUpAction' } })) }, category: 'editing', shortcut: 'Alt+↑' },
      { id: 'move-line-down', label: 'Move Line Down', description: 'Move the current line down', icon: <ArrowDown size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.moveLinesDownAction' } })) }, category: 'editing', shortcut: 'Alt+↓' },
      { id: 'copy-line-up', label: 'Copy Line Up', description: 'Duplicate the current line above', icon: <ArrowUp size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.copyLinesUpAction' } })) }, category: 'editing', shortcut: 'Shift+Alt+↑' },
      { id: 'copy-line-down', label: 'Copy Line Down', description: 'Duplicate the current line below', icon: <ArrowDown size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.copyLinesDownAction' } })) }, category: 'editing', shortcut: 'Shift+Alt+↓' },
      { id: 'delete-line', label: 'Delete Line', description: 'Delete the current line', icon: <X size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.deleteLines' } })) }, category: 'editing', shortcut: 'Ctrl+Shift+K' },
      { id: 'insert-line-below', label: 'Insert Line Below', description: 'Insert a new line below the cursor', icon: <Plus size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.insertLineAfter' } })) }, category: 'editing', shortcut: 'Ctrl+Enter' },
      { id: 'insert-line-above', label: 'Insert Line Above', description: 'Insert a new line above the cursor', icon: <Plus size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.insertLineBefore' } })) }, category: 'editing', shortcut: 'Ctrl+Shift+Enter' },
      { id: 'join-lines', label: 'Join Lines', description: 'Join the current line with the line below', icon: <Link size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.joinLines' } })) }, category: 'editing' },
      { id: 'trim-trailing-whitespace', label: 'Trim Trailing Whitespace', description: 'Remove trailing whitespace from all lines', icon: <Filter size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.trimTrailingWhitespace' } })) }, category: 'editing' },
      { id: 'sort-lines-ascending', label: 'Sort Lines Ascending', description: 'Sort selected lines in ascending order', icon: <ArrowRight size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.sortLinesAscending' } })) }, category: 'editing' },
      { id: 'sort-lines-descending', label: 'Sort Lines Descending', description: 'Sort selected lines in descending order', icon: <ArrowLeft size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.sortLinesDescending' } })) }, category: 'editing' },
      { id: 'organize-imports', label: 'Organize Imports', description: 'Sort and clean up import statements', icon: <Braces size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.organizeImports' } })) }, category: 'editing' },
      { id: 'transform-uppercase', label: 'Transform to Uppercase', description: 'Convert selection to uppercase', icon: <Type size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.transformToUppercase' } })) }, category: 'editing' },
      { id: 'transform-lowercase', label: 'Transform to Lowercase', description: 'Convert selection to lowercase', icon: <Type size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.transformToLowercase' } })) }, category: 'editing' },
      { id: 'go-to-definition', label: 'Go to Definition', description: 'Navigate to the definition of the symbol under cursor', icon: <ArrowRight size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.revealDefinition' } })) }, category: 'navigation', shortcut: 'F12' },
      { id: 'go-to-type-definition', label: 'Go to Type Definition', description: 'Navigate to the type definition of the symbol under cursor', icon: <Type size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.revealTypeDefinition' } })) }, category: 'navigation' },
      { id: 'go-to-implementation', label: 'Go to Implementation', description: 'Navigate to the implementation of the symbol under cursor', icon: <Code size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.goToImplementation' } })) }, category: 'navigation' },
      { id: 'go-to-references', label: 'Go to References', description: 'Find all references to the symbol under cursor', icon: <Search size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.referenceSearch.trigger' } })) }, category: 'navigation', shortcut: 'Shift+F12' },
      { id: 'peek-definition', label: 'Peek Definition', description: 'Show definition in a peek overlay without navigating away', icon: <Eye size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.peekDefinition' } })) }, category: 'navigation', shortcut: 'Alt+F12' },
      { id: 'rename-symbol', label: 'Rename Symbol', description: 'Rename the symbol under cursor across the project', icon: <TextCursorInput size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.rename' } })) }, category: 'editing', shortcut: 'F2' },
      { id: 'add-cursor-above', label: 'Add Cursor Above', description: 'Insert a new cursor above the current line', icon: <ArrowUp size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.insertCursorAbove' } })) }, category: 'editing', shortcut: 'Ctrl+Alt+↑' },
      { id: 'add-cursor-below', label: 'Add Cursor Below', description: 'Insert a new cursor below the current line', icon: <ArrowDown size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.insertCursorBelow' } })) }, category: 'editing', shortcut: 'Ctrl+Alt+↓' },
      { id: 'cursor-undo', label: 'Cursor Undo', description: 'Undo the last cursor position change', icon: <Undo2 size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.cursorUndo' } })) }, category: 'editing', shortcut: 'Ctrl+U' },
      { id: 'expand-selection', label: 'Expand Selection', description: 'Expand selection to the next enclosing scope', icon: <Maximize size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.smartSelect.expand' } })) }, category: 'editing', shortcut: 'Shift+Alt+→' },
      { id: 'shrink-selection', label: 'Shrink Selection', description: 'Shrink selection to the previous enclosing scope', icon: <Minimize size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.smartSelect.shrink' } })) }, category: 'editing', shortcut: 'Shift+Alt+←' },
      { id: 'cursor-top', label: 'Cursor to Top', description: 'Move cursor to the beginning of the file', icon: <ArrowUp size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'cursorTop' } })) }, category: 'navigation' },
      { id: 'cursor-bottom', label: 'Cursor to Bottom', description: 'Move cursor to the end of the file', icon: <ArrowDown size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'cursorBottom' } })) }, category: 'navigation' },
      { id: 'scroll-to-top', label: 'Scroll to Top', description: 'Scroll the editor to the top', icon: <ArrowUp size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.scrollToTop' } })) }, category: 'navigation' },
      { id: 'scroll-to-bottom', label: 'Scroll to Bottom', description: 'Scroll the editor to the bottom', icon: <ArrowDown size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.scrollToBottom' } })) }, category: 'navigation' },
      { id: 'editor-undo', label: 'Undo', description: 'Undo the last edit', icon: <Undo2 size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'undo' } })) }, category: 'editing', shortcut: 'Ctrl+Z' },
      { id: 'editor-redo', label: 'Redo', description: 'Redo the last undone edit', icon: <RotateCcw size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'redo' } })) }, category: 'editing', shortcut: 'Ctrl+Shift+Z' },
      { id: 'editor-cut', label: 'Cut', description: 'Cut the selection to clipboard', icon: <Clipboard size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.clipboardCutAction' } })) }, category: 'editing' },
      { id: 'editor-copy', label: 'Copy', description: 'Copy the selection to clipboard', icon: <ClipboardCopy size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.clipboardCopyAction' } })) }, category: 'editing' },
      { id: 'editor-paste', label: 'Paste', description: 'Paste from clipboard', icon: <Clipboard size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.clipboardPasteAction' } })) }, category: 'editing' },
      { id: 'indent-lines', label: 'Indent Line', description: 'Indent the current line', icon: <Indent size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.indent' } })) }, category: 'editing' },
      { id: 'outdent-lines', label: 'Outdent Line', description: 'Outdent the current line', icon: <Indent size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.outdent' } })) }, category: 'editing' },
      { id: 'format-selection', label: 'Format Selection', description: 'Format the selected text', icon: <Braces size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.formatSelection' } })) }, category: 'editing' },
      { id: 'transpose', label: 'Transpose Characters', description: 'Swap characters around the cursor', icon: <Zap size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.transposeLetters' } })) }, category: 'editing' },
      { id: 'toggle-match-case', label: 'Toggle Match Case', description: 'Toggle case sensitivity in search', icon: <CaseSensitive size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.toggleFindCaseSensitive' } })) }, category: 'editing' },
      { id: 'toggle-whole-word', label: 'Toggle Whole Word Match', description: 'Toggle whole word matching in search', icon: <WholeWord size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.toggleFindWholeWord' } })) }, category: 'editing' },
      { id: 'toggle-regex', label: 'Toggle Regex Search', description: 'Toggle regular expression mode in search', icon: <Regex size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.toggleFindRegex' } })) }, category: 'editing' },
      // R5174c: Discoverability — Monaco actions with keybindings but no palette entry
      { id: 'quick-fix', label: 'Quick Fix', description: 'Show code actions / lightbulb at cursor', icon: <Lightbulb size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.quickFix' } })) }, category: 'editing', shortcut: 'Ctrl+.' },
      { id: 'find-next', label: 'Find Next', description: 'Go to the next find match', icon: <ArrowDown size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.nextMatchFindAction' } })) }, category: 'editing', shortcut: 'F3' },
      { id: 'find-previous', label: 'Find Previous', description: 'Go to the previous find match', icon: <ArrowUp size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.previousMatchFindAction' } })) }, category: 'editing', shortcut: 'Shift+F3' },
      { id: 'add-selection-next-find-match', label: 'Add Selection to Next Find Match', description: 'Select next occurrence (Ctrl+D)', icon: <Highlighter size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.addSelectionToNextFindMatch' } })) }, category: 'editing', shortcut: 'Ctrl+D' },
      { id: 'select-all-highlights', label: 'Select All Occurrences of Find Match', description: 'Select all occurrences of current word', icon: <Highlighter size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.selectHighlights' } })) }, category: 'editing', shortcut: 'Ctrl+Shift+L' },
      { id: 'add-cursors-to-line-ends', label: 'Add Cursors to Line Ends', description: 'Add cursors at end of each selected line', icon: <TextCursorInput size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.addCursorsToLineEnds' } })) }, category: 'editing', shortcut: 'Shift+Alt+I' },
      { id: 'select-line', label: 'Select Line', description: 'Select the entire current line', icon: <TextCursorInput size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.expandLineSelection' } })) }, category: 'editing', shortcut: 'Ctrl+L' },
      { id: 'jump-to-matching-bracket', label: 'Jump to Matching Bracket', description: 'Navigate between brackets', icon: <Braces size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.jumpToBracket' } })) }, category: 'navigation', shortcut: 'Ctrl+Shift+\\' },
      { id: 'select-to-bracket', label: 'Select to Bracket', description: 'Select text between matching brackets', icon: <Braces size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.selectToBracket' } })) }, category: 'editing', shortcut: 'Ctrl+Shift+Alt+\\' },
      { id: 'fold-region', label: 'Fold', description: 'Fold the code region at cursor', icon: <ChevronRight size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.fold' } })) }, category: 'settings', shortcut: 'Ctrl+Shift+[' },
      { id: 'unfold-region', label: 'Unfold', description: 'Unfold the code region at cursor', icon: <ChevronDown size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.unfold' } })) }, category: 'settings', shortcut: 'Ctrl+Shift+]' },
      { id: 'fold-recursively', label: 'Fold Recursively', description: 'Fold all nested regions', icon: <ChevronRight size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.foldRecursively' } })) }, category: 'settings', shortcut: 'Ctrl+K Ctrl+[' },
      { id: 'unfold-recursively', label: 'Unfold Recursively', description: 'Unfold all nested regions', icon: <ChevronDown size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.unfoldRecursively' } })) }, category: 'settings', shortcut: 'Ctrl+K Ctrl+]' },
      { id: 'go-to-next-error', label: 'Go to Next Error', description: 'Navigate to the next error or warning', icon: <StepForward size={18} />, action: () => { window.dispatchEvent(new CustomEvent('navigate-next-problem')) }, category: 'navigation', shortcut: 'F8' },
      { id: 'go-to-previous-error', label: 'Go to Previous Error', description: 'Navigate to the previous error or warning', icon: <StepBack size={18} />, action: () => { window.dispatchEvent(new CustomEvent('navigate-previous-problem')) }, category: 'navigation', shortcut: 'Shift+F8' },
      { id: 'change-all-occurrences', label: 'Change All Occurrences', description: 'Select all occurrences and start typing replacement', icon: <Replace size={18} />, action: () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId: 'editor.action.selectHighlights' } })) }, category: 'editing', shortcut: 'Ctrl+F2' },
    ]

    // Add agent commands
    agents.forEach((agent) => {
      const isRunning = agent.state === 'executing' || agent.state === 'thinking'
      cmds.push({
        id: `agent-${agent.id}-${isRunning ? 'stop' : 'start'}`,
        label: `${isRunning ? 'Stop' : 'Start'} Agent: ${agent.name}`,
        description: `${isRunning ? 'Stop' : 'Start'} ${agent.type} agent`,
        icon: isRunning ? <Pause size={18} /> : <Play size={18} />,
        action: () => {
          if (isRunning) {
            stopAgent(agent.id)
          } else {
            startAgent(agent.id)
          }
        },
        category: 'agent',
      })
    })

    return cmds
  }, [navigate, agents, activeSwarm, setActiveSwarm, startAgent, stopAgent, addToast])

  // Derive mode from query
  const isCommandMode = query.startsWith('>')
  const commandQuery = isCommandMode ? query.slice(1) : ''
  // Reserved prefixes in Quick Open: > commands, @ file symbols, # workspace symbols, : goto line
  const isGoToLine = isQuickOpen && query.startsWith(':') && query.length > 1
  const isSymbolMode = isQuickOpen && query.startsWith('@')
  const isWorkspaceSymbolMode = isQuickOpen && query.startsWith('#')
  const hasReservedPrefix = isSymbolMode || isWorkspaceSymbolMode || query.startsWith(':')
  const isFileMode = isQuickOpen && !isCommandMode && !hasReservedPrefix

  // Filter files from workspace for Quick Open (Ctrl+P)
  const fileTree = useWorkspaceStore((s) => s.fileTree)
  const openFile = useWorkspaceStore((s) => s.openFile)
  const mruOrder = useWorkspaceStore((s) => s.mruOrder)
  const workspacePath = useWorkspaceStore((s) => s.workspacePath)

  // Cache flattened file list — only recompute when fileTree changes
  const allFiles = useMemo(() => flattenFileTree(fileTree), [fileTree])

  const filteredFiles = useMemo(() => {
    // In file mode with no query: show MRU (recently opened files) — VS Code pattern
    if (isFileMode && query.length === 0) {
      return mruOrder.slice(0, 15).map(path => {
        const name = path.split('/').pop() || path
        return { name, path, score: 0, nameIndices: [], pathIndices: [] }
      })
    }
    // In file mode with query: fuzzy search all files
    if (isFileMode) {
      return allFiles
        .map((f) => {
          const nameScore = fuzzyScore(query, f.name)
          const pathScore = fuzzyScore(query, f.path)
          const useName = nameScore >= pathScore
          return {
            ...f,
            score: Math.max(nameScore, pathScore),
            nameIndices: useName ? getFuzzyMatchIndices(query, f.name) : [],
            pathIndices: useName ? getFuzzyMatchIndices(query, f.path) : getFuzzyMatchIndices(query, f.path),
          }
        })
        .filter((f) => f.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 50)
    }
    return []
  }, [isFileMode, query, allFiles, mruOrder])

  // Go to Symbol (@ prefix) — fetch LSP document symbols for current file
  const currentFile = useWorkspaceStore((s) => s.currentFile)
  const [docSymbols, setDocSymbols] = useState<Array<{ name: string; kind: number; detail?: string; line: number; column: number }>>([])
  const [symbolsLoading, setSymbolsLoading] = useState(false)

  // Fetch symbols when in symbol mode - this is a legitimate data-fetching effect
  useEffect(() => {
    // Reset state when leaving symbol mode or changing file
    // This is intentional: we clear cached symbols when the mode/file changes
    if (!isSymbolMode || !currentFile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDocSymbols([])
      setSymbolsLoading(false)
      return
    }
    let cancelled = false
    setSymbolsLoading(true)
    lspApi.documentSymbols(currentFile).then(result => {
      if (cancelled) return
      // Flatten nested children into a flat list
      const flat: typeof docSymbols = []
      const walk = (symbols: unknown[], depth: number) => {
        for (const s of symbols) {
          const sym = s as { name: string; kind: number; detail?: string; range?: { start?: { line?: number; character?: number } }; children?: unknown[] }
          flat.push({ name: sym.name, kind: sym.kind, detail: sym.detail, line: sym.range?.start?.line ?? 0, column: sym.range?.start?.character ?? 0 })
          if (sym.children) walk(sym.children, depth + 1)
        }
      }
      walk(result.symbols || [], 0)
      setDocSymbols(flat)
      setSymbolsLoading(false)
    }).catch(() => {
      if (!cancelled) { setDocSymbols([]); setSymbolsLoading(false) }
      logger.debug('CommandPalette', 'document symbols failed')
    })
    return () => { cancelled = true }
  }, [isSymbolMode, currentFile])

  const filteredSymbols = useMemo(() => {
    if (!isSymbolMode) return []
    const search = query.slice(1).trim()
    if (!search) return docSymbols.slice(0, 30)
    return docSymbols
      .map(s => ({ ...s, score: fuzzyScore(search, s.name) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
  }, [isSymbolMode, query, docSymbols])

  // Go to Symbol in Workspace (# prefix) — search LSP workspace symbols
  const [workspaceSymbols, setWorkspaceSymbols] = useState<Array<{ name: string; kind: number; detail?: string; uri: string; line: number; column: number }>>([])
  const [workspaceSymbolsLoading, setWorkspaceSymbolsLoading] = useState(false)

  useEffect(() => {
    // Reset state when leaving workspace symbol mode - intentional state sync
    if (!isWorkspaceSymbolMode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWorkspaceSymbols([])
      setWorkspaceSymbolsLoading(false)
      return
    }
    const search = query.slice(1).trim()
    if (!search) {
      setWorkspaceSymbols([])
      return
    }
    let cancelled = false
    setWorkspaceSymbolsLoading(true)
    lspApi.workspaceSymbols(search).then(result => {
      if (cancelled) return
      const symbols = (result.symbols || []).map((s: { name: string; kind: number; detail?: string; location?: { uri: string; range?: { start?: { line?: number; character?: number } } } }) => ({
        name: s.name,
        kind: s.kind,
        detail: s.detail,
        uri: s.location?.uri || '',
        line: s.location?.range?.start?.line ?? 0,
        column: s.location?.range?.start?.character ?? 0,
      }))
      setWorkspaceSymbols(symbols.slice(0, 50))
      setWorkspaceSymbolsLoading(false)
    }).catch(() => {
      if (!cancelled) { setWorkspaceSymbols([]); setWorkspaceSymbolsLoading(false) }
      logger.debug('CommandPalette', 'workspace symbols failed')
    })
    return () => { cancelled = true }
  }, [isWorkspaceSymbolMode, query])

  const filteredWorkspaceSymbols = useMemo(() => {
    if (!isWorkspaceSymbolMode) return []
    // Already filtered by LSP query, just apply fuzzy scoring for ordering
    const search = query.slice(1).trim()
    return workspaceSymbols
      .map(s => ({ ...s, score: fuzzyScore(search, s.name) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
  }, [isWorkspaceSymbolMode, query, workspaceSymbols])

  // Filter commands based on query with fuzzy scoring
  const filteredCommands = useMemo(() => {
    if (!query) return commands
    if (isFileMode) return []
    const searchQuery = isCommandMode ? commandQuery : query
    if (!searchQuery) return commands
    return commands
      .map((cmd) => {
        const score = fuzzyScore(searchQuery, cmd.label)
        const descScore = cmd.description ? fuzzyScore(searchQuery, cmd.description) : -1
        return { cmd, score: Math.max(score, descScore) }
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.cmd)
  }, [commands, query, isCommandMode, commandQuery, isFileMode])

  // Unified items for rendering
  const filteredItems: PaletteItem[] = useMemo(() => {
    if (isFileMode) {
      const prefix = workspacePath ? workspacePath.replace(/\/$/, '') + '/' : ''
      return filteredFiles.map((f) => {
        const Icon = getFileIcon(f.name)
        const iconColor = getFileIconColor(f.name)
        const relativePath = prefix && f.path.startsWith(prefix) ? f.path.slice(prefix.length) : f.path
        return {
          id: f.path,
          label: highlightFuzzyMatch(f.name, f.nameIndices),
          description: highlightFuzzyMatch(relativePath, f.pathIndices),
          icon: <Icon size={16} className={iconColor} />,
          action: () => { openFile(f.path).catch((e) => { logger.warn('CommandPalette', `Failed to open ${f.path}`, e) }) },
          isFile: true,
          filePath: f.path,
        }
      })
    }
    if (isSymbolMode) {
      return filteredSymbols.map((s, i) => ({
        id: `symbol-${i}`,
        label: s.name,
        description: s.detail || `Line ${s.line + 1}`,
        icon: getSymbolIcon(s.kind),
        action: () => {
          if (currentFile) {
            document.dispatchEvent(new CustomEvent('goto-line-direct', { detail: { line: s.line + 1 } }))
          }
        },
      }))
    }
    if (isWorkspaceSymbolMode) {
      return filteredWorkspaceSymbols.map((s, i) => ({
        id: `ws-symbol-${i}`,
        label: s.name,
        description: s.uri ? `${decodeURIComponent(s.uri.replace(/^file:\/\//, '').split('/').pop() || '')} — Line ${s.line + 1}` : `Line ${s.line + 1}`,
        icon: getSymbolIcon(s.kind),
        action: () => {
          if (s.uri) {
            // Convert file:// URI to path
            const filePath = s.uri.replace(/^file:\/\//, '')
            openFile(decodeURIComponent(filePath)).catch((e) => { logger.warn('CommandPalette', `Failed to open symbol file`, e) })
            setTimeout(() => {
              document.dispatchEvent(new CustomEvent('goto-line-direct', { detail: { line: s.line + 1 } }))
            }, 100)
          }
        },
      }))
    }
    return filteredCommands
  }, [isFileMode, isSymbolMode, isWorkspaceSymbolMode, filteredFiles, filteredSymbols, filteredWorkspaceSymbols, filteredCommands, openFile, workspacePath, currentFile])

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Toggle command palette (Ctrl+Shift+P)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault()
        setIsOpen((prev) => {
          if (prev) {
            // If already open in Quick Open mode, switch to command mode
            if (isQuickOpen) {
              setIsQuickOpen(false)
              setQuery('')
              return true
            }
            return false
          }
          setIsQuickOpen(false)
          return true
        })
        setQuery('')
        return
      }

      // Quick Open (Ctrl+P)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'p') {
        e.preventDefault()
        setIsOpen((prev) => {
          if (prev) {
            // If already open in Quick Open mode, close it — VS Code pattern
            if (isQuickOpen) {
              setQuery('')
              setIsQuickOpen(false)
              return false
            }
            // If open in command mode, switch to Quick Open
            setIsQuickOpen(true)
            setQuery('')
            return true
          }
          setIsQuickOpen(true)
          return true
        })
        setQuery('')
        return
      }

      if (!isOpen) return

      // Navigate results
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) =>
          prev < filteredItems.length - 1 ? prev + 1 : 0
        )
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredItems.length - 1
        )
      } else if (e.key === 'Enter') {
        e.preventDefault()
        // Go to Line via :NNN in Quick Open — VS Code pattern (direct jump, not widget)
        if (isGoToLine) {
          const lineNum = parseInt(query.slice(1), 10)
          if (!isNaN(lineNum) && lineNum > 0) {
            document.dispatchEvent(new CustomEvent('goto-line-direct', { detail: { line: lineNum } }))
            setIsOpen(false)
            setQuery('')
            setIsQuickOpen(false)
          }
          return
        }
        const selected = filteredItems[selectedIndex]
        if (selected) {
          selected.action()
          setIsOpen(false)
          setQuery('')
          setIsQuickOpen(false)
        }
      } else if (e.key === 'Escape') {
        setIsOpen(false)
        setQuery('')
        setIsQuickOpen(false)
      }
    },
    [isOpen, filteredItems, selectedIndex, isQuickOpen, isGoToLine, query]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Listen for open-goto-line from App.tsx (Ctrl+G) and StatusBar click
  useEffect(() => {
    const handleOpenGoToLine = () => {
      setIsOpen(true)
      setIsQuickOpen(true)
      setQuery(':')
    }
    window.addEventListener('open-goto-line', handleOpenGoToLine)
    return () => window.removeEventListener('open-goto-line', handleOpenGoToLine)
  }, [])

  // R5183: Listen for open-quick-open from go-to-file command
  useEffect(() => {
    const handleOpenQuickOpen = () => {
      setIsOpen(true)
      setIsQuickOpen(true)
      setQuery('')
    }
    window.addEventListener('open-quick-open', handleOpenQuickOpen)
    return () => window.removeEventListener('open-quick-open', handleOpenQuickOpen)
  }, [])

  // Reset selection when filtered results change
  useEffect(() => {
    if (prevFilteredLengthRef.current !== filteredItems.length) {
      prevFilteredLengthRef.current = filteredItems.length
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedIndex(0)
    }
  }, [filteredItems.length])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[15vh] z-[100]"
      onClick={() => {
        setIsOpen(false)
        setQuery('')
        setIsQuickOpen(false)
      }}
      role="presentation"
    >
      <div
        className="bg-mac-panel/95 border border-glass-border rounded-mac-xl w-[560px] shadow-mac backdrop-blur-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-glass-border">
          <Search size={20} className="text-text-tertiary" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              isCommandMode ? 'Type a command...' :
              isSymbolMode ? 'Go to Symbol in File (@symbol)...' :
              isWorkspaceSymbolMode ? 'Go to Symbol in Workspace (#symbol)...' :
              isGoToLine ? 'Go to Line (:number)...' :
              isQuickOpen ? 'Go to File...' : 'Type a command or search...'
            }
            className="flex-1 bg-transparent text-text-primary placeholder-text-tertiary outline-none text-base"
            aria-label={isSymbolMode ? 'Search file symbols' : isWorkspaceSymbolMode ? 'Search workspace symbols' : isFileMode ? 'Search files' : 'Search commands'}
            autoFocus
          />
          <kbd className="px-2 py-0.5 bg-surface rounded text-xs text-text-secondary font-mono">
            ESC
          </kbd>
        </div>

        {/* Command List */}
        <div className="max-h-[400px] overflow-y-auto">
          {filteredItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-text-tertiary">
              {isGoToLine ? (
                <>
                  <p className="text-sm">Go to Line {query.slice(1)}</p>
                  <p className="text-xs mt-1">Press Enter to jump</p>
                </>
              ) : isSymbolMode ? (
                <>
                  <p className="text-sm">{symbolsLoading ? 'Loading symbols...' : !currentFile ? 'Open a file first' : 'No symbols found'}</p>
                  {!currentFile && <p className="text-xs mt-1">Symbols are available for the active file</p>}
                </>
              ) : isWorkspaceSymbolMode ? (
                <>
                  <p className="text-sm">{workspaceSymbolsLoading ? 'Searching workspace symbols...' : query.length <= 1 ? 'Type to search workspace symbols' : 'No symbols found'}</p>
                  <p className="text-xs mt-1">Search across all files in the workspace</p>
                </>
              ) : (
                <>
                  <Search size={32} className="mx-auto mb-2 opacity-50" />
                  <p>
                    {isFileMode ? 'No matching files' :
                     query.startsWith(':') ? 'Type a line number after :' :
                     'No commands found'}
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
              {isFileMode && query.length === 0 && filteredItems.length > 0 && (
                <div className="px-4 py-1.5 text-xs text-text-tertiary font-medium uppercase tracking-wider">
                  recently opened
                </div>
              )}
              {filteredItems.map((item, index) => (
              <div
                key={item.id}
                onClick={() => {
                  item.action()
                  setIsOpen(false)
                  setQuery('')
                  setIsQuickOpen(false)
                }}
                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                  index === selectedIndex
                    ? 'bg-accent/20 border-l-2 border-accent'
                    : 'hover:bg-card-hover border-l-2 border-transparent'
                }`}
              >
                <div className={`p-1.5 rounded-mac ${item.isFile ? '' : 'bg-surface'}`}>{item.icon}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">{item.label}</p>
                  {item.description && (
                    <p className="text-xs text-text-secondary truncate">{item.description}</p>
                  )}
                </div>
                {item.shortcut && (
                  <kbd className="px-2 py-0.5 bg-surface rounded text-xs text-text-secondary font-mono">
                    {item.shortcut}
                  </kbd>
                )}
              </div>
            ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-glass-border bg-surface/50 text-xs text-text-tertiary">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1 bg-mac-sidebar rounded">↑↓</kbd> Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 bg-mac-sidebar rounded">↵</kbd> Select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 bg-mac-sidebar rounded">Esc</kbd> Close
            </span>
            {!isCommandMode && (
              <span className="flex items-center gap-1">
                <kbd className="px-1 bg-mac-sidebar rounded">&gt;</kbd> Commands
              </span>
            )}
          </div>
          <span className="flex items-center gap-1">
            <Command size={12} />
            <kbd className="px-1 bg-mac-sidebar rounded">⇧</kbd>
            <kbd className="px-1 bg-mac-sidebar rounded">P</kbd>
            {isQuickOpen ? 'Commands' : 'Toggle'}
          </span>
        </div>
      </div>
    </div>
  )
}

import type { ReactNode } from 'react'
import {
	Search, FileCode, Users, Network, Settings, Plus, Play, Pause, Square,
	Code, Type, Hash, List, X, ChevronRight, ChevronDown, Pin,
	AlertCircle, ArrowRight, ArrowLeft, ArrowUp, ArrowDown, RotateCcw, Files,
	Keyboard, GitCompare, GitBranch, Upload, Download, Archive, Undo2, Braces,
	AlignVerticalSpaceAround, Indent, Eye, Link, Save, Sun, Clipboard,
	ClipboardCopy, Maximize, Minimize, XCircle, RefreshCw, FileDown, Lightbulb,
	Zap, CaseSensitive, WholeWord, Regex, Replace, Columns, TextCursorInput,
	Highlighter, StepForward, StepBack, ChevronsUpDown, Layers, Filter,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { api, gitApi } from '../services'
import { logger } from '../utils'
import type { SwarmInfo } from '../services'
import type { Swarm, Agent } from '../types'
import type { ToastType } from './Toast'

export interface CommandAction {
	id: string
	label: string
	description?: string
	icon: ReactNode
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

export function useCommandActions(openSymbolMode: () => void, openWorkspaceSymbolMode: () => void): CommandAction[] {
	const navigate = useNavigate()
	const agents = useAppStore(state => state.agents)
	const activeSwarm = useAppStore(state => state.activeSwarm)
	const setActiveSwarm = useAppStore(state => state.setActiveSwarm)
	const startAgent = useAppStore(state => state.startAgent)
	const stopAgent = useAppStore(state => state.stopAgent)
	const addToast = useAppStore(state => state.addToast)

	return buildCommands({
		navigate, agents, activeSwarm, setActiveSwarm, startAgent, stopAgent, addToast,
		openSymbolMode, openWorkspaceSymbolMode,
	})
}

interface CommandDeps {
	navigate: ReturnType<typeof useNavigate>
	agents: Agent[]
	activeSwarm: Swarm | null
	setActiveSwarm: (s: Swarm) => void
	startAgent: (id: string) => void
	stopAgent: (id: string) => void
	addToast: (type: ToastType, title: string, msg?: string) => void
	openSymbolMode: () => void
	openWorkspaceSymbolMode: () => void
}

function buildCommands(d: CommandDeps): CommandAction[] {
	const cmds: CommandAction[] = [
		{ id: 'nav-editor', label: 'Go to Editor', description: 'Open the code editor', icon: <FileCode size={18} />, action: () => d.navigate('/'), category: 'navigation' },
		{ id: 'nav-swarm', label: 'Go to Swarm', description: 'Open swarm management', icon: <Network size={18} />, action: () => d.navigate('/swarm'), category: 'navigation' },
		{ id: 'nav-team', label: 'Go to Team', description: 'Open team management', icon: <Users size={18} />, action: () => d.navigate('/team'), category: 'navigation' },
		{ id: 'nav-settings', label: 'Go to Settings', description: 'Open application settings', icon: <Settings size={18} />, action: () => d.navigate('/settings'), category: 'navigation', shortcut: 'Ctrl+,' },
		{ id: 'swarm-create', label: 'Create New Swarm', description: 'Create a new agent swarm', icon: <Plus size={18} />, action: () => { d.navigate('/swarm') }, category: 'swarm' },
		{ id: 'swarm-start', label: 'Start Active Swarm', description: d.activeSwarm ? `Start ${d.activeSwarm.name}` : 'No active swarm', icon: <Play size={18} />, action: async () => {
			if (!d.activeSwarm) { d.addToast('error', 'No active swarm', 'Start a swarm first'); return }
			try { const info = await api.swarm.startSwarm(d.activeSwarm.id); d.setActiveSwarm(swarmInfoToSwarm(info)); d.addToast('success', 'Swarm started', d.activeSwarm.name) } catch (err) { d.addToast('error', 'Failed to start swarm', err instanceof Error ? err.message : 'Unknown error') }
		}, category: 'swarm' },
		{ id: 'swarm-stop', label: 'Stop Active Swarm', description: d.activeSwarm ? `Stop ${d.activeSwarm.name}` : 'No active swarm', icon: <Square size={18} />, action: async () => {
			if (!d.activeSwarm) { d.addToast('error', 'No active swarm', 'Stop a swarm first'); return }
			try { const info = await api.swarm.stopSwarm(d.activeSwarm.id); d.setActiveSwarm(swarmInfoToSwarm(info)); d.addToast('success', 'Swarm stopped', d.activeSwarm.name) } catch (err) { d.addToast('error', 'Failed to stop swarm', err instanceof Error ? err.message : 'Unknown error') }
		}, category: 'swarm' },
		// Editor toggle commands
		...editorToggleCommands(),
		// Tab & file commands
		...tabCommands(d),
		// Panel toggle commands
		...panelCommands(),
		// Navigation commands
		...navigationCommands(d),
		// Editing commands
		...editingCommands(),
		// Git commands
		...gitCommands(),
		// Symbol commands
		{ id: 'go-to-symbol', label: 'Go to Symbol in File...', description: 'Jump to a symbol in the current file', icon: <Code size={18} />, action: d.openSymbolMode, category: 'navigation' },
		{ id: 'go-to-symbol-workspace', label: 'Go to Symbol in Workspace...', description: 'Search for symbols across the entire workspace', icon: <Search size={18} />, action: d.openWorkspaceSymbolMode, category: 'navigation' },
	]

	// Agent commands
	d.agents.forEach((agent) => {
		const isRunning = agent.state === 'executing' || agent.state === 'thinking'
		cmds.push({
			id: `agent-${agent.id}-${isRunning ? 'stop' : 'start'}`,
			label: `${isRunning ? 'Stop' : 'Start'} Agent: ${agent.name}`,
			description: `${isRunning ? 'Stop' : 'Start'} ${agent.type} agent`,
			icon: isRunning ? <Pause size={18} /> : <Play size={18} />,
			action: () => { isRunning ? d.stopAgent(agent.id) : d.startAgent(agent.id) },
			category: 'agent',
		})
	})

	return cmds
}

function editorToggleCommands(): CommandAction[] {
	const toggle = (setting: string) => () => { window.dispatchEvent(new CustomEvent('toggle-editor-setting', { detail: { setting } })) }
	return [
		{ id: 'toggle-minimap', label: 'Toggle Minimap', description: 'Show or hide the code minimap', icon: <List size={18} />, action: toggle('minimap'), category: 'settings' },
		{ id: 'toggle-word-wrap', label: 'Toggle Word Wrap', description: 'Enable or disable word wrap', icon: <Code size={18} />, action: toggle('wordWrap'), category: 'settings' },
		{ id: 'toggle-line-numbers', label: 'Toggle Line Numbers', description: 'Show or hide line numbers', icon: <Hash size={18} />, action: toggle('lineNumbers'), category: 'settings' },
		{ id: 'toggle-bracket-pair-colorization', label: 'Toggle Bracket Pair Colorization', description: 'Colorize matching brackets', icon: <Braces size={18} />, action: toggle('bracketPairColorization'), category: 'settings' },
		{ id: 'toggle-sticky-scroll', label: 'Toggle Sticky Scroll', description: 'Pin scope headers at the top while scrolling', icon: <AlignVerticalSpaceAround size={18} />, action: toggle('stickyScroll'), category: 'settings' },
		{ id: 'toggle-indent-guides', label: 'Toggle Indent Guides', description: 'Show indentation guides', icon: <Indent size={18} />, action: toggle('indentGuides'), category: 'settings' },
		{ id: 'toggle-render-whitespace', label: 'Toggle Render Whitespace', description: 'Cycle whitespace rendering mode', icon: <Eye size={18} />, action: toggle('renderWhitespace'), category: 'settings' },
		{ id: 'toggle-smooth-scrolling', label: 'Toggle Smooth Scrolling', description: 'Enable or disable smooth scrolling', icon: <ChevronsUpDown size={18} />, action: toggle('smoothScrolling'), category: 'settings' },
		{ id: 'toggle-linked-editing', label: 'Toggle Linked Editing', description: 'Auto-edit matching HTML/XML tags', icon: <Link size={18} />, action: toggle('linkedEditing'), category: 'settings' },
		{ id: 'toggle-inlay-hints', label: 'Toggle Inlay Hints', description: 'Show type annotations and parameter names inline', icon: <Type size={18} />, action: toggle('inlayHints'), category: 'settings' },
		{ id: 'toggle-breadcrumbs', label: 'Toggle Breadcrumbs', description: 'Show file path and symbol navigation bar', icon: <Hash size={18} />, action: toggle('breadcrumbs'), category: 'settings' },
		{ id: 'toggle-zen-mode', label: 'Toggle Zen Mode', description: 'Distraction-free editing (hides all panels)', icon: <Square size={18} />, action: () => { window.dispatchEvent(new CustomEvent('toggle-zen-mode')) }, category: 'view', shortcut: 'Ctrl+K Z' },
		{ id: 'toggle-color-theme', label: 'Toggle Color Theme', description: 'Switch between dark and light themes', icon: <Sun size={18} />, action: () => { window.dispatchEvent(new CustomEvent('toggle-theme')) }, category: 'view', shortcut: 'Ctrl+K Ctrl+T' },
		{ id: 'increase-font-size', label: 'Increase Font Size', description: 'Make editor text larger', icon: <Type size={18} />, action: () => { window.dispatchEvent(new CustomEvent('adjust-font-size', { detail: { delta: 2 } })) }, category: 'settings', shortcut: 'Ctrl+=' },
		{ id: 'decrease-font-size', label: 'Decrease Font Size', description: 'Make editor text smaller', icon: <Type size={18} />, action: () => { window.dispatchEvent(new CustomEvent('adjust-font-size', { detail: { delta: -2 } })) }, category: 'settings', shortcut: 'Ctrl+-' },
		{ id: 'reset-font-size', label: 'Reset Font Size', description: 'Reset editor font size to default', icon: <RotateCcw size={18} />, action: () => { window.dispatchEvent(new CustomEvent('reset-font-size')) }, category: 'settings', shortcut: 'Ctrl+0' },
	]
}

function tabCommands(d: CommandDeps): CommandAction[] {
	const evt = (name: string) => () => { window.dispatchEvent(new CustomEvent(name)) }
	return [
		{ id: 'close-all-tabs', label: 'Close All Tabs', description: 'Close all open editor tabs', icon: <X size={18} />, action: evt('close-all-tabs'), category: 'navigation' },
		{ id: 'close-to-right', label: 'Close Tabs to Right', description: 'Close all tabs to the right of the active tab', icon: <ChevronRight size={18} />, action: evt('close-to-right'), category: 'navigation' },
		{ id: 'close-saved-tabs', label: 'Close Saved Tabs', description: 'Close all saved (non-dirty) editor tabs', icon: <X size={18} />, action: evt('close-saved-tabs'), category: 'navigation' },
		{ id: 'close-other-tabs', label: 'Close Other Tabs', description: 'Close all editor tabs except the active one', icon: <X size={18} />, action: evt('close-other-tabs'), category: 'navigation' },
		{ id: 'close-tab', label: 'Close Tab', description: 'Close the current tab', icon: <X size={18} />, action: evt('close-current-tab'), category: 'navigation', shortcut: 'Ctrl+W' },
		{ id: 'pin-tab', label: 'Pin Tab', description: 'Pin the active editor tab', icon: <Pin size={18} />, action: evt('pin-current-tab'), category: 'navigation' },
		{ id: 'new-file', label: 'New File', description: 'Create a new untitled file', icon: <Plus size={18} />, action: evt('new-file'), category: 'navigation' },
		{ id: 'open-file', label: 'Open File...', description: 'Open a file from disk', icon: <Files size={18} />, action: evt('open-file'), category: 'navigation', shortcut: 'Ctrl+O' },
		{ id: 'open-folder', label: 'Open Folder...', description: 'Open a folder as workspace', icon: <Files size={18} />, action: evt('open-folder'), category: 'navigation', shortcut: 'Ctrl+K Ctrl+O' },
		{ id: 'go-to-file', label: 'Go to File...', description: 'Quick file navigation', icon: <Files size={18} />, action: evt('go-to-file'), category: 'navigation', shortcut: 'Ctrl+P' },
		{ id: 'go-to-line', label: 'Go to Line...', description: 'Jump to a specific line number', icon: <Hash size={18} />, action: evt('go-to-line'), category: 'navigation', shortcut: 'Ctrl+G' },
		{ id: 'find-in-files', label: 'Find in Files', description: 'Search across all files', icon: <Search size={18} />, action: evt('find-in-files'), category: 'navigation', shortcut: 'Ctrl+Shift+F' },
		{ id: 'replace-in-files', label: 'Replace in Files', description: 'Search and replace across all files', icon: <Replace size={18} />, action: evt('replace-in-files'), category: 'navigation', shortcut: 'Ctrl+Shift+H' },
		{ id: 'save', label: 'Save', description: 'Save the current file', icon: <Save size={18} />, action: evt('save-file'), category: 'navigation', shortcut: 'Ctrl+S' },
		{ id: 'save-all', label: 'Save All', description: 'Save all open files with unsaved changes', icon: <Save size={18} />, action: evt('save-all'), category: 'navigation', shortcut: 'Ctrl+K S' },
		{ id: 'format-document', label: 'Format Document', description: 'Format the current file using the editor formatter', icon: <Braces size={18} />, action: evt('format-document'), category: 'settings', shortcut: 'Shift+Alt+F' },
		{ id: 'copy-path', label: 'Copy Path', description: 'Copy the absolute path of the active file', icon: <Clipboard size={18} />, action: () => { const f = useWorkspaceStore.getState().currentFile; if (f) { navigator.clipboard.writeText(f); d.addToast('success', 'Copied', f) } else { d.addToast('error', 'No file open', 'Open a file first') } }, category: 'navigation', shortcut: 'Ctrl+K P' },
		{ id: 'copy-relative-path', label: 'Copy Relative Path', description: 'Copy the path relative to workspace root', icon: <ClipboardCopy size={18} />, action: () => { const { currentFile, workspacePath } = useWorkspaceStore.getState(); if (!currentFile) { d.addToast('error', 'No file open', 'Open a file first'); return } if (!workspacePath) { d.addToast('error', 'No workspace', 'Open a folder first'); return } const rel = currentFile.startsWith(workspacePath) ? currentFile.slice(workspacePath.length).replace(/^\/+/, '') : currentFile; navigator.clipboard.writeText(rel); d.addToast('success', 'Copied', rel) }, category: 'navigation', shortcut: 'Ctrl+K Ctrl+P' },
		{ id: 'reopen-closed-tab', label: 'Reopen Closed Tab', description: 'Reopen the last closed tab', icon: <RotateCcw size={18} />, action: () => { useWorkspaceStore.getState().undoCloseFile().catch((e) => { logger.warn('CommandPalette', 'Failed to reopen tab', e) }) }, category: 'navigation', shortcut: 'Ctrl+Shift+T' },
		{ id: 'reveal-active-file', label: 'Reveal Active File in Explorer', description: 'Show the current file in the file tree', icon: <Files size={18} />, action: evt('reveal-active-file'), category: 'navigation' },
		{ id: 'revert-file', label: 'Revert File', description: 'Discard all unsaved changes and reload from disk', icon: <FileDown size={18} />, action: evt('revert-file'), category: 'navigation' },
		{ id: 'reload-window', label: 'Reload Window', description: 'Reload the editor (clears in-memory state)', icon: <RefreshCw size={18} />, action: () => { location.reload() }, category: 'navigation', shortcut: 'Ctrl+Shift+R' },
		{ id: 'next-tab', label: 'Next Tab', description: 'Switch to the next tab', icon: <ArrowRight size={18} />, action: () => { const s = useWorkspaceStore.getState(); const files = s.openFiles; const cur = s.currentFile; if (!cur || files.length <= 1) return; const idx = files.indexOf(cur); if (idx === -1 || idx >= files.length - 1) return; s.openFile(files[idx + 1]).catch((e) => { logger.warn('CommandPalette', 'Failed to open next tab', e) }) }, category: 'navigation', shortcut: 'Ctrl+PageDown' },
		{ id: 'prev-tab', label: 'Previous Tab', description: 'Switch to the previous tab', icon: <ArrowLeft size={18} />, action: () => { const s = useWorkspaceStore.getState(); const files = s.openFiles; const cur = s.currentFile; if (!cur || files.length <= 1) return; const idx = files.indexOf(cur); if (idx === -1 || idx <= 0) return; s.openFile(files[idx - 1]).catch((e) => { logger.warn('CommandPalette', 'Failed to open prev tab', e) }) }, category: 'navigation', shortcut: 'Ctrl+PageUp' },
		{ id: 'select-all', label: 'Select All', description: 'Select all content in the editor', icon: <List size={18} />, action: evt('select-all'), category: 'editing', shortcut: 'Ctrl+A' },
	]
}

function panelCommands(): CommandAction[] {
	const evt = (name: string) => () => { window.dispatchEvent(new CustomEvent(name)) }
	return [
		{ id: 'toggle-sidebar', label: 'Toggle Sidebar', description: 'Show or hide the file explorer', icon: <List size={18} />, action: evt('toggle-sidebar'), category: 'navigation', shortcut: 'Ctrl+B' },
		{ id: 'toggle-terminal', label: 'Toggle Terminal', description: 'Show or hide the terminal panel', icon: <Code size={18} />, action: evt('toggle-terminal'), category: 'navigation', shortcut: 'Ctrl+~' },
		{ id: 'show-problems', label: 'Show Problems', description: 'Show the Problems panel', icon: <AlertCircle size={18} />, action: evt('show-problems'), category: 'navigation', shortcut: 'Ctrl+Shift+M' },
		{ id: 'split-editor', label: 'Split Editor Right', description: 'Split the editor into two side-by-side panes', icon: <Columns size={18} />, action: evt('toggle-split'), category: 'navigation', shortcut: 'Ctrl+\\' },
		{ id: 'close-split', label: 'Close Split Editor', description: 'Return to single editor pane', icon: <Columns size={18} />, action: evt('close-split'), category: 'navigation' },
		{ id: 'toggle-bottom-panel', label: 'Toggle Bottom Panel', description: 'Show or hide the bottom panel', icon: <AlignVerticalSpaceAround size={18} />, action: evt('toggle-bottom-panel'), category: 'view', shortcut: 'Ctrl+J' },
		{ id: 'toggle-output', label: 'Toggle Output Panel', description: 'Show or hide the output panel', icon: <Archive size={18} />, action: evt('toggle-output'), category: 'view', shortcut: 'Ctrl+Shift+U' },
		{ id: 'toggle-debug-console', label: 'Toggle Debug Console', description: 'Show or hide the debug console', icon: <Zap size={18} />, action: evt('toggle-debug-console'), category: 'view', shortcut: 'Ctrl+Shift+Y' },
		{ id: 'fold-all', label: 'Fold All', description: 'Collapse all code regions', icon: <ChevronRight size={18} />, action: evt('fold-all'), category: 'settings', shortcut: 'Ctrl+K Ctrl+0' },
		{ id: 'unfold-all', label: 'Unfold All', description: 'Expand all code regions', icon: <ChevronRight size={18} />, action: evt('unfold-all'), category: 'settings', shortcut: 'Ctrl+K Ctrl+J' },
		{ id: 'navigate-back', label: 'Go Back', description: 'Navigate to previous location in history', icon: <ArrowLeft size={18} />, action: () => { window.history.back() }, category: 'navigation', shortcut: 'Ctrl+Alt+←' },
		{ id: 'navigate-forward', label: 'Go Forward', description: 'Navigate to next location in history', icon: <ArrowRight size={18} />, action: () => { window.history.forward() }, category: 'navigation', shortcut: 'Ctrl+Alt+→' },
		{ id: 'focus-group-1', label: 'Focus First Editor Group', description: 'Switch focus to the first editor pane', icon: <Layers size={18} />, action: () => { window.dispatchEvent(new CustomEvent('focus-editor-group', { detail: { group: 1 } })) }, category: 'navigation', shortcut: 'Ctrl+1' },
		{ id: 'focus-group-2', label: 'Focus Second Editor Group', description: 'Switch focus to the second editor pane (split mode)', icon: <Layers size={18} />, action: () => { window.dispatchEvent(new CustomEvent('focus-editor-group', { detail: { group: 2 } })) }, category: 'navigation', shortcut: 'Ctrl+2' },
		{ id: 'accessibility-help', label: 'Accessibility Help', description: 'Show keyboard shortcuts reference', icon: <Keyboard size={18} />, action: evt('open-accessibility-help'), category: 'navigation', shortcut: 'Alt+F1' },
		{ id: 'open-diff', label: 'Open Diff', description: 'Open diff view for the current file (HEAD vs Working Tree)', icon: <GitCompare size={18} />, action: evt('open-diff'), category: 'navigation' },
		{ id: 'toggle-full-screen', label: 'Toggle Full Screen', description: document.fullscreenElement ? 'Exit full screen mode' : 'Enter full screen mode', icon: document.fullscreenElement ? <Minimize size={18} /> : <Maximize size={18} />, action: () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen() }, category: 'view', shortcut: 'F11' },
		{ id: 'close-window', label: 'Close Window', description: 'Close the current window', icon: <XCircle size={18} />, action: () => { window.close(); useAppStore.getState().addToast('info', 'Close Window', 'Use browser controls to close this tab') }, category: 'navigation', shortcut: 'Ctrl+Shift+W' },
	]
}

function navigationCommands(_d: CommandDeps): CommandAction[] {
	const editorAction = (actionId: string) => () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId } })) }
	return [
		{ id: 'go-to-definition', label: 'Go to Definition', description: 'Navigate to the definition of the symbol under cursor', icon: <ArrowRight size={18} />, action: editorAction('editor.action.revealDefinition'), category: 'navigation', shortcut: 'F12' },
		{ id: 'go-to-type-definition', label: 'Go to Type Definition', description: 'Navigate to the type definition of the symbol under cursor', icon: <Type size={18} />, action: editorAction('editor.action.revealTypeDefinition'), category: 'navigation' },
		{ id: 'go-to-implementation', label: 'Go to Implementation', description: 'Navigate to the implementation of the symbol under cursor', icon: <Code size={18} />, action: editorAction('editor.action.goToImplementation'), category: 'navigation' },
		{ id: 'go-to-references', label: 'Go to References', description: 'Find all references to the symbol under cursor', icon: <Search size={18} />, action: editorAction('editor.action.referenceSearch.trigger'), category: 'navigation', shortcut: 'Shift+F12' },
		{ id: 'peek-definition', label: 'Peek Definition', description: 'Show definition in a peek overlay without navigating away', icon: <Eye size={18} />, action: editorAction('editor.action.peekDefinition'), category: 'navigation', shortcut: 'Alt+F12' },
		{ id: 'cursor-top', label: 'Cursor to Top', description: 'Move cursor to the beginning of the file', icon: <ArrowUp size={18} />, action: editorAction('cursorTop'), category: 'navigation' },
		{ id: 'cursor-bottom', label: 'Cursor to Bottom', description: 'Move cursor to the end of the file', icon: <ArrowDown size={18} />, action: editorAction('cursorBottom'), category: 'navigation' },
		{ id: 'scroll-to-top', label: 'Scroll to Top', description: 'Scroll the editor to the top', icon: <ArrowUp size={18} />, action: editorAction('editor.action.scrollToTop'), category: 'navigation' },
		{ id: 'scroll-to-bottom', label: 'Scroll to Bottom', description: 'Scroll the editor to the bottom', icon: <ArrowDown size={18} />, action: editorAction('editor.action.scrollToBottom'), category: 'navigation' },
		{ id: 'go-to-next-error', label: 'Go to Next Error', description: 'Navigate to the next error or warning', icon: <StepForward size={18} />, action: () => { window.dispatchEvent(new CustomEvent('navigate-next-problem')) }, category: 'navigation', shortcut: 'F8' },
		{ id: 'go-to-previous-error', label: 'Go to Previous Error', description: 'Navigate to the previous error or warning', icon: <StepBack size={18} />, action: () => { window.dispatchEvent(new CustomEvent('navigate-previous-problem')) }, category: 'navigation', shortcut: 'Shift+F8' },
		{ id: 'jump-to-matching-bracket', label: 'Jump to Matching Bracket', description: 'Navigate between brackets', icon: <Braces size={18} />, action: editorAction('editor.action.jumpToBracket'), category: 'navigation', shortcut: 'Ctrl+Shift+\\' },
	]
}

function editingCommands(): CommandAction[] {
	const editorAction = (actionId: string) => () => { window.dispatchEvent(new CustomEvent('editor-action', { detail: { actionId } })) }
	return [
		{ id: 'toggle-line-comment', label: 'Toggle Line Comment', description: 'Comment or uncomment the current line', icon: <Code size={18} />, action: editorAction('editor.action.commentLine'), category: 'editing', shortcut: 'Ctrl+/' },
		{ id: 'toggle-block-comment', label: 'Toggle Block Comment', description: 'Toggle block comment around selection', icon: <Code size={18} />, action: editorAction('editor.action.blockComment'), category: 'editing', shortcut: 'Shift+Alt+A' },
		{ id: 'find-replace', label: 'Find and Replace', description: 'Open find and replace widget', icon: <Search size={18} />, action: editorAction('editor.action.startFindReplaceAction'), category: 'editing', shortcut: 'Ctrl+H' },
		{ id: 'move-line-up', label: 'Move Line Up', description: 'Move the current line up', icon: <ArrowUp size={18} />, action: editorAction('editor.action.moveLinesUpAction'), category: 'editing', shortcut: 'Alt+↑' },
		{ id: 'move-line-down', label: 'Move Line Down', description: 'Move the current line down', icon: <ArrowDown size={18} />, action: editorAction('editor.action.moveLinesDownAction'), category: 'editing', shortcut: 'Alt+↓' },
		{ id: 'copy-line-up', label: 'Copy Line Up', description: 'Duplicate the current line above', icon: <ArrowUp size={18} />, action: editorAction('editor.action.copyLinesUpAction'), category: 'editing', shortcut: 'Shift+Alt+↑' },
		{ id: 'copy-line-down', label: 'Copy Line Down', description: 'Duplicate the current line below', icon: <ArrowDown size={18} />, action: editorAction('editor.action.copyLinesDownAction'), category: 'editing', shortcut: 'Shift+Alt+↓' },
		{ id: 'delete-line', label: 'Delete Line', description: 'Delete the current line', icon: <X size={18} />, action: editorAction('editor.action.deleteLines'), category: 'editing', shortcut: 'Ctrl+Shift+K' },
		{ id: 'insert-line-below', label: 'Insert Line Below', description: 'Insert a new line below the cursor', icon: <Plus size={18} />, action: editorAction('editor.action.insertLineAfter'), category: 'editing', shortcut: 'Ctrl+Enter' },
		{ id: 'insert-line-above', label: 'Insert Line Above', description: 'Insert a new line above the cursor', icon: <Plus size={18} />, action: editorAction('editor.action.insertLineBefore'), category: 'editing', shortcut: 'Ctrl+Shift+Enter' },
		{ id: 'join-lines', label: 'Join Lines', description: 'Join the current line with the line below', icon: <Link size={18} />, action: editorAction('editor.action.joinLines'), category: 'editing' },
		{ id: 'trim-trailing-whitespace', label: 'Trim Trailing Whitespace', description: 'Remove trailing whitespace from all lines', icon: <Filter size={18} />, action: editorAction('editor.action.trimTrailingWhitespace'), category: 'editing' },
		{ id: 'sort-lines-ascending', label: 'Sort Lines Ascending', description: 'Sort selected lines in ascending order', icon: <ArrowRight size={18} />, action: editorAction('editor.action.sortLinesAscending'), category: 'editing' },
		{ id: 'sort-lines-descending', label: 'Sort Lines Descending', description: 'Sort selected lines in descending order', icon: <ArrowLeft size={18} />, action: editorAction('editor.action.sortLinesDescending'), category: 'editing' },
		{ id: 'organize-imports', label: 'Organize Imports', description: 'Sort and clean up import statements', icon: <Braces size={18} />, action: editorAction('editor.action.organizeImports'), category: 'editing' },
		{ id: 'transform-uppercase', label: 'Transform to Uppercase', description: 'Convert selection to uppercase', icon: <Type size={18} />, action: editorAction('editor.action.transformToUppercase'), category: 'editing' },
		{ id: 'transform-lowercase', label: 'Transform to Lowercase', description: 'Convert selection to lowercase', icon: <Type size={18} />, action: editorAction('editor.action.transformToLowercase'), category: 'editing' },
		{ id: 'rename-symbol', label: 'Rename Symbol', description: 'Rename the symbol under cursor across the project', icon: <TextCursorInput size={18} />, action: editorAction('editor.action.rename'), category: 'editing', shortcut: 'F2' },
		{ id: 'add-cursor-above', label: 'Add Cursor Above', description: 'Insert a new cursor above the current line', icon: <ArrowUp size={18} />, action: editorAction('editor.action.insertCursorAbove'), category: 'editing', shortcut: 'Ctrl+Alt+↑' },
		{ id: 'add-cursor-below', label: 'Add Cursor Below', description: 'Insert a new cursor below the current line', icon: <ArrowDown size={18} />, action: editorAction('editor.action.insertCursorBelow'), category: 'editing', shortcut: 'Ctrl+Alt+↓' },
		{ id: 'cursor-undo', label: 'Cursor Undo', description: 'Undo the last cursor position change', icon: <Undo2 size={18} />, action: editorAction('editor.action.cursorUndo'), category: 'editing', shortcut: 'Ctrl+U' },
		{ id: 'expand-selection', label: 'Expand Selection', description: 'Expand selection to the next enclosing scope', icon: <Maximize size={18} />, action: editorAction('editor.action.smartSelect.expand'), category: 'editing', shortcut: 'Shift+Alt+→' },
		{ id: 'shrink-selection', label: 'Shrink Selection', description: 'Shrink selection to the previous enclosing scope', icon: <Minimize size={18} />, action: editorAction('editor.action.smartSelect.shrink'), category: 'editing', shortcut: 'Shift+Alt+←' },
		{ id: 'editor-undo', label: 'Undo', description: 'Undo the last edit', icon: <Undo2 size={18} />, action: editorAction('undo'), category: 'editing', shortcut: 'Ctrl+Z' },
		{ id: 'editor-redo', label: 'Redo', description: 'Redo the last undone edit', icon: <RotateCcw size={18} />, action: editorAction('redo'), category: 'editing', shortcut: 'Ctrl+Shift+Z' },
		{ id: 'editor-cut', label: 'Cut', description: 'Cut the selection to clipboard', icon: <Clipboard size={18} />, action: editorAction('editor.action.clipboardCutAction'), category: 'editing' },
		{ id: 'editor-copy', label: 'Copy', description: 'Copy the selection to clipboard', icon: <ClipboardCopy size={18} />, action: editorAction('editor.action.clipboardCopyAction'), category: 'editing' },
		{ id: 'editor-paste', label: 'Paste', description: 'Paste from clipboard', icon: <Clipboard size={18} />, action: editorAction('editor.action.clipboardPasteAction'), category: 'editing' },
		{ id: 'indent-lines', label: 'Indent Line', description: 'Indent the current line', icon: <Indent size={18} />, action: editorAction('editor.action.indent'), category: 'editing' },
		{ id: 'outdent-lines', label: 'Outdent Line', description: 'Outdent the current line', icon: <Indent size={18} />, action: editorAction('editor.action.outdent'), category: 'editing' },
		{ id: 'format-selection', label: 'Format Selection', description: 'Format the selected text', icon: <Braces size={18} />, action: editorAction('editor.action.formatSelection'), category: 'editing' },
		{ id: 'transpose', label: 'Transpose Characters', description: 'Swap characters around the cursor', icon: <Zap size={18} />, action: editorAction('editor.action.transposeLetters'), category: 'editing' },
		{ id: 'toggle-match-case', label: 'Toggle Match Case', description: 'Toggle case sensitivity in search', icon: <CaseSensitive size={18} />, action: editorAction('editor.action.toggleFindCaseSensitive'), category: 'editing' },
		{ id: 'toggle-whole-word', label: 'Toggle Whole Word Match', description: 'Toggle whole word matching in search', icon: <WholeWord size={18} />, action: editorAction('editor.action.toggleFindWholeWord'), category: 'editing' },
		{ id: 'toggle-regex', label: 'Toggle Regex Search', description: 'Toggle regular expression mode in search', icon: <Regex size={18} />, action: editorAction('editor.action.toggleFindRegex'), category: 'editing' },
		{ id: 'quick-fix', label: 'Quick Fix', description: 'Show code actions / lightbulb at cursor', icon: <Lightbulb size={18} />, action: editorAction('editor.action.quickFix'), category: 'editing', shortcut: 'Ctrl+.' },
		{ id: 'find-next', label: 'Find Next', description: 'Go to the next find match', icon: <ArrowDown size={18} />, action: editorAction('editor.action.nextMatchFindAction'), category: 'editing', shortcut: 'F3' },
		{ id: 'find-previous', label: 'Find Previous', description: 'Go to the previous find match', icon: <ArrowUp size={18} />, action: editorAction('editor.action.previousMatchFindAction'), category: 'editing', shortcut: 'Shift+F3' },
		{ id: 'add-selection-next-find-match', label: 'Add Selection to Next Find Match', description: 'Select next occurrence (Ctrl+D)', icon: <Highlighter size={18} />, action: editorAction('editor.action.addSelectionToNextFindMatch'), category: 'editing', shortcut: 'Ctrl+D' },
		{ id: 'select-all-highlights', label: 'Select All Occurrences of Find Match', description: 'Select all occurrences of current word', icon: <Highlighter size={18} />, action: editorAction('editor.action.selectHighlights'), category: 'editing', shortcut: 'Ctrl+Shift+L' },
		{ id: 'add-cursors-to-line-ends', label: 'Add Cursors to Line Ends', description: 'Add cursors at end of each selected line', icon: <TextCursorInput size={18} />, action: editorAction('editor.action.addCursorsToLineEnds'), category: 'editing', shortcut: 'Shift+Alt+I' },
		{ id: 'select-line', label: 'Select Line', description: 'Select the entire current line', icon: <TextCursorInput size={18} />, action: editorAction('editor.action.expandLineSelection'), category: 'editing', shortcut: 'Ctrl+L' },
		{ id: 'select-to-bracket', label: 'Select to Bracket', description: 'Select text between matching brackets', icon: <Braces size={18} />, action: editorAction('editor.action.selectToBracket'), category: 'editing', shortcut: 'Ctrl+Shift+Alt+\\' },
		{ id: 'fold-region', label: 'Fold', description: 'Fold the code region at cursor', icon: <ChevronRight size={18} />, action: editorAction('editor.fold'), category: 'settings', shortcut: 'Ctrl+Shift+[' },
		{ id: 'unfold-region', label: 'Unfold', description: 'Unfold the code region at cursor', icon: <ChevronDown size={18} />, action: editorAction('editor.unfold'), category: 'settings', shortcut: 'Ctrl+Shift+]' },
		{ id: 'fold-recursively', label: 'Fold Recursively', description: 'Fold all nested regions', icon: <ChevronRight size={18} />, action: editorAction('editor.foldRecursively'), category: 'settings', shortcut: 'Ctrl+K Ctrl+[' },
		{ id: 'unfold-recursively', label: 'Unfold Recursively', description: 'Unfold all nested regions', icon: <ChevronDown size={18} />, action: editorAction('editor.unfoldRecursively'), category: 'settings', shortcut: 'Ctrl+K Ctrl+]' },
		{ id: 'change-all-occurrences', label: 'Change All Occurrences', description: 'Select all occurrences and start typing replacement', icon: <Replace size={18} />, action: editorAction('editor.action.selectHighlights'), category: 'editing', shortcut: 'Ctrl+F2' },
	]
}

function gitCommands(): CommandAction[] {
	const addToast = (type: ToastType, title: string, msg: string) => useAppStore.getState().addToast(type, title, msg)
	return [
		{ id: 'git-push', label: 'Git: Push', description: 'Push current branch to remote', icon: <Upload size={18} />, action: async () => { try { const branch = await gitApi.getBranch(); const result = await gitApi.push('origin', branch); addToast('success', 'Pushed', result.output.slice(0, 80)) } catch (err) { addToast('error', 'Push failed', err instanceof Error ? err.message : 'Unknown') } }, category: 'settings' },
		{ id: 'git-pull', label: 'Git: Pull', description: 'Pull from remote', icon: <Download size={18} />, action: async () => { try { const branch = await gitApi.getBranch(); const result = await gitApi.pull('origin', branch); addToast('success', 'Pulled', result.output.slice(0, 80)); window.dispatchEvent(new CustomEvent('refresh-git-status')) } catch (err) { addToast('error', 'Pull failed', err instanceof Error ? err.message : 'Unknown') } }, category: 'settings' },
		{ id: 'git-stash', label: 'Git: Stash', description: 'Stash current working changes', icon: <Archive size={18} />, action: async () => { try { await gitApi.stash(); addToast('info', 'Stashed', 'Working changes stashed') } catch (err) { addToast('error', 'Stash failed', err instanceof Error ? err.message : 'Unknown') } }, category: 'settings' },
		{ id: 'git-stash-pop', label: 'Git: Stash Pop', description: 'Restore most recent stash', icon: <Archive size={18} />, action: async () => { try { await gitApi.stashPop(); addToast('info', 'Stash popped', 'Stashed changes restored') } catch (err) { addToast('error', 'Stash pop failed', err instanceof Error ? err.message : 'Unknown') } }, category: 'settings' },
		{ id: 'git-undo-commit', label: 'Git: Undo Last Commit', description: 'Soft reset to previous commit', icon: <Undo2 size={18} />, action: async () => { try { await gitApi.undoCommit(); addToast('info', 'Commit undone', 'Last commit moved to staged changes') } catch (err) { addToast('error', 'Undo failed', err instanceof Error ? err.message : 'Unknown') } }, category: 'settings' },
		{ id: 'git-show-source-control', label: 'Git: Show Source Control', description: 'Show Source Control panel', icon: <GitBranch size={18} />, action: () => { window.dispatchEvent(new CustomEvent('toggle-source-control')) }, category: 'settings', shortcut: 'Ctrl+Shift+G' },
		{ id: 'git-checkout', label: 'Git: Checkout...', description: 'Switch branches or restore files', icon: <GitBranch size={18} />, action: () => { window.dispatchEvent(new CustomEvent('git-checkout')) }, category: 'settings' },
	]
}

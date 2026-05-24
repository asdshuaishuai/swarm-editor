import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------- Mocks ----------

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
	useNavigate: () => mockNavigate,
}))

// appStore mock with mutable state
const mockAgents = [
	{ id: 'a1', name: 'Agent One', type: 'coder', state: 'idle' },
	{ id: 'a2', name: 'Agent Two', type: 'reviewer', state: 'executing' },
]
let mockActiveSwarm: any = { id: 'sw1', name: 'Test Swarm', topology: 'mesh', strategy: 'round_robin', state: 'active', agents: [], stats: { agentCount: 1, idleAgents: 0, executingAgents: 1, pendingTasks: 0, completedTasks: 0, topology: 'mesh', strategy: 'round_robin', state: 'active' } }
const mockAddToast = vi.fn()
const mockSetActiveSwarm = vi.fn()
const mockStartAgent = vi.fn()
const mockStopAgent = vi.fn()

// Build the mock store state object so both useAppStore(selector) and
// useAppStore.getState() work.  Git commands and close-window call
// useAppStore.getState() directly (not via the hook selector).
const storeState = {
	agents: mockAgents,
	activeSwarm: mockActiveSwarm,
	setActiveSwarm: mockSetActiveSwarm,
	startAgent: mockStartAgent,
	stopAgent: mockStopAgent,
	addToast: mockAddToast,
}

vi.mock('../store/appStore', () => {
	const state = () => storeState
	const fn: any = (selector?: any) => selector ? selector(state()) : state()
	fn.getState = () => state()
	return { useAppStore: fn }
})

// workspaceStore mock with mutable state
let wsCurrentFile: any = '/test/file.ts'
let wsWorkspacePath: any = '/test'
let wsOpenFiles: any = ['/test/file.ts', '/test/other.ts', '/test/third.ts']
const mockUndoCloseFile = vi.fn().mockResolvedValue(undefined)
const mockOpenFile = vi.fn().mockResolvedValue(undefined)

vi.mock('../stores/workspaceStore', () => ({
	useWorkspaceStore: {
		getState: () => ({
			get currentFile() { return wsCurrentFile },
			get workspacePath() { return wsWorkspacePath },
			get openFiles() { return wsOpenFiles },
			undoCloseFile: mockUndoCloseFile,
			openFile: mockOpenFile,
		}),
	},
}))

const mockStartSwarm = vi.fn().mockResolvedValue({ id: 'sw1', name: 'Test', topology: 'mesh', strategy: 'round_robin', status: 'active', agents: [], agentCount: 0, taskCount: 0 })
const mockStopSwarm = vi.fn().mockResolvedValue({ id: 'sw1', name: 'Test', topology: 'mesh', strategy: 'round_robin', status: 'stopped', agents: [], agentCount: 0, taskCount: 0 })

vi.mock('../services', () => ({
	api: {
		swarm: {
			startSwarm: (...args: any[]) => mockStartSwarm(...args),
			stopSwarm: (...args: any[]) => mockStopSwarm(...args),
		},
	},
	gitApi: {
		getBranch: vi.fn().mockResolvedValue('main'),
		push: vi.fn().mockResolvedValue({ output: 'push output ok' }),
		pull: vi.fn().mockResolvedValue({ output: 'pull output ok' }),
		stash: vi.fn().mockResolvedValue(undefined),
		stashPop: vi.fn().mockResolvedValue(undefined),
		undoCommit: vi.fn().mockResolvedValue(undefined),
	},
}))

vi.mock('../utils', () => ({
	logger: { warn: vi.fn(), debug: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

import { useCommandActions } from './CommandPaletteCommands'

// ---------- Helpers ----------

function renderCommands(openSymbolMode = vi.fn(), openWorkspaceSymbolMode = vi.fn()) {
	return renderHook(() =>
		useCommandActions(openSymbolMode, openWorkspaceSymbolMode)
	)
}

// ---------- Tests ----------

describe('useCommandActions', () => {

	beforeEach(() => {
		vi.clearAllMocks()
		// Reset mutable state
		storeState.agents = mockAgents
		storeState.activeSwarm = { id: 'sw1', name: 'Test Swarm', topology: 'mesh', strategy: 'round_robin', state: 'active', agents: [], stats: { agentCount: 1, idleAgents: 0, executingAgents: 1, pendingTasks: 0, completedTasks: 0, topology: 'mesh', strategy: 'round_robin', state: 'active' } }
		storeState.setActiveSwarm = mockSetActiveSwarm
		storeState.startAgent = mockStartAgent
		storeState.stopAgent = mockStopAgent
		storeState.addToast = mockAddToast
		wsCurrentFile = '/test/file.ts'
		wsWorkspacePath = '/test'
		wsOpenFiles = ['/test/file.ts', '/test/other.ts', '/test/third.ts']
		mockAgents[0].state = 'idle'
		mockAgents[1].state = 'executing'
		mockStartSwarm.mockResolvedValue({ id: 'sw1', name: 'Test', topology: 'mesh', strategy: 'round_robin', status: 'active', agents: [], agentCount: 0, taskCount: 0 })
		mockStopSwarm.mockResolvedValue({ id: 'sw1', name: 'Test', topology: 'mesh', strategy: 'round_robin', status: 'stopped', agents: [], agentCount: 0, taskCount: 0 })
	})

	// ===== Structure / registration tests =====

	describe('command registration', () => {
		it('returns an array of commands', () => {
			const { result } = renderCommands()
			expect(Array.isArray(result.current)).toBe(true)
			expect(result.current.length).toBeGreaterThan(80)
		})

		it('includes navigation commands', () => {
			const ids = renderCommands().result.current.map(c => c.id)
			expect(ids).toContain('nav-editor')
			expect(ids).toContain('nav-swarm')
			expect(ids).toContain('nav-team')
			expect(ids).toContain('nav-settings')
		})

		it('includes swarm commands', () => {
			const ids = renderCommands().result.current.map(c => c.id)
			expect(ids).toContain('swarm-create')
			expect(ids).toContain('swarm-start')
			expect(ids).toContain('swarm-stop')
		})

		it('includes all editor toggle commands', () => {
			const ids = renderCommands().result.current.map(c => c.id)
			const expected = [
				'toggle-minimap', 'toggle-word-wrap', 'toggle-line-numbers',
				'toggle-bracket-pair-colorization', 'toggle-sticky-scroll',
				'toggle-indent-guides', 'toggle-render-whitespace',
				'toggle-smooth-scrolling', 'toggle-linked-editing',
				'toggle-inlay-hints', 'toggle-breadcrumbs', 'toggle-zen-mode',
				'toggle-color-theme', 'increase-font-size', 'decrease-font-size',
				'reset-font-size',
			]
			for (const id of expected) {
				expect(ids).toContain(id)
			}
		})

		it('includes all tab management commands', () => {
			const ids = renderCommands().result.current.map(c => c.id)
			const expected = [
				'close-all-tabs', 'close-to-right', 'close-saved-tabs',
				'close-other-tabs', 'close-tab', 'pin-tab', 'new-file',
				'open-file', 'open-folder', 'go-to-file', 'go-to-line',
				'find-in-files', 'replace-in-files', 'save', 'save-all',
				'format-document', 'copy-path', 'copy-relative-path',
				'reopen-closed-tab', 'reveal-active-file', 'revert-file',
				'reload-window', 'next-tab', 'prev-tab', 'select-all',
			]
			for (const id of expected) {
				expect(ids).toContain(id)
			}
		})

		it('includes all panel toggle commands', () => {
			const ids = renderCommands().result.current.map(c => c.id)
			const expected = [
				'toggle-sidebar', 'toggle-terminal', 'show-problems',
				'split-editor', 'close-split', 'toggle-bottom-panel',
				'toggle-output', 'toggle-debug-console', 'fold-all',
				'unfold-all', 'navigate-back', 'navigate-forward',
				'focus-group-1', 'focus-group-2', 'accessibility-help',
				'open-diff', 'toggle-full-screen', 'close-window',
			]
			for (const id of expected) {
				expect(ids).toContain(id)
			}
		})

		it('includes all navigation editor-action commands', () => {
			const ids = renderCommands().result.current.map(c => c.id)
			const expected = [
				'go-to-definition', 'go-to-type-definition', 'go-to-implementation',
				'go-to-references', 'peek-definition', 'cursor-top', 'cursor-bottom',
				'scroll-to-top', 'scroll-to-bottom', 'go-to-next-error',
				'go-to-previous-error', 'jump-to-matching-bracket',
			]
			for (const id of expected) {
				expect(ids).toContain(id)
			}
		})

		it('includes all editing commands', () => {
			const ids = renderCommands().result.current.map(c => c.id)
			const expected = [
				'toggle-line-comment', 'toggle-block-comment', 'find-replace',
				'move-line-up', 'move-line-down', 'copy-line-up', 'copy-line-down',
				'delete-line', 'insert-line-below', 'insert-line-above',
				'join-lines', 'trim-trailing-whitespace', 'sort-lines-ascending',
				'sort-lines-descending', 'organize-imports', 'transform-uppercase',
				'transform-lowercase', 'rename-symbol', 'add-cursor-above',
				'add-cursor-below', 'cursor-undo', 'expand-selection',
				'shrink-selection', 'editor-undo', 'editor-redo', 'editor-cut',
				'editor-copy', 'editor-paste', 'indent-lines', 'outdent-lines',
				'format-selection', 'transpose', 'toggle-match-case',
				'toggle-whole-word', 'toggle-regex', 'quick-fix', 'find-next',
				'find-previous', 'add-selection-next-find-match',
				'select-all-highlights', 'add-cursors-to-line-ends', 'select-line',
				'select-to-bracket', 'fold-region', 'unfold-region',
				'fold-recursively', 'unfold-recursively', 'change-all-occurrences',
			]
			for (const id of expected) {
				expect(ids).toContain(id)
			}
		})

		it('includes all git commands', () => {
			const ids = renderCommands().result.current.map(c => c.id)
			const expected = [
				'git-push', 'git-pull', 'git-stash', 'git-stash-pop',
				'git-undo-commit', 'git-show-source-control', 'git-checkout',
			]
			for (const id of expected) {
				expect(ids).toContain(id)
			}
		})

		it('includes symbol navigation commands', () => {
			const ids = renderCommands().result.current.map(c => c.id)
			expect(ids).toContain('go-to-symbol')
			expect(ids).toContain('go-to-symbol-workspace')
		})

		it('generates agent commands for each agent', () => {
			const cmds = renderCommands().result.current
			const agentCmds = cmds.filter(c => c.category === 'agent')
			expect(agentCmds.length).toBe(2)
			const labels = agentCmds.map(c => c.label)
			expect(labels.some(l => l.includes('Start Agent: Agent One'))).toBe(true)
			expect(labels.some(l => l.includes('Stop Agent: Agent Two'))).toBe(true)
		})

		it('all commands have required fields', () => {
			for (const cmd of renderCommands().result.current) {
				expect(cmd.id).toBeTruthy()
				expect(cmd.label).toBeTruthy()
				expect(cmd.icon).toBeDefined()
				expect(typeof cmd.action).toBe('function')
				expect(['navigation', 'agent', 'swarm', 'settings', 'view', 'editing']).toContain(cmd.category)
			}
		})

		it('commands have unique IDs', () => {
			const cmds = renderCommands().result.current
			const ids = cmds.map(c => c.id)
			const uniqueIds = new Set(ids)
			expect(uniqueIds.size).toBe(ids.length)
		})

		it('some commands have shortcuts', () => {
			const cmds = renderCommands().result.current
			const withShortcut = cmds.filter(c => c.shortcut)
			expect(withShortcut.length).toBeGreaterThan(10)
		})

		it('some commands have descriptions', () => {
			const cmds = renderCommands().result.current
			const withDesc = cmds.filter(c => c.description)
			expect(withDesc.length).toBeGreaterThan(10)
		})

		it('agent command IDs differ based on agent state', () => {
			const cmds = renderCommands().result.current
			const ids = cmds.filter(c => c.category === 'agent').map(c => c.id)
			expect(ids).toContain('agent-a1-start')
			expect(ids).toContain('agent-a2-stop')
		})
	})

	// ===== Navigation command actions =====

	describe('navigation command actions', () => {
		it('nav-editor navigates to /', () => {
			renderCommands().result.current.find(c => c.id === 'nav-editor')!.action()
			expect(mockNavigate).toHaveBeenCalledWith('/')
		})

		it('nav-swarm navigates to /swarm', () => {
			renderCommands().result.current.find(c => c.id === 'nav-swarm')!.action()
			expect(mockNavigate).toHaveBeenCalledWith('/swarm')
		})

		it('nav-team navigates to /team', () => {
			renderCommands().result.current.find(c => c.id === 'nav-team')!.action()
			expect(mockNavigate).toHaveBeenCalledWith('/team')
		})

		it('nav-settings navigates to /settings', () => {
			renderCommands().result.current.find(c => c.id === 'nav-settings')!.action()
			expect(mockNavigate).toHaveBeenCalledWith('/settings')
		})

		it('swarm-create navigates to /swarm', () => {
			renderCommands().result.current.find(c => c.id === 'swarm-create')!.action()
			expect(mockNavigate).toHaveBeenCalledWith('/swarm')
		})
	})

	// ===== Swarm command actions =====

	describe('swarm command actions', () => {
		it('swarm-start calls API and sets active swarm', async () => {
			const cmd = renderCommands().result.current.find(c => c.id === 'swarm-start')!
			await cmd.action()
			expect(mockStartSwarm).toHaveBeenCalledWith('sw1')
			expect(mockSetActiveSwarm).toHaveBeenCalled()
			expect(mockAddToast).toHaveBeenCalledWith('success', 'Swarm started', 'Test Swarm')
		})

		it('swarm-start with no active swarm shows error', async () => {
			storeState.activeSwarm = null
			const cmd = renderCommands().result.current.find(c => c.id === 'swarm-start')!
			await cmd.action()
			expect(mockAddToast).toHaveBeenCalledWith('error', 'No active swarm', 'Start a swarm first')
			expect(mockStartSwarm).not.toHaveBeenCalled()
		})

		it('swarm-start handles API error', async () => {
			mockStartSwarm.mockRejectedValueOnce(new Error('Network failure'))
			const cmd = renderCommands().result.current.find(c => c.id === 'swarm-start')!
			await cmd.action()
			expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to start swarm', 'Network failure')
		})

		it('swarm-start handles non-Error API error', async () => {
			mockStartSwarm.mockRejectedValueOnce('unknown')
			const cmd = renderCommands().result.current.find(c => c.id === 'swarm-start')!
			await cmd.action()
			expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to start swarm', 'Unknown error')
		})

		it('swarm-stop calls API and sets active swarm', async () => {
			const cmd = renderCommands().result.current.find(c => c.id === 'swarm-stop')!
			await cmd.action()
			expect(mockStopSwarm).toHaveBeenCalledWith('sw1')
			expect(mockSetActiveSwarm).toHaveBeenCalled()
			expect(mockAddToast).toHaveBeenCalledWith('success', 'Swarm stopped', 'Test Swarm')
		})

		it('swarm-stop with no active swarm shows error', async () => {
			storeState.activeSwarm = null
			const cmd = renderCommands().result.current.find(c => c.id === 'swarm-stop')!
			await cmd.action()
			expect(mockAddToast).toHaveBeenCalledWith('error', 'No active swarm', 'Stop a swarm first')
			expect(mockStopSwarm).not.toHaveBeenCalled()
		})

		it('swarm-stop handles API error', async () => {
			mockStopSwarm.mockRejectedValueOnce(new Error('Stop failed'))
			const cmd = renderCommands().result.current.find(c => c.id === 'swarm-stop')!
			await cmd.action()
			expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to stop swarm', 'Stop failed')
		})

		it('swarm-stop handles non-Error API error', async () => {
			mockStopSwarm.mockRejectedValueOnce(42)
			const cmd = renderCommands().result.current.find(c => c.id === 'swarm-stop')!
			await cmd.action()
			expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to stop swarm', 'Unknown error')
		})

		it('swarm-start description shows active swarm name when present', () => {
			const cmd = renderCommands().result.current.find(c => c.id === 'swarm-start')!
			expect(cmd.description).toContain('Test Swarm')
		})

		it('swarm-start description says no active swarm when null', () => {
			storeState.activeSwarm = null
			const cmd = renderCommands().result.current.find(c => c.id === 'swarm-start')!
			expect(cmd.description).toBe('No active swarm')
		})

		it('swarm-stop description shows active swarm name when present', () => {
			const cmd = renderCommands().result.current.find(c => c.id === 'swarm-stop')!
			expect(cmd.description).toContain('Test Swarm')
		})

		it('swarm-stop description says no active swarm when null', () => {
			storeState.activeSwarm = null
			const cmd = renderCommands().result.current.find(c => c.id === 'swarm-stop')!
			expect(cmd.description).toBe('No active swarm')
		})
	})

	// ===== Agent command actions =====

	describe('agent command actions', () => {
		it('idle agent start command calls startAgent', () => {
			const cmds = renderCommands().result.current
			const startCmd = cmds.find(c => c.id === 'agent-a1-start')
			expect(startCmd).toBeDefined()
			startCmd!.action()
			expect(mockStartAgent).toHaveBeenCalledWith('a1')
		})

		it('executing agent stop command calls stopAgent', () => {
			const cmds = renderCommands().result.current
			const stopCmd = cmds.find(c => c.id === 'agent-a2-stop')
			expect(stopCmd).toBeDefined()
			stopCmd!.action()
			expect(mockStopAgent).toHaveBeenCalledWith('a2')
		})
	})

	// ===== Editor toggle command actions =====

	describe('editor toggle command actions', () => {
		const toggleTests: [string, string][] = [
			['toggle-minimap', 'minimap'],
			['toggle-word-wrap', 'wordWrap'],
			['toggle-line-numbers', 'lineNumbers'],
			['toggle-bracket-pair-colorization', 'bracketPairColorization'],
			['toggle-sticky-scroll', 'stickyScroll'],
			['toggle-indent-guides', 'indentGuides'],
			['toggle-render-whitespace', 'renderWhitespace'],
			['toggle-smooth-scrolling', 'smoothScrolling'],
			['toggle-linked-editing', 'linkedEditing'],
			['toggle-inlay-hints', 'inlayHints'],
			['toggle-breadcrumbs', 'breadcrumbs'],
		]

		it.each(toggleTests)('%s dispatches toggle-editor-setting with setting "%s"', (cmdId, setting) => {
			const spy = vi.spyOn(window, 'dispatchEvent')
			const cmd = renderCommands().result.current.find(c => c.id === cmdId)!
			cmd.action()
			expect(spy).toHaveBeenCalledWith(expect.objectContaining({
				type: 'toggle-editor-setting',
				detail: { setting },
			}))
			spy.mockRestore()
		})

		it('toggle-zen-mode dispatches toggle-zen-mode event', () => {
			const spy = vi.spyOn(window, 'dispatchEvent')
			renderCommands().result.current.find(c => c.id === 'toggle-zen-mode')!.action()
			expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: 'toggle-zen-mode' }))
			spy.mockRestore()
		})

		it('toggle-color-theme dispatches toggle-theme event', () => {
			const spy = vi.spyOn(window, 'dispatchEvent')
			renderCommands().result.current.find(c => c.id === 'toggle-color-theme')!.action()
			expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: 'toggle-theme' }))
			spy.mockRestore()
		})

		it('increase-font-size dispatches adjust-font-size with delta 2', () => {
			const spy = vi.spyOn(window, 'dispatchEvent')
			renderCommands().result.current.find(c => c.id === 'increase-font-size')!.action()
			expect(spy).toHaveBeenCalledWith(expect.objectContaining({
				type: 'adjust-font-size', detail: { delta: 2 },
			}))
			spy.mockRestore()
		})

		it('decrease-font-size dispatches adjust-font-size with delta -2', () => {
			const spy = vi.spyOn(window, 'dispatchEvent')
			renderCommands().result.current.find(c => c.id === 'decrease-font-size')!.action()
			expect(spy).toHaveBeenCalledWith(expect.objectContaining({
				type: 'adjust-font-size', detail: { delta: -2 },
			}))
			spy.mockRestore()
		})

		it('reset-font-size dispatches reset-font-size event', () => {
			const spy = vi.spyOn(window, 'dispatchEvent')
			renderCommands().result.current.find(c => c.id === 'reset-font-size')!.action()
			expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: 'reset-font-size' }))
			spy.mockRestore()
		})
	})

	// ===== Tab command actions =====

	describe('tab command actions (event dispatching)', () => {
		const eventDispatchIds: [string, string][] = [
			['close-all-tabs', 'close-all-tabs'],
			['close-to-right', 'close-to-right'],
			['close-saved-tabs', 'close-saved-tabs'],
			['close-other-tabs', 'close-other-tabs'],
			['close-tab', 'close-current-tab'],
			['pin-tab', 'pin-current-tab'],
			['new-file', 'new-file'],
			['open-file', 'open-file'],
			['open-folder', 'open-folder'],
			['go-to-file', 'go-to-file'],
			['go-to-line', 'go-to-line'],
			['find-in-files', 'find-in-files'],
			['replace-in-files', 'replace-in-files'],
			['save', 'save-file'],
			['save-all', 'save-all'],
			['format-document', 'format-document'],
			['reveal-active-file', 'reveal-active-file'],
			['revert-file', 'revert-file'],
			['select-all', 'select-all'],
		]

		it.each(eventDispatchIds)('command %s dispatches event "%s"', (cmdId, eventName) => {
			const spy = vi.spyOn(window, 'dispatchEvent')
			renderCommands().result.current.find(c => c.id === cmdId)!.action()
			expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: eventName }))
			spy.mockRestore()
		})
	})

	describe('tab command actions (complex logic)', () => {
		it('copy-path copies current file path', () => {
			const writeText = vi.fn().mockResolvedValue(undefined)
			Object.assign(navigator, { clipboard: { writeText } })
			renderCommands().result.current.find(c => c.id === 'copy-path')!.action()
			expect(writeText).toHaveBeenCalledWith('/test/file.ts')
			expect(mockAddToast).toHaveBeenCalledWith('success', 'Copied', '/test/file.ts')
		})

		it('copy-path with no file open shows error', () => {
			wsCurrentFile = ''
			renderCommands().result.current.find(c => c.id === 'copy-path')!.action()
			expect(mockAddToast).toHaveBeenCalledWith('error', 'No file open', 'Open a file first')
		})

		it('copy-path with null currentFile shows error', () => {
			wsCurrentFile = null
			renderCommands().result.current.find(c => c.id === 'copy-path')!.action()
			expect(mockAddToast).toHaveBeenCalledWith('error', 'No file open', 'Open a file first')
		})

		it('copy-relative-path computes relative path', () => {
			const writeText = vi.fn().mockResolvedValue(undefined)
			Object.assign(navigator, { clipboard: { writeText } })
			wsCurrentFile = '/test/src/app.ts'
			wsWorkspacePath = '/test'
			renderCommands().result.current.find(c => c.id === 'copy-relative-path')!.action()
			expect(writeText).toHaveBeenCalledWith('src/app.ts')
			expect(mockAddToast).toHaveBeenCalledWith('success', 'Copied', 'src/app.ts')
		})

		it('copy-relative-path with no file shows error', () => {
			wsCurrentFile = ''
			renderCommands().result.current.find(c => c.id === 'copy-relative-path')!.action()
			expect(mockAddToast).toHaveBeenCalledWith('error', 'No file open', 'Open a file first')
		})

		it('copy-relative-path with no workspace shows error', () => {
			wsWorkspacePath = ''
			renderCommands().result.current.find(c => c.id === 'copy-relative-path')!.action()
			expect(mockAddToast).toHaveBeenCalledWith('error', 'No workspace', 'Open a folder first')
		})

		it('copy-relative-path handles file outside workspace', () => {
			const writeText = vi.fn().mockResolvedValue(undefined)
			Object.assign(navigator, { clipboard: { writeText } })
			wsCurrentFile = '/external/file.ts'
			wsWorkspacePath = '/test'
			renderCommands().result.current.find(c => c.id === 'copy-relative-path')!.action()
			expect(writeText).toHaveBeenCalledWith('/external/file.ts')
			expect(mockAddToast).toHaveBeenCalledWith('success', 'Copied', '/external/file.ts')
		})

		it('copy-relative-path strips leading slashes from relative path', () => {
			const writeText = vi.fn().mockResolvedValue(undefined)
			Object.assign(navigator, { clipboard: { writeText } })
			wsCurrentFile = '/test/deep/nested/file.ts'
			wsWorkspacePath = '/test'
			renderCommands().result.current.find(c => c.id === 'copy-relative-path')!.action()
			expect(writeText).toHaveBeenCalledWith('deep/nested/file.ts')
		})

		it('reopen-closed-tab calls undoCloseFile', async () => {
			await renderCommands().result.current.find(c => c.id === 'reopen-closed-tab')!.action()
			expect(mockUndoCloseFile).toHaveBeenCalled()
		})

		it('reload-window calls location.reload', () => {
			// jsdom doesn't allow redefining location.reload, but we can verify
			// the action doesn't throw. The real behavior just calls location.reload().
			const cmd = renderCommands().result.current.find(c => c.id === 'reload-window')!
			expect(() => cmd.action()).not.toThrow()
		})

		it('next-tab opens next file in order', async () => {
			wsCurrentFile = '/test/file.ts'
			wsOpenFiles = ['/test/file.ts', '/test/other.ts', '/test/third.ts']
			await renderCommands().result.current.find(c => c.id === 'next-tab')!.action()
			expect(mockOpenFile).toHaveBeenCalledWith('/test/other.ts')
		})

		it('next-tab on last file does nothing', async () => {
			wsCurrentFile = '/test/third.ts'
			wsOpenFiles = ['/test/file.ts', '/test/other.ts', '/test/third.ts']
			await renderCommands().result.current.find(c => c.id === 'next-tab')!.action()
			expect(mockOpenFile).not.toHaveBeenCalled()
		})

		it('next-tab with single file does nothing', async () => {
			wsCurrentFile = '/test/file.ts'
			wsOpenFiles = ['/test/file.ts']
			await renderCommands().result.current.find(c => c.id === 'next-tab')!.action()
			expect(mockOpenFile).not.toHaveBeenCalled()
		})

		it('next-tab with no current file does nothing', async () => {
			wsCurrentFile = ''
			wsOpenFiles = ['/test/file.ts', '/test/other.ts']
			await renderCommands().result.current.find(c => c.id === 'next-tab')!.action()
			expect(mockOpenFile).not.toHaveBeenCalled()
		})

		it('next-tab with file not in list does nothing', async () => {
			wsCurrentFile = '/test/missing.ts'
			wsOpenFiles = ['/test/file.ts', '/test/other.ts']
			await renderCommands().result.current.find(c => c.id === 'next-tab')!.action()
			expect(mockOpenFile).not.toHaveBeenCalled()
		})

		it('prev-tab opens previous file', async () => {
			wsCurrentFile = '/test/other.ts'
			wsOpenFiles = ['/test/file.ts', '/test/other.ts', '/test/third.ts']
			await renderCommands().result.current.find(c => c.id === 'prev-tab')!.action()
			expect(mockOpenFile).toHaveBeenCalledWith('/test/file.ts')
		})

		it('prev-tab on first file does nothing', async () => {
			wsCurrentFile = '/test/file.ts'
			wsOpenFiles = ['/test/file.ts', '/test/other.ts']
			await renderCommands().result.current.find(c => c.id === 'prev-tab')!.action()
			expect(mockOpenFile).not.toHaveBeenCalled()
		})

		it('prev-tab with single file does nothing', async () => {
			wsCurrentFile = '/test/file.ts'
			wsOpenFiles = ['/test/file.ts']
			await renderCommands().result.current.find(c => c.id === 'prev-tab')!.action()
			expect(mockOpenFile).not.toHaveBeenCalled()
		})

		it('prev-tab with no current file does nothing', async () => {
			wsCurrentFile = ''
			wsOpenFiles = ['/test/file.ts', '/test/other.ts']
			await renderCommands().result.current.find(c => c.id === 'prev-tab')!.action()
			expect(mockOpenFile).not.toHaveBeenCalled()
		})

		it('prev-tab with file not in list does nothing', async () => {
			wsCurrentFile = '/test/missing.ts'
			wsOpenFiles = ['/test/file.ts', '/test/other.ts']
			await renderCommands().result.current.find(c => c.id === 'prev-tab')!.action()
			expect(mockOpenFile).not.toHaveBeenCalled()
		})
	})

	// ===== Panel command actions =====

	describe('panel command actions', () => {
		const panelEventIds: [string, string][] = [
			['toggle-sidebar', 'toggle-sidebar'],
			['toggle-terminal', 'toggle-terminal'],
			['show-problems', 'show-problems'],
			['split-editor', 'toggle-split'],
			['close-split', 'close-split'],
			['toggle-bottom-panel', 'toggle-bottom-panel'],
			['toggle-output', 'toggle-output'],
			['toggle-debug-console', 'toggle-debug-console'],
			['fold-all', 'fold-all'],
			['unfold-all', 'unfold-all'],
			['accessibility-help', 'open-accessibility-help'],
			['open-diff', 'open-diff'],
		]

		it.each(panelEventIds)('command %s dispatches event "%s"', (cmdId, eventName) => {
			const spy = vi.spyOn(window, 'dispatchEvent')
			renderCommands().result.current.find(c => c.id === cmdId)!.action()
			expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: eventName }))
			spy.mockRestore()
		})

		it('navigate-back calls history.back', () => {
			const spy = vi.spyOn(window.history, 'back')
			renderCommands().result.current.find(c => c.id === 'navigate-back')!.action()
			expect(spy).toHaveBeenCalled()
			spy.mockRestore()
		})

		it('navigate-forward calls history.forward', () => {
			const spy = vi.spyOn(window.history, 'forward')
			renderCommands().result.current.find(c => c.id === 'navigate-forward')!.action()
			expect(spy).toHaveBeenCalled()
			spy.mockRestore()
		})

		it('focus-group-1 dispatches focus-editor-group with group 1', () => {
			const spy = vi.spyOn(window, 'dispatchEvent')
			renderCommands().result.current.find(c => c.id === 'focus-group-1')!.action()
			expect(spy).toHaveBeenCalledWith(expect.objectContaining({
				type: 'focus-editor-group', detail: { group: 1 },
			}))
			spy.mockRestore()
		})

		it('focus-group-2 dispatches focus-editor-group with group 2', () => {
			const spy = vi.spyOn(window, 'dispatchEvent')
			renderCommands().result.current.find(c => c.id === 'focus-group-2')!.action()
			expect(spy).toHaveBeenCalledWith(expect.objectContaining({
				type: 'focus-editor-group', detail: { group: 2 },
			}))
			spy.mockRestore()
		})

		it('go-to-next-error dispatches navigate-next-problem', () => {
			const spy = vi.spyOn(window, 'dispatchEvent')
			renderCommands().result.current.find(c => c.id === 'go-to-next-error')!.action()
			expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: 'navigate-next-problem' }))
			spy.mockRestore()
		})

		it('go-to-previous-error dispatches navigate-previous-problem', () => {
			const spy = vi.spyOn(window, 'dispatchEvent')
			renderCommands().result.current.find(c => c.id === 'go-to-previous-error')!.action()
			expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: 'navigate-previous-problem' }))
			spy.mockRestore()
		})

		it('toggle-full-screen requests fullscreen when not fullscreen', () => {
			const mockRequestFullscreen = vi.fn().mockResolvedValue(undefined)
			Object.defineProperty(document, 'fullscreenElement', { value: null, writable: true, configurable: true })
			Object.defineProperty(document.documentElement, 'requestFullscreen', { value: mockRequestFullscreen, writable: true, configurable: true })
			renderCommands().result.current.find(c => c.id === 'toggle-full-screen')!.action()
			expect(mockRequestFullscreen).toHaveBeenCalled()
		})

		it('toggle-full-screen exits fullscreen when already fullscreen', () => {
			const mockExitFullscreen = vi.fn().mockResolvedValue(undefined)
			Object.defineProperty(document, 'fullscreenElement', { value: document.documentElement, writable: true, configurable: true })
			Object.defineProperty(document, 'exitFullscreen', { value: mockExitFullscreen, writable: true, configurable: true })
			renderCommands().result.current.find(c => c.id === 'toggle-full-screen')!.action()
			expect(mockExitFullscreen).toHaveBeenCalled()
		})

		it('close-window calls window.close and adds toast', () => {
			const mockClose = vi.fn()
			const origClose = window.close
			window.close = mockClose
			renderCommands().result.current.find(c => c.id === 'close-window')!.action()
			expect(mockClose).toHaveBeenCalled()
			expect(mockAddToast).toHaveBeenCalledWith('info', 'Close Window', 'Use browser controls to close this tab')
			window.close = origClose
		})

		it('git-show-source-control dispatches toggle-source-control', () => {
			const spy = vi.spyOn(window, 'dispatchEvent')
			renderCommands().result.current.find(c => c.id === 'git-show-source-control')!.action()
			expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: 'toggle-source-control' }))
			spy.mockRestore()
		})

		it('git-checkout dispatches git-checkout event', () => {
			const spy = vi.spyOn(window, 'dispatchEvent')
			renderCommands().result.current.find(c => c.id === 'git-checkout')!.action()
			expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: 'git-checkout' }))
			spy.mockRestore()
		})
	})

	// ===== Navigation command actions (editor-action) =====

	describe('navigation editor-action commands', () => {
		const editorActionIds: [string, string][] = [
			['go-to-definition', 'editor.action.revealDefinition'],
			['go-to-type-definition', 'editor.action.revealTypeDefinition'],
			['go-to-implementation', 'editor.action.goToImplementation'],
			['go-to-references', 'editor.action.referenceSearch.trigger'],
			['peek-definition', 'editor.action.peekDefinition'],
			['cursor-top', 'cursorTop'],
			['cursor-bottom', 'cursorBottom'],
			['scroll-to-top', 'editor.action.scrollToTop'],
			['scroll-to-bottom', 'editor.action.scrollToBottom'],
			['jump-to-matching-bracket', 'editor.action.jumpToBracket'],
		]

		it.each(editorActionIds)('command %s dispatches editor-action with actionId "%s"', (cmdId, actionId) => {
			const spy = vi.spyOn(window, 'dispatchEvent')
			renderCommands().result.current.find(c => c.id === cmdId)!.action()
			expect(spy).toHaveBeenCalledWith(expect.objectContaining({
				type: 'editor-action', detail: { actionId },
			}))
			spy.mockRestore()
		})
	})

	// ===== Editing command actions =====

	describe('editing command actions', () => {
		const editingActionIds: [string, string][] = [
			['toggle-line-comment', 'editor.action.commentLine'],
			['toggle-block-comment', 'editor.action.blockComment'],
			['find-replace', 'editor.action.startFindReplaceAction'],
			['move-line-up', 'editor.action.moveLinesUpAction'],
			['move-line-down', 'editor.action.moveLinesDownAction'],
			['copy-line-up', 'editor.action.copyLinesUpAction'],
			['copy-line-down', 'editor.action.copyLinesDownAction'],
			['delete-line', 'editor.action.deleteLines'],
			['insert-line-below', 'editor.action.insertLineAfter'],
			['insert-line-above', 'editor.action.insertLineBefore'],
			['join-lines', 'editor.action.joinLines'],
			['trim-trailing-whitespace', 'editor.action.trimTrailingWhitespace'],
			['sort-lines-ascending', 'editor.action.sortLinesAscending'],
			['sort-lines-descending', 'editor.action.sortLinesDescending'],
			['organize-imports', 'editor.action.organizeImports'],
			['transform-uppercase', 'editor.action.transformToUppercase'],
			['transform-lowercase', 'editor.action.transformToLowercase'],
			['rename-symbol', 'editor.action.rename'],
			['add-cursor-above', 'editor.action.insertCursorAbove'],
			['add-cursor-below', 'editor.action.insertCursorBelow'],
			['cursor-undo', 'editor.action.cursorUndo'],
			['expand-selection', 'editor.action.smartSelect.expand'],
			['shrink-selection', 'editor.action.smartSelect.shrink'],
			['editor-undo', 'undo'],
			['editor-redo', 'redo'],
			['editor-cut', 'editor.action.clipboardCutAction'],
			['editor-copy', 'editor.action.clipboardCopyAction'],
			['editor-paste', 'editor.action.clipboardPasteAction'],
			['indent-lines', 'editor.action.indent'],
			['outdent-lines', 'editor.action.outdent'],
			['format-selection', 'editor.action.formatSelection'],
			['transpose', 'editor.action.transposeLetters'],
			['toggle-match-case', 'editor.action.toggleFindCaseSensitive'],
			['toggle-whole-word', 'editor.action.toggleFindWholeWord'],
			['toggle-regex', 'editor.action.toggleFindRegex'],
			['quick-fix', 'editor.action.quickFix'],
			['find-next', 'editor.action.nextMatchFindAction'],
			['find-previous', 'editor.action.previousMatchFindAction'],
			['add-selection-next-find-match', 'editor.action.addSelectionToNextFindMatch'],
			['select-all-highlights', 'editor.action.selectHighlights'],
			['add-cursors-to-line-ends', 'editor.action.addCursorsToLineEnds'],
			['select-line', 'editor.action.expandLineSelection'],
			['select-to-bracket', 'editor.action.selectToBracket'],
			['fold-region', 'editor.fold'],
			['unfold-region', 'editor.unfold'],
			['fold-recursively', 'editor.foldRecursively'],
			['unfold-recursively', 'editor.unfoldRecursively'],
			['change-all-occurrences', 'editor.action.selectHighlights'],
		]

		it.each(editingActionIds)('command %s dispatches editor-action with actionId "%s"', (cmdId, actionId) => {
			const spy = vi.spyOn(window, 'dispatchEvent')
			renderCommands().result.current.find(c => c.id === cmdId)!.action()
			expect(spy).toHaveBeenCalledWith(expect.objectContaining({
				type: 'editor-action', detail: { actionId },
			}))
			spy.mockRestore()
		})
	})

	// ===== Git command actions =====

	describe('git command actions', () => {
		it('git-push calls getBranch then push', async () => {
			const { gitApi } = await import('../services')
			renderCommands().result.current.find(c => c.id === 'git-push')!.action()
			await vi.waitFor(() => {
				expect(gitApi.getBranch).toHaveBeenCalled()
				expect(gitApi.push).toHaveBeenCalledWith('origin', 'main')
				expect(mockAddToast).toHaveBeenCalledWith('success', 'Pushed', expect.any(String))
			})
		})

		it('git-push handles error', async () => {
			const { gitApi } = await import('../services')
			;(gitApi.push as any).mockRejectedValueOnce(new Error('Push rejected'))
			renderCommands().result.current.find(c => c.id === 'git-push')!.action()
			await vi.waitFor(() => {
				expect(mockAddToast).toHaveBeenCalledWith('error', 'Push failed', 'Push rejected')
			})
		})

		it('git-push handles non-Error error', async () => {
			const { gitApi } = await import('../services')
			;(gitApi.push as any).mockRejectedValueOnce('fail')
			renderCommands().result.current.find(c => c.id === 'git-push')!.action()
			await vi.waitFor(() => {
				expect(mockAddToast).toHaveBeenCalledWith('error', 'Push failed', 'Unknown')
			})
		})

		it('git-pull calls getBranch then pull and dispatches refresh event', async () => {
			const { gitApi } = await import('../services')
			const spy = vi.spyOn(window, 'dispatchEvent')
			renderCommands().result.current.find(c => c.id === 'git-pull')!.action()
			await vi.waitFor(() => {
				expect(gitApi.pull).toHaveBeenCalledWith('origin', 'main')
			})
			expect(mockAddToast).toHaveBeenCalledWith('success', 'Pulled', expect.any(String))
			expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: 'refresh-git-status' }))
			spy.mockRestore()
		})

		it('git-pull handles error', async () => {
			const { gitApi } = await import('../services')
			;(gitApi.pull as any).mockRejectedValueOnce(new Error('Merge conflict'))
			renderCommands().result.current.find(c => c.id === 'git-pull')!.action()
			await vi.waitFor(() => {
				expect(mockAddToast).toHaveBeenCalledWith('error', 'Pull failed', 'Merge conflict')
			})
		})

		it('git-pull handles non-Error error', async () => {
			const { gitApi } = await import('../services')
			;(gitApi.pull as any).mockRejectedValueOnce(undefined)
			renderCommands().result.current.find(c => c.id === 'git-pull')!.action()
			await vi.waitFor(() => {
				expect(mockAddToast).toHaveBeenCalledWith('error', 'Pull failed', 'Unknown')
			})
		})

		it('git-stash calls stash API', async () => {
			const { gitApi } = await import('../services')
			renderCommands().result.current.find(c => c.id === 'git-stash')!.action()
			await vi.waitFor(() => {
				expect(gitApi.stash).toHaveBeenCalled()
			})
			expect(mockAddToast).toHaveBeenCalledWith('info', 'Stashed', 'Working changes stashed')
		})

		it('git-stash handles error', async () => {
			const { gitApi } = await import('../services')
			;(gitApi.stash as any).mockRejectedValueOnce(new Error('Stash error'))
			renderCommands().result.current.find(c => c.id === 'git-stash')!.action()
			await vi.waitFor(() => {
				expect(mockAddToast).toHaveBeenCalledWith('error', 'Stash failed', 'Stash error')
			})
		})

		it('git-stash handles non-Error error', async () => {
			const { gitApi } = await import('../services')
			;(gitApi.stash as any).mockRejectedValueOnce(null)
			renderCommands().result.current.find(c => c.id === 'git-stash')!.action()
			await vi.waitFor(() => {
				expect(mockAddToast).toHaveBeenCalledWith('error', 'Stash failed', 'Unknown')
			})
		})

		it('git-stash-pop calls stashPop API', async () => {
			const { gitApi } = await import('../services')
			renderCommands().result.current.find(c => c.id === 'git-stash-pop')!.action()
			await vi.waitFor(() => {
				expect(gitApi.stashPop).toHaveBeenCalled()
			})
			expect(mockAddToast).toHaveBeenCalledWith('info', 'Stash popped', 'Stashed changes restored')
		})

		it('git-stash-pop handles error', async () => {
			const { gitApi } = await import('../services')
			;(gitApi.stashPop as any).mockRejectedValueOnce(new Error('No stash'))
			renderCommands().result.current.find(c => c.id === 'git-stash-pop')!.action()
			await vi.waitFor(() => {
				expect(mockAddToast).toHaveBeenCalledWith('error', 'Stash pop failed', 'No stash')
			})
		})

		it('git-stash-pop handles non-Error error', async () => {
			const { gitApi } = await import('../services')
			;(gitApi.stashPop as any).mockRejectedValueOnce(false)
			renderCommands().result.current.find(c => c.id === 'git-stash-pop')!.action()
			await vi.waitFor(() => {
				expect(mockAddToast).toHaveBeenCalledWith('error', 'Stash pop failed', 'Unknown')
			})
		})

		it('git-undo-commit calls undoCommit API', async () => {
			const { gitApi } = await import('../services')
			renderCommands().result.current.find(c => c.id === 'git-undo-commit')!.action()
			await vi.waitFor(() => {
				expect(gitApi.undoCommit).toHaveBeenCalled()
			})
			expect(mockAddToast).toHaveBeenCalledWith('info', 'Commit undone', 'Last commit moved to staged changes')
		})

		it('git-undo-commit handles error', async () => {
			const { gitApi } = await import('../services')
			;(gitApi.undoCommit as any).mockRejectedValueOnce(new Error('No commits'))
			renderCommands().result.current.find(c => c.id === 'git-undo-commit')!.action()
			await vi.waitFor(() => {
				expect(mockAddToast).toHaveBeenCalledWith('error', 'Undo failed', 'No commits')
			})
		})

		it('git-undo-commit handles non-Error error', async () => {
			const { gitApi } = await import('../services')
			;(gitApi.undoCommit as any).mockRejectedValueOnce({ msg: 'bad' })
			renderCommands().result.current.find(c => c.id === 'git-undo-commit')!.action()
			await vi.waitFor(() => {
				expect(mockAddToast).toHaveBeenCalledWith('error', 'Undo failed', 'Unknown')
			})
		})
	})

	// ===== Symbol mode commands =====

	describe('symbol mode commands', () => {
		it('go-to-symbol calls openSymbolMode', () => {
			const localMock = vi.fn()
			renderCommands(localMock).result.current.find(c => c.id === 'go-to-symbol')!.action()
			expect(localMock).toHaveBeenCalled()
		})

		it('go-to-symbol-workspace calls openWorkspaceSymbolMode', () => {
			const localMock = vi.fn()
			renderCommands(vi.fn(), localMock).result.current.find(c => c.id === 'go-to-symbol-workspace')!.action()
			expect(localMock).toHaveBeenCalled()
		})
	})

	// ===== Category distribution =====

	describe('category distribution', () => {
		it('has commands in all expected categories', () => {
			const cmds = renderCommands().result.current
			const categories = new Set(cmds.map(c => c.category))
			expect(categories.has('navigation')).toBe(true)
			expect(categories.has('agent')).toBe(true)
			expect(categories.has('swarm')).toBe(true)
			expect(categories.has('settings')).toBe(true)
			expect(categories.has('view')).toBe(true)
			expect(categories.has('editing')).toBe(true)
		})

		it('editing category has many commands', () => {
			const cmds = renderCommands().result.current.filter(c => c.category === 'editing')
			expect(cmds.length).toBeGreaterThan(20)
		})

		it('settings category has commands', () => {
			const cmds = renderCommands().result.current.filter(c => c.category === 'settings')
			expect(cmds.length).toBeGreaterThan(5)
		})

		it('view category has commands', () => {
			const cmds = renderCommands().result.current.filter(c => c.category === 'view')
			expect(cmds.length).toBeGreaterThan(3)
		})
	})

	// ===== Shortcut verification =====

	describe('shortcut assignments', () => {
		const shortcutTests: [string, string][] = [
			['nav-settings', 'Ctrl+,'],
			['save', 'Ctrl+S'],
			['close-tab', 'Ctrl+W'],
			['go-to-line', 'Ctrl+G'],
			['toggle-zen-mode', 'Ctrl+K Z'],
			['toggle-color-theme', 'Ctrl+K Ctrl+T'],
			['increase-font-size', 'Ctrl+='],
			['decrease-font-size', 'Ctrl+-'],
			['reset-font-size', 'Ctrl+0'],
			['rename-symbol', 'F2'],
			['quick-fix', 'Ctrl+.'],
			['toggle-sidebar', 'Ctrl+B'],
			['toggle-terminal', 'Ctrl+~'],
			['toggle-full-screen', 'F11'],
			['reload-window', 'Ctrl+Shift+R'],
			['reopen-closed-tab', 'Ctrl+Shift+T'],
			['copy-path', 'Ctrl+K P'],
			['copy-relative-path', 'Ctrl+K Ctrl+P'],
			['find-in-files', 'Ctrl+Shift+F'],
			['replace-in-files', 'Ctrl+Shift+H'],
			['go-to-definition', 'F12'],
			['go-to-references', 'Shift+F12'],
			['peek-definition', 'Alt+F12'],
			['git-show-source-control', 'Ctrl+Shift+G'],
			['open-file', 'Ctrl+O'],
			['open-folder', 'Ctrl+K Ctrl+O'],
			['go-to-file', 'Ctrl+P'],
			['toggle-line-comment', 'Ctrl+/'],
			['toggle-block-comment', 'Shift+Alt+A'],
			['find-replace', 'Ctrl+H'],
			['delete-line', 'Ctrl+Shift+K'],
			['move-line-up', 'Alt+↑'],
			['move-line-down', 'Alt+↓'],
			['copy-line-up', 'Shift+Alt+↑'],
			['copy-line-down', 'Shift+Alt+↓'],
			['add-cursor-above', 'Ctrl+Alt+↑'],
			['add-cursor-below', 'Ctrl+Alt+↓'],
			['editor-undo', 'Ctrl+Z'],
			['editor-redo', 'Ctrl+Shift+Z'],
			['expand-selection', 'Shift+Alt+→'],
			['shrink-selection', 'Shift+Alt+←'],
			['show-problems', 'Ctrl+Shift+M'],
			['toggle-bottom-panel', 'Ctrl+J'],
			['toggle-output', 'Ctrl+Shift+U'],
			['toggle-debug-console', 'Ctrl+Shift+Y'],
			['go-to-next-error', 'F8'],
			['go-to-previous-error', 'Shift+F8'],
			['find-next', 'F3'],
			['find-previous', 'Shift+F3'],
			['add-selection-next-find-match', 'Ctrl+D'],
			['select-all-highlights', 'Ctrl+Shift+L'],
			['add-cursors-to-line-ends', 'Shift+Alt+I'],
			['select-line', 'Ctrl+L'],
			['navigate-back', 'Ctrl+Alt+←'],
			['navigate-forward', 'Ctrl+Alt+→'],
			['focus-group-1', 'Ctrl+1'],
			['focus-group-2', 'Ctrl+2'],
			['accessibility-help', 'Alt+F1'],
			['close-window', 'Ctrl+Shift+W'],
			['format-document', 'Shift+Alt+F'],
			['save-all', 'Ctrl+K S'],
			['cursor-undo', 'Ctrl+U'],
			['select-to-bracket', 'Ctrl+Shift+Alt+\\'],
			['fold-region', 'Ctrl+Shift+['],
			['unfold-region', 'Ctrl+Shift+]'],
			['fold-recursively', 'Ctrl+K Ctrl+['],
			['unfold-recursively', 'Ctrl+K Ctrl+]'],
			['change-all-occurrences', 'Ctrl+F2'],
			['jump-to-matching-bracket', 'Ctrl+Shift+\\'],
			['split-editor', 'Ctrl+\\'],
			['insert-line-below', 'Ctrl+Enter'],
			['insert-line-above', 'Ctrl+Shift+Enter'],
		]

		it.each(shortcutTests)('%s has shortcut "%s"', (cmdId, shortcut) => {
			const cmd = renderCommands().result.current.find(c => c.id === cmdId)!
			expect(cmd.shortcut).toBe(shortcut)
		})
	})

	// ===== Edge cases =====

	describe('edge cases', () => {
		it('handles empty agent list', () => {
			mockAgents.length = 0
			const cmds = renderCommands().result.current
			const agentCmds = cmds.filter(c => c.category === 'agent')
			expect(agentCmds.length).toBe(0)
			mockAgents.push(
				{ id: 'a1', name: 'Agent One', type: 'coder', state: 'idle' },
				{ id: 'a2', name: 'Agent Two', type: 'reviewer', state: 'executing' },
			)
		})

		it('handles agent in thinking state as running', () => {
			mockAgents[0].state = 'thinking'
			const cmds = renderCommands().result.current
			const stopCmd = cmds.find(c => c.id === 'agent-a1-stop')
			expect(stopCmd).toBeDefined()
			stopCmd!.action()
			expect(mockStopAgent).toHaveBeenCalledWith('a1')
			mockAgents[0].state = 'idle'
		})

		it('handles agent in waiting state as not running', () => {
			mockAgents[1].state = 'waiting'
			const cmds = renderCommands().result.current
			const startCmd = cmds.find(c => c.id === 'agent-a2-start')
			expect(startCmd).toBeDefined()
			startCmd!.action()
			expect(mockStartAgent).toHaveBeenCalledWith('a2')
			mockAgents[1].state = 'executing'
		})

		it('handles agent in error state as not running', () => {
			mockAgents[1].state = 'error'
			const cmds = renderCommands().result.current
			const startCmd = cmds.find(c => c.id === 'agent-a2-start')
			expect(startCmd).toBeDefined()
			mockAgents[1].state = 'executing'
		})

		it('all commands have valid category strings', () => {
			const validCategories = ['navigation', 'agent', 'swarm', 'settings', 'view', 'editing']
			for (const cmd of renderCommands().result.current) {
				expect(validCategories).toContain(cmd.category)
			}
		})

		it('swarmInfoToSwarm with nested stats', async () => {
			mockStartSwarm.mockResolvedValueOnce({
				id: 'sw1', name: 'Detailed', topology: 'star', strategy: 'sequential',
				status: 'active', agents: ['a1'], agentCount: 1, taskCount: 5,
				stats: { agentCount: 3, idleAgents: 1, executingAgents: 2, pendingTasks: 10, completedTasks: 7, topology: 'star', strategy: 'sequential', state: 'active' },
			})
			const cmd = renderCommands().result.current.find(c => c.id === 'swarm-start')!
			await cmd.action()
			const callArg = mockSetActiveSwarm.mock.calls[0][0]
			expect(callArg.id).toBe('sw1')
			expect(callArg.name).toBe('Detailed')
			expect(callArg.topology).toBe('star')
			expect(callArg.stats.agentCount).toBe(3)
			expect(callArg.stats.executingAgents).toBe(2)
			expect(callArg.stats.pendingTasks).toBe(10)
			expect(callArg.stats.completedTasks).toBe(7)
		})

		it('swarmInfoToSwarm falls back to top-level fields when stats not present', async () => {
			mockStartSwarm.mockResolvedValueOnce({
				id: 'sw2', name: 'Fallback', topology: 'mesh', strategy: 'parallel',
				status: 'active', agents: [], agentCount: 5, taskCount: 12,
			})
			const cmd = renderCommands().result.current.find(c => c.id === 'swarm-start')!
			await cmd.action()
			const callArg = mockSetActiveSwarm.mock.calls[0][0]
			expect(callArg.stats.agentCount).toBe(5)
			expect(callArg.stats.pendingTasks).toBe(12)
			expect(callArg.stats.idleAgents).toBe(0)
			expect(callArg.stats.completedTasks).toBe(0)
		})

		it('swarmInfoToSwarm uses state field with fallback to status', async () => {
			mockStartSwarm.mockResolvedValueOnce({
				id: 'sw3', name: 'StateTest', topology: 'ring', strategy: 'pipeline',
				state: 'paused', agents: [], agentCount: 2, taskCount: 3,
			})
			const cmd = renderCommands().result.current.find(c => c.id === 'swarm-start')!
			await cmd.action()
			const callArg = mockSetActiveSwarm.mock.calls[0][0]
			expect(callArg.state).toBe('paused')
			expect(callArg.stats.state).toBe('paused')
		})

		it('swarmInfoToSwarm filters agents by id list', async () => {
			mockStartSwarm.mockResolvedValueOnce({
				id: 'sw4', name: 'AgentTest', topology: 'mesh', strategy: 'parallel',
				status: 'active', agents: ['a1', 'a2'], agentCount: 2, taskCount: 0,
			})
			const cmd = renderCommands().result.current.find(c => c.id === 'swarm-start')!
			await cmd.action()
			const callArg = mockSetActiveSwarm.mock.calls[0][0]
			expect(callArg.agents.length).toBe(2)
			expect(callArg.agents[0].id).toBe('a1')
			expect(callArg.agents[1].id).toBe('a2')
		})

		it('swarmInfoToSwarm handles undefined agents list', async () => {
			mockStartSwarm.mockResolvedValueOnce({
				id: 'sw5', name: 'NoAgents', topology: 'star', strategy: 'sequential',
				status: 'active', agentCount: 0, taskCount: 0,
			})
			const cmd = renderCommands().result.current.find(c => c.id === 'swarm-start')!
			await cmd.action()
			const callArg = mockSetActiveSwarm.mock.calls[0][0]
			expect(callArg.agents).toEqual([])
		})

		it('swarmInfoToSwarm handles missing top-level fields', async () => {
			mockStartSwarm.mockResolvedValueOnce({
				id: 'sw6', name: 'Minimal', topology: 'mesh', strategy: 'parallel',
				status: 'active', agents: [],
			})
			const cmd = renderCommands().result.current.find(c => c.id === 'swarm-start')!
			await cmd.action()
			const callArg = mockSetActiveSwarm.mock.calls[0][0]
			// When no stats and no top-level agentCount/taskCount, values come from ?? which is undefined
			expect(callArg.stats.idleAgents).toBe(0)
			expect(callArg.stats.executingAgents).toBe(0)
			expect(callArg.stats.completedTasks).toBe(0)
		})

		it('git-push slices output to 80 chars', async () => {
			const { gitApi } = await import('../services')
			const longOutput = 'a'.repeat(200)
			;(gitApi.push as any).mockResolvedValueOnce({ output: longOutput })
			renderCommands().result.current.find(c => c.id === 'git-push')!.action()
			await vi.waitFor(() => {
				expect(mockAddToast).toHaveBeenCalledWith('success', 'Pushed', 'a'.repeat(80))
			})
		})

		it('git-pull slices output to 80 chars', async () => {
			const { gitApi } = await import('../services')
			const longOutput = 'b'.repeat(200)
			;(gitApi.pull as any).mockResolvedValueOnce({ output: longOutput })
			renderCommands().result.current.find(c => c.id === 'git-pull')!.action()
			await vi.waitFor(() => {
				expect(mockAddToast).toHaveBeenCalledWith('success', 'Pulled', 'b'.repeat(80))
			})
		})
	})
})

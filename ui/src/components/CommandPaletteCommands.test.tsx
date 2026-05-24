import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
	useNavigate: () => vi.fn(),
}))

// Mock appStore
const mockAgents = [
	{ id: 'a1', name: 'Agent One', type: 'coder', state: 'idle' },
	{ id: 'a2', name: 'Agent Two', type: 'reviewer', state: 'executing' },
]
const mockAddToast = vi.fn()
const mockSetActiveSwarm = vi.fn()
const mockStartAgent = vi.fn()
const mockStopAgent = vi.fn()

vi.mock('../store/appStore', () => ({
	useAppStore: (selector?: any) => {
		const state = {
			agents: mockAgents,
			activeSwarm: { id: 'sw1', name: 'Test Swarm' },
			setActiveSwarm: mockSetActiveSwarm,
			startAgent: mockStartAgent,
			stopAgent: mockStopAgent,
			addToast: mockAddToast,
		}
		return selector ? selector(state) : state
	},
}))

vi.mock('../stores/workspaceStore', () => ({
	useWorkspaceStore: {
		getState: () => ({
			currentFile: '/test/file.ts',
			workspacePath: '/test',
			openFiles: ['/test/file.ts', '/test/other.ts'],
			undoCloseFile: vi.fn().mockResolvedValue(undefined),
			openFile: vi.fn().mockResolvedValue(undefined),
		}),
	},
}))

vi.mock('../services', () => ({
	api: {
		swarm: {
			startSwarm: vi.fn().mockResolvedValue({ id: 'sw1', name: 'Test', topology: 'mesh', strategy: 'round_robin', agents: [] }),
			stopSwarm: vi.fn().mockResolvedValue({ id: 'sw1', name: 'Test', topology: 'mesh', strategy: 'round_robin', agents: [] }),
		},
	},
	gitApi: {
		getBranch: vi.fn().mockResolvedValue('main'),
		push: vi.fn().mockResolvedValue({ output: 'pushed' }),
		pull: vi.fn().mockResolvedValue({ output: 'pulled' }),
		stash: vi.fn().mockResolvedValue(undefined),
		stashPop: vi.fn().mockResolvedValue(undefined),
		undoCommit: vi.fn().mockResolvedValue(undefined),
	},
}))

vi.mock('../utils', () => ({
	logger: { warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}))

import { useCommandActions } from './CommandPaletteCommands'

describe('useCommandActions', () => {
	const mockOpenSymbolMode = vi.fn()
	const mockOpenWorkspaceSymbolMode = vi.fn()

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('returns an array of commands', () => {
		const { result } = renderHook(() =>
			useCommandActions(mockOpenSymbolMode, mockOpenWorkspaceSymbolMode)
		)
		expect(Array.isArray(result.current)).toBe(true)
		expect(result.current.length).toBeGreaterThan(50)
	})

	it('includes navigation commands', () => {
		const { result } = renderHook(() =>
			useCommandActions(mockOpenSymbolMode, mockOpenWorkspaceSymbolMode)
		)
		const ids = result.current.map(c => c.id)
		expect(ids).toContain('nav-editor')
		expect(ids).toContain('nav-swarm')
		expect(ids).toContain('nav-team')
		expect(ids).toContain('nav-settings')
	})

	it('includes swarm commands', () => {
		const { result } = renderHook(() =>
			useCommandActions(mockOpenSymbolMode, mockOpenWorkspaceSymbolMode)
		)
		const ids = result.current.map(c => c.id)
		expect(ids).toContain('swarm-create')
		expect(ids).toContain('swarm-start')
		expect(ids).toContain('swarm-stop')
	})

	it('includes editor toggle commands', () => {
		const { result } = renderHook(() =>
			useCommandActions(mockOpenSymbolMode, mockOpenWorkspaceSymbolMode)
		)
		const ids = result.current.map(c => c.id)
		expect(ids).toContain('toggle-minimap')
		expect(ids).toContain('toggle-word-wrap')
		expect(ids).toContain('toggle-zen-mode')
		expect(ids).toContain('toggle-color-theme')
	})

	it('includes tab management commands', () => {
		const { result } = renderHook(() =>
			useCommandActions(mockOpenSymbolMode, mockOpenWorkspaceSymbolMode)
		)
		const ids = result.current.map(c => c.id)
		expect(ids).toContain('close-all-tabs')
		expect(ids).toContain('close-tab')
		expect(ids).toContain('next-tab')
		expect(ids).toContain('prev-tab')
	})

	it('includes panel toggle commands', () => {
		const { result } = renderHook(() =>
			useCommandActions(mockOpenSymbolMode, mockOpenWorkspaceSymbolMode)
		)
		const ids = result.current.map(c => c.id)
		expect(ids).toContain('toggle-sidebar')
		expect(ids).toContain('toggle-terminal')
		expect(ids).toContain('split-editor')
	})

	it('includes editing commands', () => {
		const { result } = renderHook(() =>
			useCommandActions(mockOpenSymbolMode, mockOpenWorkspaceSymbolMode)
		)
		const ids = result.current.map(c => c.id)
		expect(ids).toContain('toggle-line-comment')
		expect(ids).toContain('find-replace')
		expect(ids).toContain('rename-symbol')
		expect(ids).toContain('quick-fix')
	})

	it('includes git commands', () => {
		const { result } = renderHook(() =>
			useCommandActions(mockOpenSymbolMode, mockOpenWorkspaceSymbolMode)
		)
		const ids = result.current.map(c => c.id)
		expect(ids).toContain('git-push')
		expect(ids).toContain('git-pull')
		expect(ids).toContain('git-stash')
		expect(ids).toContain('git-checkout')
	})

	it('includes symbol navigation commands', () => {
		const { result } = renderHook(() =>
			useCommandActions(mockOpenSymbolMode, mockOpenWorkspaceSymbolMode)
		)
		const ids = result.current.map(c => c.id)
		expect(ids).toContain('go-to-symbol')
		expect(ids).toContain('go-to-symbol-workspace')
	})

	it('generates agent commands for each agent', () => {
		const { result } = renderHook(() =>
			useCommandActions(mockOpenSymbolMode, mockOpenWorkspaceSymbolMode)
		)
		const agentCmds = result.current.filter(c => c.category === 'agent')
		expect(agentCmds.length).toBe(2)
		const labels = agentCmds.map(c => c.label)
		expect(labels.some(l => l.includes('Start Agent: Agent One'))).toBe(true)
		expect(labels.some(l => l.includes('Stop Agent: Agent Two'))).toBe(true)
	})

	it('all commands have required fields', () => {
		const { result } = renderHook(() =>
			useCommandActions(mockOpenSymbolMode, mockOpenWorkspaceSymbolMode)
		)
		for (const cmd of result.current) {
			expect(cmd.id).toBeTruthy()
			expect(cmd.label).toBeTruthy()
			expect(cmd.icon).toBeDefined()
			expect(typeof cmd.action).toBe('function')
			expect(['navigation', 'agent', 'swarm', 'settings', 'view', 'editing']).toContain(cmd.category)
		}
	})

	it('symbol mode callbacks work', () => {
		const { result } = renderHook(() =>
			useCommandActions(mockOpenSymbolMode, mockOpenWorkspaceSymbolMode)
		)
		const symbolCmd = result.current.find(c => c.id === 'go-to-symbol')
		expect(symbolCmd).toBeDefined()
		symbolCmd!.action()
		expect(mockOpenSymbolMode).toHaveBeenCalled()

		const wsSymbolCmd = result.current.find(c => c.id === 'go-to-symbol-workspace')
		expect(wsSymbolCmd).toBeDefined()
		wsSymbolCmd!.action()
		expect(mockOpenWorkspaceSymbolMode).toHaveBeenCalled()
	})

	it('commands have unique IDs', () => {
		const { result } = renderHook(() =>
			useCommandActions(mockOpenSymbolMode, mockOpenWorkspaceSymbolMode)
		)
		const ids = result.current.map(c => c.id)
		const uniqueIds = new Set(ids)
		expect(uniqueIds.size).toBe(ids.length)
	})
})

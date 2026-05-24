import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAgentLifecycleStore } from './agentLifecycleStore'

const mockGetAgents = vi.fn().mockResolvedValue([])
const mockGetAgentCards = vi.fn().mockResolvedValue([])
const mockFindAgentsByCapability = vi.fn().mockResolvedValue([])

const eventHandlers: Record<string, (payload: any) => void> = {}

vi.mock('../services', () => ({
  api: {
    agent: {
      getAgents: (...args: any[]) => mockGetAgents(...args),
    },
    a2a: {
      getAgentCards: (...args: any[]) => mockGetAgentCards(...args),
      findAgentsByCapability: (...args: any[]) => mockFindAgentsByCapability(...args),
    },
    events: {
      onAgentStatusChange: (handler: any) => { eventHandlers['agent_status_change'] = handler; return vi.fn() },
      onAgentTurnStart: (handler: any) => { eventHandlers['agent_turn_start'] = handler; return vi.fn() },
      onAgentTurnEnd: (handler: any) => { eventHandlers['agent_turn_end'] = handler; return vi.fn() },
      onAgentStuck: (handler: any) => { eventHandlers['agent_stuck'] = handler; return vi.fn() },
      onAgentRecovered: (handler: any) => { eventHandlers['agent_recovered'] = handler; return vi.fn() },
      onAgentHealthDegraded: (handler: any) => { eventHandlers['agent_health_degraded'] = handler; return vi.fn() },
      onSupervisorAlert: (handler: any) => { eventHandlers['supervisor_alert'] = handler; return vi.fn() },
    },
  },
}))

vi.mock('../utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

describe('agentLifecycleStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset store state
    const store = useAgentLifecycleStore.getState()
    store.agents = new Map()
    store.activeTurns = new Map()
    store.healthAlerts = []
    store.agentCards = new Map()
    store.connectedAgents = new Set()
  })

  describe('getAgentState', () => {
    it('returns offline for unknown agent', () => {
      expect(useAgentLifecycleStore.getState().getAgentState('unknown')).toBe('offline')
    })

    it('returns correct state for known agent', () => {
      const agents = new Map()
      agents.set('a1', { agentId: 'a1', name: 'Test', state: 'executing', lastActive: '', capabilities: [] })
      useAgentLifecycleStore.setState({ agents })
      expect(useAgentLifecycleStore.getState().getAgentState('a1')).toBe('executing')
    })
  })

  describe('getAgentAlerts', () => {
    it('returns empty array for agent with no alerts', () => {
      expect(useAgentLifecycleStore.getState().getAgentAlerts('a1')).toEqual([])
    })

    it('returns alerts matching agentId', () => {
      useAgentLifecycleStore.setState({
        healthAlerts: [
          { id: 'h1', agentId: 'a1', type: 'stuck', message: 'stuck', timestamp: '', level: 'error' },
          { id: 'h2', agentId: 'a2', type: 'degraded', message: 'degraded', timestamp: '', level: 'warning' },
        ],
      })
      expect(useAgentLifecycleStore.getState().getAgentAlerts('a1')).toHaveLength(1)
      expect(useAgentLifecycleStore.getState().getAgentAlerts('a1')[0].type).toBe('stuck')
    })
  })

  describe('clearAlerts', () => {
    it('clears all health alerts', () => {
      useAgentLifecycleStore.setState({
        healthAlerts: [
          { id: 'h1', agentId: 'a1', type: 'stuck', message: 'stuck', timestamp: '', level: 'error' },
        ],
      })
      useAgentLifecycleStore.getState().clearAlerts()
      expect(useAgentLifecycleStore.getState().healthAlerts).toEqual([])
    })
  })

  describe('subscribe - initial load', () => {
    it('loads agents from API', async () => {
      mockGetAgents.mockResolvedValueOnce([
        { id: 'a1', name: 'Agent 1', state: 'idle', capabilities: ['code'] },
        { id: 'a2', name: 'Agent 2', state: 'error', capabilities: [] },
      ])
      mockGetAgentCards.mockResolvedValueOnce([])

      useAgentLifecycleStore.getState().subscribe()
      await vi.waitFor(() => {
        expect(useAgentLifecycleStore.getState().agents.size).toBe(2)
      })

      expect(useAgentLifecycleStore.getState().getAgentState('a1')).toBe('idle')
      expect(useAgentLifecycleStore.getState().getAgentState('a2')).toBe('error')
    })

    it('maps running state to executing', async () => {
      mockGetAgents.mockResolvedValueOnce([
        { id: 'a1', name: 'Agent 1', state: 'running' },
      ])
      mockGetAgentCards.mockResolvedValueOnce([])

      useAgentLifecycleStore.getState().subscribe()
      await vi.waitFor(() => {
        expect(useAgentLifecycleStore.getState().agents.size).toBe(1)
      })

      expect(useAgentLifecycleStore.getState().getAgentState('a1')).toBe('executing')
    })

    it('handles API failure gracefully', async () => {
      mockGetAgents.mockRejectedValueOnce(new Error('network'))
      mockGetAgentCards.mockRejectedValueOnce(new Error('network'))

      const cleanup = useAgentLifecycleStore.getState().subscribe()
      await vi.waitFor(() => expect(mockGetAgents).toHaveBeenCalled())
      // Store should remain empty, no crash
      expect(useAgentLifecycleStore.getState().agents.size).toBe(0)
      cleanup()
    })

    it('loads agent cards from A2A API', async () => {
      mockGetAgents.mockResolvedValueOnce([])
      mockGetAgentCards.mockResolvedValueOnce([
        { name: 'claude', capabilities: { streaming: true, mcp: false, fileTransfer: false }, tags: ['code'] },
        { name: 'gemini', capabilities: { streaming: false, mcp: true, fileTransfer: true }, tags: [], skills: [{ name: 'review' }] },
      ])

      useAgentLifecycleStore.getState().subscribe()
      await vi.waitFor(() => {
        expect(useAgentLifecycleStore.getState().agentCards.size).toBe(2)
      })

      const claude = useAgentLifecycleStore.getState().agentCards.get('claude')
      expect(claude?.capabilities).toContain('streaming')
      const gemini = useAgentLifecycleStore.getState().agentCards.get('gemini')
      expect(gemini?.capabilities).toContain('mcp')
      expect(gemini?.capabilities).toContain('fileTransfer')
      expect(gemini?.capabilities).toContain('review')
    })
  })

  describe('subscribe - event handlers', () => {
    beforeEach(() => {
      mockGetAgents.mockResolvedValue([])
      mockGetAgentCards.mockResolvedValue([])
    })

    it('handles agent_status_change event', async () => {
      useAgentLifecycleStore.getState().subscribe()
      await vi.waitFor(() => expect(mockGetAgents).toHaveBeenCalled())

      // Set agent state AFTER initial load completes
      const agents = new Map()
      agents.set('a1', { agentId: 'a1', name: 'Agent 1', state: 'idle', lastActive: '', capabilities: [] })
      useAgentLifecycleStore.setState({ agents })

      eventHandlers['agent_status_change']({ agentId: 'a1', state: 'thinking' })
      expect(useAgentLifecycleStore.getState().getAgentState('a1')).toBe('thinking')
    })

    it('handles agent_turn_start event', async () => {
      useAgentLifecycleStore.getState().subscribe()
      await vi.waitFor(() => expect(mockGetAgents).toHaveBeenCalled())

      const agents = new Map()
      agents.set('a1', { agentId: 'a1', name: 'Agent 1', state: 'idle', lastActive: '', capabilities: [] })
      useAgentLifecycleStore.setState({ agents })

      eventHandlers['agent_turn_start']({ agentId: 'a1', taskId: 't1', session: 's1' })
      expect(useAgentLifecycleStore.getState().getAgentState('a1')).toBe('executing')
      expect(useAgentLifecycleStore.getState().activeTurns.get('a1')?.taskId).toBe('t1')
    })

    it('handles agent_turn_end event', async () => {
      useAgentLifecycleStore.getState().subscribe()
      await vi.waitFor(() => expect(mockGetAgents).toHaveBeenCalled())

      const agents = new Map()
      agents.set('a1', { agentId: 'a1', name: 'Agent 1', state: 'executing', lastActive: '', capabilities: [] })
      const activeTurns = new Map()
      activeTurns.set('a1', { taskId: 't1', startedAt: '' })
      useAgentLifecycleStore.setState({ agents, activeTurns })

      eventHandlers['agent_turn_end']({ agentId: 'a1', taskId: 't1' })
      expect(useAgentLifecycleStore.getState().getAgentState('a1')).toBe('idle')
      expect(useAgentLifecycleStore.getState().activeTurns.has('a1')).toBe(false)
    })

    it('handles agent_stuck event', async () => {
      useAgentLifecycleStore.getState().subscribe()
      await vi.waitFor(() => expect(mockGetAgents).toHaveBeenCalled())

      const agents = new Map()
      agents.set('a1', { agentId: 'a1', name: 'Agent 1', state: 'executing', lastActive: '', capabilities: [] })
      useAgentLifecycleStore.setState({ agents })

      eventHandlers['agent_stuck']({ agentId: 'a1', taskId: 't1', duration: 30000 })
      expect(useAgentLifecycleStore.getState().getAgentState('a1')).toBe('stuck')
      expect(useAgentLifecycleStore.getState().healthAlerts).toHaveLength(1)
      expect(useAgentLifecycleStore.getState().healthAlerts[0].type).toBe('stuck')
      expect(useAgentLifecycleStore.getState().healthAlerts[0].level).toBe('error')
    })

    it('handles agent_recovered event', async () => {
      useAgentLifecycleStore.getState().subscribe()
      await vi.waitFor(() => expect(mockGetAgents).toHaveBeenCalled())

      const agents = new Map()
      agents.set('a1', { agentId: 'a1', name: 'Agent 1', state: 'idle', lastActive: '', capabilities: [] })
      useAgentLifecycleStore.setState({ agents })

      // Trigger stuck first (which saves 'idle' to previousStates)
      eventHandlers['agent_stuck']({ agentId: 'a1', taskId: 't1', duration: 10000 })
      expect(useAgentLifecycleStore.getState().getAgentState('a1')).toBe('stuck')

      // Clear alerts from stuck event to test recovered alert
      useAgentLifecycleStore.getState().clearAlerts()

      // Now trigger recovered
      eventHandlers['agent_recovered']({ agentId: 'a1', taskId: 't1' })
      expect(useAgentLifecycleStore.getState().getAgentState('a1')).toBe('idle')
      expect(useAgentLifecycleStore.getState().healthAlerts[0].type).toBe('recovered')
      expect(useAgentLifecycleStore.getState().healthAlerts[0].level).toBe('info')
    })

    it('handles agent_health_degraded event', async () => {
      useAgentLifecycleStore.getState().subscribe()
      await vi.waitFor(() => expect(mockGetAgents).toHaveBeenCalled())

      eventHandlers['agent_health_degraded']({ agentId: 'a1', health: 0.3, message: 'Health low' })
      expect(useAgentLifecycleStore.getState().healthAlerts).toHaveLength(1)
      expect(useAgentLifecycleStore.getState().healthAlerts[0].type).toBe('degraded')
      expect(useAgentLifecycleStore.getState().healthAlerts[0].level).toBe('warning')
    })

    it('handles supervisor_alert event', async () => {
      useAgentLifecycleStore.getState().subscribe()
      await vi.waitFor(() => expect(mockGetAgents).toHaveBeenCalled())

      eventHandlers['supervisor_alert']({ level: 'critical', agentId: 'a1', message: 'Agent unresponsive' })
      expect(useAgentLifecycleStore.getState().healthAlerts).toHaveLength(1)
      expect(useAgentLifecycleStore.getState().healthAlerts[0].type).toBe('supervisor')
      expect(useAgentLifecycleStore.getState().healthAlerts[0].level).toBe('error')
    })

    it('trims health alerts to max 50', async () => {
      useAgentLifecycleStore.getState().subscribe()
      await vi.waitFor(() => expect(mockGetAgents).toHaveBeenCalled())

      const alerts = Array.from({ length: 55 }, (_, i) => ({
        id: `h${i}`, agentId: 'a1', type: 'stuck' as const, message: `stuck ${i}`, timestamp: '', level: 'error' as const,
      }))
      useAgentLifecycleStore.setState({ healthAlerts: alerts })

      eventHandlers['agent_health_degraded']({ agentId: 'a1', health: 0.1 })
      // trimAlerts: 55 + 1 = 56, then sliced to last 50
      expect(useAgentLifecycleStore.getState().healthAlerts).toHaveLength(50)
    })
  })

  describe('refreshAgentCards', () => {
    it('refreshes agent cards from API', async () => {
      mockGetAgentCards.mockResolvedValueOnce([
        { name: 'claude', capabilities: { streaming: true, mcp: false, fileTransfer: false }, tags: [] },
      ])

      await useAgentLifecycleStore.getState().refreshAgentCards()
      expect(useAgentLifecycleStore.getState().agentCards.size).toBe(1)
      expect(useAgentLifecycleStore.getState().agentCards.get('claude')?.capabilities).toContain('streaming')
    })

    it('handles API failure gracefully', async () => {
      mockGetAgentCards.mockRejectedValueOnce(new Error('fail'))
      await useAgentLifecycleStore.getState().refreshAgentCards()
      expect(useAgentLifecycleStore.getState().agentCards.size).toBe(0)
    })
  })

  describe('findAgentsByCapability', () => {
    it('finds agents with specific capability', async () => {
      mockFindAgentsByCapability.mockResolvedValueOnce([
        { name: 'claude', capabilities: { streaming: true }, tags: [] },
      ])

      const result = await useAgentLifecycleStore.getState().findAgentsByCapability('streaming')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('claude')
    })

    it('returns empty array on API failure', async () => {
      mockFindAgentsByCapability.mockRejectedValueOnce(new Error('fail'))
      const result = await useAgentLifecycleStore.getState().findAgentsByCapability('code')
      expect(result).toEqual([])
    })
  })

  describe('state mapping', () => {
    it('maps unknown state to offline', async () => {
      mockGetAgents.mockResolvedValueOnce([
        { id: 'a1', name: 'Agent 1', state: 'unknown_state' },
      ])
      mockGetAgentCards.mockResolvedValueOnce([])

      useAgentLifecycleStore.getState().subscribe()
      await vi.waitFor(() => {
        expect(useAgentLifecycleStore.getState().agents.size).toBe(1)
      })

      expect(useAgentLifecycleStore.getState().getAgentState('a1')).toBe('offline')
    })

    it('maps stopped state to idle', async () => {
      mockGetAgents.mockResolvedValueOnce([
        { id: 'a1', name: 'Agent 1', state: 'stopped' },
      ])
      mockGetAgentCards.mockResolvedValueOnce([])

      useAgentLifecycleStore.getState().subscribe()
      await vi.waitFor(() => {
        expect(useAgentLifecycleStore.getState().agents.size).toBe(1)
      })

      expect(useAgentLifecycleStore.getState().getAgentState('a1')).toBe('idle')
    })

    it('maps waiting state to idle', async () => {
      mockGetAgents.mockResolvedValueOnce([
        { id: 'a1', name: 'Agent 1', state: 'waiting' },
      ])
      mockGetAgentCards.mockResolvedValueOnce([])

      useAgentLifecycleStore.getState().subscribe()
      await vi.waitFor(() => {
        expect(useAgentLifecycleStore.getState().agents.size).toBe(1)
      })

      expect(useAgentLifecycleStore.getState().getAgentState('a1')).toBe('idle')
    })
  })
})

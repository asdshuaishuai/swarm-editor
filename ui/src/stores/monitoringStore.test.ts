import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useMonitoringStore } from './monitoringStore'
import type { AuditEvent } from '../services'

const mockListAuditEvents = vi.fn().mockResolvedValue([])
const mockGetAuditStats = vi.fn().mockResolvedValue(null)
const mockGetServers = vi.fn().mockResolvedValue([])
const mockScanServers = vi.fn().mockResolvedValue([])
const mockScanSkills = vi.fn().mockResolvedValue([])
const mockGetStatus = vi.fn().mockResolvedValue(null)
const mockGetMessageLog = vi.fn().mockResolvedValue([])
const mockSubscribe = vi.fn().mockReturnValue(vi.fn())

vi.mock('../services', () => ({
  api: {
    monitoring: {
      listAuditEvents: (...args: any[]) => mockListAuditEvents(...args),
      getAuditStats: (...args: any[]) => mockGetAuditStats(...args),
    },
    mcp: {
      getServers: (...args: any[]) => mockGetServers(...args),
      scanServers: (...args: any[]) => mockScanServers(...args),
    },
    agent: {
      scanSkills: (...args: any[]) => mockScanSkills(...args),
    },
    a2a: {
      getStatus: (...args: any[]) => mockGetStatus(...args),
      getMessageLog: (...args: any[]) => mockGetMessageLog(...args),
    },
  },
  events: {
    subscribe: (...args: any[]) => mockSubscribe(...args),
  },
}))

vi.mock('../utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

function makeEvent(overrides: Partial<AuditEvent> & { id: string }): AuditEvent {
  return {
    timestamp: new Date().toISOString(),
    eventType: 'test',
    actor: 'system',
    action: 'test_action',
    resourceType: 'resource',
    resourceId: 'r1',
    success: true,
    ...overrides,
  }
}

describe('monitoringStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useMonitoringStore.setState({
      auditEvents: [],
      auditStats: null,
      auditEnabled: true,
      acpPackets: [],
      a2aMessages: [],
      mcpInvocations: [],
      activityEntries: [],
      daemonLogs: [],
      mcpServers: [],
      skills: [],
      skillsScanInProgress: false,
      a2aStatus: null,
    })
  })

  describe('toggleAudit', () => {
    it('toggles audit enabled state', () => {
      expect(useMonitoringStore.getState().auditEnabled).toBe(true)
      useMonitoringStore.getState().toggleAudit()
      expect(useMonitoringStore.getState().auditEnabled).toBe(false)
      useMonitoringStore.getState().toggleAudit()
      expect(useMonitoringStore.getState().auditEnabled).toBe(true)
    })
  })

  describe('addAuditEvent', () => {
    it('adds event to auditEvents', () => {
      const event = makeEvent({ id: 'e1', eventType: 'consensus_reached' })
      useMonitoringStore.getState().addAuditEvent(event)
      expect(useMonitoringStore.getState().auditEvents).toHaveLength(1)
      expect(useMonitoringStore.getState().auditEvents[0].id).toBe('e1')
    })

    it('deduplicates by id', () => {
      const event = makeEvent({ id: 'e1', eventType: 'test' })
      useMonitoringStore.getState().addAuditEvent(event)
      useMonitoringStore.getState().addAuditEvent(event)
      expect(useMonitoringStore.getState().auditEvents).toHaveLength(1)
    })

    it('computes acpPackets from events', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'consensus_reached' }))
      expect(useMonitoringStore.getState().acpPackets).toHaveLength(1)
      expect(useMonitoringStore.getState().acpPackets[0].id).toBe('e1')
    })

    it('computes activityEntries from events', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'mcp_tool_call' }))
      expect(useMonitoringStore.getState().activityEntries).toHaveLength(1)
    })

    it('computes daemonLogs from events', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'daemon_init' }))
      expect(useMonitoringStore.getState().daemonLogs).toHaveLength(1)
    })

    it('classifies consensus as orchestrate packet type', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'consensus_reached' }))
      expect(useMonitoringStore.getState().acpPackets[0].type).toBe('ACP_ORCHESTRATE')
    })

    it('classifies a2a as A2A protocol packet type', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'a2a_message' }))
      expect(useMonitoringStore.getState().acpPackets[0].type).toBe('A2A_PROTOCOL')
    })

    it('classifies mcp as MCP tool invoked packet type', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'mcp_tool_call' }))
      expect(useMonitoringStore.getState().acpPackets[0].type).toBe('MCP_TOOL_INVOKED')
    })

    it('classifies permission as ACP privilege gate packet type', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'permission_granted' }))
      expect(useMonitoringStore.getState().acpPackets[0].type).toBe('ACP_PRIVILEGE_GATE')
    })

    it('classifies unknown events as INFO packet type', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'something_else' }))
      expect(useMonitoringStore.getState().acpPackets[0].type).toBe('INFO')
    })

    it('trims events to max 200', () => {
      for (let i = 0; i < 210; i++) {
        useMonitoringStore.getState().addAuditEvent(makeEvent({ id: `e${i}`, eventType: 'test' }))
      }
      expect(useMonitoringStore.getState().auditEvents).toHaveLength(200)
      expect(useMonitoringStore.getState().auditEvents[0].id).toBe('e10')
    })

    it('classifies skill_scan activity type', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'skill_scan_complete' }))
      expect(useMonitoringStore.getState().activityEntries[0].activityType).toBe('SKILL_SCAN')
    })

    it('classifies agent_start activity type', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'agent_start' }))
      expect(useMonitoringStore.getState().activityEntries[0].activityType).toBe('AGENT_START')
    })

    it('classifies agent_stop activity type', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'agent_stop' }))
      expect(useMonitoringStore.getState().activityEntries[0].activityType).toBe('AGENT_STOP')
    })

    it('classifies hitl_passed activity type', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'hitl_passed' }))
      expect(useMonitoringStore.getState().activityEntries[0].activityType).toBe('HITL_PASSED')
    })

    it('classifies hitl_denied activity type', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'hitl_denied' }))
      expect(useMonitoringStore.getState().activityEntries[0].activityType).toBe('HITL_DENIED')
      expect(useMonitoringStore.getState().activityEntries[0].isWarning).toBe(true)
    })

    it('classifies daemon tag', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'daemon_init' }))
      expect(useMonitoringStore.getState().daemonLogs[0].tag).toBe('DAEMON')
    })

    it('classifies MCP tag', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'mcp_tool_call' }))
      expect(useMonitoringStore.getState().daemonLogs[0].tag).toBe('MCP')
    })

    it('classifies SKILL tag', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'skill_scan_start' }))
      expect(useMonitoringStore.getState().daemonLogs[0].tag).toBe('SKILL')
    })

    it('classifies HITL_TRIGGER tag', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'permission_request' }))
      expect(useMonitoringStore.getState().daemonLogs[0].tag).toBe('HITL_TRIGGER')
    })

    it('classifies unknown as SYSTEM tag', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'random_event' }))
      expect(useMonitoringStore.getState().daemonLogs[0].tag).toBe('SYSTEM')
    })

    it('handles undefined eventType in classifyActivity', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: undefined as unknown as string }))
      expect(useMonitoringStore.getState().activityEntries[0].activityType).toBe('INFO')
    })

    it('classifies EXEC activity for swarm events', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'task_created' }))
      expect(useMonitoringStore.getState().activityEntries[0].activityType).toBe('EXEC')
    })

    it('classifies EXEC activity for exec events', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'exec_run' }))
      expect(useMonitoringStore.getState().activityEntries[0].activityType).toBe('EXEC')
    })

    it('classifies EXEC activity for swarm keyword', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'swarm_update' }))
      expect(useMonitoringStore.getState().activityEntries[0].activityType).toBe('EXEC')
    })

    it('classifies GOAL_INIT for start events', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'workflow_start' }))
      expect(useMonitoringStore.getState().activityEntries[0].activityType).toBe('GOAL_INIT')
    })

    it('classifies GOAL_INIT for init events', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'project_init' }))
      expect(useMonitoringStore.getState().activityEntries[0].activityType).toBe('GOAL_INIT')
    })

    it('classifies BLUEPRINT for plan events', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'plan_created' }))
      expect(useMonitoringStore.getState().activityEntries[0].activityType).toBe('BLUEPRINT')
    })

    it('classifies TEST_SUCCESS for validation events', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'validation_passed' }))
      expect(useMonitoringStore.getState().activityEntries[0].activityType).toBe('TEST_SUCCESS')
    })

    it('classifies SECURITY_GATE for permission events', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'security_check' }))
      expect(useMonitoringStore.getState().activityEntries[0].activityType).toBe('SECURITY_GATE')
      expect(useMonitoringStore.getState().activityEntries[0].isWarning).toBe(true)
    })

    it('classifies HITL_PASSED for hitl pass events', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'hitl_pass_check' }))
      expect(useMonitoringStore.getState().activityEntries[0].activityType).toBe('HITL_PASSED')
    })

    it('classifies INFO for completely unmatched events', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'something_totally_random' }))
      expect(useMonitoringStore.getState().activityEntries[0].activityType).toBe('INFO')
    })

    it('handles undefined eventType in classifyTag', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: undefined as unknown as string }))
      expect(useMonitoringStore.getState().daemonLogs[0].tag).toBe('SYSTEM')
    })

    it('classifies EXEC tag for task events', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'task_complete' }))
      expect(useMonitoringStore.getState().daemonLogs[0].tag).toBe('EXEC')
    })

    it('classifies EXEC tag for swarm events', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'swarm_resize' }))
      expect(useMonitoringStore.getState().daemonLogs[0].tag).toBe('EXEC')
    })

    it('classifies DAEMON tag for start events', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'system_start' }))
      expect(useMonitoringStore.getState().daemonLogs[0].tag).toBe('DAEMON')
    })

    it('classifies DAEMON tag for init events', () => {
      useMonitoringStore.getState().addAuditEvent(makeEvent({ id: 'e1', eventType: 'component_init' }))
      expect(useMonitoringStore.getState().daemonLogs[0].tag).toBe('DAEMON')
    })
  })

  describe('addMCPInvocation', () => {
    it('adds invocation and trims to 200', () => {
      for (let i = 0; i < 210; i++) {
        useMonitoringStore.getState().addMCPInvocation({ id: `inv${i}`, serverId: 'test', toolName: 'tool', timestamp: '', args: {}, result: null, durationMs: 100 })
      }
      expect(useMonitoringStore.getState().mcpInvocations).toHaveLength(200)
    })
  })

  describe('refreshMCPServers', () => {
    it('triggers MCP scan', async () => {
      await useMonitoringStore.getState().refreshMCPServers()
      expect(mockScanServers).toHaveBeenCalled()
    })

    it('handles scan failure gracefully', async () => {
      mockScanServers.mockRejectedValueOnce(new Error('fail'))
      await useMonitoringStore.getState().refreshMCPServers()
      // Store unchanged (results arrive via event, not return value)
      expect(useMonitoringStore.getState().mcpServers).toHaveLength(0)
    })
  })

  describe('refreshSkills', () => {
    it('loads skills from API', async () => {
      mockScanSkills.mockResolvedValueOnce([
        { id: 'sk1', name: 'Skill 1', description: '', source: 'global', path: '' },
      ])
      await useMonitoringStore.getState().refreshSkills()
      expect(useMonitoringStore.getState().skills).toHaveLength(1)
      expect(useMonitoringStore.getState().skillsScanInProgress).toBe(false)
    })

    it('prevents concurrent scans', async () => {
      mockScanSkills.mockResolvedValueOnce([])
      useMonitoringStore.setState({ skillsScanInProgress: true })
      await useMonitoringStore.getState().refreshSkills()
      expect(mockScanSkills).not.toHaveBeenCalled()
    })

    it('resets scan flag on error', async () => {
      mockScanSkills.mockRejectedValueOnce(new Error('fail'))
      await useMonitoringStore.getState().refreshSkills()
      expect(useMonitoringStore.getState().skillsScanInProgress).toBe(false)
    })
  })

  describe('refreshAuditStats', () => {
    it('loads stats from API', async () => {
      mockGetAuditStats.mockResolvedValueOnce({ count: 42, enabled: true })
      await useMonitoringStore.getState().refreshAuditStats()
      expect(useMonitoringStore.getState().auditStats?.count).toBe(42)
    })

    it('handles API failure', async () => {
      mockGetAuditStats.mockRejectedValueOnce(new Error('fail'))
      await useMonitoringStore.getState().refreshAuditStats()
      expect(useMonitoringStore.getState().auditStats).toBeNull()
    })
  })

  describe('refreshA2A', () => {
    it('loads A2A status and messages', async () => {
      mockGetStatus.mockResolvedValueOnce({ status: 'connected' })
      mockGetMessageLog.mockResolvedValueOnce([{ id: 'm1', from: 'a', to: 'b', content: 'hi' }])
      await useMonitoringStore.getState().refreshA2A()
      expect(useMonitoringStore.getState().a2aStatus).toEqual({ status: 'connected' })
      expect(useMonitoringStore.getState().a2aMessages).toHaveLength(1)
    })

    it('handles A2A API failure', async () => {
      mockGetStatus.mockRejectedValueOnce(new Error('fail'))
      mockGetMessageLog.mockRejectedValueOnce(new Error('fail'))
      await useMonitoringStore.getState().refreshA2A()
      expect(useMonitoringStore.getState().a2aStatus).toBeNull()
      expect(useMonitoringStore.getState().a2aMessages).toHaveLength(0)
    })
  })

  describe('initialLoad', () => {
    it('loads initial data from APIs', async () => {
      mockListAuditEvents.mockResolvedValueOnce([
        makeEvent({ id: 'e1', eventType: 'test' }),
      ])
      mockGetAuditStats.mockResolvedValueOnce({ count: 1, enabled: true })
      mockScanServers.mockResolvedValueOnce({ status: 'scanning' })
      mockScanSkills.mockResolvedValueOnce({ status: 'scanning' })
      mockGetStatus.mockResolvedValueOnce({ status: 'ok' })
      mockGetMessageLog.mockResolvedValueOnce([])

      await useMonitoringStore.getState().initialLoad()
      expect(useMonitoringStore.getState().auditEvents).toHaveLength(1)
      // MCP servers arrive via mcp_servers_scanned event, not directly from scanServers
      expect(useMonitoringStore.getState().mcpServers).toHaveLength(0)
      expect(useMonitoringStore.getState().acpPackets).toHaveLength(1)
    })

    it('skips if already loaded', async () => {
      useMonitoringStore.setState({ auditEvents: [makeEvent({ id: 'e1', eventType: 'test' })] })
      await useMonitoringStore.getState().initialLoad()
      expect(mockListAuditEvents).not.toHaveBeenCalled()
    })

    it('handles all API failures', async () => {
      mockListAuditEvents.mockRejectedValueOnce(new Error('fail'))
      mockGetAuditStats.mockRejectedValueOnce(new Error('fail'))
      mockScanServers.mockRejectedValueOnce(new Error('fail'))
      mockGetStatus.mockResolvedValueOnce(null)
      mockGetMessageLog.mockResolvedValueOnce([])

      await useMonitoringStore.getState().initialLoad()
      expect(useMonitoringStore.getState().auditEvents).toHaveLength(0)
    })

    it('sets auditEnabled from stats.enabled', async () => {
      useMonitoringStore.setState({ auditEvents: [] })
      mockListAuditEvents.mockResolvedValueOnce([])
      mockGetAuditStats.mockResolvedValueOnce({ count: 0, enabled: false })
      mockScanServers.mockResolvedValueOnce([])
      mockGetStatus.mockResolvedValueOnce(null)
      mockGetMessageLog.mockResolvedValueOnce([])

      await useMonitoringStore.getState().initialLoad()
      expect(useMonitoringStore.getState().auditEnabled).toBe(false)
    })

    it('defaults auditEnabled to true when stats are null', async () => {
      useMonitoringStore.setState({ auditEvents: [], auditEnabled: false })
      mockListAuditEvents.mockResolvedValueOnce([])
      mockGetAuditStats.mockResolvedValueOnce(null)
      mockScanServers.mockResolvedValueOnce([])
      mockGetStatus.mockResolvedValueOnce(null)
      mockGetMessageLog.mockResolvedValueOnce([])

      await useMonitoringStore.getState().initialLoad()
      expect(useMonitoringStore.getState().auditEnabled).toBe(true)
    })
  })

  describe('subscribeToEvents', () => {
    /** Helper: get the callback registered for a given event name */
    function getCallback(eventName: string): (payload: unknown) => void {
      for (const call of mockSubscribe.mock.calls) {
        if (call[0] === eventName) return call[1]
      }
      throw new Error(`No subscription for event: ${eventName}`)
    }

    it('registers event subscriptions', () => {
      useMonitoringStore.getState().subscribeToEvents()
      expect(mockSubscribe).toHaveBeenCalledWith('audit_event', expect.any(Function))
      expect(mockSubscribe).toHaveBeenCalledWith('a2a_message', expect.any(Function))
      expect(mockSubscribe).toHaveBeenCalledWith('mcp_tool_invoked', expect.any(Function))
    })

    it('returns cleanup function that calls all unsubscribed', () => {
      const mockCleanup = vi.fn()
      mockSubscribe.mockReturnValue(mockCleanup)
      const cleanup = useMonitoringStore.getState().subscribeToEvents()
      expect(typeof cleanup).toBe('function')
      cleanup()
      // Every subscription should have been cleaned up
      expect(mockCleanup).toHaveBeenCalledTimes(mockSubscribe.mock.calls.length)
    })

    // --- audit_event callback ---
    it('audit_event callback adds event when payload has id', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('audit_event')
      cb({ id: 'ws1', eventType: 'consensus_reached', actor: 'a', action: 'x', resourceType: 'r', resourceId: 'r1', timestamp: '' })
      expect(useMonitoringStore.getState().auditEvents.some(e => e.id === 'ws1')).toBe(true)
    })

    it('audit_event callback skips payload without id', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('audit_event')
      cb({ eventType: 'test' })
      expect(useMonitoringStore.getState().auditEvents).toHaveLength(0)
    })

    // --- a2a_message callback ---
    it('a2a_message callback adds entry when payload has id', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('a2a_message')
      cb({ id: 'msg1', from: 'a', to: 'b', content: 'hi', timestamp: '' })
      expect(useMonitoringStore.getState().a2aMessages).toHaveLength(1)
      expect(useMonitoringStore.getState().a2aMessages[0].id).toBe('msg1')
    })

    it('a2a_message callback deduplicates by id', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('a2a_message')
      cb({ id: 'msg1', from: 'a', to: 'b', content: 'hi', timestamp: '' })
      cb({ id: 'msg1', from: 'a', to: 'b', content: 'hi', timestamp: '' })
      expect(useMonitoringStore.getState().a2aMessages).toHaveLength(1)
    })

    it('a2a_message callback skips payload without id', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('a2a_message')
      cb({ from: 'a', content: 'hi' })
      expect(useMonitoringStore.getState().a2aMessages).toHaveLength(0)
    })

    it('a2a_message callback trims to 200 entries', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('a2a_message')
      for (let i = 0; i < 210; i++) {
        cb({ id: `msg${i}`, from: 'a', to: 'b', content: 'hi', timestamp: '' })
      }
      expect(useMonitoringStore.getState().a2aMessages).toHaveLength(200)
    })

    // --- mcp_tool_invoked callback ---
    it('mcp_tool_invoked callback adds invocation when payload has id', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('mcp_tool_invoked')
      cb({ id: 'inv1', serverId: 's', toolName: 't', args: {}, durationMs: 50, timestamp: '' })
      expect(useMonitoringStore.getState().mcpInvocations).toHaveLength(1)
    })

    it('mcp_tool_invoked callback skips payload without id', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('mcp_tool_invoked')
      cb({ serverId: 's', toolName: 't' })
      expect(useMonitoringStore.getState().mcpInvocations).toHaveLength(0)
    })

    // --- mcp_server_status callback ---
    it('mcp_server_status callback triggers refreshMCPServers', async () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('mcp_server_status')
      cb({})
      // Wait for async refreshMCPServers to trigger scan
      await vi.waitFor(() => {
        expect(mockScanServers).toHaveBeenCalled()
      })
    })

    // --- a2a_status_change callback ---
    it('a2a_status_change callback triggers refreshA2A', async () => {
      mockGetStatus.mockResolvedValueOnce({ status: 'ok' })
      mockGetMessageLog.mockResolvedValueOnce([])
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('a2a_status_change')
      cb({})
      await vi.waitFor(() => {
        expect(useMonitoringStore.getState().a2aStatus).toEqual({ status: 'ok' })
      })
    })

    // --- audit_stats_changed callback ---
    it('audit_stats_changed callback triggers refreshAuditStats', async () => {
      mockGetAuditStats.mockResolvedValueOnce({ count: 99, enabled: true })
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('audit_stats_changed')
      cb({})
      await vi.waitFor(() => {
        expect(useMonitoringStore.getState().auditStats?.count).toBe(99)
      })
    })

    // --- agent_status_change callback ---
    it('agent_status_change with active state creates agent_start event', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('agent_status_change')
      cb({ agentId: 'agent1', state: 'active' })
      expect(useMonitoringStore.getState().auditEvents).toHaveLength(1)
      expect(useMonitoringStore.getState().auditEvents[0].eventType).toBe('agent_start')
    })

    it('agent_status_change with running state creates agent_start event', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('agent_status_change')
      cb({ agentId: 'agent1', state: 'running' })
      expect(useMonitoringStore.getState().auditEvents[0].eventType).toBe('agent_start')
    })

    it('agent_status_change with started state creates agent_start event', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('agent_status_change')
      cb({ agentId: 'agent1', state: 'started' })
      expect(useMonitoringStore.getState().auditEvents[0].eventType).toBe('agent_start')
    })

    it('agent_status_change with stopped state creates agent_stop event', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('agent_status_change')
      cb({ agentId: 'agent1', state: 'stopped' })
      expect(useMonitoringStore.getState().auditEvents[0].eventType).toBe('agent_stop')
    })

    it('agent_status_change with offline state creates agent_stop event', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('agent_status_change')
      cb({ agentId: 'agent1', state: 'offline' })
      expect(useMonitoringStore.getState().auditEvents[0].eventType).toBe('agent_stop')
    })

    it('agent_status_change with terminated state creates agent_stop event', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('agent_status_change')
      cb({ agentId: 'agent1', state: 'terminated' })
      expect(useMonitoringStore.getState().auditEvents[0].eventType).toBe('agent_stop')
    })

    it('agent_status_change ignores intermediate states', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('agent_status_change')
      cb({ agentId: 'agent1', state: 'initializing' })
      expect(useMonitoringStore.getState().auditEvents).toHaveLength(0)
    })

    it('agent_status_change skips payload without agentId', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('agent_status_change')
      cb({ state: 'active' })
      expect(useMonitoringStore.getState().auditEvents).toHaveLength(0)
    })

    // --- supervisor_alert callback ---
    it('supervisor_alert creates security_gate audit event', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('supervisor_alert')
      cb({ agentId: 'agent1', message: 'CPU overload', severity: 'critical' })
      const events = useMonitoringStore.getState().auditEvents
      expect(events).toHaveLength(1)
      expect(events[0].eventType).toBe('security_gate')
      expect(events[0].action).toBe('CPU overload')
      expect(events[0].success).toBe(false)
    })

    it('supervisor_alert with missing fields uses defaults', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('supervisor_alert')
      cb({})
      const events = useMonitoringStore.getState().auditEvents
      expect(events).toHaveLength(1)
      expect(events[0].actor).toBe('supervisor')
      expect(events[0].action).toBe('supervisor alert')
      expect(events[0].resourceId).toBe('unknown')
    })

    // --- agent_health_degraded callback ---
    it('agent_health_degraded creates security_gate event', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('agent_health_degraded')
      cb({ agentId: 'agent2' })
      const events = useMonitoringStore.getState().auditEvents
      expect(events).toHaveLength(1)
      expect(events[0].eventType).toBe('security_gate')
      expect(events[0].resourceId).toBe('agent2')
      expect(events[0].success).toBe(false)
    })

    it('agent_health_degraded with missing agentId uses unknown', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('agent_health_degraded')
      cb({})
      expect(useMonitoringStore.getState().auditEvents[0].resourceId).toBe('unknown')
    })

    // --- agent_recovered callback ---
    it('agent_recovered creates agent_start event', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('agent_recovered')
      cb({ agentId: 'agent3' })
      const events = useMonitoringStore.getState().auditEvents
      expect(events).toHaveLength(1)
      expect(events[0].eventType).toBe('agent_start')
      expect(events[0].resourceId).toBe('agent3')
      expect(events[0].success).toBe(true)
    })

    // --- agent_stuck callback ---
    it('agent_stuck creates security_gate event with duration', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('agent_stuck')
      cb({ agentId: 'agent4', duration: '5m' })
      const events = useMonitoringStore.getState().auditEvents
      expect(events).toHaveLength(1)
      expect(events[0].eventType).toBe('security_gate')
      expect(events[0].action).toContain('5m')
      expect(events[0].success).toBe(false)
    })

    it('agent_stuck with missing duration uses unknown', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('agent_stuck')
      cb({ agentId: 'agent4' })
      expect(useMonitoringStore.getState().auditEvents[0].action).toContain('unknown duration')
    })

    // --- swarm_stats callback ---
    it('swarm_stats creates audit event', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('swarm_stats')
      cb({ swarmId: 'sw1' })
      const events = useMonitoringStore.getState().auditEvents
      expect(events).toHaveLength(1)
      expect(events[0].eventType).toBe('swarm_stats')
      expect(events[0].resourceId).toBe('sw1')
    })

    it('swarm_stats with missing swarmId uses unknown', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('swarm_stats')
      cb({})
      expect(useMonitoringStore.getState().auditEvents[0].resourceId).toBe('unknown')
    })

    // --- swarm_status_change callback ---
    it('swarm_status_change creates audit event with status', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('swarm_status_change')
      cb({ swarmId: 'sw1', status: 'active' })
      const events = useMonitoringStore.getState().auditEvents
      expect(events).toHaveLength(1)
      expect(events[0].action).toContain('active')
      expect(events[0].resourceId).toBe('sw1')
    })

    // --- swarm_task_update callback ---
    it('swarm_task_update creates audit event', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('swarm_task_update')
      cb({ taskId: 't1', status: 'completed', swarmId: 'sw1' })
      const events = useMonitoringStore.getState().auditEvents
      expect(events).toHaveLength(1)
      expect(events[0].action).toContain('completed')
      expect(events[0].resourceId).toBe('t1')
    })

    // --- handoff events ---
    it('handoff_requested creates audit event', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('handoff_requested')
      cb({ fromAgent: 'a1', toAgent: 'a2', taskId: 't1' })
      const events = useMonitoringStore.getState().auditEvents
      expect(events).toHaveLength(1)
      expect(events[0].actor).toBe('a1')
      expect(events[0].success).toBe(true)
    })

    it('handoff_rejected creates audit event with success=false', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('handoff_rejected')
      cb({ fromAgent: 'a1', toAgent: 'a2', taskId: 't1' })
      const events = useMonitoringStore.getState().auditEvents
      expect(events).toHaveLength(1)
      expect(events[0].success).toBe(false)
    })

    it('handoff_completed creates audit event', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('handoff_completed')
      cb({ fromAgent: 'a1', toAgent: 'a2' })
      expect(useMonitoringStore.getState().auditEvents).toHaveLength(1)
    })

    it('handoff_accepted creates audit event', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('handoff_accepted')
      cb({ fromAgent: 'a1', toAgent: 'a2' })
      expect(useMonitoringStore.getState().auditEvents).toHaveLength(1)
    })

    it('handoff events with missing fields use unknown', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('handoff_requested')
      cb({})
      const event = useMonitoringStore.getState().auditEvents[0]
      expect(event.actor).toBe('unknown')
      expect(event.resourceId).toBe('unknown')
    })

    // --- workflow events ---
    it('workflow_status_change creates workflow audit event', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('workflow_status_change')
      cb({ workflowId: 'wf1', nodeId: 'n1' })
      const events = useMonitoringStore.getState().auditEvents
      expect(events).toHaveLength(1)
      expect(events[0].eventType).toBe('workflow')
      expect(events[0].resourceId).toBe('wf1')
    })

    it('workflow_node_start creates workflow audit event', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('workflow_node_start')
      cb({ workflowId: 'wf1', nodeId: 'n1' })
      const events = useMonitoringStore.getState().auditEvents
      expect(events[0].action).toBe('node start')
    })

    it('workflow_node_complete creates workflow audit event', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('workflow_node_complete')
      cb({ nodeId: 'n1' })
      expect(useMonitoringStore.getState().auditEvents[0].resourceId).toBe('n1')
    })

    it('workflow_node_heartbeat creates workflow audit event', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('workflow_node_heartbeat')
      cb({})
      expect(useMonitoringStore.getState().auditEvents).toHaveLength(1)
    })

    it('workflow_chain_completed creates workflow audit event', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('workflow_chain_completed')
      cb({ workflowId: 'wf1' })
      expect(useMonitoringStore.getState().auditEvents).toHaveLength(1)
    })

    it('workflow_node_cached creates workflow audit event', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('workflow_node_cached')
      cb({})
      expect(useMonitoringStore.getState().auditEvents).toHaveLength(1)
    })

    // --- team_message callback ---
    it('team_message creates a2a_message audit event', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('team_message')
      cb({ from: 'agent1', teamId: 'team1', content: 'hello' })
      const events = useMonitoringStore.getState().auditEvents
      expect(events).toHaveLength(1)
      expect(events[0].eventType).toBe('a2a_message')
      expect(events[0].actor).toBe('agent1')
      expect(events[0].resourceId).toBe('team1')
    })

    it('team_message with missing fields uses unknown', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('team_message')
      cb({})
      const event = useMonitoringStore.getState().auditEvents[0]
      expect(event.actor).toBe('unknown')
      expect(event.resourceId).toBe('unknown')
    })

    // --- automation_triggered callback ---
    it('automation_triggered creates exec audit event', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('automation_triggered')
      cb({ rule: 'rule1', trigger: 'on_save' })
      const events = useMonitoringStore.getState().auditEvents
      expect(events).toHaveLength(1)
      expect(events[0].eventType).toBe('exec')
      expect(events[0].action).toContain('rule1')
    })

    it('automation_triggered with missing rule uses trigger', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('automation_triggered')
      cb({ trigger: 'on_save' })
      expect(useMonitoringStore.getState().auditEvents[0].action).toContain('on_save')
    })

    it('automation_triggered with no fields uses unknown', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('automation_triggered')
      cb({})
      expect(useMonitoringStore.getState().auditEvents[0].action).toContain('unknown')
    })

    // --- agent_turn_start/end callbacks ---
    it('agent_turn_start creates agent_start event', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('agent_turn_start')
      cb({ agentId: 'a1' })
      const events = useMonitoringStore.getState().auditEvents
      expect(events).toHaveLength(1)
      expect(events[0].eventType).toBe('agent_start')
      expect(events[0].actor).toBe('a1')
    })

    it('agent_turn_end creates agent_stop event', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('agent_turn_end')
      cb({ agentId: 'a1' })
      const events = useMonitoringStore.getState().auditEvents
      expect(events).toHaveLength(1)
      expect(events[0].eventType).toBe('agent_stop')
    })

    it('agent_turn_start with missing agentId uses unknown', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('agent_turn_start')
      cb({})
      expect(useMonitoringStore.getState().auditEvents[0].actor).toBe('unknown')
    })

    // --- queen election events ---
    it('queen_elected creates swarm_election event', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('queen_elected')
      cb({ swarmId: 'sw1', queenId: 'q1' })
      const events = useMonitoringStore.getState().auditEvents
      expect(events).toHaveLength(1)
      expect(events[0].eventType).toBe('swarm_election')
      expect(events[0].actor).toBe('q1')
      expect(events[0].success).toBe(true)
    })

    it('queen_abdicated creates swarm_election event with success=false', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('queen_abdicated')
      cb({ swarmId: 'sw1', queenId: 'q1' })
      const events = useMonitoringStore.getState().auditEvents
      expect(events).toHaveLength(1)
      expect(events[0].success).toBe(false)
    })

    it('backup_activated creates swarm_election event', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('backup_activated')
      cb({ swarmId: 'sw1' })
      expect(useMonitoringStore.getState().auditEvents).toHaveLength(1)
      expect(useMonitoringStore.getState().auditEvents[0].success).toBe(true)
    })

    // --- agent_interrupted/task_checkpointed/task_resumed/task_recovered ---
    it('agent_interrupted creates task_interrupt event with success=false', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('agent_interrupted')
      cb({ agentId: 'a1', taskId: 't1', reason: 'timeout' })
      const events = useMonitoringStore.getState().auditEvents
      expect(events).toHaveLength(1)
      expect(events[0].eventType).toBe('task_interrupt')
      expect(events[0].success).toBe(false)
      expect(events[0].details).toEqual({ reason: 'timeout' })
    })

    it('task_checkpointed creates task_interrupt event', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('task_checkpointed')
      cb({ taskId: 't1' })
      const event = useMonitoringStore.getState().auditEvents[0]
      expect(event.eventType).toBe('task_interrupt')
      expect(event.success).toBe(false)
    })

    it('task_resumed creates task_interrupt event with success=true', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('task_resumed')
      cb({ taskId: 't1' })
      const event = useMonitoringStore.getState().auditEvents[0]
      expect(event.success).toBe(true)
    })

    it('task_recovered creates task_interrupt event with success=true', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('task_recovered')
      cb({ taskId: 't1' })
      const event = useMonitoringStore.getState().auditEvents[0]
      expect(event.success).toBe(true)
    })

    it('agent_interrupted without reason has no details', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('agent_interrupted')
      cb({ agentId: 'a1', taskId: 't1' })
      expect(useMonitoringStore.getState().auditEvents[0].details).toBeUndefined()
    })

    it('interrupt events with missing taskId use unknown', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('agent_interrupted')
      cb({})
      const event = useMonitoringStore.getState().auditEvents[0]
      expect(event.resourceId).toBe('unknown')
      expect(event.actor).toBe('agent')
    })

    // --- role_assigned callback ---
    it('role_assigned creates role_assignment event', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('role_assigned')
      cb({ agentId: 'a1', role: 'leader', taskId: 't1' })
      const events = useMonitoringStore.getState().auditEvents
      expect(events).toHaveLength(1)
      expect(events[0].eventType).toBe('role_assignment')
      expect(events[0].action).toContain('leader')
      expect(events[0].resourceId).toBe('t1')
    })

    it('role_assigned with missing fields uses unknown', () => {
      useMonitoringStore.getState().subscribeToEvents()
      const cb = getCallback('role_assigned')
      cb({})
      const event = useMonitoringStore.getState().auditEvents[0]
      expect(event.actor).toBe('agent')
      expect(event.action).toContain('unknown')
      expect(event.resourceId).toBe('unknown')
    })
  })
})

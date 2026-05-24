import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useMonitoringStore } from './monitoringStore'
import type { AuditEvent } from '../services'

const mockListAuditEvents = vi.fn().mockResolvedValue([])
const mockGetAuditStats = vi.fn().mockResolvedValue(null)
const mockGetServers = vi.fn().mockResolvedValue([])
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
    it('loads servers from API', async () => {
      mockGetServers.mockResolvedValueOnce([
        { name: 's1', status: 'running', command: '' },
        { name: 's2', status: 'stopped', command: '' },
      ])
      await useMonitoringStore.getState().refreshMCPServers()
      expect(useMonitoringStore.getState().mcpServers).toHaveLength(2)
      // Also creates audit event
      expect(useMonitoringStore.getState().auditEvents.length).toBeGreaterThan(0)
    })

    it('handles API failure', async () => {
      mockGetServers.mockRejectedValueOnce(new Error('fail'))
      await useMonitoringStore.getState().refreshMCPServers()
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

  describe('initialLoad', () => {
    it('loads initial data from APIs', async () => {
      mockListAuditEvents.mockResolvedValueOnce([
        makeEvent({ id: 'e1', eventType: 'test' }),
      ])
      mockGetAuditStats.mockResolvedValueOnce({ count: 1, enabled: true })
      mockGetServers.mockResolvedValueOnce([{ name: 's1', status: 'running', command: '' }])
      mockGetStatus.mockResolvedValueOnce({ status: 'ok' })
      mockGetMessageLog.mockResolvedValueOnce([])

      await useMonitoringStore.getState().initialLoad()
      expect(useMonitoringStore.getState().auditEvents).toHaveLength(1)
      expect(useMonitoringStore.getState().mcpServers).toHaveLength(1)
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
      mockGetServers.mockRejectedValueOnce(new Error('fail'))
      mockGetStatus.mockResolvedValueOnce(null)
      mockGetMessageLog.mockResolvedValueOnce([])

      await useMonitoringStore.getState().initialLoad()
      expect(useMonitoringStore.getState().auditEvents).toHaveLength(0)
    })
  })

  describe('subscribeToEvents', () => {
    it('registers event subscriptions', () => {
      useMonitoringStore.getState().subscribeToEvents()
      expect(mockSubscribe).toHaveBeenCalledWith('audit_event', expect.any(Function))
      expect(mockSubscribe).toHaveBeenCalledWith('a2a_message', expect.any(Function))
      expect(mockSubscribe).toHaveBeenCalledWith('mcp_tool_invoked', expect.any(Function))
    })

    it('returns cleanup function', () => {
      const cleanup = useMonitoringStore.getState().subscribeToEvents()
      expect(typeof cleanup).toBe('function')
      cleanup()
    })
  })
})

import { create } from 'zustand'
import {
  api,
  events,
  type AuditEvent,
  type AuditStats,
  type MCPServerInfo,
  type SkillInfo,
  type A2ALogEntry,
  type A2AStatus,
} from '../services'
import { logger } from '../utils'
import {
  classifyAuditEvent,
  CATEGORY_COLORS,
  type AuditCategory,
} from '../utils/auditEventUtils'

// ---------------------------------------------------------------------------
// Re-exported / inline types previously owned by individual components
// ---------------------------------------------------------------------------

export type PacketType =
  | 'ACP_ORCHESTRATE'
  | 'A2A_PROTOCOL'
  | 'ACP_PRIVILEGE_GATE'
  | 'MCP_TOOL_INVOKED'
  | 'INFO'

export type ActivityType =
  | 'GOAL_INIT'
  | 'MCP_CALL'
  | 'BLUEPRINT'
  | 'SECURITY_GATE'
  | 'HITL_PASSED'
  | 'HITL_DENIED'
  | 'TEST_SUCCESS'
  | 'EXEC'
  | 'SKILL_SCAN'
  | 'AGENT_START'
  | 'AGENT_STOP'
  | 'INFO'

export type LogTag = 'DAEMON' | 'MCP' | 'EXEC' | 'HITL_TRIGGER' | 'SKILL' | 'SYSTEM'

export interface ProtocolPacket {
  id: string
  timestamp: string
  type: PacketType
  source: string
  target?: string
  payload: string
  details?: Record<string, unknown>
  color: string
  borderColor: string
  bgTint: string
}

export interface ActivityEntry {
  id: string
  timestamp: string
  activityType: ActivityType
  color: string
  isWarning?: boolean
  actor: string
  action: string
  resourceType: string
  resourceId: string
}

export interface LogEntry {
  id: string
  timestamp: string
  tag: LogTag
  message: string
}

export interface MCPInvocation {
  id: string
  serverId: string
  toolName: string
  args: Record<string, unknown>
  result?: unknown
  error?: string
  durationMs: number
  agentId?: string
  timestamp: string
}

// ---------------------------------------------------------------------------
// Classification helpers — copied from ProtocolMonitor, ActivityLog, DaemonLog
// so the store has zero dependency on component files.
// ---------------------------------------------------------------------------

// --- ProtocolMonitor classification ---

const CATEGORY_TO_PACKET: Record<AuditCategory, PacketType> = {
  orchestrate: 'ACP_ORCHESTRATE',
  a2a: 'A2A_PROTOCOL',
  security: 'ACP_PRIVILEGE_GATE',
  mcp: 'MCP_TOOL_INVOKED',
  exec: 'INFO',
  info: 'INFO',
}

const PACKET_STYLE: Record<PacketType, { border: string; bg: string }> = {
  ACP_ORCHESTRATE: { border: 'rgba(69,26,3,0.3)', bg: '#020617' },
  A2A_PROTOCOL: { border: 'rgba(8,51,68,0.3)', bg: '#020617' },
  ACP_PRIVILEGE_GATE: { border: 'rgba(69,26,3,0.4)', bg: '#0c0f14' },
  MCP_TOOL_INVOKED: { border: 'rgba(168,85,247,0.3)', bg: '#020617' },
  INFO: { border: '#30363d', bg: '#020617' },
}

function toPacket(e: AuditEvent): ProtocolPacket {
  const cat = classifyAuditEvent(e)
  const type = CATEGORY_TO_PACKET[cat]
  const style = PACKET_STYLE[type]
  return {
    id: e.id,
    timestamp: e.timestamp,
    type,
    source: e.actor,
    target: e.resourceType,
    payload: JSON.stringify(
      { action: e.action, resource: e.resourceId, details: e.details },
      null,
      2,
    ),
    details: e.details,
    color: CATEGORY_COLORS[cat],
    borderColor: style.border,
    bgTint: style.bg,
  }
}

// --- ActivityLog classification ---

const ACTIVITY_COLORS: Record<ActivityType, string> = {
  GOAL_INIT: '#22d3ee',
  MCP_CALL: '#c084fc',
  BLUEPRINT: '#34d399',
  SECURITY_GATE: '#fbbf24',
  HITL_PASSED: '#34d399',
  HITL_DENIED: '#fb7185',
  TEST_SUCCESS: '#c084fc',
  EXEC: '#3fb950',
  SKILL_SCAN: '#f97316',
  AGENT_START: '#22d3ee',
  AGENT_STOP: '#6b7280',
  INFO: '#8b949e',
}

function classifyActivity(e: AuditEvent): ActivityType {
  const t = (e.eventType || '').toLowerCase()
  // Skill scan events (must come before general 'start' check)
  if (t.includes('skill') && (t.includes('scan') || t.includes('discover') || t.includes('refresh'))) return 'SKILL_SCAN'
  // Agent lifecycle events
  if (t === 'agent_start' || t === 'agent_launch') return 'AGENT_START'
  if (t === 'agent_stop' || t === 'agent_shutdown' || t === 'agent_terminate') return 'AGENT_STOP'
  if (t.includes('goal') || t.includes('init') || t.includes('start')) return 'GOAL_INIT'
  if (t.includes('mcp') || t.includes('tool')) return 'MCP_CALL'
  if (t.includes('blueprint') || t.includes('plan') || t.includes('consensus')) return 'BLUEPRINT'
  if (t.includes('hitl') && t.includes('pass')) return 'HITL_PASSED'
  if (t.includes('hitl') && t.includes('denied')) return 'HITL_DENIED'
  if (t.includes('security') || t.includes('permission') || t.includes('hitl')) return 'SECURITY_GATE'
  if (t.includes('test') || t.includes('valid')) return 'TEST_SUCCESS'
  if (t.includes('exec') || t.includes('task') || t.includes('swarm')) return 'EXEC'
  return 'INFO'
}

function toActivityEntry(e: AuditEvent): ActivityEntry {
  const activityType = classifyActivity(e)
  const isWarning = activityType === 'SECURITY_GATE' || activityType === 'HITL_DENIED'
  return {
    id: e.id,
    timestamp: e.timestamp,
    activityType,
    color: ACTIVITY_COLORS[activityType],
    isWarning,
    actor: e.actor,
    action: e.action,
    resourceType: e.resourceType,
    resourceId: e.resourceId,
  }
}

// --- DaemonLog classification ---

const TAG_COLORS: Record<LogTag, string> = {
  DAEMON: '#22d3ee',
  MCP: '#c084fc',
  EXEC: '#06b6d4',
  HITL_TRIGGER: '#eab308',
  SKILL: '#f97316',
  SYSTEM: '#8b949e',
}

export { CATEGORY_COLORS, ACTIVITY_COLORS, TAG_COLORS }

function classifyTag(event: AuditEvent): LogTag {
  const t = (event.eventType || '').toLowerCase()
  if (t.includes('skill') && (t.includes('scan') || t.includes('discover') || t.includes('refresh'))) return 'SKILL'
  if (t.includes('daemon') || t.includes('init') || t.includes('start')) return 'DAEMON'
  if (t.includes('mcp') || t.includes('tool')) return 'MCP'
  if (t.includes('exec') || t.includes('task') || t.includes('swarm')) return 'EXEC'
  if (t.includes('permission') || t.includes('security') || t.includes('hitl')) return 'HITL_TRIGGER'
  return 'SYSTEM'
}

function toLogEntry(e: AuditEvent): LogEntry {
  return {
    id: e.id,
    timestamp: e.timestamp,
    tag: classifyTag(e),
    message: `${e.actor} ${e.action} ${e.resourceType}/${e.resourceId}`,
  }
}

// ---------------------------------------------------------------------------
// Store state & actions
// ---------------------------------------------------------------------------

const MAX_AUDIT_EVENTS = 200

interface MonitoringState {
  // Audit stream
  auditEvents: AuditEvent[]
  auditStats: AuditStats | null
  auditEnabled: boolean

  // Derived views (auto-computed from auditEvents)
  acpPackets: ProtocolPacket[]
  a2aMessages: A2ALogEntry[]
  mcpInvocations: MCPInvocation[]
  activityEntries: ActivityEntry[]
  daemonLogs: LogEntry[]

  // MCP service status
  mcpServers: MCPServerInfo[]

  // Skills scan
  skills: SkillInfo[]
  skillsScanInProgress: boolean

  // A2A protocol
  a2aStatus: A2AStatus | null

  // Actions
  toggleAudit: () => void
  refreshMCPServers: () => Promise<void>
  refreshSkills: () => Promise<void>
  refreshA2A: () => Promise<void>
  refreshAuditStats: () => Promise<void>
  addAuditEvent: (event: AuditEvent) => void
  addMCPInvocation: (inv: MCPInvocation) => void
  initialLoad: () => Promise<void>
  subscribeToEvents: () => () => void
}

// ---------------------------------------------------------------------------
// Helper: recompute all derived views from the current auditEvents array
// ---------------------------------------------------------------------------

function computeDerived(events: AuditEvent[]) {
  const acpPackets: ProtocolPacket[] = []
  const activityEntries: ActivityEntry[] = []
  const daemonLogs: LogEntry[] = []

  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    acpPackets.push(toPacket(e))
    activityEntries.push(toActivityEntry(e))
    daemonLogs.push(toLogEntry(e))
  }

  return { acpPackets, activityEntries, daemonLogs }
}

// ---------------------------------------------------------------------------
// Store creation
// ---------------------------------------------------------------------------

export const useMonitoringStore = create<MonitoringState>()((set, get) => ({
  // Audit stream
  auditEvents: [],
  auditStats: null,
  auditEnabled: true,

  // Derived views
  acpPackets: [],
  a2aMessages: [],
  mcpInvocations: [],
  activityEntries: [],
  daemonLogs: [],

  // MCP service status
  mcpServers: [],

  // Skills scan
  skills: [],
  skillsScanInProgress: false,

  // A2A protocol
  a2aStatus: null,

  // ----- Actions -----

  toggleAudit: () => {
    const next = !get().auditEnabled
    set({ auditEnabled: next })
  },

  refreshMCPServers: async () => {
    try {
      const servers = await api.mcp.getServers()
      set({ mcpServers: servers })
      // Inject synthetic audit event for MCP server refresh
      const running = servers.filter((s) => s.status === 'running').length
      get().addAuditEvent({
        id: `mcp_refresh_${Date.now()}`,
        timestamp: new Date().toISOString(),
        eventType: 'mcp_server_refresh',
        actor: 'System',
        action: `刷新 MCP 服务器列表，${running} 个运行中`,
        resourceType: 'mcp',
        resourceId: `${servers.length} servers`,
        success: true,
        details: { total: servers.length, running },
      })
    } catch (err) {
      logger.warn('MonitoringStore', 'Failed to refresh MCP servers:', err)
    }
  },

  refreshSkills: async () => {
    if (get().skillsScanInProgress) return
    set({ skillsScanInProgress: true })
    // Inject synthetic audit event for skill scan start
    get().addAuditEvent({
      id: `skill_scan_start_${Date.now()}`,
      timestamp: new Date().toISOString(),
      eventType: 'skill_scan_start',
      actor: 'System',
      action: '开始扫描技能库...',
      resourceType: 'skill',
      resourceId: 'scan',
      success: true,
    })
    try {
      const skills = await api.agent.scanSkills()
      set({ skills })
      // Inject synthetic audit event for skill scan complete
      get().addAuditEvent({
        id: `skill_scan_complete_${Date.now()}`,
        timestamp: new Date().toISOString(),
        eventType: 'skill_scan_complete',
        actor: 'System',
        action: `技能扫描完成，发现 ${skills.length} 个技能`,
        resourceType: 'skill',
        resourceId: `${skills.length} skills`,
        success: true,
        details: { count: skills.length, sources: [...new Set(skills.map((s) => s.source))] },
      })
    } catch (err) {
      logger.warn('MonitoringStore', 'Failed to refresh skills:', err)
      // Inject failure event
      get().addAuditEvent({
        id: `skill_scan_error_${Date.now()}`,
        timestamp: new Date().toISOString(),
        eventType: 'skill_scan_error',
        actor: 'System',
        action: `技能扫描失败: ${err instanceof Error ? err.message : String(err)}`,
        resourceType: 'skill',
        resourceId: 'scan',
        success: false,
      })
    } finally {
      set({ skillsScanInProgress: false })
    }
  },

  refreshA2A: async () => {
    try {
      const [status, messages] = await Promise.all([
        api.a2a.getStatus(),
        api.a2a.getMessageLog(200),
      ])
      set({ a2aStatus: status, a2aMessages: messages })
    } catch (err) {
      logger.warn('MonitoringStore', 'Failed to refresh A2A:', err)
    }
  },

  refreshAuditStats: async () => {
    try {
      const stats = await api.monitoring.getAuditStats()
      set({ auditStats: stats })
    } catch (err) {
      logger.warn('MonitoringStore', 'Failed to refresh audit stats:', err)
    }
  },

  addAuditEvent: (event: AuditEvent) => {
    set((state) => {
      // Deduplicate by id
      if (state.auditEvents.some((e) => e.id === event.id)) return state

      const auditEvents = [...state.auditEvents, event].slice(-MAX_AUDIT_EVENTS)
      const { acpPackets, activityEntries, daemonLogs } = computeDerived(auditEvents)

      return {
        auditEvents,
        acpPackets,
        activityEntries,
        daemonLogs,
      }
    })
  },

  addMCPInvocation: (inv: MCPInvocation) => {
    set((state) => ({
      mcpInvocations: [...state.mcpInvocations, inv].slice(-MAX_AUDIT_EVENTS),
    }))
  },

  initialLoad: async () => {
    // Skip if already loaded (prevent React StrictMode double-fire)
    if (get().auditEvents.length > 0) return

    try {
      const [auditEvents, stats, servers] = await Promise.all([
        api.monitoring.listAuditEvents({ limit: 80 }).catch((err) => {
          logger.warn('MonitoringStore', 'Initial audit load failed:', err)
          return [] as AuditEvent[]
        }),
        api.monitoring.getAuditStats().catch((err) => {
          logger.warn('MonitoringStore', 'Initial stats load failed:', err)
          return null as AuditStats | null
        }),
        api.mcp.getServers().catch((err) => {
          logger.warn('MonitoringStore', 'Initial MCP servers load failed:', err)
          return [] as MCPServerInfo[]
        }),
      ])

      const { acpPackets, activityEntries, daemonLogs } = computeDerived(auditEvents)

      set({
        auditEvents,
        auditStats: stats,
        acpPackets,
        activityEntries,
        daemonLogs,
        mcpServers: servers,
        auditEnabled: stats?.enabled ?? true,
      })

      // Fire-and-forget A2A initial load
      get().refreshA2A()
    } catch (err) {
      logger.error('MonitoringStore', 'Initial load failed:', err)
    }
  },

  subscribeToEvents: () => {
    const cleanups: Array<() => void> = []

    // Audit event stream (real-time push from backend)
    cleanups.push(
      events.subscribe('audit_event', (payload: unknown) => {
        const event = payload as AuditEvent
        if (event?.id) {
          get().addAuditEvent(event)
        }
      }),
    )

    // A2A message log updates
    cleanups.push(
      events.subscribe('a2a_message', (payload: unknown) => {
        const entry = payload as A2ALogEntry
        if (entry?.id) {
          set((state) => {
            // Deduplicate
            if (state.a2aMessages.some((m) => m.id === entry.id)) return state
            return {
              a2aMessages: [...state.a2aMessages, entry].slice(-MAX_AUDIT_EVENTS),
            }
          })
        }
      }),
    )

    // MCP tool invocation events
    cleanups.push(
      events.subscribe('mcp_tool_invoked', (payload: unknown) => {
        const inv = payload as MCPInvocation
        if (inv?.id) {
          get().addMCPInvocation(inv)
        }
      }),
    )

    // MCP server status changes — refresh the full list
    cleanups.push(
      events.subscribe('mcp_server_status', () => {
        get().refreshMCPServers()
      }),
    )

    // A2A status changes
    cleanups.push(
      events.subscribe('a2a_status_change', () => {
        get().refreshA2A()
      }),
    )

    // Audit stats refresh (e.g. after clear)
    cleanups.push(
      events.subscribe('audit_stats_changed', () => {
        get().refreshAuditStats()
      }),
    )

    // Agent status changes — generate AGENT_START / AGENT_STOP activity entries
    cleanups.push(
      events.subscribe('agent_status_change', (payload: unknown) => {
        const p = payload as { agentId: string; state: string }
        if (!p?.agentId) return
        const state = (p.state || '').toLowerCase()
        let eventType: string
        if (state === 'active' || state === 'running' || state === 'started') {
          eventType = 'agent_start'
        } else if (state === 'stopped' || state === 'offline' || state === 'terminated') {
          eventType = 'agent_stop'
        } else {
          return // ignore intermediate states
        }
        get().addAuditEvent({
          id: `agent_status_${p.agentId}_${Date.now()}`,
          timestamp: new Date().toISOString(),
          eventType,
          actor: p.agentId,
          action: eventType === 'agent_start' ? '已启动' : '已停止',
          resourceType: 'agent',
          resourceId: p.agentId,
          success: true,
        })
      }),
    )

    // Supervisor alerts — agent health issues
    cleanups.push(
      events.subscribe('supervisor_alert', (payload: unknown) => {
        const p = payload as { agentId?: string; message?: string; severity?: string }
        get().addAuditEvent({
          id: `supervisor_alert_${Date.now()}`,
          timestamp: new Date().toISOString(),
          eventType: 'security_gate',
          actor: 'supervisor',
          action: p?.message || 'supervisor alert',
          resourceType: 'agent',
          resourceId: p?.agentId || 'unknown',
          success: false,
        })
      }),
    )

    // Agent health degraded
    cleanups.push(
      events.subscribe('agent_health_degraded', (payload: unknown) => {
        const p = payload as { agentId?: string }
        get().addAuditEvent({
          id: `health_degraded_${Date.now()}`,
          timestamp: new Date().toISOString(),
          eventType: 'security_gate',
          actor: 'supervisor',
          action: 'agent health degraded',
          resourceType: 'agent',
          resourceId: p?.agentId || 'unknown',
          success: false,
        })
      }),
    )

    // Agent recovered
    cleanups.push(
      events.subscribe('agent_recovered', (payload: unknown) => {
        const p = payload as { agentId?: string }
        get().addAuditEvent({
          id: `agent_recovered_${Date.now()}`,
          timestamp: new Date().toISOString(),
          eventType: 'agent_start',
          actor: 'supervisor',
          action: 'agent recovered',
          resourceType: 'agent',
          resourceId: p?.agentId || 'unknown',
          success: true,
        })
      }),
    )

    // Agent stuck
    cleanups.push(
      events.subscribe('agent_stuck', (payload: unknown) => {
        const p = payload as { agentId?: string; duration?: string }
        get().addAuditEvent({
          id: `agent_stuck_${Date.now()}`,
          timestamp: new Date().toISOString(),
          eventType: 'security_gate',
          actor: 'supervisor',
          action: `agent stuck (${p?.duration || 'unknown duration'})`,
          resourceType: 'agent',
          resourceId: p?.agentId || 'unknown',
          success: false,
        })
      }),
    )

    // Swarm stats updates
    cleanups.push(
      events.subscribe('swarm_stats', (payload: unknown) => {
        const p = payload as { swarmId?: string }
        get().addAuditEvent({
          id: `swarm_stats_${Date.now()}`,
          timestamp: new Date().toISOString(),
          eventType: 'swarm_stats',
          actor: 'swarm',
          action: 'stats updated',
          resourceType: 'swarm',
          resourceId: p?.swarmId || 'unknown',
          success: true,
        })
      }),
    )

    // Swarm status change (already wired elsewhere but also log as audit event)
    cleanups.push(
      events.subscribe('swarm_status_change', (payload: unknown) => {
        const p = payload as { swarmId?: string; status?: string }
        get().addAuditEvent({
          id: `swarm_status_${Date.now()}`,
          timestamp: new Date().toISOString(),
          eventType: 'swarm_status',
          actor: 'swarm',
          action: `status → ${p?.status || 'unknown'}`,
          resourceType: 'swarm',
          resourceId: p?.swarmId || 'unknown',
          success: true,
        })
      }),
    )

    // Swarm task updates
    cleanups.push(
      events.subscribe('swarm_task_update', (payload: unknown) => {
        const p = payload as { taskId?: string; status?: string; swarmId?: string }
        get().addAuditEvent({
          id: `task_update_${Date.now()}`,
          timestamp: new Date().toISOString(),
          eventType: 'task_update',
          actor: 'swarm',
          action: `task ${p?.status || 'updated'}`,
          resourceType: 'task',
          resourceId: p?.taskId || 'unknown',
          success: true,
        })
      }),
    )

    // Handoff events
    for (const evt of ['handoff_requested', 'handoff_accepted', 'handoff_rejected', 'handoff_completed'] as const) {
      cleanups.push(
        events.subscribe(evt, (payload: unknown) => {
          const p = payload as { fromAgent?: string; toAgent?: string; taskId?: string }
          get().addAuditEvent({
            id: `${evt}_${Date.now()}`,
            timestamp: new Date().toISOString(),
            eventType: 'handoff',
            actor: p?.fromAgent || 'unknown',
            action: evt.replace('handoff_', ''),
            resourceType: 'agent',
            resourceId: p?.toAgent || p?.taskId || 'unknown',
            success: evt !== 'handoff_rejected',
          })
        }),
      )
    }

    // Workflow events
    for (const evt of ['workflow_status_change', 'workflow_node_start', 'workflow_node_complete', 'workflow_node_heartbeat', 'workflow_chain_completed', 'workflow_node_cached'] as const) {
      cleanups.push(
        events.subscribe(evt, (payload: unknown) => {
          const p = payload as { workflowId?: string; nodeId?: string }
          get().addAuditEvent({
            id: `${evt}_${Date.now()}`,
            timestamp: new Date().toISOString(),
            eventType: 'workflow',
            actor: 'workflow',
            action: evt.replace('workflow_', '').replace('_', ' '),
            resourceType: 'workflow',
            resourceId: p?.workflowId || p?.nodeId || 'unknown',
            success: true,
          })
        }),
      )
    }

    // Team messages
    cleanups.push(
      events.subscribe('team_message', (payload: unknown) => {
        const p = payload as { from?: string; teamId?: string; content?: string }
        get().addAuditEvent({
          id: `team_msg_${Date.now()}`,
          timestamp: new Date().toISOString(),
          eventType: 'a2a_message',
          actor: p?.from || 'unknown',
          action: 'team message',
          resourceType: 'team',
          resourceId: p?.teamId || 'unknown',
          success: true,
        })
      }),
    )

    // Automation triggered
    cleanups.push(
      events.subscribe('automation_triggered', (payload: unknown) => {
        const p = payload as { rule?: string; trigger?: string }
        get().addAuditEvent({
          id: `automation_${Date.now()}`,
          timestamp: new Date().toISOString(),
          eventType: 'exec',
          actor: 'automation',
          action: `triggered: ${p?.rule || p?.trigger || 'unknown'}`,
          resourceType: 'automation',
          resourceId: p?.rule || 'unknown',
          success: true,
        })
      }),
    )

    // Agent turn start/end
    for (const evt of ['agent_turn_start', 'agent_turn_end'] as const) {
      cleanups.push(
        events.subscribe(evt, (payload: unknown) => {
          const p = payload as { agentId?: string }
          get().addAuditEvent({
            id: `${evt}_${Date.now()}`,
            timestamp: new Date().toISOString(),
            eventType: evt === 'agent_turn_start' ? 'agent_start' : 'agent_stop',
            actor: p?.agentId || 'unknown',
            action: evt.replace('agent_', ''),
            resourceType: 'agent',
            resourceId: p?.agentId || 'unknown',
            success: true,
          })
        }),
      )
    }

    // Swarm algorithm events (queen election, interrupts, recovery)
    for (const evt of ['queen_elected', 'queen_abdicated', 'backup_activated'] as const) {
      cleanups.push(
        events.subscribe(evt, (payload: unknown) => {
          const p = payload as { swarmId?: string; queenId?: string }
          get().addAuditEvent({
            id: `${evt}_${Date.now()}`,
            timestamp: new Date().toISOString(),
            eventType: 'swarm_election',
            actor: p?.queenId || 'queen',
            action: evt.replace('_', ' '),
            resourceType: 'swarm',
            resourceId: p?.swarmId || 'unknown',
            success: evt !== 'queen_abdicated',
          })
        }),
      )
    }

    for (const evt of ['agent_interrupted', 'task_checkpointed', 'task_resumed', 'task_recovered'] as const) {
      cleanups.push(
        events.subscribe(evt, (payload: unknown) => {
          const p = payload as { agentId?: string; taskId?: string; swarmId?: string; reason?: string }
          get().addAuditEvent({
            id: `${evt}_${Date.now()}`,
            timestamp: new Date().toISOString(),
            eventType: 'task_interrupt',
            actor: p?.agentId || 'agent',
            action: evt.replace('_', ' '),
            resourceType: 'task',
            resourceId: p?.taskId || 'unknown',
            success: evt === 'task_resumed' || evt === 'task_recovered',
            details: p?.reason ? { reason: p.reason } : undefined,
          })
        }),
      )
    }

    cleanups.push(
      events.subscribe('role_assigned', (payload: unknown) => {
        const p = payload as { agentId?: string; role?: string; taskId?: string }
        get().addAuditEvent({
          id: `role_assigned_${Date.now()}`,
          timestamp: new Date().toISOString(),
          eventType: 'role_assignment',
          actor: p?.agentId || 'agent',
          action: `assigned as ${p?.role || 'unknown'}`,
          resourceType: 'task',
          resourceId: p?.taskId || 'unknown',
          success: true,
        })
      }),
    )

    // Combine all cleanups into one
    return () => {
      for (const cleanup of cleanups) {
        cleanup()
      }
    }
  },
}))

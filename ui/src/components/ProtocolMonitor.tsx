import { useState, useMemo, useCallback } from 'react'
import { useMonitoringStore, type ProtocolPacket, type PacketType } from '../stores/monitoringStore'
import { useAutoScroll } from '../hooks/useAutoScroll'

// ---------------------------------------------------------------------------
// Sub-filter tabs
// ---------------------------------------------------------------------------

type FilterTab = 'all' | 'ACP' | 'A2A' | 'MCP'

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'ACP', label: 'ACP' },
  { key: 'A2A', label: 'A2A' },
  { key: 'MCP', label: 'MCP' },
]

const TAB_MATCH: Record<FilterTab, null | Set<PacketType>> = {
  all: null,
  ACP: new Set(['ACP_ORCHESTRATE', 'ACP_PRIVILEGE_GATE']),
  A2A: new Set(['A2A_PROTOCOL']),
  MCP: new Set(['MCP_TOOL_INVOKED']),
}

// ---------------------------------------------------------------------------
// View mode
// ---------------------------------------------------------------------------

type ViewMode = 'list' | 'timeline'

// ---------------------------------------------------------------------------
// Packet rendering helpers
// ---------------------------------------------------------------------------

const TYPE_ICONS: Record<PacketType, string> = {
  ACP_ORCHESTRATE: 'M2.5 7.5l2-5h3l2 5-3.5 3.5L2.5 7.5zm6 0l2-5h3l2 5-3.5 3.5L8.5 7.5zm-3 5l2-5h3l2 5-3.5 3.5-3.5-3.5z',
  A2A_PROTOCOL: 'M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5',
  ACP_PRIVILEGE_GATE: 'M12 2l8 4v6c0 5.25-3.5 9.74-8 11-4.5-1.26-8-5.75-8-11V6l8-4zm0 4v6m0 0v6m0-6h6m-6 0H6',
  MCP_TOOL_INVOKED: 'M9 2v5M15 2v5M6 9h12v3c0 3.31-2.69 6-6 6s-6-2.69-6-6V9zM12 18v3',
  INFO: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
}

// ---------------------------------------------------------------------------
// Deep packet detail extraction
// ---------------------------------------------------------------------------

interface ParsedOrchestrate {
  command: string
  targetAgent: string
  taskDesc: string
}

interface ParsedA2A {
  sender: string
  receiver: string
  messageType: string
  payloadSummary: string
}

interface ParsedPrivilegeGate {
  permission: string
  requestingAgent: string
  approvalStatus: string
}

interface ParsedMCPTool {
  toolName: string
  serverId: string
  argsSummary: string
  resultStatus: string
}

function parseOrchestrate(d: Record<string, unknown> | undefined): ParsedOrchestrate | null {
  if (!d) return null
  const command = String(d.command || d.action || d.subtype || d.eventType || '')
  const targetAgent = String(d.agent || d.targetAgent || d.target || d.assignee || '')
  const taskDesc = String(d.task || d.description || d.goal || d.prompt || '')
  if (!command && !targetAgent && !taskDesc) return null
  return { command, targetAgent, taskDesc }
}

function parseA2A(d: Record<string, unknown> | undefined): ParsedA2A | null {
  if (!d) return null
  const sender = String(d.sender || d.from || d.source || '')
  const receiver = String(d.receiver || d.to || d.target || d.recipient || '')
  const messageType = String(d.messageType || d.msgType || d.type || d.protocol || '')
  const rawPayload = d.payload ?? d.message ?? d.body ?? d.data
  let payloadSummary = ''
  if (typeof rawPayload === 'string') {
    payloadSummary = rawPayload.length > 80 ? rawPayload.slice(0, 80) + '...' : rawPayload
  } else if (rawPayload && typeof rawPayload === 'object') {
    const s = JSON.stringify(rawPayload)
    payloadSummary = s.length > 80 ? s.slice(0, 80) + '...' : s
  }
  if (!sender && !receiver && !messageType) return null
  return { sender, receiver, messageType, payloadSummary }
}

function parsePrivilegeGate(d: Record<string, unknown> | undefined): ParsedPrivilegeGate | null {
  if (!d) return null
  const permission = String(d.permission || d.capability || d.privilege || d.action || d.operation || '')
  const requestingAgent = String(d.agent || d.requester || d.actor || d.requestingAgent || '')
  const rawStatus = d.approved ?? d.granted ?? d.status ?? d.allowed
  let approvalStatus = ''
  if (typeof rawStatus === 'boolean') {
    approvalStatus = rawStatus ? 'APPROVED' : 'DENIED'
  } else if (rawStatus != null) {
    approvalStatus = String(rawStatus).toUpperCase()
  }
  if (!permission && !requestingAgent) return null
  return { permission, requestingAgent, approvalStatus }
}

function parseMCPTool(d: Record<string, unknown> | undefined): ParsedMCPTool | null {
  if (!d) return null
  const toolName = String(d.toolName || d.tool || d.method || d.function || '')
  const serverId = String(d.serverId || d.server || d.serverName || '')
  const rawArgs = d.args ?? d.arguments ?? d.params ?? d.input
  let argsSummary = ''
  if (typeof rawArgs === 'string') {
    argsSummary = rawArgs.length > 80 ? rawArgs.slice(0, 80) + '...' : rawArgs
  } else if (rawArgs && typeof rawArgs === 'object') {
    const s = JSON.stringify(rawArgs)
    argsSummary = s.length > 80 ? s.slice(0, 80) + '...' : s
  }
  const rawResult = d.result ?? d.status ?? d.success
  let resultStatus = ''
  if (typeof rawResult === 'boolean') {
    resultStatus = rawResult ? 'OK' : 'FAIL'
  } else if (rawResult != null) {
    const s = String(rawResult)
    resultStatus = s.length > 30 ? s.slice(0, 30) + '...' : s
  }
  if (!toolName && !serverId) return null
  return { toolName, serverId, argsSummary, resultStatus }
}

// ---------------------------------------------------------------------------
// Packet sub-components
// ---------------------------------------------------------------------------

function PacketIcon({ type, color, pulse }: { type: PacketType; color: string; pulse?: boolean }) {
  return (
    <svg className={`w-3 h-3 shrink-0${pulse ? ' animate-pulse' : ''}`} style={{ color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d={TYPE_ICONS[type]} />
    </svg>
  )
}

function PacketHeader({ p }: { p: ProtocolPacket }) {
  const source = p.type === 'ACP_ORCHESTRATE' ? 'QUEEN_SUPERVISOR' : p.source
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-semibold">
      {p.type !== 'MCP_TOOL_INVOKED' && <PacketIcon type={p.type} color={p.color} />}
      <span style={{ color: p.color }}>{p.type}</span>
      {source && (
        <span style={{ color: '#4b5563' }}>
          ({source}{p.target ? ` -> ${p.target}` : ''})
        </span>
      )}
      <span className="ml-auto" style={{ color: '#4b5563' }}>
        {p.timestamp ? new Date(p.timestamp).toLocaleTimeString() : ''}
      </span>
    </div>
  )
}

/** Badge-style inline label */
function DetailLabel({ label, value, accent }: { label: string; value: string; accent?: string }) {
  if (!value) return null
  return (
    <span className="inline-flex items-center gap-0.5 mr-2">
      <span style={{ color: '#6b7280' }}>{label}:</span>{' '}
      <span className="font-semibold" style={{ color: accent || '#d1d5db' }}>{value}</span>
    </span>
  )
}

function DeepPacketDetails({ p }: { p: ProtocolPacket }) {
  const d = p.details

  if (p.type === 'ACP_ORCHESTRATE') {
    const parsed = parseOrchestrate(d)
    if (parsed) {
      return (
        <div className="space-y-0.5">
          <div className="flex flex-wrap gap-x-1 gap-y-0.5">
            <DetailLabel label="cmd" value={parsed.command} accent="#fbbf24" />
            <DetailLabel label="agent" value={parsed.targetAgent} accent="#22d3ee" />
          </div>
          {parsed.taskDesc && (
            <div className="text-[9px] whitespace-pre-wrap overflow-x-auto" style={{ color: '#9ca3af' }}>
              {parsed.taskDesc.length > 120 ? parsed.taskDesc.slice(0, 120) + '...' : parsed.taskDesc}
            </div>
          )}
        </div>
      )
    }
  }

  if (p.type === 'A2A_PROTOCOL') {
    const parsed = parseA2A(d)
    if (parsed) {
      return (
        <div className="space-y-0.5">
          <div className="flex flex-wrap gap-x-1 gap-y-0.5">
            <DetailLabel label="from" value={parsed.sender} accent="#22d3ee" />
            <DetailLabel label="to" value={parsed.receiver} accent="#34d399" />
            <DetailLabel label="type" value={parsed.messageType} accent="#fbbf24" />
          </div>
          {parsed.payloadSummary && (
            <div className="text-[9px] whitespace-pre-wrap overflow-x-auto" style={{ color: '#9ca3af' }}>
              {parsed.payloadSummary}
            </div>
          )}
        </div>
      )
    }
  }

  if (p.type === 'ACP_PRIVILEGE_GATE') {
    const parsed = parsePrivilegeGate(d)
    if (parsed) {
      const statusColor = parsed.approvalStatus === 'APPROVED' ? '#3fb950' : parsed.approvalStatus === 'DENIED' ? '#fb7185' : '#f0883e'
      return (
        <div className="flex flex-wrap gap-x-1 gap-y-0.5">
          <DetailLabel label="perm" value={parsed.permission} accent="#f0883e" />
          <DetailLabel label="agent" value={parsed.requestingAgent} accent="#22d3ee" />
          <DetailLabel label="status" value={parsed.approvalStatus} accent={statusColor} />
        </div>
      )
    }
  }

  if (p.type === 'MCP_TOOL_INVOKED') {
    const parsed = parseMCPTool(d)
    if (parsed) {
      const statusColor = parsed.resultStatus === 'OK' ? '#3fb950' : parsed.resultStatus === 'FAIL' ? '#fb7185' : '#c084fc'
      return (
        <div className="space-y-0.5">
          <div className="flex flex-wrap gap-x-1 gap-y-0.5">
            <DetailLabel label="tool" value={parsed.toolName} accent="#c084fc" />
            <DetailLabel label="server" value={parsed.serverId} accent="#8b949e" />
            <DetailLabel label="result" value={parsed.resultStatus} accent={statusColor} />
          </div>
          {parsed.argsSummary && (
            <div className="text-[9px] whitespace-pre-wrap overflow-x-auto" style={{ color: '#9ca3af' }}>
              {parsed.argsSummary}
            </div>
          )}
        </div>
      )
    }
  }

  // Fallback: raw payload (if not empty and not just '{}')
  if (p.payload && p.payload !== '{}' && p.payload !== '{\n  "action": "",\n  "resource": "",\n  "details": {}\n}') {
    return (
      <pre className="text-[9px] whitespace-pre-wrap overflow-x-auto" style={{ color: '#d1d5db' }}>
        {p.payload}
      </pre>
    )
  }

  return null
}

function PacketBody({ p }: { p: ProtocolPacket }) {
  // Special MCP header style (existing behavior)
  if (p.type === 'MCP_TOOL_INVOKED') {
    return (
      <div className="p-2.5 space-y-1">
        <div className="font-bold flex items-center gap-1" style={{ color: p.color }}>
          <PacketIcon type={p.type} color={p.color} pulse />
          MCP_TOOL_INVOKED
        </div>
        <DeepPacketDetails p={p} />
      </div>
    )
  }

  return (
    <div className="p-2 space-y-1">
      <DeepPacketDetails p={p} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stat dots
// ---------------------------------------------------------------------------

function StatDot({ color, count, label }: { color: string; count: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ background: color }}
      />
      <span style={{ color: '#6b7280' }}>{label}:{count}</span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Timeline helpers
// ---------------------------------------------------------------------------

interface TimelineNode {
  packet: ProtocolPacket
  xPct: number
}

function buildTimelineNodes(packets: ProtocolPacket[]): TimelineNode[] {
  if (packets.length === 0) return []
  const sorted = [...packets].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )
  const tMin = new Date(sorted[0].timestamp).getTime()
  const tMax = new Date(sorted[sorted.length - 1].timestamp).getTime()
  const range = tMax - tMin || 1
  return sorted.map((p) => ({
    packet: p,
    xPct: ((new Date(p.timestamp).getTime() - tMin) / range) * 100,
  }))
}

function formatTimelineTime(ts: string): string {
  const d = new Date(ts)
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ---------------------------------------------------------------------------
// Timeline view component
// ---------------------------------------------------------------------------

function TimelineView({ packets }: { packets: ProtocolPacket[] }) {
  const nodes = useMemo(() => buildTimelineNodes(packets), [packets])

  if (nodes.length === 0) {
    return (
      <div className="text-center py-8 text-[11px] font-mono" style={{ color: '#6b7280' }}>
        Waiting for protocol packets...
      </div>
    )
  }

  const tMin = formatTimelineTime(packets.reduce((a, b) =>
    new Date(a.timestamp).getTime() < new Date(b.timestamp).getTime() ? a : b
  ).timestamp)
  const tMax = formatTimelineTime(packets.reduce((a, b) =>
    new Date(a.timestamp).getTime() > new Date(b.timestamp).getTime() ? a : b
  ).timestamp)

  return (
    <div className="p-3 space-y-3">
      {/* Time axis labels */}
      <div className="flex justify-between text-[8px] font-mono" style={{ color: '#4b5563' }}>
        <span>{tMin}</span>
        <span>{tMax}</span>
      </div>

      {/* Timeline track */}
      <div className="relative" style={{ minHeight: Math.max(nodes.length * 22, 60) }}>
        {/* Horizontal axis line */}
        <div
          className="absolute top-0 bottom-0"
          style={{ left: '0', width: '1px', background: '#1f2937' }}
        />

        {nodes.map((node) => {
          const p = node.packet
          return (
            <div
              key={p.id}
              className="relative flex items-start"
              style={{ height: 22 }}
            >
              {/* Dot on the axis */}
              <div
                className="absolute rounded-full"
                style={{
                  width: 6,
                  height: 6,
                  top: 8,
                  left: `${node.xPct}%`,
                  background: p.color,
                  transform: 'translateX(-3px)',
                  zIndex: 1,
                }}
              />

              {/* Content to the right */}
              <div
                className="ml-5 text-[9px] font-mono flex items-center gap-1.5 w-full"
                style={{ color: '#d1d5db' }}
              >
                <span className="shrink-0" style={{ color: '#4b5563' }}>
                  {formatTimelineTime(p.timestamp)}
                </span>
                <span className="font-semibold shrink-0" style={{ color: p.color }}>
                  {p.type}
                </span>
                <span className="truncate" style={{ color: '#9ca3af' }}>
                  {p.source}{p.target ? ` -> ${p.target}` : ''}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="text-[10px] font-mono" style={{ color: '#64748b' }}>
        * Timeline view -- {nodes.length} packets
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ProtocolMonitorProps {
  contextLabel?: string | null
}

export default function ProtocolMonitor({ contextLabel }: ProtocolMonitorProps) {
  const acpPackets = useMonitoringStore((s) => s.acpPackets)
  const auditEnabled = useMonitoringStore((s) => s.auditEnabled)
  const toggleAudit = useMonitoringStore((s) => s.toggleAudit)

  const [filter, setFilter] = useState<FilterTab>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [searchText, setSearchText] = useState('')

  // Filter by context label (agent name) when provided
  const contextFiltered = useMemo(() => {
    if (!contextLabel) return acpPackets
    const ctx = contextLabel.toLowerCase()
    return acpPackets.filter((p) => {
      const src = (p.source || '').toLowerCase()
      const tgt = (p.target || '').toLowerCase()
      const payload = (p.payload || '').toLowerCase()
      // Check details fields too
      const details = p.details
      let detailsMatch = false
      if (details) {
        const detailsStr = JSON.stringify(details).toLowerCase()
        detailsMatch = detailsStr.includes(ctx)
      }
      return src.includes(ctx) || tgt.includes(ctx) || payload.includes(ctx) || detailsMatch
    })
  }, [acpPackets, contextLabel])

  // Filter by tab
  const tabFiltered = useMemo(() => {
    const match = TAB_MATCH[filter]
    if (!match) return contextFiltered
    return contextFiltered.filter((p) => match.has(p.type))
  }, [contextFiltered, filter])

  // Filter by search text
  const filtered = useMemo(() => {
    if (!searchText.trim()) return tabFiltered
    const q = searchText.toLowerCase()
    return tabFiltered.filter((p) => {
      const fields = [
        p.type,
        p.source,
        p.target || '',
        p.payload || '',
        p.details ? JSON.stringify(p.details) : '',
      ].join(' ').toLowerCase()
      return fields.includes(q)
    })
  }, [tabFiltered, searchText])

  // Counts based on context-filtered set (search-independent)
  const counts = useMemo(() => {
    let acp = 0, a2a = 0, mcp = 0
    for (const p of contextFiltered) {
      if (p.type === 'ACP_ORCHESTRATE' || p.type === 'ACP_PRIVILEGE_GATE') acp++
      else if (p.type === 'A2A_PROTOCOL') a2a++
      else if (p.type === 'MCP_TOOL_INVOKED') mcp++
    }
    return { total: contextFiltered.length, acp, a2a, mcp }
  }, [contextFiltered])

  const { containerRef, handleScroll } = useAutoScroll(filtered)

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchText(e.target.value)
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-1 text-[10px] font-mono shrink-0 text-center tracking-wider uppercase border-y border-dashed" style={{ color: '#6b7280', borderColor: '#1f2937' }}>
        {contextLabel ? (
          <span>[ Protocol Monitor: {contextLabel} ]</span>
        ) : (
          <span>[ ACP & A2A Protocol Packet Monitor ]</span>
        )}
      </div>

      {/* Audit toggle + stats bar with colored dots */}
      <div className="px-3 py-1.5 flex items-center gap-3 shrink-0 text-[10px] font-mono border-b" style={{ borderColor: '#1f2937' }}>
        <button
          onClick={toggleAudit}
          className="px-1.5 py-0.5 rounded text-[9px] font-bold"
          style={{
            background: auditEnabled ? '#0d1117' : '#21262d',
            color: auditEnabled ? '#3fb950' : '#6b7280',
            border: `1px solid ${auditEnabled ? '#238636' : '#30363d'}`,
          }}
        >
          {auditEnabled ? 'LIVE' : 'OFF'}
        </button>
        <span style={{ color: '#6b7280' }}>{counts.total} pkts</span>
        <StatDot color="#fbbf24" count={counts.acp} label="ACP" />
        <StatDot color="#22d3ee" count={counts.a2a} label="A2A" />
        <StatDot color="#c084fc" count={counts.mcp} label="MCP" />
      </div>

      {/* Search bar */}
      <div className="px-3 py-1.5 shrink-0 border-b" style={{ borderColor: '#1f2937' }}>
        <input
          type="text"
          value={searchText}
          onChange={handleSearchChange}
          placeholder="Search packets..."
          className="w-full px-2 py-0.5 rounded text-[10px] font-mono outline-none"
          style={{
            background: '#0d1117',
            color: '#d1d5db',
            border: '1px solid #30363d',
          }}
        />
      </div>

      {/* Sub-filter tabs + view toggle */}
      <div className="px-3 py-1 flex items-center gap-1 shrink-0 border-b" style={{ borderColor: '#1f2937' }}>
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className="px-2 py-0.5 rounded text-[10px] font-mono"
            style={{
              background: filter === tab.key ? '#21262d' : 'transparent',
              color: filter === tab.key ? '#d1d5db' : '#6b7280',
              border: `1px solid ${filter === tab.key ? '#30363d' : 'transparent'}`,
            }}
          >
            {tab.label}
          </button>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* View toggle */}
        <button
          onClick={() => setViewMode(viewMode === 'list' ? 'timeline' : 'list')}
          className="px-2 py-0.5 rounded text-[10px] font-mono"
          style={{
            background: '#21262d',
            color: '#d1d5db',
            border: '1px solid #30363d',
          }}
        >
          {viewMode === 'list' ? '列表' : '时间轴'}
        </button>
      </div>

      {/* Content area */}
      {viewMode === 'timeline' ? (
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto"
          onScroll={handleScroll}
        >
          <TimelineView packets={filtered} />
        </div>
      ) : (
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto p-3 space-y-3"
          onScroll={handleScroll}
        >
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-[11px] font-mono" style={{ color: '#6b7280' }}>
              Waiting for protocol packets...
            </div>
          ) : filtered.map((packet) => (
            <div key={packet.id} className="space-y-1">
              <PacketHeader p={packet} />
              <div
                className="rounded text-[10px] font-mono leading-normal"
                style={{ background: packet.bgTint, border: `1px solid ${packet.borderColor}` }}
              >
                <PacketBody p={packet} />
              </div>
            </div>
          ))}
          <div className="text-[10px] font-mono" style={{ color: '#64748b' }}>
            * Swarm protocol connection active...
          </div>
        </div>
      )}
    </div>
  )
}

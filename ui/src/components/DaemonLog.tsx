import { useState } from 'react'
import { useMonitoringStore, type LogTag, TAG_COLORS } from '../stores/monitoringStore'
import { useAutoScroll } from '../hooks/useAutoScroll'

type LogFilter = '全部' | 'DAEMON' | 'MCP' | 'EXEC' | 'HITL' | 'SKILL' | 'SYSTEM'

const FILTER_MAP: Record<LogFilter, LogTag[]> = {
  '全部': [],
  'DAEMON': ['DAEMON'],
  'MCP': ['MCP'],
  'EXEC': ['EXEC'],
  'HITL': ['HITL_TRIGGER'],
  'SKILL': ['SKILL'],
  'SYSTEM': ['SYSTEM'],
}

const FILTERS: LogFilter[] = ['全部', 'DAEMON', 'MCP', 'EXEC', 'HITL', 'SKILL', 'SYSTEM']

export default function DaemonLog() {
  const daemonLogs = useMonitoringStore((s) => s.daemonLogs)
  const [filter, setFilter] = useState<LogFilter>('全部')

  const logs = filter === '全部'
    ? daemonLogs
    : daemonLogs.filter((l) => FILTER_MAP[filter].includes(l.tag))

  const { containerRef, handleScroll } = useAutoScroll(logs)

  return (
    <div className="flex flex-col h-full">
      {/* Filter buttons */}
      <div className="flex items-center gap-1 px-3 py-1.5 shrink-0" style={{ borderBottom: '1px solid #1f2937' }}>
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-2 py-0.5 text-[10px] font-mono rounded transition-colors"
            style={{
              color: filter === f ? '#e5e7eb' : '#6b7280',
              background: filter === f ? 'rgba(88,166,255,0.15)' : 'transparent',
              border: filter === f ? '1px solid rgba(88,166,255,0.3)' : '1px solid transparent',
            }}
          >
            {f}
          </button>
        ))}
      </div>
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-3 font-mono text-[11px] space-y-1 select-text"
        style={{ color: '#94a3b8' }}
        onScroll={handleScroll}
      >
        {logs.length === 0 ? (
          <div className="text-center py-8">等待守护进程日志...</div>
        ) : logs.map(log => (
          <div key={log.id}>
            <span style={{ color: '#4b5563' }}>
              [{log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}]
            </span>{' '}
            <span style={{ color: TAG_COLORS[log.tag] }}>[{log.tag}]</span>{' '}
            <span style={{ color: '#94a3b8' }}>{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

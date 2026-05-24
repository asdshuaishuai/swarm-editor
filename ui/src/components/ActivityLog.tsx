import { useState, type ReactNode } from 'react'
import { useMonitoringStore, type ActivityEntry, type ActivityType } from '../stores/monitoringStore'
import { useAutoScroll } from '../hooks/useAutoScroll'

type ActivityFilter = '全部' | 'MCP' | 'Agent' | '协定' | 'Skill' | '系统'

const FILTER_MAP: Record<ActivityFilter, ActivityType[]> = {
  '全部': [],
  'MCP': ['MCP_CALL', 'TEST_SUCCESS'],
  'Agent': ['GOAL_INIT', 'EXEC', 'AGENT_START', 'AGENT_STOP'],
  '协定': ['BLUEPRINT', 'SECURITY_GATE', 'HITL_PASSED', 'HITL_DENIED'],
  'Skill': ['SKILL_SCAN'],
  '系统': ['INFO'],
}

const FILTERS: ActivityFilter[] = ['全部', 'MCP', 'Agent', '协定', 'Skill', '系统']

const Cd = ({ children, color = '#d1d5db' }: { children: ReactNode; color?: string }) => (
  <code style={{ color, fontSize: 'inherit' }}>{children}</code>
)

function renderDescription(e: ActivityEntry): ReactNode {
  switch (e.activityType) {
    case 'GOAL_INIT':
      return <><Cd color="#22d3ee">{e.actor}</Cd> 接管全域控制。已成功解析目标：<strong style={{ color: '#d1d5db' }}>{e.action} {e.resourceType}/{e.resourceId}</strong>。</>
    case 'MCP_CALL':
      return <><Cd color="#22d3ee">{e.actor}</Cd> 调用 <Cd color="#c084fc">{e.resourceType}</Cd>{' '}:: <span style={{ color: '#c084fc', fontFamily: 'monospace' }}>{e.action}()</span> 读取 <Cd>{e.resourceId}</Cd> 的代码抽象语法树 (AST)。</>
    case 'BLUEPRINT':
      return <><Cd color="#22d3ee">{e.actor}</Cd> 利用 <strong style={{ color: '#34d399' }}>{e.action}</strong> 技能产出代码变更 Blueprint，并通过 A2A 协定推播至 <Cd>{e.resourceType}</Cd>。</>
    case 'SECURITY_GATE':
      return <><Cd color="#fbbf24">{e.actor}</Cd> 尝试执行系统特权测试与写入动作。<strong style={{ color: '#fbbf24' }}>安全漏洞沙箱拦截技能</strong>触发，进入 Pending 状态。</>
    case 'HITL_PASSED':
      return <><Cd color="#34d399">{e.actor}</Cd> 安全授权已通过。<strong style={{ color: '#34d399' }}>{e.action}</strong> {e.resourceType}/{e.resourceId} 已执行。</>
    case 'HITL_DENIED':
      return <><Cd color="#fb7185">{e.actor}</Cd> 安全授权被拒绝。<strong style={{ color: '#fb7185' }}>{e.action}</strong> {e.resourceType}/{e.resourceId} 已阻断。</>
    case 'TEST_SUCCESS':
      return <><Cd color="#c084fc">{e.actor}</Cd> 测试通过：<strong style={{ color: '#34d399' }}>{e.action}</strong> {e.resourceType}/{e.resourceId}。</>
    case 'EXEC':
      return <><Cd>{e.actor}</Cd> {e.action} {e.resourceType}/{e.resourceId}</>
    case 'SKILL_SCAN':
      return <><Cd color="#f97316">{e.actor}</Cd> {e.action} <Cd>{e.resourceId}</Cd></>
    case 'AGENT_START':
      return <><Cd color="#22d3ee">{e.actor}</Cd> <strong style={{ color: '#34d399' }}>{e.action}</strong> — Agent <Cd color="#22d3ee">{e.resourceId}</Cd> 已上线。</>
    case 'AGENT_STOP':
      return <><Cd color="#6b7280">{e.actor}</Cd> <strong style={{ color: '#fb7185' }}>{e.action}</strong> — Agent <Cd color="#6b7280">{e.resourceId}</Cd> 已下线。</>
    default:
      return <>{e.actor} {e.action} {e.resourceType}/{e.resourceId}</>
  }
}

export default function ActivityLog() {
  const activityEntries = useMonitoringStore((s) => s.activityEntries)
  const [filter, setFilter] = useState<ActivityFilter>('全部')

  const entries = filter === '全部'
    ? activityEntries
    : activityEntries.filter((e) => FILTER_MAP[filter].includes(e.activityType))

  const { containerRef, handleScroll } = useAutoScroll(entries)

  return (
    <div className="flex flex-col h-full font-sans">
      {/* 审计标题 */}
      <div className="py-1 text-[10px] font-mono shrink-0 text-center tracking-wider uppercase border-y border-dashed" style={{ color: '#6b7280', borderColor: '#1f2937' }}>
        [ 蜂群运作活动审计流 (Audit) ]
      </div>
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
        className="flex-1 overflow-y-auto p-3 space-y-2"
        onScroll={handleScroll}
      >
        {entries.length === 0 ? (
          <div className="text-center py-8 text-[11px] font-mono" style={{ color: '#6b7280' }}>
            暂无活动记录
          </div>
        ) : entries.map(entry => {
          const isAmber = entry.activityType === 'SECURITY_GATE'
          const isGreen = entry.activityType === 'HITL_PASSED'
          const isRose = entry.activityType === 'HITL_DENIED'
          const isPurple = entry.activityType === 'MCP_CALL' || entry.activityType === 'TEST_SUCCESS'
          const isOrange = entry.activityType === 'SKILL_SCAN'
          const isCyan = entry.activityType === 'AGENT_START'
          const isGray = entry.activityType === 'AGENT_STOP'
          const bgStyle = isAmber ? 'rgba(69,26,3,0.2)' : isGreen ? 'rgba(5,46,22,0.2)' : isRose ? 'rgba(127,29,29,0.2)' : isPurple ? 'rgba(59,7,100,0.2)' : isOrange ? 'rgba(69,26,3,0.15)' : isCyan ? 'rgba(8,51,68,0.15)' : isGray ? 'rgba(55,65,81,0.15)' : 'rgba(33,38,45,0.4)'
          const borderStyle = isAmber ? 'rgba(120,53,15,0.4)' : isGreen ? 'rgba(20,83,45,0.4)' : isRose ? 'rgba(136,19,55,0.4)' : isPurple ? 'rgba(88,28,135,0.3)' : isOrange ? 'rgba(154,52,18,0.3)' : isCyan ? 'rgba(21,94,117,0.3)' : isGray ? 'rgba(75,85,99,0.3)' : '#30363d'
          return (
            <div
              key={entry.id}
              className="p-2 rounded-lg space-y-1"
              style={{ background: bgStyle, border: `1px solid ${borderStyle}` }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold font-mono" style={{ color: entry.color }}>
                  [{entry.activityType}]
                </span>
                <span className="text-[9px] font-mono" style={{ color: '#6b7280' }}>
                  {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ''}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: '#d1d5db' }}>
                {renderDescription(entry)}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

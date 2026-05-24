import { useState, useMemo, useCallback, useEffect } from 'react'
import { useAgentLifecycleStore } from '../stores/agentLifecycleStore'
import { api, type AgentInfo } from '../services'
import { logger } from '../utils'
import AgentConfigModal from './AgentConfigModal'
import type { AgentConfig } from '../types'

interface CLIProcess {
  id: string
  name: string
  role: string
  version: string
  status: 'running' | 'idle' | 'blocked' | 'stopped' | 'thinking' | 'stuck'
  pid?: number
  command?: string
}

function toProcess(a: AgentInfo, lifecycleState?: string): CLIProcess {
  const state = lifecycleState || a.state || a.status || 'unknown'
  let status: CLIProcess['status'] = 'stopped'
  if (state === 'executing' || state === 'running') status = 'running'
  else if (state === 'thinking') status = 'thinking'
  else if (state === 'stuck') status = 'stuck'
  else if (state === 'error') status = 'blocked'
  else if (state === 'idle') status = 'idle'
  return {
    id: a.id,
    name: a.name,
    role: a.type || 'worker',
    version: a.capabilities?.join(', ') || '-',
    status,
    pid: a.pid,
    command: a.command,
  }
}

const KNOWN_MEMORY: Record<string, number> = {
  'claude-code': 142,
  'gemini-cli': 128,
  'aider': 96,
}

function estimateMemory(name: string): number {
  const lower = name.toLowerCase()
  for (const [key, mem] of Object.entries(KNOWN_MEMORY)) {
    if (lower.includes(key)) return mem
  }
  return 80
}

export default function CLIProcessWorkshop() {
  const [agentInfos, setAgentInfos] = useState<AgentInfo[]>([])
  const [selectedRow, setSelectedRow] = useState<string | null>(null)
  const [configModalAgent, setConfigModalAgent] = useState<AgentConfig | null>(null)

  // Read lifecycle state from store for real-time updates
  const lifecycleAgents = useAgentLifecycleStore(state => state.agents)

  // Initial load + periodic refresh of agent list
  useEffect(() => {
    const loadAgents = () => {
      api.agent.getAgents()
        .then(infos => setAgentInfos(infos))
        .catch(err => logger.debug('CLIProcessWorkshop', 'Failed to load agents:', err))
    }
    loadAgents()
    const timer = setInterval(loadAgents, 10000)
    return () => clearInterval(timer)
  }, [])

  // Merge agent info with real-time lifecycle state
  const processes: CLIProcess[] = useMemo(() => {
    return agentInfos.map(a => {
      const lifecycle = lifecycleAgents.get(a.id)
      return toProcess(a, lifecycle?.state)
    })
  }, [agentInfos, lifecycleAgents])

  const handleRowClick = useCallback((proc: CLIProcess) => {
    setSelectedRow(proc.id)
    // Dispatch custom event for MainLayout and other listeners
    window.dispatchEvent(new CustomEvent('sandbox:node-selected', {
      detail: { agentId: proc.id, agentName: proc.name }
    }))
  }, [])

  const handleConfigClick = useCallback((e: React.MouseEvent, proc: CLIProcess) => {
    e.stopPropagation()
    // Build an AgentConfig from the process info for the modal
    const config: AgentConfig = {
      id: proc.id,
      name: proc.name,
      description: `${proc.role} agent`,
      enabled: true,
      command: proc.command || '',
      args: [],
      env: {},
      tags: [],
    }
    setConfigModalAgent(config)
  }, [])

  const handleConfigSaved = useCallback((saved: AgentConfig) => {
    logger.debug('CLIProcessWorkshop', 'Agent config saved:', saved.id)
    // Refresh agent list after save
    api.agent.getAgents()
      .then(infos => setAgentInfos(infos))
      .catch(err => logger.debug('CLIProcessWorkshop', 'Failed to refresh agents:', err))
  }, [])

  const nameColor = (name: string, status: CLIProcess['status']): string => {
    const lower = name.toLowerCase()
    if (lower.includes('gemini')) return '#22d3ee'
    if (lower.includes('claude')) return '#fb923c'
    if (lower.includes('mcp') || lower.includes('validation')) return '#c084fc'
    if (lower.includes('aider')) return '#4ade80'
    return status === 'running' ? '#22d3ee' : status === 'blocked' ? '#fb923c' : '#9ca3af'
  }

  const statusDotStyle = (proc: CLIProcess): React.CSSProperties => {
    const lower = proc.name.toLowerCase()
    switch (proc.status) {
      case 'running': return { background: '#06b6d4', boxShadow: '0 0 4px #06b6d4' }
      case 'thinking': return { background: '#60a5fa', animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite' }
      case 'stuck': return { background: '#fbbf24', animation: 'ping 0.8s cubic-bezier(0, 0, 0.2, 1) infinite' }
      case 'idle': {
        if (lower.includes('mcp') || lower.includes('validation')) return { background: '#a855f7', opacity: 0.4 }
        if (lower.includes('aider')) return { background: '#22c55e', opacity: 0.4 }
        if (lower.includes('gemini')) return { background: '#06b6d4', opacity: 0.4 }
        if (lower.includes('claude')) return { background: '#f97316', opacity: 0.4 }
        return { background: '#a855f7', opacity: 0.4 }
      }
      case 'blocked': return { background: '#f97316', animation: 'ping 1s cubic-bezier(0, 0, 0.2, 1) infinite' }
      case 'stopped': return { background: '#f85149', opacity: 0.4 }
    }
  }

  const statusText = (proc: CLIProcess): { text: string; color: string } => {
    switch (proc.status) {
      case 'running': return { text: '执行中', color: '#06b6d4' }
      case 'thinking': return { text: '思考中', color: '#60a5fa' }
      case 'stuck': return { text: '已卡住', color: '#fbbf24' }
      case 'blocked': return { text: '被安全闸阻断：等候特权核准执行', color: '#f97316' }
      case 'idle': return { text: 'idle (sleeping)', color: '#64748b' }
      case 'stopped': return { text: 'stopped', color: '#f85149' }
    }
  }

  return (
    <div className="h-full overflow-auto p-3">
      <table className="w-full text-left text-xs font-mono" style={{ color: '#d1d5db' }}>
        <thead>
          <tr className="uppercase text-[10px] border-b pb-2" style={{ color: '#6b7280', borderColor: '#30363d' }}>
            <th className="py-2 pl-2">工具/进程 ID (CLI BINARY)</th>
            <th className="py-2">核心职能 (ROLE)</th>
            <th className="py-2">版本 (VERSION)</th>
            <th className="py-2">PID / 内存 (RESOURCES)</th>
            <th className="py-2">当前执行 CLI 指令 (RUNNING COMMAND)</th>
            <th className="py-2 text-right pr-2">控制 (OPERATIONS)</th>
          </tr>
        </thead>
        <tbody style={{ color: '#d1d5db' }}>
          {processes.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-8 text-center" style={{ color: '#6b7280' }}>
                暂无运行中的 CLI 进程
              </td>
            </tr>
          ) : processes.map(proc => {
            const st = statusText(proc)
            const isSelected = selectedRow === proc.id
            return (
              <tr
                key={proc.id}
                className="cursor-pointer transition-colors hover:bg-[#21262d]"
                style={{
                  borderBottom: '1px solid #1f2937',
                  background: isSelected ? 'rgba(88,166,255,0.05)' : undefined,
                }}
                onClick={() => handleRowClick(proc)}
              >
                <td className="py-2.5 pl-2 font-bold flex items-center gap-1.5" style={{ color: nameColor(proc.name, proc.status) }}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={statusDotStyle(proc)} />
                  {proc.name}
                </td>
                <td>{proc.role}</td>
                <td style={{ color: '#9ca3af' }}>{proc.version}</td>
                <td className={proc.status === 'blocked' || proc.status === 'running' || proc.status === 'stuck' ? 'font-semibold' : ''} style={{ color: proc.status === 'blocked' ? '#fb923c' : proc.status === 'running' ? '#94a3b8' : proc.status === 'stuck' ? '#fbbf24' : '#64748b' }}>
                  {proc.pid ? `PID: ${proc.pid} / ${estimateMemory(proc.name)}MB` : '-'}
                </td>
                <td>
                  {proc.status === 'blocked' ? (
                    <span className="font-semibold" style={{ color: st.color }}>{st.text}</span>
                  ) : proc.status === 'stuck' ? (
                    <span className="font-semibold" style={{ color: st.color }}>{st.text}</span>
                  ) : proc.command ? (
                    <code className="text-[10px] px-1 rounded" style={{ color: '#64748b', background: '#020617' }}>{proc.command}</code>
                  ) : (
                    <code className="text-[10px] px-1 rounded" style={{ color: '#64748b', background: '#020617' }}>{st.text}</code>
                  )}
                </td>
                <td className="text-right pr-2">
                  <button
                    onClick={e => handleConfigClick(e, proc)}
                    className="px-2 py-0.5 rounded text-[10px] flex items-center gap-1 hover:bg-gray-700 transition-colors ml-auto"
                    style={{ background: '#1f2937', color: '#d1d5db', border: '1px solid #374151' }}
                  >
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                    </svg>
                    配置
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Agent Config Modal */}
      {configModalAgent && (
        <AgentConfigModal
          agent={configModalAgent}
          onClose={() => setConfigModalAgent(null)}
          onSaved={handleConfigSaved}
        />
      )}
    </div>
  )
}

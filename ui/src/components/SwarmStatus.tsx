import { useState } from 'react'

export interface SwarmTask {
  id: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  assignedTo?: string
  progress?: number
}

export interface ConsensusVote {
  agentId: string
  agentName: string
  vote: 'agree' | 'disagree' | 'abstain'
  reason?: string
}

interface EmergenceHealth {
  overallScore?: number
  congestionLevel?: number
  collaborationIndex?: number
  innovationRate?: number
  agentUtilization?: number
}

export interface EmergentSignal {
  id: string
  type: string
  severity: string
  message: string
  timestamp?: string
}

interface SwarmStatusProps {
  primaryAgentId?: string
  tasks: SwarmTask[]
  consensus?: {
    total: number
    agreed: number
    votes: ConsensusVote[]
  }
  progress?: number
  emergence?: {
    health?: EmergenceHealth
    signals?: EmergentSignal[]
  }
}

export function SwarmStatus({ primaryAgentId, tasks, consensus, progress, emergence }: SwarmStatusProps) {
  const [expanded, setExpanded] = useState(false)

  const completedTasks = tasks.filter(t => t.status === 'completed').length
  const runningTasks = tasks.filter(t => t.status === 'running').length

  return (
    <div className="p-3" style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border-default)' }}>
      {/* 状态概览 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-base">🐝</span>
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            蜂群状态
          </span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs transition-colors"
          style={{ color: 'var(--text-muted)' }}
        >
          {expanded ? '收起' : '展开'}
        </button>
      </div>

      {/* 当前主导 */}
      {primaryAgentId && (
        <div className="flex items-center gap-2 mb-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <span>当前主导:</span>
          <span className="agent-badge primary">{primaryAgentId}</span>
        </div>
      )}

      {/* 进度条 */}
      {progress !== undefined && (
        <div className="mb-2">
          <div className="flex items-center justify-between text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
            <span>任务进度</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, background: 'var(--primary)' }}
            />
          </div>
        </div>
      )}

      {/* 任务统计 */}
      <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        <span>任务: {completedTasks}/{tasks.length}</span>
        <span>运行中: {runningTasks}</span>
      </div>

      {/* 共识状态 */}
      {consensus && (
        <div className="mt-2 p-2 rounded-md" style={{ background: 'var(--bg-elevated)' }}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span style={{ color: 'var(--text-secondary)' }}>共识投票</span>
            <span style={{ color: consensus.agreed > consensus.total / 2 ? 'var(--success)' : 'var(--text-muted)' }}>
              {consensus.agreed}/{consensus.total} 同意
            </span>
          </div>

          {/* 展开时显示投票详情 */}
          {expanded && (
            <div className="mt-2 space-y-1">
              {consensus.votes.map(vote => (
                <div key={vote.agentId} className="flex items-center gap-2 text-xs">
                  <span className={`
                    w-4 h-4 rounded-full flex items-center justify-center text-[10px]
                    ${vote.vote === 'agree' ? 'bg-success/20 text-success' :
                      vote.vote === 'disagree' ? 'bg-error/20 text-error' :
                      'bg-text-muted/20'}
                  `} style={vote.vote === 'abstain' ? { color: 'var(--text-muted)' } : undefined}>
                    {vote.vote === 'agree' ? '✓' : vote.vote === 'disagree' ? '✗' : '-'}
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>{vote.agentName}</span>
                  {vote.reason && (
                    <span className="flex-1 truncate" style={{ color: 'var(--text-muted)' }}>
                      {vote.reason}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 展开时显示任务列表 */}
      {expanded && tasks.length > 0 && (
        <div className="mt-2 space-y-1">
          {tasks.map(task => (
            <div
              key={task.id}
              className="flex items-center gap-2 p-1.5 rounded text-xs"
              style={{ background: 'var(--bg-elevated)' }}
            >
              <span className={`
                w-2 h-2 rounded-full
                ${task.status === 'running' ? 'bg-warning animate-pulse' :
                  task.status === 'completed' ? 'bg-success' :
                  task.status === 'failed' ? 'bg-error' :
                  'bg-text-muted'}
              `} />
              <span className="flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
                {task.name}
              </span>
              {task.assignedTo && (
                <span style={{ color: 'var(--text-muted)' }}>{task.assignedTo}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Emergence / Pheromone Health */}
      {expanded && emergence?.health && (
        <div className="mt-2 p-2 rounded-md" style={{ background: 'var(--bg-elevated)' }}>
          <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
            信息素健康度
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {emergence.health.overallScore !== undefined && (
              <div>
                <span style={{ color: 'var(--text-muted)' }}>整体评分</span>
                <span className="ml-1 font-mono" style={{ color: 'var(--text-primary)' }}>
                  {Math.round(emergence.health.overallScore * 100)}%
                </span>
              </div>
            )}
            {emergence.health.congestionLevel !== undefined && (
              <div>
                <span style={{ color: 'var(--text-muted)' }}>拥堵度</span>
                <span className="ml-1 font-mono" style={{ color: emergence.health.congestionLevel > 0.5 ? 'var(--error)' : 'var(--text-primary)' }}>
                  {Math.round(emergence.health.congestionLevel * 100)}%
                </span>
              </div>
            )}
            {emergence.health.collaborationIndex !== undefined && (
              <div>
                <span style={{ color: 'var(--text-muted)' }}>协作指数</span>
                <span className="ml-1 font-mono" style={{ color: 'var(--text-primary)' }}>
                  {Math.round(emergence.health.collaborationIndex * 100)}%
                </span>
              </div>
            )}
            {emergence.health.agentUtilization !== undefined && (
              <div>
                <span style={{ color: 'var(--text-muted)' }}>利用率</span>
                <span className="ml-1 font-mono" style={{ color: 'var(--text-primary)' }}>
                  {Math.round(emergence.health.agentUtilization * 100)}%
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Emergent Signals */}
      {expanded && emergence?.signals && emergence.signals.length > 0 && (
        <div className="mt-2 space-y-1">
          <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            涌现信号
          </div>
          {emergence.signals.slice(0, 5).map(signal => (
            <div key={signal.id} className="flex items-center gap-2 p-1.5 rounded text-xs" style={{ background: 'var(--bg-elevated)' }}>
              <span className="w-2 h-2 rounded-full" style={{
                background: signal.severity === 'high' ? 'var(--error)' : signal.severity === 'medium' ? 'var(--warning)' : 'var(--text-muted)'
              }} />
              <span className="flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{signal.message}</span>
              <span className="text-[10px] capitalize" style={{ color: 'var(--text-muted)' }}>{signal.type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

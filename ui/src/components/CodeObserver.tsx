import { useState } from 'react'

export interface FileChange {
  path: string
  additions: number
  deletions: number
  status: 'modified' | 'added' | 'deleted' | 'renamed'
}

export interface AgentPerformance {
  agentId: string
  name: string
  status: 'working' | 'idle' | 'completed'
  latency: number
  tasksCompleted: number
}

interface CodeObserverProps {
  changes: FileChange[]
  agentPerformance: AgentPerformance[]
  selectedFile?: string
  onFileSelect?: (path: string) => void
}

const STATUS_ICONS = {
  modified: '●',
  added: '+',
  deleted: '-',
  renamed: '→',
}

const STATUS_COLORS = {
  modified: 'text-warning',
  added: 'text-success',
  deleted: 'text-error',
  renamed: 'text-info',
}

export function CodeObserver({ changes, agentPerformance, selectedFile, onFileSelect }: CodeObserverProps) {
  const [activeTab, setActiveTab] = useState<'changes' | 'performance' | 'diagnostics'>('changes')

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-default)' }}>
      {/* 标签栏 */}
      <div className="flex items-center" style={{ borderBottom: '1px solid var(--border-default)' }}>
        {(['changes', 'performance', 'diagnostics'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`
              flex-1 px-3 py-2 text-xs font-medium transition-colors
              ${activeTab === tab ? 'border-b-2 border-primary text-primary' : ''}
            `}
            style={activeTab !== tab ? { color: 'var(--text-muted)' } : undefined}
          >
            {tab === 'changes' ? '变更文件' : tab === 'performance' ? 'Agent 性能' : '诊断'}
          </button>
        ))}
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto">
        {/* 变更文件 */}
        {activeTab === 'changes' && (
          <div className="p-2">
            {changes.length === 0 ? (
              <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
                <div className="text-2xl mb-2">📄</div>
                <div className="text-sm">暂无变更</div>
              </div>
            ) : (
              <div className="space-y-1">
                {changes.map(change => (
                  <button
                    key={change.path}
                    onClick={() => onFileSelect?.(change.path)}
                    className={`
                      w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors
                      ${selectedFile === change.path ? 'bg-primary/10' : 'hover:bg-bg-hover'}
                    `}
                  >
                    <span className={STATUS_COLORS[change.status]}>
                      {STATUS_ICONS[change.status]}
                    </span>
                    <span className="flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
                      {change.path.split('/').pop()}
                    </span>
                    <span className="flex items-center gap-1 text-xs">
                      <span className="text-success">+{change.additions}</span>
                      <span className="text-error">-{change.deletions}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Agent 性能 */}
        {activeTab === 'performance' && (
          <div className="p-2">
            {agentPerformance.length === 0 ? (
              <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
                <div className="text-2xl mb-2">📊</div>
                <div className="text-sm">暂无 Agent 运行</div>
              </div>
            ) : (
              <div className="space-y-2">
                {agentPerformance.map(agent => (
                  <div
                    key={agent.agentId}
                    className="p-2 rounded-md"
                    style={{ background: 'var(--bg-elevated)' }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {agent.name}
                      </span>
                      <span className={`
                        text-xs px-1.5 py-0.5 rounded-full
                        ${agent.status === 'working' ? 'bg-warning/20 text-warning' :
                          agent.status === 'completed' ? 'bg-success/20 text-success' :
                          'bg-text-muted/20'}
                      `} style={agent.status === 'idle' ? { color: 'var(--text-muted)' } : undefined}>
                        {agent.status === 'working' ? '工作中' :
                         agent.status === 'completed' ? '已完成' : '空闲'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <span>延迟: {agent.latency}ms</span>
                      <span>完成: {agent.tasksCompleted}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 诊断信息 */}
        {activeTab === 'diagnostics' && (
          <div className="p-2">
            <div className="space-y-2">
              <div className="p-2 rounded-md" style={{ background: 'var(--bg-elevated)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="status-dot active" />
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>LSP</span>
                </div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  gopls: 0 错误, 2 警告
                </div>
              </div>
              <div className="p-2 rounded-md" style={{ background: 'var(--bg-elevated)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="status-dot active" />
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Git</span>
                </div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  分支: main, 3 个未提交变更
                </div>
              </div>
              <div className="p-2 rounded-md" style={{ background: 'var(--bg-elevated)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="status-dot active" />
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Terminal</span>
                </div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  bash: 运行中
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

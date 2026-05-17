import { useState } from 'react'
import { AgentConnectionPanel } from '../components/AgentConnectionPanel'
import { AgentSessionPanel } from '../components/AgentSessionPanel'

type Tab = 'connections' | 'sessions'

export function AgentManagementPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('connections')

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-surface)' }}>
      {/* 标签栏 */}
      <div className="flex items-center" style={{ borderBottom: '1px solid var(--border-default)' }}>
        {(['connections', 'sessions'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`
              flex-1 px-3 py-2 text-xs font-medium transition-colors
              ${activeTab === tab ? 'border-b-2 border-primary text-primary' : ''}
            `}
            style={activeTab !== tab ? { color: 'var(--text-muted)' } : undefined}
          >
            {tab === 'connections' ? 'Agent 连接' : '会话历史'}
          </button>
        ))}
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'connections' && <AgentConnectionPanel />}
        {activeTab === 'sessions' && <AgentSessionPanel />}
      </div>
    </div>
  )
}

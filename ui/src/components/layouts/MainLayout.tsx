import { ReactNode, useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../../store/appStore'
import { AgentCluster, Agent } from '../AgentCluster'
import { CodeObserver, FileChange, AgentPerformance } from '../CodeObserver'
import { AgentManagementPanel } from '../../panels/AgentManagementPanel'
import { api } from '../../services'
import { AGENT_ICONS, mapAgentStatus } from '../../utils/agentUtils'

interface MainLayoutProps {
  children: ReactNode
}

export default function MainLayout({ children }: MainLayoutProps) {
  const [leftWidth, setLeftWidth] = useState(240)
  const [rightWidth, setRightWidth] = useState(320)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [primaryAgentId, setPrimaryAgentId] = useState<string | undefined>('claude-code')
  const [selectedFile, setSelectedFile] = useState<string | undefined>()
  const [agentPerformance, setAgentPerformance] = useState<AgentPerformance[]>([])
  const [fileChanges, setFileChanges] = useState<FileChange[]>([])

  // Get agents from store
  const agents = useAppStore(state => state.agents)
  const zenMode = useAppStore(state => state.zenMode)

  // Convert backend agents to AgentCluster format
  const clusterAgents: Agent[] = agents.map(agent => ({
    id: agent.id,
    name: agent.name,
    icon: AGENT_ICONS[agent.id] || AGENT_ICONS.default,
    status: mapAgentStatus(agent.state),
    role: agent.id === primaryAgentId ? 'primary' : 'worker',
  }))

  // Fetch agent performance data
  const fetchAgentPerformance = useCallback(async () => {
    try {
      const agentList = await api.agent.getAgents()
      const perfData: AgentPerformance[] = agentList.map(a => ({
        agentId: a.id,
        name: a.name,
        status: a.state === 'executing' ? 'working' as const :
                a.state === 'idle' ? 'idle' as const : 'completed' as const,
        latency: 0, // Will be populated from real metrics
        tasksCompleted: 0, // Will be populated from real metrics
      }))
      setAgentPerformance(perfData)
    } catch {
      // Use empty array on error
      setAgentPerformance([])
    }
  }, [])

  // Fetch file changes (git diff)
  const fetchFileChanges = useCallback(async () => {
    try {
      // This would be a real API call to get git diff
      // For now, use empty array
      setFileChanges([])
    } catch {
      setFileChanges([])
    }
  }, [])

  useEffect(() => {
    fetchAgentPerformance()
    fetchFileChanges()

    // Refresh every 30 seconds
    const interval = setInterval(() => {
      fetchAgentPerformance()
      fetchFileChanges()
    }, 30000)

    return () => clearInterval(interval)
  }, [fetchAgentPerformance, fetchFileChanges])

  // Handle setting primary agent
  const handleSetPrimary = useCallback((agentId: string) => {
    setPrimaryAgentId(agentId)
    // Could also send this to backend
  }, [])

  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      {/* 标题栏 */}
      {!zenMode && (
        <div
          className="h-8 flex items-center px-3 shrink-0 mac-title-bar"
          style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-default)' }}
        >
          {/* 左侧: 面板切换 */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setLeftCollapsed(!leftCollapsed)}
              className="p-1 rounded transition-colors hover:bg-bg-hover"
              title="切换左侧面板"
              aria-label="切换左侧面板"
            >
              <svg className="w-4 h-4" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </button>
          </div>

          {/* 中间: 应用标题 */}
          <div className="flex-1 text-center">
            <span className="text-xs font-medium tracking-wide" style={{ color: 'var(--text-muted)' }}>
              Swarm Editor
            </span>
          </div>

          {/* 右侧: 面板切换 */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setRightCollapsed(!rightCollapsed)}
              className="p-1 rounded transition-colors hover:bg-bg-hover"
              title="切换右侧面板"
              aria-label="切换右侧面板"
            >
              <svg className="w-4 h-4" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* 主内容区 - 三栏布局 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧: 上下文面板 */}
        {!zenMode && !leftCollapsed && (
          <div
            className="shrink-0 overflow-hidden"
            style={{
              width: leftWidth,
              background: 'var(--bg-surface)',
              borderRight: '1px solid var(--border-default)',
            }}
          >
            <div className="h-full relative group flex flex-col">
              {/* Agent 集群状态栏 */}
              <AgentCluster
                agents={clusterAgents}
                primaryAgentId={primaryAgentId}
                onSetPrimary={handleSetPrimary}
              />
              {/* Agent 管理面板 */}
              <div className="flex-1 overflow-hidden">
                <AgentManagementPanel />
              </div>
              {/* 拖拽手柄 */}
              <div
                className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: 'var(--primary)' }}
                onMouseDown={(e) => {
                  const startX = e.clientX
                  const startWidth = leftWidth
                  const handleMove = (ev: MouseEvent) => {
                    setLeftWidth(Math.max(180, Math.min(400, startWidth + ev.clientX - startX)))
                  }
                  const handleUp = () => {
                    document.removeEventListener('mousemove', handleMove)
                    document.removeEventListener('mouseup', handleUp)
                  }
                  document.addEventListener('mousemove', handleMove)
                  document.addEventListener('mouseup', handleUp)
                }}
              />
            </div>
          </div>
        )}

        {/* 中间: 核心内容区 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {children}
        </div>

        {/* 右侧: 代码观测台 */}
        {!zenMode && !rightCollapsed && (
          <div
            className="shrink-0 overflow-hidden"
            style={{
              width: rightWidth,
              background: 'var(--bg-surface)',
              borderLeft: '1px solid var(--border-default)',
            }}
          >
            <div className="h-full relative group">
              <CodeObserver
                changes={fileChanges}
                agentPerformance={agentPerformance}
                selectedFile={selectedFile}
                onFileSelect={setSelectedFile}
              />
              {/* 拖拽手柄 */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: 'var(--primary)' }}
                onMouseDown={(e) => {
                  const startX = e.clientX
                  const startWidth = rightWidth
                  const handleMove = (ev: MouseEvent) => {
                    setRightWidth(Math.max(250, Math.min(500, startWidth - ev.clientX + startX)))
                  }
                  const handleUp = () => {
                    document.removeEventListener('mousemove', handleMove)
                    document.removeEventListener('mouseup', handleUp)
                  }
                  document.addEventListener('mousemove', handleMove)
                  document.addEventListener('mouseup', handleUp)
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

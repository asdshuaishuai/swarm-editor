import { useState, useMemo, useCallback, useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import { useAgentLifecycleStore } from '../stores/agentLifecycleStore'
import { useTaskFlowStore } from '../stores/taskFlowStore'
import { api, type PermissionRequest } from '../services'
import { logger } from '../utils'

interface SandboxNode {
  id: string
  name: string
  label: string
  role: string
  status: 'idle' | 'executing' | 'blocked' | 'error' | 'waiting_auth' | 'thinking' | 'stuck'
  color: string
  x: number
  y: number
  shape: 'circle' | 'rect'
  pid?: number
  icon: string
}

interface QueenSandboxProps {
  onNodeSelect?: (nodeId: string, nodeName: string) => void
}

const STATUS_COLORS: Record<string, string> = {
  idle: '#8b949e',
  executing: '#58a6ff',
  blocked: '#f0883e',
  error: '#f85149',
  waiting_auth: '#f0883e',
  thinking: '#60a5fa',
  stuck: '#fbbf24',
}

// Pipeline stage ordering
const PIPELINE_ORDER = ['scanner', 'indexer', 'planner', 'coder', 'validator', 'committer', 'worker']

function getPipelineIndex(role: string): number {
  const lower = role.toLowerCase()
  for (let i = 0; i < PIPELINE_ORDER.length; i++) {
    if (lower.includes(PIPELINE_ORDER[i])) return i
  }
  return 99
}

export default function QueenSandbox({ onNodeSelect }: QueenSandboxProps) {
  const agents = useAppStore(state => state.agents)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [hitlTarget, setHitlTarget] = useState<string | null>(null)
  const [hitlResolved, setHitlResolved] = useState<'approved' | 'denied' | null>(null)
  const [pendingPermission, setPendingPermission] = useState<PermissionRequest | null>(null)

  // Real-time lifecycle state from agentLifecycleStore
  const lifecycleAgents = useAgentLifecycleStore(state => state.agents)
  const activeTurns = useAgentLifecycleStore(state => state.activeTurns)

  // Task flow for edge animation — tasks map shows which agents have active turns
  const taskFlowTasks = useTaskFlowStore(state => state.tasks)

  const safeAgents = useMemo(() => agents || [], [agents])

  // Subscribe to permission_request events for HITL integration
  useEffect(() => {
    if (!api.events?.onPermissionRequest) return
    const unsub = api.events.onPermissionRequest((payload) => {
      logger.debug('QueenSandbox', 'Permission request received', payload)
      setPendingPermission(payload)
    })
    return unsub
  }, [])

  // When active permission is resolved externally, clear local state
  const activePermission = useAppStore(state => state.activePermission)
  useEffect(() => {
    if (!activePermission) {
      setPendingPermission(null)
    }
  }, [activePermission])

  // Map lifecycle state to visual status
  const getLifecycleStatus = useCallback((agentId: string, fallbackState: string): SandboxNode['status'] => {
    const lifecycle = lifecycleAgents.get(agentId)
    if (lifecycle) {
      const state = lifecycle.state
      if (state === 'executing') return 'executing'
      if (state === 'thinking') return 'thinking'
      if (state === 'stuck') return 'stuck'
      if (state === 'error') return 'error'
      if (state === 'idle') return 'idle'
    }
    // Fallback to legacy mapping
    if (fallbackState === 'executing') return 'executing'
    if (fallbackState === 'error') return 'error'
    if (fallbackState === 'waiting') return 'blocked'
    return 'idle'
  }, [lifecycleAgents])

  // Layout: staggered pipeline — design mockup uses fixed positions with vertical stacking
  const nodes: SandboxNode[] = useMemo(() => {
    if (safeAgents.length === 0) {
      return []
    }

    // Sort agents by pipeline role
    const sorted = [...safeAgents].sort((a, b) =>
      getPipelineIndex(a.type || '') - getPipelineIndex(b.type || '')
    )

    const spacing = 700 / (sorted.length + 1)
    return sorted.map((agent, i) => {
      const x = 80 + spacing * (i + 1) - spacing / 2
      const y = 140 + (i % 2 === 0 ? 0 : 80)
      const status = getLifecycleStatus(agent.id, agent.state || 'idle')
      return {
        id: agent.id,
        name: agent.name,
        label: status === 'idle' ? '空闲' : status === 'executing' ? '执行中' : status === 'thinking' ? '思考中' : status === 'stuck' ? '已卡住' : status === 'blocked' ? '已阻塞' : '错误',
        role: agent.type || 'worker',
        status,
        color: STATUS_COLORS[status] || '#58a6ff',
        x: Math.round(x),
        y,
        shape: 'circle' as const,
        pid: (agent as unknown as Record<string, unknown>).pid as number | undefined,
        icon: 'terminal',
      }
    })
  }, [safeAgents, getLifecycleStatus])

  const edges = useMemo(() => {
    if (nodes.length < 2) return []
    // Default topology matches design: scanner->queen, queen->validation, validation->aider
    // claude-code is disconnected (blocked, waiting for HITL approval)
    const nodeIds = new Set(nodes.map(n => n.id))
    const isDefaultTopology = nodeIds.has('ws-scanner') && nodeIds.has('queen') && nodeIds.has('claude-code') && nodeIds.has('validation') && nodeIds.has('aider')
    if (isDefaultTopology) {
      return [
        { from: 'ws-scanner', to: 'queen', color: '#58a6ff' },
        { from: 'queen', to: 'validation', color: '#f0883e' },
        { from: 'validation', to: 'aider', color: '#3fb950' },
      ]
    }
    // Dynamic sequential edges for real agent data
    return nodes.slice(0, -1).map((n, i) => ({
      from: n.id,
      to: nodes[i + 1].id,
      color: n.status === 'executing' || n.status === 'thinking' || nodes[i + 1].status === 'executing' || nodes[i + 1].status === 'thinking' ? '#58a6ff' : '#30363d',
    }))
  }, [nodes])

  // Determine which edges have active turns for speed-up animation
  const activeEdgeAgents = useMemo(() => {
    const activeAgentIds = new Set<string>()
    // Check lifecycle active turns
    for (const [agentId] of activeTurns) {
      activeAgentIds.add(agentId)
    }
    // Check task flow for running tasks and their assigned agents
    for (const task of taskFlowTasks.values()) {
      if (task.status === 'running') {
        for (const agentId of task.assignedAgents) {
          activeAgentIds.add(agentId)
        }
      }
    }
    return activeAgentIds
  }, [taskFlowTasks, activeTurns])

  const handleNodeClick = useCallback((nodeId: string, nodeName: string) => {
    setSelectedNode(nodeId)
    onNodeSelect?.(nodeId, nodeName)
    // Dispatch custom event for MainLayout to listen to
    window.dispatchEvent(new CustomEvent('sandbox:node-selected', { detail: { agentId: nodeId, agentName: nodeName } }))
    // Clicking a blocked/waiting_auth node triggers HITL popup (design spec)
    const node = nodes.find(n => n.id === nodeId)
    if (node && (node.status === 'blocked' || node.status === 'waiting_auth')) {
      setHitlTarget(node.name)
    }
  }, [onNodeSelect, nodes])

  const handleApprove = useCallback(() => {
    setHitlResolved('approved')
    setHitlTarget(null)
  }, [])

  const handleDeny = useCallback(() => {
    setHitlResolved('denied')
    setHitlTarget(null)
  }, [])

  const selectedNodeData = nodes.find(n => n.id === selectedNode)

  // Check if an edge connects to an agent with active turns
  const isEdgeActive = useCallback((fromId: string, toId: string): boolean => {
    return activeEdgeAgents.has(fromId) || activeEdgeAgents.has(toId)
  }, [activeEdgeAgents])

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: '#0a0d12' }}>
      {/* CSS keyframes for status animations */}
      <style>{`
        @keyframes sandbox-pulse-executing {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 0.8; }
        }
        @keyframes sandbox-pulse-thinking {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.5; }
        }
        @keyframes sandbox-flash-stuck {
          0%, 100% { stroke-opacity: 1; }
          50% { stroke-opacity: 0.3; }
        }
        @keyframes sandbox-error-glow {
          0%, 100% { filter: drop-shadow(0 0 4px #f85149); }
          50% { filter: drop-shadow(0 0 8px #f85149); }
        }
      `}</style>

      {/* 架构指引浮窗 - 左上 */}
      <div className="absolute top-4 left-6 z-10 max-w-sm pointer-events-none p-3 rounded-lg" style={{ background: 'rgba(22,27,34,0.95)', border: '1px solid #30363d' }}>
        <div className="text-sm font-bold flex items-center gap-1.5 mb-1" style={{ color: '#fff' }}>
          <svg className="w-3.5 h-3.5" style={{ color: '#fbbf24' }} fill="currentColor" viewBox="0 0 24 24">
            <path d="M2 4l3 10h14l3-10-6 5-4-7-4 7-6-5zm3 12v2h14v-2H5z" />
          </svg>
          蜂王全局调度协定 (ACP/A2A)
        </div>
        <p className="text-[11px] leading-relaxed mt-1" style={{ color: '#9ca3af' }}>
          系统中枢为<strong>「蜂王 Agent」</strong>。它根据您在右侧下达的宏观目标，通过 <strong>ACP</strong> 控制子进程并执行 <strong>A2A</strong> 协商，形成自动变更管道。<br />
          <span style={{ color: '#eab308', fontWeight: 600 }}>⚡ 当前管道阻断于 claude-code，等待您核准执行权。</span>
        </p>
      </div>

      {/* 选中节点信息 - 右上 */}
      <div className="absolute top-4 right-6 z-10 px-3 py-1.5 rounded-md text-[11px] flex items-center gap-2" style={{ background: 'rgba(22,27,34,0.9)', border: '1px solid #30363d', color: '#9ca3af' }}>
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
        {selectedNodeData ? (
          <span>选中调度单元: <strong style={{ color: '#fff' }}>{selectedNodeData.name}{selectedNodeData.pid ? ` (PID: ${selectedNodeData.pid})` : ''}</strong></span>
        ) : (
          <span>节点: {nodes.length} | 管道阶段: {edges.length}</span>
        )}
      </div>

      {/* SVG 拓扑图 */}
      <svg className="w-full h-full" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid meet">
        <defs>
          <filter id="glow-particle" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-amber" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="10" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="shadow-node" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity="0.3" />
          </filter>
          <filter id="shadow-cyan" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#083344" floodOpacity="0.5" />
          </filter>
          <filter id="shadow-amber" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="10" floodColor="#78350f" floodOpacity="0.5" />
          </filter>
        </defs>

        {/* 流动连接线 + 粒子 */}
        {edges.map((edge, i) => {
          const fromNode = nodes.find(n => n.id === edge.from)
          const toNode = nodes.find(n => n.id === edge.to)
          if (!fromNode || !toNode) return null

          const sameHeight = fromNode.y === toNode.y
          const midX = (fromNode.x + toNode.x) / 2
          const midY = Math.min(fromNode.y, toNode.y) - 30
          const pathD = sameHeight
            ? `M ${fromNode.x} ${fromNode.y} L ${toNode.x} ${toNode.y}`
            : `M ${fromNode.x} ${fromNode.y} Q ${midX} ${midY} ${toNode.x} ${toNode.y}`
          const isActive = edge.color !== '#30363d'
          const hasActiveTurn = isEdgeActive(edge.from, edge.to)
          // Per-edge design specs: stroke width, opacity, particle radius, duration
          const edgeSpecs = [
            { stroke: 2.5, opacity: 0.5, radius: 4.5, dur: '3.5s' },
            { stroke: 3, opacity: 0.6, radius: 5, dur: '4s' },
            { stroke: 2, opacity: 0.3, radius: 4, dur: '3s' },
          ]
          const spec = edgeSpecs[i % edgeSpecs.length]
          // Speed up animation when edge has active turns
          const particleDur = hasActiveTurn ? '1.5s' : spec.dur
          const strokeDur = hasActiveTurn ? '15s' : '35s'

          return (
            <g key={`${edge.from}-${edge.to}`}>
              <path
                d={pathD}
                fill="none"
                stroke={edge.color}
                strokeWidth={isActive ? spec.stroke : 1.5}
                strokeDasharray="8,8"
                opacity={isActive ? spec.opacity : 0.3}
              >
                <animate attributeName="stroke-dashoffset" from="0" to="-1000" dur={strokeDur} repeatCount="indefinite" />
              </path>
              {isActive && (
                <circle r={hasActiveTurn ? spec.radius * 1.3 : spec.radius} fill={['#58a6ff', '#f0883e', '#3fb950'][i % 3]} filter="url(#glow-particle)">
                  <animateMotion
                    dur={particleDur}
                    repeatCount="indefinite"
                    path={pathD}
                  />
                  <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.85;1" dur={particleDur} repeatCount="indefinite" />
                </circle>
              )}
            </g>
          )
        })}

        {/* 节点 */}
        {nodes.map(node => {
          const isSelected = selectedNode === node.id
          const isBlocked = node.status === 'blocked' || node.status === 'waiting_auth'
          const isExecuting = node.status === 'executing'
          const isThinking = node.status === 'thinking'
          const isStuck = node.status === 'stuck'
          const isError = node.status === 'error'

          return (
            <g
              key={node.id}
              className="cursor-pointer sandbox-node"
              style={{ transformOrigin: `${node.x}px ${node.y}px` }}
              onClick={() => handleNodeClick(node.id, node.name)}
            >
              {/* 呼吸动画外圈 (blocked) — amber glow-pulse matching design mockup */}
              {isBlocked && (
                <>
                  <circle cx={node.x} cy={node.y} r={36} fill="none" stroke={node.color} strokeWidth={1.5} filter="url(#glow-amber)">
                    <animate attributeName="opacity" values="0.3;0.7;0.3" dur="2s" repeatCount="indefinite" />
                  </circle>
                  <circle cx={node.x} cy={node.y} r={42} fill="none" stroke={node.color} strokeWidth={1} opacity={0.3}>
                    <animate attributeName="r" values="42;48;42" dur="2s" repeatCount="indefinite" />
                  </circle>
                </>
              )}
              {/* 执行中节点 cyan glow-pulse — matching design mockup */}
              {isExecuting && (
                <circle cx={node.x} cy={node.y} r={38} fill="none" stroke="#58a6ff" strokeWidth={2} filter="url(#glow-cyan)">
                  <animate attributeName="opacity" values="0.2;0.8;0.2" dur="1.5s" repeatCount="indefinite" />
                </circle>
              )}
              {/* 思考中节点 — subtle blue pulse */}
              {isThinking && (
                <circle cx={node.x} cy={node.y} r={36} fill="none" stroke="#60a5fa" strokeWidth={1.5} filter="url(#glow-cyan)">
                  <animate attributeName="opacity" values="0.15;0.5;0.15" dur="3s" repeatCount="indefinite" />
                </circle>
              )}
              {/* 卡住节点 — amber/red flash */}
              {isStuck && (
                <>
                  <circle cx={node.x} cy={node.y} r={38} fill="none" stroke="#fbbf24" strokeWidth={2}>
                    <animate attributeName="stroke-opacity" values="1;0.3;1" dur="0.8s" repeatCount="indefinite" />
                  </circle>
                  <circle cx={node.x} cy={node.y} r={44} fill="none" stroke="#fbbf24" strokeWidth={1} opacity={0.3}>
                    <animate attributeName="r" values="44;50;44" dur="0.8s" repeatCount="indefinite" />
                  </circle>
                </>
              )}
              {/* 错误节点 — red static border with glow */}
              {isError && (
                <circle cx={node.x} cy={node.y} r={38} fill="none" stroke="#f85149" strokeWidth={2.5} filter="url(#glow-red)">
                  <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
                </circle>
              )}
              {/* Queen 节点 cyan glow-pulse — matching design mockup glow-pulse-cyan */}
              {node.id === 'queen' && (
                <circle cx={node.x} cy={node.y} r={36} fill="none" stroke="#58a6ff" strokeWidth={1.5} filter="url(#glow-cyan)">
                  <animate attributeName="opacity" values="0.2;0.5;0.2" dur="2.5s" repeatCount="indefinite" />
                </circle>
              )}
              {/* 选中高亮 */}
              {isSelected && (
                <circle cx={node.x} cy={node.y} r={34} fill="none" stroke="#58a6ff" strokeWidth={2.5} filter="url(#glow-cyan)">
                  <animate attributeName="stroke-dashoffset" from="0" to="-16" dur="1s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.7;1;0.7" dur="1.5s" repeatCount="indefinite" />
                </circle>
              )}
              {/* 节点主体 — 匹配设计稿: bg-blue-950/30, bg-amber-950/40, bg-slate-900, bg-[#161b22] + shadow */}
              {node.shape === 'rect' ? (
                <rect
                  x={node.x - 28} y={node.y - 28}
                  width={56} height={56}
                  rx={12}
                  fill="#0f172a"
                  stroke={node.id === 'ws-scanner' ? '#334155' : node.color}
                  strokeWidth={2}
                  filter="url(#shadow-node)"
                />
              ) : (
                <circle
                  cx={node.x} cy={node.y}
                  r={32}
                  fill={isBlocked ? 'rgba(69,26,3,0.4)' : isError ? 'rgba(127,29,29,0.3)' : isStuck ? 'rgba(120,53,15,0.3)' : isThinking ? 'rgba(30,58,138,0.2)' : node.id === 'queen' ? 'rgba(23,37,84,0.3)' : isExecuting ? 'rgba(30,60,100,0.3)' : node.id === 'aider' ? '#161b22' : '#161b22'}
                  stroke={isError ? '#f85149' : isStuck ? '#fbbf24' : isThinking ? '#60a5fa' : node.id === 'queen' ? '#06b6d4' : node.id === 'validation' || node.id === 'aider' ? '#334155' : node.id === 'claude-code' && hitlResolved === 'approved' ? '#34d399' : node.id === 'claude-code' && hitlResolved === 'denied' ? '#f87171' : node.color}
                  strokeWidth={2}
                  filter={isBlocked ? 'url(#shadow-amber)' : isError || isStuck ? 'url(#shadow-amber)' : node.id === 'queen' ? 'url(#shadow-cyan)' : node.id === 'aider' ? 'none' : 'url(#shadow-node)'}
                />
              )}
              {/* 节点内图标 — SVG paths matching FontAwesome equivalents */}
              {node.icon === 'tree' ? (
                <g transform={`translate(${node.x - 8}, ${node.y - 10}) scale(0.7)`}>
                  <path d="M12 1l-3.5 5h2.5l-3 5h2.5l-4 7h5v3h2v-3h5l-4-7h2.5l-3-5h2.5z" fill={node.color} />
                </g>
              ) : node.icon === 'wand' ? (
                <g transform={`translate(${node.x - 10}, ${node.y - 10}) scale(0.8)`}>
                  <path d="M16 2L6 14l-2 4 4-2L18 4l-2-2z" fill={node.color} />
                  <path d="M6 14l2 2" stroke={node.color} strokeWidth="2" strokeLinecap="round" />
                  <circle cx="19" cy="5" r="1" fill={node.color} />
                  <circle cx="21" cy="3" r="0.8" fill={node.color} />
                  <circle cx="20" cy="8" r="0.6" fill={node.color} />
                </g>
              ) : node.icon === 'terminal' ? (
                <g transform={`translate(${node.x - 8}, ${node.y - 6}) scale(0.8)`}>
                  <path d="M4 6l5 5-5 5" stroke={node.color} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M12 16h6" stroke={node.color} strokeWidth="2.5" strokeLinecap="round" />
                </g>
              ) : node.icon === 'check' ? (
                <g transform={`translate(${node.x - 10}, ${node.y - 10}) scale(0.8)`}>
                  <path d="M4 3h16a1 1 0 011 1v16a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1z" fill="none" stroke={node.color} strokeWidth={1.5} />
                  <path d="M7 11l3 3 7-7" stroke={node.color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </g>
              ) : node.icon === 'git' ? (
                <g transform={`translate(${node.x - 10}, ${node.y - 10}) scale(0.7)`}>
                  <circle cx="6" cy="6" r="3" fill={node.color} />
                  <circle cx="6" cy="18" r="3" fill={node.color} />
                  <circle cx="18" cy="18" r="3" fill={node.color} />
                  <path d="M6 9v6M6 15c6 0 8-6 12-6" stroke={node.color} strokeWidth="2" fill="none" strokeLinecap="round" />
                </g>
              ) : (
                <circle cx={node.x} cy={node.y} r={4} fill={node.color} />
              )}
              {/* 节点下方名称 — 匹配设计稿: gemini=cyan-400, claude=orange-400, 其他=gray-400 */}
              <text x={node.x} y={node.y + 52} textAnchor="middle" fill={node.id === 'queen' ? '#22d3ee' : node.id === 'claude-code' ? '#fb923c' : '#9ca3af'} fontSize={11} fontFamily="monospace" fontWeight="bold">
                {node.name.length > 16 ? node.name.slice(0, 14) + '..' : node.name}
              </text>
              {/* PID 徽章 — 匹配设计稿: bg-cyan-950/40 text-cyan-400 border-cyan-900/40 */}
              {node.pid ? (
                <>
                  <rect
                    x={node.x - 30} y={node.y + 56}
                    width={60} height={13}
                    rx={2}
                    fill="rgba(8,51,68,0.4)"
                    stroke="rgba(21,94,117,0.4)"
                    strokeWidth={0.5}
                  />
                  <text x={node.x} y={node.y + 65} textAnchor="middle" fontSize={8} fontFamily="monospace" fill="#22d3ee">
                    PID: {node.pid}
                  </text>
                </>
              ) : null}
              {/* 状态徽章 — 匹配设计稿: per-node color tints */}
              {(() => {
                const by = node.pid ? 72 : 58
                const ty = node.pid ? 81 : 67
                let badgeFill: string, badgeStroke: string, badgeText: string
                if (isBlocked && hitlResolved !== 'approved' && hitlResolved !== 'denied') {
                  badgeFill = 'rgba(67,20,7,0.5)'; badgeStroke = 'rgba(124,45,18,0.5)'; badgeText = '#fb923c'
                } else if (node.id === 'claude-code' && hitlResolved === 'approved') {
                  badgeFill = 'rgba(20,83,45,0.4)'; badgeStroke = 'rgba(22,101,52,0.4)'; badgeText = '#34d399'
                } else if (node.id === 'claude-code' && hitlResolved === 'denied') {
                  badgeFill = 'rgba(127,29,29,0.4)'; badgeStroke = 'rgba(127,29,29,0.4)'; badgeText = '#f87171'
                } else if (isExecuting) {
                  badgeFill = 'rgba(30,60,100,0.4)'; badgeStroke = 'rgba(88,166,255,0.3)'; badgeText = '#58a6ff'
                } else if (isThinking) {
                  badgeFill = 'rgba(30,58,138,0.3)'; badgeStroke = 'rgba(96,165,250,0.3)'; badgeText = '#60a5fa'
                } else if (isStuck) {
                  badgeFill = 'rgba(120,53,15,0.4)'; badgeStroke = 'rgba(251,191,36,0.4)'; badgeText = '#fbbf24'
                } else if (isError) {
                  badgeFill = 'rgba(127,29,29,0.4)'; badgeStroke = 'rgba(248,81,73,0.4)'; badgeText = '#f85149'
                } else if (node.id === 'queen') {
                  badgeFill = 'rgba(8,51,68,0.4)'; badgeStroke = 'rgba(21,94,117,0.4)'; badgeText = '#22d3ee'
                } else if (node.id === 'ws-scanner') {
                  badgeFill = '#020617'; badgeStroke = '#30363d'; badgeText = '#64748b'
                } else if (node.id === 'validation') {
                  badgeFill = '#0f172a'; badgeStroke = '#1e293b'; badgeText = '#6b7280'
                } else if (node.id === 'aider') {
                  badgeFill = '#030712'; badgeStroke = '#111827'; badgeText = '#6b7280'
                } else {
                  badgeFill = 'rgba(30,40,50,0.5)'; badgeStroke = 'rgba(51,65,85,0.5)'; badgeText = '#6b7280'
                }
                return (
                  <>
                    <rect
                      x={node.x - 36} y={node.y + by}
                      width={72} height={14}
                      rx={3}
                      fill={badgeFill}
                      stroke={badgeStroke}
                      strokeWidth={0.5}
                    />
                    <text
                      x={node.x} y={node.y + ty}
                      textAnchor="middle"
                      fontSize={7}
                      fontFamily="monospace"
                      fontWeight="bold"
                      fill={badgeText}
                    >
                      {isBlocked && hitlResolved !== 'approved' && hitlResolved !== 'denied' ? '等候特权核准' : node.id === 'claude-code' && hitlResolved === 'approved' ? '执行完成 (已授权)' : node.id === 'claude-code' && hitlResolved === 'denied' ? '特权已手动阻断' : isExecuting ? '执行中' : isThinking ? '思考中' : isStuck ? '已卡住' : isError ? '错误' : node.label}
                    </text>
                  </>
                )
              })()}
            </g>
          )
        })}

        {/* 空状态 — no agents discovered */}
        {nodes.length === 0 && (
          <g>
            <text x={400} y={130} textAnchor="middle" fontSize={14} fontFamily="system-ui" fill="#6b7280">
              尚未发现 Agent
            </text>
            <text x={400} y={155} textAnchor="middle" fontSize={11} fontFamily="system-ui" fill="#4b5563">
              请在左侧 Agent 扫描器中扫描或添加 Agent
            </text>
          </g>
        )}
      </svg>

      {/* 底部说明 */}
      <div className="absolute bottom-4 left-6 max-w-sm p-2.5 rounded-lg flex gap-2 items-start text-[10px]" style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid #30363d', color: '#9ca3af' }}>
        <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: '#22d3ee' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <strong style={{ color: '#9ca3af' }}>自主流转说明：</strong> 此画面非机器人聊天。您可以随时在右侧下发「蜂王调度目标」，蜂王会启动协定。
        </div>
      </div>

      {/* HITL 授权弹窗 — positioned below the blocked node matching design mockup */}
      {hitlTarget && (() => {
        const blockedNode = nodes.find(n => n.name === hitlTarget)
        const popupX = blockedNode ? blockedNode.x - 125 : 120
        const popupY = blockedNode ? blockedNode.y + 100 : 160
        return (
          <div
            className="absolute z-20 w-[350px] rounded-xl shadow-2xl p-4 text-xs"
            style={{
              background: '#1a1f26',
              border: '2px solid #f0883e',
              left: popupX,
              top: popupY,
            }}
          >
            <div className="flex items-center justify-between pb-2 mb-2.5" style={{ borderBottom: '1px solid #30363d' }}>
              <span className="font-bold flex items-center gap-1.5" style={{ color: '#fb923c' }}>
                <svg className="w-3.5 h-3.5 animate-bounce" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5zm0 2.18l7 3.82v4c0 4.52-3.13 8.69-7 9.93V4.18z" />
                </svg>
                敏感指令安全授权闸
              </span>
              <span className="text-[9px] font-mono" style={{ color: '#6b7280' }}>PID: {blockedNode?.pid || '--'}</span>
            </div>
            <p className="mb-2 leading-normal" style={{ color: '#e5e7eb' }}>
              底层 <strong style={{ color: '#fff' }}>{hitlTarget}</strong> 接收蜂王 A2A 命令后，申请在本机执行系统修改与整合测试指令。
            </p>
            <div className="mb-3 p-2.5 rounded font-mono text-[10px]" style={{ background: 'rgba(0,0,0,0.8)', border: '1px solid #30363d', color: '#d1d5db' }}>
              <div style={{ color: '#6b7280' }}># {hitlTarget} 待授权动作</div>
              <div style={{ color: '#34d399' }}>$ node ./scripts/apply_layout_patch.js && npm run test:unit</div>
              <div className="mt-2" style={{ color: '#6b7280' }}>// 写入影响目标:</div>
              <div style={{ color: '#fb923c' }}>write: src/MainLayout.tsx (+12行, -10行)</div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleApprove}
                className="flex-1 py-1.5 rounded font-bold flex items-center justify-center gap-1 hover:bg-emerald-600 active:bg-emerald-800 transition"
                style={{ background: '#047857', color: '#fff', boxShadow: '0 4px 6px -1px rgba(2,44,34,0.4)' }}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                确认并核准执行
              </button>
              <button
                onClick={handleDeny}
                className="flex-1 py-1.5 rounded font-bold flex items-center justify-center gap-1 hover:bg-rose-800 transition"
                style={{ background: 'rgba(136,19,55,0.8)', color: '#fecdd3', border: '1px solid #9f1239' }}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                拒绝阻断
              </button>
            </div>
          </div>
        )
      })()}

      {/* Global PermissionDialog for backend permission_request events */}
      {pendingPermission && (
        <div className="absolute inset-0 z-30 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="w-[400px] rounded-xl p-4 text-xs" style={{ background: '#1a1f26', border: '2px solid #f0883e' }}>
            <div className="flex items-center gap-2 mb-3 font-bold" style={{ color: '#fb923c' }}>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5zm0 2.18l7 3.82v4c0 4.52-3.13 8.69-7 9.93V4.18z" />
              </svg>
              Agent 权限请求
            </div>
            <p className="mb-3" style={{ color: '#e5e7eb' }}>
              <strong style={{ color: '#fff' }}>{pendingPermission.type}</strong>: {pendingPermission.description}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  api.events?.sendPermissionResponse?.(pendingPermission.id, true, 'user').catch(() => logger.debug('QueenSandbox', 'Failed to send permission response'))
                  setPendingPermission(null)
                }}
                className="flex-1 py-1.5 rounded font-bold hover:bg-emerald-600 transition"
                style={{ background: '#047857', color: '#fff' }}
              >
                确认核准
              </button>
              <button
                onClick={() => {
                  api.events?.sendPermissionResponse?.(pendingPermission.id, false, 'user').catch(() => logger.debug('QueenSandbox', 'Failed to send permission deny'))
                  setPendingPermission(null)
                }}
                className="flex-1 py-1.5 rounded font-bold hover:bg-rose-800 transition"
                style={{ background: 'rgba(136,19,55,0.8)', color: '#fecdd3', border: '1px solid #9f1239' }}
              >
                拒绝
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

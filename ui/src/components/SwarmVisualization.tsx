import { useState, useEffect, useMemo } from 'react'
import { useAppStore } from '../store/appStore'
import {
  Network,
  Zap,
  Target,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  ArrowRight,
  GitBranch,
  Layers,
} from 'lucide-react'
import type { CoordinationTask, Agent } from '../types'

interface SwarmNode {
  id: string
  name: string
  type: 'coordinator' | 'worker'
  status: 'idle' | 'executing' | 'thinking' | 'error'
  position: { x: number; y: number }
  currentTask?: string
}

interface SwarmEdge {
  from: string
  to: string
  type: 'command' | 'report' | 'consensus'
  active: boolean
}

interface SwarmVisualizationProps {
  topology?: 'star' | 'mesh' | 'tree' | 'ring' | 'hybrid'
  tasks?: CoordinationTask[]
}

export default function SwarmVisualization({
  topology = 'star',
  tasks = [],
}: SwarmVisualizationProps) {
  const agents = useAppStore(state => state.agents)
  const activeSwarm = useAppStore(state => state.activeSwarm)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [animatingEdge, setAnimatingEdge] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'topology' | 'tasks'>('topology')

  // Ensure agents is always an array
  const safeAgents = useMemo(() => agents || [], [agents])

  // Generate nodes based on agents
  const nodes = useMemo((): SwarmNode[] => safeAgents.map((agent, index) => {
    const angle = (2 * Math.PI * index) / safeAgents.length
    const radius = 120
    return {
      id: agent.id,
      name: agent.name,
      type: agent.id === activeSwarm?.coordinatorId ? 'coordinator' : 'worker',
      status: agent.status as SwarmNode['status'],
      position: {
        x: 200 + radius * Math.cos(angle - Math.PI / 2),
        y: 200 + radius * Math.sin(angle - Math.PI / 2),
      },
      currentTask: agent.currentTask,
    }
  }), [safeAgents, activeSwarm?.coordinatorId])

  // Generate edges based on topology
  const edges = useMemo((): SwarmEdge[] => {
    const result: SwarmEdge[] = []
    const coordinatorId = activeSwarm?.coordinatorId || safeAgents[0]?.id

    if (topology === 'star') {
      // Star: all nodes connect to center (coordinator)
      nodes.forEach(node => {
        if (node.id !== coordinatorId) {
          result.push({ from: coordinatorId, to: node.id, type: 'command', active: false })
          result.push({ from: node.id, to: coordinatorId, type: 'report', active: false })
        }
      })
    } else if (topology === 'mesh') {
      // Mesh: all nodes connect to all
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          result.push({ from: nodes[i].id, to: nodes[j].id, type: 'consensus', active: false })
          result.push({ from: nodes[j].id, to: nodes[i].id, type: 'consensus', active: false })
        }
      }
    } else if (topology === 'ring') {
      // Ring: nodes connect in a circle
      for (let i = 0; i < nodes.length; i++) {
        result.push({
          from: nodes[i].id,
          to: nodes[(i + 1) % nodes.length].id,
          type: 'consensus',
          active: false,
        })
      }
    } else if (topology === 'tree') {
      // Tree: hierarchical structure
      const coordinator = nodes.find(n => n.id === coordinatorId)
      if (coordinator) {
        const workers = nodes.filter(n => n.id !== coordinatorId)
        workers.forEach((worker) => {
          result.push({ from: coordinatorId, to: worker.id, type: 'command', active: false })
          result.push({ from: worker.id, to: coordinatorId, type: 'report', active: false })
        })
      }
    }

    return result
  }, [nodes, topology, activeSwarm?.coordinatorId, safeAgents])

  // Animate edges periodically
  useEffect(() => {
    let animationTimeout: ReturnType<typeof setTimeout> | null = null
    const interval = setInterval(() => {
      const activeEdges = edges.filter(e => e.type === 'command')
      const randomEdge = activeEdges[Math.floor(Math.random() * activeEdges.length)]
      if (randomEdge) {
        setAnimatingEdge(`${randomEdge.from}-${randomEdge.to}`)
        animationTimeout = setTimeout(() => setAnimatingEdge(null), 500)
      }
    }, 2000)
    return () => {
      clearInterval(interval)
      if (animationTimeout) clearTimeout(animationTimeout)
    }
  }, [edges])

  const getStatusColor = (status: SwarmNode['status']) => {
    switch (status) {
      case 'executing':
        return 'bg-success'
      case 'thinking':
        return 'bg-warning'
      case 'error':
        return 'bg-error'
      default:
        return 'bg-text-tertiary'
    }
  }

  const getTypeIcon = (type: SwarmNode['type']) => {
    return type === 'coordinator' ? (
      <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center">
        <Target size={14} className="text-white" />
      </div>
    ) : (
      <div className="w-6 h-6 rounded-full bg-surface flex items-center justify-center border border-glass-border">
        <Zap size={14} className="text-text-secondary" />
      </div>
    )
  }

  const coordinatorNode = nodes.find(n => n.type === 'coordinator')

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-glass-border">
        <div className="flex items-center gap-3">
          <Network size={20} className="text-accent" />
          <div>
            <h2 className="text-base font-semibold text-text-primary">
              {activeSwarm?.name || 'Swarm Topology'}
            </h2>
            <p className="text-xs text-text-secondary">
              {topology.toUpperCase()} · {nodes.length} agents
            </p>
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-1 p-1 bg-mac-sidebar rounded-mac" role="tablist" aria-label="View mode">
          <button
            role="tab"
            aria-selected={viewMode === 'topology'}
            onClick={() => setViewMode('topology')}
            className={`px-3 py-1.5 text-xs font-medium rounded-mac transition-all ${
              viewMode === 'topology'
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Layers size={14} className="inline mr-1" />
            Topology
          </button>
          <button
            role="tab"
            aria-selected={viewMode === 'tasks'}
            onClick={() => setViewMode('tasks')}
            className={`px-3 py-1.5 text-xs font-medium rounded-mac transition-all ${
              viewMode === 'tasks'
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <GitBranch size={14} className="inline mr-1" />
            Tasks
          </button>
        </div>
      </div>

      {/* Visualization Area */}
      <div className="flex-1 relative overflow-hidden">
        {viewMode === 'topology' ? (
          <svg className="w-full h-full" viewBox="0 0 400 400">
            {/* Background grid */}
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
              </pattern>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />

            {/* Edges */}
            {edges.map((edge) => {
              const fromNode = nodes.find(n => n.id === edge.from)
              const toNode = nodes.find(n => n.id === edge.to)
              if (!fromNode || !toNode) return null

              const edgeId = `${edge.from}-${edge.to}`
              const isAnimating = animatingEdge === edgeId

              return (
                <g key={`${edge.from}-${edge.to}`}>
                  <line
                    x1={fromNode.position.x}
                    y1={fromNode.position.y}
                    x2={toNode.position.x}
                    y2={toNode.position.y}
                    stroke={isAnimating ? 'var(--accent)' : 'rgba(255,255,255,0.1)'}
                    strokeWidth={isAnimating ? 2 : 1}
                    strokeDasharray={edge.type === 'consensus' ? '4,4' : 'none'}
                    className={isAnimating ? 'animate-pulse' : ''}
                  />
                  {isAnimating && (
                    <circle r="3" fill="var(--accent)" filter="url(#glow)">
                      <animateMotion
                        dur="0.5s"
                        repeatCount="1"
                        path={`M${fromNode.position.x},${fromNode.position.y} L${toNode.position.x},${toNode.position.y}`}
                      />
                    </circle>
                  )}
                </g>
              )
            })}

            {/* Nodes */}
            {nodes.map(node => (
              <g
                key={node.id}
                transform={`translate(${node.position.x}, ${node.position.y})`}
                onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelectedNode(selectedNode === node.id ? null : node.id)
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`${node.name} - ${node.type} - ${node.status}`}
                aria-pressed={selectedNode === node.id}
                className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent"
              >
                {/* Node circle */}
                <circle
                  r={node.type === 'coordinator' ? 35 : 28}
                  fill={node.type === 'coordinator' ? 'var(--accent-muted)' : 'rgba(30, 30, 30, 0.8)'}
                  stroke={selectedNode === node.id ? 'var(--accent)' : 'rgba(255,255,255,0.2)'}
                  strokeWidth={selectedNode === node.id ? 2 : 1}
                  className="transition-all duration-200"
                />

                {/* Status indicator */}
                <circle
                  cx={node.type === 'coordinator' ? 25 : 20}
                  cy={-20}
                  r={6}
                  className={getStatusColor(node.status)}
                  aria-hidden="true"
                />

                {/* Node label */}
                <text
                  y={4}
                  textAnchor="middle"
                  fill="white"
                  fontSize="10"
                  fontWeight="500"
                >
                  {node.name.slice(0, 8)}
                </text>

                {/* Type label */}
                <text
                  y={16}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.5)"
                  fontSize="8"
                >
                  {node.type}
                </text>
              </g>
            ))}

            {/* Center label for star topology */}
            {topology === 'star' && coordinatorNode && (
              <text
                x={200}
                y={200}
                textAnchor="middle"
                fill="rgba(59, 130, 246, 0.8)"
                fontSize="10"
                fontWeight="600"
              >
                QUEEN BEE
              </text>
            )}
          </svg>
        ) : (
          /* Task Flow View */
          <div className="p-4 h-full overflow-y-auto">
            <div className="space-y-3">
              {tasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-text-tertiary">
                  <GitBranch size={48} className="opacity-50 mb-4" />
                  <p className="text-sm">No tasks to visualize</p>
                  <p className="text-xs mt-1">Submit a task to see the flow</p>
                </div>
              ) : (
                tasks.map(task => (
                  <TaskFlowCard key={task.id} task={task} agents={safeAgents} />
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Selected Node Info */}
      {selectedNode && (
        <div className="px-4 py-3 border-t border-glass-border bg-mac-sidebar/50">
          {(() => {
            const node = nodes.find(n => n.id === selectedNode)
            if (!node) return null
            return (
              <div className="flex items-center gap-3">
                {getTypeIcon(node.type)}
                <div>
                  <p className="text-sm font-medium text-text-primary">{node.name}</p>
                  <p className="text-xs text-text-secondary">
                    {node.type} · {node.status}
                    {node.currentTask && ` · Task: ${node.currentTask}`}
                  </p>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Stats Footer */}
      <div className="px-4 py-2 border-t border-glass-border flex items-center justify-between text-xs text-text-secondary">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-success" aria-hidden="true" />
            <span aria-label={`${nodes.filter(n => n.status === 'executing').length} agents executing`}>
              {nodes.filter(n => n.status === 'executing').length} executing
            </span>
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-warning" aria-hidden="true" />
            <span aria-label={`${nodes.filter(n => n.status === 'thinking').length} agents thinking`}>
              {nodes.filter(n => n.status === 'thinking').length} thinking
            </span>
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-text-tertiary" aria-hidden="true" />
            <span aria-label={`${nodes.filter(n => n.status === 'idle').length} agents idle`}>
              {nodes.filter(n => n.status === 'idle').length} idle
            </span>
          </span>
        </div>
        <span>Topology: {topology}</span>
      </div>
    </div>
  )
}

// Task Flow Card Component
function TaskFlowCard({ task, agents }: { task: CoordinationTask; agents: Agent[] }) {
  const [expanded, setExpanded] = useState(false)

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={16} className="text-success" />
      case 'failed':
        return <XCircle size={16} className="text-error" />
      case 'running':
        return <Loader2 size={16} className="text-accent animate-spin" />
      default:
        return <Clock size={16} className="text-text-tertiary" />
    }
  }

  return (
    <div className="bg-mac-sidebar/50 rounded-mac border border-glass-border overflow-hidden">
      {/* Task Header */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-card-hover transition-colors"
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded) }}}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
      >
        {getStatusIcon(task.status)}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">{task.title}</p>
          <p className="text-xs text-text-secondary">
            {task.assignedTo.length} agents · {Math.round(task.progress * 100)}%
          </p>
        </div>
        <ArrowRight
          size={16}
          className={`text-text-tertiary transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
      </div>

      {/* Progress Bar */}
      <div className="px-3 pb-2">
        <div className="h-1 bg-surface rounded-full overflow-hidden" role="progressbar" aria-valuenow={Math.round(task.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Task progress: ${Math.round(task.progress * 100)}%`}>
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${task.progress * 100}%` }}
          />
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-glass-border pt-2">
          {/* Assigned Agents */}
          <div>
            <p className="text-xs text-text-tertiary mb-1">Assigned Agents</p>
            <div className="flex flex-wrap gap-1">
              {task.assignedTo.map(agentId => {
                const agent = agents.find(a => a.id === agentId)
                return (
                  <span
                    key={agentId}
                    className="px-2 py-0.5 text-xs bg-accent-muted text-accent rounded-mac"
                  >
                    {agent?.name || agentId}
                  </span>
                )
              })}
            </div>
          </div>

          {/* Results */}
          {Object.keys(task.results).length > 0 && (
            <div>
              <p className="text-xs text-text-tertiary mb-1">Results</p>
              <div className="space-y-1">
                {Object.entries(task.results).map(([agentId, result]) => (
                  <div
                    key={agentId}
                    className="flex items-center gap-2 p-2 bg-surface rounded-mac text-xs"
                  >
                    {result.error ? (
                      <XCircle size={12} className="text-error" />
                    ) : (
                      <CheckCircle size={12} className="text-success" />
                    )}
                    <span className="text-text-secondary">{agentId}:</span>
                    <span className="text-text-primary truncate flex-1">
                      {result.error || result.content?.slice(0, 50) || 'completed'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'
import { monitoringApi } from '../services'
import type { EmergenceData } from '../services'
import { logger } from '../utils'

// Emergence signal types matching backend
type SignalType = 'congestion' | 'opportunity' | 'self_organization' | 'innovation' | 'synergy'

interface EmergentSignal {
  type: SignalType
  location: string
  strength: number
  timestamp: Date
  agents: string[]
  description: string
  pattern?: string
  confidence?: number
}

interface SwarmHealth {
  overallScore: number
  congestionLevel: number
  collaborationIndex: number
  innovationRate: number
  agentUtilization: number
}

interface AgentNode {
  id: string
  name: string
  status: 'active' | 'idle' | 'error'
  x: number
  y: number
  tasks: number
  connections: string[]
}

interface TaskFlow {
  id: string
  from: string
  to: string
  status: 'pending' | 'in_progress' | 'completed'
  type: 'handoff' | 'delegation' | 'collaboration'
}

interface EmergenceDashboardProps {
  swarmId?: string
  onSignalClick?: (signal: EmergentSignal) => void
}

const SIGNAL_CONFIG: Record<SignalType, { colorClass: string; icon: string; label: string }> = {
  congestion: {
    colorClass: 'text-red-400 bg-red-500',
    icon: '⚠️',
    label: 'Congestion'
  },
  opportunity: {
    colorClass: 'text-green-400 bg-green-500',
    icon: '💡',
    label: 'Opportunity'
  },
  self_organization: {
    colorClass: 'text-purple-400 bg-purple-500',
    icon: '🔄',
    label: 'Self-Organization'
  },
  innovation: {
    colorClass: 'text-blue-400 bg-blue-500',
    icon: '✨',
    label: 'Innovation'
  },
  synergy: {
    colorClass: 'text-orange-400 bg-orange-500',
    icon: '🤝',
    label: 'Synergy'
  }
}

export function EmergenceDashboard({ swarmId, onSignalClick }: EmergenceDashboardProps) {
  const [signals, setSignals] = useState<EmergentSignal[]>([])
  const [health, setHealth] = useState<SwarmHealth | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'signals' | 'network' | 'flow'>('signals')
  const [agentNodes, setAgentNodes] = useState<AgentNode[]>([])
  const [taskFlows, setTaskFlows] = useState<TaskFlow[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Fetch emergence data from backend
  useEffect(() => {
    let cancelled = false

    const fetchEmergenceData = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const data: EmergenceData = await monitoringApi.getEmergenceData()

        if (cancelled) return

        setSignals((data.signals || []).map(s => ({
          type: (s.type as SignalType) || 'opportunity',
          location: 'swarm',
          strength: s.severity === 'high' ? 0.9 : s.severity === 'medium' ? 0.6 : 0.3,
          timestamp: new Date(s.timestamp),
          agents: [],
          description: s.message,
        })))

        setHealth({
          overallScore: Math.round(data.health.overallScore * 100),
          congestionLevel: data.health.congestionLevel,
          collaborationIndex: data.health.collaborationIndex,
          innovationRate: data.health.innovationRate,
          agentUtilization: data.health.agentUtilization,
        })

        setAgentNodes((data.agents || []).map((a, i) => ({
          id: a.id,
          name: a.name,
          status: a.load > 0.8 ? 'active' as const : a.load > 0 ? 'idle' as const : 'error' as const,
          x: a.x || (0.2 + (i % 3) * 0.3),
          y: a.y || (0.2 + Math.floor(i / 3) * 0.3),
          tasks: Math.round(a.load * 5),
          connections: [],
        })))

        setTaskFlows((data.flows || []).map(f => ({
          id: f.id,
          from: f.fromAgent,
          to: f.toAgent,
          status: f.status === 'completed' ? 'completed' as const : f.status === 'running' ? 'in_progress' as const : 'pending' as const,
          type: 'collaboration' as const,
        })))
      } catch (error) {
        if (cancelled) return
        logger.error('EmergenceDashboard', 'Failed to fetch emergence data:', error)
        setError(error instanceof Error ? error.message : 'Failed to load emergence data')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    fetchEmergenceData()

    const interval = setInterval(fetchEmergenceData, 10000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [swarmId])

  // Draw network visualization
  useEffect(() => {
    if (viewMode !== 'network' || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const drawNetwork = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1

      // Reset transform and set new dimensions
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.scale(dpr, dpr)

      const width = rect.width
      const height = rect.height

      // Clear canvas
      ctx.fillStyle = '#0f0f10'
      ctx.fillRect(0, 0, width, height)

      // Draw connections
      ctx.strokeStyle = '#334155'
      ctx.lineWidth = 1
      agentNodes.forEach(node => {
        node.connections.forEach(targetId => {
          const target = agentNodes.find(n => n.id === targetId)
          if (target) {
            ctx.beginPath()
            ctx.moveTo(node.x * width, node.y * height)
            ctx.lineTo(target.x * width, target.y * height)
            ctx.stroke()
          }
        })
      })

      // Draw task flows
      taskFlows.forEach(flow => {
        const from = agentNodes.find(n => n.id === flow.from)
        const to = agentNodes.find(n => n.id === flow.to)
        if (from && to) {
          ctx.strokeStyle = flow.status === 'completed' ? '#22c55e' : flow.status === 'in_progress' ? '#3b82f6' : '#64748b'
          ctx.lineWidth = 2
          ctx.setLineDash(flow.status === 'pending' ? [5, 5] : [])
          ctx.beginPath()
          ctx.moveTo(from.x * width, from.y * height)
          ctx.lineTo(to.x * width, to.y * height)
          ctx.stroke()
          ctx.setLineDash([])
        }
      })

      // Draw nodes
      agentNodes.forEach(node => {
        const x = node.x * width
        const y = node.y * height
        const radius = 20 + node.tasks * 5

        // Node glow
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 2)
        if (node.status === 'active') {
          gradient.addColorStop(0, 'rgba(34, 197, 94, 0.3)')
        } else if (node.status === 'error') {
          gradient.addColorStop(0, 'rgba(239, 68, 68, 0.3)')
        } else {
          gradient.addColorStop(0, 'rgba(100, 116, 139, 0.2)')
        }
        gradient.addColorStop(1, 'transparent')
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(x, y, radius * 2, 0, Math.PI * 2)
        ctx.fill()

        // Node circle
        ctx.fillStyle = node.status === 'active' ? '#22c55e' : node.status === 'error' ? '#ef4444' : '#64748b'
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fill()

        // Node label
        ctx.fillStyle = '#ffffff'
        ctx.font = '10px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(node.name.split(' ')[0], x, y)

        // Task count
        if (node.tasks > 0) {
          ctx.fillStyle = '#f97316'
          ctx.beginPath()
          ctx.arc(x + radius - 5, y - radius + 5, 8, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#ffffff'
          ctx.font = '8px sans-serif'
          ctx.fillText(node.tasks.toString(), x + radius - 5, y - radius + 5)
        }
      })
    }

    // Initial draw
    drawNetwork()

    // Handle resize
    const handleResize = () => {
      drawNetwork()
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [viewMode, agentNodes, taskFlows])

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400'
    if (score >= 60) return 'text-yellow-400'
    return 'text-red-400'
  }

  const getScoreGradient = (score: number) => {
    if (score >= 80) return 'from-green-500/20 to-green-600/10'
    if (score >= 60) return 'from-yellow-500/20 to-yellow-600/10'
    return 'from-red-500/20 to-red-600/10'
  }

  const formatTimeAgo = (date: Date) => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    return `${hours}h ago`
  }

  return (
    <div className="h-full flex flex-col bg-[#0a0a0b] rounded-xl border border-[#1f1f21]">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-[#1f1f21]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" aria-hidden="true" />
          <h3 className="text-xs font-semibold text-white">Swarm Monitor</h3>
        </div>
        <div className="flex items-center gap-1">
          {(['signals', 'network', 'flow'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-2 py-1 text-[10px] rounded transition-colors ${
                viewMode === mode
                  ? 'bg-blue-500/30 text-blue-300'
                  : 'text-slate-500 hover:text-white'
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-slate-400">Analyzing...</span>
          </div>
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-center px-4">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span className="text-xs text-red-400">Failed to load emergence data</span>
            <span className="text-[10px] text-slate-500 max-w-[200px]">{error}</span>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Health Score - Compact */}
          {health && (
            <div className={`bg-gradient-to-r ${getScoreGradient(health.overallScore)} px-3 py-2 border-b border-[#1f1f21]`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400 uppercase">Health</span>
                <span className={`text-lg font-bold ${getScoreColor(health.overallScore)}`}>
                  {health.overallScore}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1 text-center mt-1">
                <div>
                  <div className="text-[9px] text-slate-500">Cong</div>
                  <div className="text-[10px] font-medium text-white">{Math.round(health.congestionLevel * 100)}%</div>
                </div>
                <div>
                  <div className="text-[9px] text-slate-500">Collab</div>
                  <div className="text-[10px] font-medium text-white">{Math.round(health.collaborationIndex * 100)}%</div>
                </div>
                <div>
                  <div className="text-[9px] text-slate-500">Innov</div>
                  <div className="text-[10px] font-medium text-white">{Math.round(health.innovationRate * 100)}%</div>
                </div>
                <div>
                  <div className="text-[9px] text-slate-500">Util</div>
                  <div className="text-[10px] font-medium text-white">{Math.round(health.agentUtilization * 100)}%</div>
                </div>
              </div>
            </div>
          )}

          {/* Content Area */}
          <div className="flex-1 overflow-hidden">
            {viewMode === 'signals' && (
              <div className="h-full overflow-y-auto p-2 space-y-2">
                {signals.length === 0 ? (
                  <div className="text-center py-6 text-slate-500 text-xs">
                    No signals
                  </div>
                ) : (
                  signals.map((signal) => {
                    const config = SIGNAL_CONFIG[signal.type]
                    return (
                      <div
                        key={`${signal.type}-${signal.description}`}
                        onClick={() => onSignalClick?.(signal)}
                        className="bg-slate-800/30 rounded-lg p-2 cursor-pointer hover:bg-slate-800/50 transition-colors"
                      >
                        <div className="flex items-start gap-2">
                          <div className="text-sm">{config.icon}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className={`text-[10px] font-medium ${config.colorClass.split(' ')[0]}`}>
                                {config.label}
                              </span>
                              <span className="text-[9px] text-slate-500">
                                {formatTimeAgo(signal.timestamp)}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-300 line-clamp-1 mt-0.5">
                              {signal.description}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex-1 h-0.5 bg-slate-700 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${config.colorClass.split(' ')[1].replace('text-', 'bg-')}`}
                                  style={{ width: `${signal.strength * 100}%` }}
                                />
                              </div>
                              <span className="text-[9px] text-slate-500">
                                {Math.round(signal.strength * 100)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}

            {viewMode === 'network' && (
              <div className="h-full relative">
                <canvas
                  ref={canvasRef}
                  className="w-full h-full"
                />
                {/* Legend */}
                <div className="absolute bottom-2 left-2 bg-slate-900/80 rounded px-2 py-1 text-[9px] space-y-0.5">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-green-500" aria-hidden="true" />
                    <span className="text-slate-400">Active</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-slate-500" aria-hidden="true" />
                    <span className="text-slate-400">Idle</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-500" aria-hidden="true" />
                    <span className="text-slate-400">Error</span>
                  </div>
                </div>
              </div>
            )}

            {viewMode === 'flow' && (
              <div className="h-full overflow-y-auto p-2 space-y-1">
                {taskFlows.map((flow) => {
                  const from = agentNodes.find(n => n.id === flow.from)
                  const to = agentNodes.find(n => n.id === flow.to)
                  if (!from || !to) return null

                  return (
                    <div
                      key={flow.id}
                      className="bg-slate-800/30 rounded-lg p-2 flex items-center gap-2"
                    >
                      <div className="flex items-center gap-1 flex-1">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold ${
                          from.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'
                        }`}>
                          {from.name.charAt(0)}
                        </div>
                        <span className="text-[10px] text-slate-300 truncate">{from.name.split(' ')[0]}</span>
                      </div>

                      <div className="flex items-center gap-0.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${
                          flow.status === 'completed' ? 'bg-green-500' :
                          flow.status === 'in_progress' ? 'bg-blue-500 animate-pulse' : 'bg-slate-500'
                        }`} />
                        <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </div>

                      <div className="flex items-center gap-1 flex-1 justify-end">
                        <span className="text-[10px] text-slate-300 truncate">{to.name.split(' ')[0]}</span>
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold ${
                          to.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'
                        }`}>
                          {to.name.charAt(0)}
                        </div>
                      </div>

                      <span className={`text-[9px] px-1 py-0.5 rounded ${
                        flow.type === 'handoff' ? 'bg-orange-500/20 text-orange-400' :
                        flow.type === 'collaboration' ? 'bg-purple-500/20 text-purple-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>
                        {flow.type}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Signal Summary - Compact */}
          {viewMode === 'signals' && (
            <div className="grid grid-cols-5 gap-1 p-2 border-t border-[#1f1f21]">
              {(Object.keys(SIGNAL_CONFIG) as SignalType[]).map((type) => {
                const config = SIGNAL_CONFIG[type]
                const count = signals.filter(s => s.type === type).length
                return (
                  <div
                    key={type}
                    className="text-center p-1 bg-slate-800/30 rounded"
                  >
                    <div className="text-sm">{config.icon}</div>
                    <div className={`text-[10px] font-medium ${config.colorClass.split(' ')[0]}`}>
                      {count}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default EmergenceDashboard

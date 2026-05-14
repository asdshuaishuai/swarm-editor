import { useState, useRef, useCallback, useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import {
  Plus,
  Play,
  Square,
  RefreshCw,
  Network,
  ChevronLeft,
  Loader2,
  Zap,
  X,
} from 'lucide-react'
import { Swarm, TopologyType, TaskStrategy } from '../types'
import { api } from '../services'
import SwarmCoordinatorPanel from './SwarmCoordinatorPanel'
import { logger } from '../utils'
import { ConfirmDialog } from '../components/ConfirmDialog'

const topologyIcons: Record<TopologyType, string> = {
  star: '★',
  mesh: '◇',
  tree: '▴',
  ring: '○',
  hybrid: '◈',
}

const topologyDescriptions: Record<TopologyType, string> = {
  star: 'Central coordinator with agents reporting to it',
  mesh: 'All agents connected to all others',
  tree: 'Hierarchical structure with branches',
  ring: 'Agents connected in a circular chain',
  hybrid: 'Combination of multiple topologies',
}

export default function SwarmPanel() {
  const swarms = useAppStore(state => state.swarms)
  const activeSwarm = useAppStore(state => state.activeSwarm)
  const setActiveSwarm = useAppStore(state => state.setActiveSwarm)
  const setSwarms = useAppStore(state => state.setSwarms)
  const addSwarm = useAppStore(state => state.addSwarm)
  const agents = useAppStore(state => state.agents)
  const addToast = useAppStore(state => state.addToast)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newSwarm, setNewSwarm] = useState({
    name: '',
    topology: 'star' as TopologyType,
    strategy: 'parallel' as TaskStrategy,
    agentIds: [] as string[],
  })
  const [loading, setLoading] = useState(false)
  const mountedRef = useRef(true)

  // Track mounted state to prevent setState on unmounted component
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // 加载后端蜂群
  const loadSwarms = useCallback(async () => {
    try {
      setLoading(true)
      const swarmInfos = await api.swarm.getSwarms()

      if (!mountedRef.current) return

      // Convert SwarmInfo[] to Swarm[]
      const convertedSwarms: Swarm[] = swarmInfos.map((swarmInfo) => ({
        id: swarmInfo.id,
        name: swarmInfo.name,
        topology: swarmInfo.topology as TopologyType,
        strategy: swarmInfo.strategy as TaskStrategy,
        state: (swarmInfo.state || swarmInfo.status) as Swarm['state'],
        agents: agents.filter((a) => (swarmInfo.agents || []).includes(a.id)),
        stats: {
          agentCount: swarmInfo.stats?.agentCount ?? swarmInfo.agentCount,
          idleAgents: swarmInfo.stats?.idleAgents ?? 0,
          executingAgents: swarmInfo.stats?.executingAgents ?? 0,
          pendingTasks: swarmInfo.stats?.pendingTasks ?? swarmInfo.taskCount,
          completedTasks: swarmInfo.stats?.completedTasks ?? 0,
          topology: swarmInfo.topology,
          strategy: swarmInfo.strategy,
          state: swarmInfo.state || swarmInfo.status || 'idle',
        },
      }))

      setSwarms(convertedSwarms)
    } catch (err) {
      logger.error('Swarm', 'Failed to load swarms:', err)
      addToast('error', 'Failed to load swarms', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [agents, addToast, setSwarms])

  const handleCreateSwarm = async () => {
    if (!newSwarm.name || newSwarm.agentIds.length === 0) return

    try {
      setLoading(true)
      // Capture current agents fresh inside the async function to avoid stale closure
      const currentAgents = agents
      const swarmInfo = await api.swarm.createSwarm({
        name: newSwarm.name,
        topology: newSwarm.topology,
        strategy: newSwarm.strategy,
        agentIds: newSwarm.agentIds,
      })

      if (!mountedRef.current) return

      // 添加到本地状态
      const swarm: Swarm = {
        id: swarmInfo.id,
        name: swarmInfo.name,
        topology: swarmInfo.topology as TopologyType,
        strategy: swarmInfo.strategy as TaskStrategy,
        state: (swarmInfo.state || swarmInfo.status) as Swarm['state'],
        agents: currentAgents.filter(a => (swarmInfo.agents || []).includes(a.id)),
        stats: {
          agentCount: swarmInfo.stats?.agentCount ?? swarmInfo.agentCount,
          idleAgents: swarmInfo.stats?.idleAgents ?? 0,
          executingAgents: swarmInfo.stats?.executingAgents ?? 0,
          pendingTasks: swarmInfo.stats?.pendingTasks ?? swarmInfo.taskCount,
          completedTasks: swarmInfo.stats?.completedTasks ?? 0,
          topology: swarmInfo.topology,
          strategy: swarmInfo.strategy,
          state: swarmInfo.state || swarmInfo.status || 'idle',
        },
      }
      addSwarm(swarm)
      setShowCreateModal(false)
      setNewSwarm({
        name: '',
        topology: 'star',
        strategy: 'parallel',
        agentIds: [],
      })
      addToast('success', 'Swarm created', `Swarm "${swarmInfo.name}" is ready`)
    } catch (err) {
      logger.error('Swarm', 'Failed to create swarm:', err)
      if (!mountedRef.current) return
      addToast('error', 'Failed to create swarm', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }

  const handleSelectSwarm = (swarm: Swarm) => {
    setActiveSwarm(swarm)
  }

  const handleBackToList = () => {
    setActiveSwarm(null)
  }

  const handleStartSwarm = async (swarmId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await api.swarm.startSwarm(swarmId)
      if (!mountedRef.current) return
      await loadSwarms()
      if (!mountedRef.current) return
      addToast('success', 'Swarm started')
    } catch (err) {
      logger.error('Swarm', 'Failed to start swarm:', err)
      if (!mountedRef.current) return
      addToast('error', 'Failed to start swarm', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const [stopSwarmConfirm, setStopSwarmConfirm] = useState<{ id: string; name: string } | null>(null)

  const confirmStopSwarm = (swarmId: string, swarmName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setStopSwarmConfirm({ id: swarmId, name: swarmName })
  }

  const handleStopSwarm = async () => {
    if (!stopSwarmConfirm) return
    const { id } = stopSwarmConfirm
    setStopSwarmConfirm(null)
    try {
      await api.swarm.stopSwarm(id)
      if (!mountedRef.current) return
      await loadSwarms()
      if (!mountedRef.current) return
      addToast('success', 'Swarm stopped')
    } catch (err) {
      logger.error('Swarm', 'Failed to stop swarm:', err)
      if (!mountedRef.current) return
      addToast('error', 'Failed to stop swarm', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const toggleAgentSelection = (agentId: string) => {
    setNewSwarm(prev => ({
      ...prev,
      agentIds: prev.agentIds.includes(agentId)
        ? prev.agentIds.filter(id => id !== agentId)
        : [...prev.agentIds, agentId],
    }))
  }

  // Pre-compute swarm cards to avoid type inference issues
  const swarmCards = swarms.map((swarm: Swarm) => (
    <SwarmCard
      key={swarm.id}
      swarm={swarm}
      isActive={activeSwarm?.id === swarm.id}
      onSelect={() => handleSelectSwarm(swarm)}
      onStart={(e) => handleStartSwarm(swarm.id, e)}
      onStop={(e) => confirmStopSwarm(swarm.id, swarm.name, e)}
    />
  ))

  // Show coordinator panel when a swarm is selected
  if (activeSwarm) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 p-3 border-b border-glass-border bg-glass/30">
          <button
            onClick={handleBackToList}
            className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-card-hover rounded-mac text-sm transition-colors text-text-secondary hover:text-text-primary"
            aria-label="Back to swarms list"
          >
            <ChevronLeft size={16} />
            <span>Back to Swarms</span>
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <SwarmCoordinatorPanel />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-accent/10 rounded-mac">
            <Network size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Swarm Control</h2>
            <p className="text-xs text-text-secondary">Coordinate multiple agents</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadSwarms}
            className="p-2 hover:bg-card-hover rounded-mac transition-colors"
            title="Refresh"
            aria-label="Refresh swarms"
          >
            <RefreshCw size={16} className={`text-text-secondary ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary"
          >
            <Plus size={16} />
            <span>New Swarm</span>
          </button>
        </div>
      </div>

      {/* Swarm List */}
      <div className="flex-1 overflow-y-auto">
        {swarms.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-text-tertiary">
            <div className="p-4 bg-glass rounded-mac-xl mb-4">
              <Network size={48} className="opacity-50" />
            </div>
            <p className="text-base font-medium text-text-secondary mb-1">No swarms created</p>
            <p className="text-sm">Create a swarm to coordinate multiple agents</p>
          </div>
        ) : (
          <div className="space-y-3">
            {swarmCards}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-mac-panel/95 border border-glass-border rounded-mac-xl p-5 w-[420px] max-h-[85vh] overflow-y-auto shadow-mac backdrop-blur-xl" role="dialog" aria-modal="true" aria-label="Create New Swarm">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <Zap size={18} className="text-accent" />
                Create New Swarm
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 hover:bg-card-hover rounded-mac transition-colors"
                aria-label="Close modal"
              >
                <X size={18} className="text-text-secondary" />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-sm text-text-secondary mb-1.5 font-medium">
                  Swarm Name
                </label>
                <input
                  type="text"
                  value={newSwarm.name}
                  onChange={(e) =>
                    setNewSwarm({ ...newSwarm, name: e.target.value })
                  }
                  className="w-full input-mac"
                  placeholder="My Swarm"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1.5 font-medium">
                  Topology
                </label>
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Topology selection">
                  {(Object.keys(topologyIcons) as TopologyType[]).map((t) => (
                    <button
                      key={t}
                      role="radio"
                      aria-checked={newSwarm.topology === t}
                      onClick={() => setNewSwarm({ ...newSwarm, topology: t })}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-mac text-sm transition-all duration-200 ${
                        newSwarm.topology === t
                          ? 'bg-accent/20 border-2 border-accent text-accent'
                          : 'bg-glass border border-glass-border hover:border-accent/50 text-text-primary'
                      }`}
                    >
                      <span className="text-xl">{topologyIcons[t]}</span>
                      <span className="capitalize text-xs font-medium">{t}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-text-tertiary mt-2 px-1">
                  {topologyDescriptions[newSwarm.topology]}
                </p>
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1.5 font-medium">
                  Strategy
                </label>
                <select
                  value={newSwarm.strategy}
                  onChange={(e) =>
                    setNewSwarm({
                      ...newSwarm,
                      strategy: e.target.value as TaskStrategy,
                    })
                  }
                  className="w-full input-mac"
                >
                  <option value="parallel">Parallel - Execute simultaneously</option>
                  <option value="sequential">Sequential - One by one</option>
                  <option value="pipeline">Pipeline - Flow through stages</option>
                  <option value="mapreduce">Map-Reduce - Distribute & aggregate</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1.5 font-medium">
                  Select Agents ({newSwarm.agentIds.length} selected)
                </label>
                <div className="bg-glass border border-glass-border rounded-mac max-h-40 overflow-y-auto">
                  {agents.length === 0 ? (
                    <div className="p-3 text-xs text-text-tertiary text-center">No agents available</div>
                  ) : (
                    agents.map((agent) => (
                      <label
                        key={agent.id}
                        className={`flex items-center px-3 py-2.5 hover:bg-card-hover cursor-pointer transition-colors ${
                          newSwarm.agentIds.includes(agent.id) ? 'bg-accent/10' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={newSwarm.agentIds.includes(agent.id)}
                          onChange={() => toggleAgentSelection(agent.id)}
                          className="mr-3 accent-accent"
                        />
                        <span className="text-sm text-text-primary flex-1">{agent.name}</span>
                        <span className="text-xs text-text-secondary capitalize px-2 py-0.5 bg-glass rounded">
                          {agent.type}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-glass-border">
              <button
                onClick={() => setShowCreateModal(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSwarm}
                disabled={!newSwarm.name || newSwarm.agentIds.length === 0 || loading}
                className="btn-primary flex items-center gap-2"
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                <span>Create Swarm</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {stopSwarmConfirm && (
        <ConfirmDialog
          title="Stop Swarm"
          message={`Are you sure you want to stop "${stopSwarmConfirm.name}"? All running tasks will be terminated.`}
          confirmLabel="Stop Swarm"
          variant="danger"
          onConfirm={handleStopSwarm}
          onCancel={() => setStopSwarmConfirm(null)}
        />
      )}
    </div>
  )
}

interface SwarmCardProps {
  swarm: Swarm
  isActive: boolean
  onSelect: () => void
  onStart: (e: React.MouseEvent) => void
  onStop: (e: React.MouseEvent) => void
}

export function SwarmCard({ swarm, isActive, onSelect, onStart, onStop }: SwarmCardProps) {
  const statusColors = {
    initializing: 'bg-warning',
    active: 'bg-success',
    paused: 'bg-info',
    stopping: 'bg-warning',
    stopped: 'bg-text-tertiary',
  }

  const isRunning = swarm.state === 'active'

  return (
    <div
      className={`p-4 rounded-mac-xl cursor-pointer transition-all duration-200 ${
        isActive
          ? 'bg-accent-muted border-2 border-accent'
          : 'bg-glass border border-glass-border hover:border-accent/50 hover:bg-card-hover'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-accent/10 rounded-mac">
            <span className="text-lg">{topologyIcons[swarm.topology]}</span>
          </div>
          <h4 className="font-medium text-text-primary">{swarm.name}</h4>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${statusColors[swarm.state]}`}
          />
          <span className="text-xs text-text-secondary capitalize font-medium">
            {swarm.state}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-xs mb-4">
        <div className="bg-glass/50 rounded-mac p-2.5 text-center">
          <span className="block text-lg font-semibold text-text-primary">{swarm.stats.agentCount}</span>
          <span className="text-text-tertiary">Agents</span>
        </div>
        <div className="bg-glass/50 rounded-mac p-2.5 text-center">
          <span className="block text-lg font-semibold text-success">{swarm.stats.completedTasks}</span>
          <span className="text-text-tertiary">Completed</span>
        </div>
        <div className="bg-glass/50 rounded-mac p-2.5 text-center">
          <span className="block text-lg font-semibold text-warning">{swarm.stats.pendingTasks}</span>
          <span className="text-text-tertiary">Pending</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-accent hover:bg-accent-hover rounded-mac text-xs font-medium transition-colors"
          onClick={onSelect}
        >
          <Play size={12} />
          <span>Manage</span>
        </button>
        {!isRunning ? (
          <button
            className="p-2 bg-success/10 hover:bg-success/20 rounded-mac text-success transition-colors"
            onClick={onStart}
            title="Start Swarm"
            aria-label="Start Swarm"
          >
            <Play size={14} />
          </button>
        ) : (
          <button
            className="p-2 bg-error/10 hover:bg-error/20 rounded-mac text-error transition-colors"
            onClick={onStop}
            title="Stop Swarm"
            aria-label="Stop Swarm"
          >
            <Square size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

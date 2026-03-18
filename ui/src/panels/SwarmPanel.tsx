import { useState } from 'react'
import { useAppStore } from '../store/appStore'
import {
  Plus,
  Play,
  Square,
  RefreshCw,
  Network,
  ChevronLeft,
  Loader2,
} from 'lucide-react'
import { Swarm, TopologyType, TaskStrategy } from '../types'
import { api } from '../services'
import SwarmCoordinatorPanel from './SwarmCoordinatorPanel'

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
  // Get entire state to avoid selector type inference issues
  const store = useAppStore()
  const swarms: Swarm[] = store.swarms
  const activeSwarm = store.activeSwarm
  const setActiveSwarm = store.setActiveSwarm
  const agents = store.agents
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newSwarm, setNewSwarm] = useState({
    name: '',
    topology: 'star' as TopologyType,
    strategy: 'parallel' as TaskStrategy,
    agentIds: [] as string[],
  })
  const [loading, setLoading] = useState(false)

  // 加载后端蜂群
  const loadSwarms = async () => {
    try {
      setLoading(true)
      await api.swarm.getSwarms()
    } catch (err) {
      console.error('Failed to load swarms:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateSwarm = async () => {
    if (!newSwarm.name || newSwarm.agentIds.length === 0) return

    try {
      setLoading(true)
      const swarmInfo = await api.swarm.createSwarm({
        name: newSwarm.name,
        topology: newSwarm.topology,
        strategy: newSwarm.strategy,
        agentIds: newSwarm.agentIds,
      })

      // 添加到本地状态
      const swarm: Swarm = {
        id: swarmInfo.id,
        name: swarmInfo.name,
        topology: swarmInfo.topology as TopologyType,
        strategy: swarmInfo.strategy as TaskStrategy,
        state: swarmInfo.state as Swarm['state'],
        agents: agents.filter(a => swarmInfo.agents.includes(a.id)),
        stats: {
          agentCount: swarmInfo.stats.agentCount,
          idleAgents: swarmInfo.stats.idleAgents,
          executingAgents: swarmInfo.stats.executingAgents,
          pendingTasks: swarmInfo.stats.pendingTasks,
          completedTasks: swarmInfo.stats.completedTasks,
          topology: swarmInfo.topology,
          strategy: swarmInfo.strategy,
          state: swarmInfo.state,
        },
      }
      store.addSwarm(swarm)
      setShowCreateModal(false)
      setNewSwarm({
        name: '',
        topology: 'star',
        strategy: 'parallel',
        agentIds: [],
      })
    } catch (err) {
      console.error('Failed to create swarm:', err)
    } finally {
      setLoading(false)
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
      await loadSwarms()
    } catch (err) {
      console.error('Failed to start swarm:', err)
    }
  }

  const handleStopSwarm = async (swarmId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await api.swarm.stopSwarm(swarmId)
      await loadSwarms()
    } catch (err) {
      console.error('Failed to stop swarm:', err)
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
      onStop={(e) => handleStopSwarm(swarm.id, e)}
    />
  ))

  // Show coordinator panel when a swarm is selected
  if (activeSwarm) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center p-2 border-b border-panel-border">
          <button
            onClick={handleBackToList}
            className="flex items-center space-x-1 px-2 py-1 hover:bg-panel-border rounded text-sm"
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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Network size={20} className="text-accent" />
          <h2 className="text-lg font-semibold">Swarm Control</h2>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={loadSwarms}
            className="p-1.5 hover:bg-panel-border rounded"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center space-x-1 px-3 py-1.5 bg-accent hover:bg-accent-hover rounded text-sm"
          >
            <Plus size={16} />
            <span>New Swarm</span>
          </button>
        </div>
      </div>

      {/* Swarm List */}
      <div className="flex-1 overflow-y-auto">
        {swarms.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-text-secondary">
            <Network size={48} className="mb-4 opacity-50" />
            <p className="text-lg mb-2">No swarms created</p>
            <p className="text-sm">Create a swarm to coordinate multiple agents</p>
          </div>
        ) : (
          <div className="space-y-4">
            {swarmCards}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-panel-bg border border-panel-border rounded-lg p-6 w-96 max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Create New Swarm</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  Swarm Name
                </label>
                <input
                  type="text"
                  value={newSwarm.name}
                  onChange={(e) =>
                    setNewSwarm({ ...newSwarm, name: e.target.value })
                  }
                  className="w-full bg-editor-bg border border-panel-border rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  placeholder="My Swarm"
                />
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  Topology
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(topologyIcons) as TopologyType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setNewSwarm({ ...newSwarm, topology: t })}
                      className={`flex items-center space-x-2 p-2 border rounded text-sm ${
                        newSwarm.topology === t
                          ? 'border-accent bg-accent/20'
                          : 'border-panel-border hover:border-accent'
                      }`}
                    >
                      <span className="text-lg">{topologyIcons[t]}</span>
                      <span className="capitalize">{t}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-text-secondary mt-1">
                  {topologyDescriptions[newSwarm.topology]}
                </p>
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1">
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
                  className="w-full bg-editor-bg border border-panel-border rounded px-3 py-2 text-sm"
                >
                  <option value="parallel">Parallel - Execute tasks simultaneously</option>
                  <option value="sequential">Sequential - Execute tasks one by one</option>
                  <option value="pipeline">Pipeline - Tasks flow through stages</option>
                  <option value="mapreduce">Map-Reduce - Distribute and aggregate</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  Select Agents ({newSwarm.agentIds.length} selected)
                </label>
                <div className="bg-editor-bg border border-panel-border rounded max-h-40 overflow-y-auto">
                  {agents.length === 0 ? (
                    <div className="p-2 text-xs text-text-secondary">No agents available</div>
                  ) : (
                    agents.map((agent) => (
                      <label
                        key={agent.id}
                        className="flex items-center px-3 py-2 hover:bg-panel-border cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={newSwarm.agentIds.includes(agent.id)}
                          onChange={() => toggleAgentSelection(agent.id)}
                          className="mr-2"
                        />
                        <span className="text-sm">{agent.name}</span>
                        <span className="text-xs text-text-secondary ml-auto capitalize">
                          {agent.type}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 border border-panel-border hover:bg-panel-border rounded text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSwarm}
                disabled={!newSwarm.name || newSwarm.agentIds.length === 0 || loading}
                className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 rounded text-sm flex items-center space-x-2"
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                <span>Create Swarm</span>
              </button>
            </div>
          </div>
        </div>
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
    stopped: 'bg-text-secondary',
  }

  const isRunning = swarm.state === 'active'

  return (
    <div
      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
        isActive
          ? 'border-accent bg-accent/10'
          : 'border-panel-border hover:border-accent'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <span className="text-lg">{topologyIcons[swarm.topology]}</span>
          <h4 className="font-medium">{swarm.name}</h4>
        </div>
        <div className="flex items-center space-x-2">
          <div
            className={`w-2 h-2 rounded-full ${statusColors[swarm.state]}`}
          />
          <span className="text-xs text-text-secondary capitalize">
            {swarm.state}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs text-text-secondary mb-3">
        <div>
          <span className="block text-text-primary">{swarm.stats.agentCount}</span>
          <span>Agents</span>
        </div>
        <div>
          <span className="block text-text-primary">
            {swarm.stats.completedTasks}
          </span>
          <span>Completed</span>
        </div>
        <div>
          <span className="block text-text-primary">
            {swarm.stats.pendingTasks}
          </span>
          <span>Pending</span>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <button
          className="flex-1 flex items-center justify-center space-x-1 py-1 bg-accent hover:bg-accent-hover rounded text-xs"
          onClick={onSelect}
        >
          <Play size={12} />
          <span>Manage</span>
        </button>
        {!isRunning ? (
          <button
            className="p-1 border border-panel-border hover:bg-panel-border rounded text-success"
            onClick={onStart}
            title="Start Swarm"
          >
            <Play size={14} />
          </button>
        ) : (
          <button
            className="p-1 border border-panel-border hover:bg-panel-border rounded text-error"
            onClick={onStop}
            title="Stop Swarm"
          >
            <Square size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

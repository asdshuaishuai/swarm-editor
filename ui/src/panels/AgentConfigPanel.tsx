import { useState, useEffect } from 'react'
import {
  Bot,
  Plus,
  Trash2,
  Edit3,
  Terminal,
  Loader2,
  X,
} from 'lucide-react'
import { AgentConfig, AgentSwarmConfig } from '../types'
import { logger } from '../utils'

interface AgentConfigPanelProps {
  initialAgents?: AgentConfig[]
  /** For testing: simulate connection failure */
  simulateConnectionError?: boolean
  /** For testing: simulate agent not found scenario */
  simulateAgentNotFound?: boolean
  /** For testing: test connection with a non-existent agent ID to trigger defensive check */
  testWithInvalidAgentId?: string
}

export default function AgentConfigPanel({
  initialAgents = [],
  simulateConnectionError = false,
  simulateAgentNotFound = false,
  testWithInvalidAgentId,
}: AgentConfigPanelProps) {
  const [agentConfigs, setAgentConfigs] = useState<AgentConfig[]>(initialAgents)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingAgent, setEditingAgent] = useState<AgentConfig | null>(null)
  const [agentStatuses, setAgentStatuses] = useState<Map<string, 'idle' | 'testing' | 'connected' | 'error'>>(new Map())
  const [newAgent, setNewAgent] = useState<Partial<AgentConfig>>({
    id: '',
    name: '',
    command: '',
    args: [],
    env: {},
    enabled: true,
    swarmConfig: {
      canBeCoordinator: true,
      canBeWorker: true,
      preferredRoles: ['coder'],
      maxConcurrent: 3,
      priority: 5,
    },
  })

  const handleSaveAgent = () => {
    // Save agent configuration
    if (editingAgent) {
      // Update existing agent
      setAgentConfigs((prev) =>
        prev.map((a) => (a.id === editingAgent.id ? { ...a, ...newAgent } as AgentConfig : a))
      )
    } else {
      // Add new agent
      const agent: AgentConfig = {
        id: newAgent.id || `agent-${Date.now()}`,
        name: newAgent.name || '',
        command: newAgent.command || '',
        args: newAgent.args || [],
        enabled: newAgent.enabled ?? true,
        swarmConfig: newAgent.swarmConfig,
        tags: newAgent.tags,
      }
      setAgentConfigs((prev) => [...prev, agent])
    }
    setShowAddModal(false)
    setEditingAgent(null)
    setNewAgent({
      id: '',
      name: '',
      command: '',
      args: [],
      env: {},
      enabled: true,
      swarmConfig: {
        canBeCoordinator: true,
        canBeWorker: true,
        preferredRoles: ['coder'],
        maxConcurrent: 3,
        priority: 5,
      },
    })
  }

  const handleDeleteAgent = (agentId: string) => {
    setAgentConfigs((prev) => prev.filter((a) => a.id !== agentId))
  }

  const handleTestConnection = async (agentId: string) => {
    // Set testing status
    setAgentStatuses((prev) => new Map(prev).set(agentId, 'testing'))

    // Simulate connection test (in real implementation, this would call the backend)
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500))

      // For testing: simulate agent not found scenario
      if (simulateAgentNotFound) {
        throw new Error('Agent not found')
      }

      // Find the agent to verify it exists (defensive check)
      // Note: This should always succeed in normal UI flow since the button is only shown for existing agents
      const agent = agentConfigs.find((a) => a.id === agentId)
      if (!agent) {
        throw new Error('Agent not found')
      }

      // For testing: simulate connection error
      if (simulateConnectionError) {
        throw new Error('Connection failed')
      }

      // Simulate success (in real implementation, this would depend on actual connection)
      setAgentStatuses((prev) => new Map(prev).set(agentId, 'connected'))
    } catch (error) {
      // Log error for debugging (defensive code)
      logger.error('AgentConfig', 'Connection test failed:', error)
      setAgentStatuses((prev) => new Map(prev).set(agentId, 'error'))
    }
  }

  // For testing: trigger connection test with invalid agent ID to cover defensive check
  useEffect(() => {
    if (testWithInvalidAgentId) {
      handleTestConnection(testWithInvalidAgentId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testWithInvalidAgentId])

  return (
    <div className="flex flex-col h-full p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-accent/10 rounded-mac">
            <Bot size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">ACP Agent Configuration</h2>
            <p className="text-xs text-text-secondary">{agentConfigs.length} agents configured</p>
          </div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn-primary"
        >
          <Plus size={16} />
          <span>Add Agent</span>
        </button>
      </div>

      {/* Agent List */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {agentConfigs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-text-tertiary">
            <div className="p-4 bg-glass rounded-mac-xl mb-4">
              <Bot size={48} className="opacity-50" />
            </div>
            <p className="text-base font-medium text-text-secondary mb-1">No agents configured</p>
            <p className="text-sm">Add an ACP agent to get started</p>
          </div>
        ) : (
          agentConfigs.map((agent) => (
            <AgentConfigCard
              key={agent.id}
              agent={agent}
              status={agentStatuses.get(agent.id) || 'idle'}
              onEdit={() => setEditingAgent(agent)}
              onTest={() => handleTestConnection(agent.id)}
              onDelete={() => handleDeleteAgent(agent.id)}
            />
          ))
        )}
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || editingAgent) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-mac-panel/95 border border-glass-border rounded-mac-xl p-5 w-[500px] max-h-[85vh] overflow-y-auto shadow-mac backdrop-blur-xl">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <Bot size={18} className="text-accent" />
                {editingAgent ? 'Edit Agent' : 'Add New Agent'}
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false)
                  setEditingAgent(null)
                }}
                className="p-1.5 hover:bg-card-hover rounded-mac transition-colors"
              >
                <X size={18} className="text-text-secondary" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-1.5 font-medium">
                    Agent ID *
                  </label>
                  <input
                    type="text"
                    value={editingAgent?.id || newAgent.id || ''}
                    onChange={(e) =>
                      setNewAgent({ ...newAgent, id: e.target.value })
                    }
                    disabled={!!editingAgent}
                    className="w-full input-mac disabled:opacity-50"
                    placeholder="claude-code"
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1.5 font-medium">
                    Display Name *
                  </label>
                  <input
                    type="text"
                    value={editingAgent?.name || newAgent.name || ''}
                    onChange={(e) =>
                      setNewAgent({ ...newAgent, name: e.target.value })
                    }
                    className="w-full input-mac"
                    placeholder="Claude Code"
                  />
                </div>
              </div>

              {/* Command */}
              <div>
                <label className="block text-sm text-text-secondary mb-1.5 font-medium">
                  Command Path *
                </label>
                <input
                  type="text"
                  value={editingAgent?.command || newAgent.command || ''}
                  onChange={(e) =>
                    setNewAgent({ ...newAgent, command: e.target.value })
                  }
                  className="w-full input-mac"
                  placeholder="/usr/local/bin/claude-code"
                />
              </div>

              {/* Arguments */}
              <div>
                <label className="block text-sm text-text-secondary mb-1.5 font-medium">
                  Arguments (comma-separated)
                </label>
                <input
                  type="text"
                  value={(editingAgent?.args || newAgent.args || []).join(', ')}
                  onChange={(e) =>
                    setNewAgent({
                      ...newAgent,
                      args: e.target.value.split(',').map((s) => s.trim()),
                    })
                  }
                  className="w-full input-mac"
                  placeholder="acp, --mode=swarm"
                />
              </div>

              {/* Environment Variables */}
              <div>
                <label className="block text-sm text-text-secondary mb-1.5 font-medium">
                  Environment Variables
                </label>
                <textarea
                  className="w-full input-mac font-mono resize-none"
                  rows={3}
                  placeholder="API_KEY=${ANTHROPIC_API_KEY}"
                  value={Object.entries(editingAgent?.env || newAgent.env || {})
                    .map(([k, v]) => `${k}=${v}`)
                    .join('\n')}
                  onChange={(e) => {
                    const envLines = e.target.value.split('\n').filter(Boolean)
                    const env: Record<string, string> = {}
                    envLines.forEach(line => {
                      const [key, ...valueParts] = line.split('=')
                      if (key) {
                        env[key.trim()] = valueParts.join('=').trim()
                      }
                    })
                    setNewAgent({ ...newAgent, env })
                  }}
                />
              </div>

              {/* Swarm Config */}
              <div className="border-t border-glass-border pt-4 mt-4">
                <h4 className="text-sm font-semibold mb-3 text-text-primary">Swarm Configuration</h4>

                <div className="grid grid-cols-2 gap-4">
                  <label className="flex items-center gap-2.5 p-2.5 bg-glass rounded-mac cursor-pointer hover:bg-card-hover transition-colors">
                    <input
                      type="checkbox"
                      checked={newAgent.swarmConfig?.canBeCoordinator ?? true}
                      onChange={(e) => setNewAgent({
                        ...newAgent,
                        swarmConfig: { ...newAgent.swarmConfig, canBeCoordinator: e.target.checked } as AgentSwarmConfig
                      })}
                      className="accent-accent"
                    />
                    <span className="text-sm text-text-primary">Can be Coordinator</span>
                  </label>
                  <label className="flex items-center gap-2.5 p-2.5 bg-glass rounded-mac cursor-pointer hover:bg-card-hover transition-colors">
                    <input
                      type="checkbox"
                      checked={newAgent.swarmConfig?.canBeWorker ?? true}
                      onChange={(e) => setNewAgent({
                        ...newAgent,
                        swarmConfig: { ...newAgent.swarmConfig, canBeWorker: e.target.checked } as AgentSwarmConfig
                      })}
                      className="accent-accent"
                    />
                    <span className="text-sm text-text-primary">Can be Worker</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-sm text-text-secondary mb-1.5 font-medium">
                      Max Concurrent Tasks
                    </label>
                    <input
                      type="number"
                      value={newAgent.swarmConfig?.maxConcurrent || 3}
                      onChange={(e) => setNewAgent({
                        ...newAgent,
                        swarmConfig: { ...newAgent.swarmConfig, maxConcurrent: parseInt(e.target.value) || 3 } as AgentSwarmConfig
                      })}
                      className="w-full input-mac"
                      min={1}
                      max={10}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-text-secondary mb-1.5 font-medium">
                      Priority (1-10)
                    </label>
                    <input
                      type="number"
                      value={newAgent.swarmConfig?.priority || 5}
                      onChange={(e) => setNewAgent({
                        ...newAgent,
                        swarmConfig: { ...newAgent.swarmConfig, priority: parseInt(e.target.value) || 5 } as AgentSwarmConfig
                      })}
                      className="w-full input-mac"
                      min={1}
                      max={10}
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-sm text-text-secondary mb-1.5 font-medium">
                    Preferred Roles
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {['coder', 'reviewer', 'tester', 'architect'].map((role) => (
                      <label
                        key={role}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-glass-border rounded-mac text-sm cursor-pointer hover:border-accent/50 hover:bg-card-hover transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={newAgent.swarmConfig?.preferredRoles?.includes(role) ?? false}
                          onChange={(e) => {
                            const currentRoles = newAgent.swarmConfig?.preferredRoles || []
                            const updatedRoles = e.target.checked
                              ? [...currentRoles, role]
                              : currentRoles.filter(r => r !== role)
                            setNewAgent({
                              ...newAgent,
                              swarmConfig: { ...newAgent.swarmConfig, preferredRoles: updatedRoles } as AgentSwarmConfig
                            })
                          }}
                          className="accent-accent"
                        />
                        <span className="capitalize text-text-primary">{role}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm text-text-secondary mb-1.5 font-medium">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={(editingAgent?.tags || newAgent.tags || []).join(', ')}
                  onChange={(e) => {
                    const tags = e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                    setNewAgent({ ...newAgent, tags })
                  }}
                  className="w-full input-mac"
                  placeholder="primary, coding, review"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-glass-border">
              <button
                onClick={() => {
                  setShowAddModal(false)
                  setEditingAgent(null)
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAgent}
                className="btn-primary"
              >
                {editingAgent ? 'Save Changes' : 'Add Agent'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface AgentConfigCardProps {
  agent: AgentConfig
  onEdit: () => void
  onTest: () => void
  onDelete: () => void
  /** Status controlled by parent component */
  status?: 'idle' | 'testing' | 'connected' | 'error'
  /** Initial status for testing purposes (used when status is not provided) */
  initialStatus?: 'idle' | 'testing' | 'connected' | 'error'
}

export function AgentConfigCard({ agent, onEdit, onTest, onDelete, status: controlledStatus, initialStatus = 'idle' }: AgentConfigCardProps) {
  const [localStatus] = useState<'idle' | 'testing' | 'connected' | 'error'>(initialStatus)
  const status = controlledStatus ?? localStatus

  const statusColors = {
    idle: 'bg-text-tertiary',
    testing: 'bg-warning animate-pulse',
    connected: 'bg-success',
    error: 'bg-error',
  }

  return (
    <div className="p-4 bg-glass border border-glass-border rounded-mac-xl hover:border-glass-border/80 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${statusColors[status]}`} />
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-text-primary">{agent.name}</h4>
              {agent.enabled ? (
                <span className="px-2 py-0.5 text-xs bg-success/10 text-success rounded-mac font-medium">
                  Enabled
                </span>
              ) : (
                <span className="px-2 py-0.5 text-xs bg-glass text-text-secondary rounded-mac font-medium">
                  Disabled
                </span>
              )}
            </div>
            <p className="text-sm text-text-secondary mt-0.5">{agent.id}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onTest}
            className="p-2 hover:bg-card-hover rounded-mac transition-colors"
            title="Test Connection"
          >
            {status === 'testing' ? (
              <Loader2 size={16} className="animate-spin text-accent" />
            ) : (
              <Terminal size={16} className="text-text-secondary" />
            )}
          </button>
          <button
            onClick={onEdit}
            className="p-2 hover:bg-card-hover rounded-mac transition-colors"
            title="Edit"
          >
            <Edit3 size={16} className="text-text-secondary" />
          </button>
          <button
            onClick={onDelete}
            className="p-2 hover:bg-error/10 rounded-mac transition-colors group"
            title="Delete"
          >
            <Trash2 size={16} className="text-text-secondary group-hover:text-error" />
          </button>
        </div>
      </div>

      <div className="mt-3 text-sm">
        <div className="flex items-center gap-2 text-text-secondary bg-glass/50 rounded-mac px-2.5 py-1.5">
          <Terminal size={14} />
          <span className="font-mono text-xs truncate">{agent.command}</span>
        </div>
      </div>

      {/* Swarm Config Summary */}
      {agent.swarmConfig && (
        <div className="mt-3 flex items-center flex-wrap gap-2 text-xs text-text-secondary">
          {agent.swarmConfig.canBeCoordinator && (
            <span className="px-2 py-1 bg-accent/10 text-accent rounded-mac font-medium">
              Coordinator
            </span>
          )}
          {agent.swarmConfig.canBeWorker && (
            <span className="px-2 py-1 bg-info/10 text-info rounded-mac font-medium">
              Worker
            </span>
          )}
          <span className="px-2 py-1 bg-glass rounded-mac">Priority: {agent.swarmConfig.priority}</span>
          <span className="px-2 py-1 bg-glass rounded-mac">Max: {agent.swarmConfig.maxConcurrent}</span>
        </div>
      )}

      {/* Tags */}
      {agent.tags && agent.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {agent.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 text-xs bg-glass border border-glass-border rounded-mac text-text-secondary"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

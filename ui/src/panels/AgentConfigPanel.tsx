import { useState } from 'react'
import {
  Bot,
  Plus,
  Trash2,
  Edit3,
  Terminal,
  Loader2,
} from 'lucide-react'
import { AgentConfig } from '../types'

// Sample agent configs for demo purposes
const sampleAgentConfigs: AgentConfig[] = []

export default function AgentConfigPanel() {
  const [agentConfigs] = useState<AgentConfig[]>(sampleAgentConfigs)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingAgent, setEditingAgent] = useState<AgentConfig | null>(null)
  const [newAgent, setNewAgent] = useState<Partial<AgentConfig>>({
    id: '',
    name: '',
    command: '',
    args: [],
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
    setShowAddModal(false)
    setEditingAgent(null)
    setNewAgent({
      id: '',
      name: '',
      command: '',
      args: [],
      enabled: true,
    })
  }

  const handleTestConnection = async (agentId: string) => {
    // Test connection to agent
    console.log('Testing connection to:', agentId)
  }

  return (
    <div className="flex flex-col h-full p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Bot size={20} className="text-accent" />
          <h2 className="text-lg font-semibold">ACP Agent Configuration</h2>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center space-x-1 px-3 py-1.5 bg-accent hover:bg-accent-hover rounded text-sm"
        >
          <Plus size={16} />
          <span>Add Agent</span>
        </button>
      </div>

      {/* Agent List */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {agentConfigs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-text-secondary">
            <Bot size={48} className="mb-4 opacity-50" />
            <p className="text-lg mb-2">No agents configured</p>
            <p className="text-sm">Add an ACP agent to get started</p>
          </div>
        ) : (
          agentConfigs.map((agent) => (
            <AgentConfigCard
              key={agent.id}
              agent={agent}
              onEdit={() => setEditingAgent(agent)}
              onTest={() => handleTestConnection(agent.id)}
              onDelete={() => {}}
            />
          ))
        )}
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || editingAgent) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-panel-bg border border-panel-border rounded-lg p-6 w-[500px] max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">
              {editingAgent ? 'Edit Agent' : 'Add New Agent'}
            </h3>

            <div className="space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">
                    Agent ID *
                  </label>
                  <input
                    type="text"
                    value={editingAgent?.id || newAgent.id || ''}
                    onChange={(e) =>
                      setNewAgent({ ...newAgent, id: e.target.value })
                    }
                    disabled={!!editingAgent}
                    className="w-full bg-editor-bg border border-panel-border rounded px-3 py-2 text-sm focus:outline-none focus:border-accent disabled:opacity-50"
                    placeholder="claude-code"
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">
                    Display Name *
                  </label>
                  <input
                    type="text"
                    value={editingAgent?.name || newAgent.name || ''}
                    onChange={(e) =>
                      setNewAgent({ ...newAgent, name: e.target.value })
                    }
                    className="w-full bg-editor-bg border border-panel-border rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
                    placeholder="Claude Code"
                  />
                </div>
              </div>

              {/* Command */}
              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  Command Path *
                </label>
                <input
                  type="text"
                  value={editingAgent?.command || newAgent.command || ''}
                  onChange={(e) =>
                    setNewAgent({ ...newAgent, command: e.target.value })
                  }
                  className="w-full bg-editor-bg border border-panel-border rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  placeholder="/usr/local/bin/claude-code"
                />
              </div>

              {/* Arguments */}
              <div>
                <label className="block text-sm text-text-secondary mb-1">
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
                  className="w-full bg-editor-bg border border-panel-border rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  placeholder="acp, --mode=swarm"
                />
              </div>

              {/* Environment Variables */}
              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  Environment Variables
                </label>
                <textarea
                  className="w-full bg-editor-bg border border-panel-border rounded px-3 py-2 text-sm focus:outline-none focus:border-accent font-mono"
                  rows={3}
                  placeholder="API_KEY=${ANTHROPIC_API_KEY}"
                />
              </div>

              {/* Swarm Config */}
              <div className="border-t border-panel-border pt-4 mt-4">
                <h4 className="text-sm font-semibold mb-3">Swarm Configuration</h4>

                <div className="grid grid-cols-2 gap-4">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      defaultChecked={newAgent.swarmConfig?.canBeCoordinator}
                      className="rounded border-panel-border"
                    />
                    <span className="text-sm">Can be Coordinator</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      defaultChecked={newAgent.swarmConfig?.canBeWorker}
                      className="rounded border-panel-border"
                    />
                    <span className="text-sm">Can be Worker</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-sm text-text-secondary mb-1">
                      Max Concurrent Tasks
                    </label>
                    <input
                      type="number"
                      defaultValue={newAgent.swarmConfig?.maxConcurrent || 3}
                      className="w-full bg-editor-bg border border-panel-border rounded px-3 py-2 text-sm"
                      min={1}
                      max={10}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-text-secondary mb-1">
                      Priority (1-10)
                    </label>
                    <input
                      type="number"
                      defaultValue={newAgent.swarmConfig?.priority || 5}
                      className="w-full bg-editor-bg border border-panel-border rounded px-3 py-2 text-sm"
                      min={1}
                      max={10}
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-sm text-text-secondary mb-1">
                    Preferred Roles
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {['coder', 'reviewer', 'tester', 'architect'].map((role) => (
                      <label
                        key={role}
                        className="flex items-center space-x-1 px-2 py-1 border border-panel-border rounded text-sm cursor-pointer hover:border-accent"
                      >
                        <input
                          type="checkbox"
                          defaultChecked={newAgent.swarmConfig?.preferredRoles?.includes(role)}
                          className="rounded border-panel-border"
                        />
                        <span className="capitalize">{role}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  className="w-full bg-editor-bg border border-panel-border rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  placeholder="primary, coding, review"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 mt-6">
              <button
                onClick={() => {
                  setShowAddModal(false)
                  setEditingAgent(null)
                }}
                className="px-4 py-2 border border-panel-border hover:bg-panel-border rounded text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAgent}
                className="px-4 py-2 bg-accent hover:bg-accent-hover rounded text-sm"
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
}

export function AgentConfigCard({ agent, onEdit, onTest, onDelete }: AgentConfigCardProps) {
  const [status] = useState<'idle' | 'testing' | 'connected' | 'error'>('idle')

  const statusColors = {
    idle: 'bg-text-secondary',
    testing: 'bg-warning animate-pulse',
    connected: 'bg-success',
    error: 'bg-error',
  }

  return (
    <div className="p-4 bg-panel-bg border border-panel-border rounded-lg">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <div className={`w-3 h-3 rounded-full ${statusColors[status]}`} />
          <div>
            <div className="flex items-center space-x-2">
              <h4 className="font-medium">{agent.name}</h4>
              {agent.enabled ? (
                <span className="px-1.5 py-0.5 text-xs bg-success/20 text-success rounded">
                  Enabled
                </span>
              ) : (
                <span className="px-1.5 py-0.5 text-xs bg-text-secondary/20 text-text-secondary rounded">
                  Disabled
                </span>
              )}
            </div>
            <p className="text-sm text-text-secondary">{agent.id}</p>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={onTest}
            className="p-1.5 hover:bg-panel-border rounded"
            title="Test Connection"
          >
            {status === 'testing' ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Terminal size={16} />
            )}
          </button>
          <button
            onClick={onEdit}
            className="p-1.5 hover:bg-panel-border rounded"
            title="Edit"
          >
            <Edit3 size={16} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 hover:bg-panel-border rounded text-error"
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="mt-3 text-sm">
        <div className="flex items-center space-x-2 text-text-secondary">
          <Terminal size={14} />
          <span className="font-mono text-xs truncate">{agent.command}</span>
        </div>
      </div>

      {/* Swarm Config Summary */}
      {agent.swarmConfig && (
        <div className="mt-3 flex items-center space-x-3 text-xs text-text-secondary">
          {agent.swarmConfig.canBeCoordinator && (
            <span className="px-1.5 py-0.5 bg-accent/20 text-accent rounded">
              Coordinator
            </span>
          )}
          {agent.swarmConfig.canBeWorker && (
            <span className="px-1.5 py-0.5 bg-info/20 text-info rounded">
              Worker
            </span>
          )}
          <span>Priority: {agent.swarmConfig.priority}</span>
          <span>Max: {agent.swarmConfig.maxConcurrent}</span>
        </div>
      )}

      {/* Tags */}
      {agent.tags && agent.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {agent.tags.map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 text-xs bg-panel-border rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
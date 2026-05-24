import { useState, useEffect } from 'react'
import {
  Bot,
  Plus,
  Trash2,
  Edit3,
  Terminal,
  Loader2,
} from 'lucide-react'
import { AgentConfig } from '../types'
import { logger } from '../utils'
import { api } from '../services'
import { useAppStore } from '../store/appStore'
import { ConfirmDialog } from '../components/ConfirmDialog'
import AgentConfigModal from '../components/AgentConfigModal'

interface AgentConfigPanelProps {
  initialAgents?: AgentConfig[]
  simulateConnectionError?: boolean
  simulateAgentNotFound?: boolean
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
  const addToast = useAppStore(state => state.addToast)
  const [agentStatuses, setAgentStatuses] = useState<Map<string, 'idle' | 'testing' | 'connected' | 'error'>>(new Map())
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  const handleDeleteAgent = async () => {
    if (!deleteTarget) return

    const targetId = deleteTarget.id
    const targetName = deleteTarget.name
    setDeleteTarget(null)

    try {
      await api.agent.deleteAgent(targetId)
      setAgentConfigs((prev) => prev.filter((a) => a.id !== targetId))
      logger.info('AgentConfig', 'Agent deleted successfully:', targetId)
      addToast('success', 'Agent deleted', `"${targetName}" has been removed`)
    } catch (error) {
      logger.error('AgentConfig', 'Failed to delete agent:', error)
      addToast('error', 'Failed to delete agent', error instanceof Error ? error.message : 'Unknown error')
    }
  }

  const handleTestConnection = async (agentId: string) => {
    setAgentStatuses((prev) => new Map(prev).set(agentId, 'testing'))

    try {
      if (simulateAgentNotFound) {
        throw new Error('Agent not found')
      }

      const agent = agentConfigs.find((a) => a.id === agentId)
      if (!agent) {
        throw new Error('Agent not found')
      }

      if (simulateConnectionError) {
        throw new Error('Connection failed')
      }

      const result = await api.agent.testAgent(agentId)

      if (result.status === 'available') {
        setAgentStatuses((prev) => new Map(prev).set(agentId, 'connected'))
        logger.info('AgentConfig', 'Agent connection test successful:', agentId)
      } else {
        throw new Error(`Agent status: ${result.status}`)
      }
    } catch (error) {
      logger.error('AgentConfig', 'Connection test failed:', error)
      setAgentStatuses((prev) => new Map(prev).set(agentId, 'error'))
    }
  }

  useEffect(() => {
    if (testWithInvalidAgentId) {
      handleTestConnection(testWithInvalidAgentId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testWithInvalidAgentId])

  const handleModalSaved = (saved: AgentConfig) => {
    if (editingAgent) {
      setAgentConfigs(prev => prev.map(a => a.id === saved.id ? saved : a))
    } else {
      setAgentConfigs(prev => [...prev, saved])
    }
  }

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
        <button onClick={() => setShowAddModal(true)} className="btn-primary">
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
              onDelete={() => setDeleteTarget({ id: agent.id, name: agent.name })}
            />
          ))
        )}
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || editingAgent) && (
        <AgentConfigModal
          agent={editingAgent}
          onClose={() => { setShowAddModal(false); setEditingAgent(null) }}
          onSaved={handleModalSaved}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Agent"
          message={`Are you sure you want to delete agent "${deleteTarget.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleDeleteAgent}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

interface AgentConfigCardProps {
  agent: AgentConfig
  onEdit: () => void
  onTest: () => void
  onDelete: () => void
  status?: 'idle' | 'testing' | 'connected' | 'error'
}

export function AgentConfigCard({ agent, onEdit, onTest, onDelete, status = 'idle' }: AgentConfigCardProps) {

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
                <span className="px-2 py-0.5 text-xs bg-success/10 text-success rounded-mac font-medium">Enabled</span>
              ) : (
                <span className="px-2 py-0.5 text-xs bg-glass text-text-secondary rounded-mac font-medium">Disabled</span>
              )}
            </div>
            <p className="text-sm text-text-secondary mt-0.5">{agent.id}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={onTest} className="p-2 hover:bg-card-hover rounded-mac transition-colors" title="Test Connection" aria-label="Test Connection">
            {status === 'testing' ? (
              <Loader2 size={16} className="animate-spin text-accent" />
            ) : (
              <Terminal size={16} className="text-text-secondary" />
            )}
          </button>
          <button onClick={onEdit} className="p-2 hover:bg-card-hover rounded-mac transition-colors" title="Edit" aria-label="Edit">
            <Edit3 size={16} className="text-text-secondary" />
          </button>
          <button onClick={onDelete} className="p-2 hover:bg-error/10 rounded-mac transition-colors group" title="Delete" aria-label="Delete">
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

      {agent.swarmConfig && (
        <div className="mt-3 flex items-center flex-wrap gap-2 text-xs text-text-secondary">
          {agent.swarmConfig.canBeCoordinator && (
            <span className="px-2 py-1 bg-accent/10 text-accent rounded-mac font-medium">Coordinator</span>
          )}
          {agent.swarmConfig.canBeWorker && (
            <span className="px-2 py-1 bg-info/10 text-info rounded-mac font-medium">Worker</span>
          )}
          <span className="px-2 py-1 bg-glass rounded-mac">Priority: {agent.swarmConfig.priority}</span>
          <span className="px-2 py-1 bg-glass rounded-mac">Max: {agent.swarmConfig.maxConcurrent}</span>
        </div>
      )}

      {agent.tags && agent.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {agent.tags.map((tag) => (
            <span key={tag} className="px-2 py-0.5 text-xs bg-glass border border-glass-border rounded-mac text-text-secondary">{tag}</span>
          ))}
        </div>
      )}
    </div>
  )
}

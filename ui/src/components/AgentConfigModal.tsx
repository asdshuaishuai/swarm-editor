import { useState, useEffect } from 'react'
import { Bot, Loader2, X } from 'lucide-react'
import { AgentConfig, AgentSwarmConfig } from '../types'
import { api } from '../services'
import { logger } from '../utils'
import { useAppStore } from '../store/appStore'

interface AgentConfigModalProps {
  /** Existing agent to edit, or null for new agent */
  agent?: AgentConfig | null
  /** Pre-populated values from scanner discovery */
  defaults?: Partial<AgentConfig>
  onClose: () => void
  onSaved: (agent: AgentConfig) => void
}

export default function AgentConfigModal({ agent, defaults, onClose, onSaved }: AgentConfigModalProps) {
  const addToast = useAppStore(state => state.addToast)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<AgentConfig>>({
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

  useEffect(() => {
    if (agent) {
      setForm({
        id: agent.id,
        name: agent.name,
        command: agent.command,
        description: agent.description,
        enabled: agent.enabled,
        args: agent.args,
        env: agent.env,
        swarmConfig: agent.swarmConfig,
        tags: agent.tags,
      })
    } else if (defaults) {
      setForm(prev => ({ ...prev, ...defaults }))
    }
  }, [agent, defaults])

  const handleSave = async () => {
    if (!form.id || !form.name || !form.command) {
      setSaveError('ID, Name, and Command are required')
      return
    }

    setIsSaving(true)
    setSaveError(null)

    try {
      const config: AgentConfig = {
        id: form.id!,
        name: form.name!,
        command: form.command!,
        description: form.description,
        enabled: form.enabled ?? true,
        args: form.args,
        env: form.env,
        swarmConfig: form.swarmConfig,
        tags: form.tags,
      }

      let saved: AgentConfig
      if (agent) {
        const updated = await api.agent.updateAgent(config)
        saved = { ...config, ...updated }
        addToast('success', 'Agent updated', `"${config.name}" configuration saved`)
      } else {
        const added = await api.agent.addAgent(config)
        saved = { ...config, ...added }
        addToast('success', 'Agent added', `"${config.name}" has been configured`)
      }

      onSaved(saved)
      onClose()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      logger.error('AgentConfigModal', 'Save failed:', error)
      setSaveError(msg)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-mac-panel/95 border border-glass-border rounded-mac-xl p-5 w-[500px] max-h-[85vh] overflow-y-auto shadow-mac backdrop-blur-xl" role="dialog" aria-modal="true" aria-label="Agent configuration">
        {/* Header */}
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Bot size={18} className="text-accent" />
            {agent ? 'Edit Agent' : 'Add New Agent'}
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-card-hover rounded-mac transition-colors">
            <X size={18} className="text-text-secondary" />
          </button>
        </div>

        <div className="space-y-4">
          {/* ID & Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5 font-medium">Agent ID *</label>
              <input
                type="text"
                value={form.id || ''}
                onChange={e => setForm({ ...form, id: e.target.value })}
                disabled={!!agent}
                className="w-full input-mac disabled:opacity-50"
                placeholder="claude-code"
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1.5 font-medium">Display Name *</label>
              <input
                type="text"
                value={form.name || ''}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full input-mac"
                placeholder="Claude Code"
              />
            </div>
          </div>

          {/* Command */}
          <div>
            <label className="block text-sm text-text-secondary mb-1.5 font-medium">Command Path *</label>
            <input
              type="text"
              value={form.command || ''}
              onChange={e => setForm({ ...form, command: e.target.value })}
              className="w-full input-mac font-mono"
              placeholder="/usr/local/bin/claude-code"
            />
          </div>

          {/* Arguments */}
          <div>
            <label className="block text-sm text-text-secondary mb-1.5 font-medium">Arguments (comma-separated)</label>
            <input
              type="text"
              value={(form.args || []).join(', ')}
              onChange={e => setForm({ ...form, args: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
              className="w-full input-mac"
              placeholder="acp, --mode=swarm"
            />
          </div>

          {/* Environment Variables */}
          <div>
            <label className="block text-sm text-text-secondary mb-1.5 font-medium">Environment Variables</label>
            <textarea
              className="w-full input-mac font-mono resize-none"
              rows={3}
              placeholder="API_KEY=${ANTHROPIC_API_KEY}"
              value={Object.entries(form.env || {}).map(([k, v]) => `${k}=${v}`).join('\n')}
              onChange={e => {
                const env: Record<string, string> = {}
                e.target.value.split('\n').filter(Boolean).forEach(line => {
                  const [key, ...parts] = line.split('=')
                  if (key) env[key.trim()] = parts.join('=').trim()
                })
                setForm({ ...form, env })
              }}
            />
          </div>

          {/* Swarm Config */}
          <div className="border-t border-glass-border pt-4">
            <h4 className="text-sm font-semibold mb-3 text-text-primary">Swarm Configuration</h4>
            <div className="grid grid-cols-2 gap-4">
              <label className="flex items-center gap-2.5 p-2.5 bg-glass rounded-mac cursor-pointer hover:bg-card-hover transition-colors">
                <input
                  type="checkbox"
                  checked={form.swarmConfig?.canBeCoordinator ?? true}
                  onChange={e => setForm({
                    ...form,
                    swarmConfig: { ...form.swarmConfig, canBeCoordinator: e.target.checked } as AgentSwarmConfig
                  })}
                  className="accent-accent"
                />
                <span className="text-sm text-text-primary">Can be Coordinator</span>
              </label>
              <label className="flex items-center gap-2.5 p-2.5 bg-glass rounded-mac cursor-pointer hover:bg-card-hover transition-colors">
                <input
                  type="checkbox"
                  checked={form.swarmConfig?.canBeWorker ?? true}
                  onChange={e => setForm({
                    ...form,
                    swarmConfig: { ...form.swarmConfig, canBeWorker: e.target.checked } as AgentSwarmConfig
                  })}
                  className="accent-accent"
                />
                <span className="text-sm text-text-primary">Can be Worker</span>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <label className="block text-sm text-text-secondary mb-1.5 font-medium">Max Concurrent Tasks</label>
                <input
                  type="number"
                  value={form.swarmConfig?.maxConcurrent || 3}
                  onChange={e => setForm({
                    ...form,
                    swarmConfig: { ...form.swarmConfig, maxConcurrent: parseInt(e.target.value) || 3 } as AgentSwarmConfig
                  })}
                  className="w-full input-mac"
                  min={1} max={10}
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1.5 font-medium">Priority (1-10)</label>
                <input
                  type="number"
                  value={form.swarmConfig?.priority || 5}
                  onChange={e => setForm({
                    ...form,
                    swarmConfig: { ...form.swarmConfig, priority: parseInt(e.target.value) || 5 } as AgentSwarmConfig
                  })}
                  className="w-full input-mac"
                  min={1} max={10}
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-sm text-text-secondary mb-1.5 font-medium">Preferred Roles</label>
              <div className="flex flex-wrap gap-2">
                {['coder', 'reviewer', 'tester', 'architect'].map(role => (
                  <label key={role} className="flex items-center gap-1.5 px-3 py-1.5 border border-glass-border rounded-mac text-sm cursor-pointer hover:border-accent/50 hover:bg-card-hover transition-colors">
                    <input
                      type="checkbox"
                      checked={form.swarmConfig?.preferredRoles?.includes(role) ?? false}
                      onChange={e => {
                        const current = form.swarmConfig?.preferredRoles || []
                        const updated = e.target.checked ? [...current, role] : current.filter(r => r !== role)
                        setForm({ ...form, swarmConfig: { ...form.swarmConfig, preferredRoles: updated } as AgentSwarmConfig })
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
            <label className="block text-sm text-text-secondary mb-1.5 font-medium">Tags (comma-separated)</label>
            <input
              type="text"
              value={(form.tags || []).join(', ')}
              onChange={e => setForm({ ...form, tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
              className="w-full input-mac"
              placeholder="primary, coding, review"
            />
          </div>
        </div>

        {/* Error */}
        {saveError && (
          <div role="alert" className="mt-4 p-3 bg-error/10 border border-error/30 rounded-mac text-sm text-error">
            {saveError}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-glass-border">
          <button onClick={onClose} className="btn-secondary" disabled={isSaving}>Cancel</button>
          <button onClick={handleSave} className="btn-primary" disabled={isSaving}>
            {isSaving ? (
              <><Loader2 size={16} className="animate-spin" /><span>Saving...</span></>
            ) : (
              <span>{agent ? 'Save Changes' : 'Add Agent'}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

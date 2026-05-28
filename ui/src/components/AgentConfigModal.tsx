import { useState, useEffect, useCallback } from 'react'
import { Bot, Loader2, X, Shield, Globe, ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react'
import { AgentConfig, AgentSwarmConfig } from '../types'
import { api, type AgentConfigView, type ProviderPreset } from '../services'
import { logger } from '../utils'
import { useAppStore } from '../store/appStore'

// Known native agents that support provider configuration
const NATIVE_AGENTS = new Set(['claude-code', 'kimi-code', 'opencode', 'qwen-code'])

interface AgentConfigModalProps {
  /** Existing agent to edit, or null for new agent */
  agent?: AgentConfig | null
  /** Pre-populated values from scanner discovery */
  defaults?: Partial<AgentConfig>
  onClose: () => void
  onSaved: (agent: AgentConfig) => void
}

type ConfigMode = 'basic' | 'native'

export default function AgentConfigModal({ agent, defaults, onClose, onSaved }: AgentConfigModalProps) {
  const addToast = useAppStore(state => state.addToast)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Determine mode: native if agent ID matches known agents
  const agentId = agent?.id || defaults?.id || ''
  const isNative = NATIVE_AGENTS.has(agentId)
  const [mode, setMode] = useState<ConfigMode>(isNative ? 'native' : 'basic')

  // Basic mode state (existing)
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

  // Native mode state
  const [nativeConfig, setNativeConfig] = useState<AgentConfigView | null>(null)
  const [nativeLoading, setNativeLoading] = useState(false)
  const [nativeError, setNativeError] = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [rawJson, setRawJson] = useState('')
  const [rawJsonError, setRawJsonError] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)

  // Load basic form
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

  // Load native config
  const loadNativeConfig = useCallback(async () => {
    if (!isNative || mode !== 'native') return
    setNativeLoading(true)
    setNativeError(null)
    try {
      const view = await api.agent.getAgentConfig(agentId)
      setNativeConfig(view)
      setRawJson(JSON.stringify(view.raw || {}, null, 2))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load config'
      setNativeError(msg)
      logger.error('AgentConfigModal', 'Failed to load native config:', err)
    } finally {
      setNativeLoading(false)
    }
  }, [agentId, isNative, mode])

  useEffect(() => {
    loadNativeConfig()
  }, [loadNativeConfig])

  // Save basic config (existing flow)
  const handleBasicSave = async () => {
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

  // Save native config
  const handleNativeSave = async () => {
    if (!nativeConfig) return
    setIsSaving(true)
    setSaveError(null)
    try {
      // Parse raw JSON if shown
      let raw: Record<string, unknown> | undefined
      if (showRaw && rawJson.trim()) {
        try {
          raw = JSON.parse(rawJson)
          setRawJsonError(null)
        } catch {
          setRawJsonError('Invalid JSON')
          setIsSaving(false)
          return
        }
      }

      await api.agent.updateAgentConfig(agentId, {
        providerCategory: nativeConfig.providerCategory,
        providerPreset: nativeConfig.providerPreset,
        model: nativeConfig.model,
        smallModel: nativeConfig.smallModel,
        apiKey: nativeConfig.apiKey,
        baseUrl: nativeConfig.baseUrl,
        raw: raw !== undefined ? raw : nativeConfig.raw,
      })
      addToast('success', 'Config saved', `${nativeConfig.agentName} configuration updated`)
      // Return a minimal AgentConfig for onSaved callback
      onSaved({ id: agentId, name: nativeConfig.agentName, command: '', enabled: true } as AgentConfig)
      onClose()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      logger.error('AgentConfigModal', 'Native save failed:', error)
      setSaveError(msg)
    } finally {
      setIsSaving(false)
    }
  }

  // Filter presets by category
  const firstPartyPresets = nativeConfig?.providerPresets.filter(p => p.category === 'first_party') || []
  const thirdPartyPresets = nativeConfig?.providerPresets.filter(p => p.category === 'third_party') || []
  const activePresets = nativeConfig?.providerCategory === 'first_party' ? firstPartyPresets : thirdPartyPresets

  // Apply preset selection
  const handlePresetSelect = (preset: ProviderPreset) => {
    if (!nativeConfig) return
    setNativeConfig({
      ...nativeConfig,
      providerPreset: preset.name,
      baseUrl: preset.baseUrl || nativeConfig.baseUrl,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-mac-panel/95 border border-glass-border rounded-mac-xl p-5 w-[560px] max-h-[85vh] overflow-y-auto shadow-mac backdrop-blur-xl" role="dialog" aria-modal="true" aria-label="Agent configuration">
        {/* Header */}
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Bot size={18} className="text-accent" />
            {agent ? `Edit: ${agent.name}` : (defaults?.name ? `Configure: ${defaults.name}` : 'Add New Agent')}
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-card-hover rounded-mac transition-colors">
            <X size={18} className="text-text-secondary" />
          </button>
        </div>

        {/* Mode tabs (only if native agent) */}
        {isNative && (
          <div className="flex border-b border-glass-border mb-4">
            <button
              onClick={() => setMode('native')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                mode === 'native'
                  ? 'text-accent border-accent'
                  : 'text-text-tertiary border-transparent hover:text-text-secondary'
              }`}
            >
              Provider Config
            </button>
            <button
              onClick={() => setMode('basic')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                mode === 'basic'
                  ? 'text-accent border-accent'
                  : 'text-text-tertiary border-transparent hover:text-text-secondary'
              }`}
            >
              Basic Settings
            </button>
          </div>
        )}

        {/* Native config mode */}
        {mode === 'native' && (
          <NativeConfigEditor
            config={nativeConfig}
            loading={nativeLoading}
            error={nativeError}
            firstPartyPresets={firstPartyPresets}
            thirdPartyPresets={thirdPartyPresets}
            activePresets={activePresets}
            showApiKey={showApiKey}
            showRaw={showRaw}
            rawJson={rawJson}
            rawJsonError={rawJsonError}
            onConfigChange={setNativeConfig}
            onPresetSelect={handlePresetSelect}
            onToggleApiKey={() => setShowApiKey(!showApiKey)}
            onToggleRaw={() => setShowRaw(!showRaw)}
            onRawJsonChange={(val) => { setRawJson(val); setRawJsonError(null) }}
            onRetry={loadNativeConfig}
          />
        )}

        {/* Basic config mode */}
        {mode === 'basic' && (
          <BasicConfigEditor
            form={form}
            isEdit={!!agent}
            onFormChange={setForm}
          />
        )}

        {/* Error */}
        {saveError && (
          <div role="alert" className="mt-4 p-3 bg-error/10 border border-error/30 rounded-mac text-sm text-error">
            {saveError}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-glass-border">
          <button onClick={onClose} className="btn-secondary" disabled={isSaving}>Cancel</button>
          <button
            onClick={mode === 'native' ? handleNativeSave : handleBasicSave}
            className="btn-primary"
            disabled={isSaving || (mode === 'native' && !nativeConfig)}
          >
            {isSaving ? (
              <><Loader2 size={16} className="animate-spin" /><span>Saving...</span></>
            ) : (
              <span>{mode === 'native' ? 'Save & Sync' : (agent ? 'Save Changes' : 'Add Agent')}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Native Config Editor ───────────────────────────────────────────────────

interface NativeConfigEditorProps {
  config: AgentConfigView | null
  loading: boolean
  error: string | null
  firstPartyPresets: ProviderPreset[]
  thirdPartyPresets: ProviderPreset[]
  activePresets: ProviderPreset[]
  showApiKey: boolean
  showRaw: boolean
  rawJson: string
  rawJsonError: string | null
  onConfigChange: (config: AgentConfigView) => void
  onPresetSelect: (preset: ProviderPreset) => void
  onToggleApiKey: () => void
  onToggleRaw: () => void
  onRawJsonChange: (val: string) => void
  onRetry: () => void
}

function NativeConfigEditor({
  config, loading, error, firstPartyPresets, thirdPartyPresets, activePresets,
  showApiKey, showRaw, rawJson, rawJsonError,
  onConfigChange, onPresetSelect, onToggleApiKey, onToggleRaw, onRawJsonChange, onRetry,
}: NativeConfigEditorProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-text-tertiary">
        <Loader2 size={20} className="animate-spin mr-2" />
        <span>Loading configuration...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-error mb-3">{error}</p>
        <button onClick={onRetry} className="btn-secondary text-sm">Retry</button>
      </div>
    )
  }

  if (!config) return null

  const updateField = <K extends keyof AgentConfigView>(key: K, value: AgentConfigView[K]) => {
    onConfigChange({ ...config, [key]: value })
  }

  return (
    <div className="space-y-4">
      {/* Config path */}
      <p className="text-xs text-text-tertiary font-mono truncate" title={config.configPath}>
        {config.configPath}
      </p>

      {/* Provider Category Tabs */}
      <div>
        <label className="block text-sm text-text-secondary mb-2 font-medium">Provider</label>
        <div className="flex gap-2">
          <button
            onClick={() => onConfigChange({ ...config, providerCategory: 'first_party', providerPreset: firstPartyPresets[0]?.name || '' })}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-mac text-sm font-medium transition-colors border ${
              config.providerCategory === 'first_party'
                ? 'bg-accent/10 border-accent text-accent'
                : 'border-glass-border text-text-tertiary hover:border-accent/50'
            }`}
          >
            <Shield size={14} />
            Official
          </button>
          <button
            onClick={() => onConfigChange({ ...config, providerCategory: 'third_party', providerPreset: thirdPartyPresets[0]?.name || '' })}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-mac text-sm font-medium transition-colors border ${
              config.providerCategory === 'third_party'
                ? 'bg-accent/10 border-accent text-accent'
                : 'border-glass-border text-text-tertiary hover:border-accent/50'
            }`}
          >
            <Globe size={14} />
            Third-party
          </button>
        </div>
      </div>

      {/* Provider Presets */}
      {activePresets.length > 0 && (
        <div>
          <label className="block text-sm text-text-secondary mb-2 font-medium">Provider Preset</label>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {activePresets.map(preset => (
              <button
                key={preset.name}
                onClick={() => onPresetSelect(preset)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-mac text-sm transition-colors border ${
                  config.providerPreset === preset.name
                    ? 'bg-accent/10 border-accent text-accent'
                    : 'border-glass-border text-text-secondary hover:border-accent/50'
                }`}
              >
                <span className="font-medium">{preset.name}</span>
                {preset.baseUrl && (
                  <span className="text-xs text-text-tertiary font-mono truncate ml-2 max-w-[200px]">
                    {preset.baseUrl.replace(/^https?:\/\//, '')}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Model Configuration */}
      <div className="border-t border-glass-border pt-4">
        <h4 className="text-sm font-semibold mb-3 text-text-primary">Model Configuration</h4>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-text-secondary mb-1.5 font-medium">Model</label>
            <input
              type="text"
              value={config.model || ''}
              onChange={e => updateField('model', e.target.value)}
              className="w-full input-mac font-mono"
              placeholder="claude-sonnet-4-20250514"
            />
          </div>
          {config.smallModel !== undefined && (
            <div>
              <label className="block text-sm text-text-secondary mb-1.5 font-medium">Small Model</label>
              <input
                type="text"
                value={config.smallModel || ''}
                onChange={e => updateField('smallModel', e.target.value)}
                className="w-full input-mac font-mono"
                placeholder="claude-haiku-4-5-20251001"
              />
            </div>
          )}
          <div>
            <label className="block text-sm text-text-secondary mb-1.5 font-medium">API Key</label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={config.apiKey || ''}
                onChange={e => updateField('apiKey', e.target.value)}
                className="w-full input-mac font-mono pr-10"
                placeholder="sk-..."
              />
              <button
                onClick={onToggleApiKey}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-card-hover rounded transition-colors"
                type="button"
              >
                {showApiKey ? <EyeOff size={14} className="text-text-tertiary" /> : <Eye size={14} className="text-text-tertiary" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1.5 font-medium">Base URL</label>
            <input
              type="text"
              value={config.baseUrl || ''}
              onChange={e => updateField('baseUrl', e.target.value)}
              className="w-full input-mac font-mono"
              placeholder="https://api.anthropic.com"
            />
          </div>
        </div>
      </div>

      {/* Raw JSON Editor */}
      <div className="border-t border-glass-border pt-4">
        <button
          onClick={onToggleRaw}
          className="flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
        >
          {showRaw ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          Other Configuration (raw JSON)
        </button>
        {showRaw && (
          <div className="mt-3">
            <textarea
              className={`w-full input-mac font-mono resize-none ${rawJsonError ? 'border-error' : ''}`}
              rows={8}
              value={rawJson}
              onChange={e => onRawJsonChange(e.target.value)}
              placeholder="{}"
            />
            {rawJsonError && (
              <p className="text-xs text-error mt-1">{rawJsonError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Basic Config Editor ────────────────────────────────────────────────────

interface BasicConfigEditorProps {
  form: Partial<AgentConfig>
  isEdit: boolean
  onFormChange: (form: Partial<AgentConfig>) => void
}

function BasicConfigEditor({ form, isEdit, onFormChange }: BasicConfigEditorProps) {
  return (
    <div className="space-y-4">
      {/* ID & Name */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-text-secondary mb-1.5 font-medium">Agent ID *</label>
          <input
            type="text"
            value={form.id || ''}
            onChange={e => onFormChange({ ...form, id: e.target.value })}
            disabled={isEdit}
            className="w-full input-mac disabled:opacity-50"
            placeholder="claude-code"
          />
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1.5 font-medium">Display Name *</label>
          <input
            type="text"
            value={form.name || ''}
            onChange={e => onFormChange({ ...form, name: e.target.value })}
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
          onChange={e => onFormChange({ ...form, command: e.target.value })}
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
          onChange={e => onFormChange({ ...form, args: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
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
            onFormChange({ ...form, env })
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
              onChange={e => onFormChange({
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
              onChange={e => onFormChange({
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
              onChange={e => onFormChange({
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
              onChange={e => onFormChange({
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
                    onFormChange({ ...form, swarmConfig: { ...form.swarmConfig, preferredRoles: updated } as AgentSwarmConfig })
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
          onChange={e => onFormChange({ ...form, tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
          className="w-full input-mac"
          placeholder="primary, coding, review"
        />
      </div>
    </div>
  )
}

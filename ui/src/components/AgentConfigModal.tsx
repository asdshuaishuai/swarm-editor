import { useState, useEffect, useCallback } from 'react'
import { Bot, Loader2, X, Shield, Globe, Eye, EyeOff } from 'lucide-react'
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

function generateConfigPreview(agentId: string, config: AgentConfigView): string {
  // Placeholder — will be implemented in Task 6
  return JSON.stringify({ agentId, model: config.model }, null, 2)
}

export default function AgentConfigModal({ agent, defaults, onClose, onSaved }: AgentConfigModalProps) {
  const addToast = useAppStore(state => state.addToast)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Determine mode: native if agent ID matches known agents
  const agentId = agent?.id || defaults?.id || ''
  const isNative = NATIVE_AGENTS.has(agentId)
  const mode: ConfigMode = isNative ? 'native' : 'basic'

  // Tab state
  const [activeTab, setActiveTab] = useState<'structured' | 'raw'>('structured')
  const [rawContent, setRawContent] = useState('')
  const [rawLanguage, setRawLanguage] = useState<'json' | 'toml'>('json')
  const [rawModified, setRawModified] = useState(false)
  const [rawError, setRawError] = useState<string | null>(null)
  const [configPath, setConfigPath] = useState('')

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

  // Load raw config file on mount for native agents
  useEffect(() => {
    if (!isNative) return
    api.agent.getAgentConfigFile(agentId).then(result => {
      setRawContent(result.content)
      setRawLanguage(result.language as 'json' | 'toml')
      setConfigPath(result.path)
    }).catch(err => {
      logger.error('AgentConfigModal', 'Failed to load raw config:', err)
    })
  }, [agentId, isNative])

  // Tab switch handler
  const handleTabSwitch = (tab: 'structured' | 'raw') => {
    if (tab === 'raw' && nativeConfig) {
      // Generate preview from structured config
      const preview = generateConfigPreview(agentId, nativeConfig)
      if (!rawModified) {
        setRawContent(preview)
      }
    }
    setActiveTab(tab)
  }

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
      await api.agent.updateAgentConfig(agentId, {
        providerCategory: nativeConfig.providerCategory,
        providerPreset: nativeConfig.providerPreset,
        model: nativeConfig.model,
        smallModel: nativeConfig.smallModel,
        apiKey: nativeConfig.apiKey,
        baseUrl: nativeConfig.baseUrl,
        raw: nativeConfig.raw,
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

  // Unified save handler
  const handleSave = async () => {
    if (activeTab === 'raw' && rawModified) {
      setIsSaving(true)
      setSaveError(null)
      try {
        await api.agent.updateAgentConfigFile(agentId, rawContent)
        addToast('success', '配置已保存', '原始配置文件已更新')
        onSaved({ id: agentId, name: nativeConfig?.agentName || '', command: '', enabled: true } as AgentConfig)
        onClose()
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'Save failed')
      } finally {
        setIsSaving(false)
      }
    } else if (mode === 'native') {
      await handleNativeSave()
    } else {
      await handleBasicSave()
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
      <div
        className="rounded-mac-xl p-5 w-[720px] max-h-[85vh] overflow-y-auto shadow-mac backdrop-blur-xl"
        style={{ background: '#161b22', border: '1px solid #30363d' }}
        role="dialog" aria-modal="true" aria-label="Agent configuration"
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-5">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2" style={{ color: '#d0d7de' }}>
              <Bot size={18} style={{ color: '#58a6ff' }} />
              {agent ? `Edit: ${agent.name}` : (defaults?.name ? `Configure: ${defaults.name}` : 'Add New Agent')}
            </h3>
            <p className="text-xs font-mono truncate mt-1" style={{ color: '#6e7681' }} title={configPath}>
              {configPath || nativeConfig?.configPath || ''}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-mac transition-colors" style={{ background: 'transparent' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#30363d')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={18} style={{ color: '#8b949e' }} />
          </button>
        </div>

        {/* Tab switching (only if native agent) */}
        {isNative && (
          <div className="flex border-b mb-4" style={{ borderColor: '#30363d' }}>
            <button
              onClick={() => setActiveTab('structured')}
              className="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
              style={{
                color: activeTab === 'structured' ? '#58a6ff' : '#6e7681',
                borderColor: activeTab === 'structured' ? '#58a6ff' : 'transparent',
              }}
            >
              结构化配置
            </button>
            <button
              onClick={() => handleTabSwitch('raw')}
              className="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
              style={{
                color: activeTab === 'raw' ? '#58a6ff' : '#6e7681',
                borderColor: activeTab === 'raw' ? '#58a6ff' : 'transparent',
              }}
            >
              原始配置文件
            </button>
          </div>
        )}

        {/* Structured config content */}
        {activeTab === 'structured' && mode === 'native' && (
          <NativeConfigEditor
            config={nativeConfig}
            loading={nativeLoading}
            error={nativeError}
            firstPartyPresets={firstPartyPresets}
            thirdPartyPresets={thirdPartyPresets}
            activePresets={activePresets}
            showApiKey={showApiKey}
            onConfigChange={setNativeConfig}
            onPresetSelect={handlePresetSelect}
            onToggleApiKey={() => setShowApiKey(!showApiKey)}
            onRetry={loadNativeConfig}
          />
        )}

        {/* Basic config mode */}
        {activeTab === 'structured' && mode === 'basic' && (
          <BasicConfigEditor
            form={form}
            isEdit={!!agent}
            onFormChange={setForm}
          />
        )}

        {/* Raw config content */}
        {activeTab === 'raw' && (
          <>
            <div className="h-[400px] rounded overflow-hidden" style={{ border: '1px solid #30363d' }}>
              <textarea
                className="w-full h-full p-3 font-mono text-sm resize-none"
                style={{ background: '#0d1117', color: '#d0d7de', border: 'none', outline: 'none' }}
                value={rawContent}
                onChange={e => {
                  setRawContent(e.target.value)
                  setRawModified(true)
                  if (rawLanguage === 'json') {
                    try {
                      JSON.parse(e.target.value)
                      setRawError(null)
                    } catch (err) {
                      setRawError(err instanceof Error ? err.message : 'Invalid JSON')
                    }
                  }
                }}
                spellCheck={false}
              />
            </div>
            {/* Validation status */}
            <div className="flex items-center gap-2 mt-2 text-xs">
              {rawError ? (
                <span style={{ color: '#f85149' }}>✗ {rawError}</span>
              ) : rawContent ? (
                <span style={{ color: '#3fb950' }}>✓ Valid {rawLanguage.toUpperCase()}</span>
              ) : null}
            </div>
          </>
        )}

        {/* Error */}
        {saveError && (
          <div
            role="alert"
            className="mt-4 p-3 rounded-mac text-sm"
            style={{ background: 'rgba(248, 81, 73, 0.1)', border: '1px solid rgba(248, 81, 73, 0.3)', color: '#f85149' }}
          >
            {saveError}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t" style={{ borderColor: '#30363d' }}>
          <button onClick={onClose} className="btn-secondary" disabled={isSaving}>Cancel</button>
          <button
            onClick={handleSave}
            className="btn-primary"
            disabled={isSaving || (mode === 'native' && !nativeConfig && activeTab === 'structured')}
          >
            {isSaving ? (
              <><Loader2 size={16} className="animate-spin" /><span>Saving...</span></>
            ) : (
              <span>{activeTab === 'raw' ? 'Save File' : (mode === 'native' ? 'Save & Sync' : (agent ? 'Save Changes' : 'Add Agent'))}</span>
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
  onConfigChange: (config: AgentConfigView) => void
  onPresetSelect: (preset: ProviderPreset) => void
  onToggleApiKey: () => void
  onRetry: () => void
}

function NativeConfigEditor({
  config, loading, error, firstPartyPresets, thirdPartyPresets, activePresets,
  showApiKey,
  onConfigChange, onPresetSelect, onToggleApiKey, onRetry,
}: NativeConfigEditorProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" style={{ color: '#6e7681' }}>
        <Loader2 size={20} className="animate-spin mr-2" />
        <span>Loading configuration...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-sm mb-3" style={{ color: '#f85149' }}>{error}</p>
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
      {/* Provider Category Tabs */}
      <div>
        <label className="block text-sm mb-2 font-medium" style={{ color: '#8b949e' }}>Provider</label>
        <div className="flex gap-2">
          <button
            onClick={() => onConfigChange({ ...config, providerCategory: 'first_party', providerPreset: firstPartyPresets[0]?.name || '' })}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-mac text-sm font-medium transition-colors"
            style={{
              border: config.providerCategory === 'first_party' ? '1px solid #58a6ff' : '1px solid #30363d',
              background: config.providerCategory === 'first_party' ? 'rgba(88, 166, 255, 0.1)' : 'transparent',
              color: config.providerCategory === 'first_party' ? '#58a6ff' : '#6e7681',
            }}
          >
            <Shield size={14} />
            Official
          </button>
          <button
            onClick={() => onConfigChange({ ...config, providerCategory: 'third_party', providerPreset: thirdPartyPresets[0]?.name || '' })}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-mac text-sm font-medium transition-colors"
            style={{
              border: config.providerCategory === 'third_party' ? '1px solid #58a6ff' : '1px solid #30363d',
              background: config.providerCategory === 'third_party' ? 'rgba(88, 166, 255, 0.1)' : 'transparent',
              color: config.providerCategory === 'third_party' ? '#58a6ff' : '#6e7681',
            }}
          >
            <Globe size={14} />
            Third-party
          </button>
        </div>
      </div>

      {/* Provider Presets */}
      {activePresets.length > 0 && (
        <div>
          <label className="block text-sm mb-2 font-medium" style={{ color: '#8b949e' }}>Provider Preset</label>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {activePresets.map(preset => (
              <button
                key={preset.name}
                onClick={() => onPresetSelect(preset)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-mac text-sm transition-colors"
                style={{
                  border: config.providerPreset === preset.name ? '1px solid #58a6ff' : '1px solid #30363d',
                  background: config.providerPreset === preset.name ? 'rgba(88, 166, 255, 0.1)' : 'transparent',
                  color: config.providerPreset === preset.name ? '#58a6ff' : '#8b949e',
                }}
              >
                <span className="font-medium">{preset.name}</span>
                {preset.baseUrl && (
                  <span className="text-xs font-mono truncate ml-2 max-w-[200px]" style={{ color: '#6e7681' }}>
                    {preset.baseUrl.replace(/^https?:\/\//, '')}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Model Configuration */}
      <div className="border-t pt-4" style={{ borderColor: '#30363d' }}>
        <h4 className="text-sm font-semibold mb-3" style={{ color: '#d0d7de' }}>Model Configuration</h4>
        <div className="space-y-3">
          <div>
            <label className="block text-sm mb-1.5 font-medium" style={{ color: '#8b949e' }}>Model</label>
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
              <label className="block text-sm mb-1.5 font-medium" style={{ color: '#8b949e' }}>Small Model</label>
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
            <label className="block text-sm mb-1.5 font-medium" style={{ color: '#8b949e' }}>API Key</label>
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
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded transition-colors"
                style={{ background: 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#30363d')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                type="button"
              >
                {showApiKey ? <EyeOff size={14} style={{ color: '#6e7681' }} /> : <Eye size={14} style={{ color: '#6e7681' }} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm mb-1.5 font-medium" style={{ color: '#8b949e' }}>Base URL</label>
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
          <label className="block text-sm mb-1.5 font-medium" style={{ color: '#8b949e' }}>Agent ID *</label>
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
          <label className="block text-sm mb-1.5 font-medium" style={{ color: '#8b949e' }}>Display Name *</label>
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
        <label className="block text-sm mb-1.5 font-medium" style={{ color: '#8b949e' }}>Command Path *</label>
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
        <label className="block text-sm mb-1.5 font-medium" style={{ color: '#8b949e' }}>Arguments (comma-separated)</label>
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
        <label className="block text-sm mb-1.5 font-medium" style={{ color: '#8b949e' }}>Environment Variables</label>
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
      <div className="border-t pt-4" style={{ borderColor: '#30363d' }}>
        <h4 className="text-sm font-semibold mb-3" style={{ color: '#d0d7de' }}>Swarm Configuration</h4>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex items-center gap-2.5 p-2.5 rounded-mac cursor-pointer transition-colors" style={{ background: '#21262d' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#30363d')}
            onMouseLeave={e => (e.currentTarget.style.background = '#21262d')}
          >
            <input
              type="checkbox"
              checked={form.swarmConfig?.canBeCoordinator ?? true}
              onChange={e => onFormChange({
                ...form,
                swarmConfig: { ...form.swarmConfig, canBeCoordinator: e.target.checked } as AgentSwarmConfig
              })}
              className="accent-accent"
            />
            <span className="text-sm" style={{ color: '#d0d7de' }}>Can be Coordinator</span>
          </label>
          <label className="flex items-center gap-2.5 p-2.5 rounded-mac cursor-pointer transition-colors" style={{ background: '#21262d' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#30363d')}
            onMouseLeave={e => (e.currentTarget.style.background = '#21262d')}
          >
            <input
              type="checkbox"
              checked={form.swarmConfig?.canBeWorker ?? true}
              onChange={e => onFormChange({
                ...form,
                swarmConfig: { ...form.swarmConfig, canBeWorker: e.target.checked } as AgentSwarmConfig
              })}
              className="accent-accent"
            />
            <span className="text-sm" style={{ color: '#d0d7de' }}>Can be Worker</span>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-3">
          <div>
            <label className="block text-sm mb-1.5 font-medium" style={{ color: '#8b949e' }}>Max Concurrent Tasks</label>
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
            <label className="block text-sm mb-1.5 font-medium" style={{ color: '#8b949e' }}>Priority (1-10)</label>
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
          <label className="block text-sm mb-1.5 font-medium" style={{ color: '#8b949e' }}>Preferred Roles</label>
          <div className="flex flex-wrap gap-2">
            {['coder', 'reviewer', 'tester', 'architect'].map(role => (
              <label
                key={role}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-mac text-sm cursor-pointer transition-colors"
                style={{ border: '1px solid #30363d' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(88, 166, 255, 0.5)'; e.currentTarget.style.background = '#30363d' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.background = 'transparent' }}
              >
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
                <span className="capitalize" style={{ color: '#d0d7de' }}>{role}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Tags */}
      <div>
        <label className="block text-sm mb-1.5 font-medium" style={{ color: '#8b949e' }}>Tags (comma-separated)</label>
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

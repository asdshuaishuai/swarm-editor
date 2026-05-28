import { useState, useCallback } from 'react'
import {
  Radar,
  RefreshCw,
  Plus,
  Check,
  Wifi,
  WifiOff,
  Clock,
  Cpu,
  Activity,
  Plug,
  Wrench,
  Settings,
} from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { useMonitoringStore } from '../stores/monitoringStore'
import { useSettings } from '../hooks/useSettings'
import { api, type MCPServerInfo } from '../services'
import { logger } from '../utils'
import AgentConfigModal from '../components/AgentConfigModal'
import type { AgentConfig } from '../types'

interface DiscoveredAgent {
  id: string
  name: string
  type: string
  endpoint: string
  capabilities: string[]
  lastSeen: string
  status: 'available' | 'unreachable' | 'busy'
  latency?: number
}

type ScanTab = 'agents' | 'mcp' | 'skills'

export default function AgentScannerPanel() {
  const agents = useAppStore(state => state.agents)
  const addToast = useAppStore(state => state.addToast)
  const { settings, updateSetting } = useSettings()
  const [activeTab, setActiveTab] = useState<ScanTab>('agents')
  const [configTarget, setConfigTarget] = useState<{ agent?: AgentConfig; defaults?: Partial<AgentConfig> } | null>(null)

  // 从 monitoringStore 获取扫描结果（由后端周期性扫描自动更新）
  const scannedServers = useMonitoringStore(state => state.mcpServers)
  const skills = useMonitoringStore(state => state.skills)
  const refreshMCPServers = useMonitoringStore(state => state.refreshMCPServers)
  const refreshSkills = useMonitoringStore(state => state.refreshSkills)

  // Use settings for auto-scan configuration
  const autoScan = settings.agentAutoScan

  // 转换 agents 为 DiscoveredAgent 格式
  const discoveredAgents: DiscoveredAgent[] = agents.map(agent => {
    const agentAny = agent as any
    return {
      id: agent.id,
      name: agent.name,
      type: agent.type || 'unknown',
      endpoint: agentAny.command || '',
      capabilities: Array.isArray(agentAny.capabilities)
        ? agentAny.capabilities
        : agent.capabilities ? Object.entries(agent.capabilities)
          .filter(([_, v]) => v === true)
          .map(([k]) => k) : [],
      lastSeen: agent.lastActive || new Date().toISOString(),
      status: (agent.status === 'error' || agent.state === 'error') ? 'unreachable' : 'available',
    }
  })

  // 手动刷新所有数据
  const handleRefresh = useCallback(async () => {
    try {
      await Promise.all([
        useAppStore.getState().loadAgents(),
        refreshMCPServers(),
        refreshSkills(),
      ])
      addToast('success', '刷新完成', '数据已更新')
    } catch (err) {
      logger.error('AgentScanner', 'Refresh failed:', err)
      addToast('error', '刷新失败', err instanceof Error ? err.message : 'Unknown error')
    }
  }, [addToast, refreshMCPServers, refreshSkills])

  // Connect to agent
  const handleConnect = async (agent: DiscoveredAgent) => {
    try {
      logger.info('AgentScanner', `Connecting to agent: ${agent.name}`)
      await api.agent.startAgent(agent.id)
      addToast('success', 'Agent Connected', `Successfully connected to ${agent.name}`)
      useAppStore.getState().loadAgents()
    } catch (err) {
      logger.error('AgentScanner', 'Connection failed:', err)
      addToast('error', 'Connection Failed', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  // Add MCP server
  const handleAddMCP = async (server: MCPServerInfo) => {
    if (!server.command) return
    try {
      await api.mcp.addServer({ name: server.name, command: server.command, args: server.args })
      addToast('success', 'MCP Added', `Added ${server.name}`)
    } catch (err) {
      addToast('error', 'Add failed', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const getStatusIcon = (status: DiscoveredAgent['status']) => {
    switch (status) {
      case 'available': return <Wifi size={14} className="text-success" />
      case 'unreachable': return <WifiOff size={14} className="text-error" />
      case 'busy': return <Activity size={14} className="text-warning" />
    }
  }

  const tabs: { id: ScanTab; label: string; icon: typeof Radar; count: number }[] = [
    { id: 'agents', label: 'Agents', icon: Cpu, count: discoveredAgents.length },
    { id: 'mcp', label: 'MCP Servers', icon: Plug, count: scannedServers.length },
    { id: 'skills', label: 'Skills', icon: Wrench, count: skills.length },
  ]

  return (
    <div className="flex flex-col h-full p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-accent/10 rounded-mac">
            <Radar size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Scanner</h2>
            <p className="text-xs text-text-secondary">Discover agents, MCP servers & skills</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary flex items-center gap-1">
            <Clock size={12} />
            自动刷新中
          </span>
          <button
            onClick={handleRefresh}
            className="btn-secondary"
          >
            <RefreshCw size={16} />
            <span>刷新</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-glass-border mb-4">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'text-accent border-accent'
                  : 'text-text-tertiary border-transparent hover:text-text-secondary'
              }`}
            >
              <Icon size={14} />
              {tab.label}
              {tab.count > 0 && (
                <span className="px-1.5 py-0.5 bg-glass rounded-full text-[10px]">{tab.count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Auto-scan settings */}
      <div className="mb-4 p-3 bg-glass/30 rounded-mac flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-text-primary">Auto-scan</span>
          <button
            role="switch"
            aria-checked={autoScan}
            onClick={() => updateSetting('agentAutoScan', !autoScan)}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
              autoScan ? 'bg-accent' : 'bg-glass border border-glass-border'
            }`}
          >
            <div
              className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200"
              style={{ transform: autoScan ? 'translateX(22px)' : 'translateX(2px)' }}
            />
          </button>
        </div>
        {autoScan && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary">后端自动扫描 (30s)</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Agents Tab */}
        {activeTab === 'agents' && (
          discoveredAgents.length === 0 ? (
            <EmptyState icon={<Radar size={48} className="opacity-50" />} title="No agents discovered" subtitle="Click scan to search for available agents" />
          ) : (
            <div className="space-y-3">
              {discoveredAgents.map((agent) => {
                const isConnected = agents.some(a => a.id === agent.id && a.state !== 'error')
                return (
                  <div key={agent.id} className="p-4 rounded-mac-xl bg-glass border border-glass-border hover:border-accent/50 transition-all duration-200">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 bg-accent/10 rounded-mac"><Cpu size={16} className="text-accent" /></div>
                        <div>
                          <h4 className="font-medium text-text-primary">{agent.name}</h4>
                          <p className="text-xs text-text-tertiary font-mono">{agent.endpoint}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(agent.status)}
                        <span className="text-xs text-text-secondary capitalize">{agent.status}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-3">
                      {(agent.capabilities || []).slice(0, 4).map((cap) => (
                        <span key={`${agent.id}-${cap}`} className="px-2 py-0.5 bg-glass/50 rounded-mac text-xs text-text-secondary">{cap}</span>
                      ))}
                      {(agent.capabilities || []).length > 4 && (
                        <span className="px-2 py-0.5 bg-glass/50 rounded-mac text-xs text-text-tertiary">+{(agent.capabilities || []).length - 4} more</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {isConnected ? (
                        <button disabled className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-success/10 rounded-mac text-xs font-medium text-success cursor-default">
                          <Check size={12} /><span>Connected</span>
                        </button>
                      ) : (
                        <button onClick={() => handleConnect(agent)} disabled={agent.status === 'unreachable'} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-accent hover:bg-accent-hover rounded-mac text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                          <Plus size={12} /><span>Connect</span>
                        </button>
                      )}
                      <button
                        onClick={() => setConfigTarget({
                          defaults: { id: agent.id, name: agent.name, command: agent.endpoint, args: ['acp'] }
                        })}
                        className="p-2 hover:bg-card-hover rounded-mac transition-colors"
                        title="Configure"
                        aria-label="Configure agent"
                      >
                        <Settings size={14} className="text-text-secondary" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}

        {/* MCP Tab */}
        {activeTab === 'mcp' && (
          scannedServers.length === 0 ? (
            <EmptyState icon={<Plug size={48} className="opacity-50" />} title="No MCP servers discovered" subtitle="MCP servers are found from agent config files" />
          ) : (
            <div className="space-y-3">
              {scannedServers.map((server) => (
                <div key={server.id} className="p-4 rounded-mac-xl bg-glass border border-glass-border hover:border-accent/50 transition-all duration-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-accent/10 rounded-mac"><Plug size={16} className="text-accent" /></div>
                      <div>
                        <h4 className="font-medium text-text-primary">{server.name}</h4>
                        <p className="text-xs text-text-tertiary font-mono">{server.command}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs px-2 py-0.5 bg-glass/50 rounded-mac text-text-secondary">{server.status}</span>
                      {server.source && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-accent/10 rounded-mac text-accent">{server.source}</span>
                      )}
                    </div>
                  </div>
                  {server.args && server.args.length > 0 && (
                    <p className="text-xs text-text-tertiary mb-2 ml-8">Args: {server.args.join(' ')}</p>
                  )}
                  <button onClick={() => handleAddMCP(server)} className="w-full flex items-center justify-center gap-1.5 py-2 bg-accent hover:bg-accent-hover rounded-mac text-xs font-medium transition-colors">
                    <Plus size={12} /><span>Add to Config</span>
                  </button>
                </div>
              ))}
            </div>
          )
        )}

        {/* Skills Tab */}
        {activeTab === 'skills' && (
          skills.length === 0 ? (
            <EmptyState icon={<Wrench size={48} className="opacity-50" />} title="No skills discovered" subtitle="Skills come from ~/.claude/skills/ and agent capabilities" />
          ) : (
            <div className="space-y-3">
              {skills.map((skill) => (
                <div key={skill.id} className="p-4 rounded-mac-xl bg-glass border border-glass-border hover:border-accent/50 transition-all duration-200">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="p-1.5 bg-accent/10 rounded-mac"><Wrench size={16} className="text-accent" /></div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-text-primary">{skill.name}</h4>
                      {skill.description && <p className="text-xs text-text-tertiary truncate">{skill.description}</p>}
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 bg-glass/50 rounded-mac text-text-tertiary capitalize">{skill.source}</span>
                  </div>
                  {skill.tags && skill.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 ml-8">
                      {skill.tags.map((tag) => (
                        <span key={tag} className="px-1.5 py-0.5 bg-glass/30 rounded-mac text-[10px] text-text-tertiary">{tag}</span>
                      ))}
                    </div>
                  )}
                  {skill.agentId && <p className="text-[10px] text-text-tertiary ml-8 mt-1">Agent: {skill.agentId}</p>}
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Agent Config Modal */}
      {configTarget && (
        <AgentConfigModal
          agent={configTarget.agent}
          defaults={configTarget.defaults}
          onClose={() => setConfigTarget(null)}
          onSaved={() => {
            setConfigTarget(null)
            handleRefresh()
          }}
        />
      )}
    </div>
  )
}

function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-text-tertiary">
      <div className="p-4 bg-glass rounded-mac-xl mb-4">{icon}</div>
      <p className="text-base font-medium text-text-secondary mb-1">{title}</p>
      <p className="text-sm">{subtitle}</p>
    </div>
  )
}

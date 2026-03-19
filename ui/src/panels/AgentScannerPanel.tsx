import { useState, useEffect, useCallback } from 'react'
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
} from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { useSettings } from '../hooks/useSettings'
import { api } from '../services'
import { logger } from '../utils'

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

export default function AgentScannerPanel() {
  const agents = useAppStore(state => state.agents)
  const addToast = useAppStore(state => state.addToast)
  const { settings, updateSetting } = useSettings()
  const [discoveredAgents, setDiscoveredAgents] = useState<DiscoveredAgent[]>([])
  const [scanning, setScanning] = useState(false)
  const [lastScan, setLastScan] = useState<Date | null>(null)

  // Use settings for auto-scan configuration
  const autoScan = settings.agentAutoScan
  const scanInterval = settings.agentScanInterval / 1000 // Convert ms to seconds

  // Scan for available agents
  const scanAgents = useCallback(async () => {
    setScanning(true)
    try {
      logger.info('AgentScanner', 'Starting agent scan...')
      
      // In Tauri environment, call backend to scan
      if (api.isTauriEnv()) {
        const result = await api.agent.refreshAgents()
        const discovered: DiscoveredAgent[] = result.map(agent => ({
          id: agent.id,
          name: agent.name,
          type: agent.type,
          endpoint: agent.command,
          capabilities: agent.capabilities,
          lastSeen: agent.lastActive || new Date().toISOString(),
          status: agent.status === 'running' ? 'available' : 'unreachable',
        }))
        setDiscoveredAgents(discovered)
      } else {
        // Mock discovery for development
        const mockDiscovered: DiscoveredAgent[] = [
          {
            id: 'claude-code-local',
            name: 'Claude Code (Local)',
            type: 'coder',
            endpoint: 'claude',
            capabilities: ['role:coder', 'role:architect', 'coordinator', 'worker'],
            lastSeen: new Date().toISOString(),
            status: 'available',
            latency: 45,
          },
          {
            id: 'copilot-local',
            name: 'GitHub Copilot (Local)',
            type: 'coder',
            endpoint: 'copilot',
            capabilities: ['role:coder', 'worker'],
            lastSeen: new Date().toISOString(),
            status: 'available',
            latency: 32,
          },
          {
            id: 'cursor-remote',
            name: 'Cursor AI (Remote)',
            type: 'architect',
            endpoint: 'ws://localhost:8765',
            capabilities: ['role:architect', 'role:reviewer', 'coordinator'],
            lastSeen: new Date(Date.now() - 60000).toISOString(),
            status: 'unreachable',
          },
        ]
        setDiscoveredAgents(mockDiscovered)
        setLastScan(new Date())
        addToast('success', 'Scan Complete', `Found ${mockDiscovered.length} agents`)
      }
    } catch (err) {
      logger.error('AgentScanner', 'Scan failed:', err)
      addToast('error', 'Scan Failed', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setScanning(false)
    }
  }, [addToast])

  // Auto-scan on interval
  useEffect(() => {
    if (!autoScan) return

    const interval = setInterval(scanAgents, scanInterval * 1000)
    return () => clearInterval(interval)
  }, [autoScan, scanInterval, scanAgents])

  // Initial scan - only run once on mount
  useEffect(() => {
    scanAgents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Connect to agent
  const handleConnect = async (agent: DiscoveredAgent) => {
    try {
      logger.info('AgentScanner', `Connecting to agent: ${agent.name}`)
      
      if (api.isTauriEnv()) {
        await api.agent.startAgent(agent.id)
      }
      
      addToast('success', 'Agent Connected', `Successfully connected to ${agent.name}`)
      // Refresh the list
      scanAgents()
    } catch (err) {
      logger.error('AgentScanner', 'Connection failed:', err)
      addToast('error', 'Connection Failed', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  // Add agent manually
  const handleAddManual = () => {
    // This would open a modal to add agent configuration
    addToast('info', 'Add Agent', 'Use Agent Config panel to add new agents')
  }

  const getStatusIcon = (status: DiscoveredAgent['status']) => {
    switch (status) {
      case 'available': return <Wifi size={14} className="text-success" />
      case 'unreachable': return <WifiOff size={14} className="text-error" />
      case 'busy': return <Activity size={14} className="text-warning" />
    }
  }

  return (
    <div className="flex flex-col h-full p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-accent/10 rounded-mac">
            <Radar size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Agent Scanner</h2>
            <p className="text-xs text-text-secondary">Discover and connect agents</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastScan && (
            <span className="text-xs text-text-tertiary flex items-center gap-1">
              <Clock size={12} />
              Last scan: {lastScan.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={scanAgents}
            disabled={scanning}
            className="btn-secondary"
          >
            <RefreshCw size={16} className={scanning ? 'animate-spin' : ''} />
            <span>{scanning ? 'Scanning...' : 'Scan'}</span>
          </button>
        </div>
      </div>

      {/* Auto-scan settings */}
      <div className="mb-4 p-3 bg-glass/30 rounded-mac flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-text-primary">Auto-scan</span>
          <button
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
            <span className="text-xs text-text-secondary">Every</span>
            <select
              value={scanInterval}
              onChange={(e) => updateSetting('agentScanInterval', parseInt(e.target.value) * 1000)}
              className="input-mac text-xs py-1"
            >
              <option value={10}>10s</option>
              <option value={30}>30s</option>
              <option value={60}>1m</option>
              <option value={300}>5m</option>
            </select>
          </div>
        )}
      </div>

      {/* Discovered Agents List */}
      <div className="flex-1 overflow-y-auto">
        {discoveredAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-text-tertiary">
            <div className="p-4 bg-glass rounded-mac-xl mb-4">
              <Radar size={48} className="opacity-50" />
            </div>
            <p className="text-base font-medium text-text-secondary mb-1">No agents discovered</p>
            <p className="text-sm">Click scan to search for available agents</p>
          </div>
        ) : (
          <div className="space-y-3">
            {discoveredAgents.map((agent) => {
              const isConnected = agents.some(a => a.id === agent.id && a.state !== 'error')
              
              return (
                <div
                  key={agent.id}
                  className="p-4 rounded-mac-xl bg-glass border border-glass-border hover:border-accent/50 transition-all duration-200"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-accent/10 rounded-mac">
                        <Cpu size={16} className="text-accent" />
                      </div>
                      <div>
                        <h4 className="font-medium text-text-primary">{agent.name}</h4>
                        <p className="text-xs text-text-tertiary font-mono">{agent.endpoint}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(agent.status)}
                      <span className="text-xs text-text-secondary capitalize">{agent.status}</span>
                      {agent.latency && (
                        <span className="text-xs text-text-tertiary">{agent.latency}ms</span>
                      )}
                    </div>
                  </div>

                  {/* Capabilities */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {agent.capabilities.slice(0, 4).map((cap, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 bg-glass/50 rounded-mac text-xs text-text-secondary"
                      >
                        {cap}
                      </span>
                    ))}
                    {agent.capabilities.length > 4 && (
                      <span className="px-2 py-0.5 bg-glass/50 rounded-mac text-xs text-text-tertiary">
                        +{agent.capabilities.length - 4} more
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {isConnected ? (
                      <button
                        disabled
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-success/10 rounded-mac text-xs font-medium text-success cursor-default"
                      >
                        <Check size={12} />
                        <span>Connected</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleConnect(agent)}
                        disabled={agent.status === 'unreachable'}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-accent hover:bg-accent-hover rounded-mac text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Plus size={12} />
                        <span>Connect</span>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Manual Add Button */}
      <div className="mt-4 pt-4 border-t border-glass-border">
        <button
          onClick={handleAddManual}
          className="w-full btn-secondary"
        >
          <Plus size={16} />
          <span>Add Agent Manually</span>
        </button>
      </div>
    </div>
  )
}

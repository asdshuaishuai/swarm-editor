import { useAppStore } from '../store/appStore'
import { Wifi, WifiOff, Loader2 } from 'lucide-react'

export default function StatusBar() {
  const { connected, connecting, agents, activeSwarm, activeTeam } = useAppStore()

  return (
    <div className="flex items-center justify-between px-4 py-1 bg-panel-bg border-t border-panel-border text-xs text-text-secondary">
      {/* Left Section */}
      <div className="flex items-center space-x-4">
        {/* Connection Status */}
        <div className="flex items-center space-x-1">
          {connecting ? (
            <Loader2 size={12} className="animate-spin text-warning" />
          ) : connected ? (
            <Wifi size={12} className="text-success" />
          ) : (
            <WifiOff size={12} className="text-error" />
          )}
          <span>{connecting ? 'Connecting...' : connected ? 'Connected' : 'Disconnected'}</span>
        </div>

        {/* Active Session */}
        {activeSwarm && (
          <div className="flex items-center space-x-1">
            <span className="text-info">Swarm:</span>
            <span>{activeSwarm.name}</span>
          </div>
        )}

        {activeTeam && (
          <div className="flex items-center space-x-1">
            <span className="text-info">Team:</span>
            <span>{activeTeam.name}</span>
          </div>
        )}
      </div>

      {/* Right Section */}
      <div className="flex items-center space-x-4">
        {/* Agent Count */}
        <div className="flex items-center space-x-1">
          <span>Agents: {agents.length}</span>
        </div>

        {/* Version */}
        <div>v0.1.0</div>
      </div>
    </div>
  )
}
import { useAppStore } from '../store/appStore'
import { Wifi, WifiOff, Loader2, Zap } from 'lucide-react'

export default function StatusBar() {
  const connected = useAppStore(state => state.connected)
  const connecting = useAppStore(state => state.connecting)
  const agents = useAppStore(state => state.agents)
  const activeSwarm = useAppStore(state => state.activeSwarm)
  const activeTeam = useAppStore(state => state.activeTeam)

  return (
    <div className="flex items-center justify-between px-4 py-1.5 bg-mac-bg border-t border-glass-border text-xs">
      {/* Left Section */}
      <div className="flex items-center gap-4">
        {/* Connection Status */}
        <div className="flex items-center gap-1.5">
          {connecting ? (
            <Loader2 size={12} className="animate-spin text-warning" />
          ) : connected ? (
            <Wifi size={12} className="text-success" />
          ) : (
            <WifiOff size={12} className="text-error" />
          )}
          <span className="text-text-secondary">
            {connecting ? 'Connecting...' : connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        {/* Active Context */}
        {activeSwarm && (
          <div className="flex items-center gap-1.5">
            <Zap size={10} className="text-accent" />
            <span className="text-text-secondary">
              <span className="text-accent font-medium">{activeSwarm.name}</span>
            </span>
          </div>
        )}

        {activeTeam && !activeSwarm && (
          <div className="flex items-center gap-1.5">
            <span className="text-text-secondary">
              Team: <span className="text-text-primary">{activeTeam.name}</span>
            </span>
          </div>
        )}
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-text-secondary">
          <span>{agents.length} agents</span>
        </div>
        <div className="text-text-tertiary">
          v0.1.0
        </div>
      </div>
    </div>
  )
}

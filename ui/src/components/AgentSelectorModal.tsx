import { X, Zap } from 'lucide-react'

interface SwarmInfo {
  id: string
  name: string
  agents: any[]
  topology: string
}

interface AgentSelectorModalProps {
  swarms: SwarmInfo[]
  onSelect: (swarmId?: string) => void
  onClose: () => void
}

export function AgentSelectorModal({ swarms, onSelect, onClose }: AgentSelectorModalProps) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-panel-bg border border-glass-border rounded-mac-xl p-4 w-96 max-w-md shadow-mac" role="dialog" aria-modal="true" aria-label="Select Execution Mode">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Zap size={18} className="text-accent" />
            Select Execution Mode
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-card-hover rounded-mac transition-colors"
            aria-label="Close modal"
          >
            <X size={18} className="text-text-secondary" />
          </button>
        </div>

        <div className="space-y-2 mb-4">
          {swarms.length > 0 ? (
            swarms.map((swarm) => (
              <button
                key={swarm.id}
                onClick={() => onSelect(swarm.id)}
                className="w-full text-left px-4 py-3 rounded-mac hover:bg-card-hover transition-colors group"
              >
                <div className="font-medium text-text-primary">{swarm.name}</div>
                <div className="text-xs text-text-secondary mt-0.5">
                  {swarm.agents.length} agents • {swarm.topology}
                </div>
              </button>
            ))
          ) : (
            <div className="text-sm text-text-tertiary py-2">
              No swarms available. Create one in the Swarm panel.
            </div>
          )}
        </div>

        <div className="border-t border-glass-border pt-3">
          <button
            onClick={() => onSelect(undefined)}
            className="w-full text-left px-4 py-3 rounded-mac hover:bg-card-hover transition-colors"
          >
            <div className="font-medium text-text-primary">Execute Directly</div>
            <div className="text-xs text-text-secondary mt-0.5">
              Run without agent coordination
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}

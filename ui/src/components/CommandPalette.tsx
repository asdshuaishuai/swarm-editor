import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  FileCode,
  Users,
  Network,
  Settings,
  Plus,
  Play,
  Pause,
  Square,
  Command,
} from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { api } from '../services'
import type { SwarmInfo } from '../services'
import type { Swarm } from '../types'

interface CommandAction {
  id: string
  label: string
  description?: string
  icon: React.ReactNode
  shortcut?: string
  action: () => void
  category: 'navigation' | 'agent' | 'swarm' | 'settings'
}

function swarmInfoToSwarm(info: SwarmInfo): Swarm {
  const agents = useAppStore.getState().agents
  return {
    id: info.id,
    name: info.name,
    topology: info.topology as Swarm['topology'],
    strategy: info.strategy as Swarm['strategy'],
    state: (info.state || info.status) as Swarm['state'],
    agents: agents.filter(a => (info.agents || []).includes(a.id)),
    stats: {
      agentCount: info.stats?.agentCount ?? info.agentCount,
      idleAgents: info.stats?.idleAgents ?? 0,
      executingAgents: info.stats?.executingAgents ?? 0,
      pendingTasks: info.stats?.pendingTasks ?? info.taskCount,
      completedTasks: info.stats?.completedTasks ?? 0,
      topology: info.topology,
      strategy: info.strategy,
      state: info.state || info.status || 'idle',
    },
  }
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const prevFilteredLengthRef = useRef(0)
  const navigate = useNavigate()

  const agents = useAppStore(state => state.agents)
  const activeSwarm = useAppStore(state => state.activeSwarm)
  const setActiveSwarm = useAppStore(state => state.setActiveSwarm)
  const startAgent = useAppStore(state => state.startAgent)
  const stopAgent = useAppStore(state => state.stopAgent)
  const addToast = useAppStore(state => state.addToast)

  // Generate commands dynamically
  const commands = useMemo<CommandAction[]>(() => {
    const cmds: CommandAction[] = [
      // Navigation
      {
        id: 'nav-editor',
        label: 'Go to Editor',
        description: 'Open the code editor',
        icon: <FileCode size={18} />,
        action: () => navigate('/'),
        category: 'navigation',
      },
      {
        id: 'nav-swarm',
        label: 'Go to Swarm',
        description: 'Open swarm management',
        icon: <Network size={18} />,
        action: () => navigate('/swarm'),
        category: 'navigation',
      },
      {
        id: 'nav-team',
        label: 'Go to Team',
        description: 'Open team management',
        icon: <Users size={18} />,
        action: () => navigate('/team'),
        category: 'navigation',
      },
      {
        id: 'nav-settings',
        label: 'Go to Settings',
        description: 'Open application settings',
        icon: <Settings size={18} />,
        action: () => navigate('/settings'),
        category: 'navigation',
      },
      // Swarm commands
      {
        id: 'swarm-create',
        label: 'Create New Swarm',
        description: 'Create a new agent swarm',
        icon: <Plus size={18} />,
        action: () => {
          navigate('/swarm')
          // Trigger create swarm modal
        },
        category: 'swarm',
      },
      {
        id: 'swarm-start',
        label: 'Start Active Swarm',
        description: activeSwarm ? `Start ${activeSwarm.name}` : 'No active swarm',
        icon: <Play size={18} />,
        action: async () => {
          if (!activeSwarm) {
            addToast('error', 'No active swarm', 'Start a swarm first')
            return
          }
          try {
            const info = await api.swarm.startSwarm(activeSwarm.id)
            setActiveSwarm(swarmInfoToSwarm(info))
            addToast('success', 'Swarm started', activeSwarm.name)
          } catch (err) {
            addToast('error', 'Failed to start swarm', err instanceof Error ? err.message : 'Unknown error')
          }
        },
        category: 'swarm',
      },
      {
        id: 'swarm-stop',
        label: 'Stop Active Swarm',
        description: activeSwarm ? `Stop ${activeSwarm.name}` : 'No active swarm',
        icon: <Square size={18} />,
        action: async () => {
          if (!activeSwarm) {
            addToast('error', 'No active swarm', 'Stop a swarm first')
            return
          }
          try {
            const info = await api.swarm.stopSwarm(activeSwarm.id)
            setActiveSwarm(swarmInfoToSwarm(info))
            addToast('success', 'Swarm stopped', activeSwarm.name)
          } catch (err) {
            addToast('error', 'Failed to stop swarm', err instanceof Error ? err.message : 'Unknown error')
          }
        },
        category: 'swarm',
      },
    ]

    // Add agent commands
    agents.forEach((agent) => {
      const isRunning = agent.state === 'executing' || agent.state === 'thinking'
      cmds.push({
        id: `agent-${agent.id}-${isRunning ? 'stop' : 'start'}`,
        label: `${isRunning ? 'Stop' : 'Start'} Agent: ${agent.name}`,
        description: `${isRunning ? 'Stop' : 'Start'} ${agent.type} agent`,
        icon: isRunning ? <Pause size={18} /> : <Play size={18} />,
        action: () => {
          if (isRunning) {
            stopAgent(agent.id)
          } else {
            startAgent(agent.id)
          }
        },
        category: 'agent',
      })
    })

    return cmds
  }, [navigate, agents, activeSwarm, setActiveSwarm, startAgent, stopAgent, addToast])

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!query) return commands
    const lowerQuery = query.toLowerCase()
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(lowerQuery) ||
        cmd.description?.toLowerCase().includes(lowerQuery)
    )
  }, [commands, query])

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Toggle command palette
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault()
        setIsOpen((prev) => !prev)
        return
      }

      if (!isOpen) return

      // Navigate results
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) =>
          prev < filteredCommands.length - 1 ? prev + 1 : 0
        )
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredCommands.length - 1
        )
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const selected = filteredCommands[selectedIndex]
        if (selected) {
          selected.action()
          setIsOpen(false)
          setQuery('')
        }
      } else if (e.key === 'Escape') {
        setIsOpen(false)
        setQuery('')
      }
    },
    [isOpen, filteredCommands, selectedIndex]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Reset selection when filtered results change
  useEffect(() => {
    if (prevFilteredLengthRef.current !== filteredCommands.length) {
      prevFilteredLengthRef.current = filteredCommands.length
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedIndex(0)
    }
  }, [filteredCommands.length])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[15vh] z-[100]"
      onClick={() => {
        setIsOpen(false)
        setQuery('')
      }}
      role="presentation"
    >
      <div
        className="bg-mac-panel/95 border border-glass-border rounded-mac-xl w-[560px] shadow-mac backdrop-blur-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-glass-border">
          <Search size={20} className="text-text-tertiary" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-text-primary placeholder-text-tertiary outline-none text-base"
            aria-label="Search commands"
            autoFocus
          />
          <kbd className="px-2 py-0.5 bg-surface rounded text-xs text-text-secondary font-mono">
            ESC
          </kbd>
        </div>

        {/* Command List */}
        <div className="max-h-[400px] overflow-y-auto">
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-text-tertiary">
              <Search size={32} className="mx-auto mb-2 opacity-50" />
              <p>No commands found</p>
            </div>
          ) : (
            filteredCommands.map((cmd, index) => (
              <div
                key={cmd.id}
                onClick={() => {
                  cmd.action()
                  setIsOpen(false)
                  setQuery('')
                }}
                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                  index === selectedIndex
                    ? 'bg-accent/20 border-l-2 border-accent'
                    : 'hover:bg-card-hover border-l-2 border-transparent'
                }`}
              >
                <div className="p-1.5 bg-surface rounded-mac">{cmd.icon}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">{cmd.label}</p>
                  {cmd.description && (
                    <p className="text-xs text-text-secondary truncate">{cmd.description}</p>
                  )}
                </div>
                {cmd.shortcut && (
                  <kbd className="px-2 py-0.5 bg-surface rounded text-xs text-text-secondary font-mono">
                    {cmd.shortcut}
                  </kbd>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-glass-border bg-surface/50 text-xs text-text-tertiary">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1 bg-mac-sidebar rounded">↑↓</kbd> Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 bg-mac-sidebar rounded">↵</kbd> Select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 bg-mac-sidebar rounded">Esc</kbd> Close
            </span>
          </div>
          <span className="flex items-center gap-1">
            <Command size={12} />
            <kbd className="px-1 bg-mac-sidebar rounded">⇧</kbd>
            <kbd className="px-1 bg-mac-sidebar rounded">P</kbd>
            Toggle
          </span>
        </div>
      </div>
    </div>
  )
}

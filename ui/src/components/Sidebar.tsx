import { useAppStore } from '../store/appStore'
import {
  Code2,
  Users,
  Network,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react'

const navItems = [
  { id: 'editor' as const, icon: Code2, label: 'Editor' },
  { id: 'swarm' as const, icon: Network, label: 'Swarm' },
  { id: 'team' as const, icon: Users, label: 'Team' },
  { id: 'settings' as const, icon: Settings, label: 'Settings' },
]

export default function Sidebar() {
  const { sidebarCollapsed, activePanel, toggleSidebar, setActivePanel, connected, agents } = useAppStore()

  return (
    <div
      className={`flex flex-col bg-mac-sidebar border-r border-glass-border transition-all duration-300 ease-out ${
        sidebarCollapsed ? 'w-14' : 'w-56'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-glass-border">
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="text-sm font-semibold text-text-primary tracking-tight">Swarm Editor</span>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className={`p-1.5 hover:bg-card-hover rounded-mac transition-colors duration-200 ${sidebarCollapsed ? 'mx-auto' : ''}`}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? (
            <ChevronRight size={16} className="text-text-secondary" />
          ) : (
            <ChevronLeft size={16} className="text-text-secondary" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3">
        {navItems.map((item, index) => {
          const Icon = item.icon
          const isActive = activePanel === item.id
          return (
            <button
              key={item.id}
              onClick={() => setActivePanel(item.id)}
              className={`w-full flex items-center px-3 py-2.5 my-0.5 mx-2 rounded-mac text-left transition-all duration-200 ${
                isActive
                  ? 'bg-accent-muted text-accent'
                  : 'text-text-secondary hover:text-text-primary hover:bg-card-hover'
              }`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <Icon size={18} className={isActive ? 'text-accent' : ''} />
              {!sidebarCollapsed && (
                <span className="ml-3 text-sm font-medium">{item.label}</span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-glass-border">
        {!sidebarCollapsed ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`status-dot ${connected ? 'online' : 'offline'}`} />
              <span className="text-xs text-text-secondary">
                {connected ? 'Connected' : 'Offline'}
              </span>
            </div>
            <span className="text-xs text-text-tertiary">
              {agents.length} agents
            </span>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className={`status-dot ${connected ? 'online' : 'offline'}`} />
          </div>
        )}
      </div>
    </div>
  )
}

import { useAppStore } from '../store/appStore'
import {
  Code2,
  Users,
  Network,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

const navItems = [
  { id: 'editor' as const, icon: Code2, label: 'Editor' },
  { id: 'swarm' as const, icon: Network, label: 'Swarm' },
  { id: 'team' as const, icon: Users, label: 'Team' },
  { id: 'settings' as const, icon: Settings, label: 'Settings' },
]

export default function Sidebar() {
  const { sidebarCollapsed, activePanel, toggleSidebar, setActivePanel } = useAppStore()

  return (
    <div
      className={`flex flex-col bg-panel-bg border-r border-panel-border transition-all duration-300 ${
        sidebarCollapsed ? 'w-12' : 'w-48'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b border-panel-border">
        {!sidebarCollapsed && (
          <span className="text-sm font-semibold text-accent">Swarm Editor</span>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1 hover:bg-panel-border rounded"
        >
          {sidebarCollapsed ? (
            <ChevronRight size={16} />
          ) : (
            <ChevronLeft size={16} />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activePanel === item.id
          return (
            <button
              key={item.id}
              onClick={() => setActivePanel(item.id)}
              className={`flex items-center w-full px-3 py-2 text-left transition-colors ${
                isActive
                  ? 'bg-accent/20 text-accent border-r-2 border-accent'
                  : 'hover:bg-panel-border text-text-secondary hover:text-text-primary'
              }`}
              title={item.label}
            >
              <Icon size={18} />
              {!sidebarCollapsed && (
                <span className="ml-3 text-sm">{item.label}</span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      {!sidebarCollapsed && (
        <div className="p-2 border-t border-panel-border text-xs text-text-secondary">
          <div className="flex items-center justify-between">
            <span>Agents: 0</span>
            <span className="w-2 h-2 rounded-full bg-success" />
          </div>
        </div>
      )}
    </div>
  )
}
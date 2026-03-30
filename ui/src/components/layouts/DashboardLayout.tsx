import { ReactNode, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import {
  Network,
  Activity,
  Cpu,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Settings,
  Bell,
} from 'lucide-react'

interface DashboardLayoutProps {
  children: ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const navigate = useNavigate()
  const agents = useAppStore(state => state.agents)
  const activeSwarm = useAppStore(state => state.activeSwarm)
  const connected = useAppStore(state => state.connected)
  const toasts = useAppStore(state => state.toasts)

  const { activeAgents, idleAgents, errorAgents } = useMemo(() => {
    let active = 0, idle = 0, error = 0
    for (const a of agents) {
      if (a.state === 'executing' || a.state === 'thinking') active++
      else if (a.state === 'idle') idle++
      else if (a.state === 'error') error++
    }
    return { activeAgents: active, idleAgents: idle, errorAgents: error }
  }, [agents])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Modern Header */}
      <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
                  <Network className="w-5 h-5 text-white" />
                </div>
                {connected && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-900 animate-pulse" />
                )}
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Swarm Editor</h1>
                <p className="text-xs text-slate-400">Agent Orchestration Platform</p>
              </div>
            </div>

            {/* Stats Bar */}
            <div className="flex items-center gap-6">
              {/* Active Agents */}
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center">
                  <Activity className="w-4 h-4 text-green-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-400">Active</p>
                  <p className="text-sm font-semibold text-white">{activeAgents}</p>
                </div>
              </div>

              {/* Idle Agents */}
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-slate-500/10 rounded-lg flex items-center justify-center">
                  <Cpu className="w-4 h-4 text-slate-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-400">Idle</p>
                  <p className="text-sm font-semibold text-white">{idleAgents}</p>
                </div>
              </div>

              {/* Errors */}
              {errorAgents > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-red-500/10 rounded-lg flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Errors</p>
                    <p className="text-sm font-semibold text-red-400">{errorAgents}</p>
                  </div>
                </div>
              )}

              {/* Connection Status */}
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${
                connected
                  ? 'bg-green-500/10 text-green-400'
                  : 'bg-red-500/10 text-red-400'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'
                }`} />
                <span className="text-xs font-medium">
                  {connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>

              {/* Notifications */}
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="relative w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center hover:bg-slate-700 transition-colors"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5 text-slate-400" />
                {toasts.length > 0 && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                    <span className="text-xs font-bold text-white">{toasts.length}</span>
                  </div>
                )}
              </button>

              {/* Settings */}
              <button
                onClick={() => navigate('/settings')}
                className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center hover:bg-slate-700 transition-colors"
                aria-label="Settings"
              >
                <Settings className="w-5 h-5 text-slate-400" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {children}
      </main>

      {/* Status Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-slate-900/80 backdrop-blur-xl border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-4">
              {activeSwarm && (
                <>
                  <span className="flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5" />
                    {activeSwarm.name}
                  </span>
                  <span className="text-slate-600">|</span>
                  <span>{activeSwarm.topology}</span>
                  <span className="text-slate-600">|</span>
                  <span>{activeSwarm.strategy}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                System Healthy
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

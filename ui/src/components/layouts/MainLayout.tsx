import { ReactNode } from 'react'
import Sidebar from '../Sidebar'
import StatusBar from '../StatusBar'
import AgentPanel from '../AgentPanel'

interface MainLayoutProps {
  children: ReactNode
}

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex flex-col h-screen bg-mac-bg text-text-primary overflow-hidden">
      {/* macOS-style Title Bar Area */}
      <div className="mac-title-bar h-7 bg-mac-sidebar flex items-center px-3 border-b border-glass-border">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 rounded-full bg-error/80" />
          <div className="w-3 h-3 rounded-full bg-warning/80" />
          <div className="w-3 h-3 rounded-full bg-success/80" />
        </div>
        <div className="flex-1 text-center">
          <span className="text-xs text-text-tertiary font-medium">Swarm Editor</span>
        </div>
        <div className="w-16" /> {/* Spacer for symmetry */}
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Content Area */}
          <main className="flex-1 overflow-hidden">
            {children}
          </main>

          {/* Agent Panel */}
          <AgentPanel />
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar />
    </div>
  )
}

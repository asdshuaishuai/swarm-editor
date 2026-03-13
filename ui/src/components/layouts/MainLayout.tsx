import { ReactNode } from 'react'
import Sidebar from '../Sidebar'
import StatusBar from '../StatusBar'
import AgentPanel from '../AgentPanel'

interface MainLayoutProps {
  children: ReactNode
}

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex flex-col h-screen bg-editor-bg text-text-primary">
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
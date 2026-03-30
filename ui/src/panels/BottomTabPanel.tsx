import { useState, useRef, useEffect } from 'react'
import { AgentDispatchPanel } from './AgentDispatchPanel'

type TabId = 'agents' | 'console'

interface Tab {
  id: TabId
  label: string
  icon: React.ReactNode
}

const tabs: Tab[] = [
  {
    id: 'agents',
    label: 'Agents',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    )
  },
  {
    id: 'console',
    label: 'Console',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    )
  }
]

interface ConsoleEntry {
  id: string
  type: 'info' | 'success' | 'error' | 'warning' | 'command'
  message: string
  timestamp: Date
}

// Internal Console component
function ConsolePanel() {
  const [entries, setEntries] = useState<ConsoleEntry[]>([])
  const [input, setInput] = useState('')
  const outputRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Auto-scroll to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [entries])

  const handleCommand = (cmd: string) => {
    const newEntry: ConsoleEntry = {
      id: `cmd-${Date.now()}`,
      type: 'command',
      message: `> ${cmd}`,
      timestamp: new Date()
    }
    setEntries(prev => [...prev, newEntry])

    // Mock response
    setTimeout(() => {
      if (!mountedRef.current) return
      const response: ConsoleEntry = {
        id: `res-${Date.now()}`,
        type: cmd.includes('error') ? 'error' : 'success',
        message: `Executed: ${cmd}`,
        timestamp: new Date()
      }
      setEntries(prev => [...prev, response])
    }, 100)

    setInput('')
  }

  const getTypeColor = (type: ConsoleEntry['type']) => {
    switch (type) {
      case 'success': return 'text-green-400'
      case 'error': return 'text-red-400'
      case 'warning': return 'text-yellow-400'
      case 'command': return 'text-blue-400'
      default: return 'text-slate-400'
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Output Area */}
      <div ref={outputRef} className="flex-1 overflow-y-auto font-mono text-xs p-2 space-y-0.5 bg-[#0a0a0b]">
        {entries.length === 0 ? (
          <div className="text-slate-600 text-center py-4">
            Console output will appear here
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="flex items-start gap-2">
              <span className="text-slate-600 shrink-0 tabular-nums">
                [{formatTime(entry.timestamp)}]
              </span>
              <span className={getTypeColor(entry.type)}>{entry.message}</span>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="border-t border-[#1f1f21] p-2">
        <div className="flex items-center gap-2 bg-slate-800/30 rounded px-2 py-1">
          <span className="text-blue-400 font-mono text-xs">$</span>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && input.trim() && handleCommand(input.trim())}
            placeholder="Enter command..."
            className="flex-1 bg-transparent text-xs text-white placeholder-slate-600 outline-none font-mono"
          />
        </div>
      </div>
    </div>
  )
}

interface BottomTabPanelProps {
  defaultTab?: TabId
  height?: number
}

export function BottomTabPanel({ defaultTab = 'agents', height = 200 }: BottomTabPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>(defaultTab)

  return (
    <div
      className="flex flex-col bg-[#0f0f10] border-t border-[#1f1f21]"
      style={{ height }}
    >
      {/* Tab Bar */}
      <div className="flex items-center bg-[#0a0a0b] border-b border-[#1f1f21]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
              activeTab === tab.id
                ? 'text-white border-blue-500 bg-[#0f0f10]'
                : 'text-slate-500 border-transparent hover:text-slate-300 hover:bg-slate-800/30'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}

        {/* Quick Actions */}
        <div className="ml-auto flex items-center gap-1 px-2">
          <button
            className="p-1 rounded hover:bg-slate-800 transition-colors"
            title="Clear"
            aria-label="Clear"
          >
            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <button
            className="p-1 rounded hover:bg-slate-800 transition-colors"
            title="Maximize"
            aria-label="Maximize"
          >
            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'agents' && (
          <div className="h-full overflow-auto">
            <AgentDispatchPanel />
          </div>
        )}
        {activeTab === 'console' && (
          <div className="h-full overflow-auto">
            <ConsolePanel />
          </div>
        )}
      </div>
    </div>
  )
}

export default BottomTabPanel
import { create } from 'zustand'
import { events } from '../services'
import type { LogEntry } from '../services/api'

const MAX_LOGS_PER_AGENT = 5000

interface AgentLogChunk {
  agentId: string
  entries: LogEntry[]
}

interface AgentLogState {
  logsByAgent: Record<string, LogEntry[]>
  appendLogs: (agentId: string, entries: LogEntry[]) => void
  clearLogs: (agentId: string) => void
  subscribe: () => () => void
}

export const useAgentLogStore = create<AgentLogState>((set) => ({
  logsByAgent: {},

  appendLogs: (agentId, entries) => {
    set((state) => {
      const existing = state.logsByAgent[agentId] ?? []
      const combined = [...existing, ...entries]
      const trimmed = combined.length > MAX_LOGS_PER_AGENT
        ? combined.slice(combined.length - MAX_LOGS_PER_AGENT)
        : combined
      return { logsByAgent: { ...state.logsByAgent, [agentId]: trimmed } }
    })
  },

  clearLogs: (agentId) => {
    set((state) => {
      const next = { ...state.logsByAgent }
      delete next[agentId]
      return { logsByAgent: next }
    })
  },

  subscribe: () => {
    const unsub = events.subscribe('agent_log_chunk', (payload: unknown) => {
      const chunk = payload as AgentLogChunk
      if (!chunk?.agentId || !Array.isArray(chunk.entries)) return
      useAgentLogStore.getState().appendLogs(chunk.agentId, chunk.entries)
    })
    return unsub
  },
}))

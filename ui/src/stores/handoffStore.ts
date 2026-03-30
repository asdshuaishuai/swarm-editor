import { create } from 'zustand'
import { logger } from '../utils'

export interface HandoffRequestData {
  id: string
  fromAgent: string
  toAgent: string
  taskId: string
  reason: string
  status: 'pending' | 'accepted' | 'rejected'
  createdAt: Date
  context?: {
    conversationHistory?: Array<{ type: string; text: string }>
    filesModified?: string[]
    currentState?: string
    nextSteps?: string[]
    instructions?: string
  }
}

interface HandoffStore {
  activeHandoff: HandoffRequestData | null
  setActiveHandoff: (request: HandoffRequestData) => void
  clearActiveHandoff: () => void
  resolveHandoff: (accepted: boolean, summary?: string) => void
}

export const useHandoffStore = create<HandoffStore>((set, get) => ({
  activeHandoff: null,
  setActiveHandoff: (request) => set({ activeHandoff: request }),
  clearActiveHandoff: () => set({ activeHandoff: null }),
  resolveHandoff: (accepted, summary) => {
    const handoff = get().activeHandoff
    if (handoff) {
      // In production, this would notify the backend
      logger.warn('Handoff', 'Resolved:', {
        id: handoff.id,
        accepted,
        summary: summary || null
      })
      set({ activeHandoff: null })
    }
  }
}))

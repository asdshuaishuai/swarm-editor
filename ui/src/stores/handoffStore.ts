import { create } from 'zustand'
import { api } from '../services'
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
      // Notify backend of handoff resolution
      api.swarm.resolveHandoff(handoff.id, accepted, summary)
        .then(() => {
          logger.debug('Handoff', 'Resolved via backend:', { id: handoff.id, accepted })
        })
        .catch((err) => {
          logger.warn('Handoff', 'Backend resolution failed, clearing locally:', err)
        })
      set({ activeHandoff: null })
    }
  }
}))

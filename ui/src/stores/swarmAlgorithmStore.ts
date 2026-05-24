import { create } from 'zustand'
import { api } from '../services'
import { logger } from '../utils'

export interface QueenInfo {
  swarmId: string
  queenId: string
  backupId: string
  state: 'stable' | 'pending' | 'failed'
  round: number
  electedAt: string
  abdication: string
}

export interface CheckpointInfo {
  checkpointId: string
  taskId: string
  agentId: string
  reason: string
  strategy: string
  partialResult: string
  savedAt: string
  retryCount: number
  recovered: boolean
}

export interface RoleAssignment {
  agentId: string
  role: string
  taskId: string
  assignedAt: string
  score: number
}

interface SwarmAlgorithmState {
  queens: Record<string, QueenInfo>
  checkpoints: CheckpointInfo[]
  roleAssignments: Record<string, RoleAssignment[]>
  loading: boolean
  error: string | null

  fetchQueenStatus: (swarmId: string) => Promise<void>
  triggerElection: (swarmId: string) => Promise<void>
  abdicateQueen: (swarmId: string, reason: string) => Promise<void>
  interruptAgent: (swarmId: string, agentId: string, taskId: string, reason: string) => Promise<void>
  resumeTask: (checkpointId: string, agentId?: string) => Promise<void>
  recoverTask: (checkpointId: string, strategy: string) => Promise<void>
  fetchCheckpoints: (swarmId: string) => Promise<void>
  fetchRoleAssignments: (swarmId: string) => Promise<void>

  onQueenElected: (data: unknown) => void
  onQueenAbdicated: (data: unknown) => void
  onAgentInterrupted: (data: unknown) => void
  onTaskResumed: (data: unknown) => void
}

export const useSwarmAlgorithmStore = create<SwarmAlgorithmState>()((set, get) => ({
  queens: {},
  checkpoints: [],
  roleAssignments: {},
  loading: false,
  error: null,

  fetchQueenStatus: async (swarmId: string) => {
    set({ loading: true, error: null })
    try {
      const status = await api.swarm.getQueenStatus(swarmId)
      const queenInfo: QueenInfo = { ...status, state: status.state as QueenInfo['state'] }
      set((state) => ({
        queens: { ...state.queens, [swarmId]: queenInfo },
        loading: false,
      }))
    } catch (err) {
      logger.error('SwarmAlgorithmStore', 'Failed to fetch queen status:', err)
      set({ error: err instanceof Error ? err.message : 'Failed to fetch queen status', loading: false })
    }
  },

  triggerElection: async (swarmId: string) => {
    set({ loading: true, error: null })
    try {
      await api.swarm.triggerElection(swarmId)
      await get().fetchQueenStatus(swarmId)
    } catch (err) {
      logger.error('SwarmAlgorithmStore', 'Failed to trigger election:', err)
      set({ error: err instanceof Error ? err.message : 'Failed to trigger election', loading: false })
    }
  },

  abdicateQueen: async (swarmId: string, reason: string) => {
    set({ loading: true, error: null })
    try {
      await api.swarm.abdicateQueen(swarmId, reason)
      await get().fetchQueenStatus(swarmId)
    } catch (err) {
      logger.error('SwarmAlgorithmStore', 'Failed to abdicate queen:', err)
      set({ error: err instanceof Error ? err.message : 'Failed to abdicate queen', loading: false })
    }
  },

  interruptAgent: async (swarmId: string, agentId: string, taskId: string, reason: string) => {
    set({ loading: true, error: null })
    try {
      await api.swarm.interruptAgent(swarmId, agentId, taskId, reason)
      await get().fetchCheckpoints(swarmId)
    } catch (err) {
      logger.error('SwarmAlgorithmStore', 'Failed to interrupt agent:', err)
      set({ error: err instanceof Error ? err.message : 'Failed to interrupt agent', loading: false })
    }
  },

  resumeTask: async (checkpointId: string, agentId?: string) => {
    set({ loading: true, error: null })
    try {
      await api.swarm.resumeTask(checkpointId, agentId)
      set((state) => ({
        checkpoints: state.checkpoints.map((cp) =>
          cp.checkpointId === checkpointId ? { ...cp, recovered: true } : cp
        ),
        loading: false,
      }))
    } catch (err) {
      logger.error('SwarmAlgorithmStore', 'Failed to resume task:', err)
      set({ error: err instanceof Error ? err.message : 'Failed to resume task', loading: false })
    }
  },

  recoverTask: async (checkpointId: string, strategy: string) => {
    set({ loading: true, error: null })
    try {
      await api.swarm.recoverTask(checkpointId, strategy)
      set((state) => ({
        checkpoints: state.checkpoints.map((cp) =>
          cp.checkpointId === checkpointId ? { ...cp, recovered: true } : cp
        ),
        loading: false,
      }))
    } catch (err) {
      logger.error('SwarmAlgorithmStore', 'Failed to recover task:', err)
      set({ error: err instanceof Error ? err.message : 'Failed to recover task', loading: false })
    }
  },

  fetchCheckpoints: async (swarmId: string) => {
    set({ loading: true, error: null })
    try {
      const checkpoints = await api.swarm.getCheckpoints(swarmId)
      set({ checkpoints, loading: false })
    } catch (err) {
      logger.error('SwarmAlgorithmStore', 'Failed to fetch checkpoints:', err)
      set({ error: err instanceof Error ? err.message : 'Failed to fetch checkpoints', loading: false })
    }
  },

  fetchRoleAssignments: async (swarmId: string) => {
    set({ loading: true, error: null })
    try {
      const assignments = await api.swarm.getRoleAssignments(swarmId)
      set((state) => ({
        roleAssignments: { ...state.roleAssignments, [swarmId]: assignments },
        loading: false,
      }))
    } catch (err) {
      logger.error('SwarmAlgorithmStore', 'Failed to fetch role assignments:', err)
      set({ error: err instanceof Error ? err.message : 'Failed to fetch role assignments', loading: false })
    }
  },

  onQueenElected: (data: unknown) => {
    const payload = data as { swarmId: string; queenId: string; backupId: string; round: number; electedAt: string }
    if (payload?.swarmId && payload?.queenId) {
      set((state) => ({
        queens: {
          ...state.queens,
          [payload.swarmId]: {
            swarmId: payload.swarmId,
            queenId: payload.queenId,
            backupId: payload.backupId || '',
            state: 'stable',
            round: payload.round || 0,
            electedAt: payload.electedAt,
            abdication: '',
          },
        },
      }))
    }
  },

  onQueenAbdicated: (data: unknown) => {
    const payload = data as { swarmId: string; reason: string; timestamp: string }
    if (payload?.swarmId) {
      set((state) => ({
        queens: {
          ...state.queens,
          [payload.swarmId]: {
            ...state.queens[payload.swarmId],
            state: 'pending',
            abdication: payload.reason || '',
          },
        },
      }))
    }
  },

  onAgentInterrupted: (data: unknown) => {
    const payload = data as { checkpointId: string; taskId: string; agentId: string; reason: string; savedAt: string }
    if (payload?.checkpointId) {
      set((state) => ({
        checkpoints: [
          ...state.checkpoints,
          {
            checkpointId: payload.checkpointId,
            taskId: payload.taskId,
            agentId: payload.agentId,
            reason: payload.reason,
            strategy: 'retry',
            partialResult: '',
            savedAt: payload.savedAt,
            retryCount: 0,
            recovered: false,
          },
        ],
      }))
    }
  },

  onTaskResumed: (data: unknown) => {
    const payload = data as { checkpointId: string }
    if (payload?.checkpointId) {
      set((state) => ({
        checkpoints: state.checkpoints.map((cp) =>
          cp.checkpointId === payload.checkpointId ? { ...cp, recovered: true } : cp
        ),
      }))
    }
  },
}))

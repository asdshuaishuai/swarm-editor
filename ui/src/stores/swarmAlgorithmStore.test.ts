import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSwarmAlgorithmStore } from './swarmAlgorithmStore'
import { api } from '../services'

vi.mock('../services', () => ({
  api: {
    swarm: {
      getQueenStatus: vi.fn(),
      triggerElection: vi.fn(),
      abdicateQueen: vi.fn(),
      interruptAgent: vi.fn(),
      resumeTask: vi.fn(),
      recoverTask: vi.fn(),
      getCheckpoints: vi.fn(),
      getRoleAssignments: vi.fn(),
    },
  },
}))

describe('swarmAlgorithmStore', () => {
  beforeEach(() => {
    useSwarmAlgorithmStore.setState({
      queens: {},
      checkpoints: [],
      roleAssignments: {},
      loading: false,
      error: null,
    })
    vi.clearAllMocks()
  })

  describe('fetchQueenStatus', () => {
    it('fetches and stores queen status', async () => {
      vi.mocked(api.swarm.getQueenStatus).mockResolvedValue({
        swarmId: 'sw-1',
        queenId: 'queen-a',
        backupId: 'backup-b',
        state: 'stable',
        round: 3,
        electedAt: '2026-01-01',
        abdication: '',
      })

      await useSwarmAlgorithmStore.getState().fetchQueenStatus('sw-1')

      const state = useSwarmAlgorithmStore.getState()
      expect(state.queens['sw-1']).toBeDefined()
      expect(state.queens['sw-1'].queenId).toBe('queen-a')
      expect(state.queens['sw-1'].state).toBe('stable')
      expect(state.loading).toBe(false)
      expect(state.error).toBeNull()
    })

    it('handles fetch error', async () => {
      vi.mocked(api.swarm.getQueenStatus).mockRejectedValue(new Error('network'))

      await useSwarmAlgorithmStore.getState().fetchQueenStatus('sw-1')

      const state = useSwarmAlgorithmStore.getState()
      expect(state.error).toBe('network')
      expect(state.loading).toBe(false)
    })
  })

  describe('triggerElection', () => {
    it('triggers election and refreshes status', async () => {
      vi.mocked(api.swarm.triggerElection).mockResolvedValue({ swarmId: 'sw-1', queenId: 'new-queen', round: 4 })
      vi.mocked(api.swarm.getQueenStatus).mockResolvedValue({
        swarmId: 'sw-1',
        queenId: 'new-queen',
        backupId: '',
        state: 'stable',
        round: 4,
        electedAt: '2026-01-02',
        abdication: '',
      })

      await useSwarmAlgorithmStore.getState().triggerElection('sw-1')

      expect(api.swarm.triggerElection).toHaveBeenCalledWith('sw-1')
      expect(api.swarm.getQueenStatus).toHaveBeenCalledWith('sw-1')
    })

    it('handles election error', async () => {
      vi.mocked(api.swarm.triggerElection).mockRejectedValue(new Error('fail'))

      await useSwarmAlgorithmStore.getState().triggerElection('sw-1')

      expect(useSwarmAlgorithmStore.getState().error).toBe('fail')
    })
  })

  describe('abdicateQueen', () => {
    it('abdicates and refreshes status', async () => {
      vi.mocked(api.swarm.abdicateQueen).mockResolvedValue({ swarmId: 'sw-1', success: true })
      vi.mocked(api.swarm.getQueenStatus).mockResolvedValue({
        swarmId: 'sw-1',
        queenId: '',
        backupId: '',
        state: 'pending',
        round: 4,
        electedAt: '',
        abdication: 'stepping down',
      })

      await useSwarmAlgorithmStore.getState().abdicateQueen('sw-1', 'stepping down')

      expect(api.swarm.abdicateQueen).toHaveBeenCalledWith('sw-1', 'stepping down')
    })
  })

  describe('interruptAgent', () => {
    it('interrupts agent and refreshes checkpoints', async () => {
      vi.mocked(api.swarm.interruptAgent).mockResolvedValue({ checkpointId: 'cp-new', success: true })
      vi.mocked(api.swarm.getCheckpoints).mockResolvedValue([])

      await useSwarmAlgorithmStore.getState().interruptAgent('sw-1', 'a-1', 't-1', 'stuck')

      expect(api.swarm.interruptAgent).toHaveBeenCalledWith('sw-1', 'a-1', 't-1', 'stuck')
      expect(api.swarm.getCheckpoints).toHaveBeenCalledWith('sw-1')
    })
  })

  describe('resumeTask', () => {
    it('marks checkpoint as recovered', async () => {
      useSwarmAlgorithmStore.setState({
        checkpoints: [
          {
            checkpointId: 'cp-1',
            taskId: 't-1',
            agentId: 'a-1',
            reason: 'stuck',
            strategy: 'retry',
            partialResult: '',
            savedAt: '2026-01-01',
            retryCount: 0,
            recovered: false,
          },
        ],
      })
      vi.mocked(api.swarm.resumeTask).mockResolvedValue({ checkpointId: 'cp-1', success: true })

      await useSwarmAlgorithmStore.getState().resumeTask('cp-1')

      expect(useSwarmAlgorithmStore.getState().checkpoints[0].recovered).toBe(true)
    })
  })

  describe('recoverTask', () => {
    it('recovers task with strategy', async () => {
      useSwarmAlgorithmStore.setState({
        checkpoints: [
          {
            checkpointId: 'cp-2',
            taskId: 't-2',
            agentId: 'a-2',
            reason: 'error',
            strategy: 'reassign',
            partialResult: '',
            savedAt: '2026-01-01',
            retryCount: 1,
            recovered: false,
          },
        ],
      })
      vi.mocked(api.swarm.recoverTask).mockResolvedValue({ checkpointId: 'cp-2', success: true })

      await useSwarmAlgorithmStore.getState().recoverTask('cp-2', 'reassign')

      expect(api.swarm.recoverTask).toHaveBeenCalledWith('cp-2', 'reassign')
      expect(useSwarmAlgorithmStore.getState().checkpoints[0].recovered).toBe(true)
    })
  })

  describe('fetchCheckpoints', () => {
    it('fetches and stores checkpoints', async () => {
      const checkpoints = [
        {
          checkpointId: 'cp-1',
          taskId: 't-1',
          agentId: 'a-1',
          reason: 'stuck',
          strategy: 'retry',
          partialResult: '',
          savedAt: '2026-01-01',
          retryCount: 0,
          recovered: false,
        },
      ]
      vi.mocked(api.swarm.getCheckpoints).mockResolvedValue(checkpoints)

      await useSwarmAlgorithmStore.getState().fetchCheckpoints('sw-1')

      expect(useSwarmAlgorithmStore.getState().checkpoints).toEqual(checkpoints)
    })
  })

  describe('fetchRoleAssignments', () => {
    it('fetches and stores role assignments', async () => {
      const assignments = [
        { agentId: 'a-1', role: 'coder', taskId: 't-1', assignedAt: '2026-01-01', score: 0.9 },
      ]
      vi.mocked(api.swarm.getRoleAssignments).mockResolvedValue(assignments)

      await useSwarmAlgorithmStore.getState().fetchRoleAssignments('sw-1')

      expect(useSwarmAlgorithmStore.getState().roleAssignments['sw-1']).toEqual(assignments)
    })
  })

  describe('event handlers', () => {
    it('onQueenElected creates new queen entry', () => {
      useSwarmAlgorithmStore.getState().onQueenElected({
        swarmId: 'sw-1',
        queenId: 'q-1',
        backupId: 'b-1',
        round: 1,
        electedAt: '2026-01-01',
      })

      const queen = useSwarmAlgorithmStore.getState().queens['sw-1']
      expect(queen).toBeDefined()
      expect(queen.queenId).toBe('q-1')
      expect(queen.state).toBe('stable')
    })

    it('onQueenAbdicated sets state to pending', () => {
      useSwarmAlgorithmStore.setState({
        queens: {
          'sw-1': {
            swarmId: 'sw-1',
            queenId: 'q-1',
            backupId: '',
            state: 'stable',
            round: 1,
            electedAt: '2026-01-01',
            abdication: '',
          },
        },
      })

      useSwarmAlgorithmStore.getState().onQueenAbdicated({
        swarmId: 'sw-1',
        reason: 'health check failed',
        timestamp: '2026-01-02',
      })

      expect(useSwarmAlgorithmStore.getState().queens['sw-1'].state).toBe('pending')
    })

    it('onAgentInterrupted adds checkpoint', () => {
      useSwarmAlgorithmStore.getState().onAgentInterrupted({
        checkpointId: 'cp-new',
        taskId: 't-1',
        agentId: 'a-1',
        reason: 'stuck',
        savedAt: '2026-01-01',
      })

      const cps = useSwarmAlgorithmStore.getState().checkpoints
      expect(cps).toHaveLength(1)
      expect(cps[0].checkpointId).toBe('cp-new')
      expect(cps[0].recovered).toBe(false)
    })

    it('onTaskResumed marks checkpoint recovered', () => {
      useSwarmAlgorithmStore.setState({
        checkpoints: [
          {
            checkpointId: 'cp-1',
            taskId: 't-1',
            agentId: 'a-1',
            reason: 'stuck',
            strategy: 'retry',
            partialResult: '',
            savedAt: '2026-01-01',
            retryCount: 0,
            recovered: false,
          },
        ],
      })

      useSwarmAlgorithmStore.getState().onTaskResumed({ checkpointId: 'cp-1' })

      expect(useSwarmAlgorithmStore.getState().checkpoints[0].recovered).toBe(true)
    })

    it('ignores invalid event data', () => {
      useSwarmAlgorithmStore.getState().onQueenElected({})
      useSwarmAlgorithmStore.getState().onQueenAbdicated({})
      useSwarmAlgorithmStore.getState().onAgentInterrupted({})
      useSwarmAlgorithmStore.getState().onTaskResumed({})

      const state = useSwarmAlgorithmStore.getState()
      expect(Object.keys(state.queens)).toHaveLength(0)
      expect(state.checkpoints).toHaveLength(0)
    })
  })

  describe('error paths', () => {
    it('handles non-Error thrown in fetchQueenStatus', async () => {
      vi.mocked(api.swarm.getQueenStatus).mockRejectedValue('string error')

      await useSwarmAlgorithmStore.getState().fetchQueenStatus('sw-1')

      expect(useSwarmAlgorithmStore.getState().error).toBe('Failed to fetch queen status')
      expect(useSwarmAlgorithmStore.getState().loading).toBe(false)
    })

    it('handles non-Error thrown in triggerElection', async () => {
      vi.mocked(api.swarm.triggerElection).mockRejectedValue('string error')

      await useSwarmAlgorithmStore.getState().triggerElection('sw-1')

      expect(useSwarmAlgorithmStore.getState().error).toBe('Failed to trigger election')
    })

    it('handles non-Error thrown in abdicateQueen', async () => {
      vi.mocked(api.swarm.abdicateQueen).mockRejectedValue('string error')

      await useSwarmAlgorithmStore.getState().abdicateQueen('sw-1', 'reason')

      expect(useSwarmAlgorithmStore.getState().error).toBe('Failed to abdicate queen')
    })

    it('handles non-Error thrown in interruptAgent', async () => {
      vi.mocked(api.swarm.interruptAgent).mockRejectedValue('string error')

      await useSwarmAlgorithmStore.getState().interruptAgent('sw-1', 'a-1', 't-1', 'stuck')

      expect(useSwarmAlgorithmStore.getState().error).toBe('Failed to interrupt agent')
    })

    it('handles non-Error thrown in resumeTask', async () => {
      vi.mocked(api.swarm.resumeTask).mockRejectedValue('string error')

      await useSwarmAlgorithmStore.getState().resumeTask('cp-1')

      expect(useSwarmAlgorithmStore.getState().error).toBe('Failed to resume task')
    })

    it('handles non-Error thrown in recoverTask', async () => {
      vi.mocked(api.swarm.recoverTask).mockRejectedValue('string error')

      await useSwarmAlgorithmStore.getState().recoverTask('cp-1', 'retry')

      expect(useSwarmAlgorithmStore.getState().error).toBe('Failed to recover task')
    })

    it('handles non-Error thrown in fetchCheckpoints', async () => {
      vi.mocked(api.swarm.getCheckpoints).mockRejectedValue('string error')

      await useSwarmAlgorithmStore.getState().fetchCheckpoints('sw-1')

      expect(useSwarmAlgorithmStore.getState().error).toBe('Failed to fetch checkpoints')
    })

    it('handles non-Error thrown in fetchRoleAssignments', async () => {
      vi.mocked(api.swarm.getRoleAssignments).mockRejectedValue('string error')

      await useSwarmAlgorithmStore.getState().fetchRoleAssignments('sw-1')

      expect(useSwarmAlgorithmStore.getState().error).toBe('Failed to fetch role assignments')
    })
  })
})

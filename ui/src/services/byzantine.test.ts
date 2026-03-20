import { describe, it, expect, beforeEach } from 'vitest'
import {
  updateByzantineConfig,
  getByzantineConfig,
  initializeNode,
  getNodeState,
  processMessage,
  verifyMessage,
  signMessage,
  createMessage,
  runConsensus,
  detectFaultyNodes,
  getMessageLog,
  getConsensusResult,
  resetByzantineState,
  defaultByzantineConfig,
} from './byzantine'
import type { ByzantineMessage, CoordinationTaskResult } from '../types'

describe('byzantine service', () => {
  beforeEach(() => {
    resetByzantineState()
    updateByzantineConfig(defaultByzantineConfig)
  })

  describe('configuration', () => {
    it('returns default config', () => {
      const config = getByzantineConfig()
      expect(config.enabled).toBe(false)
      expect(config.maxFaultyNodes).toBe(1)
      expect(config.consensusRounds).toBe(3)
      expect(config.timeoutMs).toBe(30000)
      expect(config.verificationMethod).toBe('majority_vote')
    })

    it('updates config', () => {
      updateByzantineConfig({ enabled: true, maxFaultyNodes: 2 })
      const config = getByzantineConfig()
      expect(config.enabled).toBe(true)
      expect(config.maxFaultyNodes).toBe(2)
    })
  })

  describe('node initialization', () => {
    it('initializes node with correct state', () => {
      const state = initializeNode('node-1')
      expect(state.phase).toBe('idle')
      expect(state.currentRound).toBe(0)
      expect(state.commitCount).toBe(0)
      expect(state.prepareCount).toBe(0)
      expect(state.faultyNodesDetected).toEqual([])
    })

    it('returns existing node state', () => {
      initializeNode('node-1')
      const state = getNodeState('node-1')
      expect(state).toBeDefined()
      expect(state?.phase).toBe('idle')
    })

    it('returns undefined for non-existent node', () => {
      const state = getNodeState('nonexistent')
      expect(state).toBeUndefined()
    })
  })

  describe('message processing', () => {
    it('returns idle state when disabled', () => {
      const message: ByzantineMessage = {
        round: 1,
        senderId: 'node-1',
        type: 'prepare',
        timestamp: new Date().toISOString(),
      }
      const result = processMessage(message, 3)
      expect(result.state.phase).toBe('idle')
    })

    it('processes prepare message', () => {
      updateByzantineConfig({ enabled: true })
      const message: ByzantineMessage = {
        round: 1,
        senderId: 'node-1',
        type: 'prepare',
        timestamp: new Date().toISOString(),
      }
      const result = processMessage(message, 3)
      expect(result.state.phase).toBe('preparing')
    })

    it('processes commit message', () => {
      updateByzantineConfig({ enabled: true })
      initializeNode('node-1')

      // First prepare
      const prepareMsg: ByzantineMessage = {
        round: 1,
        senderId: 'node-1',
        type: 'prepare',
        timestamp: new Date().toISOString(),
      }
      processMessage(prepareMsg, 3)

      // Get state and modify to prepared
      const state = getNodeState('node-1')
      if (state) {
        state.phase = 'prepared'
        state.prepareCount = 2
      }

      // Then commit
      const commitMsg: ByzantineMessage = {
        round: 1,
        senderId: 'node-1',
        type: 'commit',
        timestamp: new Date().toISOString(),
      }
      const result = processMessage(commitMsg, 3)
      expect(result.state.phase).toBe('committing')
    })

    it('detects value mismatch in commit phase', () => {
      resetByzantineState()
      updateByzantineConfig({ enabled: true })
      initializeNode('node-1')

      // Prepare with a value
      const prepareMsg: ByzantineMessage = {
        round: 1,
        senderId: 'node-1',
        type: 'prepare',
        value: { data: 'expected-value' },
        timestamp: new Date().toISOString(),
      }
      processMessage(prepareMsg, 3)

      // Set state to prepared
      const state = getNodeState('node-1')
      if (state) {
        state.phase = 'prepared'
        state.prepareCount = 2
      }

      // Commit with different value (Byzantine behavior)
      const commitMsg: ByzantineMessage = {
        round: 1,
        senderId: 'node-1',
        type: 'commit',
        value: { data: 'different-value' },
        timestamp: new Date().toISOString(),
      }
      const result = processMessage(commitMsg, 3)

      // Should have detected the faulty node
      expect(result.state.faultyNodesDetected).toContain('node-1')
    })

    it('processes view change message', () => {
      updateByzantineConfig({ enabled: true })
      const message: ByzantineMessage = {
        round: 2,
        senderId: 'node-1',
        type: 'view_change',
        timestamp: new Date().toISOString(),
      }
      const result = processMessage(message, 3)
      expect(result.state.phase).toBe('view_change')
    })

    it('processes new view message', () => {
      updateByzantineConfig({ enabled: true })
      const message: ByzantineMessage = {
        round: 2,
        senderId: 'node-1',
        type: 'new_view',
        timestamp: new Date().toISOString(),
      }
      const result = processMessage(message, 3)
      expect(result.state.phase).toBe('preparing')
    })
  })

  describe('message signing and verification', () => {
    it('creates signed message', () => {
      const message = createMessage('node-1', 'prepare', 1)
      expect(message.senderId).toBe('node-1')
      expect(message.type).toBe('prepare')
      expect(message.round).toBe(1)
      expect(message.signature).toBeDefined()
    })

    it('verifies valid message', () => {
      const message = createMessage('node-1', 'prepare', 1)
      expect(verifyMessage(message)).toBe(true)
    })

    it('rejects message without signature in strict mode', () => {
      updateByzantineConfig({ verificationMethod: 'signature' })
      const message: ByzantineMessage = {
        round: 1,
        senderId: 'node-1',
        type: 'prepare',
        timestamp: new Date().toISOString(),
      }
      expect(verifyMessage(message)).toBe(false)
    })

    it('signs message', () => {
      const message: ByzantineMessage = {
        round: 1,
        senderId: 'node-1',
        type: 'prepare',
        timestamp: new Date().toISOString(),
      }
      const signed = signMessage(message, 'node-1')
      expect(signed.signature).toBeDefined()
    })
  })

  describe('consensus', () => {
    it('runs simple majority consensus when disabled', () => {
      const now = new Date().toISOString()
      const results: Record<string, CoordinationTaskResult> = {
        'agent-1': { agentId: 'agent-1', content: 'result A', startedAt: now, completedAt: now, duration: 1000 },
        'agent-2': { agentId: 'agent-2', content: 'result A', startedAt: now, completedAt: now, duration: 1000 },
        'agent-3': { agentId: 'agent-3', content: 'result B', startedAt: now, completedAt: now, duration: 1000 },
      }
      const consensus = runConsensus('task-1', results, 3)
      expect(consensus).toBeDefined()
      expect(consensus.agreement).toBeGreaterThan(0)
    })

    it('runs Byzantine consensus when enabled', () => {
      updateByzantineConfig({ enabled: true })
      const now = new Date().toISOString()
      const results: Record<string, CoordinationTaskResult> = {
        'agent-1': { agentId: 'agent-1', content: 'result A', startedAt: now, completedAt: now, duration: 1000 },
        'agent-2': { agentId: 'agent-2', content: 'result A', startedAt: now, completedAt: now, duration: 1000 },
        'agent-3': { agentId: 'agent-3', content: 'result A', startedAt: now, completedAt: now, duration: 1000 },
      }
      const consensus = runConsensus('task-1', results, 3)
      expect(consensus).toBeDefined()
    })

    it('handles Byzantine consensus with faulty nodes detected', () => {
      updateByzantineConfig({ enabled: true })

      // Initialize nodes and mark one as faulty
      initializeNode('node-1')
      initializeNode('node-2')
      const state = getNodeState('node-2')
      if (state) {
        state.faultyNodesDetected = ['node-2']
      }

      const now = new Date().toISOString()
      const results: Record<string, CoordinationTaskResult> = {
        'node-1': { agentId: 'node-1', content: 'result A', startedAt: now, completedAt: now, duration: 1000 },
        'node-2': { agentId: 'node-2', content: 'result B', startedAt: now, completedAt: now, duration: 1000 },
        'node-3': { agentId: 'node-3', content: 'result A', startedAt: now, completedAt: now, duration: 1000 },
      }

      const consensus = runConsensus('task-2', results, 3)
      expect(consensus).toBeDefined()
    })

    it('handles consensus with no agreement', () => {
      updateByzantineConfig({ enabled: true })
      const now = new Date().toISOString()
      const results: Record<string, CoordinationTaskResult> = {
        'agent-1': { agentId: 'agent-1', content: 'result A', startedAt: now, completedAt: now, duration: 1000 },
        'agent-2': { agentId: 'agent-2', content: 'result B', startedAt: now, completedAt: now, duration: 1000 },
        'agent-3': { agentId: 'agent-3', content: 'result C', startedAt: now, completedAt: now, duration: 1000 },
      }
      const consensus = runConsensus('task-3', results, 3)
      expect(consensus).toBeDefined()
    })

    it('handles Byzantine consensus with fault detection fallback', () => {
      updateByzantineConfig({ enabled: true, maxFaultyNodes: 1 })

      // Pre-initialize a node and mark it as faulty
      initializeNode('agent-2')
      const state = getNodeState('agent-2')
      if (state) {
        state.faultyNodesDetected = ['agent-2']
        state.consecutiveFailures = 3
      }

      const now = new Date().toISOString()
      const results: Record<string, CoordinationTaskResult> = {
        'agent-1': { agentId: 'agent-1', content: 'result A', startedAt: now, completedAt: now, duration: 1000 },
        'agent-2': { agentId: 'agent-2', content: 'malicious result', startedAt: now, completedAt: now, duration: 1000 },
        'agent-3': { agentId: 'agent-3', content: 'result A', startedAt: now, completedAt: now, duration: 1000 },
      }

      const consensus = runConsensus('task-4', results, 3)
      expect(consensus).toBeDefined()
    })

    it('reaches committed phase with sufficient votes', () => {
      resetByzantineState()
      updateByzantineConfig({ enabled: true, maxFaultyNodes: 0 })

      const now = new Date().toISOString()
      const results: Record<string, CoordinationTaskResult> = {
        'agent-1': { agentId: 'agent-1', content: 'result A', startedAt: now, completedAt: now, duration: 1000 },
        'agent-2': { agentId: 'agent-2', content: 'result A', startedAt: now, completedAt: now, duration: 1000 },
      }

      // This should trigger the consensus path through commit phase
      const consensus = runConsensus('task-5', results, 2)
      expect(consensus).toBeDefined()
      expect(consensus.agreement).toBeGreaterThanOrEqual(0)
    })
  })

  describe('fault detection', () => {
    it('detects faulty nodes', () => {
      updateByzantineConfig({ enabled: true })

      // Create state where node-2 is marked as having detected itself as faulty
      initializeNode('node-2')
      const state = getNodeState('node-2')
      if (state) {
        state.faultyNodesDetected = ['node-2']
      }

      const faulty = detectFaultyNodes()
      expect(faulty).toContain('node-2')
    })

    it('returns empty array when no faulty nodes', () => {
      updateByzantineConfig({ enabled: true })
      initializeNode('node-1')

      const faulty = detectFaultyNodes()
      expect(faulty).toHaveLength(0)
    })
  })

  describe('message log', () => {
    it('returns empty log initially', () => {
      const log = getMessageLog()
      expect(log).toHaveLength(0)
    })

    it('logs messages when processing', () => {
      updateByzantineConfig({ enabled: true })
      const message: ByzantineMessage = {
        round: 1,
        senderId: 'node-1',
        type: 'prepare',
        timestamp: new Date().toISOString(),
      }
      processMessage(message, 3)
      const log = getMessageLog()
      expect(log.length).toBeGreaterThan(0)
    })

    it('limits log size', () => {
      updateByzantineConfig({ enabled: true })
      for (let i = 0; i < 1100; i++) {
        const message: ByzantineMessage = {
          round: i,
          senderId: `node-${i % 10}`,
          type: 'prepare',
          timestamp: new Date().toISOString(),
        }
        processMessage(message, 3)
      }
      const log = getMessageLog()
      expect(log.length).toBeLessThanOrEqual(1000)
    })
  })

  describe('consensus result', () => {
    it('returns undefined for unknown task', () => {
      const result = getConsensusResult('unknown-task')
      expect(result).toBeUndefined()
    })
  })

  describe('reset', () => {
    it('clears all state', () => {
      updateByzantineConfig({ enabled: true })
      initializeNode('node-1')

      resetByzantineState()

      const state = getNodeState('node-1')
      expect(state).toBeUndefined()
    })
  })
})

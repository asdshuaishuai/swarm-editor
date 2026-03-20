import { describe, it, expect, beforeEach } from 'vitest'
import {
  updateSchedulingConfig,
  getSchedulingConfig,
  updateAgentLoad,
  getAgentLoad,
  getAllAgentLoads,
  selectBestAgent,
  adjustTaskPriority,
  sortTasksByPriority,
  calculateLoadBalanceEfficiency,
  getSchedulingStats,
  defaultSchedulingConfig,
} from './scheduling'
import type { CoordinationTask } from '../types'

describe('scheduling service', () => {
  beforeEach(() => {
    updateSchedulingConfig(defaultSchedulingConfig)
  })

  describe('configuration', () => {
    it('returns default config', () => {
      const config = getSchedulingConfig()
      expect(config.dynamicPriority).toBe(true)
      expect(config.loadPrediction).toBe(true)
      expect(config.priorityDecayFactor).toBe(0.95)
      expect(config.starvationThreshold).toBe(60000)
      expect(config.loadHistoryWindow).toBe(10)
      expect(config.predictionModel).toBe('exponential')
    })

    it('updates config', () => {
      updateSchedulingConfig({ dynamicPriority: false, priorityDecayFactor: 0.8 })
      const config = getSchedulingConfig()
      expect(config.dynamicPriority).toBe(false)
      expect(config.priorityDecayFactor).toBe(0.8)
    })
  })

  describe('agent load management', () => {
    it('updates agent load', () => {
      const load = updateAgentLoad('agent-1', 3, 5)
      expect(load.agentId).toBe('agent-1')
      expect(load.currentTasks).toBe(3)
      expect(load.maxCapacity).toBe(5)
      expect(load.utilization).toBe(0.6)
    })

    it('calculates utilization correctly', () => {
      const load = updateAgentLoad('agent-1', 5, 10)
      expect(load.utilization).toBe(0.5)
    })

    it('returns agent load', () => {
      updateAgentLoad('agent-1', 3, 5)
      const load = getAgentLoad('agent-1')
      expect(load).toBeDefined()
      expect(load?.currentTasks).toBe(3)
    })

    it('returns undefined for non-existent agent', () => {
      const load = getAgentLoad('nonexistent')
      expect(load).toBeUndefined()
    })

    it('returns all agent loads', () => {
      updateAgentLoad('agent-1', 3, 5)
      updateAgentLoad('agent-2', 2, 10)
      const loads = getAllAgentLoads()
      expect(loads).toHaveLength(2)
    })

    it('tracks load history', () => {
      updateAgentLoad('agent-1', 2, 5)
      updateAgentLoad('agent-1', 3, 5)
      const load = getAgentLoad('agent-1')
      expect(load?.loadHistory).toBeDefined()
      expect(load?.loadHistory.length).toBeGreaterThanOrEqual(2)
    })

    it('calculates average task duration', () => {
      updateAgentLoad('agent-1', 3, 5, 1000)
      const load = getAgentLoad('agent-1')
      expect(load?.avgTaskDuration).toBeGreaterThan(0)
    })
  })

  describe('agent selection', () => {
    it('returns null for empty candidates', () => {
      const selected = selectBestAgent([])
      expect(selected).toBeNull()
    })

    it('returns single candidate', () => {
      const selected = selectBestAgent(['agent-1'])
      expect(selected).toBe('agent-1')
    })

    it('selects agent with lowest load', () => {
      updateAgentLoad('agent-1', 4, 5) // 80% utilization
      updateAgentLoad('agent-2', 1, 5) // 20% utilization

      const selected = selectBestAgent(['agent-1', 'agent-2'])
      expect(selected).toBe('agent-2')
    })

    it('assigns medium score to unknown agents', () => {
      const selected = selectBestAgent(['unknown-1', 'unknown-2'])
      expect(selected).toBeDefined()
    })
  })

  describe('priority adjustment', () => {
    it('adjusts task priority', () => {
      const task: CoordinationTask = {
        id: 'task-1',
        title: 'Test Task',
        prompt: 'Test',
        priority: 5,
        status: 'pending',
        createdAt: new Date().toISOString(),
      }
      const adjustment = adjustTaskPriority(task)
      expect(adjustment.taskId).toBe('task-1')
      expect(adjustment.originalPriority).toBe(5)
      expect(adjustment.adjustedPriority).toBeGreaterThanOrEqual(1)
    })

    it('applies priority decay', () => {
      const oldTask: CoordinationTask = {
        id: 'task-old',
        title: 'Old Task',
        prompt: 'Test',
        priority: 10,
        status: 'pending',
        createdAt: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
      }
      const adjustment = adjustTaskPriority(oldTask)
      // With decay, priority should decrease for old tasks
      expect(adjustment.adjustedPriority).toBeLessThanOrEqual(adjustment.originalPriority)
    })

    it('boosts priority for starving tasks', () => {
      updateSchedulingConfig({ starvationThreshold: 1000 }) // 1 second
      const starvingTask: CoordinationTask = {
        id: 'task-starving',
        title: 'Starving Task',
        prompt: 'Test',
        priority: 5,
        status: 'pending',
        createdAt: new Date(Date.now() - 100000).toISOString(), // 100 seconds ago
      }
      const adjustment = adjustTaskPriority(starvingTask)
      expect(adjustment.reason).toBe('starvation_prevention')
    })
  })

  describe('task sorting', () => {
    it('sorts tasks by priority', () => {
      const tasks: CoordinationTask[] = [
        { id: 'task-1', title: 'Low', prompt: 'Test', priority: 1, status: 'pending', createdAt: new Date().toISOString() },
        { id: 'task-2', title: 'High', prompt: 'Test', priority: 10, status: 'pending', createdAt: new Date().toISOString() },
        { id: 'task-3', title: 'Medium', prompt: 'Test', priority: 5, status: 'pending', createdAt: new Date().toISOString() },
      ]
      const sorted = sortTasksByPriority(tasks)
      expect(sorted[0].id).toBe('task-2') // Highest priority first
    })
  })

  describe('load balance efficiency', () => {
    it('returns efficiency based on current agent loads', () => {
      // Efficiency is calculated based on current agent loads
      const efficiency = calculateLoadBalanceEfficiency()
      expect(efficiency).toBeGreaterThanOrEqual(0)
      expect(efficiency).toBeLessThanOrEqual(1)
    })

    it('calculates efficiency for balanced loads', () => {
      updateAgentLoad('agent-1', 5, 10)
      updateAgentLoad('agent-2', 5, 10)
      const efficiency = calculateLoadBalanceEfficiency()
      expect(efficiency).toBeGreaterThan(0.5)
    })

    it('calculates lower efficiency for unbalanced loads', () => {
      updateAgentLoad('agent-1', 1, 10)
      updateAgentLoad('agent-2', 10, 10)
      const efficiency = calculateLoadBalanceEfficiency()
      expect(efficiency).toBeLessThan(1.0)
    })
  })

  describe('scheduling stats', () => {
    it('returns stats object with expected fields', () => {
      const stats = getSchedulingStats()
      expect(stats).toHaveProperty('totalTasksScheduled')
      expect(stats).toHaveProperty('avgWaitTime')
      expect(stats).toHaveProperty('avgExecutionTime')
      expect(stats).toHaveProperty('starvationPreventions')
      expect(stats).toHaveProperty('loadBalanceEfficiency')
      expect(stats).toHaveProperty('predictionAccuracy')
    })

    it('tracks starvation preventions', () => {
      updateSchedulingConfig({ starvationThreshold: 1000 })
      const starvingTask: CoordinationTask = {
        id: 'task-starving',
        title: 'Starving Task',
        prompt: 'Test',
        priority: 5,
        status: 'pending',
        createdAt: new Date(Date.now() - 100000).toISOString(),
      }
      adjustTaskPriority(starvingTask)
      const stats = getSchedulingStats()
      expect(stats.starvationPreventions).toBeGreaterThan(0)
    })
  })

  describe('edge cases', () => {
    it('handles zero capacity', () => {
      const load = updateAgentLoad('agent-1', 0, 0)
      expect(load.utilization).toBe(0)
    })

    it('handles high task counts', () => {
      const load = updateAgentLoad('agent-1', 100, 5)
      // Utilization can exceed 1 when tasks > capacity
      expect(load.utilization).toBe(20)
    })

    it('handles long task durations', () => {
      const load = updateAgentLoad('agent-1', 3, 5, 3600000) // 1 hour
      // First call uses the provided value directly (no previous average)
      expect(load.avgTaskDuration).toBeGreaterThan(0)
    })
  })
})

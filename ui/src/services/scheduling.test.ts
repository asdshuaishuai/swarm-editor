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
  getPriorityAdjustments,
  resetSchedulingState,
  recordTaskScheduled,
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

    it('uses ml prediction model', () => {
      updateSchedulingConfig({ predictionModel: 'ml' })
      updateAgentLoad('agent-1', 3, 5)
      updateAgentLoad('agent-1', 4, 5)
      updateAgentLoad('agent-1', 2, 5)
      const load = getAgentLoad('agent-1')
      expect(load?.predictedLoad).toBeGreaterThanOrEqual(0)
    })

    it('uses linear prediction model', () => {
      updateSchedulingConfig({ predictionModel: 'linear' })
      updateAgentLoad('agent-1', 3, 5)
      updateAgentLoad('agent-1', 4, 5)
      updateAgentLoad('agent-1', 2, 5)
      const load = getAgentLoad('agent-1')
      expect(load?.predictedLoad).toBeGreaterThanOrEqual(0)
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
        description: 'A test task',
        prompt: 'Test',
        priority: 5,
        status: 'pending',
        assignedTo: [],
        progress: 0,
        results: {},
        createdAt: new Date().toISOString(),
      }
      const adjustment = adjustTaskPriority(task)
      expect(adjustment.taskId).toBe('task-1')
      expect(adjustment.originalPriority).toBe(5)
      expect(adjustment.adjustedPriority).toBeGreaterThanOrEqual(1)
    })

    it('returns original priority when dynamic priority is disabled', () => {
      updateSchedulingConfig({ dynamicPriority: false })
      const task: CoordinationTask = {
        id: 'task-static',
        title: 'Static Task',
        description: 'A task with static priority',
        prompt: 'Test',
        priority: 7,
        status: 'pending',
        assignedTo: [],
        progress: 0,
        results: {},
        createdAt: new Date(Date.now() - 100000).toISOString(),
      }
      const adjustment = adjustTaskPriority(task)
      expect(adjustment.adjustedPriority).toBe(7)
      expect(adjustment.reason).toBe('load_balancing')
    })

    it('applies priority decay', () => {
      const oldTask: CoordinationTask = {
        id: 'task-old',
        title: 'Old Task',
        description: 'An old task',
        prompt: 'Test',
        priority: 10,
        status: 'pending',
        assignedTo: [],
        progress: 0,
        results: {},
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
        description: 'A starving task',
        prompt: 'Test',
        priority: 5,
        status: 'pending',
        assignedTo: [],
        progress: 0,
        results: {},
        createdAt: new Date(Date.now() - 100000).toISOString(), // 100 seconds ago
      }
      const adjustment = adjustTaskPriority(starvingTask)
      expect(adjustment.reason).toBe('starvation_prevention')
    })
  })

  describe('task sorting', () => {
    it('sorts tasks by priority', () => {
      const now = new Date().toISOString()
      const tasks: CoordinationTask[] = [
        { id: 'task-1', title: 'Low', description: 'Low priority task', prompt: 'Test', priority: 1, status: 'pending', assignedTo: [], progress: 0, results: {}, createdAt: now },
        { id: 'task-2', title: 'High', description: 'High priority task', prompt: 'Test', priority: 10, status: 'pending', assignedTo: [], progress: 0, results: {}, createdAt: now },
        { id: 'task-3', title: 'Medium', description: 'Medium priority task', prompt: 'Test', priority: 5, status: 'pending', assignedTo: [], progress: 0, results: {}, createdAt: now },
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
        description: 'A starving task',
        prompt: 'Test',
        priority: 5,
        status: 'pending',
        assignedTo: [],
        progress: 0,
        results: {},
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

  describe('priority adjustments history', () => {
    it('returns empty array initially', () => {
      resetSchedulingState()
      const adjustments = getPriorityAdjustments()
      expect(adjustments).toHaveLength(0)
    })

    it('returns priority adjustments after tasks are adjusted', () => {
      const task: CoordinationTask = {
        id: 'task-1',
        title: 'Test Task',
        description: 'A test task',
        prompt: 'Test',
        priority: 5,
        status: 'pending',
        assignedTo: [],
        progress: 0,
        results: {},
        createdAt: new Date().toISOString(),
      }
      adjustTaskPriority(task)
      const adjustments = getPriorityAdjustments()
      expect(adjustments.length).toBeGreaterThan(0)
      expect(adjustments[0].taskId).toBe('task-1')
    })

    it('limits the number of returned adjustments', () => {
      resetSchedulingState()
      for (let i = 0; i < 50; i++) {
        const task: CoordinationTask = {
          id: `task-${i}`,
          title: `Task ${i}`,
          description: 'A test task',
          prompt: 'Test',
          priority: i,
          status: 'pending',
          assignedTo: [],
          progress: 0,
          results: {},
          createdAt: new Date().toISOString(),
        }
        adjustTaskPriority(task)
      }
      const adjustments = getPriorityAdjustments(10)
      expect(adjustments.length).toBeLessThanOrEqual(10)
    })

    it('trims priority adjustments when exceeding 100 items', () => {
      resetSchedulingState()
      for (let i = 0; i < 110; i++) {
        const task: CoordinationTask = {
          id: `task-${i}`,
          title: `Task ${i}`,
          description: 'A test task',
          prompt: 'Test',
          priority: i % 10,
          status: 'pending',
          assignedTo: [],
          progress: 0,
          results: {},
          createdAt: new Date().toISOString(),
        }
        adjustTaskPriority(task)
      }
      const adjustments = getPriorityAdjustments()
      expect(adjustments.length).toBeLessThanOrEqual(100)
    })
  })

  describe('reset state', () => {
    it('clears all agent loads', () => {
      updateAgentLoad('agent-1', 3, 5)
      resetSchedulingState()
      const load = getAgentLoad('agent-1')
      expect(load).toBeUndefined()
    })

    it('resets scheduling stats', () => {
      const task: CoordinationTask = {
        id: 'task-1',
        title: 'Test Task',
        description: 'A test task',
        prompt: 'Test',
        priority: 5,
        status: 'pending',
        assignedTo: [],
        progress: 0,
        results: {},
        createdAt: new Date(Date.now() - 100000).toISOString(),
      }
      updateSchedulingConfig({ starvationThreshold: 1000 })
      adjustTaskPriority(task)

      resetSchedulingState()

      const stats = getSchedulingStats()
      expect(stats.totalTasksScheduled).toBe(0)
      expect(stats.avgWaitTime).toBe(0)
      expect(stats.starvationPreventions).toBe(0)
    })

    it('clears priority adjustments', () => {
      const task: CoordinationTask = {
        id: 'task-1',
        title: 'Test Task',
        description: 'A test task',
        prompt: 'Test',
        priority: 5,
        status: 'pending',
        assignedTo: [],
        progress: 0,
        results: {},
        createdAt: new Date().toISOString(),
      }
      adjustTaskPriority(task)
      resetSchedulingState()
      const adjustments = getPriorityAdjustments()
      expect(adjustments).toHaveLength(0)
    })
  })

  describe('record task scheduled', () => {
    it('increments total tasks scheduled', () => {
      resetSchedulingState()
      const task: CoordinationTask = {
        id: 'task-1',
        title: 'Test Task',
        description: 'A test task',
        prompt: 'Test',
        priority: 5,
        status: 'pending',
        assignedTo: [],
        progress: 0,
        results: {},
        createdAt: new Date().toISOString(),
      }
      recordTaskScheduled(task, 'agent-1')
      const stats = getSchedulingStats()
      expect(stats.totalTasksScheduled).toBe(1)
    })

    it('updates average execution time', () => {
      resetSchedulingState()
      const task: CoordinationTask = {
        id: 'task-1',
        title: 'Test Task',
        description: 'A test task',
        prompt: 'Test',
        priority: 5,
        status: 'pending',
        assignedTo: [],
        progress: 0,
        results: {},
        createdAt: new Date().toISOString(),
      }
      recordTaskScheduled(task, 'agent-1', 1000)
      const stats = getSchedulingStats()
      expect(stats.avgExecutionTime).toBeGreaterThan(0)
    })

    it('updates agent load when agent exists', () => {
      resetSchedulingState()
      updateAgentLoad('agent-1', 2, 5)

      const task: CoordinationTask = {
        id: 'task-1',
        title: 'Test Task',
        description: 'A test task',
        prompt: 'Test',
        priority: 5,
        status: 'pending',
        assignedTo: [],
        progress: 0,
        results: {},
        createdAt: new Date().toISOString(),
      }
      recordTaskScheduled(task, 'agent-1')

      const load = getAgentLoad('agent-1')
      expect(load?.currentTasks).toBe(3)
    })

    it('handles non-existent agent gracefully', () => {
      resetSchedulingState()
      const task: CoordinationTask = {
        id: 'task-1',
        title: 'Test Task',
        description: 'A test task',
        prompt: 'Test',
        priority: 5,
        status: 'pending',
        assignedTo: [],
        progress: 0,
        results: {},
        createdAt: new Date().toISOString(),
      }
      // Should not throw
      expect(() => recordTaskScheduled(task, 'unknown-agent')).not.toThrow()
    })
  })
})

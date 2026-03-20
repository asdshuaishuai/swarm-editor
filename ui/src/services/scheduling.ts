/**
 * Scheduling Algorithm Service
 * Implements dynamic priority adjustment and load prediction for team coordination
 */

import type {
  CoordinationTask,
  AgentLoadInfo,
  LoadHistoryEntry,
  PriorityAdjustment,
  SchedulingConfig,
  SchedulingStats,
} from '../types'
import { logger } from '../utils'

// Default scheduling configuration
export const defaultSchedulingConfig: SchedulingConfig = {
  dynamicPriority: true,
  loadPrediction: true,
  priorityDecayFactor: 0.95,
  starvationThreshold: 60000, // 60 seconds
  loadHistoryWindow: 10,
  predictionModel: 'exponential',
}

// In-memory state
let schedulingConfig = { ...defaultSchedulingConfig }
const agentLoadMap = new Map<string, AgentLoadInfo>()
const taskWaitTimes = new Map<string, number>()
const priorityAdjustments: PriorityAdjustment[] = []
let schedulingStats: SchedulingStats = {
  totalTasksScheduled: 0,
  avgWaitTime: 0,
  avgExecutionTime: 0,
  starvationPreventions: 0,
  loadBalanceEfficiency: 1.0,
  predictionAccuracy: 0.85,
}

/**
 * Update scheduling configuration
 */
export function updateSchedulingConfig(config: Partial<SchedulingConfig>): void {
  schedulingConfig = { ...schedulingConfig, ...config }
  logger.info('Scheduling', 'Configuration updated:', config)
}

/**
 * Get current scheduling configuration
 */
export function getSchedulingConfig(): SchedulingConfig {
  return { ...schedulingConfig }
}

/**
 * Update agent load information
 */
export function updateAgentLoad(
  agentId: string,
  currentTasks: number,
  maxCapacity: number,
  taskDuration?: number
): AgentLoadInfo {
  const now = new Date().toISOString()
  const existingInfo = agentLoadMap.get(agentId)
  
  const utilization = maxCapacity > 0 ? currentTasks / maxCapacity : 0
  
  // Calculate average task duration
  let avgTaskDuration = taskDuration || 5000
  if (existingInfo && existingInfo.avgTaskDuration > 0) {
    avgTaskDuration = (existingInfo.avgTaskDuration * 0.8) + ((taskDuration || 5000) * 0.2)
  }
  
  // Update load history
  const loadHistory: LoadHistoryEntry[] = existingInfo?.loadHistory || []
  loadHistory.push({
    timestamp: now,
    utilization,
    taskCount: currentTasks,
  })
  
  // Keep only the last N entries
  if (loadHistory.length > schedulingConfig.loadHistoryWindow) {
    loadHistory.shift()
  }
  
  // Predict future load
  const predictedLoad = predictLoad(loadHistory)
  
  const loadInfo: AgentLoadInfo = {
    agentId,
    currentTasks,
    maxCapacity,
    utilization,
    avgTaskDuration,
    predictedLoad,
    loadHistory,
  }
  
  agentLoadMap.set(agentId, loadInfo)
  return loadInfo
}

/**
 * Predict future load based on history
 */
function predictLoad(history: LoadHistoryEntry[]): number {
  if (history.length === 0) return 0
  if (history.length === 1) return history[0].utilization
  
  switch (schedulingConfig.predictionModel) {
    case 'linear':
      return predictLinear(history)
    case 'exponential':
      return predictExponential(history)
    case 'ml':
      // Simplified ML-like prediction using weighted average
      return predictWeighted(history)
    default:
      return predictExponential(history)
  }
}

/**
 * Linear regression prediction
 */
function predictLinear(history: LoadHistoryEntry[]): number {
  const n = history.length
  if (n < 2) return history[0]?.utilization || 0
  
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0
  
  history.forEach((entry, i) => {
    sumX += i
    sumY += entry.utilization
    sumXY += i * entry.utilization
    sumXX += i * i
  })
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n
  
  // Predict next value
  const predicted = slope * n + intercept
  return Math.max(0, Math.min(1, predicted))
}

/**
 * Exponential weighted moving average prediction
 */
function predictExponential(history: LoadHistoryEntry[]): number {
  const alpha = 0.3 // Smoothing factor
  let predicted = history[0].utilization
  
  for (let i = 1; i < history.length; i++) {
    predicted = alpha * history[i].utilization + (1 - alpha) * predicted
  }
  
  return Math.max(0, Math.min(1, predicted))
}

/**
 * Weighted average prediction (simplified ML-like)
 */
function predictWeighted(history: LoadHistoryEntry[]): number {
  const weights = history.map((_, i) => Math.exp(i * 0.2))
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  
  const weightedSum = history.reduce((sum, entry, i) => {
    return sum + entry.utilization * weights[i]
  }, 0)
  
  return weightedSum / totalWeight
}

/**
 * Get agent load information
 */
export function getAgentLoad(agentId: string): AgentLoadInfo | undefined {
  return agentLoadMap.get(agentId)
}

/**
 * Get all agent load information
 */
export function getAllAgentLoads(): AgentLoadInfo[] {
  return Array.from(agentLoadMap.values())
}

/**
 * Select best agent for task based on load prediction
 */
export function selectBestAgent(
  candidateAgents: string[],
  _requiredRole?: string
): string | null {
  if (candidateAgents.length === 0) return null
  if (candidateAgents.length === 1) return candidateAgents[0]
  
  // Score each agent
  const scores = candidateAgents.map(agentId => {
    const loadInfo = agentLoadMap.get(agentId)
    if (!loadInfo) {
      return { agentId, score: 0.5 } // Unknown agents get medium score
    }
    
    // Lower predicted load = higher score
    const loadScore = 1 - loadInfo.predictedLoad
    
    // Lower current utilization = higher score
    const utilizationScore = 1 - loadInfo.utilization
    
    // Fewer current tasks = higher score
    const taskScore = loadInfo.maxCapacity > 0 
      ? 1 - (loadInfo.currentTasks / loadInfo.maxCapacity)
      : 0.5
    
    // Combined score with weights
    const score = (loadScore * 0.4) + (utilizationScore * 0.3) + (taskScore * 0.3)
    
    return { agentId, score }
  })
  
  // Sort by score descending and return best agent
  scores.sort((a, b) => b.score - a.score)
  return scores[0].agentId
}

/**
 * Adjust task priority dynamically
 */
export function adjustTaskPriority(
  task: CoordinationTask,
  currentTime: number = Date.now()
): PriorityAdjustment {
  const originalPriority = task.priority
  let adjustedPriority = originalPriority
  let reason: PriorityAdjustment['reason'] = 'load_balancing'
  
  if (!schedulingConfig.dynamicPriority) {
    return {
      taskId: task.id,
      originalPriority,
      adjustedPriority,
      reason,
      timestamp: new Date(currentTime).toISOString(),
    }
  }
  
  // Calculate wait time
  const createdAt = task.createdAt ? new Date(task.createdAt).getTime() : currentTime
  const waitTime = currentTime - createdAt
  taskWaitTimes.set(task.id, waitTime)
  
  // Check for starvation prevention
  if (waitTime > schedulingConfig.starvationThreshold) {
    // Boost priority for tasks waiting too long
    const boostFactor = 1 + (waitTime - schedulingConfig.starvationThreshold) / 60000
    adjustedPriority = Math.min(10, originalPriority * boostFactor)
    reason = 'starvation_prevention'
    
    schedulingStats.starvationPreventions++
    logger.info('Scheduling', `Starvation prevention for task ${task.id}: ${originalPriority} -> ${adjustedPriority}`)
  } else {
    // Apply priority decay
    const decayFactor = schedulingConfig.priorityDecayFactor
    const timeSinceCreation = (currentTime - createdAt) / 1000 // seconds
    adjustedPriority = originalPriority * Math.pow(decayFactor, timeSinceCreation / 60) // decay per minute
    adjustedPriority = Math.max(1, Math.round(adjustedPriority))
  }
  
  const adjustment: PriorityAdjustment = {
    taskId: task.id,
    originalPriority,
    adjustedPriority: Math.round(adjustedPriority * 10) / 10,
    reason,
    timestamp: new Date(currentTime).toISOString(),
  }
  
  priorityAdjustments.push(adjustment)
  
  // Keep only recent adjustments
  if (priorityAdjustments.length > 100) {
    priorityAdjustments.shift()
  }
  
  return adjustment
}

/**
 * Sort tasks by adjusted priority
 */
export function sortTasksByPriority(
  tasks: CoordinationTask[]
): CoordinationTask[] {
  const currentTime = Date.now()
  
  return tasks
    .map(task => {
      const adjustment = adjustTaskPriority(task, currentTime)
      return {
        task,
        adjustedPriority: adjustment.adjustedPriority,
      }
    })
    .sort((a, b) => b.adjustedPriority - a.adjustedPriority)
    .map(({ task }) => task)
}

/**
 * Calculate load balance efficiency
 */
export function calculateLoadBalanceEfficiency(): number {
  const loads = getAllAgentLoads()
  if (loads.length === 0) return 1.0
  
  const utilizations = loads.map(l => l.utilization)
  const avgUtilization = utilizations.reduce((a, b) => a + b, 0) / utilizations.length
  
  // Calculate standard deviation
  const variance = utilizations.reduce((sum, u) => {
    return sum + Math.pow(u - avgUtilization, 2)
  }, 0) / utilizations.length
  
  const stdDev = Math.sqrt(variance)
  
  // Efficiency is inverse of normalized standard deviation
  // Lower stdDev = higher efficiency
  const efficiency = 1 - Math.min(1, stdDev * 2)
  
  schedulingStats.loadBalanceEfficiency = efficiency
  return efficiency
}

/**
 * Get scheduling statistics
 */
export function getSchedulingStats(): SchedulingStats {
  // Update average wait time
  const waitTimes = Array.from(taskWaitTimes.values())
  if (waitTimes.length > 0) {
    schedulingStats.avgWaitTime = waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length
  }
  
  return { ...schedulingStats }
}

/**
 * Get recent priority adjustments
 */
export function getPriorityAdjustments(limit: number = 20): PriorityAdjustment[] {
  return priorityAdjustments.slice(-limit)
}

/**
 * Reset scheduling state
 */
export function resetSchedulingState(): void {
  agentLoadMap.clear()
  taskWaitTimes.clear()
  priorityAdjustments.length = 0
  schedulingStats = {
    totalTasksScheduled: 0,
    avgWaitTime: 0,
    avgExecutionTime: 0,
    starvationPreventions: 0,
    loadBalanceEfficiency: 1.0,
    predictionAccuracy: 0.85,
  }
  logger.info('Scheduling', 'State reset')
}

/**
 * Record task scheduling event
 */
export function recordTaskScheduled(
  task: CoordinationTask,
  agentId: string,
  executionTime?: number
): void {
  schedulingStats.totalTasksScheduled++
  
  if (executionTime) {
    // Update average execution time using exponential moving average
    schedulingStats.avgExecutionTime = 
      schedulingStats.avgExecutionTime * 0.9 + executionTime * 0.1
  }
  
  // Update agent load
  const loadInfo = agentLoadMap.get(agentId)
  if (loadInfo) {
    updateAgentLoad(
      agentId,
      loadInfo.currentTasks + 1,
      loadInfo.maxCapacity,
      executionTime
    )
  }
  
  logger.debug('Scheduling', `Task ${task.id} scheduled to agent ${agentId}`)
}

/**
 * Export scheduling service
 */
export const schedulingService = {
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
  getPriorityAdjustments,
  resetSchedulingState,
  recordTaskScheduled,
}

export default schedulingService

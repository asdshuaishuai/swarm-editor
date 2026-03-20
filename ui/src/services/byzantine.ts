/**
 * Byzantine Fault Tolerance Service
 * Implements PBFT-style consensus for swarm coordination
 */

import type {
  ByzantineConfig,
  ByzantineMessage,
  ByzantineState,
  CoordinationTaskResult,
  ConsensusResult,
} from '../types'
import { logger } from '../utils'

// Default Byzantine configuration
export const defaultByzantineConfig: ByzantineConfig = {
  enabled: false,
  maxFaultyNodes: 1,
  consensusRounds: 3,
  timeoutMs: 30000,
  verificationMethod: 'majority_vote',
}

// In-memory state
let byzantineConfig = { ...defaultByzantineConfig }
const nodeStates = new Map<string, ByzantineState>()
const messageLog: ByzantineMessage[] = []
const consensusResults = new Map<string, ConsensusResult>()

/**
 * Update Byzantine configuration
 */
export function updateByzantineConfig(config: Partial<ByzantineConfig>): void {
  byzantineConfig = { ...byzantineConfig, ...config }
  logger.info('Byzantine', 'Configuration updated:', config)
}

/**
 * Get current Byzantine configuration
 */
export function getByzantineConfig(): ByzantineConfig {
  return { ...byzantineConfig }
}

/**
 * Initialize Byzantine state for a node
 */
export function initializeNode(nodeId: string): ByzantineState {
  const state: ByzantineState = {
    phase: 'idle',
    currentRound: 0,
    commitCount: 0,
    prepareCount: 0,
    faultyNodesDetected: [],
  }
  
  nodeStates.set(nodeId, state)
  return state
}

/**
 * Get node state
 */
export function getNodeState(nodeId: string): ByzantineState | undefined {
  return nodeStates.get(nodeId)
}

/**
 * Process Byzantine message
 */
export function processMessage(
  message: ByzantineMessage,
  totalNodes: number
): { state: ByzantineState; consensus?: ConsensusResult } {
  if (!byzantineConfig.enabled) {
    return { state: initializeNode(message.senderId) }
  }
  
  // Log message
  messageLog.push(message)
  if (messageLog.length > 1000) {
    messageLog.shift()
  }
  
  let state = nodeStates.get(message.senderId)
  if (!state) {
    state = initializeNode(message.senderId)
  }
  
  // Calculate minimum required nodes for consensus
  // For PBFT: need 3f + 1 nodes where f is max faulty nodes
  const requiredVotes = Math.ceil((2 * totalNodes + 1) / 3)
  // Minimum nodes: 3f + 1 for Byzantine fault tolerance
  void (3 * byzantineConfig.maxFaultyNodes + 1) // Used for validation
  
  switch (message.type) {
    case 'prepare':
      state = handlePrepare(state, message, requiredVotes)
      break
    case 'commit':
      state = handleCommit(state, message, requiredVotes, totalNodes)
      break
    case 'view_change':
      state = handleViewChange(state, message)
      break
    case 'new_view':
      state = handleNewView(state, message)
      break
  }
  
  nodeStates.set(message.senderId, state)
  
  // Check if consensus reached
  let consensus: ConsensusResult | undefined
  if (state.phase === 'committed' && state.preparedValue !== undefined) {
    consensus = {
      agreement: state.commitCount / totalNodes,
      votes: {}, // Would be populated with actual votes in production
      finalResult: state.preparedValue as CoordinationTaskResult,
    }
    consensusResults.set(message.senderId, consensus)
  }
  
  return { state, consensus }
}

/**
 * Handle prepare message
 */
function handlePrepare(
  state: ByzantineState,
  message: ByzantineMessage,
  requiredVotes: number
): ByzantineState {
  if (state.phase === 'idle' || state.phase === 'preparing') {
    state.phase = 'preparing'
    state.prepareCount++
    state.currentRound = message.round
    
    // Store the value being prepared
    if (message.value !== undefined && state.preparedValue === undefined) {
      state.preparedValue = message.value
    }
    
    // Check if we have enough prepare messages
    if (state.prepareCount >= requiredVotes) {
      state.phase = 'prepared'
      logger.info('Byzantine', `Prepared phase reached with ${state.prepareCount} votes`)
    }
  }
  
  return state
}

/**
 * Handle commit message
 */
function handleCommit(
  state: ByzantineState,
  message: ByzantineMessage,
  requiredVotes: number,
  _totalNodes: number
): ByzantineState {
  if (state.phase === 'prepared' || state.phase === 'committing') {
    state.phase = 'committing'
    state.commitCount++
    
    // Verify the commit matches our prepared value
    if (message.value !== undefined && 
        state.preparedValue !== undefined && 
        !deepEqual(message.value, state.preparedValue)) {
      // Potential Byzantine behavior detected
      logger.warn('Byzantine', `Value mismatch detected from node ${message.senderId}`)
      if (!state.faultyNodesDetected.includes(message.senderId)) {
        state.faultyNodesDetected.push(message.senderId)
      }
      return state
    }
    
    // Check if we have enough commit messages
    if (state.commitCount >= requiredVotes) {
      state.phase = 'committed'
      logger.info('Byzantine', `Committed phase reached with ${state.commitCount} votes`)
    }
  }
  
  return state
}

/**
 * Handle view change message
 */
function handleViewChange(
  state: ByzantineState,
  message: ByzantineMessage
): ByzantineState {
  state.phase = 'view_change'
  state.currentRound = message.round
  logger.info('Byzantine', `View change initiated for round ${message.round}`)
  return state
}

/**
 * Handle new view message
 */
function handleNewView(
  state: ByzantineState,
  message: ByzantineMessage
): ByzantineState {
  state.phase = 'preparing'
  state.currentRound = message.round
  state.prepareCount = 0
  state.commitCount = 0
  logger.info('Byzantine', `New view started for round ${message.round}`)
  return state
}

/**
 * Deep equality check for Byzantine value comparison
 */
function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Verify message signature (simplified)
 */
export function verifyMessage(message: ByzantineMessage): boolean {
  if (!message.signature) {
    return byzantineConfig.verificationMethod === 'majority_vote'
  }
  
  // In production, this would verify actual cryptographic signatures
  // For now, we use a simple hash verification
  const expectedSig = simpleHash(`${message.senderId}:${message.round}:${message.type}`)
  return message.signature === expectedSig
}

/**
 * Simple hash function for demonstration
 */
function simpleHash(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return hash.toString(16)
}

/**
 * Sign a message (simplified)
 */
export function signMessage(message: ByzantineMessage, nodeId: string): ByzantineMessage {
  const signature = simpleHash(`${nodeId}:${message.round}:${message.type}`)
  return { ...message, signature }
}

/**
 * Create a new Byzantine message
 */
export function createMessage(
  senderId: string,
  type: ByzantineMessage['type'],
  round: number,
  value?: unknown
): ByzantineMessage {
  const message: ByzantineMessage = {
    round,
    senderId,
    type,
    value,
    timestamp: new Date().toISOString(),
  }
  
  return signMessage(message, senderId)
}

/**
 * Run Byzantine consensus for task results
 */
export function runConsensus(
  _taskId: string,
  results: Record<string, CoordinationTaskResult>,
  totalNodes: number
): ConsensusResult {
  if (!byzantineConfig.enabled) {
    // Fall back to simple majority
    return simpleMajorityConsensus(results)
  }

  const nodeIds = Object.keys(results)

  // Initialize nodes
  nodeIds.forEach(id => initializeNode(id))

  // Phase 1: Prepare
  const prepareMessages = nodeIds.map(nodeId =>
    createMessage(nodeId, 'prepare', 1, results[nodeId])
  )

  prepareMessages.forEach(msg => processMessage(msg, totalNodes))

  // Phase 2: Commit
  const commitMessages = nodeIds.map(nodeId =>
    createMessage(nodeId, 'commit', 1, results[nodeId])
  )

  const commitResults = commitMessages.map(msg =>
    processMessage(msg, totalNodes)
  )

  // Find the committed result
  const committedResult = commitResults.find(r => r.consensus !== undefined)
  
  if (committedResult && committedResult.consensus) {
    return committedResult.consensus
  }
  
  // If no consensus, check for Byzantine nodes and fall back
  const faultyNodes = detectFaultyNodes()
  if (faultyNodes.length > 0) {
    logger.warn('Byzantine', `Detected ${faultyNodes.length} faulty nodes: ${faultyNodes.join(', ')}`)
    
    // Filter out faulty node results
    const validResults: Record<string, CoordinationTaskResult> = {}
    nodeIds.forEach(id => {
      if (!faultyNodes.includes(id)) {
        validResults[id] = results[id]
      }
    })
    
    return simpleMajorityConsensus(validResults)
  }
  
  return simpleMajorityConsensus(results)
}

/**
 * Simple majority consensus fallback
 */
function simpleMajorityConsensus(
  results: Record<string, CoordinationTaskResult>
): ConsensusResult {
  const values = Object.values(results)
  const totalVotes = values.length

  // Group results by content similarity
  const resultGroups = new Map<string, { count: number; result: CoordinationTaskResult }>()

  values.forEach(result => {
    const key = result.content.slice(0, 100) // Use first 100 chars as key
    const existing = resultGroups.get(key)
    if (existing) {
      existing.count++
    } else {
      resultGroups.set(key, { count: 1, result })
    }
  })

  // Find majority
  type MajorityEntry = { count: number; result: CoordinationTaskResult }
  let majorityEntry: MajorityEntry | undefined
  resultGroups.forEach(entry => {
    if (!majorityEntry || entry.count > majorityEntry.count) {
      majorityEntry = entry
    }
  })

  const agreement = majorityEntry ? majorityEntry.count / totalVotes : 0
  const votes: Record<string, boolean> = {}

  Object.entries(results).forEach(([agentId, result]) => {
    const key = result.content.slice(0, 100)
    votes[agentId] = majorityEntry !== undefined &&
      resultGroups.get(key)?.result === majorityEntry.result
  })

  return {
    agreement,
    votes,
    finalResult: majorityEntry?.result,
  }
}

/**
 * Detect faulty nodes based on behavior
 */
export function detectFaultyNodes(): string[] {
  const faultyNodes: string[] = []
  
  nodeStates.forEach((state, nodeId) => {
    if (state.faultyNodesDetected.includes(nodeId)) {
      faultyNodes.push(nodeId)
    }
  })
  
  return faultyNodes
}

/**
 * Get message log
 */
export function getMessageLog(limit: number = 100): ByzantineMessage[] {
  return messageLog.slice(-limit)
}

/**
 * Get consensus result for a task
 */
export function getConsensusResult(taskId: string): ConsensusResult | undefined {
  return consensusResults.get(taskId)
}

/**
 * Reset Byzantine state
 */
export function resetByzantineState(): void {
  nodeStates.clear()
  messageLog.length = 0
  consensusResults.clear()
  logger.info('Byzantine', 'State reset')
}

/**
 * Export Byzantine service
 */
export const byzantineService = {
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
}

export default byzantineService

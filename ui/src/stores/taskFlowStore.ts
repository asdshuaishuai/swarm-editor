import { create } from 'zustand'
import { api } from '../services'
import { logger } from '../utils'

export interface TaskFlowEntry {
  taskId: string
  swarmId: string
  title: string
  status: string // pending | running | completed | failed | cancelled
  assignedAgents: string[]
  handoffs: HandoffEvent[]
  toolCalls: ToolInvocation[]
  createdAt: string
  completedAt?: string
}

export interface HandoffEvent {
  id: string
  taskId: string
  fromAgent: string
  toAgent: string
  reason: string
  timestamp: string
  accepted: boolean
}

export interface ToolInvocation {
  id: string
  serverId: string
  toolName: string
  args: Record<string, unknown>
  result?: unknown
  error?: string
  durationMs: number
  agentId?: string
  timestamp: string
}

export interface NodeFlowEntry {
  nodeId: string
  workflowId: string
  nodeName: string
  nodeType: string
  agentId?: string
  status: string // pending | running | completed | failed | cached
  startedAt?: string
  completedAt?: string
  progress: number
}

const MAX_HANDOFFS = 100
// Trim oldest tool invocations when the array exceeds this limit
const MAX_TOOL_INVOCATIONS = 200

// Trim helper: keeps only the last N entries
function trimToMax<T>(arr: T[], max: number): T[] {
  return arr.length > max ? arr.slice(-max) : arr
}

interface TaskFlowStore {
  tasks: Map<string, TaskFlowEntry>
  handoffChain: HandoffEvent[]
  toolInvocations: ToolInvocation[]
  nodeFlows: Map<string, NodeFlowEntry>

  // Actions
  subscribe: () => () => void // wire all events, return cleanup
  getTaskChain: (taskId: string) => HandoffEvent[]
  getAgentToolHistory: (agentId: string) => ToolInvocation[]
  getAgentHandoffs: (agentId: string) => HandoffEvent[]
  getWorkflowNodes: (workflowId: string) => NodeFlowEntry[]
  clearHistory: () => void
}

export const useTaskFlowStore = create<TaskFlowStore>()((set, get) => ({
  tasks: new Map<string, TaskFlowEntry>(),
  handoffChain: [],
  toolInvocations: [],
  nodeFlows: new Map<string, NodeFlowEntry>(),

  subscribe: () => {
    const unsubscribers: Array<() => void> = []

    // swarm_task_update → update task status in map
    unsubscribers.push(
      api.events.onSwarmTaskUpdate((payload) => {
        const { swarmId, taskId, status } = payload
        set((state) => {
          const tasks = new Map(state.tasks)
          const existing = tasks.get(taskId)
          if (existing) {
            tasks.set(taskId, {
              ...existing,
              status,
              completedAt:
                status === 'completed' || status === 'failed' || status === 'cancelled'
                  ? new Date().toISOString()
                  : existing.completedAt,
            })
          } else {
            // New task discovered from event
            tasks.set(taskId, {
              taskId,
              swarmId,
              title: `Task ${taskId.slice(0, 8)}`,
              status,
              assignedAgents: [],
              handoffs: [],
              toolCalls: [],
              createdAt: new Date().toISOString(),
            })
          }
          return { tasks }
        })
        logger.debug('TaskFlow', 'Task updated', { taskId, status, swarmId })
      })
    )

    // handoff_requested → add to handoffChain + update task entry
    unsubscribers.push(
      api.events.onHandoffRequested((payload) => {
        const { requestId, fromAgent, toAgent, taskId, reason } = payload
        const handoff: HandoffEvent = {
          id: requestId,
          taskId,
          fromAgent,
          toAgent,
          reason: reason || '',
          timestamp: new Date().toISOString(),
          accepted: false,
        }

        set((state) => {
          const tasks = new Map(state.tasks)
          const taskEntry = tasks.get(taskId)
          if (taskEntry) {
            const updatedAssigned = taskEntry.assignedAgents.includes(toAgent)
              ? taskEntry.assignedAgents
              : [...taskEntry.assignedAgents, toAgent]
            tasks.set(taskId, {
              ...taskEntry,
              assignedAgents: updatedAssigned,
              handoffs: [...taskEntry.handoffs, handoff],
            })
          }

          const chain = [...state.handoffChain, handoff]
          return {
            tasks,
            handoffChain: trimToMax(chain, MAX_HANDOFFS),
            toolInvocations: trimToMax(state.toolInvocations, MAX_TOOL_INVOCATIONS),
          }
        })
        logger.debug('TaskFlow', 'Handoff requested', { requestId, fromAgent, toAgent, taskId })
      })
    )

    // handoff_accepted → mark handoff accepted
    unsubscribers.push(
      api.events.onHandoffAccepted((payload) => {
        const { requestId } = payload
        set((state) => {
          const handoffChain = state.handoffChain.map((h) =>
            h.id === requestId ? { ...h, accepted: true } : h
          )
          const tasks = new Map(state.tasks)
          for (const [key, task] of tasks) {
            const handoffIdx = task.handoffs.findIndex((h) => h.id === requestId)
            if (handoffIdx !== -1) {
              const updatedHandoffs = [...task.handoffs]
              updatedHandoffs[handoffIdx] = { ...updatedHandoffs[handoffIdx], accepted: true }
              tasks.set(key, { ...task, handoffs: updatedHandoffs })
            }
          }
          return { handoffChain, tasks }
        })
        logger.debug('TaskFlow', 'Handoff accepted', { requestId })
      })
    )

    // handoff_rejected → mark handoff rejected (accepted stays false, already the default)
    unsubscribers.push(
      api.events.onHandoffRejected((payload) => {
        const { requestId, reason } = payload
        set((state) => {
          const handoffChain = state.handoffChain.map((h) =>
            h.id === requestId ? { ...h, accepted: false, reason: reason || h.reason } : h
          )
          const tasks = new Map(state.tasks)
          for (const [key, task] of tasks) {
            const handoffIdx = task.handoffs.findIndex((h) => h.id === requestId)
            if (handoffIdx !== -1) {
              const updatedHandoffs = [...task.handoffs]
              updatedHandoffs[handoffIdx] = {
                ...updatedHandoffs[handoffIdx],
                accepted: false,
                reason: reason || updatedHandoffs[handoffIdx].reason,
              }
              tasks.set(key, { ...task, handoffs: updatedHandoffs })
            }
          }
          return { handoffChain, tasks }
        })
        logger.debug('TaskFlow', 'Handoff rejected', { requestId })
      })
    )

    // handoff_completed → mark handoff completed (accepted = true)
    unsubscribers.push(
      api.events.onHandoffCompleted((payload) => {
        const { requestId, summary } = payload
        set((state) => {
          const handoffChain = state.handoffChain.map((h) =>
            h.id === requestId
              ? { ...h, accepted: true, reason: summary ? `${h.reason} — ${summary}` : h.reason }
              : h
          )
          const tasks = new Map(state.tasks)
          for (const [key, task] of tasks) {
            const handoffIdx = task.handoffs.findIndex((h) => h.id === requestId)
            if (handoffIdx !== -1) {
              const updatedHandoffs = [...task.handoffs]
              updatedHandoffs[handoffIdx] = {
                ...updatedHandoffs[handoffIdx],
                accepted: true,
                reason: summary
                  ? `${updatedHandoffs[handoffIdx].reason} — ${summary}`
                  : updatedHandoffs[handoffIdx].reason,
              }
              tasks.set(key, { ...task, handoffs: updatedHandoffs })
            }
          }
          return { handoffChain, tasks }
        })
        logger.debug('TaskFlow', 'Handoff completed', { requestId })
      })
    )

    // agent_turn_start → track which agent is working on which task
    unsubscribers.push(
      api.events.onAgentTurnStart((payload) => {
        const { agentId, taskId } = payload
        set((state) => {
          const tasks = new Map(state.tasks)
          const taskEntry = tasks.get(taskId)
          if (taskEntry) {
            const updatedAssigned = taskEntry.assignedAgents.includes(agentId)
              ? taskEntry.assignedAgents
              : [...taskEntry.assignedAgents, agentId]
            tasks.set(taskId, {
              ...taskEntry,
              status: 'running',
              assignedAgents: updatedAssigned,
            })
          } else {
            tasks.set(taskId, {
              taskId,
              swarmId: '',
              title: `Task ${taskId.slice(0, 8)}`,
              status: 'running',
              assignedAgents: [agentId],
              handoffs: [],
              toolCalls: [],
              createdAt: new Date().toISOString(),
            })
          }
          return { tasks }
        })
        logger.debug('TaskFlow', 'Agent turn started', { agentId, taskId })
      })
    )

    // agent_turn_end → track completion
    unsubscribers.push(
      api.events.onAgentTurnEnd((payload) => {
        const { agentId, taskId, duration, success } = payload
        set((state) => {
          const tasks = new Map(state.tasks)
          const taskEntry = tasks.get(taskId)
          if (taskEntry) {
            // Only mark completed/failed if no other agents are still running
            // The backend is the source of truth for final status, so we update
            // based on success signal but don't force terminal state here.
            if (!success && taskEntry.status === 'running') {
              tasks.set(taskId, {
                ...taskEntry,
                status: 'failed',
                completedAt: new Date().toISOString(),
              })
            }
          }
          return { tasks }
        })
        logger.debug('TaskFlow', 'Agent turn ended', { agentId, taskId, duration, success })
      })
    )

    // workflow_node_start → add/update nodeFlow
    unsubscribers.push(
      api.events.onWorkflowNodeStart((payload) => {
        const { workflowId, nodeId, nodeName, nodeType, agentId } = payload
        set((state) => {
          const nodeFlows = new Map(state.nodeFlows)
          nodeFlows.set(nodeId, {
            nodeId,
            workflowId,
            nodeName,
            nodeType,
            agentId,
            status: 'running',
            startedAt: new Date().toISOString(),
            progress: 0,
          })
          return { nodeFlows }
        })
        logger.debug('TaskFlow', 'Workflow node started', { workflowId, nodeId, nodeName })
      })
    )

    // workflow_node_complete → update nodeFlow status
    unsubscribers.push(
      api.events.onWorkflowNodeComplete((payload) => {
        const { workflowId, nodeId, durationMs } = payload
        set((state) => {
          const nodeFlows = new Map(state.nodeFlows)
          const existing = nodeFlows.get(nodeId)
          if (existing) {
            nodeFlows.set(nodeId, {
              ...existing,
              workflowId: workflowId || existing.workflowId,
              status: 'completed',
              completedAt: new Date().toISOString(),
              progress: 100,
            })
          } else {
            nodeFlows.set(nodeId, {
              nodeId,
              workflowId: workflowId || '',
              nodeName: nodeId,
              nodeType: 'unknown',
              status: 'completed',
              completedAt: new Date().toISOString(),
              progress: 100,
            })
          }
          return { nodeFlows }
        })
        logger.debug('TaskFlow', 'Workflow node completed', { workflowId, nodeId, durationMs })
      })
    )

    // workflow_node_cached → update nodeFlow status to 'cached'
    unsubscribers.push(
      api.events.onWorkflowNodeCached((payload) => {
        const { workflowId, nodeId, durationMs } = payload
        set((state) => {
          const nodeFlows = new Map(state.nodeFlows)
          const existing = nodeFlows.get(nodeId)
          if (existing) {
            nodeFlows.set(nodeId, {
              ...existing,
              workflowId: workflowId || existing.workflowId,
              status: 'cached',
              completedAt: new Date().toISOString(),
              progress: 100,
            })
          } else {
            nodeFlows.set(nodeId, {
              nodeId,
              workflowId: workflowId || '',
              nodeName: nodeId,
              nodeType: 'unknown',
              status: 'cached',
              completedAt: new Date().toISOString(),
              progress: 100,
            })
          }
          return { nodeFlows }
        })
        logger.debug('TaskFlow', 'Workflow node cached', { workflowId, nodeId, durationMs })
      })
    )

    // workflow_node_heartbeat → update progress
    unsubscribers.push(
      api.events.onWorkflowNodeHeartbeat((payload) => {
        const { workflowId, nodeId, progress } = payload
        set((state) => {
          const nodeFlows = new Map(state.nodeFlows)
          const existing = nodeFlows.get(nodeId)
          if (existing) {
            nodeFlows.set(nodeId, {
              ...existing,
              workflowId: workflowId || existing.workflowId,
              progress,
            })
          } else {
            nodeFlows.set(nodeId, {
              nodeId,
              workflowId: workflowId || '',
              nodeName: nodeId,
              nodeType: 'unknown',
              status: 'running',
              progress,
            })
          }
          return { nodeFlows }
        })
        logger.debug('TaskFlow', 'Workflow node heartbeat', { workflowId, nodeId, progress })
      })
    )

    // Return cleanup function that unsubscribes all listeners
    return () => {
      for (const unsub of unsubscribers) {
        unsub()
      }
    }
  },

  getTaskChain: (taskId: string) => {
    return get().handoffChain.filter((h) => h.taskId === taskId)
  },

  getAgentToolHistory: (agentId: string) => {
    return get().toolInvocations.filter((t) => t.agentId === agentId)
  },

  getAgentHandoffs: (agentId: string) => {
    return get().handoffChain.filter(
      (h) => h.fromAgent === agentId || h.toAgent === agentId
    )
  },

  getWorkflowNodes: (workflowId: string) => {
    const nodeFlows = get().nodeFlows
    const result: NodeFlowEntry[] = []
    for (const node of nodeFlows.values()) {
      if (node.workflowId === workflowId) {
        result.push(node)
      }
    }
    return result
  },

  clearHistory: () => {
    set({
      tasks: new Map<string, TaskFlowEntry>(),
      handoffChain: [],
      toolInvocations: [],
      nodeFlows: new Map<string, NodeFlowEntry>(),
    })
  },
}))

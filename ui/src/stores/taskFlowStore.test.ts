import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useTaskFlowStore, type NodeFlowEntry, type ToolInvocation } from './taskFlowStore'

// Capture event handlers registered during subscribe()
const handlers: Record<string, (...args: unknown[]) => void> = {}

vi.mock('../services', () => ({
  api: {
    events: {
      onSwarmTaskUpdate: vi.fn((h) => { handlers.swarm_task_update = h; return () => {} }),
      onHandoffRequested: vi.fn((h) => { handlers.handoff_requested = h; return () => {} }),
      onHandoffAccepted: vi.fn((h) => { handlers.handoff_accepted = h; return () => {} }),
      onHandoffRejected: vi.fn((h) => { handlers.handoff_rejected = h; return () => {} }),
      onHandoffCompleted: vi.fn((h) => { handlers.handoff_completed = h; return () => {} }),
      onAgentTurnStart: vi.fn((h) => { handlers.agent_turn_start = h; return () => {} }),
      onAgentTurnEnd: vi.fn((h) => { handlers.agent_turn_end = h; return () => {} }),
      onWorkflowNodeStart: vi.fn((h) => { handlers.workflow_node_start = h; return () => {} }),
      onWorkflowNodeComplete: vi.fn((h) => { handlers.workflow_node_complete = h; return () => {} }),
      onWorkflowNodeCached: vi.fn((h) => { handlers.workflow_node_cached = h; return () => {} }),
      onWorkflowNodeHeartbeat: vi.fn((h) => { handlers.workflow_node_heartbeat = h; return () => {} }),
    },
  },
}))

describe('taskFlowStore', () => {
  beforeEach(() => {
    useTaskFlowStore.getState().clearHistory()
    // Clear captured handlers
    for (const key of Object.keys(handlers)) {
      delete handlers[key]
    }
    vi.clearAllMocks()
  })

  describe('subscribe', () => {
    it('registers all event handlers', () => {
      useTaskFlowStore.getState().subscribe()
      expect(handlers.swarm_task_update).toBeDefined()
      expect(handlers.handoff_requested).toBeDefined()
      expect(handlers.handoff_accepted).toBeDefined()
      expect(handlers.handoff_rejected).toBeDefined()
      expect(handlers.handoff_completed).toBeDefined()
      expect(handlers.agent_turn_start).toBeDefined()
      expect(handlers.agent_turn_end).toBeDefined()
      expect(handlers.workflow_node_start).toBeDefined()
      expect(handlers.workflow_node_complete).toBeDefined()
      expect(handlers.workflow_node_cached).toBeDefined()
      expect(handlers.workflow_node_heartbeat).toBeDefined()
    })
  })

  describe('swarm_task_update', () => {
    it('creates new task when not existing', () => {
      useTaskFlowStore.getState().subscribe()
      handlers.swarm_task_update({ swarmId: 'sw1', taskId: 't1', status: 'pending', progress: 0 })
      const task = useTaskFlowStore.getState().tasks.get('t1')
      expect(task).toBeDefined()
      expect(task?.status).toBe('pending')
      expect(task?.swarmId).toBe('sw1')
      expect(task?.title).toBe('Task t1')
    })

    it('updates existing task status', () => {
      useTaskFlowStore.getState().subscribe()
      handlers.swarm_task_update({ swarmId: 'sw1', taskId: 't1', status: 'running', progress: 50 })
      handlers.swarm_task_update({ swarmId: 'sw1', taskId: 't1', status: 'completed', progress: 100 })
      const task = useTaskFlowStore.getState().tasks.get('t1')
      expect(task?.status).toBe('completed')
      expect(task?.completedAt).toBeDefined()
    })

    it('sets completedAt on terminal states', () => {
      useTaskFlowStore.getState().subscribe()
      handlers.swarm_task_update({ swarmId: 'sw1', taskId: 't1', status: 'pending', progress: 0 })
      handlers.swarm_task_update({ swarmId: 'sw1', taskId: 't1', status: 'failed', progress: 0 })
      const task = useTaskFlowStore.getState().tasks.get('t1')
      expect(task?.completedAt).toBeDefined()
    })

    it('preserves completedAt on non-terminal update', () => {
      useTaskFlowStore.getState().subscribe()
      handlers.swarm_task_update({ swarmId: 'sw1', taskId: 't1', status: 'running', progress: 50 })
      const task = useTaskFlowStore.getState().tasks.get('t1')
      expect(task?.completedAt).toBeUndefined()
    })
  })

  describe('handoff_requested', () => {
    it('adds handoff to chain and task', () => {
      useTaskFlowStore.getState().subscribe()
      // Create task first
      handlers.swarm_task_update({ swarmId: 'sw1', taskId: 't1', status: 'running', progress: 0 })
      handlers.handoff_requested({ requestId: 'h1', fromAgent: 'a1', toAgent: 'a2', taskId: 't1', reason: 'delegate' })

      const chain = useTaskFlowStore.getState().handoffChain
      expect(chain).toHaveLength(1)
      expect(chain[0].id).toBe('h1')
      expect(chain[0].fromAgent).toBe('a1')
      expect(chain[0].toAgent).toBe('a2')
      expect(chain[0].accepted).toBe(false)

      const task = useTaskFlowStore.getState().tasks.get('t1')
      expect(task?.handoffs).toHaveLength(1)
      expect(task?.assignedAgents).toContain('a2')
    })

    it('trims handoffChain to MAX_HANDOFFS (100)', () => {
      useTaskFlowStore.getState().subscribe()
      handlers.swarm_task_update({ swarmId: 'sw1', taskId: 't1', status: 'running', progress: 0 })
      for (let i = 0; i < 105; i++) {
        handlers.handoff_requested({ requestId: `h${i}`, fromAgent: 'a1', toAgent: 'a2', taskId: 't1', reason: '' })
      }
      expect(useTaskFlowStore.getState().handoffChain).toHaveLength(100)
    })

    it('does not duplicate agent in assignedAgents', () => {
      useTaskFlowStore.getState().subscribe()
      handlers.swarm_task_update({ swarmId: 'sw1', taskId: 't1', status: 'running', progress: 0 })
      handlers.handoff_requested({ requestId: 'h1', fromAgent: 'a1', toAgent: 'a2', taskId: 't1', reason: '' })
      handlers.handoff_requested({ requestId: 'h2', fromAgent: 'a1', toAgent: 'a2', taskId: 't1', reason: '' })
      const task = useTaskFlowStore.getState().tasks.get('t1')
      expect(task?.assignedAgents.filter(a => a === 'a2')).toHaveLength(1)
    })
  })

  describe('handoff_accepted', () => {
    it('marks handoff as accepted in chain', () => {
      useTaskFlowStore.getState().subscribe()
      handlers.swarm_task_update({ swarmId: 'sw1', taskId: 't1', status: 'running', progress: 0 })
      handlers.handoff_requested({ requestId: 'h1', fromAgent: 'a1', toAgent: 'a2', taskId: 't1', reason: '' })
      handlers.handoff_accepted({ requestId: 'h1', agentId: 'a2' })
      expect(useTaskFlowStore.getState().handoffChain[0].accepted).toBe(true)
      const task = useTaskFlowStore.getState().tasks.get('t1')
      expect(task?.handoffs[0].accepted).toBe(true)
    })
  })

  describe('handoff_rejected', () => {
    it('updates reason on rejection', () => {
      useTaskFlowStore.getState().subscribe()
      handlers.swarm_task_update({ swarmId: 'sw1', taskId: 't1', status: 'running', progress: 0 })
      handlers.handoff_requested({ requestId: 'h1', fromAgent: 'a1', toAgent: 'a2', taskId: 't1', reason: 'original' })
      handlers.handoff_rejected({ requestId: 'h1', agentId: 'a2', reason: 'busy' })
      expect(useTaskFlowStore.getState().handoffChain[0].accepted).toBe(false)
      expect(useTaskFlowStore.getState().handoffChain[0].reason).toBe('busy')
    })
  })

  describe('handoff_completed', () => {
    it('marks accepted and appends summary to reason', () => {
      useTaskFlowStore.getState().subscribe()
      handlers.swarm_task_update({ swarmId: 'sw1', taskId: 't1', status: 'running', progress: 0 })
      handlers.handoff_requested({ requestId: 'h1', fromAgent: 'a1', toAgent: 'a2', taskId: 't1', reason: 'delegate' })
      handlers.handoff_completed({ requestId: 'h1', summary: 'done' })
      const handoff = useTaskFlowStore.getState().handoffChain[0]
      expect(handoff.accepted).toBe(true)
      expect(handoff.reason).toBe('delegate — done')
    })

    it('preserves reason when no summary', () => {
      useTaskFlowStore.getState().subscribe()
      handlers.swarm_task_update({ swarmId: 'sw1', taskId: 't1', status: 'running', progress: 0 })
      handlers.handoff_requested({ requestId: 'h1', fromAgent: 'a1', toAgent: 'a2', taskId: 't1', reason: 'delegate' })
      handlers.handoff_completed({ requestId: 'h1' })
      expect(useTaskFlowStore.getState().handoffChain[0].reason).toBe('delegate')
    })
  })

  describe('agent_turn_start', () => {
    it('creates new task with running status if not exists', () => {
      useTaskFlowStore.getState().subscribe()
      handlers.agent_turn_start({ agentId: 'a1', taskId: 't1' })
      const task = useTaskFlowStore.getState().tasks.get('t1')
      expect(task).toBeDefined()
      expect(task?.status).toBe('running')
      expect(task?.assignedAgents).toContain('a1')
    })

    it('adds agent to existing task', () => {
      useTaskFlowStore.getState().subscribe()
      handlers.swarm_task_update({ swarmId: 'sw1', taskId: 't1', status: 'pending', progress: 0 })
      handlers.agent_turn_start({ agentId: 'a1', taskId: 't1' })
      const task = useTaskFlowStore.getState().tasks.get('t1')
      expect(task?.status).toBe('running')
      expect(task?.assignedAgents).toContain('a1')
    })
  })

  describe('agent_turn_end', () => {
    it('marks task as failed on unsuccessful turn', () => {
      useTaskFlowStore.getState().subscribe()
      handlers.swarm_task_update({ swarmId: 'sw1', taskId: 't1', status: 'running', progress: 0 })
      handlers.agent_turn_end({ agentId: 'a1', taskId: 't1', success: false })
      const task = useTaskFlowStore.getState().tasks.get('t1')
      expect(task?.status).toBe('failed')
      expect(task?.completedAt).toBeDefined()
    })

    it('does not change status on successful turn', () => {
      useTaskFlowStore.getState().subscribe()
      handlers.swarm_task_update({ swarmId: 'sw1', taskId: 't1', status: 'running', progress: 0 })
      handlers.agent_turn_end({ agentId: 'a1', taskId: 't1', success: true })
      const task = useTaskFlowStore.getState().tasks.get('t1')
      expect(task?.status).toBe('running')
    })
  })

  describe('workflow node events', () => {
    it('tracks node start', () => {
      useTaskFlowStore.getState().subscribe()
      handlers.workflow_node_start({ workflowId: 'w1', nodeId: 'n1', nodeName: 'build', nodeType: 'task', agentId: 'a1' })
      const node = useTaskFlowStore.getState().nodeFlows.get('n1')
      expect(node).toBeDefined()
      expect(node?.status).toBe('running')
      expect(node?.progress).toBe(0)
      expect(node?.agentId).toBe('a1')
    })

    it('tracks node completion', () => {
      useTaskFlowStore.getState().subscribe()
      handlers.workflow_node_start({ workflowId: 'w1', nodeId: 'n1', nodeName: 'build', nodeType: 'task', agentId: 'a1' })
      handlers.workflow_node_complete({ workflowId: 'w1', nodeId: 'n1', nodeName: 'build', nodeType: 'task', durationMs: 500, cached: false })
      const node = useTaskFlowStore.getState().nodeFlows.get('n1')
      expect(node?.status).toBe('completed')
      expect(node?.progress).toBe(100)
      expect(node?.completedAt).toBeDefined()
    })

    it('creates entry on complete even if start missed', () => {
      useTaskFlowStore.getState().subscribe()
      handlers.workflow_node_complete({ workflowId: 'w1', nodeId: 'n1', nodeName: 'build', nodeType: 'task', durationMs: 500, cached: false })
      const node = useTaskFlowStore.getState().nodeFlows.get('n1')
      expect(node).toBeDefined()
      expect(node?.status).toBe('completed')
      expect(node?.nodeType).toBe('unknown')
    })

    it('tracks node cached status', () => {
      useTaskFlowStore.getState().subscribe()
      handlers.workflow_node_start({ workflowId: 'w1', nodeId: 'n1', nodeName: 'build', nodeType: 'task', agentId: 'a1' })
      handlers.workflow_node_cached({ workflowId: 'w1', nodeId: 'n1', nodeName: 'build', durationMs: 0 })
      const node = useTaskFlowStore.getState().nodeFlows.get('n1')
      expect(node?.status).toBe('cached')
      expect(node?.progress).toBe(100)
    })

    it('updates node progress via heartbeat', () => {
      useTaskFlowStore.getState().subscribe()
      handlers.workflow_node_start({ workflowId: 'w1', nodeId: 'n1', nodeName: 'build', nodeType: 'task', agentId: 'a1' })
      handlers.workflow_node_heartbeat({ workflowId: 'w1', nodeId: 'n1', progress: 75 })
      const node = useTaskFlowStore.getState().nodeFlows.get('n1')
      expect(node?.progress).toBe(75)
    })

    it('creates entry on heartbeat even if start missed', () => {
      useTaskFlowStore.getState().subscribe()
      handlers.workflow_node_heartbeat({ workflowId: 'w1', nodeId: 'n1', progress: 50 })
      const node = useTaskFlowStore.getState().nodeFlows.get('n1')
      expect(node).toBeDefined()
      expect(node?.status).toBe('running')
      expect(node?.progress).toBe(50)
    })
  })

  describe('getTaskChain', () => {
    it('returns handoffs for a specific task', () => {
      useTaskFlowStore.getState().subscribe()
      handlers.swarm_task_update({ swarmId: 'sw1', taskId: 't1', status: 'running', progress: 0 })
      handlers.swarm_task_update({ swarmId: 'sw1', taskId: 't2', status: 'running', progress: 0 })
      handlers.handoff_requested({ requestId: 'h1', fromAgent: 'a1', toAgent: 'a2', taskId: 't1', reason: '' })
      handlers.handoff_requested({ requestId: 'h2', fromAgent: 'a1', toAgent: 'a3', taskId: 't2', reason: '' })

      const chain = useTaskFlowStore.getState().getTaskChain('t1')
      expect(chain).toHaveLength(1)
      expect(chain[0].id).toBe('h1')
    })

    it('returns empty for unknown task', () => {
      expect(useTaskFlowStore.getState().getTaskChain('unknown')).toEqual([])
    })
  })

  describe('getAgentHandoffs', () => {
    it('returns handoffs where agent is sender or receiver', () => {
      useTaskFlowStore.getState().subscribe()
      handlers.swarm_task_update({ swarmId: 'sw1', taskId: 't1', status: 'running', progress: 0 })
      handlers.handoff_requested({ requestId: 'h1', fromAgent: 'a1', toAgent: 'a2', taskId: 't1', reason: '' })
      handlers.handoff_requested({ requestId: 'h2', fromAgent: 'a3', toAgent: 'a1', taskId: 't1', reason: '' })
      handlers.handoff_requested({ requestId: 'h3', fromAgent: 'a3', toAgent: 'a2', taskId: 't1', reason: '' })

      const handoffs = useTaskFlowStore.getState().getAgentHandoffs('a1')
      expect(handoffs).toHaveLength(2)
    })
  })

  describe('getAgentToolHistory', () => {
    it('returns tool invocations for specific agent', () => {
      // Directly set tool invocations for testing
      useTaskFlowStore.setState({
        toolInvocations: [
          { id: 'ti1', serverId: 's1', toolName: 'read', args: {}, durationMs: 100, agentId: 'a1', timestamp: '' },
          { id: 'ti2', serverId: 's1', toolName: 'write', args: {}, durationMs: 200, agentId: 'a2', timestamp: '' },
        ] as ToolInvocation[],
      })
      const result = useTaskFlowStore.getState().getAgentToolHistory('a1')
      expect(result).toHaveLength(1)
      expect(result[0].toolName).toBe('read')
    })
  })

  describe('getWorkflowNodes', () => {
    it('returns nodes for a specific workflow', () => {
      const nodeFlows = new Map<string, NodeFlowEntry>()
      nodeFlows.set('n1', { nodeId: 'n1', workflowId: 'w1', nodeName: 'build', nodeType: 'task', status: 'running', progress: 0 })
      nodeFlows.set('n2', { nodeId: 'n2', workflowId: 'w2', nodeName: 'test', nodeType: 'task', status: 'completed', progress: 100 })
      nodeFlows.set('n3', { nodeId: 'n3', workflowId: 'w1', nodeName: 'deploy', nodeType: 'task', status: 'pending', progress: 0 })
      useTaskFlowStore.setState({ nodeFlows })

      const nodes = useTaskFlowStore.getState().getWorkflowNodes('w1')
      expect(nodes).toHaveLength(2)
      expect(nodes.map(n => n.nodeId).sort()).toEqual(['n1', 'n3'])
    })

    it('returns empty for unknown workflow', () => {
      expect(useTaskFlowStore.getState().getWorkflowNodes('unknown')).toEqual([])
    })
  })

  describe('clearHistory', () => {
    it('resets all state', () => {
      useTaskFlowStore.getState().subscribe()
      handlers.swarm_task_update({ swarmId: 'sw1', taskId: 't1', status: 'running', progress: 0 })
      handlers.handoff_requested({ requestId: 'h1', fromAgent: 'a1', toAgent: 'a2', taskId: 't1', reason: '' })

      useTaskFlowStore.getState().clearHistory()
      expect(useTaskFlowStore.getState().tasks.size).toBe(0)
      expect(useTaskFlowStore.getState().handoffChain).toHaveLength(0)
      expect(useTaskFlowStore.getState().toolInvocations).toHaveLength(0)
      expect(useTaskFlowStore.getState().nodeFlows.size).toBe(0)
    })
  })
})

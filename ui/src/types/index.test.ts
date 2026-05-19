import { describe, it, expect } from 'vitest'
import type {
  Agent,
  Swarm,
  Team,
  Session,
  Task,
  Message,
  PairSession,
  Workspace,
  AgentConfig,
  CoordinationTask,
  ACPMessage,
} from './index'

// Type guard tests for types
describe('Types', () => {
  describe('AgentType', () => {
    it('should have expected agent types', () => {
      const agentTypes = ['coder', 'reviewer', 'architect', 'tester', 'navigator', 'driver', 'orchestrator']
      expect(agentTypes).toContain('coder')
      expect(agentTypes).toContain('reviewer')
      expect(agentTypes).toContain('architect')
      expect(agentTypes).toContain('tester')
    })
  })

  describe('AgentState', () => {
    it('should have expected agent states', () => {
      const agentStates = ['idle', 'thinking', 'executing', 'waiting', 'error']
      expect(agentStates).toContain('idle')
      expect(agentStates).toContain('thinking')
      expect(agentStates).toContain('executing')
    })
  })

  describe('TopologyType', () => {
    it('should have expected topology types', () => {
      const topologies = ['star', 'mesh', 'tree', 'ring', 'hybrid']
      expect(topologies).toHaveLength(5)
      expect(topologies).toContain('star')
      expect(topologies).toContain('mesh')
      expect(topologies).toContain('hybrid')
    })
  })

  describe('TaskStrategy', () => {
    it('should have expected task strategies', () => {
      const strategies = ['parallel', 'sequential', 'pipeline', 'mapreduce']
      expect(strategies).toHaveLength(4)
      expect(strategies).toContain('parallel')
      expect(strategies).toContain('sequential')
    })
  })

  describe('SwarmState', () => {
    it('should have expected swarm states', () => {
      const states = ['initializing', 'active', 'paused', 'stopping', 'stopped']
      expect(states).toContain('active')
      expect(states).toContain('paused')
      expect(states).toContain('stopped')
    })
  })

  describe('SessionMode', () => {
    it('should have expected session modes', () => {
      const modes = ['default', 'planning', 'editing', 'reviewing', 'pair_driver', 'pair_navigator', 'swarm']
      expect(modes).toContain('default')
      expect(modes).toContain('planning')
      expect(modes).toContain('pair_driver')
    })
  })

  describe('SessionState', () => {
    it('should have expected session states', () => {
      const states = ['active', 'paused', 'completed', 'error']
      expect(states).toContain('active')
      expect(states).toContain('completed')
    })
  })

  describe('TaskState', () => {
    it('should have expected task states', () => {
      const states = ['pending', 'running', 'completed', 'failed', 'cancelled']
      expect(states).toContain('pending')
      expect(states).toContain('completed')
      expect(states).toContain('failed')
    })
  })

  describe('TaskPriority', () => {
    it('should have expected task priorities', () => {
      const priorities = ['low', 'medium', 'high', 'critical']
      expect(priorities).toContain('low')
      expect(priorities).toContain('critical')
    })
  })

  describe('MemberRole', () => {
    it('should have expected member roles', () => {
      const roles = ['owner', 'admin', 'developer', 'reviewer', 'observer']
      expect(roles).toContain('owner')
      expect(roles).toContain('admin')
      expect(roles).toContain('developer')
    })
  })

  describe('TaskStatus', () => {
    it('should have expected coordination task statuses', () => {
      const statuses = ['pending', 'decomposing', 'assigned', 'running', 'consensus', 'completed', 'failed']
      expect(statuses).toContain('pending')
      expect(statuses).toContain('decomposing')
      expect(statuses).toContain('consensus')
    })
  })
})

// Interface compliance tests
describe('Interface Compliance', () => {
  describe('Agent', () => {
    it('should create valid Agent object', () => {
      const agent: Agent = {
        id: 'agent-1',
        name: 'Test Agent',
        type: 'coder',
        state: 'idle',
        capabilities: {
          loadSession: true,
          promptCapabilities: { image: false, audio: false, embeddedContext: false },
          mcp: { http: false, sse: false },
          pairProgramming: true,
          teamCollaboration: true,
        },
        createdAt: '2024-01-01T00:00:00Z',
        lastActive: '2024-01-01T00:00:00Z',
      }
      expect(agent.id).toBe('agent-1')
      expect(agent.type).toBe('coder')
      expect(agent.capabilities.loadSession).toBe(true)
    })

    it('should support all agent types', () => {
      const types: Agent['type'][] = ['coder', 'reviewer', 'architect', 'tester', 'navigator', 'driver', 'orchestrator']
      expect(types).toHaveLength(7)
    })

    it('should support all agent states', () => {
      const states: Agent['state'][] = ['idle', 'thinking', 'executing', 'waiting', 'error']
      expect(states).toHaveLength(5)
    })
  })

  describe('Swarm', () => {
    it('should create valid Swarm object', () => {
      const swarm: Swarm = {
        id: 'swarm-1',
        name: 'Test Swarm',
        topology: 'star',
        strategy: 'parallel',
        state: 'active',
        agents: [],
        stats: {
          agentCount: 0,
          idleAgents: 0,
          executingAgents: 0,
          pendingTasks: 0,
          completedTasks: 0,
          topology: 'star',
          strategy: 'parallel',
          state: 'active',
        },
      }
      expect(swarm.id).toBe('swarm-1')
      expect(swarm.topology).toBe('star')
      expect(swarm.strategy).toBe('parallel')
    })

    it('should support all topologies', () => {
      const topologies: Swarm['topology'][] = ['star', 'mesh', 'tree', 'ring', 'hybrid']
      expect(topologies).toHaveLength(5)
    })

    it('should support all strategies', () => {
      const strategies: Swarm['strategy'][] = ['parallel', 'sequential', 'pipeline', 'mapreduce']
      expect(strategies).toHaveLength(4)
    })

    it('should support all swarm states', () => {
      const states: Swarm['state'][] = ['initializing', 'active', 'paused', 'stopping', 'stopped']
      expect(states).toHaveLength(5)
    })
  })

  describe('Team', () => {
    it('should create valid Team object', () => {
      const team: Team = {
        id: 'team-1',
        name: 'Test Team',
        description: 'A test team',
        owner: 'user-1',
        members: [],
        agents: [],
        workspaces: [],
        stats: {
          memberCount: 0,
          onlineMembers: 0,
          agentCount: 0,
          idleAgents: 0,
          workspaceCount: 0,
        },
      }
      expect(team.id).toBe('team-1')
      expect(team.owner).toBe('user-1')
    })
  })

  describe('Session', () => {
    it('should create valid Session object', () => {
      const session: Session = {
        id: 'session-1',
        mode: 'default',
        state: 'active',
        agents: [],
        messages: [],
        files: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }
      expect(session.id).toBe('session-1')
      expect(session.mode).toBe('default')
    })

    it('should support all session modes', () => {
      const modes: Session['mode'][] = ['default', 'planning', 'editing', 'reviewing', 'pair_driver', 'pair_navigator', 'swarm']
      expect(modes).toHaveLength(7)
    })

    it('should support all session states', () => {
      const states: Session['state'][] = ['active', 'paused', 'completed', 'error']
      expect(states).toHaveLength(4)
    })
  })

  describe('Task', () => {
    it('should create valid Task object', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test Task',
        description: 'A test task',
        state: 'pending',
        priority: 'medium',
        assignedTo: [],
        dependencies: [],
        subtasks: [],
        createdAt: '2024-01-01T00:00:00Z',
      }
      expect(task.id).toBe('task-1')
      expect(task.state).toBe('pending')
    })

    it('should support all task states', () => {
      const states: Task['state'][] = ['pending', 'running', 'completed', 'failed', 'cancelled']
      expect(states).toHaveLength(5)
    })

    it('should support all task priorities', () => {
      const priorities: Task['priority'][] = ['low', 'medium', 'high', 'critical']
      expect(priorities).toHaveLength(4)
    })
  })

  describe('Message', () => {
    it('should create valid Message object', () => {
      const message: Message = {
        id: 'msg-1',
        role: 'user',
        content: 'Hello',
        timestamp: '2024-01-01T00:00:00Z',
      }
      expect(message.id).toBe('msg-1')
      expect(message.role).toBe('user')
    })

    it('should support all message roles', () => {
      const roles: Message['role'][] = ['user', 'assistant', 'system']
      expect(roles).toHaveLength(3)
    })
  })

  describe('Workspace', () => {
    it('should create valid Workspace object', () => {
      const workspace: Workspace = {
        id: 'ws-1',
        name: 'Test Workspace',
        path: '/path/to/workspace',
        teamId: 'team-1',
        files: [],
        activeUsers: [],
      }
      expect(workspace.id).toBe('ws-1')
      expect(workspace.path).toBe('/path/to/workspace')
    })
  })

  describe('AgentConfig', () => {
    it('should create valid AgentConfig object', () => {
      const config: AgentConfig = {
        id: 'config-1',
        name: 'Test Config',
        enabled: true,
        command: '/usr/bin/agent',
      }
      expect(config.id).toBe('config-1')
      expect(config.enabled).toBe(true)
    })

    it('should support optional fields', () => {
      const config: AgentConfig = {
        id: 'config-1',
        name: 'Test Config',
        enabled: true,
        command: '/usr/bin/agent',
        args: ['--verbose'],
        env: { NODE_ENV: 'test' },
        tags: ['production', 'linux'],
        timeout: 30000,
      }
      expect(config.args).toHaveLength(1)
      expect(config.tags).toHaveLength(2)
    })
  })

  describe('CoordinationTask', () => {
    it('should create valid CoordinationTask object', () => {
      const task: CoordinationTask = {
        id: 'coord-1',
        title: 'Coordination Task',
        description: 'A coordination task',
        prompt: 'Do something',
        priority: 'medium',
        assignedTo: [],
        status: 'pending',
        progress: 0,
        results: {},
      }
      expect(task.id).toBe('coord-1')
      expect(task.status).toBe('pending')
    })

    it('should support all task statuses', () => {
      const statuses: CoordinationTask['status'][] = [
        'pending', 'decomposing', 'assigned', 'running', 'consensus', 'completed', 'failed'
      ]
      expect(statuses).toHaveLength(7)
    })
  })

  describe('ACPMessage', () => {
    it('should create valid ACPMessage request', () => {
      const message: ACPMessage = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: 1 },
      }
      expect(message.jsonrpc).toBe('2.0')
      expect(message.method).toBe('initialize')
    })

    it('should create valid ACPMessage response', () => {
      const message: ACPMessage = {
        jsonrpc: '2.0',
        id: 1,
        result: { status: 'ok' },
      }
      expect(message.jsonrpc).toBe('2.0')
      expect(message.result).toBeDefined()
    })

    it('should create valid ACPMessage error', () => {
      const message: ACPMessage = {
        jsonrpc: '2.0',
        id: 1,
        error: { code: -1, message: 'Error' },
      }
      expect(message.error?.code).toBe(-1)
    })
  })

  describe('PairSession', () => {
    it('should create valid PairSession object', () => {
      const driver: Agent = {
        id: 'driver-1',
        name: 'Driver',
        type: 'driver',
        state: 'executing',
        capabilities: {
          loadSession: true,
          promptCapabilities: { image: false, audio: false, embeddedContext: false },
          mcp: { http: false, sse: false },
          pairProgramming: true,
          teamCollaboration: false,
        },
        createdAt: '2024-01-01T00:00:00Z',
        lastActive: '2024-01-01T00:00:00Z',
      }
      const navigator: Agent = {
        id: 'navigator-1',
        name: 'Navigator',
        type: 'navigator',
        state: 'thinking',
        capabilities: driver.capabilities,
        createdAt: '2024-01-01T00:00:00Z',
        lastActive: '2024-01-01T00:00:00Z',
      }
      const session: PairSession = {
        id: 'pair-1',
        state: 'active',
        driver,
        navigator,
        currentFile: 'main.go',
        edits: [],
        suggestions: [],
        messages: [],
        stats: {
          sessionId: 'pair-1',
          state: 'active',
          driverId: 'driver-1',
          navigatorId: 'navigator-1',
          switchCount: 0,
          totalEdits: 0,
          approvedEdits: 0,
          rejectedEdits: 0,
          totalSuggestions: 0,
          acceptedSuggestions: 0,
          rejectedSuggestions: 0,
          messageCount: 0,
          duration: 0,
        },
      }
      expect(session.id).toBe('pair-1')
      expect(session.driver.id).toBe('driver-1')
      expect(session.navigator.id).toBe('navigator-1')
    })
  })
})

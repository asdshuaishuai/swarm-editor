import { create } from 'zustand'
import { api, type AgentInfo, type AgentCard as APIAgentCard } from '../services'
import { logger } from '../utils'

type AgentLifecycleState = 'idle' | 'thinking' | 'executing' | 'stuck' | 'error' | 'offline'

interface TurnInfo {
  taskId: string
  startedAt: string
  session?: string
}

interface HealthAlert {
  id: string
  agentId: string
  type: 'stuck' | 'recovered' | 'degraded' | 'supervisor'
  message: string
  timestamp: string
  level: 'warning' | 'error' | 'info'
}

interface AgentCard {
  id: string
  name: string
  capabilities: string[]
  tags: string[]
  description?: string
}

interface AgentLifecycleStateMap {
  agentId: string
  name: string
  state: AgentLifecycleState
  lastActive: string
  capabilities: string[]
  currentTask?: string
}

interface AgentLifecycleStore {
  agents: Map<string, AgentLifecycleStateMap>
  activeTurns: Map<string, TurnInfo>
  healthAlerts: HealthAlert[]
  agentCards: Map<string, AgentCard>
  connectedAgents: Set<string>

  // Actions
  subscribe: () => () => void
  refreshAgentCards: () => Promise<void>
  findAgentsByCapability: (cap: string) => Promise<AgentCard[]>
  getAgentState: (agentId: string) => AgentLifecycleState
  getAgentAlerts: (agentId: string) => HealthAlert[]
  clearAlerts: () => void
}

const MAX_HEALTH_ALERTS = 50

let alertCounter = 0

function generateAlertId(): string {
  alertCounter += 1
  return `alert-${Date.now()}-${alertCounter}`
}

function trimAlerts(alerts: HealthAlert[]): HealthAlert[] {
  if (alerts.length <= MAX_HEALTH_ALERTS) return alerts
  return alerts.slice(alerts.length - MAX_HEALTH_ALERTS)
}

function mapAgentInfoToLifecycleState(info: AgentInfo): AgentLifecycleState {
  const state = info.state || info.status || 'unknown'
  const stateMap: Record<string, AgentLifecycleState> = {
    running: 'executing',
    stopped: 'idle',
    idle: 'idle',
    thinking: 'thinking',
    executing: 'executing',
    waiting: 'idle',
    error: 'error',
    unknown: 'offline',
  }
  return stateMap[state] || 'offline'
}

function mapAPICardToLocal(card: APIAgentCard): AgentCard {
  const caps: string[] = []
  if (card.capabilities) {
    if (card.capabilities.streaming) caps.push('streaming')
    if (card.capabilities.mcp) caps.push('mcp')
    if (card.capabilities.fileTransfer) caps.push('fileTransfer')
  }
  if (card.skills) {
    for (const skill of card.skills) {
      caps.push(skill.name)
    }
  }
  return {
    id: card.name,
    name: card.name,
    capabilities: caps,
    tags: card.tags || [],
    description: card.description,
  }
}

// Track previous state per agent so recovery can restore it
const previousStates = new Map<string, AgentLifecycleState>()

export const useAgentLifecycleStore = create<AgentLifecycleStore>((set, get) => ({
  agents: new Map<string, AgentLifecycleStateMap>(),
  activeTurns: new Map<string, TurnInfo>(),
  healthAlerts: [] as HealthAlert[],
  agentCards: new Map<string, AgentCard>(),
  connectedAgents: new Set<string>(),

  subscribe: () => {
    const cleanups: Array<() => void> = []

    // Initial agent load
    api.agent.getAgents()
      .then((agentInfos) => {
        const agents = new Map<string, AgentLifecycleStateMap>()
        const connected = new Set<string>()
        for (const info of agentInfos) {
          const state = mapAgentInfoToLifecycleState(info)
          agents.set(info.id, {
            agentId: info.id,
            name: info.name,
            state,
            lastActive: info.lastActive || new Date().toISOString(),
            capabilities: info.capabilities || [],
          })
          connected.add(info.id)
        }
        set({ agents, connectedAgents: connected })
        logger.debug('AgentLifecycle', `Loaded ${agentInfos.length} agents`)
      })
      .catch((err) => {
        logger.warn('AgentLifecycle', 'Failed to load initial agents:', err)
      })

    // Initial A2A card load
    api.a2a.getAgentCards()
      .then((cards) => {
        const cardMap = new Map<string, AgentCard>()
        for (const card of cards) {
          const local = mapAPICardToLocal(card)
          cardMap.set(local.id, local)
        }
        set({ agentCards: cardMap })
        logger.debug('AgentLifecycle', `Loaded ${cards.length} agent cards`)
      })
      .catch((err) => {
        logger.debug('AgentLifecycle', 'Failed to load agent cards:', err)
      })

    // agent_status_change: update agent state in map
    cleanups.push(
      api.events.onAgentStatusChange((payload) => {
        const { agentId, state: rawState } = payload
        const stateMap: Record<string, AgentLifecycleState> = {
          running: 'executing',
          stopped: 'idle',
          idle: 'idle',
          thinking: 'thinking',
          executing: 'executing',
          waiting: 'idle',
          error: 'error',
          stuck: 'stuck',
          offline: 'offline',
        }
        const newState = stateMap[rawState] || 'offline'

        set((s) => {
          const agents = new Map(s.agents)
          const existing = agents.get(agentId)
          if (existing) {
            previousStates.set(agentId, existing.state)
            agents.set(agentId, { ...existing, state: newState, lastActive: new Date().toISOString() })
          } else {
            agents.set(agentId, {
              agentId,
              name: agentId,
              state: newState,
              lastActive: new Date().toISOString(),
              capabilities: [],
            })
          }
          return { agents }
        })
      })
    )

    // agent_turn_start: add to activeTurns, set state to 'executing'
    cleanups.push(
      api.events.onAgentTurnStart((payload) => {
        const { agentId, taskId, session } = payload
        set((s) => {
          const activeTurns = new Map(s.activeTurns)
          activeTurns.set(agentId, {
            taskId,
            startedAt: new Date().toISOString(),
            session,
          })
          const agents = new Map(s.agents)
          const existing = agents.get(agentId)
          if (existing) {
            previousStates.set(agentId, existing.state)
            agents.set(agentId, { ...existing, state: 'executing', currentTask: taskId, lastActive: new Date().toISOString() })
          } else {
            agents.set(agentId, {
              agentId,
              name: agentId,
              state: 'executing',
              lastActive: new Date().toISOString(),
              capabilities: [],
              currentTask: taskId,
            })
          }
          return { activeTurns, agents }
        })
      })
    )

    // agent_turn_end: remove from activeTurns, set state to 'idle'
    cleanups.push(
      api.events.onAgentTurnEnd((payload) => {
        const { agentId, taskId } = payload
        set((s) => {
          const activeTurns = new Map(s.activeTurns)
          const turn = activeTurns.get(agentId)
          if (turn && turn.taskId === taskId) {
            activeTurns.delete(agentId)
          }
          const agents = new Map(s.agents)
          const existing = agents.get(agentId)
          if (existing) {
            agents.set(agentId, { ...existing, state: 'idle', currentTask: undefined, lastActive: new Date().toISOString() })
          }
          return { activeTurns, agents }
        })
      })
    )

    // agent_stuck: add health alert, set state to 'stuck'
    cleanups.push(
      api.events.onAgentStuck((payload) => {
        const { agentId, taskId, duration } = payload
        const alert: HealthAlert = {
          id: generateAlertId(),
          agentId,
          type: 'stuck',
          message: `Agent ${agentId} stuck on task ${taskId} for ${duration}ms`,
          timestamp: new Date().toISOString(),
          level: 'error',
        }
        set((s) => {
          const agents = new Map(s.agents)
          const existing = agents.get(agentId)
          if (existing) {
            previousStates.set(agentId, existing.state)
            agents.set(agentId, { ...existing, state: 'stuck', currentTask: taskId })
          }
          return {
            agents,
            healthAlerts: trimAlerts([...s.healthAlerts, alert]),
          }
        })
      })
    )

    // agent_recovered: add health alert, set state back to previous
    cleanups.push(
      api.events.onAgentRecovered((payload) => {
        const { agentId, taskId } = payload
        const prevState = previousStates.get(agentId) || 'idle'
        const alert: HealthAlert = {
          id: generateAlertId(),
          agentId,
          type: 'recovered',
          message: `Agent ${agentId} recovered on task ${taskId}`,
          timestamp: new Date().toISOString(),
          level: 'info',
        }
        set((s) => {
          const agents = new Map(s.agents)
          const existing = agents.get(agentId)
          if (existing) {
            agents.set(agentId, { ...existing, state: prevState, currentTask: undefined })
          }
          return {
            agents,
            healthAlerts: trimAlerts([...s.healthAlerts, alert]),
          }
        })
        previousStates.delete(agentId)
      })
    )

    // agent_health_degraded: add health alert
    cleanups.push(
      api.events.onAgentHealthDegraded((payload) => {
        const { agentId, health, message } = payload
        const alert: HealthAlert = {
          id: generateAlertId(),
          agentId,
          type: 'degraded',
          message: message || `Agent ${agentId} health degraded: ${health}`,
          timestamp: new Date().toISOString(),
          level: 'warning',
        }
        set((s) => ({
          healthAlerts: trimAlerts([...s.healthAlerts, alert]),
        }))
      })
    )

    // supervisor_alert: add health alert
    cleanups.push(
      api.events.onSupervisorAlert((payload) => {
        const { level: rawLevel, agentId, message } = payload
        const levelMap: Record<string, 'warning' | 'error' | 'info'> = {
          warning: 'warning',
          error: 'error',
          info: 'info',
          critical: 'error',
        }
        const alert: HealthAlert = {
          id: generateAlertId(),
          agentId: agentId || '',
          type: 'supervisor',
          message: message,
          timestamp: new Date().toISOString(),
          level: levelMap[rawLevel] || 'warning',
        }
        set((s) => ({
          healthAlerts: trimAlerts([...s.healthAlerts, alert]),
        }))
      })
    )

    // Return cleanup function that unsubscribes all listeners
    return () => {
      for (const cleanup of cleanups) {
        cleanup()
      }
    }
  },

  refreshAgentCards: async () => {
    try {
      const cards = await api.a2a.getAgentCards()
      const cardMap = new Map<string, AgentCard>()
      for (const card of cards) {
        const local = mapAPICardToLocal(card)
        cardMap.set(local.id, local)
      }
      set({ agentCards: cardMap })
      logger.debug('AgentLifecycle', `Refreshed ${cards.length} agent cards`)
    } catch (err) {
      logger.warn('AgentLifecycle', 'Failed to refresh agent cards:', err)
    }
  },

  findAgentsByCapability: async (cap: string) => {
    try {
      const cards = await api.a2a.findAgentsByCapability({ capability: cap })
      return cards.map(mapAPICardToLocal)
    } catch (err) {
      logger.warn('AgentLifecycle', 'Failed to find agents by capability:', err)
      return []
    }
  },

  getAgentState: (agentId: string) => {
    const agent = get().agents.get(agentId)
    return agent ? agent.state : 'offline'
  },

  getAgentAlerts: (agentId: string) => {
    return get().healthAlerts.filter((a) => a.agentId === agentId)
  },

  clearAlerts: () => {
    set({ healthAlerts: [] })
  },
}))

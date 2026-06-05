import { useEffect, useRef } from 'react'
import { events, type PermissionRequestEvent, type AgentInfo } from '../services'
import { getIPCClient } from '../services/ipcClient'
import { useAppStore, agentInfoToAgent } from '../store/appStore'
import { logger } from '../utils'
import type { Swarm } from '../types'

/**
 * Hook to subscribe to WebSocket backend events and update the Zustand store.
 *
 * This hook handles:
 * - swarm_task_update: Updates task progress and results
 * - swarm_status_change: Updates swarm state
 * - agent_status_change: Updates individual agent status
 * - permission_request: Handles permission prompts
 * - agent_stats: Periodic agent statistics updates
 * - swarm_stats: Periodic swarm statistics updates
 *
 * Uses useAppStore.getState() inside callbacks to avoid stale closures.
 * Effect has no reactive dependencies — runs once on mount, cleaned up on unmount.
 */
export function useACPEvents() {
  const unsubscribers = useRef<(() => void)[]>([])

  useEffect(() => {
    const client = getIPCClient()
    // Capture store getter once at effect start for consistent type access
    const getStore = () => useAppStore.getState()

    // Subscribe to swarm task updates
    const unsubTaskUpdate = events.onSwarmTaskUpdate((event) => {
      logger.debug('WS Event', 'swarm_task_update:', event)

      const swarms = getStore().swarms
      const swarmIndex = swarms.findIndex(s => s.id === event.swarmId)

      if (swarmIndex >= 0) {
        const swarm = swarms[swarmIndex]
        const updatedSwarm = {
          ...swarm,
          stats: {
            ...swarm.stats,
            completedTasks: event.status === 'completed'
              ? (swarm.stats?.completedTasks || 0) + 1
              : swarm.stats?.completedTasks || 0,
            pendingTasks: event.status === 'pending'
              ? (swarm.stats?.pendingTasks || 0) + 1
              : swarm.stats?.pendingTasks || 0,
          },
        }

        const updatedSwarms = [...swarms]
        updatedSwarms[swarmIndex] = updatedSwarm
        getStore().setSwarms(updatedSwarms)
      }
    })
    unsubscribers.current.push(unsubTaskUpdate)

    // Subscribe to swarm status changes
    const unsubSwarmStatus = events.onSwarmStatusChange((event) => {
      logger.debug('WS Event', 'swarm_status_change:', event)

      const swarms = getStore().swarms
      const activeSwarm = getStore().activeSwarm
      const swarmIndex = swarms.findIndex(s => s.id === event.swarmId)

      if (swarmIndex >= 0) {
        const swarm = swarms[swarmIndex]
        const updatedSwarm = {
          ...swarm,
          status: event.status,
        }

        const updatedSwarms = [...swarms]
        updatedSwarms[swarmIndex] = updatedSwarm
        getStore().setSwarms(updatedSwarms)

        if (activeSwarm?.id === event.swarmId) {
          getStore().setActiveSwarm(updatedSwarm)
        }
      }
    })
    unsubscribers.current.push(unsubSwarmStatus)

    // Subscribe to agent status changes
    const unsubAgentStatus = events.onAgentStatusChange((event) => {
      logger.debug('WS Event', 'agent_status_change:', event)

      const agents = getStore().agents
      const agentIndex = agents.findIndex(a => a.id === event.agentId)

      if (agentIndex >= 0) {
        const agent = agents[agentIndex]
        const updatedAgent = {
          ...agent,
          state: event.state as typeof agent.state,
        }

        const updatedAgents = [...agents]
        updatedAgents[agentIndex] = updatedAgent
        getStore().setAgents(updatedAgents)
      }
    })
    unsubscribers.current.push(unsubAgentStatus)

    // Subscribe to permission requests
    const unsubPermission = events.onPermissionRequest((event) => {
      logger.debug('WS Event', 'permission_request:', event)
      getStore().addPermissionRequest(event as PermissionRequestEvent)
    })
    unsubscribers.current.push(unsubPermission)

    // Subscribe to agent stats updates
    // Merge into existing agents to avoid overwriting incremental updates from status events
    const unsubAgentStats = events.onAgentStats((agentInfos) => {
      logger.debug('WS Event', 'agent_stats:', agentInfos.length, 'agents')
      const incoming = (agentInfos as AgentInfo[]).map(agentInfoToAgent)
      const existingAgents = getStore().agents
      const incomingIds = new Set(incoming.map(a => a.id))

      const merged = existingAgents.map(existing => {
        const updated = incoming.find(a => a.id === existing.id)
        if (!updated) return existing
        // Preserve status from incremental status_change events, use server state as fallback
        return { ...existing, ...updated, status: updated.status }
      })

      // Add new agents, remove ones no longer on server
      const agents = [...merged, ...incoming.filter(a => !existingAgents.some(e => e.id === a.id))]
        .filter(a => incomingIds.has(a.id))
      getStore().setAgents(agents)
    })
    unsubscribers.current.push(unsubAgentStats)

    // Subscribe to swarm stats updates
    // Merge into existing swarms to avoid overwriting incremental updates from task/status events
    const unsubSwarmStats = events.onSwarmStats((swarmInfos) => {
      logger.debug('WS Event', 'swarm_stats:', swarmInfos.length, 'swarms')
      const existingSwarms = getStore().swarms
      const incoming = swarmInfos as Array<{ id: string; name: string; topology: string; strategy: string; status?: string; state?: string; agentCount?: number; taskCount?: number; stats?: { pendingTasks?: number; completedTasks?: number; agentCount?: number; idleAgents?: number; executingAgents?: number } }>

      const existingIds = new Set(existingSwarms.map(s => s.id))
      const incomingIds = new Set(incoming.map(s => s.id))

      // Update existing swarms with new stats, preserving any locally-updated fields
      const updated = existingSwarms.map(existing => {
        const info = incoming.find(s => s.id === existing.id)
        if (!info) return existing
        const topology = info.topology || 'star'
        const strategy = info.strategy || 'parallel'
        const state = info.state || info.status || 'stopped'
        return {
          ...existing,
          name: info.name,
          topology: topology as Swarm['topology'],
          strategy: strategy as Swarm['strategy'],
          state: state as Swarm['state'],
          stats: {
            agentCount: info.stats?.agentCount ?? info.agentCount ?? 0,
            idleAgents: info.stats?.idleAgents ?? 0,
            executingAgents: info.stats?.executingAgents ?? 0,
            // Preserve higher task counts from incremental updates
            pendingTasks: Math.max(existing.stats?.pendingTasks ?? 0, info.stats?.pendingTasks ?? info.taskCount ?? 0),
            completedTasks: Math.max(existing.stats?.completedTasks ?? 0, info.stats?.completedTasks ?? 0),
            topology,
            strategy,
            state,
          },
        }
      })

      // Add new swarms not yet in the store
      const newSwarms = incoming
        .filter(s => !existingIds.has(s.id))
        .map(info => {
          const topology = info.topology || 'star'
          const strategy = info.strategy || 'parallel'
          const state = info.state || info.status || 'stopped'
          return {
            id: info.id,
            name: info.name,
            topology: topology as Swarm['topology'],
            strategy: strategy as Swarm['strategy'],
            state: state as Swarm['state'],
            agents: [],
            stats: {
              agentCount: info.stats?.agentCount ?? info.agentCount ?? 0,
              idleAgents: info.stats?.idleAgents ?? 0,
              executingAgents: info.stats?.executingAgents ?? 0,
              pendingTasks: info.stats?.pendingTasks ?? info.taskCount ?? 0,
              completedTasks: info.stats?.completedTasks ?? 0,
              topology,
              strategy,
              state,
            },
          }
        })

      // Remove swarms that no longer exist on the server
      const swarms = [...updated, ...newSwarms].filter(s => incomingIds.has(s.id))
      getStore().setSwarms(swarms)
    })
    unsubscribers.current.push(unsubSwarmStats)

    // Subscribe to agent messages
    const unsubAgentMessage = events.onAgentMessage((event) => {
      logger.debug('WS Event', 'agent_message:', event)
    })
    unsubscribers.current.push(unsubAgentMessage)

    // Subscribe to real-time LSP diagnostics updates
    const unsubDiagnostics = events.onLSPDiagnosticsUpdate((event) => {
      const filePath = event.uri.replace(/^file:\/\//, '')
      const problems = event.diagnostics.map((d, i) => ({
        id: `${filePath}:${d.range.start.line}:${i}`,
        file: filePath,
        line: d.range.start.line + 1,
        column: d.range.start.character + 1,
        severity: d.severity === 1 ? 'error' as const : d.severity === 2 ? 'warning' as const : 'info' as const,
        message: d.message,
        source: d.source || 'LSP',
      }))
      getStore().updateFileProblems(filePath, problems)
    })
    unsubscribers.current.push(unsubDiagnostics)

    // IPC connection state — Unix socket is stateless, set connected based on availability
    // The IPC client checks connection on first invoke; update store accordingly
    const connected = client.isConnected()
    getStore().setConnected(connected)
    if (connected) {
      logger.info('IPC', 'Connected to Go backend via Unix socket')
    } else {
      logger.info('IPC', 'Go backend not yet available, will connect on first invoke')
    }

    logger.info('IPC Events', 'All event listeners registered')

    // Cleanup: unsubscribe from all event subscriptions
    return () => {
      unsubscribers.current.forEach((unsub) => {
        try {
          unsub()
        } catch (error) {
          logger.error('WebSocket Events', 'Error during cleanup:', error)
        }
      })
      unsubscribers.current = []
      logger.info('WebSocket Events', 'All event listeners cleaned up')
    }
  }, [])
}

/**
 * Hook that provides event subscription status and utilities.
 * Useful for components that need to know if events are connected.
 */
export function useACPEventStatus() {
  const connected = useAppStore((state) => state.connected)
  const client = getIPCClient()

  return {
    connected,
    isConnected: client.isConnected(),
  }
}

// Backward compatibility aliases
export { useACPEvents as useTauriEvents }
export { useACPEventStatus as useTauriEventStatus }

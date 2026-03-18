import { useEffect, useRef } from 'react'
import { tauri, type UnlistenFn } from '../services/tauri'
import { useAppStore } from '../store/appStore'
import { logger } from '../utils'

/**
 * Hook to subscribe to Tauri backend events and update the Zustand store.
 *
 * This hook handles:
 * - swarm-task-update: Updates task progress and results
 * - swarm-status-change: Updates swarm state
 * - agent-status-change: Updates individual agent status
 * - permission-request: Handles permission prompts
 * - log: Streams log messages
 */
export function useTauriEvents() {
  const unlistenFns = useRef<UnlistenFn[]>([])
  const store = useAppStore()

  useEffect(() => {
    // Only subscribe if running in Tauri environment
    if (!tauri.isTauriEnv()) {
      return
    }

    const subscribe = async () => {
      try {
        // Subscribe to swarm task updates
        const unlistenTaskUpdate = await tauri.events.onSwarmTaskUpdate((event) => {
          logger.debug('Tauri Event', 'swarm-task-update:', event)

          // Update swarm stats if we have the swarm in state
          const swarms = store.swarms
          const swarmIndex = swarms.findIndex(s => s.id === event.swarm_id)

          if (swarmIndex >= 0) {
            const swarm = swarms[swarmIndex]
            const updatedSwarm = {
              ...swarm,
              stats: {
                ...swarm.stats,
                completedTasks: event.status === 'completed'
                  ? swarm.stats.completedTasks + 1
                  : swarm.stats.completedTasks,
                pendingTasks: event.status === 'pending'
                  ? swarm.stats.pendingTasks + 1
                  : swarm.stats.pendingTasks,
              },
            }

            // Update the swarm in the store
            const updatedSwarms = [...swarms]
            updatedSwarms[swarmIndex] = updatedSwarm
            store.setSwarms(updatedSwarms)
          }
        })
        unlistenFns.current.push(unlistenTaskUpdate)

        // Subscribe to swarm status changes
        const unlistenSwarmStatus = await tauri.events.onSwarmStatusChange((event) => {
          logger.debug('Tauri Event', 'swarm-status-change:', event)

          // Update swarm state
          const swarms = store.swarms
          const swarmIndex = swarms.findIndex(s => s.id === event.swarm_id)

          if (swarmIndex >= 0) {
            const swarm = swarms[swarmIndex]
            const updatedSwarm = {
              ...swarm,
              state: event.new_state as typeof swarm.state,
              stats: {
                ...swarm.stats,
                state: event.new_state,
              },
            }

            const updatedSwarms = [...swarms]
            updatedSwarms[swarmIndex] = updatedSwarm
            store.setSwarms(updatedSwarms)

            // Update active swarm if this is the one being displayed
            if (store.activeSwarm?.id === event.swarm_id) {
              store.setActiveSwarm(updatedSwarm)
            }
          }
        })
        unlistenFns.current.push(unlistenSwarmStatus)

        // Subscribe to agent status changes
        const unlistenAgentStatus = await tauri.events.onAgentStatusChange((event) => {
          logger.debug('Tauri Event', 'agent-status-change:', event)

          // Update agent in store
          const agents = store.agents
          const agentIndex = agents.findIndex(a => a.id === event.agent_id)

          if (agentIndex >= 0) {
            // Use updateAgent to update the agent's state
            if (store.updateAgent) {
              store.updateAgent(event.agent_id, { state: event.status as typeof agents[0]['state'] })
            } else {
              const agent = agents[agentIndex]
              const updatedAgent = {
                ...agent,
                state: event.status as typeof agent.state,
              }

              const updatedAgents = [...agents]
              updatedAgents[agentIndex] = updatedAgent
              store.setAgents(updatedAgents)
            }
          }
        })
        unlistenFns.current.push(unlistenAgentStatus)

        // Subscribe to permission requests
        const unlistenPermission = await tauri.events.onPermissionRequest((event) => {
          logger.debug('Tauri Event', 'permission-request:', event)

          // Add permission request to the store's queue
          store.addPermissionRequest(event)
        })
        unlistenFns.current.push(unlistenPermission)

        // Subscribe to log events
        const unlistenLog = await tauri.events.onLog((event) => {
          logger.debug('Tauri Event', 'log:', event)

          // Log events could be stored in a dedicated log state
          // For now, we just log them at the appropriate level
          const logMethod = event.level.toLowerCase() as 'debug' | 'info' | 'warn' | 'error'
          logger[logMethod](event.source, event.message)
        })
        unlistenFns.current.push(unlistenLog)

        logger.info('Tauri Events', 'All event listeners registered')
      } catch (error) {
        logger.error('Tauri Events', 'Failed to subscribe to events:', error)
      }
    }

    subscribe()

    // Cleanup: unsubscribe from all events
    return () => {
      unlistenFns.current.forEach((unlisten) => {
        try {
          unlisten()
        } catch (error) {
          logger.error('Tauri Events', 'Error during cleanup:', error)
        }
      })
      unlistenFns.current = []
      logger.info('Tauri Events', 'All event listeners cleaned up')
    }
  }, [store])
}

/**
 * Hook that provides event subscription status and utilities.
 * Useful for components that need to know if events are connected.
 */
export function useTauriEventStatus() {
  const connected = useAppStore((state) => state.connected)

  return {
    connected,
    isTauriEnv: tauri.isTauriEnv(),
  }
}
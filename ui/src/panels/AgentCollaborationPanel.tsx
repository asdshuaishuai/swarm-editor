import { useState, useEffect, useCallback, useRef } from 'react'
import { AgentChat, ChatMessage } from '../components/AgentChat'
import { SwarmStatus, SwarmTask, ConsensusVote } from '../components/SwarmStatus'
import { Agent } from '../components/AgentCluster'
import { api, AgentInfo, SwarmInfo, ConsensusInfo } from '../services'
import { getWebSocketClient } from '../services/websocket'
import { AGENT_ICONS, mapAgentStatus } from '../utils/agentUtils'
import { logger } from '../utils'
import { byzantineService } from '../services/byzantine'
import type { EmergenceData } from '../services/api'

interface AgentCollaborationPanelProps {
  primaryAgentId?: string
  onSwitchAgent?: (agentId: string) => void
}

export function AgentCollaborationPanel({ primaryAgentId, onSwitchAgent }: AgentCollaborationPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])
  const [tasks, setTasks] = useState<SwarmTask[]>([])
  const [consensus, setConsensus] = useState<{ total: number; agreed: number; votes: ConsensusVote[] } | undefined>()
  const [emergenceData, setEmergenceData] = useState<EmergenceData | null>(null)
  const [_activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [activeAgentId, setActiveAgentId] = useState<string>(primaryAgentId || 'claude-code')
  const sessionRef = useRef<string | null>(null)

  // Fetch agents from backend
  const fetchAgents = useCallback(async () => {
    try {
      const agentList = await api.agent.getAgents()
      const mapped: Agent[] = agentList.map(a => ({
        id: a.id,
        name: a.name,
        icon: AGENT_ICONS[a.id] || AGENT_ICONS.default,
        status: mapAgentStatus(a.state),
        role: a.id === activeAgentId ? 'primary' : 'worker',
      }))
      setAgents(mapped)
    } catch (e) {
      logger.warn('AgentCollaboration', 'Failed to fetch agents', e)
    }
  }, [activeAgentId])

  // Fetch swarm tasks, consensus data, and emergence data
  const fetchSwarmData = useCallback(async () => {
    try {
      const [swarms, consensusData, emergence] = await Promise.all([
        api.swarm.getSwarms(),
        api.swarm.getConsensus().catch(() => null),
        api.monitoring.getEmergenceData().catch(() => null),
      ])
      if (swarms.length > 0) {
        // Get tasks from first active swarm
        const activeSwarm = swarms.find(s => s.status === 'running') || swarms[0]
        const taskList = await api.swarm.getSwarmTasks(activeSwarm.id)
        // Convert task list to task display
        const mappedTasks: SwarmTask[] = (taskList || []).map(task => ({
          id: task.id,
          name: task.title,
          status: task.status as SwarmTask['status'],
        }))
        setTasks(mappedTasks)
      }
      // Update consensus data with Byzantine processing
      if (consensusData && consensusData.consensus.length > 0) {
        // Process through Byzantine service for enhanced consensus tracking
        byzantineService.updateByzantineConfig({ enabled: true })
        consensusData.consensus.forEach((c: ConsensusInfo) => {
          byzantineService.createMessage(c.taskId, c.agreed ? 'commit' : 'prepare', 1, c)
        })

        const votes: ConsensusVote[] = consensusData.consensus.map((c: ConsensusInfo) => ({
          agentId: c.taskId,
          agentName: c.algorithm,
          vote: c.agreed ? 'agree' as const : 'disagree' as const,
          reason: `${Math.round(c.approvalRate * 100)}% approval (${c.approvedVotes}/${c.totalVotes})`,
        }))
        const agreed = consensusData.consensus.filter((c: ConsensusInfo) => c.agreed).length
        const faultyNodes = byzantineService.detectFaultyNodes()
        setConsensus({
          total: consensusData.consensus.length,
          agreed,
          votes: faultyNodes.length > 0
            ? [...votes, { agentId: 'system', agentName: 'BFT', vote: 'disagree' as const, reason: `${faultyNodes.length} faulty node(s) detected` }]
            : votes,
        })
      }
      // Update emergence data (pheromone signals, health metrics)
      if (emergence) {
        setEmergenceData(emergence)
      }
    } catch (e) {
      logger.debug('AgentCollaboration', 'Failed to fetch swarm data', e)
    }
  }, [])

  // Subscribe to real-time agent stats
  useEffect(() => {
    fetchAgents()
    fetchSwarmData()

    const ws = getWebSocketClient()
    const unsubAgent = ws.subscribe('agent_stats', (data: unknown) => {
      const agentStats = data as AgentInfo[]
      if (Array.isArray(agentStats)) {
        const mapped: Agent[] = agentStats.map(a => ({
          id: a.id,
          name: a.name,
          icon: AGENT_ICONS[a.id] || AGENT_ICONS.default,
          status: mapAgentStatus(a.state),
          role: a.id === activeAgentId ? 'primary' : 'worker',
        }))
        setAgents(mapped)
      }
    })

    const unsubSwarm = ws.subscribe('swarm_stats', (data: unknown) => {
      const swarmStats = data as SwarmInfo[]
      if (Array.isArray(swarmStats) && swarmStats.length > 0) {
        fetchSwarmData()
      }
    })

    return () => {
      unsubAgent()
      unsubSwarm()
    }
  }, [fetchAgents, fetchSwarmData, activeAgentId])

  // Update active agent when primaryAgentId changes
  useEffect(() => {
    if (primaryAgentId) {
      setActiveAgentId(primaryAgentId)
    }
  }, [primaryAgentId])

  const handleSendMessage = useCallback(async (content: string) => {
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)

    try {
      // Create session if needed
      let sessionId = sessionRef.current
      if (!sessionId) {
        const session = await api.agent.createSession(activeAgentId, 'default')
        sessionId = session.id
        sessionRef.current = sessionId
        setActiveSessionId(sessionId)
      }

      // Send message via real API
      const result = await api.agent.sendMessage(sessionId, content)

      // Add agent response
      const agentMessage: ChatMessage = {
        id: `agent-${Date.now()}`,
        role: 'agent',
        agentId: activeAgentId,
        agentName: agents.find(a => a.id === activeAgentId)?.name || activeAgentId,
        content: result.content || `任务已发送，等待 Agent 响应...`,
        timestamp: new Date(),
        isPrimary: true,
      }
      setMessages(prev => [...prev, agentMessage])
    } catch (err) {
      // Add error message
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'system',
        content: `发送失败: ${err instanceof Error ? err.message : '未知错误'}`,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }, [activeAgentId, agents])

  const handleSwitchAgent = useCallback((agentId: string) => {
    setActiveAgentId(agentId)
    onSwitchAgent?.(agentId)

    // Close current session when switching agents
    if (sessionRef.current) {
      api.agent.closeSession(sessionRef.current).catch((e) => { logger.debug('AgentCollaboration', 'Failed to close session', e) })
      sessionRef.current = null
      setActiveSessionId(null)
    }

    // Add system message
    const systemMessage: ChatMessage = {
      id: `system-${Date.now()}`,
      role: 'system',
      content: `已切换主导 Agent 为 ${agents.find(a => a.id === agentId)?.name || agentId}`,
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, systemMessage])
  }, [agents, onSwitchAgent])

  // Cleanup session on unmount
  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        api.agent.closeSession(sessionRef.current).catch((e) => { logger.debug('AgentCollaboration', 'Failed to close session', e) })
      }
    }
  }, [])

  // Calculate progress
  const completedTasks = tasks.filter(t => t.status === 'completed').length
  const progress = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Agent Chat - Main area */}
      <div className="flex-1 overflow-hidden">
        <AgentChat
          messages={messages}
          primaryAgentId={activeAgentId}
          onSendMessage={handleSendMessage}
          onSwitchAgent={handleSwitchAgent}
          isLoading={isLoading}
        />
      </div>

      {/* Swarm Status - Bottom */}
      <SwarmStatus
        primaryAgentId={activeAgentId}
        tasks={tasks}
        consensus={consensus}
        progress={progress}
        emergence={emergenceData ? { health: emergenceData.health, signals: emergenceData.signals } : undefined}
      />
    </div>
  )
}

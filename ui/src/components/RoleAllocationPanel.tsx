import { useState, useEffect } from 'react'
import { useSwarmAlgorithmStore } from '../stores/swarmAlgorithmStore'
import { api, type AgentInfo } from '../services'
import { logger } from '../utils'

interface RoleAllocationPanelProps {
  swarmId: string
}

const ROLE_CONFIG = {
  coder: { color: 'text-blue-400', bg: 'bg-blue-500/20', border: 'border-blue-500/30', label: 'Coder' },
  reviewer: { color: 'text-purple-400', bg: 'bg-purple-500/20', border: 'border-purple-500/30', label: 'Reviewer' },
  tester: { color: 'text-green-400', bg: 'bg-green-500/20', border: 'border-green-500/30', label: 'Tester' },
  architect: { color: 'text-orange-400', bg: 'bg-orange-500/20', border: 'border-orange-500/30', label: 'Architect' },
  planner: { color: 'text-cyan-400', bg: 'bg-cyan-500/20', border: 'border-cyan-500/30', label: 'Planner' },
  executor: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', border: 'border-yellow-500/30', label: 'Executor' },
  validator: { color: 'text-pink-400', bg: 'bg-pink-500/20', border: 'border-pink-500/30', label: 'Validator' },
  coordinator: { color: 'text-indigo-400', bg: 'bg-indigo-500/20', border: 'border-indigo-500/30', label: 'Coordinator' },
  unknown: { color: 'text-slate-400', bg: 'bg-slate-500/20', border: 'border-slate-500/30', label: 'Unknown' },
} as const

function getRoleConfig(role: string) {
  const lowerRole = role.toLowerCase()
  for (const [key, config] of Object.entries(ROLE_CONFIG)) {
    if (lowerRole.includes(key)) return config
  }
  return ROLE_CONFIG.unknown
}

export function RoleAllocationPanel({ swarmId }: RoleAllocationPanelProps) {
  const { roleAssignments, fetchRoleAssignments, loading, error } = useSwarmAlgorithmStore()
  const [agents, setAgents] = useState<Record<string, AgentInfo>>({})

  const assignments = roleAssignments[swarmId] || []

  useEffect(() => {
    if (swarmId) {
      fetchRoleAssignments(swarmId)
    }
  }, [swarmId, fetchRoleAssignments])

  useEffect(() => {
    const loadAgents = async () => {
      try {
        const agentList = await api.agent.getAgents()
        const agentMap = agentList.reduce((acc, agent) => {
          acc[agent.id] = agent
          return acc
        }, {} as Record<string, AgentInfo>)
        setAgents(agentMap)
      } catch (err) {
        logger.debug('RoleAllocationPanel', 'Failed to load agents:', err)
      }
    }
    loadAgents()
  }, [])

  const handleRefresh = async () => {
    try {
      await fetchRoleAssignments(swarmId)
    } catch (err) {
      logger.error('RoleAllocationPanel', 'Failed to refresh assignments:', err)
    }
  }

  const getAgentName = (agentId: string) => {
    return agents[agentId]?.name || agentId
  }

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-400'
    if (score >= 0.6) return 'text-yellow-400'
    return 'text-slate-400'
  }

  return (
    <div className="flex flex-col h-full bg-[#0d1117] border-r border-[#30363d]">
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/20">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-between px-3 py-2 border-b border-[#30363d]">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Role Allocation</h3>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="p-1 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          title="Refresh assignments"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {assignments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <svg className="w-10 h-10 text-slate-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-xs text-slate-500">No role assignments</p>
            <p className="text-xs text-slate-600 mt-1">Agents will be assigned roles as tasks are created</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[#0d1117] border-b border-[#30363d]">
              <tr>
                <th className="px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Agent</th>
                <th className="px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Role</th>
                <th className="px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Task</th>
                <th className="px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Score</th>
                <th className="px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Assigned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#21262d]">
              {assignments.map((assignment) => {
                const roleConfig = getRoleConfig(assignment.role)
                return (
                  <tr key={`${assignment.agentId}-${assignment.taskId}`} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold ${
                          agents[assignment.agentId]?.state === 'executing' ? 'bg-green-500/20 text-green-400' : 'bg-slate-700/50 text-slate-400'
                        }`}>
                          {getAgentName(assignment.agentId).charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs text-slate-300 truncate max-w-[100px]" title={getAgentName(assignment.agentId)}>
                          {getAgentName(assignment.agentId)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded ${roleConfig.color} ${roleConfig.bg} ${roleConfig.border} border`}>
                        {roleConfig.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-xs text-slate-300 truncate max-w-[80px]" title={assignment.taskId}>
                        {assignment.taskId}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <div className="w-12 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500"
                            style={{ width: `${assignment.score * 100}%` }}
                          />
                        </div>
                        <span className={`text-[10px] font-medium ${getScoreColor(assignment.score)}`}>
                          {Math.round(assignment.score * 100)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-[10px] text-slate-500">
                        {new Date(assignment.assignedAt).toLocaleTimeString()}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {assignments.length > 0 && (
        <div className="px-3 py-2 border-t border-[#30363d]">
          <div className="grid grid-cols-4 gap-2 text-center">
            {Object.entries(
              assignments.reduce((acc, a) => {
                const role = a.role.toLowerCase()
                acc[role] = (acc[role] || 0) + 1
                return acc
              }, {} as Record<string, number>)
            ).map(([role, count]) => {
              const config = getRoleConfig(role)
              return (
                <div key={role} className="flex flex-col items-center">
                  <span className={`text-xs font-semibold ${config.color}`}>{count}</span>
                  <span className="text-[9px] text-slate-500">{config.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default RoleAllocationPanel

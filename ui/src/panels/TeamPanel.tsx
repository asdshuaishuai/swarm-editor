import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '../store/appStore'
import {
  Users,
  Plus,
  Settings,
  FolderOpen,
  Bot,
  Crown,
  Shield,
  Code2,
  X,
  Trash2,
  UserMinus,
} from 'lucide-react'
import { Team, TeamMember, MemberRole } from '../types'
import { api, type AgentInfo } from '../services'
import { logger } from '../utils'

const roleIcons: Record<MemberRole, React.ReactNode> = {
  owner: <Crown size={14} className="text-warning" />,
  admin: <Shield size={14} className="text-info" />,
  developer: <Code2 size={14} className="text-success" />,
  reviewer: <Settings size={14} className="text-text-secondary" />,
  observer: <Users size={14} className="text-text-tertiary" />,
}

export default function TeamPanel() {
  const teams = useAppStore(state => state.teams)
  const activeTeam = useAppStore(state => state.activeTeam)
  const setActiveTeam = useAppStore(state => state.setActiveTeam)
  const addTeam = useAppStore(state => state.addTeam)
  const addToast = useAppStore(state => state.addToast)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const mountedRef = useRef(true)

  // Track mounted state to prevent setState on unmounted component
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Load teams from backend — extracted to useCallback so it can be passed to children
  const loadTeams = useCallback(async () => {
    setLoading(true)
    try {
      const teamInfos = await api.team.getTeams()
      // Use getState() to avoid stale closure over teams/agents
      const { teams: currentTeams, agents: currentAgents } = useAppStore.getState()
      // Convert TeamInfo[] to Team[] and update store
      for (const teamInfo of teamInfos) {
        const existingTeam = currentTeams.find(t => t.id === teamInfo.id)
        if (!existingTeam) {
          const team: Team = {
            id: teamInfo.id,
            name: teamInfo.name,
            description: teamInfo.description || '',
            owner: teamInfo.ownerId,
            members: teamInfo.members.map(m => ({
              id: m.id,
              name: m.name,
              email: '', // TeamMemberInfo doesn't have email
              role: m.role as MemberRole,
              joinedAt: teamInfo.createdAt,
              online: m.online,
            })),
            agents: currentAgents.filter(a => teamInfo.agents.includes(a.id)),
            workspaces: [],
            stats: {
              memberCount: teamInfo.members.length,
              onlineMembers: teamInfo.members.filter(m => m.online).length,
              agentCount: teamInfo.agents.length,
              idleAgents: 0,
              workspaceCount: 0, // TeamInfo doesn't have workspaces
            },
          }
          useAppStore.getState().addTeam(team)
        }
      }
    } catch (err) {
      logger.error('Team', 'Failed to load teams:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Load teams on mount
  useEffect(() => {
    loadTeams()
  }, [loadTeams])

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return

    try {
      setCreating(true)

      const teamInfo = await api.team.createTeam(newTeamName.trim(), 'local-user')

      if (!mountedRef.current) return

      const team: Team = {
        id: teamInfo.id,
        name: teamInfo.name,
        description: teamInfo.description || '',
        owner: teamInfo.ownerId,
        members: teamInfo.members.map(m => ({
          id: m.id,
          name: m.name,
          email: '',
          role: m.role as MemberRole,
          joinedAt: teamInfo.createdAt,
          online: m.online,
        })),
        agents: [],
        workspaces: [],
        stats: {
          memberCount: teamInfo.members.length,
          onlineMembers: teamInfo.members.filter(m => m.online).length,
          agentCount: 0,
          idleAgents: 0,
          workspaceCount: 0,
        },
      }

      addTeam(team)
      setActiveTeam(team)
      addToast('success', 'Team created', `Team "${teamInfo.name}" is ready`)

      setShowCreateModal(false)
      setNewTeamName('')
    } catch (err) {
      logger.error('Team', 'Failed to create team:', err)
      if (!mountedRef.current) return
      addToast('error', 'Failed to create team', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      if (mountedRef.current) {
        setCreating(false)
      }
    }
  }

  return (
    <div className="flex flex-col h-full p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-accent/10 rounded-mac">
            <Users size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Teams</h2>
            <p className="text-xs text-text-secondary">Collaborate with others</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary"
        >
          <Plus size={16} />
          <span>New Team</span>
        </button>
      </div>

      {/* Team List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-text-tertiary">
            <div className="animate-spin mb-4">
              <Users size={32} className="text-accent" />
            </div>
            <p className="text-sm" aria-live="polite">Loading teams...</p>
          </div>
        ) : teams.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-text-tertiary">
            <div className="p-4 bg-glass rounded-mac-xl mb-4">
              <Users size={48} className="opacity-50" />
            </div>
            <p className="text-base font-medium text-text-secondary mb-1">No teams created</p>
            <p className="text-sm">Create a team to collaborate with others</p>
          </div>
        ) : (
          <div className="space-y-3">
            {teams.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                isActive={activeTeam?.id === team.id}
                onSelect={() => setActiveTeam(team)}
                onAssign={loadTeams}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-mac-panel/95 border border-glass-border rounded-mac-xl p-5 w-[380px] shadow-mac backdrop-blur-xl" role="dialog" aria-modal="true" aria-label="Create New Team">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <Users size={18} className="text-accent" />
                Create New Team
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 hover:bg-card-hover rounded-mac transition-colors"
              >
                <X size={18} className="text-text-secondary" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1.5 font-medium">
                  Team Name
                </label>
                <input
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  className="w-full input-mac"
                  autoFocus
                  placeholder="My Team"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-glass-border">
              <button
                onClick={() => setShowCreateModal(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTeam}
                className="btn-primary"
                disabled={creating}
              >
                {creating ? 'Creating...' : 'Create Team'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface TeamCardProps {
  team: Team
  isActive: boolean
  onSelect: () => void
  onAssign?: () => void
}

function TeamCard({ team, isActive, onSelect, onAssign }: TeamCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [availableAgents, setAvailableAgents] = useState<AgentInfo[]>([])
  const [assigning, setAssigning] = useState<string | null>(null)
  const [removingAgent, setRemovingAgent] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const addToast = useAppStore(state => state.addToast)

  const loadAgents = async () => {
    try {
      const agents = await api.agent.getAgents()
      setAvailableAgents(agents)
    } catch (err) {
      logger.error('Team', 'Failed to load agents:', err)
    }
  }

  const handleAssignAgent = async (agentId: string) => {
    setAssigning(agentId)
    try {
      await api.team.addAgentToTeam(team.id, agentId)
      addToast('success', 'Agent assigned', 'Agent added to team successfully')
      setShowAssignModal(false)
      onAssign?.()
    } catch (err) {
      logger.error('Team', 'Failed to assign agent:', err)
      addToast('error', 'Failed to assign agent', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setAssigning(null)
    }
  }

  const handleRemoveAgent = async (agentId: string) => {
    setRemovingAgent(agentId)
    try {
      await api.team.removeAgentFromTeam(team.id, agentId)
      addToast('success', 'Agent removed', 'Agent removed from team')
      onAssign?.()
    } catch (err) {
      logger.error('Team', 'Failed to remove agent:', err)
      addToast('error', 'Failed to remove agent', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setRemovingAgent(null)
    }
  }

  const handleDeleteTeam = async () => {
    if (!confirm(`Delete team "${team.name}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await api.team.deleteTeam(team.id)
      addToast('success', 'Team deleted', `Team "${team.name}" has been deleted`)
      onAssign?.()
    } catch (err) {
      logger.error('Team', 'Failed to delete team:', err)
      addToast('error', 'Failed to delete team', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div
      className={`rounded-mac-xl transition-all duration-200 overflow-hidden ${
        isActive
          ? 'bg-accent-muted border-2 border-accent'
          : 'bg-glass border border-glass-border hover:border-accent/50'
      }`}
    >
      <div
        className="p-4 cursor-pointer"
        onClick={() => {
          onSelect()
          setExpanded(!expanded)
        }}
        aria-expanded={expanded}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect()
            setExpanded(!expanded)
          }
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-accent/10 rounded-mac">
              <Users size={16} className="text-accent" />
            </div>
            <h4 className="font-medium text-text-primary">{team.name}</h4>
          </div>
          <div className="flex items-center gap-3 text-xs text-text-secondary">
            <span className="bg-glass px-2 py-0.5 rounded-mac">{team.stats.memberCount} members</span>
            <span className="bg-glass px-2 py-0.5 rounded-mac">{team.stats.agentCount} agents</span>
          </div>
        </div>

        {team.description && (
          <p className="text-sm text-text-secondary mb-3 ml-10">{team.description}</p>
        )}

        <div className="flex items-center gap-4 text-xs ml-10">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-success" aria-hidden="true" />
            <span className="text-text-secondary">{team.stats.onlineMembers} online</span>
          </div>
          <div className="flex items-center gap-1.5 text-text-secondary">
            <Bot size={12} />
            <span>{team.stats.idleAgents} idle</span>
          </div>
          <div className="flex items-center gap-1.5 text-text-secondary">
            <FolderOpen size={12} />
            <span>{team.stats.workspaceCount} workspaces</span>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-glass-border bg-glass/30">
          {/* Members */}
          <div className="mt-3">
            <h5 className="text-xs font-semibold text-text-tertiary mb-2 uppercase tracking-wider">
              Members
            </h5>
            <div className="space-y-1">
              {team.members.slice(0, 5).map((member) => (
                <MemberRow key={member.id} member={member} />
              ))}
              {team.members.length > 5 && (
                <button className="text-xs text-accent hover:text-accent-hover font-medium mt-2">
                  +{team.members.length - 5} more members
                </button>
              )}
            </div>
          </div>

          {/* Agents */}
          {team.agents && team.agents.length > 0 && (
            <div className="mt-3">
              <h5 className="text-xs font-semibold text-text-tertiary mb-2 uppercase tracking-wider">
                Agents
              </h5>
              <div className="space-y-1">
                {team.agents.map((agent) => (
                  <div key={agent.id} className="flex items-center justify-between py-1.5 px-2 rounded-mac hover:bg-card-hover transition-colors group">
                    <div className="flex items-center gap-2">
                      <Bot size={12} className="text-accent" />
                      <span className="text-sm text-text-primary">{agent.name}</span>
                      <span className="text-[10px] text-text-tertiary capitalize">{agent.state}</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemoveAgent(agent.id) }}
                      disabled={removingAgent === agent.id}
                      className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-all disabled:opacity-50"
                      title="Remove agent from team"
                    >
                      <UserMinus size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowAssignModal(true)
                loadAgents()
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-glass hover:bg-card-hover border border-glass-border rounded-mac text-xs text-text-primary transition-colors"
            >
              <Bot size={14} />
              <span>Assign Agent</span>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleDeleteTeam() }}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-mac text-xs text-red-400 transition-colors disabled:opacity-50"
            >
              <Trash2 size={14} />
              <span>{deleting ? 'Deleting...' : 'Delete Team'}</span>
            </button>
          </div>

          {/* Assign Agent Modal */}
          {showAssignModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={(e) => e.stopPropagation()}>
              <div className="bg-mac-panel/95 border border-glass-border rounded-mac-xl p-5 w-[380px] shadow-mac backdrop-blur-xl" role="dialog" aria-modal="true" aria-label="Assign Agent to Team">
                <div className="flex justify-between items-center mb-5">
                  <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                    <Bot size={18} className="text-accent" />
                    Assign Agent
                  </h3>
                  <button
                    onClick={() => setShowAssignModal(false)}
                    className="p-1.5 hover:bg-card-hover rounded-mac transition-colors"
                  >
                    <X size={18} className="text-text-secondary" />
                  </button>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {availableAgents.length === 0 ? (
                    <p className="text-sm text-text-tertiary text-center py-4">No agents available</p>
                  ) : (
                    availableAgents.map((agent) => (
                      <div
                        key={agent.id}
                        className="flex items-center justify-between p-3 rounded-mac hover:bg-card-hover transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 bg-accent/10 rounded-mac">
                            <Bot size={14} className="text-accent" />
                          </div>
                          <div>
                            <p className="text-sm text-text-primary font-medium">{agent.name}</p>
                            <p className="text-xs text-text-tertiary">{agent.type}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleAssignAgent(agent.id)}
                          disabled={assigning === agent.id}
                          className="px-3 py-1 text-xs bg-accent/10 hover:bg-accent/20 text-accent rounded-mac transition-colors disabled:opacity-50"
                        >
                          {assigning === agent.id ? 'Assigning...' : 'Add'}
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex justify-end mt-5 pt-4 border-t border-glass-border">
                  <button
                    onClick={() => setShowAssignModal(false)}
                    className="btn-secondary"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MemberRow({ member }: { member: TeamMember }) {
  return (
    <div className="flex items-center justify-between py-2 px-2 rounded-mac hover:bg-card-hover transition-colors">
      <div className="flex items-center gap-2.5">
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
            member.online ? 'bg-success/20 text-success' : 'bg-glass text-text-secondary'
          }`}
        >
          {member.name.charAt(0).toUpperCase()}
        </div>
        <span className="text-sm text-text-primary">{member.name}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {roleIcons[member.role]}
        <span className="text-xs text-text-secondary capitalize">
          {member.role}
        </span>
      </div>
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore'
import {
  Users,
  Plus,
  UserPlus,
  Settings,
  FolderOpen,
  Bot,
  Crown,
  Shield,
  Code2,
  X,
} from 'lucide-react'
import { Team, TeamMember, MemberRole } from '../types'
import { api } from '../services'
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

  // Load teams from backend on mount
  useEffect(() => {
    let cancelled = false
    const loadTeams = async () => {
      setLoading(true)
      try {
        const teamInfos = await api.team.getTeams()
        if (cancelled) return
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
        if (cancelled) return
        logger.error('Team', 'Failed to load teams:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadTeams()
    return () => { cancelled = true }
  }, []) // Only run on mount

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
}

function TeamCard({ team, isActive, onSelect }: TeamCardProps) {
  const [expanded, setExpanded] = useState(false)

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

          {/* Actions */}
          <div className="flex items-center gap-2 mt-4">
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-glass hover:bg-card-hover border border-glass-border rounded-mac text-xs text-text-primary transition-colors">
              <UserPlus size={14} />
              <span>Invite</span>
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-glass hover:bg-card-hover border border-glass-border rounded-mac text-xs text-text-primary transition-colors">
              <FolderOpen size={14} />
              <span>Workspaces</span>
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-glass hover:bg-card-hover border border-glass-border rounded-mac text-xs text-text-primary transition-colors">
              <Bot size={14} />
              <span>Assign Agent</span>
            </button>
          </div>
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

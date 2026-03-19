import { useState } from 'react'
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

const roleIcons: Record<MemberRole, React.ReactNode> = {
  owner: <Crown size={14} className="text-warning" />,
  admin: <Shield size={14} className="text-info" />,
  developer: <Code2 size={14} className="text-success" />,
  reviewer: <Settings size={14} className="text-text-secondary" />,
  observer: <Users size={14} className="text-text-tertiary" />,
}

export default function TeamPanel() {
  const { teams, activeTeam, setActiveTeam } = useAppStore()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')

  const handleCreateTeam = () => {
    // This would call the backend to create a team
    setShowCreateModal(false)
    setNewTeamName('')
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
        {teams.length === 0 ? (
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
          <div className="bg-mac-panel/95 border border-glass-border rounded-mac-xl p-5 w-[380px] shadow-mac backdrop-blur-xl">
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
              >
                Create Team
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
            <div className="w-2 h-2 rounded-full bg-success" />
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

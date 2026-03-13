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
} from 'lucide-react'
import { Team, TeamMember, MemberRole } from '../types'

const roleIcons: Record<MemberRole, React.ReactNode> = {
  owner: <Crown size={14} className="text-warning" />,
  admin: <Shield size={14} className="text-info" />,
  developer: <Code2 size={14} className="text-success" />,
  reviewer: <Settings size={14} className="text-text-secondary" />,
  observer: <Users size={14} className="text-text-secondary" />,
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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Users size={20} className="text-accent" />
          <h2 className="text-lg font-semibold">Teams</h2>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center space-x-1 px-3 py-1.5 bg-accent hover:bg-accent-hover rounded text-sm"
        >
          <Plus size={16} />
          <span>New Team</span>
        </button>
      </div>

      {/* Team List */}
      <div className="flex-1 overflow-y-auto">
        {teams.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-text-secondary">
            <Users size={48} className="mb-4 opacity-50" />
            <p className="text-lg mb-2">No teams created</p>
            <p className="text-sm">Create a team to collaborate with others</p>
          </div>
        ) : (
          <div className="space-y-4">
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-panel-bg border border-panel-border rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">Create New Team</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  Team Name
                </label>
                <input
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  className="w-full bg-editor-bg border border-panel-border rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  placeholder="My Team"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 border border-panel-border hover:bg-panel-border rounded text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTeam}
                className="px-4 py-2 bg-accent hover:bg-accent-hover rounded text-sm"
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
      className={`border rounded-lg transition-colors ${
        isActive
          ? 'border-accent bg-accent/10'
          : 'border-panel-border hover:border-accent'
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
          <div className="flex items-center space-x-2">
            <Users size={18} className="text-accent" />
            <h4 className="font-medium">{team.name}</h4>
          </div>
          <div className="flex items-center space-x-3 text-xs text-text-secondary">
            <span>{team.stats.memberCount} members</span>
            <span>{team.stats.agentCount} agents</span>
          </div>
        </div>

        {team.description && (
          <p className="text-sm text-text-secondary mb-2">{team.description}</p>
        )}

        <div className="flex items-center space-x-4 text-xs">
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 rounded-full bg-success" />
            <span>{team.stats.onlineMembers} online</span>
          </div>
          <div className="flex items-center space-x-1">
            <Bot size={12} />
            <span>{team.stats.idleAgents} idle agents</span>
          </div>
          <div className="flex items-center space-x-1">
            <FolderOpen size={12} />
            <span>{team.stats.workspaceCount} workspaces</span>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-panel-border">
          {/* Members */}
          <div className="mt-3">
            <h5 className="text-xs font-semibold text-text-secondary mb-2">
              MEMBERS
            </h5>
            <div className="space-y-1">
              {team.members.slice(0, 5).map((member) => (
                <MemberRow key={member.id} member={member} />
              ))}
              {team.members.length > 5 && (
                <button className="text-xs text-accent hover:text-accent-hover">
                  +{team.members.length - 5} more members
                </button>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-2 mt-4">
            <button className="flex items-center space-x-1 px-3 py-1.5 border border-panel-border hover:bg-panel-border rounded text-xs">
              <UserPlus size={14} />
              <span>Invite</span>
            </button>
            <button className="flex items-center space-x-1 px-3 py-1.5 border border-panel-border hover:bg-panel-border rounded text-xs">
              <FolderOpen size={14} />
              <span>Workspaces</span>
            </button>
            <button className="flex items-center space-x-1 px-3 py-1.5 border border-panel-border hover:bg-panel-border rounded text-xs">
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
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center space-x-2">
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
            member.online ? 'bg-success/20 text-success' : 'bg-panel-border text-text-secondary'
          }`}
        >
          {member.name.charAt(0).toUpperCase()}
        </div>
        <span className="text-sm">{member.name}</span>
      </div>
      <div className="flex items-center space-x-1">
        {roleIcons[member.role]}
        <span className="text-xs text-text-secondary capitalize">
          {member.role}
        </span>
      </div>
    </div>
  )
}
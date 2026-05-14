import { useState, useEffect } from 'react'
import {
  CheckCircle,
  XCircle,
  Clock,
  Users,
  Target,
  AlertTriangle,
  BarChart3,
} from 'lucide-react'

interface Vote {
  agentId: string
  agentName: string
  approved: boolean
  confidence: number
  comment?: string
  timestamp: Date
}

interface ConsensusRound {
  round: number
  taskId: string
  taskTitle: string
  status: 'collecting' | 'evaluating' | 'consensus' | 'timeout' | 'conflict'
  votes: Vote[]
  threshold: number
  agreement: number
  deadline: Date
  algorithm: 'simple_majority' | 'supermajority' | 'unanimity' | 'weighted' | 'byzantine' | 'queen_bee'
}

interface ConsensusVisualizationProps {
  rounds?: ConsensusRound[]
  currentRound?: ConsensusRound
  onApprove?: () => void
  onReject?: () => void
}

export default function ConsensusVisualization({
  rounds = [],
  currentRound,
  onApprove,
  onReject,
}: ConsensusVisualizationProps) {
  const [selectedRound, setSelectedRound] = useState<number | null>(null)
  const [timeLeft, setTimeLeft] = useState<string>('')

  // Update time left countdown
  useEffect(() => {
    if (!currentRound) return

    const updateTimer = () => {
      const now = new Date()
      const diff = currentRound.deadline.getTime() - now.getTime()
      if (diff <= 0) {
        setTimeLeft('Expired')
        return
      }
      const seconds = Math.floor(diff / 1000)
      const minutes = Math.floor(seconds / 60)
      const remainingSeconds = seconds % 60
      setTimeLeft(`${minutes}:${remainingSeconds.toString().padStart(2, '0')}`)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [currentRound])

  const getAlgorithmLabel = (algo: ConsensusRound['algorithm']) => {
    switch (algo) {
      case 'simple_majority':
        return 'Simple Majority (>50%)'
      case 'supermajority':
        return 'Supermajority (2/3)'
      case 'unanimity':
        return 'Unanimity (100%)'
      case 'weighted':
        return 'Weighted Voting'
      case 'byzantine':
        return 'Byzantine Fault Tolerance'
      case 'queen_bee':
        return 'Queen Bee Model'
    }
  }

  const getStatusColor = (status: ConsensusRound['status']) => {
    switch (status) {
      case 'consensus':
        return 'text-success'
      case 'timeout':
      case 'conflict':
        return 'text-error'
      case 'collecting':
        return 'text-warning'
      default:
        return 'text-text-secondary'
    }
  }

  const getStatusIcon = (status: ConsensusRound['status']) => {
    switch (status) {
      case 'consensus':
        return <CheckCircle size={20} className="text-success" />
      case 'timeout':
      case 'conflict':
        return <XCircle size={20} className="text-error" />
      case 'collecting':
        return <Clock size={20} className="text-warning animate-pulse" />
      default:
        return <Target size={20} className="text-text-secondary" />
    }
  }

  // Calculate stats
  const approvedVotes = currentRound?.votes.filter(v => v.approved).length || 0
  const rejectedVotes = currentRound?.votes.filter(v => !v.approved).length || 0
  const totalVotes = currentRound?.votes.length || 0
  const pendingVotes = (currentRound?.threshold || 0) - totalVotes

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-glass-border">
        <div className="flex items-center gap-3">
          <Users size={20} className="text-accent" />
          <div>
            <h2 className="text-base font-semibold text-text-primary">Consensus Engine</h2>
            <p className="text-xs text-text-secondary">
              {currentRound ? getAlgorithmLabel(currentRound.algorithm) : 'No active consensus'}
            </p>
          </div>
        </div>
        {currentRound && (
          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 bg-warning/20 text-warning rounded-mac text-xs font-medium">
              ⏱ {timeLeft}
            </div>
            <div className={`px-3 py-1.5 rounded-mac text-xs font-medium ${getStatusColor(currentRound.status)}`}>
              {currentRound.status.toUpperCase()}
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {!currentRound ? (
          <div className="flex flex-col items-center justify-center h-64 text-text-tertiary">
            <Target size={48} className="opacity-50 mb-4" />
            <p className="text-sm">No active consensus round</p>
            <p className="text-xs mt-1">Consensus will be triggered when agents need to agree</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Task Info */}
            <div className="p-4 bg-mac-sidebar/50 rounded-mac border border-glass-border">
              <div className="flex items-center gap-2 mb-2">
                {getStatusIcon(currentRound.status)}
                <span className="text-sm font-medium text-text-primary">
                  Round {currentRound.round}
                </span>
              </div>
              <p className="text-sm text-text-secondary">
                {currentRound.taskTitle}
              </p>
            </div>

            {/* Agreement Progress */}
            <div className="p-4 bg-mac-sidebar/50 rounded-mac border border-glass-border">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-text-secondary">Agreement Level</span>
                <span className="text-sm font-medium text-text-primary">
                  {Math.round(currentRound.agreement * 100)}% / {Math.round(currentRound.threshold * 100)}%
                </span>
              </div>
              <div className="relative h-3 bg-surface rounded-full overflow-hidden" role="progressbar" aria-valuenow={Math.round(currentRound.agreement * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Agreement level: ${Math.round(currentRound.agreement * 100)}% of ${Math.round(currentRound.threshold * 100)}% threshold`}>
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
                    currentRound.agreement >= currentRound.threshold
                      ? 'bg-success'
                      : currentRound.agreement >= currentRound.threshold / 2
                      ? 'bg-warning'
                      : 'bg-error'
                  }`}
                  style={{ width: `${Math.min(currentRound.agreement * 100, 100)}%` }}
                />
                {/* Threshold marker */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-white/50"
                  style={{ left: `${currentRound.threshold * 100}%` }}
                />
              </div>
            </div>

            {/* Vote Distribution */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-success/10 rounded-mac border border-success/20 text-center">
                <CheckCircle size={20} className="mx-auto mb-1 text-success" />
                <p className="text-lg font-bold text-success">{approvedVotes}</p>
                <p className="text-xs text-text-secondary">Approved</p>
              </div>
              <div className="p-3 bg-error/10 rounded-mac border border-error/20 text-center">
                <XCircle size={20} className="mx-auto mb-1 text-error" />
                <p className="text-lg font-bold text-error">{rejectedVotes}</p>
                <p className="text-xs text-text-secondary">Rejected</p>
              </div>
              <div className="p-3 bg-warning/10 rounded-mac border border-warning/20 text-center">
                <Clock size={20} className="mx-auto mb-1 text-warning" />
                <p className="text-lg font-bold text-warning">{pendingVotes}</p>
                <p className="text-xs text-text-secondary">Pending</p>
              </div>
            </div>

            {/* Individual Votes */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-text-secondary">
                <BarChart3 size={14} />
                <span>Individual Votes</span>
              </div>
              {currentRound.votes.map((vote) => (
                <div
                  key={vote.agentId}
                  className="flex items-center gap-3 p-3 bg-mac-sidebar/30 rounded-mac border border-glass-border"
                >
                  {vote.approved ? (
                    <CheckCircle size={16} className="text-success" />
                  ) : (
                    <XCircle size={16} className="text-error" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary">
                        {vote.agentName}
                      </span>
                      <span className="text-xs text-text-tertiary">
                        {(vote.confidence * 100).toFixed(0)}% confidence
                      </span>
                    </div>
                    {vote.comment && (
                      <p className="text-xs text-text-secondary truncate mt-0.5">
                        "{vote.comment}"
                      </p>
                    )}
                  </div>
                  {/* Confidence bar */}
                  <div className="w-16 h-1.5 bg-surface rounded-full overflow-hidden" role="progressbar" aria-valuenow={Math.round(vote.confidence * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Confidence: ${Math.round(vote.confidence * 100)}%`}>
                    <div
                      className={`h-full rounded-full ${
                        vote.confidence > 0.8
                          ? 'bg-success'
                          : vote.confidence > 0.5
                          ? 'bg-warning'
                          : 'bg-error'
                      }`}
                      style={{ width: `${vote.confidence * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Byzantine Warning */}
            {currentRound.algorithm === 'byzantine' && rejectedVotes > 0 && (
              <div className="p-3 bg-error/10 border border-error/20 rounded-mac flex items-start gap-2">
                <AlertTriangle size={16} className="text-error flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-error">Potential Byzantine Behavior Detected</p>
                  <p className="text-xs text-text-secondary mt-1">
                    {rejectedVotes} agent(s) voted against consensus. Investigation may be required.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Historical Rounds */}
      {rounds.length > 0 && (
        <div className="border-t border-glass-border p-3">
          <p className="text-xs text-text-secondary mb-2">Recent Rounds</p>
          <div className="flex gap-2 overflow-x-auto pb-1" role="listbox" aria-label="Recent consensus rounds">
            {rounds.slice(-5).map((round) => (
              <button
                key={`${round.taskId}-${round.round}`}
                role="option"
                aria-selected={selectedRound === round.round}
                onClick={() => setSelectedRound(selectedRound === round.round ? null : round.round)}
                className={`flex-shrink-0 px-3 py-2 rounded-mac text-xs transition-colors ${
                  selectedRound === round.round
                    ? 'bg-accent text-white'
                    : 'bg-mac-sidebar text-text-secondary hover:text-text-primary'
                }`}
              >
                <span className="font-medium">R{round.round}</span>
                <span className="mx-1">·</span>
                <span className={getStatusColor(round.status)}>
                  {round.status === 'consensus' ? '✓' : round.status === 'conflict' ? '✗' : '○'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {currentRound && currentRound.status === 'collecting' && (
        <div className="border-t border-glass-border p-3 flex gap-2">
          <button
            onClick={onApprove}
            className="flex-1 btn-primary flex items-center justify-center gap-2"
          >
            <CheckCircle size={16} />
            Approve
          </button>
          <button
            onClick={onReject}
            className="flex-1 btn-secondary flex items-center justify-center gap-2"
          >
            <XCircle size={16} />
            Reject
          </button>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useSwarmAlgorithmStore, type QueenInfo } from '../stores/swarmAlgorithmStore'
import { api } from '../services'
import { logger, formatRelativeTime } from '../utils'

interface QueenElectionPanelProps {
  swarmId: string
}

type ElectionEventType = 'elected' | 'abdicated' | 'backup_activated'

interface ElectionEvent {
  id: string
  type: ElectionEventType
  swarmId: string
  queenId: string
  timestamp: string
  reason?: string
}

const STATE_CONFIG = {
  stable: { color: 'text-green-400', bg: 'bg-green-500/20', border: 'border-green-500/30', label: 'Stable' },
  pending: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', border: 'border-yellow-500/30', label: 'Pending' },
  failed: { color: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/30', label: 'Failed' },
} as const

export function QueenElectionPanel({ swarmId }: QueenElectionPanelProps) {
  const { queens, fetchQueenStatus, triggerElection, abdicateQueen, loading, error, onQueenElected, onQueenAbdicated } = useSwarmAlgorithmStore()
  const [showAbdicateDialog, setShowAbdicateDialog] = useState(false)
  const [abdicationReason, setAbdicationReason] = useState('')
  const [electionHistory, setElectionHistory] = useState<ElectionEvent[]>([])

  const queenInfo: QueenInfo | undefined = queens[swarmId]
  const stateConfig = queenInfo ? STATE_CONFIG[queenInfo.state] : STATE_CONFIG.pending

  useEffect(() => {
    if (swarmId) {
      fetchQueenStatus(swarmId)
    }
  }, [swarmId, fetchQueenStatus])

  useEffect(() => {
    const unsubEvents = [
      api.events.subscribe('queen_elected', (data) => {
        onQueenElected(data)
        const payload = data as { swarmId: string; queenId: string; round: number; electedAt: string }
        if (payload.swarmId === swarmId) {
          const evt: ElectionEvent = { id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type: 'elected', swarmId: payload.swarmId, queenId: payload.queenId, timestamp: payload.electedAt }
          setElectionHistory((prev) => [evt, ...prev].slice(0, 5))
        }
      }),
      api.events.subscribe('queen_abdicated', (data) => {
        onQueenAbdicated(data)
        const payload = data as { swarmId: string; queenId: string; reason: string; timestamp: string }
        if (payload.swarmId === swarmId) {
          const evt: ElectionEvent = { id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type: 'abdicated', swarmId: payload.swarmId, queenId: payload.queenId, timestamp: payload.timestamp, reason: payload.reason }
          setElectionHistory((prev) => [evt, ...prev].slice(0, 5))
        }
      }),
      api.events.subscribe('backup_activated', (data) => {
        const payload = data as { swarmId: string; queenId: string; timestamp: string }
        if (payload.swarmId === swarmId) {
          const evt: ElectionEvent = { id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type: 'backup_activated', swarmId: payload.swarmId, queenId: payload.queenId, timestamp: payload.timestamp }
          setElectionHistory((prev) => [evt, ...prev].slice(0, 5))
        }
      }),
    ]

    return () => {
      unsubEvents.forEach((unsub) => unsub())
    }
  }, [swarmId, onQueenElected, onQueenAbdicated])

  const handleTriggerElection = async () => {
    try {
      await triggerElection(swarmId)
    } catch (err) {
      logger.error('QueenElectionPanel', 'Failed to trigger election:', err)
    }
  }

  const handleAbdicateQueen = async () => {
    if (!abdicationReason.trim()) return
    try {
      await abdicateQueen(swarmId, abdicationReason)
      setShowAbdicateDialog(false)
      setAbdicationReason('')
    } catch (err) {
      logger.error('QueenElectionPanel', 'Failed to abdicate queen:', err)
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#0d1117] border-r border-[#30363d]">
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/20">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {queenInfo ? (
          <>
            <div className={`p-3 rounded-lg border ${stateConfig.bg} ${stateConfig.border}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4" style={{ color: '#fbbf24' }} fill="currentColor" viewBox="0 0 24 24">
                    <path d="M2 4l3 10h14l3-10-6 5-4-7-4 7-6-5zm3 12v2h14v-2H5z" />
                  </svg>
                  <span className="text-sm font-semibold text-white">Current Queen</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded ${stateConfig.color} ${stateConfig.bg}`}>
                  {stateConfig.label}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Queen ID</span>
                  <span className="text-xs font-mono text-white">{queenInfo.queenId}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Backup ID</span>
                  <span className="text-xs font-mono text-white">{queenInfo.backupId || 'None'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Round</span>
                  <span className="text-xs font-mono text-white">#{queenInfo.round}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Elected At</span>
                  <span className="text-xs text-slate-300">{formatRelativeTime(new Date(queenInfo.electedAt))}</span>
                </div>
                {queenInfo.abdication && (
                  <div className="flex items-start justify-between">
                    <span className="text-xs text-slate-400">Abdication</span>
                    <span className="text-xs text-red-400 text-right max-w-[150px]">{queenInfo.abdication}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleTriggerElection}
                disabled={loading}
                className="flex-1 px-3 py-2 text-xs bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Trigger Election
              </button>
              <button
                onClick={() => setShowAbdicateDialog(true)}
                disabled={loading || !queenInfo.queenId}
                className="flex-1 px-3 py-2 text-xs bg-orange-500/20 text-orange-400 rounded hover:bg-orange-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                Abdicate Queen
              </button>
            </div>

            {electionHistory.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Election History</h4>
                <div className="space-y-1">
                  {electionHistory.map((event) => (
                    <div key={event.id} className="px-2 py-1.5 bg-slate-800/30 rounded text-xs flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          event.type === 'elected' ? 'bg-green-500' :
                          event.type === 'abdicated' ? 'bg-red-500' :
                          'bg-yellow-500'
                        }`} />
                        <span className="text-slate-300">{event.queenId}</span>
                        {event.reason && (
                          <span className="text-slate-500 text-[10px] max-w-[100px] truncate">({event.reason})</span>
                        )}
                      </div>
                      <span className="text-slate-500 text-[10px]">{formatRelativeTime(new Date(event.timestamp))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <svg className="w-10 h-10 text-slate-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-slate-500">No queen elected</p>
            <p className="text-xs text-slate-600 mt-1">Trigger an election to select a queen agent</p>
          </div>
        )}
      </div>

      {showAbdicateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#161b22] border border-slate-700 rounded-lg p-4 w-96 max-w-[90vw]">
            <h4 className="text-sm font-semibold text-white mb-3">Abdicate Queen</h4>
            <p className="text-xs text-slate-400 mb-3">
              Provide a reason for abdicating the current queen. This will trigger a new election.
            </p>
            <textarea
              value={abdicationReason}
              onChange={(e) => setAbdicationReason(e.target.value)}
              placeholder="Reason for abdication..."
              rows={3}
              className="w-full bg-slate-800/50 border border-slate-700 rounded px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-blue-500 outline-none resize-none"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => {
                  setShowAbdicateDialog(false)
                  setAbdicationReason('')
                }}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAbdicateQueen}
                disabled={!abdicationReason.trim()}
                className="px-3 py-1.5 text-xs bg-orange-500/20 text-orange-400 rounded hover:bg-orange-500/30 transition-colors disabled:opacity-50"
              >
                Abdicate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default QueenElectionPanel

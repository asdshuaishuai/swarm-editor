import { useState, useEffect } from 'react'
import { useSwarmAlgorithmStore, type CheckpointInfo } from '../stores/swarmAlgorithmStore'
import { api } from '../services'
import { logger, formatRelativeTime } from '../utils'

interface InterruptRecoveryPanelProps {
  swarmId: string
}

const REASON_CONFIG = {
  timeout: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: 'Timeout' },
  network: { color: 'text-blue-400', bg: 'bg-blue-500/20', label: 'Network' },
  crash: { color: 'text-red-400', bg: 'bg-red-500/20', label: 'Crash' },
  token_limit: { color: 'text-purple-400', bg: 'bg-purple-500/20', label: 'Token Limit' },
  manual: { color: 'text-orange-400', bg: 'bg-orange-500/20', label: 'Manual' },
  unknown: { color: 'text-slate-400', bg: 'bg-slate-500/20', label: 'Unknown' },
} as const

const STRATEGY_OPTIONS = [
  { value: 'retry', label: 'Retry Same Agent', description: 'Retry with the same agent' },
  { value: 'reassign', label: 'Reassign', description: 'Assign to a different agent' },
  { value: 'escalate', label: 'Escalate', description: 'Escalate to supervisor' },
  { value: 'skip', label: 'Skip', description: 'Skip this task' },
] as const

export function InterruptRecoveryPanel({ swarmId }: InterruptRecoveryPanelProps) {
  const { checkpoints, fetchCheckpoints, resumeTask, recoverTask, loading, error, onAgentInterrupted, onTaskResumed } = useSwarmAlgorithmStore()
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<CheckpointInfo | null>(null)
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false)
  const [selectedStrategy, setSelectedStrategy] = useState<string>('retry')

  useEffect(() => {
    if (swarmId) {
      fetchCheckpoints(swarmId)
    }
  }, [swarmId, fetchCheckpoints])

  useEffect(() => {
    const unsubEvents = [
      api.events.subscribe('agent_interrupted', (data) => {
        onAgentInterrupted(data)
        const payload = data as { swarmId: string; checkpointId: string }
        if (payload.swarmId === swarmId) {
          fetchCheckpoints(swarmId)
        }
      }),
      api.events.subscribe('task_resumed', (data) => {
        onTaskResumed(data)
      }),
      api.events.subscribe('task_recovered', (data) => {
        onTaskResumed(data)
        const payload = data as { swarmId: string }
        if (payload.swarmId === swarmId) {
          fetchCheckpoints(swarmId)
        }
      }),
    ]

    return () => {
      unsubEvents.forEach((unsub) => unsub())
    }
  }, [swarmId, onAgentInterrupted, onTaskResumed, fetchCheckpoints])

  const handleResume = async (checkpoint: CheckpointInfo) => {
    try {
      await resumeTask(checkpoint.checkpointId, checkpoint.agentId)
    } catch (err) {
      logger.error('InterruptRecoveryPanel', 'Failed to resume task:', err)
    }
  }

  const handleRecover = async (checkpoint: CheckpointInfo, strategy: string) => {
    try {
      await recoverTask(checkpoint.checkpointId, strategy)
      setShowRecoveryDialog(false)
      setSelectedCheckpoint(null)
    } catch (err) {
      logger.error('InterruptRecoveryPanel', 'Failed to recover task:', err)
    }
  }

  const openRecoveryDialog = (checkpoint: CheckpointInfo) => {
    setSelectedCheckpoint(checkpoint)
    setSelectedStrategy('retry')
    setShowRecoveryDialog(true)
  }

  const getReasonConfig = (reason: string) => {
    const lowerReason = reason.toLowerCase()
    if (lowerReason.includes('timeout')) return REASON_CONFIG.timeout
    if (lowerReason.includes('network')) return REASON_CONFIG.network
    if (lowerReason.includes('crash')) return REASON_CONFIG.crash
    if (lowerReason.includes('token') || lowerReason.includes('limit')) return REASON_CONFIG.token_limit
    if (lowerReason.includes('manual')) return REASON_CONFIG.manual
    return REASON_CONFIG.unknown
  }

  const activeCheckpoints = checkpoints.filter((cp) => !cp.recovered)
  const recoveredCount = checkpoints.length - activeCheckpoints.length

  return (
    <div className="flex flex-col h-full bg-[#0d1117] border-r border-[#30363d]">
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/20">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-between px-3 py-2 border-b border-[#30363d]">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Interrupts & Recovery</h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500">{activeCheckpoints.length} active</span>
          {recoveredCount > 0 && (
            <span className="text-[10px] text-green-400">{recoveredCount} recovered</span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {activeCheckpoints.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <svg className="w-10 h-10 text-slate-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-slate-500">No active interrupts</p>
            <p className="text-xs text-slate-600 mt-1">All tasks are running smoothly</p>
          </div>
        ) : (
          activeCheckpoints.map((checkpoint) => {
            const reasonConfig = getReasonConfig(checkpoint.reason)
            return (
              <div
                key={checkpoint.checkpointId}
                className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/50"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${reasonConfig.bg.replace('bg-', 'bg-').replace('/20', '')}`} />
                    <span className="text-xs font-medium text-white">{checkpoint.taskId}</span>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${reasonConfig.color} ${reasonConfig.bg}`}>
                    {reasonConfig.label}
                  </span>
                </div>

                <div className="space-y-1 mb-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Agent</span>
                    <span className="text-[10px] font-mono text-slate-300">{checkpoint.agentId}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Interrupted</span>
                    <span className="text-[10px] text-slate-300">{formatRelativeTime(new Date(checkpoint.savedAt))}</span>
                  </div>
                  {checkpoint.retryCount > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-500">Retry Count</span>
                      <span className="text-[10px] text-yellow-400">{checkpoint.retryCount}</span>
                    </div>
                  )}
                  {checkpoint.partialResult && (
                    <div className="mt-2 p-2 bg-slate-900/50 rounded">
                      <span className="text-[10px] text-slate-500 block mb-1">Partial Result</span>
                      <p className="text-[10px] text-slate-300 line-clamp-2">{checkpoint.partialResult}</p>
                    </div>
                  )}
                </div>

                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleResume(checkpoint)}
                    disabled={loading}
                    className="flex-1 px-2 py-1.5 text-[10px] bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition-colors disabled:opacity-50"
                  >
                    Resume
                  </button>
                  <button
                    onClick={() => openRecoveryDialog(checkpoint)}
                    disabled={loading}
                    className="flex-1 px-2 py-1.5 text-[10px] bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors disabled:opacity-50"
                  >
                    Recover
                  </button>
                </div>
              </div>
            )
          })
        )}

        {recoveredCount > 0 && (
          <div className="pt-2 border-t border-[#30363d]">
            <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Recovered</h4>
            <div className="space-y-1">
              {checkpoints.filter((cp) => cp.recovered).map((checkpoint) => (
                <div
                  key={checkpoint.checkpointId}
                  className="px-2 py-1.5 bg-slate-800/20 rounded text-xs flex items-center justify-between opacity-60"
                >
                  <span className="text-slate-400">{checkpoint.taskId}</span>
                  <span className="text-[10px] text-green-400">Recovered</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showRecoveryDialog && selectedCheckpoint && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#161b22] border border-slate-700 rounded-lg p-4 w-[400px] max-w-[90vw]">
            <h4 className="text-sm font-semibold text-white mb-3">Recover Task</h4>
            <div className="mb-3 p-2 bg-slate-800/50 rounded">
              <span className="text-[10px] text-slate-500 block mb-1">Task</span>
              <span className="text-xs text-white">{selectedCheckpoint.taskId}</span>
            </div>
            <p className="text-xs text-slate-400 mb-3">Choose a recovery strategy:</p>
            <div className="space-y-2 mb-4">
              {STRATEGY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSelectedStrategy(option.value)}
                  className={`w-full px-3 py-2 text-left rounded border transition-colors ${
                    selectedStrategy === option.value
                      ? 'bg-blue-500/20 border-blue-500/50 text-white'
                      : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-700/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{option.label}</span>
                    <div className={`w-3 h-3 rounded-full border ${
                      selectedStrategy === option.value
                        ? 'bg-blue-500 border-blue-500'
                        : 'border-slate-500'
                    }`}>
                      {selectedStrategy === option.value && (
                        <svg className="w-2 h-2 text-white m-0.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500">{option.description}</span>
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowRecoveryDialog(false)
                  setSelectedCheckpoint(null)
                }}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRecover(selectedCheckpoint, selectedStrategy)}
                disabled={loading}
                className="px-3 py-1.5 text-xs bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors disabled:opacity-50"
              >
                Recover
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default InterruptRecoveryPanel

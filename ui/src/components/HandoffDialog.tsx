import { useState, useEffect } from 'react'
import { logger } from '../utils'
import type { HandoffRequestData } from '../stores/handoffStore'

interface HandoffDialogProps {
  request: HandoffRequestData | null
  onAccept: (requestId: string, summary: string) => void
  onReject: (requestId: string, reason: string) => void
  onClose: () => void
}

export function HandoffDialog({ request, onAccept, onReject, onClose }: HandoffDialogProps) {
  const [summary, setSummary] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, isLoading])

  // Return null if no request
  if (!request) return null

  const handleAccept = async () => {
    // Compute final summary synchronously before async operations to avoid stale closure
    const finalSummary = summary.trim() || 'Accepted. Ready to continue.'

    setIsLoading(true)
    try {
      // In real implementation, call backend API
      // await api.handoff.accept(request.id, finalSummary)

      onAccept(request.id, finalSummary)
      onClose()
    } catch (error) {
      logger.error('HandoffDialog', 'Failed to accept handoff:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleReject = async () => {
    setIsLoading(true)
    try {
      // In real implementation, call backend API
      // await api.handoff.reject(request.id, 'User rejected')

      onReject(request.id, 'User rejected')
      onClose()
    } catch (error) {
      logger.error('HandoffDialog', 'Failed to reject handoff:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const formatDate = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (seconds < 60) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    return `${hours}h ago`
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" role="presentation">
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-600 rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6" role="dialog" aria-modal="true" aria-label="Handoff request">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 border-b border-slate-700 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Task Handoff Request</h3>
              <p className="text-sm text-slate-400">
                {request.fromAgent} wants to transfer to {request.toAgent}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Agent Info */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h4 className="text-xs text-slate-400 uppercase tracking-wide mb-2">From</h4>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-500/30 flex items-center justify-center">
                <span className="text-xs text-blue-400">
                  {request.fromAgent.charAt(0).toUpperCase()}
                </span>
              </div>
              <span className="text-sm text-white font-mono">{request.fromAgent}</span>
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h4 className="text-xs text-slate-400 uppercase tracking-wide mb-2">To</h4>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-green-500/30 flex items-center justify-center">
                <span className="text-xs text-green-400">
                  {request.toAgent.charAt(0).toUpperCase()}
                </span>
              </div>
              <span className="text-sm text-white font-mono">{request.toAgent}</span>
            </div>
          </div>
        </div>

        {/* Reason */}
        <div className="mb-6">
          <h4 className="text-sm text-slate-400 uppercase tracking-wide mb-2">Reason</h4>
          <p className="text-white bg-slate-800/50 rounded-lg p-3">{request.reason}</p>
        </div>

        {/* Context Preview */}
        {request.context && (
          <div className="mb-6 space-y-4">
            {request.context.instructions && (
              <div>
                <h4 className="text-sm text-slate-400 uppercase tracking-wide mb-2">Instructions</h4>
                <p className="text-sm text-slate-200 bg-slate-800/50 rounded-lg p-3 max-h-40 overflow-y-auto">
                  {request.context.instructions}
                </p>
              </div>
            )}

            {request.context.filesModified && request.context.filesModified.length > 0 && (
              <div>
                <h4 className="text-sm text-slate-400 uppercase tracking-wide mb-2">
                  Files ({request.context.filesModified.length})
                </h4>
                <div className="flex flex-wrap gap-1">
                  {request.context.filesModified.slice(0, 5).map((file, i) => (
                    <span key={i} className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded font-mono">
                      {file}
                    </span>
                  ))}
                  {request.context.filesModified.length > 5 && (
                    <span className="text-xs text-slate-400">
                      +{request.context.filesModified.length - 5} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {request.context.nextSteps && request.context.nextSteps.length > 0 && (
              <div>
                <h4 className="text-sm text-slate-400 uppercase tracking-wide mb-2">Next Steps</h4>
                <ul className="text-sm text-slate-200 space-y-1">
                  {request.context.nextSteps.slice(0, 3).map((step, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-green-400">→</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Summary Input */}
        <div className="mb-6">
          <h4 className="text-sm text-slate-400 uppercase tracking-wide mb-2">
            Acceptance Summary (for context transfer)
          </h4>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Enter a summary to help the receiving agent understand the context..."
            className="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 text-sm text-white placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 resize-none"
            rows={3}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-700">
          <button
            onClick={handleReject}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-600 rounded-lg transition-colors"
          >
            Reject
          </button>
          <button
            onClick={handleAccept}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            Accept & Transfer
          </button>
        </div>

        {/* Timestamp */}
        <div className="text-xs text-slate-500 text-center mt-4">
          Requested {formatDate(request.createdAt)}
        </div>
      </div>
    </div>
  )
}

// Re-export the store for convenience
// eslint-disable-next-line react-refresh/only-export-components
export { useHandoffStore } from '../stores/handoffStore'

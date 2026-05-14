import { useState, useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import { Shield, AlertTriangle, Check, X, ChevronDown, ChevronUp } from 'lucide-react'

export function PermissionDialog() {
  const activePermission = useAppStore(state => state.activePermission)
  const resolvePermission = useAppStore(state => state.resolvePermission)
  const dismissPermission = useAppStore(state => state.dismissPermission)
  const [expandedOptions, setExpandedOptions] = useState(false)

  // Handle Escape key to dismiss
  useEffect(() => {
    if (!activePermission) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const current = useAppStore.getState().activePermission
        if (current) dismissPermission(current.requestId)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activePermission, dismissPermission])

  if (!activePermission) return null

  const { toolName, description, options } = activePermission

  const handleResolve = (optionId: string) => {
    // Read current permission from store to avoid stale closure
    const current = useAppStore.getState().activePermission
    if (current) resolvePermission(current.requestId, optionId)
  }

  const handleDismiss = () => {
    const current = useAppStore.getState().activePermission
    if (current) dismissPermission(current.requestId)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-fade-in" role="presentation">
      <div className="bg-mac-panel/95 border border-glass-border rounded-mac-xl p-5 w-[480px] max-h-[80vh] shadow-mac backdrop-blur-xl overflow-hidden flex flex-col" role="alertdialog" aria-modal="true" aria-label="Permission request">
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 bg-warning/20 rounded-mac shrink-0">
            <Shield size={24} className="text-warning" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-text-primary mb-1">
              Permission Request
            </h3>
            <p className="text-sm text-text-secondary">
              Agent is requesting permission to use a tool
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1.5 hover:bg-card-hover rounded-mac transition-colors shrink-0"
            aria-label="Dismiss"
          >
            <X size={18} className="text-text-secondary" />
          </button>
        </div>

        {/* Tool Info */}
        <div className="bg-surface rounded-mac p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-warning" />
            <span className="text-sm font-medium text-text-primary">Tool: {toolName}</span>
          </div>
          <p className="text-sm text-text-secondary mb-3">{description}</p>

          {/* Options Toggle */}
          {options && options.length > 0 && (
            <div>
              <button
                aria-expanded={expandedOptions}
                onClick={() => setExpandedOptions(!expandedOptions)}
                className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors"
              >
                {expandedOptions ? (
                  <>
                    <ChevronUp size={14} />
                    Hide options
                  </>
                ) : (
                  <>
                    <ChevronDown size={14} />
                    Show {options.length} option(s)
                  </>
                )}
              </button>

              {expandedOptions && (
                <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
                  {options.map((option) => (
                    <div
                      key={option.id}
                      className="p-3 bg-mac-sidebar rounded-mac border border-glass-border"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-text-primary">
                          {option.label || option.id}
                        </span>
                      </div>
                      {option.description && (
                        <p className="text-xs text-text-secondary">{option.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-glass-border">
          <button
            onClick={handleDismiss}
            className="flex-1 btn-secondary flex items-center justify-center gap-2"
          >
            <X size={16} />
            Deny
          </button>
          {options && options.length > 0 ? (
            options.map((option) => (
              <button
                key={option.id}
                onClick={() => handleResolve(option.id)}
                className="flex-1 btn-primary flex items-center justify-center gap-2"
              >
                <Check size={16} />
                {option.label || 'Approve'}
              </button>
            ))
          ) : (
            <button
              onClick={() => handleResolve('default')}
              className="flex-1 btn-primary flex items-center justify-center gap-2"
            >
              <Check size={16} />
              Approve
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Permission Queue Indicator - shows count of pending permissions
export function PermissionQueueIndicator() {
  const permissionQueue = useAppStore(state => state.permissionQueue)
  const activePermission = useAppStore(state => state.activePermission)

  if (permissionQueue.length === 0 && !activePermission) return null

  return (
    <div className="fixed bottom-4 right-4 bg-mac-panel border border-glass-border rounded-mac p-3 shadow-mac z-50" role="status" aria-live="polite">
      <div className="flex items-center gap-2">
        <Shield size={16} className="text-warning" />
        <span className="text-sm text-text-primary">
          {activePermission
            ? 'Permission pending...'
            : `${permissionQueue.length} permission(s) queued`}
        </span>
      </div>
    </div>
  )
}

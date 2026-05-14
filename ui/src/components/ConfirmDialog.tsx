import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const isDanger = variant === 'danger'
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Handle Escape key to cancel + auto-focus cancel button for keyboard users
  useEffect(() => {
    cancelRef.current?.focus()
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-fade-in"
      role="presentation"
    >
      <div
        className="bg-mac-panel/95 border border-glass-border rounded-mac-xl p-5 w-[400px] shadow-mac backdrop-blur-xl"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-start gap-3 mb-4">
          <div className={`p-2 rounded-mac shrink-0 ${isDanger ? 'bg-error/20' : 'bg-warning/20'}`}>
            <AlertTriangle size={24} className={isDanger ? 'text-error' : 'text-warning'} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-text-primary mb-1">{title}</h3>
            <p className="text-sm text-text-secondary">{message}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="px-3 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary bg-surface hover:bg-card-hover rounded-mac transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-3 py-1.5 text-sm font-medium rounded-mac transition-colors ${
              isDanger
                ? 'text-white bg-error/80 hover:bg-error'
                : 'text-white bg-warning/80 hover:bg-warning'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

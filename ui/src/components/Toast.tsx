import { useEffect } from 'react'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { cn } from '../utils'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
  persistent?: boolean
}

interface ToastProps {
  toast: Toast
  onDismiss: (id: string) => void
}

const iconMap = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

const colorMap = {
  success: {
    bg: 'bg-success/10',
    border: 'border-success/30',
    icon: 'text-success',
    title: 'text-success',
  },
  error: {
    bg: 'bg-error/10',
    border: 'border-error/30',
    icon: 'text-error',
    title: 'text-error',
  },
  warning: {
    bg: 'bg-warning/10',
    border: 'border-warning/30',
    icon: 'text-warning',
    title: 'text-warning',
  },
  info: {
    bg: 'bg-info/10',
    border: 'border-info/30',
    icon: 'text-info',
    title: 'text-info',
  },
}

function ToastItem({ toast, onDismiss }: ToastProps) {
  const Icon = iconMap[toast.type]
  const colors = colorMap[toast.type]

  useEffect(() => {
    if (!toast.persistent && toast.duration !== 0) {
      const timer = setTimeout(() => {
        onDismiss(toast.id)
      }, toast.duration || 5000)

      return () => clearTimeout(timer)
    }
  }, [toast.id, toast.duration, toast.persistent, onDismiss])

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg border shadow-lg',
        'animate-in slide-in-from-right-full fade-in',
        'bg-panel-bg',
        colors.bg,
        colors.border
      )}
      role="alert"
    >
      <Icon className={cn('w-5 h-5 flex-shrink-0 mt-0.5', colors.icon)} />
      <div className="flex-1 min-w-0">
        <p className={cn('font-medium text-sm', colors.title)}>{toast.title}</p>
        {toast.message && (
          <p className="mt-1 text-sm text-text-secondary">{toast.message}</p>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="flex-shrink-0 p-1 rounded hover:bg-panel-border transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4 text-text-secondary" />
      </button>
    </div>
  )
}

interface ToastContainerProps {
  toasts: Toast[]
  onDismiss: (id: string) => void
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
}

const positionMap = {
  'top-right': 'top-4 right-4',
  'top-left': 'top-4 left-4',
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
}

export function ToastContainer({
  toasts = [],
  onDismiss,
  position = 'bottom-right',
}: ToastContainerProps) {
  if (!toasts || toasts.length === 0) return null

  return (
    <div
      className={cn(
        'fixed z-50 flex flex-col gap-2 max-w-md',
        positionMap[position]
      )}
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

export default ToastItem
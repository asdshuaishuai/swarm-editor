import { Component, type ReactNode, type ErrorInfo } from 'react'
import { logger } from '../utils'

// safeErrorMessage returns a safe error message for display.
// In development (Vite), shows full error; in production, shows generic message.
function safeErrorMessage(error: Error | null): string {
  if (!error) return ''
  // import.meta.env.DEV is true in Vite dev mode
  if (import.meta.env?.DEV) return error.message
  if (error.message.includes('network') || error.message.includes('fetch')) {
    return 'A network error occurred'
  }
  return 'An error occurred'
}

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error('ErrorBoundary', `Caught error: ${error.message}`, info.componentStack)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full bg-mac-bg text-text-primary" role="alert" aria-live="assertive">
          <div className="text-center max-w-md px-6">
            <svg className="w-12 h-12 text-error mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <h2 className="text-lg font-semibold text-text-primary mb-2">Something went wrong</h2>
            <p className="text-sm text-text-secondary mb-1">
              An unexpected error occurred in this section.
            </p>
            <p className="text-xs text-text-tertiary mb-4 font-mono break-all">
              {safeErrorMessage(this.state.error)}
            </p>
            <button
              onClick={this.handleReset}
              className="px-4 py-2 text-sm font-medium text-text-primary bg-surface hover:bg-card-hover rounded-mac transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

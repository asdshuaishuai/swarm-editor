import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'
import { logger } from '../utils'

vi.mock('../utils', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Component that throws during render
function ThrowOnRender({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test render error')
  }
  return <div>Content renders fine</div>
}

// Component that throws a network error
function ThrowNetworkError(): React.ReactElement {
  throw new Error('network failure')
}

// Component that throws a fetch error
function ThrowFetchError(): React.ReactElement {
  throw new Error('fetch failed')
}

// Component that can be toggled between throwing and not
function ToggleableThrower({ throwCount, children }: { throwCount: { value: number }; children: React.ReactNode }) {
  if (throwCount.value > 0) {
    throw new Error(`Error #${throwCount.value}`)
  }
  return <div>{children}</div>
}

describe('ErrorBoundary', () => {
  const originalError = console.error

  beforeEach(() => {
    console.error = vi.fn()
    vi.clearAllMocks()
  })

  afterEach(() => {
    console.error = originalError
  })

  describe('normal rendering', () => {
    it('renders children when no error', () => {
      render(
        <ErrorBoundary>
          <ThrowOnRender shouldThrow={false} />
        </ErrorBoundary>
      )
      expect(screen.getByText('Content renders fine')).toBeInTheDocument()
    })

    it('renders multiple children when no error', () => {
      render(
        <ErrorBoundary>
          <div>Child 1</div>
          <div>Child 2</div>
        </ErrorBoundary>
      )
      expect(screen.getByText('Child 1')).toBeInTheDocument()
      expect(screen.getByText('Child 2')).toBeInTheDocument()
    })

    it('does not show error UI when children render normally', () => {
      render(
        <ErrorBoundary>
          <ThrowOnRender shouldThrow={false} />
        </ErrorBoundary>
      )
      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Try Again' })).not.toBeInTheDocument()
    })
  })

  describe('error handling', () => {
    it('renders error UI when child throws', () => {
      render(
        <ErrorBoundary>
          <ThrowOnRender shouldThrow={true} />
        </ErrorBoundary>
      )
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
      expect(screen.getByText(/Test render error|An error occurred/)).toBeInTheDocument()
    })

    it('renders Try Again button in error state', () => {
      render(
        <ErrorBoundary>
          <ThrowOnRender shouldThrow={true} />
        </ErrorBoundary>
      )
      expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument()
    })

    it('has role="alert" on the error container', () => {
      render(
        <ErrorBoundary>
          <ThrowOnRender shouldThrow={true} />
        </ErrorBoundary>
      )
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    it('has aria-live="assertive" on the error container', () => {
      render(
        <ErrorBoundary>
          <ThrowOnRender shouldThrow={true} />
        </ErrorBoundary>
      )
      const alertEl = screen.getByRole('alert')
      expect(alertEl).toHaveAttribute('aria-live', 'assertive')
    })

    it('displays the error message heading', () => {
      render(
        <ErrorBoundary>
          <ThrowOnRender shouldThrow={true} />
        </ErrorBoundary>
      )
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    })

    it('displays unexpected error description text', () => {
      render(
        <ErrorBoundary>
          <ThrowOnRender shouldThrow={true} />
        </ErrorBoundary>
      )
      expect(screen.getByText('An unexpected error occurred in this section.')).toBeInTheDocument()
    })

    it('calls logger.error with error details in componentDidCatch', () => {
      render(
        <ErrorBoundary>
          <ThrowOnRender shouldThrow={true} />
        </ErrorBoundary>
      )
      expect(logger.error).toHaveBeenCalledWith(
        'ErrorBoundary',
        expect.stringContaining('Test render error'),
        expect.any(String)
      )
    })

    it('displays network error message for network errors', () => {
      render(
        <ErrorBoundary>
          <ThrowNetworkError />
        </ErrorBoundary>
      )
      // The error message will either be the full "network failure" (dev) or "A network error occurred" (prod)
      const errorText = screen.getByText(/network failure|A network error occurred/)
      expect(errorText).toBeInTheDocument()
    })

    it('displays network error message for fetch errors', () => {
      render(
        <ErrorBoundary>
          <ThrowFetchError />
        </ErrorBoundary>
      )
      const errorText = screen.getByText(/fetch failed|A network error occurred/)
      expect(errorText).toBeInTheDocument()
    })
  })

  describe('reset functionality', () => {
    it('resets error state when Try Again is clicked', () => {
      const throwCount = { value: 1 }
      render(
        <ErrorBoundary>
          <ToggleableThrower throwCount={throwCount}>
            <div>Recovered content</div>
          </ToggleableThrower>
        </ErrorBoundary>
      )

      // Initially throwing, so error UI shows
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()

      // Fix the error source
      throwCount.value = 0

      // Click Try Again
      fireEvent.click(screen.getByRole('button', { name: 'Try Again' }))

      // Now children should render
      expect(screen.getByText('Recovered content')).toBeInTheDocument()
    })

    it('shows error UI again if error recurs after reset', () => {
      const throwCount = { value: 1 }
      render(
        <ErrorBoundary>
          <ToggleableThrower throwCount={throwCount}>
            <div>Recovered content</div>
          </ToggleableThrower>
        </ErrorBoundary>
      )

      // Error state initially
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()

      // Click Try Again without fixing the error source
      fireEvent.click(screen.getByRole('button', { name: 'Try Again' }))

      // Should be back in error state since the component throws again
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    })
  })

  describe('safeErrorMessage function', () => {
    it('shows full error in DEV mode', () => {
      // In test/dev environment, import.meta.env.DEV is typically true
      render(
        <ErrorBoundary>
          <ThrowOnRender shouldThrow={true} />
        </ErrorBoundary>
      )
      // In DEV mode, the actual error message is shown
      expect(screen.getByText('Test render error')).toBeInTheDocument()
    })
  })
})

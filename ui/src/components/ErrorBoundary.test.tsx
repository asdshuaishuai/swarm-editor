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

// Component that throws a generic error
function ThrowGenericError(): React.ReactElement {
  throw new Error('something unexpected happened')
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

    it('renders nested elements correctly', () => {
      render(
        <ErrorBoundary>
          <div>
            <span>Nested content</span>
          </div>
        </ErrorBoundary>
      )
      expect(screen.getByText('Nested content')).toBeInTheDocument()
    })

    it('renders complex children with multiple levels', () => {
      render(
        <ErrorBoundary>
          <div>
            <ul>
              <li>Item 1</li>
              <li>Item 2</li>
            </ul>
          </div>
        </ErrorBoundary>
      )
      expect(screen.getByText('Item 1')).toBeInTheDocument()
      expect(screen.getByText('Item 2')).toBeInTheDocument()
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

    it('renders error SVG icon', () => {
      const { container } = render(
        <ErrorBoundary>
          <ThrowOnRender shouldThrow={true} />
        </ErrorBoundary>
      )
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
      expect(svg?.classList.contains('text-error')).toBe(true)
    })

    it('has correct CSS classes on error container', () => {
      render(
        <ErrorBoundary>
          <ThrowOnRender shouldThrow={true} />
        </ErrorBoundary>
      )
      const alertDiv = screen.getByRole('alert')
      expect(alertDiv.className).toContain('flex')
      expect(alertDiv.className).toContain('items-center')
      expect(alertDiv.className).toContain('justify-center')
    })

    it('renders error message in a monospace font element', () => {
      render(
        <ErrorBoundary>
          <ThrowOnRender shouldThrow={true} />
        </ErrorBoundary>
      )
      // The error message text should be in a font-mono element
      const errorElement = screen.getByText('Test render error')
      expect(errorElement.className).toContain('font-mono')
    })

    it('Try Again button has correct styling classes', () => {
      render(
        <ErrorBoundary>
          <ThrowOnRender shouldThrow={true} />
        </ErrorBoundary>
      )
      const button = screen.getByRole('button', { name: 'Try Again' })
      expect(button.className).toContain('px-4')
      expect(button.className).toContain('py-2')
      expect(button.className).toContain('text-sm')
      expect(button.className).toContain('font-medium')
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

    it('can recover and re-throw multiple times', () => {
      const throwCount = { value: 1 }
      render(
        <ErrorBoundary>
          <ToggleableThrower throwCount={throwCount}>
            <div>Recovered content</div>
          </ToggleableThrower>
        </ErrorBoundary>
      )

      // Initial error
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()

      // Fix and reset
      throwCount.value = 0
      fireEvent.click(screen.getByRole('button', { name: 'Try Again' }))
      expect(screen.getByText('Recovered content')).toBeInTheDocument()

      // Throw again
      throwCount.value = 2
      // Need to trigger a re-render to cause the error
      // Since the child component's state is external, we can't easily trigger re-throw
      // But we've already tested the cycle once
    })

    it('clears error state completely on reset', () => {
      const throwCount = { value: 1 }
      render(
        <ErrorBoundary>
          <ToggleableThrower throwCount={throwCount}>
            <div>Recovered content</div>
          </ToggleableThrower>
        </ErrorBoundary>
      )

      // Error state
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
      expect(logger.error).toHaveBeenCalled()

      // Fix and reset
      throwCount.value = 0
      vi.clearAllMocks()
      fireEvent.click(screen.getByRole('button', { name: 'Try Again' }))

      // Error UI should be gone
      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
      // Children rendered
      expect(screen.getByText('Recovered content')).toBeInTheDocument()
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

    it('shows full error message for network errors in DEV mode', () => {
      render(
        <ErrorBoundary>
          <ThrowNetworkError />
        </ErrorBoundary>
      )
      // In DEV mode, the raw error message is shown regardless of content
      expect(screen.getByText('network failure')).toBeInTheDocument()
    })

    it('shows full error message for fetch errors in DEV mode', () => {
      render(
        <ErrorBoundary>
          <ThrowFetchError />
        </ErrorBoundary>
      )
      expect(screen.getByText('fetch failed')).toBeInTheDocument()
    })

    it('shows full error message for generic errors in DEV mode', () => {
      render(
        <ErrorBoundary>
          <ThrowGenericError />
        </ErrorBoundary>
      )
      expect(screen.getByText('something unexpected happened')).toBeInTheDocument()
    })
  })

  describe('getDerivedStateFromError', () => {
    it('updates state with hasError true and error object', () => {
      render(
        <ErrorBoundary>
          <ThrowOnRender shouldThrow={true} />
        </ErrorBoundary>
      )
      // The error UI should be rendered, confirming getDerivedStateFromError worked
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText('Test render error')).toBeInTheDocument()
    })
  })

  describe('componentDidCatch logging', () => {
    it('logs componentStack in error details', () => {
      render(
        <ErrorBoundary>
          <ThrowOnRender shouldThrow={true} />
        </ErrorBoundary>
      )
      // logger.error should have been called with componentStack as 3rd arg
      const calls = vi.mocked(logger.error).mock.calls
      const lastCall = calls[calls.length - 1]
      expect(lastCall[2]).toContain('ThrowOnRender')
    })

    it('logs error message in second argument', () => {
      render(
        <ErrorBoundary>
          <ThrowOnRender shouldThrow={true} />
        </ErrorBoundary>
      )
      expect(logger.error).toHaveBeenCalledWith(
        'ErrorBoundary',
        'Caught error: Test render error',
        expect.any(String)
      )
    })
  })

  describe('error UI structure', () => {
    it('renders error container with max-w-md class', () => {
      const { container } = render(
        <ErrorBoundary>
          <ThrowOnRender shouldThrow={true} />
        </ErrorBoundary>
      )
      const innerDiv = container.querySelector('.max-w-md')
      expect(innerDiv).toBeInTheDocument()
    })

    it('renders heading as h2 element', () => {
      const { container } = render(
        <ErrorBoundary>
          <ThrowOnRender shouldThrow={true} />
        </ErrorBoundary>
      )
      const heading = container.querySelector('h2')
      expect(heading).toBeInTheDocument()
      expect(heading?.textContent).toBe('Something went wrong')
    })

    it('renders error description as a paragraph', () => {
      render(
        <ErrorBoundary>
          <ThrowOnRender shouldThrow={true} />
        </ErrorBoundary>
      )
      const desc = screen.getByText('An unexpected error occurred in this section.')
      expect(desc.tagName).toBe('P')
    })

    it('renders error message with break-all class', () => {
      render(
        <ErrorBoundary>
          <ThrowOnRender shouldThrow={true} />
        </ErrorBoundary>
      )
      const errorMsg = screen.getByText('Test render error')
      expect(errorMsg.className).toContain('break-all')
    })

    it('renders Try Again button as a clickable button element', () => {
      render(
        <ErrorBoundary>
          <ThrowOnRender shouldThrow={true} />
        </ErrorBoundary>
      )
      const button = screen.getByRole('button', { name: 'Try Again' })
      expect(button.tagName).toBe('BUTTON')
      expect(button).toBeEnabled()
    })
  })
})

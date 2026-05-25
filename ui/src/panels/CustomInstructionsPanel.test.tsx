import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CustomInstructionsPanel } from './CustomInstructionsPanel'

const mockAddToast = vi.fn()
const mockGet = vi.fn()
const mockSave = vi.fn()

vi.mock('../services', () => ({
  api: {
    instructions: {
      get: (...args: unknown[]) => mockGet(...args),
      save: (...args: unknown[]) => mockSave(...args),
    },
  },
}))

vi.mock('../store/appStore', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => {
    const state = { addToast: mockAddToast }
    return selector(state)
  },
}))

describe('CustomInstructionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockResolvedValue({ content: '# Test instructions\nDo things.', files: ['CLAUDE.md', 'AGENTS.md'] })
    mockSave.mockResolvedValue({ status: 'ok' })
  })

  it('renders loading state', () => {
    mockGet.mockReturnValue(new Promise(() => {})) // never resolves
    render(<CustomInstructionsPanel />)
    expect(screen.getByText('Loading instructions...')).toBeInTheDocument()
  })

  it('displays fetched instructions content', async () => {
    render(<CustomInstructionsPanel />)
    await waitFor(() => {
      const textarea = screen.getByRole('textbox')
      expect(textarea).toHaveValue('# Test instructions\nDo things.')
    })
  })

  it('shows source files', async () => {
    render(<CustomInstructionsPanel />)
    await waitFor(() => {
      expect(screen.getByText(/CLAUDE\.md, AGENTS\.md/)).toBeInTheDocument()
    })
  })

  it('calls save API on button click', async () => {
    const user = userEvent.setup()
    render(<CustomInstructionsPanel />)
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('# Test instructions\nDo things.')
    })
    await user.click(screen.getByText('Save'))
    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith('# Test instructions\nDo things.')
      expect(mockAddToast).toHaveBeenCalledWith('success', 'Instructions saved', expect.any(String))
    })
  })

  it('handles save error gracefully', async () => {
    mockSave.mockRejectedValue(new Error('Network error'))
    const user = userEvent.setup()
    render(<CustomInstructionsPanel />)
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('# Test instructions\nDo things.')
    })
    await user.click(screen.getByText('Save'))
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', 'Save failed', 'Network error')
    })
  })

  it('handles fetch error', async () => {
    mockGet.mockRejectedValue(new Error('Connection failed'))
    render(<CustomInstructionsPanel />)
    await waitFor(() => {
      expect(screen.getByText('Connection failed')).toBeInTheDocument()
    })
  })

  it('handles non-Error fetch rejection', async () => {
    mockGet.mockRejectedValue('string error')
    render(<CustomInstructionsPanel />)
    await waitFor(() => {
      expect(screen.getByText('Failed to load instructions')).toBeInTheDocument()
    })
  })

  it('handles non-Error save rejection', async () => {
    mockSave.mockRejectedValue('string error')
    const user = userEvent.setup()
    render(<CustomInstructionsPanel />)
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('# Test instructions\nDo things.')
    })
    await user.click(screen.getByText('Save'))
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', 'Save failed', 'Failed to save instructions')
    })
  })

  it('updates textarea content on typing', async () => {
    const user = userEvent.setup()
    render(<CustomInstructionsPanel />)
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('# Test instructions\nDo things.')
    })
    const textarea = screen.getByRole('textbox')
    await user.clear(textarea)
    await user.type(textarea, 'New instructions')
    expect(textarea).toHaveValue('New instructions')
  })

  it('shows Saving... text while saving', async () => {
    let resolveSave: (value: unknown) => void
    mockSave.mockReturnValue(new Promise((resolve) => { resolveSave = resolve }))
    const user = userEvent.setup()
    render(<CustomInstructionsPanel />)
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('# Test instructions\nDo things.')
    })
    await user.click(screen.getByText('Save'))
    await waitFor(() => {
      expect(screen.getByText('Saving...')).toBeInTheDocument()
    })
    resolveSave!({ status: 'ok' })
    await waitFor(() => {
      expect(screen.getByText('Save')).toBeInTheDocument()
    })
  })

  it('shows placeholder when content is empty', async () => {
    mockGet.mockResolvedValue({ content: '', files: [] })
    render(<CustomInstructionsPanel />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter custom instructions for agents...')).toBeInTheDocument()
    })
  })

  it('does not show source files section when files is empty', async () => {
    mockGet.mockResolvedValue({ content: 'test', files: [] })
    render(<CustomInstructionsPanel />)
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('test')
    })
    expect(screen.queryByText(/来源/)).not.toBeInTheDocument()
  })

  it('handles fetch returning null content and null files', async () => {
    mockGet.mockResolvedValue({ content: null, files: null })
    render(<CustomInstructionsPanel />)
    await waitFor(() => {
      const textarea = screen.getByRole('textbox')
      expect(textarea).toHaveValue('')
    })
  })

  it('does not update state if unmounted during fetch', async () => {
    let resolveFetch: (value: unknown) => void
    mockGet.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve }))
    const { unmount } = render(<CustomInstructionsPanel />)
    expect(screen.getByText('Loading instructions...')).toBeInTheDocument()

    // Unmount before fetch resolves
    unmount()

    // Now resolve the fetch — the mountedRef guard should prevent state updates
    resolveFetch!({ content: 'late data', files: [] })

    // Should not throw — the mountedRef.current is false
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalled()
    })
  })

  it('does not update state if unmounted during fetch error', async () => {
    let rejectFetch: (reason: unknown) => void
    mockGet.mockReturnValue(new Promise((_, reject) => { rejectFetch = reject }))
    const { unmount } = render(<CustomInstructionsPanel />)
    expect(screen.getByText('Loading instructions...')).toBeInTheDocument()

    // Unmount before fetch rejects
    unmount()

    // Now reject — the mountedRef guard should prevent state updates
    rejectFetch!(new Error('late error'))

    // Should not throw
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalled()
    })
  })

  it('does not update state if unmounted during save', async () => {
    let resolveSave: (value: unknown) => void
    mockSave.mockReturnValue(new Promise((resolve) => { resolveSave = resolve }))
    const user = userEvent.setup()
    const { unmount } = render(<CustomInstructionsPanel />)
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('# Test instructions\nDo things.')
    })
    await user.click(screen.getByText('Save'))
    await waitFor(() => {
      expect(screen.getByText('Saving...')).toBeInTheDocument()
    })

    // Unmount before save resolves
    unmount()

    // Now resolve — mountedRef guard should prevent toast
    resolveSave!({ status: 'ok' })

    // addToast should NOT have been called with success
    await waitFor(() => {
      expect(mockSave).toHaveBeenCalled()
    })
    expect(mockAddToast).not.toHaveBeenCalledWith('success', 'Instructions saved', expect.any(String))
  })

  it('does not update state if unmounted during save error', async () => {
    let rejectSave: (reason: unknown) => void
    mockSave.mockReturnValue(new Promise((_, reject) => { rejectSave = reject }))
    const user = userEvent.setup()
    const { unmount } = render(<CustomInstructionsPanel />)
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('# Test instructions\nDo things.')
    })
    await user.click(screen.getByText('Save'))
    await waitFor(() => {
      expect(screen.getByText('Saving...')).toBeInTheDocument()
    })

    // Unmount before save rejects
    unmount()

    // Now reject — mountedRef guard should prevent toast
    rejectSave!(new Error('late save error'))

    await waitFor(() => {
      expect(mockSave).toHaveBeenCalled()
    })
    expect(mockAddToast).not.toHaveBeenCalledWith('error', 'Save failed', expect.any(String))
  })
})

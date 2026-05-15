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
})

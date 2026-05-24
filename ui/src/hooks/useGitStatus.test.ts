import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useGitStatus } from './useGitStatus'

const mockGetStatus = vi.fn()

vi.mock('../services/api', () => ({
  gitApi: {
    getStatus: () => mockGetStatus(),
  },
}))

describe('useGitStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetStatus.mockReset()
  })

  it('does not fetch when workspace is null', () => {
    const setGitStatusMap = vi.fn()
    renderHook(() => useGitStatus({ workspace: null, setGitStatusMap }))

    expect(mockGetStatus).not.toHaveBeenCalled()
  })

  it('fetches git status on mount with workspace', async () => {
    mockGetStatus.mockResolvedValueOnce([
      { path: 'main.ts', status: 'M', staged: false },
      { path: 'new.ts', status: 'A', staged: true },
    ])
    const setGitStatusMap = vi.fn()

    renderHook(() => useGitStatus({ workspace: '/project', setGitStatusMap }))

    await waitFor(() => {
      expect(setGitStatusMap).toHaveBeenCalledWith({
        'main.ts': { path: 'main.ts', status: 'M', staged: false },
        'new.ts': { path: 'new.ts', status: 'A', staged: true },
      })
    })
  })

  it('handles fetch error gracefully', async () => {
    mockGetStatus.mockRejectedValueOnce(new Error('not a git repo'))
    const setGitStatusMap = vi.fn()

    renderHook(() => useGitStatus({ workspace: '/project', setGitStatusMap }))

    await waitFor(() => {
      expect(mockGetStatus).toHaveBeenCalled()
    })

    // Should not call setGitStatusMap on error
    expect(setGitStatusMap).not.toHaveBeenCalled()
  })

  it('returns ref to fetch function', async () => {
    mockGetStatus.mockResolvedValueOnce([])
    const setGitStatusMap = vi.fn()

    const { result } = renderHook(() => useGitStatus({ workspace: '/project', setGitStatusMap }))

    await waitFor(() => {
      expect(mockGetStatus).toHaveBeenCalled()
    })

    expect(result.current.current).toBeTypeOf('function')
  })

  it('handles empty status response', async () => {
    mockGetStatus.mockResolvedValueOnce([])
    const setGitStatusMap = vi.fn()

    renderHook(() => useGitStatus({ workspace: '/project', setGitStatusMap }))

    await waitFor(() => {
      expect(setGitStatusMap).toHaveBeenCalledWith({})
    })
  })
})

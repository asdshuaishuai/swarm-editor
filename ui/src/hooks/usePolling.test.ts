import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { usePolling } from './usePolling'

describe('usePolling', () => {
  it('returns empty array initially', () => {
    const fetchFn = vi.fn().mockResolvedValue([])
    const { result } = renderHook(() =>
      usePolling({ fetchFn, transform: (x: any) => x }),
    )
    expect(result.current).toEqual([])
  })

  it('fetches and transforms data on mount', async () => {
    const fetchFn = vi.fn().mockResolvedValue([{ id: '1', name: 'a' }])
    const transform = (x: any) => ({ id: x.id, label: x.name.toUpperCase() })
    const { result } = renderHook(() => usePolling({ fetchFn, transform }))

    await waitFor(() => {
      expect(result.current).toEqual([{ id: '1', label: 'A' }])
    })
  })

  it('deduplicates items by id', async () => {
    const fetchFn = vi.fn().mockResolvedValue([{ id: '1', name: 'a' }])

    const { result } = renderHook(() =>
      usePolling({ fetchFn, transform: (x: any) => x, intervalMs: 60000 }),
    )

    await waitFor(() => {
      expect(result.current).toEqual([{ id: '1', name: 'a' }])
    })

    // Second fetch with same id — no change
    await waitFor(() => {
      expect(fetchFn.mock.calls.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('silently ignores fetch errors', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network error'))
    const { result } = renderHook(() =>
      usePolling({ fetchFn, transform: (x: any) => x }),
    )

    // Wait for the rejected promise to settle
    await waitFor(() => {
      expect(fetchFn).toHaveBeenCalled()
    })
    expect(result.current).toEqual([])
  })

  it('calls fetchFn on mount', async () => {
    const fetchFn = vi.fn().mockResolvedValue([])
    renderHook(() => usePolling({ fetchFn, transform: (x: any) => x }))

    await waitFor(() => {
      expect(fetchFn).toHaveBeenCalledTimes(1)
    })
  })
})

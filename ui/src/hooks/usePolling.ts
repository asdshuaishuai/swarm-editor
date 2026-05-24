import { useState, useEffect, useCallback } from 'react'
import { logger } from '../utils'

interface UsePollingOptions<T, R> {
  fetchFn: () => Promise<T[]>
  transform: (item: T) => R
  intervalMs?: number
  maxSize?: number
}

export function usePolling<T, R>({ fetchFn, transform, intervalMs = 5000, maxSize = 100 }: UsePollingOptions<T, R>) {
  const [items, setItems] = useState<R[]>([])

  const fetchData = useCallback(async () => {
    try {
      const raw = await fetchFn()
      const transformed = raw.map(transform)
      setItems(prev => {
        const existingIds = new Set(prev.map(i => (i as Record<string, unknown>).id as string))
        const fresh = transformed.filter(i => !existingIds.has((i as Record<string, unknown>).id as string))
        if (fresh.length === 0) return prev
        return [...prev, ...fresh].slice(-maxSize)
      })
    } catch {
      logger.debug('usePolling', 'Fetch error')
    }
  }, [fetchFn, transform, maxSize])

  useEffect(() => {
    fetchData()
    const timer = setInterval(fetchData, intervalMs)
    return () => clearInterval(timer)
  }, [fetchData, intervalMs])

  return items
}

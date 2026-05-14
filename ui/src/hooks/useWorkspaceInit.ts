import { useEffect } from 'react'
import { api } from '../services'
import { logger } from '../utils'

interface UseWorkspaceInitOptions {
  mountedRef: React.MutableRefObject<boolean>
  setLoading: (loading: boolean) => void
  setWorkspace: (workspace: string) => void
  addToast: (type: 'error', title: string, message?: string) => void
}

export function useWorkspaceInit(options: UseWorkspaceInitOptions) {
  const { mountedRef, setLoading, setWorkspace, addToast } = options

  useEffect(() => {
    const loadWorkspace = async () => {
      try {
        setLoading(true)
        const ws = await api.fs.getWorkspace()
        if (!mountedRef.current) return
        setWorkspace(ws)
      } catch (err) {
        logger.error('Editor', 'Failed to load workspace:', err)
        if (!mountedRef.current) return
        addToast('error', 'Failed to load workspace', err instanceof Error ? err.message : String(err))
      } finally {
        if (mountedRef.current) {
          setLoading(false)
        }
      }
    }
    loadWorkspace()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

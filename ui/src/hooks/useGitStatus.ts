import { useEffect, useRef } from 'react'
import { gitApi } from '../services/api'
import type { GitFileStatus } from '../services'

interface UseGitStatusOptions {
  workspace: string | null
  setGitStatusMap: (map: Record<string, GitFileStatus>) => void
}

export function useGitStatus(options: UseGitStatusOptions) {
  const { workspace, setGitStatusMap } = options
  const fetchGitStatusRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    if (!workspace) return

    const fetchGitStatus = async () => {
      try {
        const files = await gitApi.getStatus()
        const map: Record<string, GitFileStatus> = {}
        for (const f of files) {
          map[f.path] = f
        }
        setGitStatusMap(map)
      } catch {
        // Not a git repo or git unavailable
      }
    }

    fetchGitStatusRef.current = fetchGitStatus
    fetchGitStatus()
    const interval = setInterval(fetchGitStatus, 10000)
    return () => clearInterval(interval)
  }, [workspace, setGitStatusMap])

  return fetchGitStatusRef
}

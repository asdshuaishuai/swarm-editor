import { api } from '../services'
import { logger } from '.'
import type { Toast } from '../components/Toast'

interface ExecuteWithAgentOptions {
  currentFile: string
  code: string
  language: string
  swarmId?: string
  swarms: Array<{ id: string; name: string }>
  mountedRef: React.MutableRefObject<boolean>
  setLoading: (loading: boolean) => void
  addToast: (type: 'info' | 'success' | 'error', title: string, message?: string, options?: Partial<Toast>) => string
  onDone: () => void
}

export async function executeWithAgent(options: ExecuteWithAgentOptions) {
  const { currentFile, code, language, swarmId, swarms, mountedRef, setLoading, addToast, onDone } = options

  const swarm = swarmId ? swarms.find(s => s.id === swarmId) : null
  const execMode = swarm ? `via ${swarm.name}` : 'directly'
  addToast('info', 'Executing', `${currentFile.split('/').pop()} (${execMode})`)

  try {
    setLoading(true)
    const result = await api.execute.executeCode(currentFile, code, language, swarmId)

    if (!mountedRef.current) return

    if (result.success) {
      addToast('success', 'Execution completed', result.output)
    } else {
      addToast('error', 'Execution failed', result.error || result.output)
    }
  } catch (err) {
    logger.error('Editor', 'Failed to execute code:', err)
    if (!mountedRef.current) return
    addToast('error', 'Execution error', err instanceof Error ? err.message : String(err))
  } finally {
    if (mountedRef.current) {
      setLoading(false)
      onDone()
    }
  }
}

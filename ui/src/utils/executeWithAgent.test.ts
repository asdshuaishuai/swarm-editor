import { describe, it, expect, vi, beforeEach } from 'vitest'
import { executeWithAgent } from './executeWithAgent'

vi.mock('.', () => ({
  logger: { error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}))

vi.mock('../services', () => ({
  api: {
    execute: {
      executeCode: vi.fn(),
    },
  },
}))

describe('executeWithAgent', () => {
  const setup = () => {
    return {
      currentFile: '/project/main.go',
      code: 'package main',
      language: 'go',
      swarms: [
        { id: 'sw1', name: 'TestSwarm' },
        { id: 'sw2', name: 'OtherSwarm' },
      ],
      mountedRef: { current: true },
      setLoading: vi.fn(),
      addToast: vi.fn(() => 'toast-id'),
      onDone: vi.fn(),
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows executing toast with direct mode when no swarmId', async () => {
    const opts = setup()
    const { api } = await import('../services')
    vi.mocked(api.execute.executeCode).mockResolvedValueOnce({ success: true, output: 'ok' })

    await executeWithAgent(opts)
    expect(opts.addToast).toHaveBeenCalledWith('info', 'Executing', 'main.go (directly)')
  })

  it('shows executing toast with swarm name when swarmId provided', async () => {
    const opts = setup()
    const { api } = await import('../services')
    vi.mocked(api.execute.executeCode).mockResolvedValueOnce({ success: true, output: 'ok' })

    await executeWithAgent({ ...opts, swarmId: 'sw1' })
    expect(opts.addToast).toHaveBeenCalledWith('info', 'Executing', 'main.go (via TestSwarm)')
  })

  it('calls executeCode with correct params', async () => {
    const opts = setup()
    const { api } = await import('../services')
    vi.mocked(api.execute.executeCode).mockResolvedValueOnce({ success: true, output: 'result' })

    await executeWithAgent({ ...opts, swarmId: 'sw1' })
    expect(api.execute.executeCode).toHaveBeenCalledWith('/project/main.go', 'package main', 'go', 'sw1')
  })

  it('shows success toast on successful execution', async () => {
    const opts = setup()
    const { api } = await import('../services')
    vi.mocked(api.execute.executeCode).mockResolvedValueOnce({ success: true, output: '42' })

    await executeWithAgent(opts)
    expect(opts.addToast).toHaveBeenCalledWith('success', 'Execution completed', '42')
  })

  it('shows error toast on failed execution', async () => {
    const opts = setup()
    const { api } = await import('../services')
    vi.mocked(api.execute.executeCode).mockResolvedValueOnce({ success: false, output: '', error: 'compile error' })

    await executeWithAgent(opts)
    expect(opts.addToast).toHaveBeenCalledWith('error', 'Execution failed', 'compile error')
  })

  it('shows error toast with output when no error field', async () => {
    const opts = setup()
    const { api } = await import('../services')
    vi.mocked(api.execute.executeCode).mockResolvedValueOnce({ success: false, output: 'panic' })

    await executeWithAgent(opts)
    expect(opts.addToast).toHaveBeenCalledWith('error', 'Execution failed', 'panic')
  })

  it('handles API exception', async () => {
    const opts = setup()
    const { api } = await import('../services')
    vi.mocked(api.execute.executeCode).mockRejectedValueOnce(new Error('network'))

    await executeWithAgent(opts)
    expect(opts.addToast).toHaveBeenCalledWith('error', 'Execution error', 'network')
  })

  it('does not show error toast if unmounted after exception', async () => {
    const opts = setup()
    const { api } = await import('../services')
    vi.mocked(api.execute.executeCode).mockRejectedValueOnce(new Error('fail'))

    opts.mountedRef.current = false
    await executeWithAgent(opts)
    // Only the initial info toast, no error toast
    expect(opts.addToast).toHaveBeenCalledTimes(1)
  })

  it('calls onDone and setLoading(false) in finally when mounted', async () => {
    const opts = setup()
    const { api } = await import('../services')
    vi.mocked(api.execute.executeCode).mockResolvedValueOnce({ success: true, output: 'ok' })

    await executeWithAgent(opts)
    expect(opts.setLoading).toHaveBeenCalledWith(true)
    expect(opts.setLoading).toHaveBeenCalledWith(false)
    expect(opts.onDone).toHaveBeenCalledTimes(1)
  })

  it('skips finally actions if unmounted', async () => {
    const opts = setup()
    const { api } = await import('../services')
    vi.mocked(api.execute.executeCode).mockResolvedValueOnce({ success: true, output: 'ok' })

    opts.mountedRef.current = false
    await executeWithAgent(opts)
    expect(opts.onDone).not.toHaveBeenCalled()
    const falseCalls = opts.setLoading.mock.calls.filter(c => c[0] === false)
    expect(falseCalls).toHaveLength(0)
  })
})

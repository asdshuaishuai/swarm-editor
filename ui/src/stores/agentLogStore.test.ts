import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAgentLogStore } from './agentLogStore'

const subscribers: Record<string, (payload: unknown) => void> = {}
vi.mock('../services', () => ({
  events: {
    subscribe: (event: string, handler: (payload: unknown) => void) => {
      subscribers[event] = handler
      return () => { delete subscribers[event] }
    },
  },
}))

describe('agentLogStore', () => {
  beforeEach(() => {
    useAgentLogStore.setState({ logsByAgent: {} })
    Object.keys(subscribers).forEach(k => delete subscribers[k])
  })

  it('appends entries for an agent', () => {
    useAgentLogStore.getState().appendLogs('a1', [
      { line: 'hello', stream: 'stderr', timestamp: '2026-05-26T00:00:00Z' },
    ])
    expect(useAgentLogStore.getState().logsByAgent['a1']).toHaveLength(1)
  })

  it('appends across multiple chunks', () => {
    const s = useAgentLogStore.getState()
    s.appendLogs('a1', [{ line: 'a', stream: 'stderr', timestamp: '' }])
    s.appendLogs('a1', [{ line: 'b', stream: 'stderr', timestamp: '' }])
    expect(useAgentLogStore.getState().logsByAgent['a1']).toHaveLength(2)
  })

  it('keeps logs per-agent isolated', () => {
    const s = useAgentLogStore.getState()
    s.appendLogs('a1', [{ line: 'a', stream: 'stderr', timestamp: '' }])
    s.appendLogs('a2', [{ line: 'b', stream: 'stderr', timestamp: '' }])
    expect(useAgentLogStore.getState().logsByAgent['a1']).toHaveLength(1)
    expect(useAgentLogStore.getState().logsByAgent['a2']).toHaveLength(1)
  })

  it('caps at MAX_LOGS_PER_AGENT (5000)', () => {
    const big = Array.from({ length: 5100 }, (_, i) => ({
      line: `line-${i}`, stream: 'stderr' as const, timestamp: '',
    }))
    useAgentLogStore.getState().appendLogs('a1', big)
    expect(useAgentLogStore.getState().logsByAgent['a1']).toHaveLength(5000)
    // Newest preserved
    expect(useAgentLogStore.getState().logsByAgent['a1'][4999].line).toBe('line-5099')
  })

  it('clearLogs removes a specific agent', () => {
    const s = useAgentLogStore.getState()
    s.appendLogs('a1', [{ line: 'a', stream: 'stderr', timestamp: '' }])
    s.appendLogs('a2', [{ line: 'b', stream: 'stderr', timestamp: '' }])
    s.clearLogs('a1')
    expect(useAgentLogStore.getState().logsByAgent['a1']).toBeUndefined()
    expect(useAgentLogStore.getState().logsByAgent['a2']).toHaveLength(1)
  })

  it('subscribe wires agent_log_chunk events', () => {
    const unsub = useAgentLogStore.getState().subscribe()
    expect(subscribers['agent_log_chunk']).toBeDefined()
    subscribers['agent_log_chunk']({
      agentId: 'a1',
      entries: [{ line: 'streamed', stream: 'stderr', timestamp: '' }],
    })
    expect(useAgentLogStore.getState().logsByAgent['a1']).toHaveLength(1)
    expect(useAgentLogStore.getState().logsByAgent['a1'][0].line).toBe('streamed')
    unsub()
  })

  it('ignores malformed payloads', () => {
    useAgentLogStore.getState().subscribe()
    subscribers['agent_log_chunk'](null)
    subscribers['agent_log_chunk']({})
    subscribers['agent_log_chunk']({ agentId: 'a1' })
    subscribers['agent_log_chunk']({ entries: [] })
    expect(Object.keys(useAgentLogStore.getState().logsByAgent)).toHaveLength(0)
  })

  it('subscribe returns cleanup that unsubscribes', () => {
    const unsub = useAgentLogStore.getState().subscribe()
    expect(subscribers['agent_log_chunk']).toBeDefined()
    unsub()
    expect(subscribers['agent_log_chunk']).toBeUndefined()
  })
})

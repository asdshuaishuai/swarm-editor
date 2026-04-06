import { renderHook, act } from '@testing-library/react'
import { useTerminal } from './useTerminal'

class MockWebSocket {
  static instances: MockWebSocket[] = []
  url: string
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  readyState = 0
  CLOSED = 3

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  send(_data: string) {}
  close() { this.readyState = this.CLOSED; this.onclose?.() }

  static clear() { MockWebSocket.instances = [] }
  // Simulate server sending session ID
  simulateOpen() { this.readyState = 1; this.onopen?.() }
  simulateSessionMessage(id: string) { this.onmessage?.({ data: JSON.stringify({ type: 'session', id }) }) }
}

vi.stubGlobal('WebSocket', MockWebSocket)

describe('useTerminal', () => {
  beforeEach(() => { MockWebSocket.clear() })

  it('should initialize with disconnected state', () => {
    const { result } = renderHook(() => useTerminal())
    expect(result.current.connected).toBe(false)
    expect(result.current.sessionId).toBeNull()
  })

  it('should connect and set sessionId', async () => {
    const { result } = renderHook(() => useTerminal())
    act(() => { result.current.connect() })
    // Simulate open + session message
    const ws = MockWebSocket.instances[0]
    await act(async () => {
      ws.simulateOpen()
      ws.simulateSessionMessage('term_abc123')
    })
    expect(result.current.connected).toBe(true)
    expect(result.current.sessionId).toBe('term_abc123')
  })

  it('should disconnect and reset state', async () => {
    const { result } = renderHook(() => useTerminal())
    act(() => { result.current.connect() })
    const ws = MockWebSocket.instances[0]
    await act(async () => {
      ws.simulateOpen()
      ws.simulateSessionMessage('term_abc')
    })
    act(() => { result.current.disconnect() })
    expect(result.current.connected).toBe(false)
    expect(result.current.sessionId).toBeNull()
  })

  it('should not connect if already connected', async () => {
    const { result } = renderHook(() => useTerminal())
    act(() => { result.current.connect() })
    act(() => { result.current.connect() }) // duplicate
    expect(MockWebSocket.instances.length).toBe(1)
  })
})

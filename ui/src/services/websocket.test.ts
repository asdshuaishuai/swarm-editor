import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WebSocketClient, getWebSocketClient, initializeWebSocket, WSError, WSErrorCode } from './websocket'

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = []

  url: string
  onopen: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  readyState: number = WebSocket.CONNECTING

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  send(_data: string): void {
    // Mock send
  }

  close(): void {
    this.readyState = WebSocket.CLOSED
    this.onclose?.({ code: 1000, reason: 'Normal closure' } as CloseEvent)
  }

  simulateOpen(): void {
    this.readyState = WebSocket.OPEN
    this.onopen?.({ type: 'open' } as Event)
  }

  simulateError(): void {
    this.onerror?.({ type: 'error' } as Event)
  }

  simulateMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent)
  }

  static getLatest(): MockWebSocket | undefined {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1]
  }

  static clear(): void {
    MockWebSocket.instances = []
  }
}

// Setup global WebSocket mock
vi.stubGlobal('WebSocket', MockWebSocket)

describe('WebSocketClient', () => {
  let client: WebSocketClient

  beforeEach(() => {
    MockWebSocket.clear()
    client = new WebSocketClient('ws://test:8080/ws')
    vi.useFakeTimers()
  })

  afterEach(() => {
    client.disconnect()
    vi.useRealTimers()
  })

  describe('constructor', () => {
    it('uses provided URL', () => {
      const c = new WebSocketClient('ws://custom:9000/ws')
      expect(c.getUrl()).toBe('ws://custom:9000/ws')
    })

    it('generates default URL when not provided', () => {
      const c = new WebSocketClient()
      expect(c.getUrl()).toContain('ws://')
    })
  })

  describe('connect', () => {
    it('creates WebSocket connection', async () => {
      const connectPromise = client.connect()
      const mockWs = MockWebSocket.getLatest()

      expect(mockWs).toBeDefined()
      expect(mockWs!.url).toBe('ws://test:8080/ws')

      mockWs!.simulateOpen()
      await connectPromise

      expect(client.isConnected()).toBe(true)
    })

    it('resolves immediately if already connected', async () => {
      const connectPromise = client.connect()
      const mockWs = MockWebSocket.getLatest()
      mockWs!.simulateOpen()
      await connectPromise

      // Second connect should resolve immediately
      await client.connect()
      expect(MockWebSocket.instances.length).toBe(1)
    })

    it('rejects on connection error', async () => {
      const connectPromise = client.connect()
      const mockWs = MockWebSocket.getLatest()

      mockWs!.simulateError()

      await expect(connectPromise).rejects.toThrow('WebSocket connection error')
    })
  })

  describe('disconnect', () => {
    it('closes WebSocket connection', async () => {
      const connectPromise = client.connect()
      const mockWs = MockWebSocket.getLatest()
      mockWs!.simulateOpen()
      await connectPromise

      expect(client.isConnected()).toBe(true)

      client.disconnect()

      expect(client.isConnected()).toBe(false)
    })

    it('rejects pending requests on disconnect', async () => {
      const connectPromise = client.connect()
      const mockWs = MockWebSocket.getLatest()
      mockWs!.simulateOpen()
      await connectPromise

      const reqPromise = client.invoke('test_method')
      client.disconnect()

      await expect(reqPromise).rejects.toThrow('WebSocket disconnected')
    })

    it('does not reconnect after intentional disconnect', async () => {
      const connectPromise = client.connect()
      const mockWs = MockWebSocket.getLatest()
      mockWs!.simulateOpen()
      await connectPromise

      client.disconnect()

      // Advance time — no reconnect should be attempted
      await vi.advanceTimersByTimeAsync(5000)
      expect(MockWebSocket.instances.length).toBe(1)
    })
  })

  describe('invoke', () => {
    it('throws when not connected after intentional disconnect', async () => {
      client.disconnect()
      await expect(client.invoke('test_method')).rejects.toThrow('WebSocket not connected')
    })

    it('queues message when temporarily disconnected', async () => {
      // Never connected, but not intentionally disconnected
      const resultPromise = client.invoke('test_method', { key: 'value' }).catch(e => e)
      // Should not throw — message is queued

      // Connect and flush — the queued message will be sent on open
      const connectPromise = client.connect()
      const mockWs = MockWebSocket.getLatest()!

      mockWs.simulateOpen()
      await connectPromise

      // Respond to the queued message to resolve the pending promise
      mockWs.simulateMessage({ id: 'req_1', result: { ok: true } })

      const result = await resultPromise
      expect(result).toEqual({ ok: true })
    })

    it('sends request and waits for response', async () => {
      const connectPromise = client.connect()
      const mockWs = MockWebSocket.getLatest()
      mockWs!.simulateOpen()
      await connectPromise

      const sendSpy = vi.spyOn(mockWs!, 'send')

      const resultPromise = client.invoke('test_method', { param: 'value' })

      // Verify request was sent
      expect(sendSpy).toHaveBeenCalledWith(
        JSON.stringify({ id: 'req_1', method: 'test_method', params: { param: 'value' } })
      )

      // Simulate response
      mockWs!.simulateMessage({ id: 'req_1', result: { data: 'response' } })

      const result = await resultPromise
      expect(result).toEqual({ data: 'response' })
    })

    it('rejects on error response', async () => {
      const connectPromise = client.connect()
      const mockWs = MockWebSocket.getLatest()
      mockWs!.simulateOpen()
      await connectPromise

      const resultPromise = client.invoke('test_method')

      // Simulate error response
      mockWs!.simulateMessage({
        id: 'req_1',
        error: { code: 400, message: 'Bad request' }
      })

      await expect(resultPromise).rejects.toThrow('Bad request')
    })

    it('times out if no response', async () => {
      const connectPromise = client.connect()
      const mockWs = MockWebSocket.getLatest()
      mockWs!.simulateOpen()
      await connectPromise

      const resultPromise = client.invoke('test_method')

      // Set up catch handler BEFORE advancing timers to avoid unhandled rejection
      const errorPromise = resultPromise.catch(e => e)

      // Advance time past timeout (default 30s)
      await vi.advanceTimersByTimeAsync(35000)

      const error = await errorPromise as Error
      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe('Request timeout: test_method')
    })
  })

  describe('subscribe', () => {
    it('registers event handler', async () => {
      const connectPromise = client.connect()
      const mockWs = MockWebSocket.getLatest()
      mockWs!.simulateOpen()
      await connectPromise

      const handler = vi.fn()
      const unsubscribe = client.subscribe('test_event', handler)

      // Simulate event
      mockWs!.simulateMessage({
        type: 'test_event',
        payload: { data: 'test' }
      })

      expect(handler).toHaveBeenCalledWith({ data: 'test' })

      unsubscribe()
    })

    it('supports multiple handlers for same event', async () => {
      const connectPromise = client.connect()
      const mockWs = MockWebSocket.getLatest()
      mockWs!.simulateOpen()
      await connectPromise

      const handler1 = vi.fn()
      const handler2 = vi.fn()

      client.subscribe('test_event', handler1)
      client.subscribe('test_event', handler2)

      mockWs!.simulateMessage({
        type: 'test_event',
        payload: { data: 'test' }
      })

      expect(handler1).toHaveBeenCalled()
      expect(handler2).toHaveBeenCalled()
    })

    it('unsubscribes correctly', async () => {
      const connectPromise = client.connect()
      const mockWs = MockWebSocket.getLatest()
      mockWs!.simulateOpen()
      await connectPromise

      const handler = vi.fn()
      const unsubscribe = client.subscribe('test_event', handler)

      unsubscribe()

      mockWs!.simulateMessage({
        type: 'test_event',
        payload: { data: 'test' }
      })

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('on', () => {
    it('registers connect handler', async () => {
      const handler = vi.fn()
      client.on('connect', handler)

      const connectPromise = client.connect()
      const mockWs = MockWebSocket.getLatest()
      mockWs!.simulateOpen()
      await connectPromise

      expect(handler).toHaveBeenCalled()
    })

    it('registers disconnect handler', async () => {
      const handler = vi.fn()
      client.on('disconnect', handler)

      const connectPromise = client.connect()
      const mockWs = MockWebSocket.getLatest()
      mockWs!.simulateOpen()
      await connectPromise

      client.disconnect()

      expect(handler).toHaveBeenCalled()
    })

    it('registers error handler', async () => {
      const handler = vi.fn()
      client.on('error', handler)

      const connectPromise = client.connect()
      const mockWs = MockWebSocket.getLatest()
      mockWs!.simulateError()

      await expect(connectPromise).rejects.toThrow()
      expect(handler).toHaveBeenCalled()
    })
  })

  describe('isConnected', () => {
    it('returns false initially', () => {
      expect(client.isConnected()).toBe(false)
    })

    it('returns true after connection', async () => {
      const connectPromise = client.connect()
      const mockWs = MockWebSocket.getLatest()
      mockWs!.simulateOpen()
      await connectPromise

      expect(client.isConnected()).toBe(true)
    })
  })
})

describe('getWebSocketClient', () => {
  it('returns singleton instance', () => {
    initializeWebSocket('ws://test:8080/ws')
    const client1 = getWebSocketClient()
    const client2 = getWebSocketClient()

    expect(client1).toBe(client2)
  })
})

describe('initializeWebSocket', () => {
  it('creates new client with URL', () => {
    const client = initializeWebSocket('ws://custom:9000/ws')
    expect(client.getUrl()).toBe('ws://custom:9000/ws')
  })

  it('disconnects existing client', () => {
    const client1 = initializeWebSocket('ws://test1:8080/ws')
    // Second initialization should disconnect the first
    initializeWebSocket('ws://test2:8080/ws')

    expect(client1.isConnected()).toBe(false)
  })
})

describe('WSError', () => {
  it('has correct name and message', () => {
    const err = new WSError(-32601, 'method not found')
    expect(err.name).toBe('WSError')
    expect(err.message).toBe('method not found')
    expect(err.code).toBe(-32601)
  })

  it('isNotFound returns true for NotFound code', () => {
    expect(new WSError(WSErrorCode.NotFound, '').isNotFound).toBe(true)
    expect(new WSError(WSErrorCode.InternalError, '').isNotFound).toBe(false)
  })

  it('isValidation returns true for Validation code', () => {
    expect(new WSError(WSErrorCode.Validation, '').isValidation).toBe(true)
    expect(new WSError(WSErrorCode.NotFound, '').isValidation).toBe(false)
  })

  it('isNotConnected returns true for NotConnected code', () => {
    expect(new WSError(WSErrorCode.NotConnected, '').isNotConnected).toBe(true)
    expect(new WSError(WSErrorCode.NotFound, '').isNotConnected).toBe(false)
  })

  it('isInternalError returns true for InternalError code', () => {
    expect(new WSError(WSErrorCode.InternalError, '').isInternalError).toBe(true)
    expect(new WSError(WSErrorCode.NotFound, '').isInternalError).toBe(false)
  })

  it('is instance of Error', () => {
    expect(new WSError(-32601, 'test')).toBeInstanceOf(Error)
  })
})

describe('WSErrorCode', () => {
  it('has all standard JSON-RPC error codes', () => {
    expect(WSErrorCode.ParseError).toBe(-32700)
    expect(WSErrorCode.InvalidRequest).toBe(-32600)
    expect(WSErrorCode.MethodNotFound).toBe(-32601)
    expect(WSErrorCode.InvalidParams).toBe(-32602)
    expect(WSErrorCode.InternalError).toBe(-32603)
  })

  it('has custom application error codes', () => {
    expect(WSErrorCode.NotFound).toBe(-32001)
    expect(WSErrorCode.Validation).toBe(-32002)
    expect(WSErrorCode.Unauthorized).toBe(-32003)
    expect(WSErrorCode.RateLimited).toBe(-32004)
    expect(WSErrorCode.Conflict).toBe(-32005)
    expect(WSErrorCode.NotConnected).toBe(-32006)
    expect(WSErrorCode.LimitExceeded).toBe(-32007)
  })
})

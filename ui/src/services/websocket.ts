// WebSocket Client for ACP communication

import { logger } from '../utils'
import { loadSettings } from '../hooks/useSettings'

class Deferred<T> {
  promise: Promise<T>
  private _resolved = false
  private _rejected = false
  private _resolve!: (value: T | PromiseLike<T>) => void
  private _reject!: (error: Error) => void

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this._resolve = resolve
      this._reject = reject
    })
  }

  resolve(value: T | PromiseLike<T>): void {
    if (!this._resolved && !this._rejected) {
      this._resolved = true
      this._resolve(value)
    }
  }

  reject(error: Error): void {
    if (!this._resolved && !this._rejected) {
      this._rejected = true
      this._reject(error)
    }
  }

  get settled(): boolean {
    return this._resolved || this._rejected
  }
}

export interface WSRequest {
  id: string
  method: string
  params?: unknown
}

export interface WSResponse {
  id: string
  result?: unknown
  error?: { code: number; message: string }
}

export interface WSEvent {
  type: string
  payload: unknown
}

export type EventHandler = (payload: unknown) => void
export type ConnectionHandler = () => void
export type ErrorHandler = (error: Error) => void

// Typed WebSocket error codes (matching backend api package)
export const WSErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  NotFound: -32001,
  Validation: -32002,
  Unauthorized: -32003,
  RateLimited: -32004,
  Conflict: -32005,
  NotConnected: -32006,
  LimitExceeded: -32007,
} as const

export type WSErrorCodeType = (typeof WSErrorCode)[keyof typeof WSErrorCode]

/** Typed error from WebSocket API with error code */
export class WSError extends Error {
  code: number

  constructor(code: number, message: string) {
    super(message)
    this.name = 'WSError'
    this.code = code
  }

  get isNotFound(): boolean {
    return this.code === WSErrorCode.NotFound
  }

  get isValidation(): boolean {
    return this.code === WSErrorCode.Validation
  }

  get isNotConnected(): boolean {
    return this.code === WSErrorCode.NotConnected
  }

  get isInternalError(): boolean {
    return this.code === WSErrorCode.InternalError
  }
}

class WebSocketClient {
  private ws: WebSocket | null = null
  private url: string
  private pendingRequests: Map<string, Deferred<unknown>> = new Map()
  private pendingTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private eventHandlers: Map<string, Set<EventHandler>> = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private requestTimeout = 30000
  private nextRequestId = 0
  private maxQueueSize = 100 // Prevent unbounded queue growth

  private onConnect: ConnectionHandler | null = null
  private onDisconnect: ConnectionHandler | null = null
  private onError: ErrorHandler | null = null

  private connected = false
  private connecting = false
  private intentionalDisconnect = false
  private messageQueue: WSRequest[] = []

  constructor(url?: string) {
    this.url = url || this.getDefaultUrl()
  }

  private getDefaultUrl(): string {
    const settings = loadSettings()
    const port = settings.websocketPort || 8080
    // Default to localhost WebSocket server
    if (typeof window !== 'undefined') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const host = window.location.hostname || 'localhost'
      return `${protocol}//${host}:${port}/ws`
    }
    return `ws://localhost:${port}/ws`
  }

  async connect(): Promise<void> {
    if (this.connected || this.connecting) {
      return
    }

    this.connecting = true
    this.reconnectAttempts = 0
    this.intentionalDisconnect = false

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url)

        this.ws.onopen = () => {
          logger.info('WS', 'Connected to', this.url)
          this.connected = true
          this.connecting = false
          this.reconnectAttempts = 0
          this.flushMessageQueue()
          this.onConnect?.()
          resolve()
        }

        this.ws.onclose = (event) => {
          logger.info('WS', 'Disconnected:', event.code, event.reason)
          this.connected = false
          this.connecting = false
          // Reject all pending requests immediately on disconnect
          this.rejectAllPending('WebSocket disconnected')
          this.onDisconnect?.()
          this.handleReconnect()
        }

        this.ws.onerror = (error) => {
          logger.error('WS', 'Error:', error)
          this.connecting = false
          const err = new Error('WebSocket connection error')
          // Call onError first; if it throws, don't double-reject the Promise
          try { this.onError?.(err) } catch { /* ignore handler errors */ }
          reject(err)
        }

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data)
        }
      } catch (error) {
        this.connecting = false
        reject(error)
      }
    })
  }

  private flushMessageQueue(): void {
    if (this.messageQueue.length === 0 || !this.ws) return
    const queued = [...this.messageQueue]
    this.messageQueue = []
    for (const msg of queued) {
      try {
        this.ws.send(JSON.stringify(msg))
      } catch (error) {
        logger.error('WS', 'Failed to send queued message:', error)
        // Re-queue failed message if connection still valid
        if (this.connected && !this.intentionalDisconnect) {
          this.messageQueue.push(msg)
        }
      }
    }
    logger.info('WS', `Flushed ${queued.length} queued messages`)
  }

  // rejectAllPending rejects all pending requests with the given error message
  private rejectAllPending(errorMessage: string): void {
    this.pendingTimers.forEach((timer) => clearTimeout(timer))
    this.pendingTimers.clear()
    this.pendingRequests.forEach((deferred) => {
      if (!deferred.settled) {
        deferred.reject(new Error(errorMessage))
      }
    })
    this.pendingRequests.clear()
  }

  private handleReconnect(): void {
    if (this.intentionalDisconnect) {
      return
    }
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      const baseDelay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
      const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1)
      const delay = Math.max(100, baseDelay + jitter)
      logger.info('WS', `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null
        this.connect().catch((e) => logger.error('WS', 'Reconnect failed:', e))
      }, delay)
    } else {
      logger.error('WS', 'Max reconnect attempts reached')
      this.handleEvent('error', { code: 'RECONNECT_EXHAUSTED', message: `Failed to reconnect after ${this.maxReconnectAttempts} attempts` })
    }
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data)

      // Check if it's a response to a request
      if (message.id !== undefined) {
        const deferred = this.pendingRequests.get(message.id)
        if (deferred) {
          this.pendingRequests.delete(message.id)
          const timer = this.pendingTimers.get(message.id)
          if (timer) {
            clearTimeout(timer)
            this.pendingTimers.delete(message.id)
          }
          if (message.error) {
            deferred.reject(new WSError(message.error.code, message.error.message))
          } else {
            deferred.resolve(message.result)
          }
        }
      }
      // Check if it's an event
      else if (message.type !== undefined) {
        this.handleEvent(message.type, message.payload)
      }
    } catch (error) {
      logger.error('WS', 'Failed to parse message:', error)
    }
  }

  private handleEvent(type: string, payload: unknown): void {
    const handlers = this.eventHandlers.get(type)
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(payload)
        } catch (error) {
          logger.error('WS', `Event handler error for ${type}:`, error)
        }
      })
    }

    // Also call wildcard handlers
    const wildcardHandlers = this.eventHandlers.get('*')
    if (wildcardHandlers) {
      wildcardHandlers.forEach(handler => {
        try {
          handler({ type, payload })
        } catch (error) {
          logger.error('WS', 'Wildcard handler error:', error)
        }
      })
    }
  }

  async invoke<T = unknown>(method: string, params?: unknown): Promise<T> {
    const id = `req_${++this.nextRequestId}`

    if (!this.connected || !this.ws) {
      if (this.intentionalDisconnect) {
        throw new Error('WebSocket not connected')
      }
      // Check queue size limit to prevent unbounded growth
      if (this.messageQueue.length >= this.maxQueueSize) {
        throw new Error('Message queue full - connection unavailable')
      }
      // Queue the message for when connection is restored
      this.messageQueue.push({ id, method, params })
      const deferred = new Deferred<T>()
      this.pendingRequests.set(id, deferred as Deferred<unknown>)
      const timer = setTimeout(() => {
        if (!deferred.settled) {
          this.pendingRequests.delete(id)
          this.pendingTimers.delete(id)
          deferred.reject(new Error(`Request timeout: ${method}`))
        }
      }, this.requestTimeout)
      this.pendingTimers.set(id, timer)
      return deferred.promise
    }

    const request: WSRequest = { id, method, params }
    const deferred = new Deferred<T>()
    this.pendingRequests.set(id, deferred as Deferred<unknown>)
    const timer = setTimeout(() => {
      if (!deferred.settled) {
        this.pendingRequests.delete(id)
        this.pendingTimers.delete(id)
        deferred.reject(new Error(`Request timeout: ${method}`))
      }
    }, this.requestTimeout)
    this.pendingTimers.set(id, timer)

    // Send request
    try {
      if (!this.ws) {
        this.pendingRequests.delete(id)
        this.pendingTimers.delete(id)
        deferred.reject(new Error('WebSocket not connected'))
        return deferred.promise
      }
      this.ws.send(JSON.stringify(request))
    } catch (error) {
      this.pendingRequests.delete(id)
      this.pendingTimers.delete(id)
      deferred.reject(error as Error)
    }
    return deferred.promise
  }

  subscribe(eventType: string, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set())
    }
    this.eventHandlers.get(eventType)?.add(handler)

    // Return unsubscribe function
    return () => {
      const handlers = this.eventHandlers.get(eventType)
      if (handlers) {
        handlers.delete(handler)
        if (handlers.size === 0) {
          this.eventHandlers.delete(eventType)
        }
      }
    }
  }

  on(event: 'connect' | 'disconnect', handler: ConnectionHandler): void
  on(event: 'error', handler: ErrorHandler): void
  on(event: string, handler: ConnectionHandler | ErrorHandler): void {
    switch (event) {
      case 'connect':
        this.onConnect = handler as ConnectionHandler
        break
      case 'disconnect':
        this.onDisconnect = handler as ConnectionHandler
        break
      case 'error':
        this.onError = handler as ErrorHandler
        break
    }
  }

  disconnect(): void {
    this.intentionalDisconnect = true
    // Clear pending reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.connected = false
    this.connecting = false
    // Use helper to reject all pending requests
    this.rejectAllPending('WebSocket disconnected')
    this.messageQueue = []
  }

  isConnected(): boolean {
    return this.connected
  }

  getUrl(): string {
    return this.url
  }
}

// Singleton instance
let wsClient: WebSocketClient | null = null

export function getWebSocketClient(): WebSocketClient {
  if (!wsClient) {
    wsClient = new WebSocketClient()
  }
  return wsClient
}

export function initializeWebSocket(url?: string): WebSocketClient {
  if (wsClient) {
    // Clean up existing client completely before creating new one
    wsClient.disconnect()
    wsClient = null
  }
  wsClient = new WebSocketClient(url)
  return wsClient
}

export { WebSocketClient }

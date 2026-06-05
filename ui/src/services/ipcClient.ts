// IPC Client — Tauri invoke bridge for Go backend communication
// Replaces WebSocket JSON-RPC with Tauri IPC → Unix Socket

import { logger } from '../utils'

// Tauri native invoke (available when withGlobalTauri is enabled)
declare const window: Window & {
  __TAURI__?: {
    core: {
      invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
    }
    event: {
      listen: (event: string, handler: (event: { payload: unknown }) => void) => Promise<() => void>
    }
  }
}

/** Tauri IPC error from swarm_invoke */
export class IPCError extends Error {
  code: number

  constructor(code: number, message: string) {
    super(message)
    this.name = 'IPCError'
    this.code = code
  }

  get isNotFound(): boolean {
    return this.code === -32001
  }

  get isValidation(): boolean {
    return this.code === -32002
  }

  get isNotConnected(): boolean {
    return this.code === -32006
  }

  get isInternalError(): boolean {
    return this.code === -32603
  }
}

// Tauri invoke helper
async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!window.__TAURI__) {
    throw new Error('Tauri runtime not available')
  }
  return window.__TAURI__.core.invoke(command, args) as Promise<T>
}

// Tauri listen helper
async function tauriListen(event: string, handler: (payload: unknown) => void): Promise<() => void> {
  if (!window.__TAURI__?.event) {
    logger.warn('IPC', 'Tauri event API not available, event subscription skipped:', event)
    return () => {}
  }
  const unlisten = await window.__TAURI__.event.listen(event, (e) => handler(e.payload))
  return unlisten
}

/**
 * IPC client interface for Go backend communication.
 */
export interface IPCClient {
  /** Invoke a command on the Go backend via Unix socket */
  invoke<T = unknown>(method: string, params?: unknown): Promise<T>
  /** Subscribe to backend events via Tauri event system */
  subscribe(event: string, handler: (payload: unknown) => void): () => void
  /** Check if backend is available */
  isConnected(): boolean
}

/**
 * Listen to a Tauri event. Returns an unlisten function.
 * Exported for direct use by stores that need event subscriptions.
 */
export { tauriListen as listen }

/**
 * Create an IPC client that communicates with the Go backend
 * through Tauri's invoke mechanism (Unix socket bridge).
 */
export function createIPCClient(): IPCClient {
  // Track connection state
  let connected = false
  let connectionChecked = false

  // Check connection on first use
  async function checkConnection(): Promise<boolean> {
    try {
      // Try a lightweight ping via swarm_invoke
      await tauriInvoke('swarm_invoke', { method: 'ping', params: {} })
      connected = true
      connectionChecked = true
      return true
    } catch {
      connected = false
      connectionChecked = true
      return false
    }
  }

  return {
    async invoke<T = unknown>(method: string, params?: unknown): Promise<T> {
      try {
        const result = await tauriInvoke<T>('swarm_invoke', {
          method,
          params: params ?? {},
        })
        // Mark as connected on successful invoke
        if (!connected) {
          connected = true
          connectionChecked = true
        }
        return result
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        // If the error is from Go backend (socket not found), mark as disconnected
        if (errMsg.includes('socket not found') || errMsg.includes('not running')) {
          connected = false
        }
        logger.debug('IPC', `invoke(${method}) failed:`, errMsg)
        throw err
      }
    },

    subscribe(event: string, handler: (payload: unknown) => void): () => void {
      let unlistenFn: (() => void) | null = null

      // listen returns a Promise, but subscribe needs to return a sync cleanup
      tauriListen(event, handler).then((fn) => {
        unlistenFn = fn
      }).catch((err) => {
        logger.warn('IPC', `Failed to subscribe to ${event}:`, err)
      })

      return () => {
        if (unlistenFn) {
          unlistenFn()
          unlistenFn = null
        }
      }
    },

    isConnected(): boolean {
      // On first call, trigger an async check
      if (!connectionChecked) {
        checkConnection()
      }
      return connected
    },
  }
}

// Singleton instance
let ipcClient: IPCClient | null = null

/**
 * Get the singleton IPC client instance.
 */
export function getIPCClient(): IPCClient {
  if (!ipcClient) {
    ipcClient = createIPCClient()
  }
  return ipcClient
}

/**
 * Initialize a new IPC client (replaces existing singleton).
 * Used for reconnection scenarios.
 */
export function initializeIPCClient(): IPCClient {
  ipcClient = createIPCClient()
  return ipcClient
}

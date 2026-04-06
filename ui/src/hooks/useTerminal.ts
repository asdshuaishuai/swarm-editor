import { useState, useCallback, useRef } from 'react'

interface UseTerminalReturn {
  connected: boolean
  sessionId: string | null
  connect: (existingSessionId?: string) => void
  disconnect: () => void
  sendInput: (data: string) => void
  resize: (cols: number, rows: number) => void
  wsRef: React.MutableRefObject<WebSocket | null>
}

export function useTerminal(): UseTerminalReturn {
  const [connected, setConnected] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const connect = useCallback((existingSessionId?: string) => {
    if (wsRef.current) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = existingSessionId
      ? `${protocol}//${window.location.host}/api/terminal/ws?session=${existingSessionId}`
      : `${protocol}//${window.location.host}/api/terminal/ws`

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      setConnected(true)
    }

    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.type === 'session') {
            setSessionId(msg.id)
          }
          return
        } catch {
          // Not JSON, fall through
        }
      }
      // Binary data handled by xterm directly via wsRef
    }

    ws.onclose = () => {
      setConnected(false)
      wsRef.current = null
    }

    ws.onerror = () => {
      setConnected(false)
      wsRef.current = null
    }
  }, [])

  const disconnect = useCallback(() => {
    wsRef.current?.close()
    wsRef.current = null
    setConnected(false)
    setSessionId(null)
  }, [])

  const sendInput = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'input', data }))
    }
  }, [])

  const resize = useCallback((cols: number, rows: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }))
    }
  }, [])

  return { connected, sessionId, connect, disconnect, sendInput, resize, wsRef }
}

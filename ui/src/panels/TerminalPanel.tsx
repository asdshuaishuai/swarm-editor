import { useEffect, useRef, useState } from 'react'
import { X, Trash2, ChevronUp, ChevronDown, Terminal } from 'lucide-react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { useTerminal } from '../hooks/useTerminal'
import '@xterm/xterm/css/xterm.css'

// Catppuccin-inspired theme matching Swarm Editor dark mode
const darkTheme = {
  background: '#0d1117',
  foreground: '#cdd6f4',
  cursor: '#89b4fa',
  cursorAccent: '#0d1117',
  selectionBackground: '#45475a80',
  black: '#45475a',
  red: '#f38ba8',
  green: '#a6e3a1',
  yellow: '#f9e2af',
  blue: '#89b4fa',
  magenta: '#f5c2e7',
  cyan: '#94e2d5',
  white: '#bac2de',
  brightBlack: '#585b70',
  brightRed: '#f38ba8',
  brightGreen: '#a6e3a1',
  brightYellow: '#f9e2af',
  brightBlue: '#89b4fa',
  brightMagenta: '#f5c2e7',
  brightCyan: '#94e2d5',
  brightWhite: '#a6adc8',
}

interface TerminalTab {
  id: string
  label: string
}

interface TerminalPanelProps {
  onClose?: () => void
  defaultHeight?: number
  minHeight?: number
  maxHeight?: number
}

export default function TerminalPanel({
  onClose,
  defaultHeight = 250,
  minHeight = 120,
  maxHeight = 500,
}: TerminalPanelProps) {
  const [height, setHeight] = useState(defaultHeight)
  const [isResizing, setIsResizing] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [tabs] = useState<TerminalTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const resizeStartY = useRef(0)
  const resizeStartHeight = useRef(0)

  // Active terminal connection
  const { connected, connect, disconnect, sendInput, resize, wsRef } = useTerminal()

  // Create xterm instance
  useEffect(() => {
    if (!containerRef.current || xtermRef.current) return

    const xterm = new XTerm({
      theme: darkTheme,
      fontSize: 13,
      fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace",
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    xterm.loadAddon(fitAddon)
    xterm.loadAddon(webLinksAddon)
    xterm.open(containerRef.current)

    xtermRef.current = xterm
    fitAddonRef.current = fitAddon

    // Bridge xterm input -> WebSocket
    xterm.onData((data) => {
      sendInput(data)
    })

    // Fit after mount
    try { fitAddon.fit() } catch { /* ignore if container not visible */ }

    return () => {
      webLinksAddon.dispose()
      fitAddon.dispose()
      xterm.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Connect WebSocket when terminal mounts
  useEffect(() => {
    connect()
    return () => { disconnect() }
  }, [connect, disconnect])

  // Bridge WebSocket binary -> xterm
  useEffect(() => {
    const ws = wsRef.current
    if (!ws) return

    const handler = (ev: MessageEvent) => {
      if (ev.data instanceof ArrayBuffer) {
        const decoder = new TextDecoder()
        xtermRef.current?.write(decoder.decode(ev.data))
      }
    }
    ws.addEventListener('message', handler)
    return () => { ws.removeEventListener('message', handler) }
  }, [connected]) // re-attach when connection changes

  // Fit on resize/uncollapse
  useEffect(() => {
    if (!isCollapsed && fitAddonRef.current) {
      const timer = setTimeout(() => {
        try { fitAddonRef.current?.fit() } catch { /* ignore */ }
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [isCollapsed, height])

  // Send resize to PTY when xterm dimensions change
  useEffect(() => {
    if (!xtermRef.current || !connected) return
    const handler = () => {
      try {
        const { cols, rows } = xtermRef.current!
        if (cols && rows) resize(cols, rows)
      } catch { /* ignore */ }
    }
    const disposable = xtermRef.current.onResize(handler)
    return () => { disposable.dispose() }
  }, [connected, resize])

  // Handle resize
  useEffect(() => {
    if (!isResizing) return
    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = resizeStartY.current - e.clientY
      setHeight(Math.min(maxHeight, Math.max(minHeight, resizeStartHeight.current + deltaY)))
    }
    const handleMouseUp = () => setIsResizing(false)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, minHeight, maxHeight])

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    resizeStartY.current = e.clientY
    resizeStartHeight.current = height
  }

  // Focus terminal on click
  const focusTerminal = () => {
    xtermRef.current?.focus()
  }

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed)
  }

  return (
    <div
      className={`flex flex-col bg-mac-panel border-t border-glass-border ${isResizing ? 'select-none' : ''}`}
      style={{ height: isCollapsed ? 'auto' : height }}
    >
      {!isCollapsed && (
        <div
          className="h-1 bg-glass-border hover:bg-accent cursor-ns-resize transition-colors"
          onMouseDown={handleResizeStart}
        />
      )}
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-glass/50 border-b border-glass-border">
        <div className="flex items-center gap-1.5 min-w-0">
          <Terminal size={14} className="text-accent flex-shrink-0" />
          {tabs.length > 0 ? (
            <div className="flex items-center gap-1 min-w-0 overflow-x-auto">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTabId(tab.id)}
                  className={`px-2 py-0.5 text-xs rounded-mac transition-colors whitespace-nowrap ${
                    tab.id === activeTabId
                      ? 'bg-accent/10 text-accent font-medium'
                      : 'text-text-secondary hover:text-text-primary hover:bg-card-hover'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-xs font-medium text-text-primary">Terminal</span>
          )}
          {connected && (
            <span className="text-[10px] text-success flex-shrink-0" title="Connected">&#9679;</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { xtermRef.current?.clear(); xtermRef.current?.focus() }}
            className="p-1 hover:bg-card-hover rounded-mac text-text-secondary hover:text-text-primary transition-colors"
            title="Clear Terminal"
            aria-label="Clear Terminal"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={toggleCollapse}
            className="p-1 hover:bg-card-hover rounded-mac text-text-secondary hover:text-text-primary transition-colors"
            title={isCollapsed ? 'Expand' : 'Collapse'}
            aria-label={isCollapsed ? 'Expand' : 'Collapse'}
            aria-expanded={!isCollapsed}
          >
            {isCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-card-hover rounded-mac text-text-secondary hover:text-text-primary transition-colors"
              title="Close"
              aria-label="Close"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      {/* Terminal */}
      {!isCollapsed && (
        <div
          ref={containerRef}
          className="flex-1 min-h-0"
          onClick={focusTerminal}
          style={{ padding: '2px 4px' }}
          role="region"
          aria-label="Terminal"
        />
      )}
    </div>
  )
}

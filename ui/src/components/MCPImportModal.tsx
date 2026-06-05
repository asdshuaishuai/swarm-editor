import { useState, useEffect, useRef } from 'react'
import { Upload, X } from 'lucide-react'
import type { MCPServerInfo } from '../services/api'

interface MCPImportModalProps {
  scanned: MCPServerInfo[]
  onImport: (selected: MCPServerInfo[]) => void
  onClose: () => void
}

const SOURCE_COLORS: Record<string, string> = {
  claude: '#fb923c',
  kimi: '#22d3ee',
  opencode: '#a78bfa',
  qwen: '#f778ba',
}

function getSourceColor(source?: string): string | null {
  if (!source) return null
  const lower = source.toLowerCase()
  for (const [key, color] of Object.entries(SOURCE_COLORS)) {
    if (lower.includes(key)) return color
  }
  return null
}

function getSourceLabel(source?: string): string {
  if (!source) return ''
  // Normalize common source patterns
  if (source.startsWith('project:')) return source.replace('project:', '')
  if (source.startsWith('global:')) return source.replace('global:', '')
  return source
}

export default function MCPImportModal({ scanned, onImport, onClose }: MCPImportModalProps) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(scanned.map((_, i) => i)))
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const toggle = (index: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === scanned.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(scanned.map((_, i) => i)))
    }
  }

  const handleImport = () => {
    const picked = scanned.filter((_, i) => selected.has(i))
    if (picked.length > 0) onImport(picked)
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[100]"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      role="dialog"
      aria-modal="true"
      aria-label="导入 MCP 服务器"
    >
      <div
        style={{
          background: '#1a1f26',
          border: '1px solid #30363d',
          borderRadius: '12px',
          width: '460px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid #30363d',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Upload size={16} style={{ color: '#58a6ff' }} />
            <span style={{ color: '#e6edf3', fontSize: '14px', fontWeight: 600 }}>
              导入 MCP 服务器
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#8b949e',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
            }}
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        {/* Select all row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 20px',
            borderBottom: '1px solid #30363d',
            fontSize: '12px',
            color: '#8b949e',
          }}
        >
          <input
            type="checkbox"
            checked={selected.size === scanned.length && scanned.length > 0}
            onChange={toggleAll}
            style={{ accentColor: '#58a6ff' }}
            aria-label="全选"
          />
          <span>全选 / 取消全选</span>
        </div>

        {/* Server list */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            maxHeight: '280px',
            padding: '4px 0',
          }}
        >
          {scanned.length === 0 ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px 20px',
                color: '#6b7280',
                fontSize: '13px',
              }}
            >
              未发现 MCP 服务器
            </div>
          ) : (
            scanned.map((server, index) => {
              const sourceColor = getSourceColor(server.source)
              const sourceLabel = getSourceLabel(server.source)
              const detail = server.command || server.url || ''
              return (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 20px',
                    background: selected.has(index) ? 'rgba(88,166,255,0.06)' : 'transparent',
                    cursor: 'pointer',
                  }}
                  onClick={() => toggle(index)}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(index)}
                    onChange={() => toggle(index)}
                    onClick={e => e.stopPropagation()}
                    style={{ accentColor: '#58a6ff', flexShrink: 0 }}
                    aria-label={`选择 ${server.name}`}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        color: '#e6edf3',
                        fontSize: '13px',
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {server.name}
                    </div>
                    {detail && (
                      <div
                        style={{
                          color: '#6b7280',
                          fontSize: '11px',
                          fontFamily: 'monospace',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          marginTop: '2px',
                        }}
                      >
                        {detail}
                      </div>
                    )}
                  </div>
                  {sourceLabel && (
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: sourceColor ? `${sourceColor}20` : 'rgba(139,148,158,0.15)',
                        color: sourceColor || '#8b949e',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      {sourceLabel}
                    </span>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            borderTop: '1px solid #30363d',
          }}
        >
          <button
            ref={cancelRef}
            onClick={onClose}
            style={{
              background: '#21262d',
              border: '1px solid #30363d',
              borderRadius: '6px',
              color: '#c9d1d9',
              padding: '6px 14px',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            取消
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ color: '#8b949e', fontSize: '12px' }}>
              已选 {selected.size} / {scanned.length}
            </span>
            <button
              onClick={handleImport}
              disabled={selected.size === 0}
              style={{
                background: selected.size === 0 ? '#238636aa' : '#238636',
                border: '1px solid #2ea043',
                borderRadius: '6px',
                color: '#fff',
                padding: '6px 14px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
                opacity: selected.size === 0 ? 0.5 : 1,
              }}
            >
              导入选中
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

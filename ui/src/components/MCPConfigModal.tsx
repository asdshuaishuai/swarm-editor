import { useState, useEffect, useCallback } from 'react'
import { X, Loader2, Trash2, Check, AlertCircle, Server } from 'lucide-react'
import type { UnifiedMCPServer, McpServerSpec } from '../services/api'
import { api } from '../services'
import { logger } from '../utils'
import { useAppStore } from '../store/appStore'
import { ConfirmDialog } from './ConfirmDialog'

interface MCPConfigModalProps {
  server: UnifiedMCPServer
  onClose: () => void
  onSaved: (server: UnifiedMCPServer) => void
  onDeleted: (id: string) => void
}

const AGENTS = [
  { key: 'claude', label: 'Claude', color: '#fb923c' },
  { key: 'kimi', label: 'Kimi', color: '#22d3ee' },
  { key: 'opencode', label: 'OpenCode', color: '#a78bfa' },
  { key: 'qwen', label: 'Qwen', color: '#34d399' },
] as const

const SERVER_TYPES = ['stdio', 'http', 'sse'] as const

export default function MCPConfigModal({ server, onClose, onSaved, onDeleted }: MCPConfigModalProps) {
  const addToast = useAppStore(state => state.addToast)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [syncStatus, setSyncStatus] = useState<Record<string, 'pending' | 'ok' | 'error'>>({})
  const [syncErrors, setSyncErrors] = useState<string[]>([])

  // Form state
  const [name, setName] = useState(server.name)
  const [serverType, setServerType] = useState(server.server.type || 'stdio')
  const [command, setCommand] = useState(server.server.command || '')
  const [args, setArgs] = useState((server.server.args || []).join(' '))
  const [url, setUrl] = useState(server.server.url || '')
  const [headers, setHeaders] = useState(
    server.server.headers ? JSON.stringify(server.server.headers, null, 2) : ''
  )
  const [env, setEnv] = useState(
    server.server.env
      ? Object.entries(server.server.env).map(([k, v]) => `${k}=${v}`).join('\n')
      : ''
  )
  const [description, setDescription] = useState(server.description || '')
  const [apps, setApps] = useState({ ...server.apps })

  // Listen for sync completion events
  useEffect(() => {
    const unsub = api.events.onMCPConfigSynced((payload) => {
      if (payload.serverId !== server.id) return
      const statusMap: Record<string, 'ok' | 'error'> = {}
      for (const r of payload.results) {
        statusMap[r.app] = r.error ? 'error' : 'ok'
      }
      setSyncStatus(prev => ({ ...prev, ...statusMap }))
      setSyncErrors(payload.errors || [])
    })
    return unsub
  }, [server.id])

  const parseEnv = useCallback((envStr: string): Record<string, string> => {
    const result: Record<string, string> = {}
    envStr.split('\n').forEach(line => {
      const idx = line.indexOf('=')
      if (idx > 0) {
        result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
      }
    })
    return result
  }, [])

  const parseArgs = useCallback((argsStr: string): string[] => {
    return argsStr.split(/\s+/).filter(a => a.length > 0)
  }, [])

  const parseHeaders = useCallback((hStr: string): Record<string, string> | undefined => {
    if (!hStr.trim()) return undefined
    try {
      return JSON.parse(hStr)
    } catch {
      return undefined
    }
  }, [])

  const handleSave = async () => {
    if (!name.trim()) {
      setSaveError('名称不能为空')
      return
    }

    setIsSaving(true)
    setSaveError(null)
    setSyncStatus({})

    const spec: McpServerSpec = {
      type: serverType,
      command: serverType === 'stdio' ? command : undefined,
      args: serverType === 'stdio' ? parseArgs(args) : undefined,
      url: (serverType === 'http' || serverType === 'sse') ? url : undefined,
      headers: parseHeaders(headers),
      env: parseEnv(env) || undefined,
    }

    // Set pending for enabled apps
    const pending: Record<string, 'pending'> = {}
    for (const [k, v] of Object.entries(apps)) {
      if (v) pending[k] = 'pending'
    }
    setSyncStatus(pending)

    try {
      await api.mcp.upsertServer({
        id: server.id,
        name: name.trim(),
        server: spec,
        apps,
        description: description.trim() || undefined,
      })

      const updated: UnifiedMCPServer = {
        id: server.id,
        name: name.trim(),
        server: spec,
        apps,
        description: description.trim() || undefined,
        tags: server.tags,
      }

      addToast('success', '已保存', `${name} 配置已更新，正在同步到 Agent...`)
      onSaved(updated)
    } catch (err) {
      logger.error('MCPConfigModal', 'Save failed:', err)
      setSaveError(err instanceof Error ? err.message : '保存失败')
      setSyncStatus({})
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    try {
      await api.mcp.deleteUnifiedServer(server.id)
      addToast('success', '已删除', `${server.name} 已从统一管理中移除`)
      onDeleted(server.id)
    } catch (err) {
      logger.error('MCPConfigModal', 'Delete failed:', err)
      setSaveError(err instanceof Error ? err.message : '删除失败')
    }
  }

  const isHttp = serverType === 'http' || serverType === 'sse'

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div
        className="rounded-xl p-5 w-[520px] max-h-[85vh] overflow-y-auto shadow-2xl"
        style={{ background: '#1a1f26', border: '1px solid #30363d' }}
        role="dialog"
        aria-modal="true"
        aria-label={`MCP 伺服器配置: ${server.name}`}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-lg font-semibold flex items-center gap-2" style={{ color: '#d0d7de' }}>
            <Server size={18} style={{ color: '#c084fc' }} />
            MCP 伺服器配置
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded transition-colors hover:bg-[#21262d]"
          >
            <X size={18} style={{ color: '#9ca3af' }} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm mb-1.5 font-medium" style={{ color: '#9ca3af' }}>
              名称
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full rounded px-3 py-1.5 text-sm outline-none"
              style={{ background: '#0d1117', border: '1px solid #30363d', color: '#d0d7de' }}
              placeholder="my-mcp-server"
            />
          </div>

          {/* Type selector */}
          <div>
            <label className="block text-sm mb-1.5 font-medium" style={{ color: '#9ca3af' }}>
              类型
            </label>
            <div className="flex gap-2">
              {SERVER_TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => setServerType(t)}
                  className="text-xs font-mono px-3 py-1.5 rounded transition-colors"
                  style={{
                    background: serverType === t ? '#58a6ff22' : '#21262d',
                    color: serverType === t ? '#58a6ff' : '#6b7280',
                    border: `1px solid ${serverType === t ? '#58a6ff44' : '#30363d'}`,
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Command (stdio only) */}
          {serverType === 'stdio' && (
            <>
              <div>
                <label className="block text-sm mb-1.5 font-medium" style={{ color: '#9ca3af' }}>
                  命令
                </label>
                <input
                  type="text"
                  value={command}
                  onChange={e => setCommand(e.target.value)}
                  className="w-full rounded px-3 py-1.5 text-sm outline-none font-mono"
                  style={{ background: '#0d1117', border: '1px solid #30363d', color: '#d0d7de' }}
                  placeholder="npx -y @modelcontextprotocol/server-filesystem"
                />
              </div>
              <div>
                <label className="block text-sm mb-1.5 font-medium" style={{ color: '#9ca3af' }}>
                  参数 (空格分隔)
                </label>
                <input
                  type="text"
                  value={args}
                  onChange={e => setArgs(e.target.value)}
                  className="w-full rounded px-3 py-1.5 text-sm outline-none font-mono"
                  style={{ background: '#0d1117', border: '1px solid #30363d', color: '#d0d7de' }}
                  placeholder="/path/to/dir --readonly"
                />
              </div>
            </>
          )}

          {/* URL (http/sse only) */}
          {isHttp && (
            <>
              <div>
                <label className="block text-sm mb-1.5 font-medium" style={{ color: '#9ca3af' }}>
                  URL
                </label>
                <input
                  type="text"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  className="w-full rounded px-3 py-1.5 text-sm outline-none font-mono"
                  style={{ background: '#0d1117', border: '1px solid #30363d', color: '#d0d7de' }}
                  placeholder="https://mcp.example.com/sse"
                />
              </div>
              <div>
                <label className="block text-sm mb-1.5 font-medium" style={{ color: '#9ca3af' }}>
                  Headers (JSON)
                </label>
                <textarea
                  rows={2}
                  value={headers}
                  onChange={e => setHeaders(e.target.value)}
                  className="w-full rounded px-3 py-1.5 text-sm outline-none font-mono resize-none"
                  style={{ background: '#0d1117', border: '1px solid #30363d', color: '#d0d7de' }}
                  placeholder='{"Authorization": "Bearer xxx"}'
                />
              </div>
            </>
          )}

          {/* Environment variables */}
          <div>
            <label className="block text-sm mb-1.5 font-medium" style={{ color: '#9ca3af' }}>
              环境变量 (KEY=value, 每行一个)
            </label>
            <textarea
              rows={3}
              value={env}
              onChange={e => setEnv(e.target.value)}
              className="w-full rounded px-3 py-1.5 text-sm outline-none font-mono resize-none"
              style={{ background: '#0d1117', border: '1px solid #30363d', color: '#d0d7de' }}
              placeholder="API_KEY=your-key&#10;DEBUG=true"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm mb-1.5 font-medium" style={{ color: '#9ca3af' }}>
              描述
            </label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full rounded px-3 py-1.5 text-sm outline-none"
              style={{ background: '#0d1117', border: '1px solid #30363d', color: '#d0d7de' }}
              placeholder="可选描述"
            />
          </div>

          {/* Per-agent toggle */}
          <div>
            <label className="block text-sm mb-2 font-medium" style={{ color: '#9ca3af' }}>
              启用的 Agent
            </label>
            <div className="flex flex-wrap gap-2">
              {AGENTS.map(({ key, label, color }) => {
                const enabled = apps[key as keyof typeof apps]
                const status = syncStatus[key]
                return (
                  <button
                    key={key}
                    onClick={() => setApps(prev => ({ ...prev, [key]: !prev[key as keyof typeof prev] }))}
                    className="flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-full transition-colors"
                    style={{
                      background: enabled ? `${color}22` : '#21262d',
                      color: enabled ? color : '#6b7280',
                      border: `1px solid ${enabled ? `${color}44` : '#30363d'}`,
                    }}
                  >
                    {status === 'pending' && <Loader2 size={10} className="animate-spin" />}
                    {status === 'ok' && <Check size={10} />}
                    {status === 'error' && <AlertCircle size={10} style={{ color: '#f85149' }} />}
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Sync errors */}
          {syncErrors.length > 0 && (
            <div className="p-2 rounded text-xs" style={{ background: '#f8514922', border: '1px solid #f8514944', color: '#f85149' }} role="alert">
              {syncErrors.map((err, i) => (
                <div key={i}>{err}</div>
              ))}
            </div>
          )}

          {/* Save error */}
          {saveError && (
            <div className="p-2 rounded text-xs" style={{ background: '#f8514922', border: '1px solid #f8514944', color: '#f85149' }} role="alert">
              {saveError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center mt-6 pt-4" style={{ borderTop: '1px solid #30363d' }}>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors hover:bg-red-900/20"
            style={{ color: '#f85149' }}
          >
            <Trash2 size={14} />
            删除
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded hover:bg-[#21262d] transition-colors"
              style={{ color: '#9ca3af' }}
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-1.5 text-sm rounded transition-colors disabled:opacity-50"
              style={{ background: '#58a6ff', color: '#fff' }}
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              保存并同步
            </button>
          </div>
        </div>
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="删除 MCP 伺服器"
          message={`确定要删除 "${server.name}" 吗？将从所有 Agent 配置中移除。`}
          confirmLabel="删除"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  )
}

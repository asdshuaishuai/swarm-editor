import { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  Check,
  X,
  Server,
  Power,
  ChevronDown,
  ChevronRight,
  Save,
} from 'lucide-react'
import type { MCPToolInfo, MCPServerInfo, UnifiedMCPServer } from '../services/api'
import { useSettings, MCPServerSetting } from '../hooks/useSettings'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useAppStore } from '../store/appStore'
import { useMonitoringStore } from '../stores/monitoringStore'
import { api } from '../services'
import { logger } from '../utils'

export default function MCPPanel() {
  const { settings, addMCPServer, removeMCPServer, updateMCPServer, updateSetting } = useSettings()
  const addToast = useAppStore(state => state.addToast)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingServer, setEditingServer] = useState<MCPServerSetting | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MCPServerSetting | null>(null)
  const [newServer, setNewServer] = useState<Omit<MCPServerSetting, 'id' | 'status'>>({
    name: '',
    command: '',
    args: [],
    env: {},
    enabled: true,
    autoStart: true,
  })
  const [loading, setLoading] = useState(false)
  const [unifiedServers, setUnifiedServers] = useState<Record<string, UnifiedMCPServer>>({})
  const [importing, setImporting] = useState(false)
  const [expandedServer, setExpandedServer] = useState<string | null>(null)

  // 从 monitoringStore 获取扫描结果
  const scannedServers = useMonitoringStore(state => state.mcpServers)
  const skills = useMonitoringStore(state => state.skills)
  const refreshMCPServers = useMonitoringStore(state => state.refreshMCPServers)
  const refreshSkills = useMonitoringStore(state => state.refreshSkills)

  // Trigger skill scan on mount
  useEffect(() => { refreshSkills() }, [refreshSkills])

  // Fetch unified MCP servers on mount
  const fetchUnified = useCallback(async () => {
    try {
      const servers = await api.mcp.getUnifiedServers()
      setUnifiedServers(servers)
    } catch (err) {
      logger.warn('MCP', 'Failed to fetch unified servers:', err)
    }
  }, [])
  useEffect(() => { fetchUnified() }, [fetchUnified])

  // Listen for async sync completion to refresh unified servers
  useEffect(() => {
    const unsub = api.events.onMCPConfigSynced(() => {
      fetchUnified()
    })
    return unsub
  }, [fetchUnified])

  // 刷新 + 导入合并：扫描 Agent 配置 + 导入到统一存储
  const handleRefreshAndImport = async () => {
    setImporting(true)
    try {
      await Promise.all([
        refreshMCPServers(),
        api.mcp.importFromApps(),
      ])
      await fetchUnified()
      addToast('success', '刷新完成', '已扫描并导入 MCP 服务器')
    } catch (err) {
      logger.error('MCP', 'Refresh/import failed:', err)
      addToast('error', '刷新失败', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setImporting(false)
    }
  }

  // Toggle MCP server for a specific agent
  const handleToggleApp = async (serverId: string, app: string, enabled: boolean) => {
    try {
      await api.mcp.toggleApp(serverId, app, enabled)
      await fetchUnified()
      addToast('success', '已更新', `${app} ${enabled ? '启用' : '禁用'} MCP 服务器`)
    } catch (err) {
      logger.error('MCP', 'Toggle failed:', err)
      addToast('error', '切换失败', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const handleAddServer = async () => {
    if (!newServer.name || !newServer.command) {
      addToast('error', 'Validation Error', 'Name and command are required')
      return
    }

    setLoading(true)
    try {
      await api.mcp.addServer({
        name: newServer.name,
        command: newServer.command,
        args: newServer.args,
        env: newServer.env,
      })

      const server: MCPServerSetting = {
        id: `mcp-${Date.now()}`,
        ...newServer,
        status: 'disconnected',
      }
      addMCPServer(server)
      setShowAddModal(false)
      setNewServer({
        name: '',
        command: '',
        args: [],
        env: {},
        enabled: true,
        autoStart: true,
      })
      addToast('success', 'MCP Server Added', `Server "${server.name}" has been added`)
    } catch (err) {
      logger.error('MCP', 'Failed to add server:', err)
      addToast('error', 'Failed to Add Server', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const handleEditServer = async () => {
    if (!editingServer) return

    setLoading(true)
    try {
      updateMCPServer(editingServer.name, editingServer)
      setEditingServer(null)
      addToast('success', 'Server Updated', `Server "${editingServer.name}" has been updated`)
    } catch (err) {
      logger.error('MCP', 'Failed to update server:', err)
      addToast('error', 'Failed to Update Server', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteServer = async (server: MCPServerSetting) => {
    try {
      await api.mcp.removeServer(server.id)

      removeMCPServer(server.name)
      setDeleteTarget(null)
      addToast('success', 'Server Removed', `Server "${server.name}" has been removed`)
    } catch (err) {
      logger.error('MCP', 'Failed to remove server:', err)
      addToast('error', 'Failed to Remove Server', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const handleToggleServer = async (server: MCPServerSetting) => {
    const isStarting = server.status !== 'connected'

    try {
      if (isStarting) {
        const result = await api.mcp.startServer(server.id)
        updateMCPServer(server.name, { status: result.status as MCPServerSetting['status'] })
      } else {
        const result = await api.mcp.stopServer(server.id)
        updateMCPServer(server.name, { status: result.status as MCPServerSetting['status'] })
      }

      addToast(
        'success',
        isStarting ? 'Server Started' : 'Server Stopped',
        `Server "${server.name}" has been ${isStarting ? 'started' : 'stopped'}`
      )
    } catch (err) {
      logger.error('MCP', 'Failed to toggle server:', err)
      addToast('error', 'Failed to Toggle Server', err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const handleParseArgs = (argsString: string): string[] => {
    return argsString.split(' ').filter(arg => arg.trim() !== '')
  }

  const handleParseEnv = (envString: string): Record<string, string> => {
    const env: Record<string, string> = {}
    envString.split('\n').forEach(line => {
      const [key, ...values] = line.split('=')
      if (key && values.length > 0) {
        env[key.trim()] = values.join('=').trim()
      }
    })
    return env
  }

  return (
    <div className="flex flex-col h-full">
      {/* MCP Header — fixed at top */}
      <div className="p-3 shrink-0" style={{ background: 'rgba(13,17,23,0.5)', borderBottom: '1px solid #30363d' }}>
        <div className="flex items-center justify-between mb-3 text-[11px] font-bold uppercase tracking-wider" style={{ color: '#9ca3af' }}>
          <span className="flex items-center gap-1.5" style={{ color: '#c084fc' }}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6a2 2 0 100-4 2 2 0 000 4zM6 20a2 2 0 100-4 2 2 0 000 4zM18 20a2 2 0 100-4 2 2 0 000 4M12 8v2M7.5 16L10.5 10M16.5 16L13.5 10" />
            </svg>
            MCP 服务器
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleRefreshAndImport}
              disabled={importing}
              className="flex items-center gap-0.5 font-normal hover:underline disabled:opacity-50"
              style={{ color: '#58a6ff', fontSize: '12px' }}
              title="扫描并导入 MCP 服务器"
              aria-label="刷新 MCP 服务器"
            >
              <RefreshCw size={11} className={importing ? 'animate-spin' : ''} />
              刷新
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-0.5 font-normal hover:underline"
              style={{ color: '#58a6ff', fontSize: '12px' }}
            >
              <Plus size={11} />
              注册
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable content — MCP + Skills in one container */}
      <div className="flex-1 overflow-y-auto">
        {/* MCP enabled count indicator */}
        <div className="px-3 py-1.5 text-[10px] font-mono flex items-center justify-between" style={{ color: '#6b7280', borderBottom: '1px solid #30363d' }}>
          <span>已配置: <strong style={{ color: '#9ca3af' }}>{settings.mcpServers.length}</strong> 服务器 | 已发现: <strong style={{ color: '#9ca3af' }}>{scannedServers.length}</strong> 服务器</span>
          <button
            role="switch"
            aria-checked={settings.mcpEnabled}
            onClick={() => {
              const newState = !settings.mcpEnabled
              updateSetting('mcpEnabled', newState)
              addToast('info', 'MCP 设置', `MCP 已${newState ? '启用' : '禁用'}`)
            }}
            className="flex items-center gap-1 hover:text-white transition-colors"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${settings.mcpEnabled ? 'bg-emerald-500' : 'bg-gray-600'}`} />
            {settings.mcpEnabled ? '已启用' : '已禁用'}
          </button>
        </div>

        {/* Server List */}
        <div className="p-3" style={{ borderBottom: '1px solid #30363d' }}>
          {scannedServers.length === 0 && settings.mcpServers.length === 0 && Object.keys(unifiedServers).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12" style={{ color: '#6b7280' }}>
              <div className="p-4 rounded-xl mb-4" style={{ background: 'rgba(33,38,45,0.5)' }}>
                <Server size={48} className="opacity-50" />
              </div>
              <p className="text-base font-medium mb-1" style={{ color: '#9ca3af' }}>无 MCP 服务器配置</p>
              <p className="text-sm">注册 MCP 服务器以扩展 Agent 能力</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {/* 统一管理的 MCP 服务器（per-agent toggle） */}
              {Object.values(unifiedServers).length > 0 && (
                <>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>
                    统一管理 ({Object.values(unifiedServers).length})
                  </div>
                  {Object.values(unifiedServers).map((server) => (
                    <UnifiedServerCard
                      key={server.id}
                      server={server}
                      expanded={expandedServer === server.id}
                      onToggleExpand={() => setExpandedServer(expandedServer === server.id ? null : server.id)}
                      onToggleApp={(app, enabled) => handleToggleApp(server.id, app, enabled)}
                      onUpdated={(updated) => setUnifiedServers(prev => ({ ...prev, [updated.id]: updated }))}
                      onDeleted={(id) => setUnifiedServers(prev => { const next = { ...prev }; delete next[id]; return next })}
                    />
                  ))}
                </>
              )}
              {/* 扫描发现的服务器 */}
              {scannedServers.map((server) => (
                <ScannedServerCard key={server.id} server={server} />
              ))}
              {/* 手动配置的服务器 */}
              {settings.mcpServers.map((server) => (
                <MCPServerCard
                  key={server.id}
                  server={server}
                  onEdit={() => setEditingServer(server)}
                  onDelete={() => setDeleteTarget(server)}
                  onToggle={() => handleToggleServer(server)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Skills Section — below MCP */}
        <div className="p-3">
          <div className="flex items-center justify-between mb-3 text-[11px] font-bold uppercase tracking-wider" style={{ color: '#9ca3af' }}>
            <span className="flex items-center gap-1.5" style={{ color: '#22d3ee' }}>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2a9 9 0 00-9 9c0 3.88 2.46 7.18 5.91 8.44L12 22l3.09-2.56A9.001 9.001 0 0012 2zm0 16c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7zm-1-11h2v2h2v2h-2v2h-2v-2H9v-2h2V7z" />
              </svg>
              蜂群可加载技能库 (Skills)
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-normal" style={{ color: '#6b7280' }}>
                已发现: {skills.filter(s => s.source !== 'mcp' && !(s.tags && s.tags.includes('mcp'))).length}
              </span>
              <button
                onClick={refreshSkills}
                className="hover:underline font-normal"
                style={{ color: '#58a6ff', fontSize: '12px' }}
                aria-label="刷新技能"
              >
                <RefreshCw size={11} />
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {/* Filter out MCP-sourced skills and skills with mcp tags */}
            {skills.filter(s => s.source !== 'mcp' && !(s.tags && s.tags.includes('mcp'))).length === 0 ? (
              <div className="text-center py-4 text-[10px]" style={{ color: '#6b7280' }}>
                未发现技能。安装 skills 到 ~/.claude/skills/。
              </div>
            ) : (
              skills.filter(s => s.source !== 'mcp' && !(s.tags && s.tags.includes('mcp'))).map((skill) => {
                const sourceMeta: Record<string, { color: string; label: string }> = {
                  filesystem: { color: '#58a6ff', label: 'FS' },
                  agent: { color: '#c084fc', label: 'AGENT' },
                }
                const meta = sourceMeta[skill.source] || { color: '#6b7280', label: skill.source.toUpperCase() }
                // Filter out mcp from tags
                const filteredTags = skill.tags?.filter(tag => tag !== 'mcp') || []
                return (
                  <div
                    key={skill.id}
                    className="flex items-center justify-between p-2 rounded-md transition hover:bg-[#21262d]"
                    style={{ background: 'rgba(33,38,45,0.5)', border: '1px solid #30363d' }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[9px] font-mono font-bold px-1 rounded shrink-0" style={{ background: `${meta.color}22`, color: meta.color, border: `1px solid ${meta.color}44` }}>
                        {meta.label}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate" style={{ color: '#e5e7eb' }}>{skill.name}</div>
                        <div className="text-[9px] font-mono truncate" style={{ color: '#6b7280' }}>
                          {skill.description || skill.path || skill.agentId || ''}
                        </div>
                      </div>
                    </div>
                    {filteredTags.length > 0 && (
                      <div className="flex gap-0.5 shrink-0">
                        {filteredTags.slice(0, 2).map(tag => (
                          <span key={tag} className="text-[8px] font-mono px-1 rounded" style={{ background: '#21262d', color: '#6b7280' }}>{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Add Server Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="rounded-xl p-5 w-[480px] max-h-[85vh] overflow-y-auto shadow-2xl" style={{ background: '#1a1f26', border: '1px solid #30363d' }} role="dialog" aria-modal="true" aria-label="添加 MCP 服务器">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-semibold flex items-center gap-2" style={{ color: '#d0d7de' }}>
                <Plus size={18} style={{ color: '#58a6ff' }} />
                添加 MCP 服务器
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded transition-colors hover:bg-[#21262d]"
              >
                <X size={18} style={{ color: '#9ca3af' }} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-1.5 font-medium" style={{ color: '#9ca3af' }}>
                  服务器名称 *
                </label>
                <input
                  type="text"
                  value={newServer.name}
                  onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
                  className="w-full rounded px-3 py-1.5 text-sm outline-none" style={{ background: '#0d1117', border: '1px solid #30363d', color: '#d0d7de' }}
                  placeholder="my-mcp-server"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm mb-1.5 font-medium" style={{ color: '#9ca3af' }}>
                  命令 *
                </label>
                <input
                  type="text"
                  value={newServer.command}
                  onChange={(e) => setNewServer({ ...newServer, command: e.target.value })}
                  className="w-full rounded px-3 py-1.5 text-sm outline-none" style={{ background: '#0d1117', border: '1px solid #30363d', color: '#d0d7de' }}
                  placeholder="npx -y @modelcontextprotocol/server-filesystem"
                />
              </div>

              <div>
                <label className="block text-sm mb-1.5 font-medium" style={{ color: '#9ca3af' }}>
                  参数 (空格分隔)
                </label>
                <input
                  type="text"
                  onChange={(e) => setNewServer({ 
                    ...newServer, 
                    args: handleParseArgs(e.target.value) 
                  })}
                  className="w-full rounded px-3 py-1.5 text-sm outline-none" style={{ background: '#0d1117', border: '1px solid #30363d', color: '#d0d7de' }}
                  placeholder="/path/to/project --readonly"
                />
              </div>

              <div>
                <label className="block text-sm mb-1.5 font-medium" style={{ color: '#9ca3af' }}>
                  环境变量 (KEY=value, 每行一个)
                </label>
                <textarea
                  rows={3}
                  onChange={(e) => setNewServer({ 
                    ...newServer, 
                    env: handleParseEnv(e.target.value) 
                  })}
                  className="w-full rounded px-3 py-1.5 text-sm outline-none resize-none" style={{ background: '#0d1117', border: '1px solid #30363d', color: '#d0d7de' }}
                  placeholder="API_KEY=your-key&#10;DEBUG=true"
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <span className="text-sm" style={{ color: '#d0d7de' }}>启动时自动连接</span>
                <button
                  role="switch"
                  aria-checked={newServer.autoStart}
                  onClick={() => setNewServer({ ...newServer, autoStart: !newServer.autoStart })}
                  className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                    newServer.autoStart ? 'bg-accent' : 'bg-glass border border-glass-border'
                  }`}
                >
                  <div
                    className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200"
                    style={{ transform: newServer.autoStart ? 'translateX(22px)' : 'translateX(2px)' }}
                  />
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-4" style={{ borderTop: '1px solid #30363d' }}>
              <button
                onClick={() => setShowAddModal(false)}
                className="px-3 py-1.5 text-sm rounded hover:bg-[#21262d] transition-colors"
                style={{ color: '#9ca3af' }}
              >
                取消
              </button>
              <button
                onClick={handleAddServer}
                disabled={!newServer.name || !newServer.command || loading}
                className="flex items-center gap-2 px-3 py-1.5 text-sm rounded transition-colors"
                style={{ background: '#58a6ff', color: '#fff' }}
              >
                {loading ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                <span>添加服务器</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Server Modal */}
      {editingServer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="rounded-xl p-5 w-[480px] max-h-[85vh] overflow-y-auto shadow-2xl" style={{ background: '#1a1f26', border: '1px solid #30363d' }} role="dialog" aria-modal="true" aria-label="编辑 MCP 服务器">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-semibold flex items-center gap-2" style={{ color: '#d0d7de' }}>
                <Edit2 size={18} style={{ color: '#58a6ff' }} />
                编辑 MCP 服务器
              </h3>
              <button
                onClick={() => setEditingServer(null)}
                className="p-1.5 rounded transition-colors hover:bg-[#21262d]"
              >
                <X size={18} style={{ color: '#9ca3af' }} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1.5 font-medium">
                  Server Name
                </label>
                <input
                  type="text"
                  value={editingServer.name}
                  onChange={(e) => setEditingServer({ ...editingServer, name: e.target.value })}
                  className="w-full rounded px-3 py-1.5 text-sm outline-none" style={{ background: '#0d1117', border: '1px solid #30363d', color: '#d0d7de' }}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1.5 font-medium">
                  Command
                </label>
                <input
                  type="text"
                  value={editingServer.command}
                  onChange={(e) => setEditingServer({ ...editingServer, command: e.target.value })}
                  className="w-full rounded px-3 py-1.5 text-sm outline-none" style={{ background: '#0d1117', border: '1px solid #30363d', color: '#d0d7de' }}
                />
              </div>

              <div>
                <label className="block text-sm mb-1.5 font-medium" style={{ color: '#9ca3af' }}>
                  参数 (空格分隔)
                </label>
                <input
                  type="text"
                  value={editingServer.args.join(' ')}
                  onChange={(e) => setEditingServer({ 
                    ...editingServer, 
                    args: handleParseArgs(e.target.value) 
                  })}
                  className="w-full rounded px-3 py-1.5 text-sm outline-none" style={{ background: '#0d1117', border: '1px solid #30363d', color: '#d0d7de' }}
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <span className="text-sm" style={{ color: '#d0d7de' }}>启动时自动连接</span>
                <button
                  role="switch"
                  aria-checked={editingServer.autoStart}
                  onClick={() => setEditingServer({ ...editingServer, autoStart: !editingServer.autoStart })}
                  className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                    editingServer.autoStart ? 'bg-accent' : 'bg-glass border border-glass-border'
                  }`}
                >
                  <div
                    className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200"
                    style={{ transform: editingServer.autoStart ? 'translateX(22px)' : 'translateX(2px)' }}
                  />
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-4" style={{ borderTop: '1px solid #30363d' }}>
              <button
                onClick={() => setEditingServer(null)}
                className="px-3 py-1.5 text-sm rounded hover:bg-[#21262d] transition-colors"
                style={{ color: '#9ca3af' }}
              >
                取消
              </button>
              <button
                onClick={handleEditServer}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-1.5 text-sm rounded transition-colors"
                style={{ background: '#58a6ff', color: '#fff' }}
              >
                {loading ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                <span>保存修改</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Remove MCP Server"
          message={`Are you sure you want to remove "${deleteTarget.name}"? This action cannot be undone.`}
          confirmLabel="Remove"
          onConfirm={() => handleDeleteServer(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

    </div>
  )
}

interface MCPServerCardProps {
  server: MCPServerSetting
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
}

// 扫描发现的 MCP 服务器卡片（只读显示）
function ScannedServerCard({ server }: { server: MCPServerInfo }) {
  const statusColors: Record<string, string> = {
    connected: 'bg-emerald-500',
    discovered: 'bg-blue-500',
    disconnected: 'bg-text-tertiary',
    error: 'bg-error',
  }

  return (
    <div className="p-2.5 rounded-lg space-y-2" style={{ background: '#1a1f26', border: '1px solid #30363d' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColors[server.status] || 'bg-gray-500'}`} />
          <strong className="text-xs text-white font-mono">{server.name}</strong>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-mono px-1 py-0.2 rounded" style={{ background: 'rgba(59,130,246,0.2)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)' }}>
            {server.source || 'scan'}
          </span>
          {server.type && (
            <span className="text-[9px] font-mono px-1 py-0.2 rounded" style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }}>
              {server.type}
            </span>
          )}
        </div>
      </div>
      {server.command && (
        <p className="text-[10px] font-sans leading-normal" style={{ color: '#9ca3af' }}>
          {server.command}
        </p>
      )}
      {server.url && (
        <p className="text-[10px] font-mono truncate" style={{ color: '#6b7280' }}>
          {server.url}
        </p>
      )}
    </div>
  )
}

// 统一管理的 MCP 服务器卡片（per-agent toggle + 内联配置编辑）
function UnifiedServerCard({ server, expanded, onToggleExpand, onToggleApp, onUpdated, onDeleted }: {
  server: UnifiedMCPServer
  expanded: boolean
  onToggleExpand: () => void
  onToggleApp: (app: string, enabled: boolean) => void
  onUpdated: (updated: UnifiedMCPServer) => void
  onDeleted: (id: string) => void
}) {
  const addToast = useAppStore(state => state.addToast)
  const [editDraft, setEditDraft] = useState(server)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Reset draft when server changes or expand
  useEffect(() => {
    if (expanded) setEditDraft(server)
  }, [expanded, server])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.mcp.updateServer(editDraft.id, {
        name: editDraft.name,
        server: {
          type: editDraft.server.type,
          command: editDraft.server.command,
          args: editDraft.server.args,
          url: editDraft.server.url,
          env: editDraft.server.env,
          headers: editDraft.server.headers,
        },
        description: editDraft.description,
      })
      onUpdated(editDraft)
      addToast('success', '已保存', `${editDraft.name} 配置已更新`)
    } catch (err) {
      addToast('error', '保存失败', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await api.mcp.deleteUnifiedServer(editDraft.id)
      onDeleted(editDraft.id)
      addToast('success', '已删除', `${editDraft.name} 已移除`)
    } catch (err) {
      addToast('error', '删除失败', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setDeleting(false)
    }
  }

  const apps = [
    { key: 'claude', label: 'Claude', color: '#fb923c' },
    { key: 'kimi', label: 'Kimi', color: '#22d3ee' },
    { key: 'opencode', label: 'OpenCode', color: '#a78bfa' },
    { key: 'qwen', label: 'Qwen', color: '#34d399' },
  ]

  const inputCls = "w-full rounded px-2 py-1 text-[11px] font-mono outline-none"
  const inputStyle = { background: '#0d1117', border: '1px solid #30363d', color: '#d0d7de' }

  return (
    <div className="rounded-lg transition" style={{ background: '#1a1f26', border: '1px solid #30363d' }}>
      {/* Header row — click to expand/collapse */}
      <div className="flex items-center justify-between p-2.5 cursor-pointer hover:bg-[#21262d] rounded-lg" onClick={onToggleExpand}>
        <div className="flex items-center gap-1.5">
          {expanded ? <ChevronDown size={12} style={{ color: '#6b7280' }} /> : <ChevronRight size={12} style={{ color: '#6b7280' }} />}
          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-blue-500" />
          <strong className="text-xs text-white font-mono">{server.name}</strong>
        </div>
        {server.tags && server.tags.length > 0 && (
          <div className="flex gap-0.5">
            {server.tags.slice(0, 2).map(tag => (
              <span key={tag} className="text-[8px] font-mono px-1 rounded" style={{ background: '#21262d', color: '#6b7280' }}>{tag}</span>
            ))}
          </div>
        )}
      </div>

      {/* Collapsed: command + url + agent pills */}
      {!expanded && (
        <div className="px-2.5 pb-2.5 space-y-1.5">
          {server.server.command && (
            <p className="text-[10px] font-mono truncate" style={{ color: '#9ca3af' }}>{server.server.command}</p>
          )}
          {server.server.url && (
            <p className="text-[10px] font-mono truncate" style={{ color: '#6b7280' }}>{server.server.url}</p>
          )}
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {apps.map(({ key, label, color }) => {
              const enabled = server.apps[key as keyof typeof server.apps]
              return (
                <button
                  key={key}
                  onClick={e => { e.stopPropagation(); onToggleApp(key, !enabled) }}
                  className="text-[9px] font-mono px-2 py-0.5 rounded-full transition-colors"
                  style={{
                    background: enabled ? `${color}22` : 'rgba(33,38,45,0.8)',
                    color: enabled ? color : '#6b7280',
                    border: `1px solid ${enabled ? `${color}44` : '#30363d'}`,
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Expanded: inline config editing */}
      {expanded && (
        <div className="px-2.5 pb-2.5 space-y-2 border-t" style={{ borderColor: '#30363d' }}>
          {/* Agent toggles */}
          <div className="pt-2">
            <label className="text-[9px] font-mono uppercase" style={{ color: '#6b7280' }}>Agent 启用</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {apps.map(({ key, label, color }) => {
                const enabled = server.apps[key as keyof typeof server.apps]
                return (
                  <button
                    key={key}
                    onClick={() => onToggleApp(key, !enabled)}
                    className="text-[9px] font-mono px-2 py-0.5 rounded-full transition-colors"
                    style={{
                      background: enabled ? `${color}22` : 'rgba(33,38,45,0.8)',
                      color: enabled ? color : '#6b7280',
                      border: `1px solid ${enabled ? `${color}44` : '#30363d'}`,
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Type selector */}
          <div>
            <label className="text-[9px] font-mono uppercase" style={{ color: '#6b7280' }}>类型</label>
            <div className="flex gap-1 mt-1">
              {['stdio', 'http', 'sse'].map(t => (
                <button
                  key={t}
                  onClick={() => setEditDraft(d => ({ ...d, server: { ...d.server, type: t } }))}
                  className="text-[9px] font-mono px-2 py-0.5 rounded transition-colors"
                  style={{
                    background: editDraft.server.type === t ? 'rgba(88,166,255,0.15)' : '#21262d',
                    color: editDraft.server.type === t ? '#58a6ff' : '#6b7280',
                    border: `1px solid ${editDraft.server.type === t ? '#58a6ff33' : '#30363d'}`,
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Command (stdio) */}
          {(editDraft.server.type === 'stdio' || !editDraft.server.type) && (
            <div>
              <label className="text-[9px] font-mono uppercase" style={{ color: '#6b7280' }}>命令</label>
              <input
                value={editDraft.server.command || ''}
                onChange={e => setEditDraft(d => ({ ...d, server: { ...d.server, command: e.target.value } }))}
                className={inputCls} style={inputStyle}
                placeholder="npx -y @modelcontextprotocol/server-filesystem"
              />
            </div>
          )}

          {/* URL (http/sse) */}
          {(editDraft.server.type === 'http' || editDraft.server.type === 'sse') && (
            <div>
              <label className="text-[9px] font-mono uppercase" style={{ color: '#6b7280' }}>URL</label>
              <input
                value={editDraft.server.url || ''}
                onChange={e => setEditDraft(d => ({ ...d, server: { ...d.server, url: e.target.value } }))}
                className={inputCls} style={inputStyle}
                placeholder="https://mcp.example.com/sse"
              />
            </div>
          )}

          {/* Args */}
          <div>
            <label className="text-[9px] font-mono uppercase" style={{ color: '#6b7280' }}>参数</label>
            <input
              value={(editDraft.server.args || []).join(' ')}
              onChange={e => setEditDraft(d => ({ ...d, server: { ...d.server, args: e.target.value.split(' ').filter(Boolean) } }))}
              className={inputCls} style={inputStyle}
              placeholder="/path --readonly"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-[9px] font-mono uppercase" style={{ color: '#6b7280' }}>描述</label>
            <input
              value={editDraft.description || ''}
              onChange={e => setEditDraft(d => ({ ...d, description: e.target.value }))}
              className={inputCls} style={inputStyle}
              placeholder="服务器用途说明"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-[11px] font-medium transition-colors"
              style={{ background: '#238636', color: '#fff' }}
            >
              {saving ? <RefreshCw size={11} className="animate-spin" /> : <Save size={11} />}
              保存
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center justify-center gap-1 px-3 py-1.5 rounded text-[11px] font-medium transition-colors"
              style={{ background: 'rgba(127,29,29,0.2)', color: '#f85149', border: '1px solid rgba(248,81,73,0.2)' }}
            >
              {deleting ? <RefreshCw size={11} className="animate-spin" /> : <Trash2 size={11} />}
              删除
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function MCPServerCard({ server, onEdit, onDelete, onToggle }: MCPServerCardProps) {
  const [tools, setTools] = useState<MCPToolInfo[]>([])
  const [loadingTools, setLoadingTools] = useState(false)
  const [callingTool, setCallingTool] = useState<string | null>(null)
  const [toolResult, setToolResult] = useState<{ name: string; result: unknown } | null>(null)
  const addToast = useAppStore(state => state.addToast)

  const loadTools = useCallback(async () => {
    if (server.status !== 'connected') return
    setLoadingTools(true)
    try {
      const result = await api.mcp.listTools(server.id)
      setTools(result)
    } catch (err) {
      logger.error('MCP', 'Failed to list tools:', err)
    } finally {
      setLoadingTools(false)
    }
  }, [server.id, server.status])

  useEffect(() => {
    if (server.status === 'connected' && tools.length === 0) {
      loadTools()
    }
  }, [server.status, tools.length, loadTools])

  const handleCallTool = async (toolName: string) => {
    setCallingTool(toolName)
    setToolResult(null)
    try {
      const result = await api.mcp.callTool(server.id, toolName, {})
      setToolResult({ name: toolName, result })
      addToast('success', 'Tool Called', `${toolName} executed successfully`)
    } catch (err) {
      logger.error('MCP', 'Tool call failed:', err)
      addToast('error', 'Tool Call Failed', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setCallingTool(null)
    }
  }

  const statusColors = {
    connected: 'bg-emerald-500',
    disconnected: 'bg-text-tertiary',
    error: 'bg-error',
    connecting: 'bg-warning',
  }

  return (
    <div className={`p-2.5 rounded-lg space-y-2 transition-opacity duration-200 ${server.status === 'disconnected' ? 'opacity-70 hover:opacity-100' : ''}`} style={{ background: '#1a1f26', border: '1px solid #30363d' }}>
      {/* 头部: 状态点 + 名称 | 能力徽章 — 匹配设计稿布局 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColors[server.status]}`} />
          <strong className="text-xs text-white font-mono">{server.name}</strong>
        </div>
        {/* 能力徽章 — 匹配设计稿: 系统特权/外部网络/离线资料 */}
        {(() => {
          const isNetwork = /brave|search|fetch|http|web|url|remote/i.test(server.name + ' ' + server.command)
          const isConnected = server.status === 'connected'
          let bg: string, color: string, border: string, label: string
          if (!isConnected) {
            bg = 'rgba(69,26,3,0.4)'; color = '#fbbf24'; border = '1px solid rgba(120,53,15,0.3)'; label = '离线资料'
          } else if (isNetwork) {
            bg = '#172554'; color = '#60a5fa'; border = '1px solid #1e3a8a'; label = '外部网络'
          } else {
            bg = '#022c22'; color = '#34d399'; border = '1px solid #064e3b'; label = '系统特权'
          }
          return (
            <span className="text-[9px] font-mono px-1 py-0.2 rounded" style={{ background: bg, color, border }}>
              {label}
            </span>
          )
        })()}
      </div>
      {/* 描述 — 匹配设计稿: text-[10px] text-gray-400 font-sans leading-normal */}
      <p className="text-[10px] font-sans leading-normal" style={{ color: '#9ca3af' }}>
        {server.command}
      </p>

      {server.args.length > 0 && (
        <div className="mb-2 p-2 rounded text-[10px] font-mono truncate" style={{ background: 'rgba(0,0,0,0.2)', color: '#6b7280' }}>
          {server.args.join(' ')}
        </div>
      )}

      {/* Tools section — matching design: always visible with border-t divider */}
      {server.status === 'connected' && (
        <div className="border-t pt-2 flex flex-wrap gap-1" style={{ borderColor: '#1f2937', borderTopColor: '#1f2937' }}>
          {loadingTools && <span className="text-[10px]" style={{ color: '#6b7280' }}>Loading...</span>}
          {tools.map((tool) => (
            <button
              key={tool.name}
              onClick={() => handleCallTool(tool.name)}
              disabled={callingTool === tool.name}
              className="text-[9px] font-mono px-1.5 py-0.5 rounded cursor-pointer transition-colors hover:bg-[#1e293b]"
              style={{ background: '#0f172a', border: '1px solid #1f2937', color: '#cbd5e1' }}
              title={tool.description || tool.name}
            >
              {tool.name}()
            </button>
          ))}
          {!loadingTools && tools.length === 0 && (
            <span className="text-[10px]" style={{ color: '#6b7280' }}>无可用工具</span>
          )}
        </div>
      )}

      {toolResult && (
        <div className="mt-2 ml-5 p-2 rounded" style={{ background: 'rgba(0,0,0,0.2)' }}>
          <p className="text-[10px] font-medium mb-1" style={{ color: '#58a6ff' }}>{toolResult.name} 结果:</p>
          <pre className="text-[10px] overflow-x-auto max-h-32 overflow-y-auto" style={{ color: '#9ca3af' }}>
            {typeof toolResult.result === 'string'
              ? toolResult.result
              : JSON.stringify(toolResult.result, null, 2)}
          </pre>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={onToggle}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded text-xs font-medium transition-colors ${
            server.status === 'connected'
              ? 'hover:bg-red-900/20'
              : 'hover:bg-emerald-900/20'
          }`}
          style={{ color: server.status === 'connected' ? '#f85149' : '#10b981', background: server.status === 'connected' ? 'rgba(127,29,29,0.15)' : 'rgba(20,83,45,0.15)' }}
        >
          <Power size={12} />
          <span>{server.status === 'connected' ? '断开' : '连接'}</span>
        </button>
        <button
          onClick={onEdit}
          className="p-2 rounded hover:bg-[#21262d] transition-colors" style={{ color: '#9ca3af' }}
        >
          <Edit2 size={14} />
        </button>
        <button
          onClick={onDelete}
          className="p-2 rounded hover:bg-red-900/20 transition-colors" style={{ color: '#9ca3af' }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

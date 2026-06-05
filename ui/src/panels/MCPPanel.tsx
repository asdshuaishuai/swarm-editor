import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  Check,
  X,
  Server,
  Power,
  Settings,
  Save,
} from 'lucide-react'
import type { MCPToolInfo, UnifiedMCPServer, MCPServerInfo } from '../services/api'
import MCPImportModal from '../components/MCPImportModal'
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
  const [configServer, setConfigServer] = useState<UnifiedMCPServer | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [scannedForImport, setScannedForImport] = useState<MCPServerInfo[]>([])

  // 从 monitoringStore 获取扫描结果
  const skills = useMonitoringStore(state => state.skills)
  const refreshSkills = useMonitoringStore(state => state.refreshSkills)
  // Deduplicate skills by id (scanner may return duplicates)
  const uniqueSkills = useMemo(
    () => skills.filter(s => s.source !== 'mcp' && !(s.tags && s.tags.includes('mcp')))
      .filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i),
    [skills]
  )

  // Trigger skill scan on mount
  useEffect(() => { refreshSkills() }, [refreshSkills])

  // Fetch unified MCP servers on mount + auto-import scanned
  const fetchUnified = useCallback(async () => {
    try {
      const servers = await api.mcp.getUnifiedServers()
      setUnifiedServers(servers)
    } catch (err) {
      logger.warn('MCP', 'Failed to fetch unified servers:', err)
    }
  }, [])
  useEffect(() => {
    // Auto-import scanned servers into unified store on mount
    api.mcp.importFromApps().catch(() => {}).then(() => fetchUnified())
  }, [fetchUnified])

  // Listen for async sync completion to refresh unified servers
  useEffect(() => {
    const unsub = api.events.onMCPConfigSynced(() => {
      fetchUnified()
    })
    return unsub
  }, [fetchUnified])

  // 扫描 Agent 配置并显示导入选择弹窗
  const handleScanAndShowModal = async () => {
    setImporting(true)
    try {
      const servers = await api.mcp.scanServers()
      setScannedForImport(servers)
      setShowImport(true)
    } catch (err) {
      logger.error('MCP', 'Scan failed:', err)
      addToast('error', '扫描失败', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setImporting(false)
    }
  }

  // 从弹窗选择的服务器批量导入到统一存储
  const handleImportSelected = async (selected: MCPServerInfo[]) => {
    setShowImport(false)
    setImporting(true)
    try {
      for (const server of selected) {
        await api.mcp.upsertServer({
          id: server.id || `mcp-${server.name}`,
          name: server.name,
          server: {
            type: server.type || 'stdio',
            command: server.command,
            args: server.args,
            url: server.url,
            headers: server.headers,
            env: server.env,
          },
          apps: { claude: true, opencode: true, qwen: true, kimi: true },
        })
      }
      await fetchUnified()
      addToast('success', '导入完成', `已导入 ${selected.length} 个 MCP 服务器`)
    } catch (err) {
      logger.error('MCP', 'Import failed:', err)
      addToast('error', '导入失败', err instanceof Error ? err.message : 'Unknown error')
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
              onClick={handleScanAndShowModal}
              disabled={importing}
              className="flex items-center gap-0.5 font-normal hover:underline disabled:opacity-50"
              style={{ color: '#58a6ff', fontSize: '12px' }}
              title="扫描 MCP 服务器并选择导入"
              aria-label="导入 MCP 服务器"
            >
              <RefreshCw size={11} className={importing ? 'animate-spin' : ''} />
              导入
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
          <span>已配置: <strong style={{ color: '#9ca3af' }}>{settings.mcpServers.length}</strong> 服务器 | 统一管理: <strong style={{ color: '#9ca3af' }}>{Object.keys(unifiedServers).length}</strong> 服务器</span>
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
          {settings.mcpServers.length === 0 && Object.keys(unifiedServers).length === 0 ? (
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
                      onToggleApp={(app, enabled) => handleToggleApp(server.id, app, enabled)}
                      onConfigure={() => setConfigServer(server)}
                    />
                  ))}
                </>
              )}
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
                已发现: {uniqueSkills.length}
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
            {uniqueSkills.length === 0 ? (
              <div className="text-center py-4 text-[10px]" style={{ color: '#6b7280' }}>
                未发现技能。安装 skills 到 ~/.claude/skills/。
              </div>
            ) : (
              uniqueSkills.map((skill) => {
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

      {/* MCP Config Modal */}
      {configServer && (
        <MCPConfigModal
          server={configServer}
          onClose={() => setConfigServer(null)}
          onSaved={(updated) => setUnifiedServers(prev => ({ ...prev, [updated.id]: updated }))}
          onDeleted={(id) => setUnifiedServers(prev => { const next = { ...prev }; delete next[id]; return next })}
        />
      )}

      {/* MCP Import Modal */}
      {showImport && (
        <MCPImportModal
          scanned={scannedForImport}
          onImport={handleImportSelected}
          onClose={() => setShowImport(false)}
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

// 统一管理的 MCP 服务器卡片（开关 + 设置按钮）
function UnifiedServerCard({ server, onToggleApp, onConfigure }: {
  server: UnifiedMCPServer
  onToggleApp: (app: string, enabled: boolean) => void
  onConfigure: () => void
}) {
  const apps = [
    { key: 'claude', label: 'Claude', color: '#fb923c' },
    { key: 'kimi', label: 'Kimi', color: '#22d3ee' },
    { key: 'opencode', label: 'OpenCode', color: '#a78bfa' },
    { key: 'qwen', label: 'Qwen', color: '#34d399' },
  ]

  // Check if any agent has this server enabled
  const anyEnabled = apps.some(({ key }) => server.apps[key as keyof typeof server.apps])

  return (
    <div className="p-2.5 rounded-lg transition" style={{ background: '#1a1f26', border: '1px solid #30363d' }}>
      {/* 顶部行：开关 + 名称 + 设置按钮 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {/* 开关 */}
          <button
            role="switch"
            aria-checked={anyEnabled}
            onClick={() => {
              // Toggle all apps
              const newState = !anyEnabled
              apps.forEach(({ key }) => onToggleApp(key, newState))
            }}
            className={`relative w-8 h-4 rounded-full transition-colors duration-200 ${anyEnabled ? 'bg-emerald-500/30' : 'bg-gray-600/30'}`}
            style={{ border: `1px solid ${anyEnabled ? '#34d39955' : '#30363d'}` }}
          >
            <div
              className="absolute top-0.5 w-3 h-3 rounded-full transition-transform duration-200"
              style={{
                transform: anyEnabled ? 'translateX(16px)' : 'translateX(2px)',
                background: anyEnabled ? '#34d399' : '#6b7280',
              }}
            />
          </button>
          {/* 名称 */}
          <strong className="text-xs text-white font-mono">{server.name}</strong>
        </div>
        <div className="flex items-center gap-1">
          {/* 标签 */}
          {server.tags && server.tags.length > 0 && (
            <div className="flex gap-0.5 mr-1">
              {server.tags.slice(0, 2).map(tag => (
                <span key={tag} className="text-[8px] font-mono px-1 rounded" style={{ background: '#21262d', color: '#6b7280' }}>{tag}</span>
              ))}
            </div>
          )}
          {/* 设置按钮 */}
          <button
            onClick={onConfigure}
            className="p-1 rounded hover:bg-[#21262d] transition-colors"
            style={{ color: '#6b7280' }}
            title="配置服务器"
          >
            <Settings size={12} />
          </button>
        </div>
      </div>

      {/* 命令/URL */}
      {server.server.command && (
        <p className="text-[10px] font-mono truncate mb-1.5" style={{ color: '#9ca3af' }}>{server.server.command}</p>
      )}
      {server.server.url && (
        <p className="text-[10px] font-mono truncate mb-1.5" style={{ color: '#6b7280' }}>{server.server.url}</p>
      )}

      {/* Agent 启用状态 pills */}
      <div className="flex flex-wrap gap-1.5">
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
  )
}

// MCP 配置 Modal（UI 化设置窗口）
function MCPConfigModal({ server, onClose, onSaved, onDeleted }: {
  server: UnifiedMCPServer
  onClose: () => void
  onSaved: (updated: UnifiedMCPServer) => void
  onDeleted: (id: string) => void
}) {
  const addToast = useAppStore(state => state.addToast)
  const [draft, setDraft] = useState(server)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const inputCls = "w-full rounded px-2.5 py-1.5 text-[11px] font-mono outline-none focus:border-blue-500/50"
  const inputStyle = { background: '#0d1117', border: '1px solid #30363d', color: '#d0d7de' }
  const labelCls = "block text-[10px] font-mono uppercase mb-1"

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.mcp.updateServer(draft.id, {
        name: draft.name,
        server: {
          type: draft.server.type,
          command: draft.server.command,
          args: draft.server.args,
          url: draft.server.url,
          env: draft.server.env,
          headers: draft.server.headers,
        },
        description: draft.description,
      })
      onSaved(draft)
      addToast('success', '已保存', `${draft.name} 配置已更新`)
      onClose()
    } catch (err) {
      addToast('error', '保存失败', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await api.mcp.deleteUnifiedServer(draft.id)
      onDeleted(draft.id)
      addToast('success', '已删除', `${draft.name} 已移除`)
      onClose()
    } catch (err) {
      addToast('error', '删除失败', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="rounded-xl p-5 w-[480px] max-h-[85vh] overflow-y-auto shadow-2xl" style={{ background: '#1a1f26', border: '1px solid #30363d' }} role="dialog" aria-modal="true" aria-label={`配置 ${server.name}`}>
        {/* Header */}
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-lg font-semibold flex items-center gap-2" style={{ color: '#d0d7de' }}>
            <Settings size={18} style={{ color: '#58a6ff' }} />
            {server.name}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded transition-colors hover:bg-[#21262d]">
            <X size={18} style={{ color: '#9ca3af' }} />
          </button>
        </div>

        <div className="space-y-4">
          {/* 名称 */}
          <div>
            <label className={labelCls} style={{ color: '#9ca3af' }}>名称</label>
            <input
              value={draft.name}
              onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
              className={inputCls} style={inputStyle}
            />
          </div>

          {/* 类型选择 */}
          <div>
            <label className={labelCls} style={{ color: '#9ca3af' }}>类型</label>
            <div className="flex gap-1.5">
              {['stdio', 'http', 'sse'].map(t => (
                <button
                  key={t}
                  onClick={() => setDraft(d => ({ ...d, server: { ...d.server, type: t } }))}
                  className="text-[10px] font-mono px-3 py-1 rounded transition-colors"
                  style={{
                    background: draft.server.type === t ? 'rgba(88,166,255,0.15)' : '#21262d',
                    color: draft.server.type === t ? '#58a6ff' : '#6b7280',
                    border: `1px solid ${draft.server.type === t ? '#58a6ff33' : '#30363d'}`,
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* 命令 (stdio) */}
          {(draft.server.type === 'stdio' || !draft.server.type) && (
            <div>
              <label className={labelCls} style={{ color: '#9ca3af' }}>命令</label>
              <input
                value={draft.server.command || ''}
                onChange={e => setDraft(d => ({ ...d, server: { ...d.server, command: e.target.value } }))}
                className={inputCls} style={inputStyle}
                placeholder="npx -y @modelcontextprotocol/server-filesystem"
              />
            </div>
          )}

          {/* URL (http/sse) */}
          {(draft.server.type === 'http' || draft.server.type === 'sse') && (
            <div>
              <label className={labelCls} style={{ color: '#9ca3af' }}>URL</label>
              <input
                value={draft.server.url || ''}
                onChange={e => setDraft(d => ({ ...d, server: { ...d.server, url: e.target.value } }))}
                className={inputCls} style={inputStyle}
                placeholder="https://mcp.example.com/sse"
              />
            </div>
          )}

          {/* 参数 */}
          <div>
            <label className={labelCls} style={{ color: '#9ca3af' }}>参数</label>
            <input
              value={(draft.server.args || []).join(' ')}
              onChange={e => setDraft(d => ({ ...d, server: { ...d.server, args: e.target.value.split(' ').filter(Boolean) } }))}
              className={inputCls} style={inputStyle}
              placeholder="/path --readonly"
            />
          </div>

          {/* 环境变量 */}
          <div>
            <label className={labelCls} style={{ color: '#9ca3af' }}>环境变量</label>
            <textarea
              rows={2}
              value={Object.entries(draft.server.env || {}).map(([k, v]) => `${k}=${v}`).join('\n')}
              onChange={e => {
                const env: Record<string, string> = {}
                e.target.value.split('\n').forEach(line => {
                  const [key, ...vals] = line.split('=')
                  if (key && vals.length > 0) env[key.trim()] = vals.join('=').trim()
                })
                setDraft(d => ({ ...d, server: { ...d.server, env } }))
              }}
              className="w-full rounded px-2.5 py-1.5 text-[11px] font-mono outline-none resize-none"
              style={{ ...inputStyle, minHeight: '40px' }}
              placeholder="KEY=value"
            />
          </div>

          {/* 描述 */}
          <div>
            <label className={labelCls} style={{ color: '#9ca3af' }}>描述</label>
            <input
              value={draft.description || ''}
              onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
              className={inputCls} style={inputStyle}
              placeholder="服务器用途说明"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-6 pt-4" style={{ borderTop: '1px solid #30363d' }}>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded hover:bg-[#21262d] transition-colors"
            style={{ color: '#9ca3af' }}
          >
            取消
          </button>
          <div className="flex-1" />
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors"
            style={{ background: 'rgba(127,29,29,0.2)', color: '#f85149', border: '1px solid rgba(248,81,73,0.2)' }}
          >
            {deleting ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
            删除
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded transition-colors"
            style={{ background: '#238636', color: '#fff' }}
          >
            {saving ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
            保存
          </button>
        </div>
      </div>
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

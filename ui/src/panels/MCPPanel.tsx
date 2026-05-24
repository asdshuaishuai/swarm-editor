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
} from 'lucide-react'
import type { MCPToolInfo } from '../services/api'
import { useSettings, MCPServerSetting } from '../hooks/useSettings'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useAppStore } from '../store/appStore'
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
      {/* Header — 匹配设计稿: 作用中 MCP 伺服器 */}
      <div className="p-3" style={{ background: 'rgba(13,17,23,0.5)', borderBottom: '1px solid #30363d' }}>
        <div className="flex items-center justify-between mb-3 text-[11px] font-bold uppercase tracking-wider" style={{ color: '#9ca3af' }}>
          <span className="flex items-center gap-1.5" style={{ color: '#c084fc' }}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6a2 2 0 100-4 2 2 0 000 4zM6 20a2 2 0 100-4 2 2 0 000 4zM18 20a2 2 0 100-4 2 2 0 000 4M12 8v2M7.5 16L10.5 10M16.5 16L13.5 10" />
            </svg>
            作用中 MCP 伺服器
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={async () => {
                addToast('info', '扫描中', '正在扫描 MCP 伺服器...')
                try {
                  const discovered = await api.mcp.scanServers()
                  addToast('success', '扫描完成', `发现 ${discovered.length} 个 MCP 伺服器`)
                  logger.info('MCP', 'Scan completed', discovered)
                } catch (e) {
                  addToast('error', '扫描失败', e instanceof Error ? e.message : 'Unknown error')
                }
              }}
              className="flex items-center gap-0.5 font-normal hover:underline"
              style={{ color: '#58a6ff', fontSize: '12px' }}
              title="扫描 MCP 伺服器"
              aria-label="扫描 MCP 伺服器"
            >
              <RefreshCw size={11} />
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

      {/* MCP enabled count indicator */}
      <div className="px-3 py-1.5 text-[10px] font-mono flex items-center justify-between" style={{ color: '#6b7280', borderBottom: '1px solid #30363d' }}>
        <span>已配置: <strong style={{ color: '#9ca3af' }}>{settings.mcpServers.length}</strong> 伺服器</span>
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
      <div className="flex-1 overflow-y-auto">
        {settings.mcpServers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64" style={{ color: '#6b7280' }}>
            <div className="p-4 rounded-xl mb-4" style={{ background: 'rgba(33,38,45,0.5)' }}>
              <Server size={48} className="opacity-50" />
            </div>
            <p className="text-base font-medium mb-1" style={{ color: '#9ca3af' }}>无 MCP 伺服器配置</p>
            <p className="text-sm">注册 MCP 伺服器以扩展 Agent 能力</p>
          </div>
        ) : (
          <div className="space-y-2.5 p-3">
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

      {/* Skills Section — matching design: 蜂群可加载技能库 */}
      <div style={{ borderTop: '1px solid #30363d' }}>
        <div className="p-3">
          <div className="flex items-center justify-between mb-3 text-[11px] font-bold uppercase tracking-wider" style={{ color: '#9ca3af' }}>
            <span className="flex items-center gap-1.5" style={{ color: '#22d3ee' }}>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2a9 9 0 00-9 9c0 3.88 2.46 7.18 5.91 8.44L12 22l3.09-2.56A9.001 9.001 0 0012 2zm0 16c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7zm-1-11h2v2h2v2h-2v2h-2v-2H9v-2h2V7z" />
              </svg>
              蜂群可加载技能库 (Skills)
            </span>
            <span className="text-[10px] font-mono font-normal" style={{ color: '#6b7280' }}>
              已激活: 3/4
            </span>
          </div>
          <div className="space-y-2">
            {([
              { name: 'AST 语义分析器 (Semantic AST)', icon: 'chart', color: '#22d3ee', status: 'ENABLED', binary: 'ast-v2', enabled: true, pulse: false },
              { name: '单元测试自动生成 (Test Generator)', icon: 'vial', color: '#c084fc', status: 'ENABLED', binary: 'jest-gen', enabled: true, pulse: false },
              { name: '安全漏洞沙箱拦截 (Shell Sandbox)', icon: 'shield', color: '#fb923c', status: 'HIGH_ALERT', binary: 'sec-gate', enabled: true, pulse: true },
              { name: '云端运算代码预估 (Cost Estimator)', icon: 'dollar', color: '#9ca3af', status: 'DISABLED', binary: 'billing-v1', enabled: false, pulse: false },
            ] as const).map((skill, i) => (
              <div
                key={i}
                className={`flex items-center justify-between p-2 rounded-md transition ${!skill.enabled ? 'hover:opacity-100 transition-opacity' : 'hover:bg-[#21262d]'}`}
                style={{
                  background: skill.enabled ? 'rgba(33,38,45,0.5)' : 'rgba(33,38,45,0.3)',
                  border: '1px solid #30363d',
                  opacity: skill.enabled ? 1 : 0.45,
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {skill.icon === 'chart' ? (
                    <svg className={`w-3.5 h-3.5 shrink-0 ${skill.pulse ? 'animate-pulse' : ''}`} fill="none" viewBox="0 0 24 24" stroke={skill.color} strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                    </svg>
                  ) : skill.icon === 'vial' ? (
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke={skill.color} strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                    </svg>
                  ) : skill.icon === 'shield' ? (
                    <svg className={`w-3.5 h-3.5 shrink-0 ${skill.pulse ? 'animate-pulse' : ''}`} fill="none" viewBox="0 0 24 24" stroke={skill.color} strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke={skill.color} strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                    </svg>
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-bold truncate" style={{ color: skill.enabled ? '#e5e7eb' : '#d1d5db' }}>{skill.name}</div>
                    <div className="text-[9px] font-mono" style={{ color: '#6b7280' }}>STATUS: {skill.status} // BINARY: {skill.binary}</div>
                  </div>
                </div>
                {/* 复选框 — 匹配设计稿: 右侧 accent-editor-accent */}
                <input
                  type="checkbox"
                  checked={skill.enabled}
                  readOnly
                  className="w-3.5 h-3.5 rounded accent-[#58a6ff] cursor-pointer shrink-0"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add Server Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="rounded-xl p-5 w-[480px] max-h-[85vh] overflow-y-auto shadow-2xl" style={{ background: '#1a1f26', border: '1px solid #30363d' }} role="dialog" aria-modal="true" aria-label="添加 MCP 伺服器">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-semibold flex items-center gap-2" style={{ color: '#d0d7de' }}>
                <Plus size={18} style={{ color: '#58a6ff' }} />
                添加 MCP 伺服器
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
                  伺服器名称 *
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
                <span>添加伺服器</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Server Modal */}
      {editingServer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="rounded-xl p-5 w-[480px] max-h-[85vh] overflow-y-auto shadow-2xl" style={{ background: '#1a1f26', border: '1px solid #30363d' }} role="dialog" aria-modal="true" aria-label="编辑 MCP 伺服器">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-semibold flex items-center gap-2" style={{ color: '#d0d7de' }}>
                <Edit2 size={18} style={{ color: '#58a6ff' }} />
                编辑 MCP 伺服器
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

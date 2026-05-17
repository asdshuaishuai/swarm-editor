import { useState, useEffect, useCallback } from 'react'
import {
  Plug,
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
  Wrench,
  Play,
  Loader2,
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
    <div className="flex flex-col h-full p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-accent/10 rounded-mac">
            <Plug size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">MCP Plugins</h2>
            <p className="text-xs text-text-secondary">Model Context Protocol servers</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              addToast('info', 'Scanning', 'Scanning for MCP servers...')
              try {
                const discovered = await api.mcp.scanServers()
                addToast('success', 'Scan complete', `Found ${discovered.length} MCP servers`)
                logger.info('MCP', 'Scan completed', discovered)
              } catch (e) {
                addToast('error', 'Scan failed', e instanceof Error ? e.message : 'Unknown error')
              }
            }}
            className="p-2 hover:bg-card-hover rounded-mac transition-colors"
            title="Scan for MCP servers"
            aria-label="Scan for MCP servers"
          >
            <RefreshCw size={16} className="text-text-secondary" />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary"
          >
            <Plus size={16} />
            <span>Add Server</span>
          </button>
        </div>
      </div>

      {/* MCP Status Banner */}
      <div className={`mb-4 p-3 rounded-mac flex items-center gap-3 ${
        settings.mcpEnabled 
          ? 'bg-success/10 border border-success/20' 
          : 'bg-glass border border-glass-border'
      }`}>
        <Power size={18} className={settings.mcpEnabled ? 'text-success' : 'text-text-tertiary'} />
        <div className="flex-1">
          <div className="text-sm font-medium text-text-primary">
            MCP {settings.mcpEnabled ? 'Enabled' : 'Disabled'}
          </div>
          <div className="text-xs text-text-secondary">
            {settings.mcpServers.length} server{settings.mcpServers.length !== 1 ? 's' : ''} configured
          </div>
        </div>
        <button
          role="switch"
          aria-checked={settings.mcpEnabled}
          onClick={() => {
            const newState = !settings.mcpEnabled
            updateSetting('mcpEnabled', newState)
            addToast('info', 'MCP Settings', `MCP has been ${newState ? 'enabled' : 'disabled'}`)
          }}
          className={`px-3 py-1.5 rounded-mac text-xs font-medium transition-colors ${
            settings.mcpEnabled
              ? 'bg-success/20 text-success hover:bg-success/30'
              : 'bg-glass text-text-secondary hover:bg-card-hover'
          }`}
        >
          {settings.mcpEnabled ? 'Active' : 'Inactive'}
        </button>
      </div>

      {/* Server List */}
      <div className="flex-1 overflow-y-auto">
        {settings.mcpServers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-text-tertiary">
            <div className="p-4 bg-glass rounded-mac-xl mb-4">
              <Server size={48} className="opacity-50" />
            </div>
            <p className="text-base font-medium text-text-secondary mb-1">No MCP servers configured</p>
            <p className="text-sm">Add an MCP server to extend agent capabilities</p>
          </div>
        ) : (
          <div className="space-y-3">
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

      {/* Add Server Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-mac-panel/95 border border-glass-border rounded-mac-xl p-5 w-[480px] max-h-[85vh] overflow-y-auto shadow-mac backdrop-blur-xl" role="dialog" aria-modal="true" aria-label="Add MCP Server">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <Plus size={18} className="text-accent" />
                Add MCP Server
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 hover:bg-card-hover rounded-mac transition-colors"
              >
                <X size={18} className="text-text-secondary" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1.5 font-medium">
                  Server Name *
                </label>
                <input
                  type="text"
                  value={newServer.name}
                  onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
                  className="w-full input-mac"
                  placeholder="my-mcp-server"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1.5 font-medium">
                  Command *
                </label>
                <input
                  type="text"
                  value={newServer.command}
                  onChange={(e) => setNewServer({ ...newServer, command: e.target.value })}
                  className="w-full input-mac"
                  placeholder="npx -y @modelcontextprotocol/server-filesystem"
                />
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1.5 font-medium">
                  Arguments (space-separated)
                </label>
                <input
                  type="text"
                  onChange={(e) => setNewServer({ 
                    ...newServer, 
                    args: handleParseArgs(e.target.value) 
                  })}
                  className="w-full input-mac"
                  placeholder="/path/to/project --readonly"
                />
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1.5 font-medium">
                  Environment Variables (KEY=value, one per line)
                </label>
                <textarea
                  rows={3}
                  onChange={(e) => setNewServer({ 
                    ...newServer, 
                    env: handleParseEnv(e.target.value) 
                  })}
                  className="w-full input-mac resize-none"
                  placeholder="API_KEY=your-key&#10;DEBUG=true"
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-text-primary">Auto-start on launch</span>
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

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-glass-border">
              <button
                onClick={() => setShowAddModal(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleAddServer}
                disabled={!newServer.name || !newServer.command || loading}
                className="btn-primary flex items-center gap-2"
              >
                {loading ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                <span>Add Server</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Server Modal */}
      {editingServer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-mac-panel/95 border border-glass-border rounded-mac-xl p-5 w-[480px] max-h-[85vh] overflow-y-auto shadow-mac backdrop-blur-xl" role="dialog" aria-modal="true" aria-label="Edit MCP Server">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <Edit2 size={18} className="text-accent" />
                Edit MCP Server
              </h3>
              <button
                onClick={() => setEditingServer(null)}
                className="p-1.5 hover:bg-card-hover rounded-mac transition-colors"
              >
                <X size={18} className="text-text-secondary" />
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
                  className="w-full input-mac"
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
                  className="w-full input-mac"
                />
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1.5 font-medium">
                  Arguments (space-separated)
                </label>
                <input
                  type="text"
                  value={editingServer.args.join(' ')}
                  onChange={(e) => setEditingServer({ 
                    ...editingServer, 
                    args: handleParseArgs(e.target.value) 
                  })}
                  className="w-full input-mac"
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-text-primary">Auto-start on launch</span>
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

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-glass-border">
              <button
                onClick={() => setEditingServer(null)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleEditServer}
                disabled={loading}
                className="btn-primary flex items-center gap-2"
              >
                {loading ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                <span>Save Changes</span>
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
  const [expanded, setExpanded] = useState(false)
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
    if (expanded && server.status === 'connected' && tools.length === 0) {
      loadTools()
    }
  }, [expanded, server.status, tools.length, loadTools])

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
    connected: 'bg-success',
    disconnected: 'bg-text-tertiary',
    error: 'bg-error',
    connecting: 'bg-warning',
  }

  return (
    <div className="p-4 rounded-mac-xl bg-glass border border-glass-border hover:border-accent/50 transition-all duration-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-accent/10 rounded-mac">
            <Server size={16} className="text-accent" />
          </div>
          <div>
            <h4 className="font-medium text-text-primary">{server.name}</h4>
            <p className="text-xs text-text-tertiary font-mono truncate max-w-[200px]">{server.command}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${statusColors[server.status]}`} />
          <span className="text-xs text-text-secondary capitalize">{server.status}</span>
        </div>
      </div>

      {server.args.length > 0 && (
        <div className="mb-3 p-2 bg-glass/50 rounded-mac text-xs font-mono text-text-tertiary truncate">
          {server.args.join(' ')}
        </div>
      )}

      {/* Tools section - expandable when connected */}
      {server.status === 'connected' && (
        <div className="mb-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <Wrench size={12} />
            <span>{loadingTools ? 'Loading tools...' : `${tools.length} tools`}</span>
          </button>

          {expanded && tools.length > 0 && (
            <div className="mt-2 space-y-1.5 ml-5">
              {tools.map((tool) => (
                <div key={tool.name} className="flex items-center justify-between p-2 bg-glass/30 rounded-mac group">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-text-primary truncate">{tool.name}</p>
                    {tool.description && (
                      <p className="text-[10px] text-text-tertiary truncate">{tool.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleCallTool(tool.name)}
                    disabled={callingTool === tool.name}
                    className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-accent/10 rounded-mac transition-all"
                    title={`Call ${tool.name}`}
                  >
                    {callingTool === tool.name ? (
                      <Loader2 size={12} className="animate-spin text-accent" />
                    ) : (
                      <Play size={12} className="text-text-secondary" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}

          {expanded && toolResult && (
            <div className="mt-2 ml-5 p-2 bg-glass/30 rounded-mac">
              <p className="text-[10px] font-medium text-accent mb-1">{toolResult.name} result:</p>
              <pre className="text-[10px] text-text-secondary overflow-x-auto max-h-32 overflow-y-auto">
                {typeof toolResult.result === 'string'
                  ? toolResult.result
                  : JSON.stringify(toolResult.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={onToggle}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-mac text-xs font-medium transition-colors ${
            server.status === 'connected'
              ? 'bg-error/10 text-error hover:bg-error/20'
              : 'bg-success/10 text-success hover:bg-success/20'
          }`}
        >
          <Power size={12} />
          <span>{server.status === 'connected' ? 'Disconnect' : 'Connect'}</span>
        </button>
        <button
          onClick={onEdit}
          className="p-2 bg-glass hover:bg-card-hover rounded-mac text-text-secondary transition-colors"
        >
          <Edit2 size={14} />
        </button>
        <button
          onClick={onDelete}
          className="p-2 bg-glass hover:bg-error/20 rounded-mac text-text-secondary hover:text-error transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

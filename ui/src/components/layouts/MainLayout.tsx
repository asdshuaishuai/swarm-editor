import { useState, useEffect, lazy, Suspense } from 'react'
import { useAppStore } from '../../store/appStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useMonitoringStore } from '../../stores/monitoringStore'
import { useAgentLifecycleStore } from '../../stores/agentLifecycleStore'
import { useTaskFlowStore } from '../../stores/taskFlowStore'
import { useAgentLogStore } from '../../stores/agentLogStore'
import { api } from '../../services'
import { logger } from '../../utils'
import { gitApi } from '../../services/api'
import { workspaceApi } from '../../services/api'
import QueenSandbox from '../QueenSandbox'
import ProtocolMonitor from '../ProtocolMonitor'
import ActivityLog from '../ActivityLog'
import QueenDispatcher from '../QueenDispatcher'
import CLIProcessWorkshop from '../CLIProcessWorkshop'
import DaemonLog from '../DaemonLog'
import AgentCapabilityPanel from '../AgentCapabilityPanel'
import SymbolOutline from '../SymbolOutline'

// Lazy-loaded heavy panels
const ExplorerPanel = lazy(() => import('../../panels/ExplorerPanel'))

// Standalone wrapper for ExplorerPanel that provides real workspace data
function StandaloneExplorer({ gitStatusMap: parentGitStatusMap }: { gitStatusMap: Record<string, import('../../services').GitFileStatus> }) {
  const addToast = useAppStore(state => state.addToast)
  const workspace = useWorkspaceStore(state => state.workspacePath)
  const currentFile = useWorkspaceStore(state => state.currentFile)
  const openFiles = useWorkspaceStore(state => state.openFiles)
  const dirtyFiles = useWorkspaceStore(state => state.dirtyFiles)
  const openFile = useWorkspaceStore(state => state.openFile)
  const closeFile = useWorkspaceStore(state => state.closeFile)
  const renameFileInStore = useWorkspaceStore(state => state.renameFileInStore)
  const loadWorkspace = useWorkspaceStore(state => state.loadWorkspace)

  return (
    <ExplorerPanel
      workspace={workspace || ''}
      currentFile={currentFile}
      gitStatusMap={parentGitStatusMap}
      openFiles={openFiles || []}
      dirtyFiles={dirtyFiles || new Set()}
      onOpenFile={(path, opts) => openFile(path, opts)}
      onCloseFile={(path) => closeFile(path)}
      onToast={(type, title, message) => addToast(type, title, message)}
      onRefreshGitStatus={() => loadWorkspace()}
      onRenameFileInStore={(oldPath, newPath) => renameFileInStore(oldPath, newPath)}
    />
  )
}
const MCPPanel = lazy(() => import('../../panels/MCPPanel'))
const EditorPanel = lazy(() => import('../../panels/EditorPanel'))
const TerminalPanel = lazy(() => import('../../panels/TerminalPanel'))
const ProblemsPanel = lazy(() => import('../../panels/ProblemsPanel'))
const SupervisorPanel = lazy(() => import('../../panels/SupervisorPanel'))

function PanelLoader() {
  return (
    <div className="flex items-center justify-center h-full" style={{ background: '#0d1117' }}>
      <div className="animate-pulse text-xs font-mono" style={{ color: '#71717a' }}>Loading...</div>
    </div>
  )
}

type LeftTab = 'files' | 'mcp' | 'capabilities'
type CenterTab = 'sandbox' | 'editor'
type RightTab = 'command' | 'activity'
type BottomTab = 'cli' | 'terminal' | 'problems' | 'daemon' | 'supervisor'

export default function MainLayout() {
  const [leftTab, setLeftTab] = useState<LeftTab>('files')
  const [centerTab, setCenterTab] = useState<CenterTab>('sandbox')
  const [rightTab, setRightTab] = useState<RightTab>('command')
  const [bottomTab, setBottomTab] = useState<BottomTab>('cli')

  const [leftCollapsed] = useState(false)
  const [rightCollapsed] = useState(false)
  const [selectedNodeLabel, setSelectedNodeLabel] = useState<string | null>(null)
  const [skillCount, setSkillCount] = useState(0)
  const [currentBranch, setCurrentBranch] = useState('main')
  const [gitStatusMap, setGitStatusMap] = useState<Record<string, import('../../services').GitFileStatus>>({})
  const zenMode = useAppStore(state => state.zenMode)
  const addToast = useAppStore(state => state.addToast)
  const agents = useAppStore(state => state.agents)
  const activeAgentCount = agents?.length ?? 0

  useEffect(() => {
    api.agent.scanSkills().then(skills => setSkillCount(skills.length)).catch(() => logger.debug('MainLayout', 'Failed to scan skills'))
  }, [])

  // Refresh git status when workspace changes
  const workspace = useWorkspaceStore(state => state.workspacePath)
  useEffect(() => {
    if (!workspace) return
    gitApi.getBranch().then(b => setCurrentBranch(b || 'main')).catch(() => logger.debug('MainLayout', 'Failed to get git branch'))
    gitApi.getStatus().then(status => {
      const map: Record<string, import('../../services').GitFileStatus> = {}
      for (const f of status) { map[f.path] = f }
      setGitStatusMap(map)
    }).catch(() => logger.debug('MainLayout', 'Failed to get git status'))
  }, [workspace])

  // Listen for sandbox:node-selected custom events from QueenSandbox and CLIProcessWorkshop
  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<{ agentId: string; agentName: string }>
      const { agentId, agentName } = customEvent.detail
      setSelectedNodeLabel(`${agentName} (${agentId})`)
    }
    window.addEventListener('sandbox:node-selected', handler)
    return () => window.removeEventListener('sandbox:node-selected', handler)
  }, [])

  // Initialize and subscribe to monitoring stores on mount
  useEffect(() => {
    useMonitoringStore.getState().initialLoad()
    const unsubMonitoring = useMonitoringStore.getState().subscribeToEvents()
    const unsubLifecycle = useAgentLifecycleStore.getState().subscribe()
    const unsubTaskFlow = useTaskFlowStore.getState().subscribe()
    const unsubAgentLog = useAgentLogStore.getState().subscribe()
    return () => {
      unsubMonitoring()
      unsubLifecycle()
      unsubTaskFlow()
      unsubAgentLog()
    }
  }, [])

  const tabBtn = (active: boolean) =>
    `flex-1 py-2 flex items-center justify-center gap-1.5 text-[11px] font-semibold transition-all ${
      active
        ? 'text-white border-t-2 border-t-[#58a6ff] bg-[#161b22] border-r border-[#30363d]'
        : 'text-gray-400 hover:text-white'
    }`

  const handleOpenFolder = async () => {
    try {
      const folderPath = await workspaceApi.openFolderDialog()
      if (folderPath) {
        const { setWorkspacePath, refreshFileTree } = useWorkspaceStore.getState()
        setWorkspacePath(folderPath)
        await refreshFileTree()
      }
    } catch (err) {
      logger.error('Failed to open folder dialog:', err)
    }
  }

  const rightTabBtn = (active: boolean) =>
    `flex-1 py-2.5 flex items-center justify-center gap-1 text-[11px] font-semibold transition-all ${
      active
        ? 'text-white border-t-2 border-t-[#58a6ff] bg-[#161b22] border-r border-[#30363d]'
        : 'text-gray-400 hover:text-white'
    }`

  return (
    <div className="flex flex-col h-screen" style={{ background: '#0d1117', color: '#ffffff' }}>
      {/* Title Bar (h-10) */}
      {!zenMode && (
        <div
          className="h-10 flex items-center justify-between px-3 text-xs shrink-0 z-50"
          style={{ background: '#161b22', borderBottom: '1px solid #30363d' }}
        >
          {/* Left: App icon + menus */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 font-bold" style={{ color: '#58a6ff' }}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6.5 2l4.5 2.6v5.2L6.5 12.4 2 9.8V4.6L6.5 2zm11 0l4.5 2.6v5.2l-4.5 2.6-4.5-2.6V4.6L17.5 2zM6.5 13.6l4.5 2.6v5.2L6.5 24 2 21.4v-5.2l4.5-2.6zm11 0l4.5 2.6v5.2l-4.5 2.6-4.5-2.6v-5.2l4.5-2.6z" />
              </svg>
              <span>Swarm Editor</span>
              <span className="text-[9px] px-1 py-0.2 rounded font-normal font-sans" style={{ background: 'rgba(30,58,138,0.4)', color: '#93c5fd', border: '1px solid rgba(30,58,138,0.5)' }}>ACP/A2A ENGINE v2.5</span>
            </div>
            <nav className="hidden md:flex items-center gap-3 text-gray-400">
              <span className="hover:text-white cursor-pointer transition" onClick={handleOpenFolder} title="Open Folder">文件 (File)</span>
              <span className="hover:text-white cursor-pointer transition">工作区 (Workspace)</span>
              <span className="hover:text-white cursor-pointer transition" onClick={() => setCenterTab('sandbox')}>蜂群架构 (Swarm Engine)</span>
              <span className="hover:text-white cursor-pointer transition" onClick={() => setLeftTab('mcp')}>MCP 服务器 (MCP Servers)</span>
            </nav>
          </div>

          {/* Center: daemon status line */}
          <div className="text-gray-500 font-mono text-[10px] hidden sm:block">
            QUEEN AGENT DEPLOYED // ACTIVE DAEMONS: {activeAgentCount > 0 ? agents!.map(a => a.name).join(', ') : 'standby'}
          </div>

          {/* Right: indicators */}
          <div className="flex items-center gap-3 text-gray-400 text-sm">
            <span title="Daemon system is active" style={{ color: '#10b981' }}>
              <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                <path d="M2 11.5h4l2-4 3 8 2-4h4l2-3 3 6h.5" stroke="rgba(0,0,0,0.3)" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <button
              onClick={() => gitApi.pull().then(() => addToast('success', 'Git 同步', 'Pull 成功')).catch((err: Error) => addToast('error', 'Git 同步失败', err.message))}
              className="hover:text-white transition"
              title="Git 同步"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 104 0 2 2 0 00-4 0zm0 14a2 2 0 104 0 2 2 0 00-4 0zm14-14a2 2 0 104 0 2 2 0 00-4 0M7 5v10m0 4l10-8" />
              </svg>
            </button>
            <button
              onClick={() => window.location.hash = '/settings'}
              className="hover:text-white transition"
              title="设置"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ===== Main Area (flex-1) ===== */}
      <div className="flex flex-1 overflow-hidden">
        {/* ===== Left Sidebar (w-80) ===== */}
        {!zenMode && !leftCollapsed && (
          <div
            className="w-80 shrink-0 flex flex-col overflow-hidden select-none"
            style={{ background: '#161b22', borderRight: '1px solid #30363d' }}
          >
            {/* Left Tab Header */}
            <div className="flex bg-[#0f141a] shrink-0" style={{ borderBottom: '1px solid #30363d' }}>
              <button className={tabBtn(leftTab === 'files')} onClick={() => setLeftTab('files')}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={leftTab === 'files' ? { color: '#58a6ff' } : undefined}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                </svg>
                项目文件 & Git
              </button>
              <button className={tabBtn(leftTab === 'mcp')} onClick={() => setLeftTab('mcp')}>
                <svg className="w-3.5 h-3.5 animate-pulse" style={{ color: '#c084fc' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 22V14M8 6V2M16 6V2M6 6H18V10C18 13.3 15.3 16 12 16C8.7 16 6 13.3 6 10V6Z" />
                </svg>
                MCP 与技能 (Skills)
                {skillCount > 0 && (
                  <span className="text-[9px] px-1 rounded font-normal" style={{ background: 'rgba(88,28,135,0.5)', color: '#d8b4fe', border: '1px solid rgba(107,33,168,0.6)' }}>{skillCount}</span>
                )}
              </button>
              <button className={tabBtn(leftTab === 'capabilities')} onClick={() => setLeftTab('capabilities')}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={leftTab === 'capabilities' ? { color: '#58a6ff' } : undefined}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Agent 能力
              </button>
            </div>
            {/* Left Tab Content */}
            <div className="flex-1 overflow-hidden flex flex-col">
              <Suspense fallback={<PanelLoader />}>
                {leftTab === 'files' && (
                  <>
                    <div className="flex-1 overflow-hidden min-h-0">
                      <StandaloneExplorer gitStatusMap={gitStatusMap} />
                    </div>
                    <div
                      className="shrink-0 overflow-hidden"
                      style={{ maxHeight: '40%', borderTop: '1px solid #30363d' }}
                    >
                      <SymbolOutline />
                    </div>
                  </>
                )}
                {leftTab === 'mcp' && <MCPPanel />}
                {leftTab === 'capabilities' && <AgentCapabilityPanel />}
              </Suspense>
            </div>
          </div>
        )}

        {/* Center (flex-1) */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
          {/* Center Tab Header */}
          <div className="flex items-center justify-between shrink-0 select-none z-10" style={{ background: '#161b22', borderBottom: '1px solid #30363d' }}>
            <div className="flex">
              <button
                className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 transition border-r ${
                  centerTab === 'sandbox'
                    ? 'text-white border-t-2 border-t-[#58a6ff] bg-[#0d1117]'
                    : 'text-gray-400 hover:text-white border-t-2 border-t-transparent'
                }`}
                style={{ borderRightColor: '#30363d' }}
                onClick={() => setCenterTab('sandbox')}
              >
                <svg className="w-3.5 h-3.5" style={{ color: '#58a6ff' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h5v5H3zM16 3h5v5h-5zM9 5.5h4M13.5 5.5h2.5M16.5 8v3.5M16.5 11.5L12 16M12 16L8 20M8 20h5M8 20v-5" />
                </svg>
                蜂王自动调度沙盘 (Queen Orchestration Sandbox)
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              </button>
              <button
                className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 transition border-r ${
                  centerTab === 'editor'
                    ? 'text-white border-t-2 border-t-[#58a6ff] bg-[#0d1117]'
                    : 'text-gray-400 hover:text-white border-t-2 border-t-transparent'
                }`}
                style={{ borderRightColor: '#30363d' }}
                onClick={() => setCenterTab('editor')}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                代码编辑器 & Diff (Monaco Editor)
                <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.2 rounded font-mono">MainLayout.tsx</span>
              </button>
            </div>
            <div className="flex items-center gap-3 px-3">
              <button className="p-1 text-gray-400 hover:text-emerald-400 transition" title="重置调度流">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <span className="text-[9px] text-gray-500 font-mono tracking-wider">FLOW STATUS: ONLINE</span>
            </div>
          </div>
          {/* Center Tab Content */}
          <div className="flex-1 overflow-hidden">
            {centerTab === 'sandbox' ? (
              <QueenSandbox onNodeSelect={(id, name) => setSelectedNodeLabel(`${name} (${id})`)} />
            ) : (
              <Suspense fallback={<PanelLoader />}>
                <EditorPanel embedded />
              </Suspense>
            )}
          </div>
        </div>

        {/* ===== Right Sidebar (w-80) ===== */}
        {!zenMode && !rightCollapsed && (
          <div
            className="w-80 shrink-0 flex flex-col overflow-hidden relative"
            style={{ background: '#161b22', borderLeft: '1px solid #30363d' }}
          >
            {/* Right Tab Header */}
            <div className="flex bg-[#0f141a] shrink-0" style={{ borderBottom: '1px solid #30363d' }}>
              <button className={rightTabBtn(rightTab === 'command')} onClick={() => setRightTab('command')}>
                <svg className="w-3.5 h-3.5" style={{ color: '#f59e0b' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                指令交互
              </button>
              <button className={rightTabBtn(rightTab === 'activity')} onClick={() => setRightTab('activity')}>
                <svg className="w-3.5 h-3.5" style={{ color: '#22d3ee' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                活动日志
              </button>
            </div>
            {/* Right Tab Content */}
            <div className="flex-1 overflow-hidden">
              {rightTab === 'command' ? <ProtocolMonitor contextLabel={selectedNodeLabel} mode="command" /> : <ActivityLog />}
            </div>
            {/* Queen Dispatcher - 固定底部 */}
            <QueenDispatcher />
          </div>
        )}
      </div>

      {/* ===== Bottom Panel (h-64) ===== */}
      {!zenMode && (
        <div
          className="h-64 shrink-0 flex flex-col overflow-hidden select-none"
          style={{
            background: '#161b22',
            borderTop: '1px solid #30363d',
          }}
        >
          {/* Bottom Tab Header */}
          <div className="flex items-center justify-between shrink-0" style={{ background: '#161b22', borderBottom: '1px solid #30363d' }}>
            <div className="flex">
              <button
                className={`px-4 py-2 text-xs font-semibold flex items-center ${bottomTab === 'cli' ? 'gap-2' : 'gap-1.5'} transition ${
                  bottomTab === 'cli' ? 'text-white border-t-2 border-t-[#58a6ff] bg-[#0d1117]' : 'text-gray-400 hover:text-white border-t-2 border-t-transparent'
                }`}
                style={{ borderRight: '1px solid #30363d' }}
                onClick={() => setBottomTab('cli')}
              >
                <svg className="w-3.5 h-3.5" style={{ color: '#58a6ff' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3V5M15 3V5M9 19V21M15 19V21M5 9H3M5 15H3M21 9H19M21 15H19M7 19H17C18.1 19 19 18.1 19 17V7C19 5.9 18.1 5 17 5H7C5.9 5 5 5.9 5 7V17C5 18.1 5.9 19 7 19ZM9 9H15V15H9V9Z" />
                </svg>
                🛠️ 本地 CLI 进程工坊 (Local CLI Tools)
                <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-normal" style={{ background: '#172554', color: '#93c5fd', border: '1px solid #1e3a8a' }}>Active进程: {activeAgentCount}</span>
              </button>
              <button
                className={`px-4 py-2 text-xs font-semibold flex items-center ${bottomTab === 'terminal' ? 'gap-2' : 'gap-1.5'} transition ${
                  bottomTab === 'terminal' ? 'text-white border-t-2 border-t-[#58a6ff] bg-[#0d1117]' : 'text-gray-400 hover:text-white border-t-2 border-t-transparent'
                }`}
                style={{ borderRight: '1px solid #30363d' }}
                onClick={() => setBottomTab('terminal')}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                💻 交互终端 (System Bash)
              </button>
              <button
                className={`px-4 py-2 text-xs font-semibold flex items-center ${bottomTab === 'problems' ? 'gap-2' : 'gap-1.5'} transition ${
                  bottomTab === 'problems' ? 'text-white border-t-2 border-t-[#58a6ff] bg-[#0d1117]' : 'text-gray-400 hover:text-white border-t-2 border-t-transparent'
                }`}
                style={{ borderRight: '1px solid #30363d' }}
                onClick={() => setBottomTab('problems')}
              >
                <svg className="w-3.5 h-3.5" style={{ color: '#eab308' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4M12 17h.01M21 12a9 9 0 1 1 -18 0 9 9 0 0 1 18 0z" />
                </svg>
                📋 检查诊断 (Linter)
                <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: 'rgba(69,10,10,0.5)', color: '#f87171', border: '1px solid rgba(127,29,29,1)' }}>0</span>
              </button>
              <button
                className={`px-4 py-2 text-xs font-semibold flex items-center ${bottomTab === 'daemon' ? 'gap-2' : 'gap-1.5'} transition ${
                  bottomTab === 'daemon' ? 'text-white border-t-2 border-t-[#58a6ff] bg-[#0d1117]' : 'text-gray-400 hover:text-white border-t-2 border-t-transparent'
                }`}
                style={{ borderRight: '1px solid #30363d' }}
                onClick={() => setBottomTab('daemon')}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                📡 守护进程审计 (Daemon Log)
              </button>
              <button
                className={`px-4 py-2 text-xs font-semibold flex items-center ${bottomTab === 'supervisor' ? 'gap-2' : 'gap-1.5'} transition ${
                  bottomTab === 'supervisor' ? 'text-white border-t-2 border-t-[#58a6ff] bg-[#0d1117]' : 'text-gray-400 hover:text-white border-t-2 border-t-transparent'
                }`}
                style={{ borderRight: '1px solid #30363d' }}
                onClick={() => setBottomTab('supervisor')}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                🛡️ 监督面板 (Supervisor)
              </button>
            </div>
            {/* Protocol label */}
            <div className="px-3 text-gray-500 text-[10px] font-mono">
              <span className="hidden sm:inline">DAEMON PROTOCOL: ACP_V1_BRIDGE</span>
            </div>
          </div>
          {/* Bottom Tab Content */}
          <div className="flex-1 overflow-hidden">
              {bottomTab === 'cli' && <CLIProcessWorkshop />}
              {bottomTab === 'terminal' && (
                <Suspense fallback={<PanelLoader />}>
                  <TerminalPanel />
                </Suspense>
              )}
              {bottomTab === 'problems' && (
                <Suspense fallback={<PanelLoader />}>
                  <ProblemsPanel problems={[]} />
                </Suspense>
              )}
              {bottomTab === 'daemon' && <DaemonLog />}
              {bottomTab === 'supervisor' && (
                <Suspense fallback={<PanelLoader />}>
                  <SupervisorPanel />
                </Suspense>
              )}
            </div>
        </div>
      )}

      {/* ===== Status Bar (h-6) ===== */}
      {!zenMode && (
        <div
          className="h-6 flex items-center justify-between px-3 text-[10px] font-mono shrink-0 select-none"
          style={{ background: '#161b22', borderTop: '1px solid #30363d', color: '#6b7280' }}
        >
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1" style={{ color: '#10b981' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              daemon 守护进程已就绪
            </span>
            <span>|</span>
            <span>蜂王 MCP Schema: <strong style={{ color: '#9ca3af' }}>{skillCount} 实体能力运作中</strong></span>
          </div>
          <div className="flex items-center gap-4">
            <span>UTF-8</span>
            <span>作用中 Worktree 分支: {currentBranch}</span>
          </div>
        </div>
      )}
    </div>
  )
}

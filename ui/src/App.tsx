import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import { useAppStore } from './store/appStore'
import { useACPEvents, useTheme } from './hooks'
import MainLayout from './components/layouts/MainLayout'
import { ToastContainer } from './components/Toast'
import { PermissionDialog, PermissionQueueIndicator } from './components/PermissionDialog'
import { CommandPalette } from './components/CommandPalette'
import { SearchPanel } from './components/SearchPanel'
import { HandoffDialog, useHandoffStore } from './components/HandoffDialog'
import { ErrorBoundary } from './components/ErrorBoundary'
import StatusBar from './components/StatusBar'
import { TabSwitcher } from './components/TabSwitcher'

// 懒加载页面组件 - 减少初始 bundle
const EditorPage = lazy(() => import('./panels/EditorPanel'))
const SwarmPage = lazy(() => import('./panels/SwarmPanel'))
const TeamPage = lazy(() => import('./panels/TeamPanel'))
const SettingsPage = lazy(() => import('./panels/SettingsPanel'))
const WorkflowPage = lazy(() => import('./panels/WorkflowPanel'))
const AgentCollaborationPage = lazy(() => import('./panels/AgentCollaborationPanel').then(m => ({ default: m.AgentCollaborationPanel })))

// 加载指示器
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full" style={{ background: 'var(--bg-base)' }}>
      <div className="animate-pulse" style={{ color: 'var(--text-muted)' }}>Loading...</div>
    </div>
  )
}

function App() {
  const initialize = useAppStore(state => state.initialize)
  const toasts = useAppStore(state => state.toasts)
  const removeToast = useAppStore(state => state.removeToast)
  const { activeHandoff, resolveHandoff } = useHandoffStore()
  const [showSearchPanel, setShowSearchPanel] = useState(false)
  const [searchFolder, setSearchFolder] = useState<string | undefined>(undefined)
  const [openInReplaceMode, setOpenInReplaceMode] = useState(false)

  // Subscribe to WebSocket backend events
  useACPEvents()

  useEffect(() => {
    initialize()
  }, [initialize])

  // Global keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ctrl+Shift+F: Search in files
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'F') {
      e.preventDefault()
      setShowSearchPanel(prev => !prev)
    }
    // Ctrl+Shift+H: Replace in files (VS Code standard — opens in replace mode)
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'H') {
      e.preventDefault()
      setOpenInReplaceMode(true)
      setShowSearchPanel(true)
    }
    // R5132: Ctrl+Shift+T handled by TabSwitcher (capture phase) — removed dead handler here
    // Ctrl+Shift+N: Removed — conflicts with browser's New Incognito Window
    // Ctrl+Shift+E: Focus file explorer (VS Code standard)
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'E') {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent('focus-file-tree'))
    }
    // Ctrl+G: Go to line (VS Code standard - standalone, not via palette)
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'g') {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent('open-goto-line'))
    }
    // Ctrl+\: Split editor
    if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent('toggle-split'))
    }
    // Ctrl+`: Toggle terminal (VS Code standard)
    if ((e.metaKey || e.ctrlKey) && e.key === '`') {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent('toggle-terminal'))
    }
    // Ctrl+B: Toggle sidebar (VS Code standard)
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent('toggle-sidebar'))
    }
    // Ctrl+Shift+G: Toggle source control (VS Code standard)
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'G') {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent('toggle-source-control'))
    }
    // Ctrl+Shift+M: Show Problems panel (VS Code standard)
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'M') {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent('show-problems'))
    }
    // R5132: Ctrl+W handled by TabSwitcher (capture phase) — removed dead handler here
    // R5132: Ctrl+Tab/Ctrl+Shift+Tab handled by TabSwitcher (capture phase) — removed dead handlers here
    // Alt+Z: Toggle Word Wrap (VS Code standard)
    if (e.altKey && e.key === 'z') {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent('toggle-editor-setting', { detail: { setting: 'wordWrap' } }))
    }
    // Ctrl+J: Toggle Bottom Panel (VS Code standard — was incorrectly bound to joinLines)
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'j') {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent('toggle-bottom-panel'))
    }
    // Ctrl+=/Ctrl+-: Editor Zoom (VS Code standard)
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === '=' || e.key === '+')) {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent('adjust-font-size', { detail: { delta: 1 } }))
    }
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === '-' || e.key === '_')) {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent('adjust-font-size', { detail: { delta: -1 } }))
    }
    // Ctrl+0: Reset font size (VS Code standard — works from any focus, not just editor)
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === '0') {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent('adjust-font-size', { detail: { reset: true } }))
    }
    // Ctrl+,: Open Settings (VS Code standard)
    if ((e.metaKey || e.ctrlKey) && e.key === ',') {
      e.preventDefault()
      window.location.hash = '/settings'
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // R5193: Custom event listener for CommandPalette to open search panel (supports replaceMode)
  useEffect(() => {
    const handleOpenSearchPanel = ((e: CustomEvent) => {
      setSearchFolder(undefined)
      setShowSearchPanel(true)
      if (e.detail?.replaceMode) {
        setOpenInReplaceMode(true)
      }
    }) as EventListener
    window.addEventListener('open-search-panel', handleOpenSearchPanel)
    return () => window.removeEventListener('open-search-panel', handleOpenSearchPanel)
  }, [])

  // Custom event listener for "Find in Folder" from file tree context menu
  useEffect(() => {
    const handleSearchInFolder = ((e: CustomEvent) => {
      setSearchFolder(e.detail.folder)
      setShowSearchPanel(true)
    }) as EventListener
    window.addEventListener('search-in-folder', handleSearchInFolder)
    return () => window.removeEventListener('search-in-folder', handleSearchInFolder)
  }, [])

  // R5164: Zen Mode - Toggle distraction-free editing (handled via event, MainLayout reads zenMode directly)
  const toggleZenMode = useAppStore(state => state.toggleZenMode)
  useEffect(() => {
    const handleToggleZenMode = () => toggleZenMode()
    window.addEventListener('toggle-zen-mode', handleToggleZenMode)
    return () => window.removeEventListener('toggle-zen-mode', handleToggleZenMode)
  }, [toggleZenMode])

  // R5167: Theme toggle - VS Code pattern
  const { toggleTheme } = useTheme()
  useEffect(() => {
    const handleToggleTheme = () => toggleTheme()
    window.addEventListener('toggle-theme', handleToggleTheme)
    return () => window.removeEventListener('toggle-theme', handleToggleTheme)
  }, [toggleTheme])

  return (
    <>
      <ErrorBoundary>
        <MainLayout>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<ErrorBoundary><AgentCollaborationPage /></ErrorBoundary>} />
              <Route path="/editor" element={<ErrorBoundary><EditorPage /></ErrorBoundary>} />
              <Route path="/swarm" element={<ErrorBoundary><SwarmPage /></ErrorBoundary>} />
              <Route path="/team" element={<ErrorBoundary><TeamPage /></ErrorBoundary>} />
              <Route path="/workflow" element={<ErrorBoundary><WorkflowPage /></ErrorBoundary>} />
              <Route path="/settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </MainLayout>
      </ErrorBoundary>
      <ToastContainer toasts={toasts} onDismiss={removeToast} position="bottom-right" />
      <PermissionDialog />
      <PermissionQueueIndicator />
      <CommandPalette />
      <SearchPanel isOpen={showSearchPanel} onClose={() => { setShowSearchPanel(false); setSearchFolder(undefined); setOpenInReplaceMode(false) }} initialFolder={searchFolder} initialReplace={openInReplaceMode} />
      <StatusBar />
      <TabSwitcher />

      {/* Handoff Dialog - shown when there's an active handoff request */}
      {activeHandoff && activeHandoff.status === 'pending' && (
        <HandoffDialog
          request={activeHandoff}
          onAccept={(_id, summary) => resolveHandoff(true, summary)}
          onReject={() => resolveHandoff(false)}
          onClose={() => useHandoffStore.getState().clearActiveHandoff()}
        />
      )}
    </>
  )
}

export default App
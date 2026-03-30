import { Routes, Route } from 'react-router-dom'
import { useEffect } from 'react'
import { useAppStore } from './store/appStore'
import { useACPEvents } from './hooks'
import MainLayout from './components/layouts/MainLayout'
import EditorPage from './panels/EditorPanel'
import SwarmPage from './panels/SwarmPanel'
import TeamPage from './panels/TeamPanel'
import SettingsPage from './panels/SettingsPanel'
import WorkflowPage from './panels/WorkflowPanel'
import { ToastContainer } from './components/Toast'
import { PermissionDialog, PermissionQueueIndicator } from './components/PermissionDialog'
import { CommandPalette } from './components/CommandPalette'
import { HandoffDialog, useHandoffStore } from './components/HandoffDialog'
import { ErrorBoundary } from './components/ErrorBoundary'

function App() {
  const initialize = useAppStore(state => state.initialize)
  const toasts = useAppStore(state => state.toasts)
  const removeToast = useAppStore(state => state.removeToast)
  const { activeHandoff, resolveHandoff } = useHandoffStore()

  // Subscribe to WebSocket backend events
  useACPEvents()

  useEffect(() => {
    initialize()
  }, [initialize])

  return (
    <>
      <ErrorBoundary>
        <MainLayout>
          <Routes>
            <Route path="/" element={<EditorPage />} />
            <Route path="/swarm" element={<SwarmPage />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/workflow" element={<WorkflowPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </MainLayout>
      </ErrorBoundary>
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
      <PermissionDialog />
      <PermissionQueueIndicator />
      <CommandPalette />

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
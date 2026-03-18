import { Routes, Route } from 'react-router-dom'
import { useEffect } from 'react'
import { useAppStore } from './store/appStore'
import { useTauriEvents } from './hooks'
import MainLayout from './components/layouts/MainLayout'
import EditorPage from './panels/EditorPanel'
import SwarmPage from './panels/SwarmPanel'
import TeamPage from './panels/TeamPanel'
import SettingsPage from './panels/SettingsPanel'
import { ToastContainer } from './components/Toast'

function App() {
  const { initialize, toasts, removeToast } = useAppStore()

  // Subscribe to Tauri backend events
  useTauriEvents()

  useEffect(() => {
    initialize()
  }, [initialize])

  return (
    <>
      <MainLayout>
        <Routes>
          <Route path="/" element={<EditorPage />} />
          <Route path="/swarm" element={<SwarmPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </MainLayout>
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </>
  )
}

export default App
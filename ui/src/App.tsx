import { Routes, Route } from 'react-router-dom'
import { useEffect } from 'react'
import { useAppStore } from './store/appStore'
import { useTauriEvents } from './hooks'
import MainLayout from './components/layouts/MainLayout'
import EditorPage from './panels/EditorPanel'
import SwarmPage from './panels/SwarmPanel'
import TeamPage from './panels/TeamPanel'
import SettingsPage from './panels/SettingsPanel'

function App() {
  const { initialize } = useAppStore()

  // Subscribe to Tauri backend events
  useTauriEvents()

  useEffect(() => {
    initialize()
  }, [initialize])

  return (
    <MainLayout>
      <Routes>
        <Route path="/" element={<EditorPage />} />
        <Route path="/swarm" element={<SwarmPage />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </MainLayout>
  )
}

export default App
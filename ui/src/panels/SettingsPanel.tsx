import { useState } from 'react'
import {
  Settings as SettingsIcon,
  Palette,
  Key,
  Globe,
  Bell,
  Shield,
  Info,
} from 'lucide-react'

const settingsSections = [
  { id: 'general', label: 'General', icon: SettingsIcon },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'api', label: 'API Keys', icon: Key },
  { id: 'network', label: 'Network', icon: Globe },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'about', label: 'About', icon: Info },
]

export default function SettingsPanel() {
  const [activeSection, setActiveSection] = useState('general')
  const [settings, setSettings] = useState({
    theme: 'dark',
    fontSize: 14,
    fontFamily: 'JetBrains Mono',
    tabSize: 2,
    autoSave: true,
    autoSaveDelay: 1000,
    minimap: true,
    lineNumbers: true,
    wordWrap: true,
    notifications: true,
    sounds: false,
    apiKey: '',
    apiEndpoint: 'https://api.anthropic.com',
  })

  const handleSettingChange = (key: string, value: unknown) => {
    setSettings({ ...settings, [key]: value })
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-48 bg-panel-bg border-r border-panel-border">
        <div className="p-4 border-b border-panel-border">
          <div className="flex items-center space-x-2">
            <SettingsIcon size={18} className="text-accent" />
            <h2 className="text-lg font-semibold">Settings</h2>
          </div>
        </div>
        <nav className="p-2">
          {settingsSections.map((section) => {
            const Icon = section.icon
            const isActive = activeSection === section.id
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`flex items-center w-full px-3 py-2 text-left text-sm rounded transition-colors ${
                  isActive
                    ? 'bg-accent/20 text-accent'
                    : 'text-text-secondary hover:bg-panel-border hover:text-text-primary'
                }`}
              >
                <Icon size={16} className="mr-2" />
                {section.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeSection === 'general' && (
          <SettingsSection title="General Settings">
            <SettingRow label="Theme">
              <select
                value={settings.theme}
                onChange={(e) => handleSettingChange('theme', e.target.value)}
                className="bg-editor-bg border border-panel-border rounded px-3 py-2 text-sm"
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="system">System</option>
              </select>
            </SettingRow>

            <SettingRow label="Auto Save">
              <Toggle
                checked={settings.autoSave}
                onChange={(v) => handleSettingChange('autoSave', v)}
              />
            </SettingRow>

            <SettingRow label="Auto Save Delay (ms)">
              <input
                type="number"
                value={settings.autoSaveDelay}
                onChange={(e) =>
                  handleSettingChange('autoSaveDelay', parseInt(e.target.value))
                }
                className="w-32 bg-editor-bg border border-panel-border rounded px-3 py-2 text-sm"
              />
            </SettingRow>
          </SettingsSection>
        )}

        {activeSection === 'appearance' && (
          <SettingsSection title="Appearance">
            <SettingRow label="Font Size">
              <input
                type="number"
                value={settings.fontSize}
                onChange={(e) =>
                  handleSettingChange('fontSize', parseInt(e.target.value))
                }
                className="w-20 bg-editor-bg border border-panel-border rounded px-3 py-2 text-sm"
              />
            </SettingRow>

            <SettingRow label="Font Family">
              <select
                value={settings.fontFamily}
                onChange={(e) => handleSettingChange('fontFamily', e.target.value)}
                className="bg-editor-bg border border-panel-border rounded px-3 py-2 text-sm"
              >
                <option value="JetBrains Mono">JetBrains Mono</option>
                <option value="Fira Code">Fira Code</option>
                <option value="Source Code Pro">Source Code Pro</option>
                <option value="Menlo">Menlo</option>
                <option value="Monaco">Monaco</option>
              </select>
            </SettingRow>

            <SettingRow label="Tab Size">
              <select
                value={settings.tabSize}
                onChange={(e) =>
                  handleSettingChange('tabSize', parseInt(e.target.value))
                }
                className="bg-editor-bg border border-panel-border rounded px-3 py-2 text-sm"
              >
                <option value={2}>2 spaces</option>
                <option value={4}>4 spaces</option>
                <option value={8}>8 spaces</option>
              </select>
            </SettingRow>

            <SettingRow label="Show Minimap">
              <Toggle
                checked={settings.minimap}
                onChange={(v) => handleSettingChange('minimap', v)}
              />
            </SettingRow>

            <SettingRow label="Line Numbers">
              <Toggle
                checked={settings.lineNumbers}
                onChange={(v) => handleSettingChange('lineNumbers', v)}
              />
            </SettingRow>

            <SettingRow label="Word Wrap">
              <Toggle
                checked={settings.wordWrap}
                onChange={(v) => handleSettingChange('wordWrap', v)}
              />
            </SettingRow>
          </SettingsSection>
        )}

        {activeSection === 'api' && (
          <SettingsSection title="API Configuration">
            <SettingRow label="API Endpoint">
              <input
                type="text"
                value={settings.apiEndpoint}
                onChange={(e) =>
                  handleSettingChange('apiEndpoint', e.target.value)
                }
                className="w-80 bg-editor-bg border border-panel-border rounded px-3 py-2 text-sm"
              />
            </SettingRow>

            <SettingRow label="API Key">
              <input
                type="password"
                value={settings.apiKey}
                onChange={(e) => handleSettingChange('apiKey', e.target.value)}
                placeholder="Enter your API key"
                className="w-80 bg-editor-bg border border-panel-border rounded px-3 py-2 text-sm"
              />
            </SettingRow>

            <div className="mt-4 p-3 bg-editor-bg border border-panel-border rounded text-sm text-text-secondary">
              <p>Your API key is stored locally and never sent to our servers.</p>
            </div>
          </SettingsSection>
        )}

        {activeSection === 'notifications' && (
          <SettingsSection title="Notifications">
            <SettingRow label="Enable Notifications">
              <Toggle
                checked={settings.notifications}
                onChange={(v) => handleSettingChange('notifications', v)}
              />
            </SettingRow>

            <SettingRow label="Sound Effects">
              <Toggle
                checked={settings.sounds}
                onChange={(v) => handleSettingChange('sounds', v)}
              />
            </SettingRow>
          </SettingsSection>
        )}

        {activeSection === 'about' && (
          <SettingsSection title="About Swarm Editor">
            <div className="space-y-4">
              <div className="text-center py-8">
                <div className="text-4xl mb-2">🐝</div>
                <h3 className="text-xl font-semibold">Swarm Editor</h3>
                <p className="text-text-secondary">Version 0.1.0</p>
              </div>

              <div className="bg-editor-bg border border-panel-border rounded p-4 text-sm text-text-secondary">
                <p className="mb-2">
                  A multi-agent collaborative development environment with support
                  for ACP protocol, pair programming, and swarm orchestration.
                </p>
                <p>
                  Built with Go, React, TypeScript, and Tauri.
                </p>
              </div>

              <div className="text-center text-sm text-text-secondary">
                <p>Licensed under MIT</p>
                <p className="mt-2">
                  <a
                    href="https://github.com/swarm-editor/swarm-editor"
                    className="text-accent hover:text-accent-hover"
                  >
                    GitHub Repository
                  </a>
                </p>
              </div>
            </div>
          </SettingsSection>
        )}

        {activeSection === 'network' && (
          <SettingsSection title="Network Settings">
            <div className="text-sm text-text-secondary">
              Network configuration options will be available here.
            </div>
          </SettingsSection>
        )}

        {activeSection === 'security' && (
          <SettingsSection title="Security Settings">
            <div className="text-sm text-text-secondary">
              Security configuration options will be available here.
            </div>
          </SettingsSection>
        )}
      </div>
    </div>
  )
}

function SettingsSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-6">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function SettingRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <label className="text-sm">{label}</label>
      {children}
    </div>
  )
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors ${
        checked ? 'bg-accent' : 'bg-panel-border'
      }`}
    >
      <div
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
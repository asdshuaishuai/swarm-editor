import { useState } from 'react'
import {
  Settings as SettingsIcon,
  Palette,
  Key,
  Globe,
  Bell,
  Shield,
  Info,
  RotateCcw,
  Plug,
  Network,
  Users,
} from 'lucide-react'
import { useSettings } from '../hooks/useSettings'
import { useTheme } from '../hooks/useTheme'

const settingsSections = [
  { id: 'general', label: 'General', icon: SettingsIcon },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'api', label: 'API Keys', icon: Key },
  { id: 'mcp', label: 'MCP Plugins', icon: Plug },
  { id: 'swarm', label: 'Swarm', icon: Network },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'network', label: 'Network', icon: Globe },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'about', label: 'About', icon: Info },
]

export default function SettingsPanel() {
  const [activeSection, setActiveSection] = useState('general')
  const { settings, updateSetting, resetSettings, isLoading, syncError } = useSettings()
  const { setTheme } = useTheme()

  const handleThemeChange = (theme: 'dark' | 'light' | 'system') => {
    updateSetting('theme', theme)
    setTheme(theme)
  }

  const handleResetSettings = () => {
    resetSettings()
    setTheme('dark')
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-52 bg-mac-panel/50 border-r border-glass-border">
        <div className="p-4 border-b border-glass-border">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-accent/10 rounded-mac">
              <SettingsIcon size={18} className="text-accent" />
            </div>
            <h2 className="text-lg font-semibold text-text-primary">Settings</h2>
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
                className={`w-full flex items-center px-3 py-2.5 my-0.5 text-left text-sm rounded-mac transition-all duration-200 ${
                  isActive
                    ? 'bg-accent-muted text-accent'
                    : 'text-text-secondary hover:bg-card-hover hover:text-text-primary'
                }`}
              >
                <Icon size={16} className={`mr-2.5 ${isActive ? 'text-accent' : ''}`} />
                {section.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && (
          <div className="mb-4 p-3 bg-info/10 border border-info/20 rounded-mac text-sm text-info flex items-center gap-2">
            <RotateCcw size={16} className="animate-spin" />
            Syncing settings with backend...
          </div>
        )}
        
        {syncError && (
          <div className="mb-4 p-3 bg-error/10 border border-error/20 rounded-mac text-sm text-error">
            Failed to sync settings: {syncError}
          </div>
        )}

        {activeSection === 'general' && (
          <SettingsSection title="General Settings">
            <SettingRow label="Theme">
              <select
                value={settings.theme}
                onChange={(e) => handleThemeChange(e.target.value as 'dark' | 'light' | 'system')}
                className="input-mac min-w-32"
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="system">System</option>
              </select>
            </SettingRow>

            <SettingRow label="Auto Save">
              <Toggle
                checked={settings.autoSave}
                onChange={(v) => updateSetting('autoSave', v)}
              />
            </SettingRow>

            <SettingRow label="Auto Save Delay">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={settings.autoSaveDelay}
                  onChange={(e) =>
                    updateSetting('autoSaveDelay', parseInt(e.target.value) || 1000)
                  }
                  className="input-mac w-24"
                />
                <span className="text-sm text-text-secondary">ms</span>
              </div>
            </SettingRow>

            <div className="mt-8 pt-6 border-t border-glass-border">
              <button
                onClick={handleResetSettings}
                className="flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:text-text-primary bg-glass hover:bg-card-hover border border-glass-border rounded-mac transition-colors"
              >
                <RotateCcw size={14} />
                Reset to Defaults
              </button>
            </div>
          </SettingsSection>
        )}

        {activeSection === 'appearance' && (
          <SettingsSection title="Appearance">
            <SettingRow label="Font Size">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={settings.fontSize}
                  onChange={(e) =>
                    updateSetting('fontSize', parseInt(e.target.value) || 14)
                  }
                  className="input-mac w-20"
                />
                <span className="text-sm text-text-secondary">px</span>
              </div>
            </SettingRow>

            <SettingRow label="Font Family">
              <select
                value={settings.fontFamily}
                onChange={(e) => updateSetting('fontFamily', e.target.value)}
                className="input-mac min-w-40"
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
                  updateSetting('tabSize', parseInt(e.target.value))
                }
                className="input-mac"
              >
                <option value={2}>2 spaces</option>
                <option value={4}>4 spaces</option>
                <option value={8}>8 spaces</option>
              </select>
            </SettingRow>

            <SettingRow label="Show Minimap">
              <Toggle
                checked={settings.minimap}
                onChange={(v) => updateSetting('minimap', v)}
              />
            </SettingRow>

            <SettingRow label="Line Numbers">
              <Toggle
                checked={settings.lineNumbers}
                onChange={(v) => updateSetting('lineNumbers', v)}
              />
            </SettingRow>

            <SettingRow label="Word Wrap">
              <Toggle
                checked={settings.wordWrap}
                onChange={(v) => updateSetting('wordWrap', v)}
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
                  updateSetting('apiEndpoint', e.target.value)
                }
                className="input-mac w-80"
              />
            </SettingRow>

            <SettingRow label="API Key">
              <input
                type="password"
                value={settings.apiKey}
                onChange={(e) => updateSetting('apiKey', e.target.value)}
                placeholder="Enter your API key"
                className="input-mac w-80"
              />
            </SettingRow>

            <div className="mt-5 p-4 bg-glass border border-glass-border rounded-mac text-sm text-text-secondary">
              <p className="flex items-start gap-2">
                <Shield size={16} className="text-info mt-0.5 flex-shrink-0" />
                Your API key is stored locally and never sent to our servers.
              </p>
            </div>
          </SettingsSection>
        )}

        {activeSection === 'mcp' && (
          <SettingsSection title="MCP Plugin Settings">
            <SettingRow label="Enable MCP">
              <Toggle
                checked={settings.mcpEnabled}
                onChange={(v) => updateSetting('mcpEnabled', v)}
              />
            </SettingRow>

            <SettingRow label="Auto-connect MCP Servers">
              <Toggle
                checked={settings.mcpAutoConnect}
                onChange={(v) => updateSetting('mcpAutoConnect', v)}
              />
            </SettingRow>

            <div className="mt-4 p-4 bg-glass border border-glass-border rounded-mac text-sm text-text-secondary">
              <p className="mb-2">Configured MCP Servers: {settings.mcpServers.length}</p>
              <p className="text-xs text-text-tertiary">
                Manage individual MCP servers from the MCP Plugins panel.
              </p>
            </div>
          </SettingsSection>
        )}

        {activeSection === 'swarm' && (
          <SettingsSection title="Swarm Configuration">
            <SettingRow label="Default Topology">
              <select
                value={settings.swarmDefaultTopology}
                onChange={(e) => updateSetting('swarmDefaultTopology', e.target.value as any)}
                className="input-mac min-w-40"
              >
                <option value="star">Star</option>
                <option value="mesh">Mesh</option>
                <option value="tree">Tree</option>
                <option value="ring">Ring</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </SettingRow>

            <SettingRow label="Default Strategy">
              <select
                value={settings.swarmDefaultStrategy}
                onChange={(e) => updateSetting('swarmDefaultStrategy', e.target.value as any)}
                className="input-mac min-w-40"
              >
                <option value="parallel">Parallel</option>
                <option value="sequential">Sequential</option>
                <option value="pipeline">Pipeline</option>
                <option value="mapreduce">Map-Reduce</option>
              </select>
            </SettingRow>

            <SettingRow label="Max Agents per Swarm">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={settings.swarmMaxAgents}
                  onChange={(e) =>
                    updateSetting('swarmMaxAgents', parseInt(e.target.value) || 10)
                  }
                  className="input-mac w-20"
                  min={1}
                  max={100}
                />
                <span className="text-sm text-text-secondary">agents</span>
              </div>
            </SettingRow>

            <SettingRow label="Consensus Algorithm">
              <select
                value={settings.swarmConsensusAlgorithm}
                onChange={(e) => updateSetting('swarmConsensusAlgorithm', e.target.value as any)}
                className="input-mac min-w-40"
              >
                <option value="simple_majority">Simple Majority (&gt;50%)</option>
                <option value="supermajority">Supermajority (2/3)</option>
                <option value="unanimity">Unanimity (100%)</option>
                <option value="weighted">Weighted Voting</option>
                <option value="byzantine">Byzantine Fault Tolerance</option>
              </select>
            </SettingRow>

            <SettingRow label="Consensus Timeout">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={settings.swarmConsensusTimeout}
                  onChange={(e) =>
                    updateSetting('swarmConsensusTimeout', parseInt(e.target.value) || 30)
                  }
                  className="input-mac w-20"
                  min={5}
                  max={300}
                />
                <span className="text-sm text-text-secondary">seconds</span>
              </div>
            </SettingRow>
          </SettingsSection>
        )}

        {activeSection === 'team' && (
          <SettingsSection title="Team Collaboration Settings">
            <div className="p-4 bg-glass border border-glass-border rounded-mac text-sm text-text-secondary">
              <p className="mb-2 flex items-center gap-2">
                <Users size={16} className="text-accent" />
                Team settings are configured per-team
              </p>
              <p className="text-xs text-text-tertiary">
                Visit the Teams panel to manage team-specific settings including member roles, workspace permissions, and notification preferences.
              </p>
            </div>
          </SettingsSection>
        )}

        {activeSection === 'notifications' && (
          <SettingsSection title="Notifications">
            <SettingRow label="Enable Notifications">
              <Toggle
                checked={settings.notifications}
                onChange={(v) => updateSetting('notifications', v)}
              />
            </SettingRow>

            <SettingRow label="Sound Effects">
              <Toggle
                checked={settings.sounds}
                onChange={(v) => updateSetting('sounds', v)}
              />
            </SettingRow>
          </SettingsSection>
        )}

        {activeSection === 'about' && (
          <SettingsSection title="About Swarm Editor">
            <div className="space-y-6">
              <div className="text-center py-8 bg-glass/50 rounded-mac-xl">
                <div className="text-5xl mb-3">🐝</div>
                <h3 className="text-xl font-semibold text-text-primary">Swarm Editor</h3>
                <p className="text-text-secondary text-sm mt-1">Version 0.1.0</p>
              </div>

              <div className="bg-glass border border-glass-border rounded-mac-xl p-5 text-sm text-text-secondary leading-relaxed">
                <p className="mb-3">
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
                    className="text-accent hover:text-accent-hover transition-colors"
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
            <div className="bg-glass border border-glass-border rounded-mac-xl p-5 text-sm text-text-secondary">
              <p>Network configuration options will be available here.</p>
              <p className="mt-2 text-xs text-text-tertiary">
                Future features: Proxy settings, connection timeouts, SSL certificates.
              </p>
            </div>
          </SettingsSection>
        )}

        {activeSection === 'security' && (
          <SettingsSection title="Security Settings">
            <div className="bg-glass border border-glass-border rounded-mac-xl p-5 text-sm text-text-secondary">
              <p>Security configuration options will be available here.</p>
              <p className="mt-2 text-xs text-text-tertiary">
                Future features: Permission management, audit logs, encryption settings.
              </p>
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
    <div className="max-w-2xl">
      <h3 className="text-lg font-semibold text-text-primary mb-6">{title}</h3>
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
    <div className="flex items-center justify-between py-3 px-4 bg-glass/30 rounded-mac">
      <label className="text-sm text-text-primary font-medium">{label}</label>
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
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
        checked ? 'bg-accent' : 'bg-glass border border-glass-border'
      }`}
    >
      <div
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-5.5' : 'translate-x-0.5'
        }`}
        style={{ transform: checked ? 'translateX(22px)' : 'translateX(2px)' }}
      />
    </button>
  )
}

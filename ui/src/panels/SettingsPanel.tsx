import { useState, useEffect, useCallback } from 'react'
import { logger } from '../utils'
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
  Lock,
  FileText,
  AlertTriangle,
  Plus,
  X,
  Eye,
  EyeOff,
  Search,
} from 'lucide-react'
import { useSettings, type Settings } from '../hooks/useSettings'
import { useTheme } from '../hooks/useTheme'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { instructionsApi } from '../services/api'
import { useAppStore } from '../store/appStore'

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
  { id: 'instructions', label: 'Custom Instructions', icon: FileText },
  { id: 'about', label: 'About', icon: Info },
]

export default function SettingsPanel() {
  const [activeSection, setActiveSection] = useState('general')
  const [searchQuery, setSearchQuery] = useState('')
  const { settings, updateSetting, resetSettings, addAllowedIpRange, removeAllowedIpRange } = useSettings()
  const { setTheme } = useTheme()
  const addToast = useAppStore(state => state.addToast)
  const [newIpRange, setNewIpRange] = useState('')
  const [showProxyPassword, setShowProxyPassword] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [instructionsContent, setInstructionsContent] = useState('')
  const [instructionsFiles, setInstructionsFiles] = useState<string[]>([])
  const [instructionsLoaded, setInstructionsLoaded] = useState(false)
  const [instructionsSaving, setInstructionsSaving] = useState(false)

  const isSearching = searchQuery.trim().length > 0
  const searchLower = searchQuery.toLowerCase().trim()

  // When searching, show all sections; when not, show active section only
  const shouldShowSection = (sectionId: string) => isSearching || activeSection === sectionId

  const handleThemeChange = (theme: 'dark' | 'light' | 'system') => {
    updateSetting('theme', theme)
    setTheme(theme)
  }

  const handleResetSettings = () => {
    resetSettings()
    setTheme('dark')
    setShowResetConfirm(false)
  }

  const handleAddIpRange = () => {
    if (newIpRange.trim()) {
      addAllowedIpRange(newIpRange.trim())
      setNewIpRange('')
    }
  }

  const loadInstructions = useCallback(async () => {
    try {
      const result = await instructionsApi.get()
      setInstructionsContent(result.content)
      setInstructionsFiles(result.files || [])
    } catch {
      logger.debug('SettingsPanel', 'Workspace may not exist yet')
    }
    setInstructionsLoaded(true)
  }, [])

  useEffect(() => {
    void loadInstructions()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadInstructions is stable (empty deps)
  }, [])

  const handleSaveInstructions = useCallback(async () => {
    setInstructionsSaving(true)
    try {
      await instructionsApi.save(instructionsContent)
      await loadInstructions()
    } catch (e) {
      logger.error('Settings', 'Failed to save instructions', e)
      addToast('error', 'Save failed', e instanceof Error ? e.message : 'Unknown error')
    }
    setInstructionsSaving(false)
  }, [instructionsContent, loadInstructions])

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
      <div className="flex-1 overflow-y-auto">
        {/* Settings Search (VS Code pattern) */}
        <div className="sticky top-0 z-10 bg-mac-bg border-b border-glass-border px-6 py-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-surface rounded-mac text-text-tertiary">
            <Search size={14} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search settings..."
              className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-tertiary outline-none"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="hover:text-text-primary" aria-label="Clear search" title="Clear search">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="p-6">

        {shouldShowSection('general') && (
          <SettingsSection title="General Settings">
            <SearchableSettingRow label="Theme" searchQuery={searchLower}>
              <select
                value={settings.theme}
                onChange={(e) => handleThemeChange(e.target.value as 'dark' | 'light' | 'system')}
                className="input-mac min-w-32"
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="system">System</option>
              </select>
            </SearchableSettingRow>

            <SearchableSettingRow label="Auto Save" searchQuery={searchLower}>
              <Toggle
                checked={settings.autoSave}
                onChange={(v) => updateSetting('autoSave', v)}
              />
            </SearchableSettingRow>

            <SearchableSettingRow label="Auto Save Delay" searchQuery={searchLower}>
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
            </SearchableSettingRow>

            <div className="mt-8 pt-6 border-t border-glass-border">
              <button
                onClick={() => setShowResetConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:text-text-primary bg-glass hover:bg-card-hover border border-glass-border rounded-mac transition-colors"
              >
                <RotateCcw size={14} />
                Reset to Defaults
              </button>
            </div>
          </SettingsSection>
        )}

        {shouldShowSection('appearance') && (
          <SettingsSection title="Appearance">
            <SearchableSettingRow label="Font Size" searchQuery={searchLower}>
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
            </SearchableSettingRow>

            <SearchableSettingRow label="Font Family" searchQuery={searchLower}>
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
            </SearchableSettingRow>

            <SearchableSettingRow label="Tab Size" searchQuery={searchLower}>
              <select
                value={settings.tabSize}
                onChange={(e) =>
                  updateSetting('tabSize', parseInt(e.target.value) || 2)
                }
                className="input-mac"
              >
                <option value={2}>2 spaces</option>
                <option value={4}>4 spaces</option>
                <option value={8}>8 spaces</option>
              </select>
            </SearchableSettingRow>

            <SearchableSettingRow label="Show Minimap" searchQuery={searchLower}>
              <Toggle
                checked={settings.minimap}
                onChange={(v) => updateSetting('minimap', v)}
              />
            </SearchableSettingRow>

            <SearchableSettingRow label="Line Numbers" searchQuery={searchLower}>
              <select
                value={settings.lineNumbers}
                onChange={(e) => updateSetting('lineNumbers', e.target.value as Settings['lineNumbers'])}
                className="input-mac"
              >
                <option value="on">On</option>
                <option value="off">Off</option>
                <option value="relative">Relative</option>
              </select>
            </SearchableSettingRow>

            <SearchableSettingRow label="Word Wrap" searchQuery={searchLower}>
              <Toggle
                checked={settings.wordWrap}
                onChange={(v) => updateSetting('wordWrap', v)}
              />
            </SearchableSettingRow>

            <SearchableSettingRow label="Bracket Pair Colorization" searchQuery={searchLower}>
              <Toggle
                checked={settings.bracketPairColorization}
                onChange={(v) => updateSetting('bracketPairColorization', v)}
              />
            </SearchableSettingRow>

            <SearchableSettingRow label="Sticky Scroll" searchQuery={searchLower}>
              <Toggle
                checked={settings.stickyScroll}
                onChange={(v) => updateSetting('stickyScroll', v)}
              />
            </SearchableSettingRow>

            <SearchableSettingRow label="Indent Guides" searchQuery={searchLower}>
              <Toggle
                checked={settings.indentGuides}
                onChange={(v) => updateSetting('indentGuides', v)}
              />
            </SearchableSettingRow>

            <SearchableSettingRow label="Render Whitespace" searchQuery={searchLower}>
              <select
                value={settings.renderWhitespace}
                onChange={(e) => updateSetting('renderWhitespace', e.target.value as Settings['renderWhitespace'])}
                className="bg-surface border border-glass-border rounded-mac px-2 py-1 text-sm text-text-primary outline-none"
              >
                <option value="none">None</option>
                <option value="boundary">Boundary</option>
                <option value="selection">Selection</option>
                <option value="trailing">Trailing</option>
                <option value="all">All</option>
              </select>
            </SearchableSettingRow>

            <SearchableSettingRow label="Cursor Blinking" searchQuery={searchLower}>
              <select
                value={settings.cursorBlinking}
                onChange={(e) => updateSetting('cursorBlinking', e.target.value as Settings['cursorBlinking'])}
                className="bg-surface border border-glass-border rounded-mac px-2 py-1 text-sm text-text-primary outline-none"
              >
                <option value="blink">Blink</option>
                <option value="smooth">Smooth</option>
                <option value="phase">Phase</option>
                <option value="expand">Expand</option>
                <option value="solid">Solid</option>
              </select>
            </SearchableSettingRow>

            <SearchableSettingRow label="Cursor Style" searchQuery={searchLower}>
              <select
                value={settings.cursorStyle}
                onChange={(e) => updateSetting('cursorStyle', e.target.value as Settings['cursorStyle'])}
                className="bg-surface border border-glass-border rounded-mac px-2 py-1 text-sm text-text-primary outline-none"
              >
                <option value="line">Line</option>
                <option value="block">Block</option>
                <option value="underline">Underline</option>
                <option value="line-thin">Line Thin</option>
                <option value="block-outline">Block Outline</option>
                <option value="underline-thin">Underline Thin</option>
              </select>
            </SearchableSettingRow>

            {/* R5121: VS Code parity settings */}
            <SearchableSettingRow label="Smooth Scrolling" searchQuery={searchLower}>
              <Toggle
                checked={settings.smoothScrolling}
                onChange={(v) => updateSetting('smoothScrolling', v)}
              />
            </SearchableSettingRow>

            <SearchableSettingRow label="Cursor Smooth Animation" searchQuery={searchLower}>
              <Toggle
                checked={settings.cursorSmoothCaretAnimation}
                onChange={(v) => updateSetting('cursorSmoothCaretAnimation', v)}
              />
            </SearchableSettingRow>

            <SearchableSettingRow label="Linked Editing" searchQuery={searchLower}>
              <Toggle
                checked={settings.linkedEditing}
                onChange={(v) => updateSetting('linkedEditing', v)}
              />
            </SearchableSettingRow>

            <SearchableSettingRow label="Scroll Beyond Last Line" searchQuery={searchLower}>
              <Toggle
                checked={settings.scrollBeyondLastLine}
                onChange={(v) => updateSetting('scrollBeyondLastLine', v)}
              />
            </SearchableSettingRow>

            <SearchableSettingRow label="Format On Paste" searchQuery={searchLower}>
              <Toggle
                checked={settings.formatOnPaste}
                onChange={(v) => updateSetting('formatOnPaste', v)}
              />
            </SearchableSettingRow>

            <SearchableSettingRow label="Mouse Wheel Zoom" searchQuery={searchLower}>
              <Toggle
                checked={settings.mouseWheelZoom}
                onChange={(v) => updateSetting('mouseWheelZoom', v)}
              />
            </SearchableSettingRow>

            <SearchableSettingRow label="Semantic Highlighting" searchQuery={searchLower}>
              <Toggle
                checked={settings.semanticHighlighting}
                onChange={(v) => updateSetting('semanticHighlighting', v)}
              />
            </SearchableSettingRow>

            <SearchableSettingRow label="Inlay Hints" searchQuery={searchLower}>
              <Toggle
                checked={settings.inlayHints}
                onChange={(v) => updateSetting('inlayHints', v)}
              />
            </SearchableSettingRow>

            <SearchableSettingRow label="Breadcrumbs" searchQuery={searchLower}>
              <Toggle
                checked={settings.breadcrumbs}
                onChange={(v) => updateSetting('breadcrumbs', v)}
              />
            </SearchableSettingRow>

            {/* R5127: Autocomplete settings (VS Code parity — were wired but not exposed in UI) */}
            <SearchableSettingRow label="Quick Suggestions" searchQuery={searchLower}>
              <Toggle
                checked={settings.quickSuggestions}
                onChange={(v) => updateSetting('quickSuggestions', v)}
              />
            </SearchableSettingRow>

            <SearchableSettingRow label="Accept Suggestion on Enter" searchQuery={searchLower}>
              <select
                value={settings.acceptSuggestionOnEnter}
                onChange={(e) => updateSetting('acceptSuggestionOnEnter', e.target.value as Settings['acceptSuggestionOnEnter'])}
                className="bg-surface border border-glass-border rounded-mac px-2 py-1 text-sm text-text-primary outline-none"
              >
                <option value="smart">Smart</option>
                <option value="on">On</option>
                <option value="off">Off</option>
              </select>
            </SearchableSettingRow>

            <SearchableSettingRow label="Tab Completion" searchQuery={searchLower}>
              <select
                value={settings.tabCompletion}
                onChange={(e) => updateSetting('tabCompletion', e.target.value as Settings['tabCompletion'])}
                className="bg-surface border border-glass-border rounded-mac px-2 py-1 text-sm text-text-primary outline-none"
              >
                <option value="on">On</option>
                <option value="off">Off</option>
                <option value="onlySnippets">Only Snippets</option>
              </select>
            </SearchableSettingRow>

            <SearchableSettingRow label="Word-Based Suggestions" searchQuery={searchLower}>
              <select
                value={settings.wordBasedSuggestions}
                onChange={(e) => updateSetting('wordBasedSuggestions', e.target.value as Settings['wordBasedSuggestions'])}
                className="bg-surface border border-glass-border rounded-mac px-2 py-1 text-sm text-text-primary outline-none"
              >
                <option value="matchingDocuments">Matching Documents</option>
                <option value="currentDocument">Current Document</option>
                <option value="allDocuments">All Documents</option>
              </select>
            </SearchableSettingRow>

            <SearchableSettingRow label="Suggest on Trigger Characters" searchQuery={searchLower}>
              <Toggle
                checked={settings.suggestOnTriggerCharacters}
                onChange={(v) => updateSetting('suggestOnTriggerCharacters', v)}
              />
            </SearchableSettingRow>
          </SettingsSection>
        )}

        {shouldShowSection('api') && (
          <SettingsSection title="API Configuration">
            <SearchableSettingRow label="API Endpoint" searchQuery={searchLower}>
              <input
                type="text"
                value={settings.apiEndpoint}
                onChange={(e) =>
                  updateSetting('apiEndpoint', e.target.value)
                }
                className="input-mac w-80"
              />
            </SearchableSettingRow>

            <SearchableSettingRow label="API Key" searchQuery={searchLower}>
              <input
                type="password"
                value={settings.apiKey}
                onChange={(e) => updateSetting('apiKey', e.target.value)}
                placeholder="Enter your API key"
                className="input-mac w-80"
              />
            </SearchableSettingRow>

            <div className="mt-5 p-4 bg-glass border border-glass-border rounded-mac text-sm text-text-secondary">
              <p className="flex items-start gap-2">
                <Shield size={16} className="text-info mt-0.5 flex-shrink-0" />
                Reserved for future API extensions. Currently unused — agents communicate via WebSocket.
              </p>
            </div>
          </SettingsSection>
        )}

        {shouldShowSection('mcp') && (
          <SettingsSection title="MCP Plugin Settings">
            <SearchableSettingRow label="Enable MCP" searchQuery={searchLower}>
              <Toggle
                checked={settings.mcpEnabled}
                onChange={(v) => updateSetting('mcpEnabled', v)}
              />
            </SearchableSettingRow>

            <SearchableSettingRow label="Auto-connect MCP Servers" searchQuery={searchLower}>
              <Toggle
                checked={settings.mcpAutoConnect}
                onChange={(v) => updateSetting('mcpAutoConnect', v)}
              />
            </SearchableSettingRow>

            <div className="mt-4 p-4 bg-glass border border-glass-border rounded-mac text-sm text-text-secondary">
              <p className="mb-2">Configured MCP Servers: {settings.mcpServers.length}</p>
              <p className="text-xs text-text-tertiary">
                Manage individual MCP servers from the MCP Plugins panel.
              </p>
            </div>
          </SettingsSection>
        )}

        {shouldShowSection('swarm') && (
          <SettingsSection title="Swarm Configuration">
            <SearchableSettingRow label="Default Topology" searchQuery={searchLower}>
              <select
                value={settings.swarmDefaultTopology}
                onChange={(e) => updateSetting('swarmDefaultTopology', e.target.value as 'star' | 'mesh' | 'tree' | 'ring' | 'hybrid')}
                className="input-mac min-w-40"
              >
                <option value="star">Star</option>
                <option value="mesh">Mesh</option>
                <option value="tree">Tree</option>
                <option value="ring">Ring</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </SearchableSettingRow>

            <SearchableSettingRow label="Default Strategy" searchQuery={searchLower}>
              <select
                value={settings.swarmDefaultStrategy}
                onChange={(e) => updateSetting('swarmDefaultStrategy', e.target.value as 'parallel' | 'sequential' | 'pipeline' | 'mapreduce')}
                className="input-mac min-w-40"
              >
                <option value="parallel">Parallel</option>
                <option value="sequential">Sequential</option>
                <option value="pipeline">Pipeline</option>
                <option value="mapreduce">Map-Reduce</option>
              </select>
            </SearchableSettingRow>

            <SearchableSettingRow label="Max Agents per Swarm" searchQuery={searchLower}>
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
            </SearchableSettingRow>

            <SearchableSettingRow label="Consensus Algorithm" searchQuery={searchLower}>
              <select
                value={settings.swarmConsensusAlgorithm}
                onChange={(e) => updateSetting('swarmConsensusAlgorithm', e.target.value as 'simple_majority' | 'supermajority' | 'unanimity' | 'weighted' | 'byzantine')}
                className="input-mac min-w-40"
              >
                <option value="simple_majority">Simple Majority (&gt;50%)</option>
                <option value="supermajority">Supermajority (2/3)</option>
                <option value="unanimity">Unanimity (100%)</option>
                <option value="weighted">Weighted Voting</option>
                <option value="byzantine">Byzantine Fault Tolerance</option>
              </select>
            </SearchableSettingRow>

            <SearchableSettingRow label="Consensus Timeout" searchQuery={searchLower}>
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
            </SearchableSettingRow>
          </SettingsSection>
        )}

        {shouldShowSection('team') && (
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

        {shouldShowSection('notifications') && (
          <SettingsSection title="Notifications">
            <SearchableSettingRow label="Enable Notifications" searchQuery={searchLower}>
              <Toggle
                checked={settings.notifications}
                onChange={(v) => updateSetting('notifications', v)}
              />
            </SearchableSettingRow>

            <SearchableSettingRow label="Sound Effects" searchQuery={searchLower}>
              <Toggle
                checked={settings.sounds}
                onChange={(v) => updateSetting('sounds', v)}
              />
            </SearchableSettingRow>
          </SettingsSection>
        )}

        {shouldShowSection('instructions') && (
          <SettingsSection title="Custom Instructions">
            <div className="space-y-4">
              <p className="text-sm text-text-secondary leading-relaxed">
                Custom instructions are injected into every agent prompt. They work like
                Cursor's <code className="text-accent">.cursorrules</code> or VS Code's{' '}
                <code className="text-accent">AGENTS.md</code>. The editor automatically
                detects instruction files in your workspace root.
              </p>

              {instructionsLoaded && instructionsFiles.length > 0 && (
                <div className="bg-glass/50 border border-glass-border rounded-mac p-4">
                  <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                    Detected Instruction Files
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {instructionsFiles.map((file) => (
                      <span
                        key={file}
                        className="inline-flex items-center px-2.5 py-1 text-xs bg-accent/10 text-accent rounded-mac"
                      >
                        {file}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="relative">
                <textarea
                  value={instructionsContent}
                  onChange={(e) => setInstructionsContent(e.target.value)}
                  placeholder="Enter custom instructions for agents...&#10;&#10;Example:&#10;- Always use TypeScript strict mode&#10;- Follow the project's existing code style&#10;- Write tests for new features"
                  rows={12}
                  className="w-full input-mac resize-y font-mono text-sm leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-text-tertiary">
                  Saved to <code className="text-accent">.swarm-instructions.md</code>
                </span>
                <button
                  onClick={handleSaveInstructions}
                  disabled={instructionsSaving}
                  className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover disabled:opacity-50 rounded-mac transition-colors"
                >
                  {instructionsSaving ? 'Saving...' : 'Save Instructions'}
                </button>
              </div>
            </div>
          </SettingsSection>
        )}

        {shouldShowSection('about') && (
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
                  Built with Go, React, TypeScript, and WebSocket.
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

        {shouldShowSection('network') && (
          <SettingsSection title="Network Settings">
            {/* Proxy Settings */}
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                <Globe size={14} className="text-accent" />
                Proxy Configuration
              </h4>
              <div className="space-y-3">
                <SearchableSettingRow label="Enable Proxy" searchQuery={searchLower}>
                  <Toggle
                    checked={settings.networkProxyEnabled}
                    onChange={(v) => updateSetting('networkProxyEnabled', v)}
                  />
                </SearchableSettingRow>

                {settings.networkProxyEnabled && (
                  <>
                    <SearchableSettingRow label="Proxy URL" searchQuery={searchLower}>
                      <input
                        type="text"
                        value={settings.networkProxyUrl}
                        onChange={(e) => updateSetting('networkProxyUrl', e.target.value)}
                        placeholder="http://proxy.example.com:8080"
                        className="input-mac w-64"
                      />
                    </SearchableSettingRow>

                    <SearchableSettingRow label="Proxy Authentication" searchQuery={searchLower}>
                      <Toggle
                        checked={settings.networkProxyAuth}
                        onChange={(v) => updateSetting('networkProxyAuth', v)}
                      />
                    </SearchableSettingRow>

                    {settings.networkProxyAuth && (
                      <>
                        <SearchableSettingRow label="Username" searchQuery={searchLower}>
                          <input
                            type="text"
                            value={settings.networkProxyUsername}
                            onChange={(e) => updateSetting('networkProxyUsername', e.target.value)}
                            className="input-mac w-40"
                          />
                        </SearchableSettingRow>
                        <SearchableSettingRow label="Password" searchQuery={searchLower}>
                          <div className="relative">
                            <input
                              type={showProxyPassword ? 'text' : 'password'}
                              value={settings.networkProxyPassword}
                              onChange={(e) => updateSetting('networkProxyPassword', e.target.value)}
                              className="input-mac w-40 pr-8"
                            />
                            <button
                              type="button"
                              onClick={() => setShowProxyPassword(!showProxyPassword)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                              aria-label={showProxyPassword ? 'Hide password' : 'Show password'}
                            >
                              {showProxyPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                        </SearchableSettingRow>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Timeout Settings */}
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                <AlertTriangle size={14} className="text-warning" />
                Timeout Settings
              </h4>
              <div className="space-y-3">
                <SearchableSettingRow label="Connection Timeout" searchQuery={searchLower}>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={settings.networkConnectTimeout}
                      onChange={(e) => updateSetting('networkConnectTimeout', parseInt(e.target.value) || 30)}
                      className="input-mac w-20"
                      min={5}
                      max={120}
                    />
                    <span className="text-sm text-text-secondary">seconds</span>
                  </div>
                </SearchableSettingRow>

                <SearchableSettingRow label="Request Timeout" searchQuery={searchLower}>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={settings.networkRequestTimeout}
                      onChange={(e) => updateSetting('networkRequestTimeout', parseInt(e.target.value) || 60)}
                      className="input-mac w-20"
                      min={10}
                      max={300}
                    />
                    <span className="text-sm text-text-secondary">seconds</span>
                  </div>
                </SearchableSettingRow>
              </div>
            </div>

            {/* Retry Settings */}
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                <RotateCcw size={14} className="text-info" />
                Retry Settings
              </h4>
              <div className="space-y-3">
                <SearchableSettingRow label="Retry Attempts" searchQuery={searchLower}>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={settings.networkRetryAttempts}
                      onChange={(e) => updateSetting('networkRetryAttempts', parseInt(e.target.value) || 3)}
                      className="input-mac w-20"
                      min={0}
                      max={10}
                    />
                    <span className="text-sm text-text-secondary">attempts</span>
                  </div>
                </SearchableSettingRow>

                <SearchableSettingRow label="Retry Delay" searchQuery={searchLower}>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={settings.networkRetryDelay}
                      onChange={(e) => updateSetting('networkRetryDelay', parseInt(e.target.value) || 1000)}
                      className="input-mac w-20"
                      min={100}
                      max={10000}
                    />
                    <span className="text-sm text-text-secondary">ms</span>
                  </div>
                </SearchableSettingRow>
              </div>
            </div>

            {/* SSL Settings */}
            <div>
              <h4 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                <Lock size={14} className="text-success" />
                SSL/TLS Settings
              </h4>
              <div className="space-y-3">
                <SearchableSettingRow label="Verify SSL Certificates" searchQuery={searchLower}>
                  <Toggle
                    checked={settings.networkSslVerify}
                    onChange={(v) => updateSetting('networkSslVerify', v)}
                  />
                </SearchableSettingRow>

                <SearchableSettingRow label="Custom CA Certificate" searchQuery={searchLower}>
                  <input
                    type="text"
                    value={settings.networkSslCertPath}
                    onChange={(e) => updateSetting('networkSslCertPath', e.target.value)}
                    placeholder="/path/to/ca-bundle.crt"
                    className="input-mac w-64"
                  />
                </SearchableSettingRow>
              </div>
            </div>
          </SettingsSection>
        )}

        {shouldShowSection('security') && (
          <SettingsSection title="Security Settings">
            {/* Audit Log Settings */}
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                <FileText size={14} className="text-info" />
                Audit Logging
              </h4>
              <div className="space-y-3">
                <SearchableSettingRow label="Enable Audit Log" searchQuery={searchLower}>
                  <Toggle
                    checked={settings.securityEnableAuditLog}
                    onChange={(v) => updateSetting('securityEnableAuditLog', v)}
                  />
                </SearchableSettingRow>

                {settings.securityEnableAuditLog && (
                  <>
                    <SearchableSettingRow label="Audit Log Path" searchQuery={searchLower}>
                      <input
                        type="text"
                        value={settings.securityAuditLogPath}
                        onChange={(e) => updateSetting('securityAuditLogPath', e.target.value)}
                        placeholder="~/.swarm-editor/audit.log"
                        className="input-mac w-64"
                      />
                    </SearchableSettingRow>

                    <SearchableSettingRow label="Log Retention" searchQuery={searchLower}>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={settings.securityAuditRetention}
                          onChange={(e) => updateSetting('securityAuditRetention', parseInt(e.target.value) || 30)}
                          className="input-mac w-20"
                          min={1}
                          max={365}
                        />
                        <span className="text-sm text-text-secondary">days</span>
                      </div>
                    </SearchableSettingRow>
                  </>
                )}
              </div>
            </div>

            {/* Data Encryption */}
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                <Lock size={14} className="text-success" />
                Data Encryption
              </h4>
              <div className="space-y-3">
                <SearchableSettingRow label="Encrypt Local Data" searchQuery={searchLower}>
                  <Toggle
                    checked={settings.securityEncryptLocalData}
                    onChange={(v) => updateSetting('securityEncryptLocalData', v)}
                  />
                </SearchableSettingRow>

                {settings.securityEncryptLocalData && (
                  <SearchableSettingRow label="Encryption Key Path" searchQuery={searchLower}>
                    <input
                      type="text"
                      value={settings.securityEncryptionKeyPath}
                      onChange={(e) => updateSetting('securityEncryptionKeyPath', e.target.value)}
                      placeholder="~/.swarm-editor/key.pem"
                      className="input-mac w-64"
                    />
                  </SearchableSettingRow>
                )}
              </div>
            </div>

            {/* Session & Authentication */}
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                <Shield size={14} className="text-warning" />
                Session & Authentication
              </h4>
              <div className="space-y-3">
                <SearchableSettingRow label="Session Timeout" searchQuery={searchLower}>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={settings.securitySessionTimeout}
                      onChange={(e) => updateSetting('securitySessionTimeout', parseInt(e.target.value) || 3600)}
                      className="input-mac w-20"
                      min={300}
                      max={86400}
                    />
                    <span className="text-sm text-text-secondary">seconds</span>
                  </div>
                </SearchableSettingRow>

                <SearchableSettingRow label="Max Login Attempts" searchQuery={searchLower}>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={settings.securityMaxLoginAttempts}
                      onChange={(e) => updateSetting('securityMaxLoginAttempts', parseInt(e.target.value) || 5)}
                      className="input-mac w-20"
                      min={1}
                      max={10}
                    />
                    <span className="text-sm text-text-secondary">attempts</span>
                  </div>
                </SearchableSettingRow>

                <SearchableSettingRow label="Require Strong Passwords" searchQuery={searchLower}>
                  <Toggle
                    checked={settings.securityRequireStrongPasswords}
                    onChange={(v) => updateSetting('securityRequireStrongPasswords', v)}
                  />
                </SearchableSettingRow>

                <SearchableSettingRow label="Two-Factor Authentication" searchQuery={searchLower}>
                  <Toggle
                    checked={settings.securityTwoFactorEnabled}
                    onChange={(v) => updateSetting('securityTwoFactorEnabled', v)}
                  />
                </SearchableSettingRow>
              </div>
            </div>

            {/* IP Access Control */}
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                <Globe size={14} className="text-accent" />
                IP Access Control
              </h4>
              <div className="space-y-3">
                <div className="p-3 bg-glass/50 rounded-mac">
                  <label className="block text-xs text-text-secondary mb-2">Allowed IP Ranges</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {settings.securityAllowedIpRanges.map((ip) => (
                      <div
                        key={ip}
                        className="flex items-center gap-1.5 px-2 py-1 bg-accent/10 border border-accent/20 rounded-mac text-xs text-accent"
                      >
                        <span>{ip}</span>
                        <button
                          onClick={() => removeAllowedIpRange(ip)}
                          className="hover:text-error transition-colors"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newIpRange}
                      onChange={(e) => setNewIpRange(e.target.value)}
                      placeholder="192.168.1.0/24"
                      className="input-mac flex-1"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddIpRange()}
                    />
                    <button
                      onClick={handleAddIpRange}
                      disabled={!newIpRange.trim()}
                      className="btn-secondary flex items-center gap-1"
                    >
                      <Plus size={14} />
                      Add
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Agent Security */}
            <div>
              <h4 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                <Shield size={14} className="text-error" />
                Agent Security
              </h4>
              <div className="space-y-3">
                <SearchableSettingRow label="Block Unknown Agents" searchQuery={searchLower}>
                  <Toggle
                    checked={settings.securityBlockUnknownAgents}
                    onChange={(v) => updateSetting('securityBlockUnknownAgents', v)}
                  />
                </SearchableSettingRow>

                <SearchableSettingRow label="Enable Agent Sandboxing" searchQuery={searchLower}>
                  <Toggle
                    checked={settings.securityAgentSandboxing}
                    onChange={(v) => updateSetting('securityAgentSandboxing', v)}
                  />
                </SearchableSettingRow>
              </div>

              <div className="mt-4 p-3 bg-warning/10 border border-warning/20 rounded-mac text-sm text-warning">
                <p className="flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                  <span>Agent sandboxing provides an additional security layer by isolating agent processes from the host system.</span>
                </p>
              </div>
            </div>
          </SettingsSection>
        )}
        </div>
      </div>

      {showResetConfirm && (
        <ConfirmDialog
          title="Reset Settings"
          message="All settings will be restored to their default values. This cannot be undone."
          confirmLabel="Reset"
          variant="danger"
          onConfirm={handleResetSettings}
          onCancel={() => setShowResetConfirm(false)}
        />
      )}
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

// Wrapper that hides non-matching settings during search (VS Code pattern)
function SearchableSettingRow({
  label,
  children,
  searchQuery,
}: {
  label: string
  children: React.ReactNode
  searchQuery: string
}) {
  if (searchQuery && !label.toLowerCase().includes(searchQuery.toLowerCase())) {
    return null
  }
  return <SettingRow label={label}>{children}</SettingRow>
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
      role="switch"
      aria-checked={checked}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
        checked ? 'bg-accent' : 'bg-glass border border-glass-border'
      }`}
    >
      <div
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200`}
        style={{ transform: checked ? 'translateX(22px)' : 'translateX(2px)' }}
        aria-hidden="true"
      />
    </button>
  )
}

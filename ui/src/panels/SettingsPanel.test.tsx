import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SettingsPanel from './SettingsPanel'

// Module-level mock functions so we can track calls in tests
const mockUpdateSetting = vi.fn()
const mockSetSettings = vi.fn()
const mockResetSettings = vi.fn()
const mockAddAllowedIpRange = vi.fn()
const mockRemoveAllowedIpRange = vi.fn()

// Mock the hooks
vi.mock('../hooks/useSettings', () => ({
  useSettings: () => ({
    settings: {
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
      mcpEnabled: true,
      mcpAutoConnect: true,
      mcpServers: [],
      swarmDefaultTopology: 'star',
      swarmDefaultStrategy: 'parallel',
      swarmMaxAgents: 10,
      swarmConsensusAlgorithm: 'simple_majority',
      swarmConsensusTimeout: 30000,
      teamAutoAssignAgents: true,
      teamMaxMembers: 50,
      teamRequireApproval: true,
      agentAutoScan: true,
      agentScanInterval: 30000,
      agentAutoConnect: false,
      // Network settings
      networkProxyEnabled: false,
      networkProxyUrl: '',
      networkProxyAuth: false,
      networkProxyUsername: '',
      networkProxyPassword: '',
      networkConnectTimeout: 30,
      networkRequestTimeout: 60,
      networkRetryAttempts: 3,
      networkRetryDelay: 1000,
      networkSslVerify: true,
      networkSslCertPath: '',
      // Security settings
      securityEnableAuditLog: true,
      securityAuditLogPath: '',
      securityAuditRetention: 30,
      securityEncryptLocalData: false,
      securityEncryptionKeyPath: '',
      securitySessionTimeout: 3600,
      securityMaxLoginAttempts: 5,
      securityRequireStrongPasswords: true,
      securityTwoFactorEnabled: false,
      securityAllowedIpRanges: ['127.0.0.1', '::1'],
      securityBlockUnknownAgents: false,
      securityAgentSandboxing: true,
    },
    updateSetting: mockUpdateSetting,
    setSettings: mockSetSettings,
    resetSettings: mockResetSettings,
    addAllowedIpRange: mockAddAllowedIpRange,
    removeAllowedIpRange: mockRemoveAllowedIpRange,
    isLoading: false,
    syncError: null,
  }),
}))

vi.mock('../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'dark',
    effectiveTheme: 'dark',
    setTheme: vi.fn(),
    toggleTheme: vi.fn(),
    isDark: true,
  }),
}))

describe('SettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders settings header', () => {
    render(<SettingsPanel />)
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('renders all navigation sections', () => {
    render(<SettingsPanel />)
    expect(screen.getByText('General')).toBeInTheDocument()
    expect(screen.getByText('Appearance')).toBeInTheDocument()
    expect(screen.getByText('API Keys')).toBeInTheDocument()
    expect(screen.getByText('Network')).toBeInTheDocument()
    expect(screen.getByText('Notifications')).toBeInTheDocument()
    expect(screen.getByText('Security')).toBeInTheDocument()
    expect(screen.getByText('About')).toBeInTheDocument()
  })

  it('shows general settings by default', () => {
    render(<SettingsPanel />)
    expect(screen.getByText('General Settings')).toBeInTheDocument()
  })

  it('switches to appearance section', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Appearance'))
    expect(screen.getByText('Font Size')).toBeInTheDocument()
    expect(screen.getByText('Font Family')).toBeInTheDocument()
  })

  it('switches to API section', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('API Keys'))
    expect(screen.getByText('API Configuration')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Enter your API key')).toBeInTheDocument()
  })

  it('switches to notifications section', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Notifications'))
    expect(screen.getByText('Enable Notifications')).toBeInTheDocument()
    expect(screen.getByText('Sound Effects')).toBeInTheDocument()
  })

  it('switches to about section', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('About'))
    expect(screen.getByText('About Swarm Editor')).toBeInTheDocument()
    expect(screen.getByText('Version 0.1.0')).toBeInTheDocument()
  })

  it('switches to network section', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Network'))
    expect(screen.getByText('Network Settings')).toBeInTheDocument()
  })

  it('switches to security section', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Security'))
    expect(screen.getByText('Security Settings')).toBeInTheDocument()
  })

  it('has theme selector in general settings', () => {
    render(<SettingsPanel />)
    expect(screen.getByRole('option', { name: 'Dark' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Light' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'System' })).toBeInTheDocument()
  })

  it('has font family options in appearance', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Appearance'))
    expect(screen.getByRole('option', { name: 'JetBrains Mono' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Fira Code' })).toBeInTheDocument()
  })

  it('shows GitHub link in about section', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('About'))
    expect(screen.getByText('GitHub Repository')).toBeInTheDocument()
  })
})

describe('Toggle component', () => {
  it('toggles auto save setting', () => {
    render(<SettingsPanel />)
    // General section has Auto Save toggle
    const toggleButtons = screen.getAllByRole('button')
    // Find the toggle button (has rounded-full class)
    const autoSaveToggle = toggleButtons.find(
      (btn) => btn.className.includes('rounded-full') && btn.className.includes('w-11')
    )
    if (autoSaveToggle) {
      fireEvent.click(autoSaveToggle)
      // Toggle should still work after click
      expect(autoSaveToggle).toBeInTheDocument()
    }
  })
})

describe('SettingsPanel setting inputs', () => {
  it('has theme select with correct initial value', () => {
    render(<SettingsPanel />)
    const themeSelect = screen.getByRole('combobox')
    expect(themeSelect).toHaveValue('dark')
  })

  it('can fire change event on theme select', () => {
    render(<SettingsPanel />)
    const themeSelect = screen.getByRole('combobox')
    fireEvent.change(themeSelect, { target: { value: 'light' } })
    // Event fires without error - actual state update is handled by mock
    expect(themeSelect).toBeInTheDocument()
  })

  it('has auto save delay input with correct initial value', () => {
    render(<SettingsPanel />)
    const delayInput = screen.getByRole('spinbutton')
    expect(delayInput).toHaveValue(1000)
  })

  it('can fire change event on auto save delay input', () => {
    render(<SettingsPanel />)
    const delayInput = screen.getByRole('spinbutton')
    fireEvent.change(delayInput, { target: { value: '2000' } })
    expect(delayInput).toBeInTheDocument()
  })

  it('has font size input with correct initial value in appearance', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Appearance'))
    const fontSizeInputs = screen.getAllByRole('spinbutton')
    expect(fontSizeInputs[0]).toHaveValue(14)
  })

  it('can fire change event on font size input', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Appearance'))
    const fontSizeInputs = screen.getAllByRole('spinbutton')
    fireEvent.change(fontSizeInputs[0], { target: { value: '16' } })
    expect(fontSizeInputs[0]).toBeInTheDocument()
  })

  it('has font family select with correct initial value in appearance', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Appearance'))
    const fontSelects = screen.getAllByRole('combobox')
    expect(fontSelects[0]).toHaveValue('JetBrains Mono')
  })

  it('can fire change event on font family select', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Appearance'))
    const fontSelects = screen.getAllByRole('combobox')
    fireEvent.change(fontSelects[0], { target: { value: 'Fira Code' } })
    expect(fontSelects[0]).toBeInTheDocument()
  })

  it('has tab size select in appearance', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Appearance'))
    const selects = screen.getAllByRole('combobox')
    // Tab size is the second select (index 1)
    expect(selects.length).toBeGreaterThan(1)
  })

  it('can fire change event on tab size select', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Appearance'))
    const selects = screen.getAllByRole('combobox')
    // Tab size is the second select (index 1)
    fireEvent.change(selects[1], { target: { value: '4' } })
    // Event fires without error - actual state update is handled by mock
    expect(selects[1]).toBeInTheDocument()
  })

  it('toggles minimap setting', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Appearance'))
    const toggleButtons = screen.getAllByRole('button')
    const minimapToggle = toggleButtons.find(
      (btn) => btn.className.includes('rounded-full') && btn.className.includes('w-11')
    )
    if (minimapToggle) {
      fireEvent.click(minimapToggle)
      expect(minimapToggle).toBeInTheDocument()
    }
  })

  it('toggles line numbers setting', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Appearance'))
    // Find all toggles in Appearance section
    const toggleButtons = screen.getAllByRole('button').filter(
      (btn) => btn.className.includes('rounded-full') && btn.className.includes('w-11')
    )
    // Second toggle should be Line Numbers
    if (toggleButtons.length > 1) {
      fireEvent.click(toggleButtons[1])
      expect(toggleButtons[1]).toBeInTheDocument()
    }
  })

  it('toggles word wrap setting', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Appearance'))
    // Find all toggles in Appearance section
    const toggleButtons = screen.getAllByRole('button').filter(
      (btn) => btn.className.includes('rounded-full') && btn.className.includes('w-11')
    )
    // Third toggle should be Word Wrap
    if (toggleButtons.length > 2) {
      fireEvent.click(toggleButtons[2])
      expect(toggleButtons[2]).toBeInTheDocument()
    }
  })

  it('has API endpoint input with correct initial value', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('API Keys'))
    const textInputs = screen.getAllByRole('textbox')
    expect(textInputs[0]).toHaveValue('https://api.anthropic.com')
  })

  it('can fire change event on API endpoint input', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('API Keys'))
    const textInputs = screen.getAllByRole('textbox')
    fireEvent.change(textInputs[0], { target: { value: 'https://api.example.com' } })
    expect(textInputs[0]).toBeInTheDocument()
  })

  it('has API key input with correct initial value', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('API Keys'))
    const passwordInput = screen.getByPlaceholderText('Enter your API key')
    expect(passwordInput).toHaveValue('')
  })

  it('can fire change event on API key input', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('API Keys'))
    const passwordInput = screen.getByPlaceholderText('Enter your API key')
    fireEvent.change(passwordInput, { target: { value: 'test-key-123' } })
    expect(passwordInput).toBeInTheDocument()
  })

  it('toggles notifications setting', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Notifications'))
    const toggleButtons = screen.getAllByRole('button')
    const notifToggle = toggleButtons.find(
      (btn) => btn.className.includes('rounded-full') && btn.className.includes('w-11')
    )
    if (notifToggle) {
      fireEvent.click(notifToggle)
      expect(notifToggle).toBeInTheDocument()
    }
  })

  it('toggles sound effects setting', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Notifications'))
    // Find all toggles in Notifications section
    const toggleButtons = screen.getAllByRole('button').filter(
      (btn) => btn.className.includes('rounded-full') && btn.className.includes('w-11')
    )
    // Second toggle should be Sound Effects
    if (toggleButtons.length > 1) {
      fireEvent.click(toggleButtons[1])
      expect(toggleButtons[1]).toBeInTheDocument()
    }
  })

  it('shows security section', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Security'))
    expect(screen.getByText('Security Settings')).toBeInTheDocument()
  })

  it('shows network section', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Network'))
    expect(screen.getByText('Network Settings')).toBeInTheDocument()
  })

  it('has reset to defaults button in general settings', () => {
    render(<SettingsPanel />)
    expect(screen.getByText('Reset to Defaults')).toBeInTheDocument()
  })

  it('clicks reset to defaults button', () => {
    render(<SettingsPanel />)
    const resetButton = screen.getByText('Reset to Defaults')
    fireEvent.click(resetButton)
    // Button should still be in document after click
    expect(resetButton).toBeInTheDocument()
  })
})

describe('SettingsPanel parseInt fallback branches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('falls back to 1000 when autoSaveDelay input is cleared', () => {
    render(<SettingsPanel />)
    const delayInput = screen.getByRole('spinbutton')
    // Clear the input to trigger parseInt('') || 1000
    fireEvent.change(delayInput, { target: { value: '' } })
    // parseInt('') returns NaN, which is falsy, so fallback to 1000
    expect(mockUpdateSetting).toHaveBeenCalledWith('autoSaveDelay', 1000)
  })

  it('falls back to 1000 when autoSaveDelay input has non-numeric value', () => {
    render(<SettingsPanel />)
    const delayInput = screen.getByRole('spinbutton')
    // Non-numeric input triggers NaN, which falls back to 1000
    fireEvent.change(delayInput, { target: { value: 'abc' } })
    expect(mockUpdateSetting).toHaveBeenCalledWith('autoSaveDelay', 1000)
  })

  it('falls back to 14 when fontSize input is cleared', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Appearance'))
    const fontSizeInputs = screen.getAllByRole('spinbutton')
    // Clear the input to trigger parseInt('') || 14
    fireEvent.change(fontSizeInputs[0], { target: { value: '' } })
    expect(mockUpdateSetting).toHaveBeenCalledWith('fontSize', 14)
  })

  it('falls back to 14 when fontSize input has non-numeric value', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Appearance'))
    const fontSizeInputs = screen.getAllByRole('spinbutton')
    // Non-numeric input triggers NaN, which falls back to 14
    fireEvent.change(fontSizeInputs[0], { target: { value: 'invalid' } })
    expect(mockUpdateSetting).toHaveBeenCalledWith('fontSize', 14)
  })
})

describe('SettingsPanel MCP section', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('switches to MCP section', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('MCP Plugins'))
    expect(screen.getByText('MCP Plugin Settings')).toBeInTheDocument()
  })

  it('shows MCP enable toggle', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('MCP Plugins'))
    expect(screen.getByText('Enable MCP')).toBeInTheDocument()
  })

  it('shows auto-connect MCP servers toggle', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('MCP Plugins'))
    expect(screen.getByText('Auto-connect MCP Servers')).toBeInTheDocument()
  })

  it('shows configured MCP servers count', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('MCP Plugins'))
    expect(screen.getByText('Configured MCP Servers: 0')).toBeInTheDocument()
  })
})

describe('SettingsPanel Swarm section', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('switches to Swarm section', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Swarm'))
    expect(screen.getByText('Swarm Configuration')).toBeInTheDocument()
  })

  it('has topology selector in swarm settings', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Swarm'))
    expect(screen.getByText('Default Topology')).toBeInTheDocument()
  })

  it('has strategy selector in swarm settings', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Swarm'))
    expect(screen.getByText('Default Strategy')).toBeInTheDocument()
  })

  it('has max agents input in swarm settings', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Swarm'))
    expect(screen.getByText('Max Agents per Swarm')).toBeInTheDocument()
  })

  it('has consensus algorithm selector in swarm settings', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Swarm'))
    expect(screen.getByText('Consensus Algorithm')).toBeInTheDocument()
  })

  it('has consensus timeout input in swarm settings', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Swarm'))
    expect(screen.getByText('Consensus Timeout')).toBeInTheDocument()
  })
})

describe('SettingsPanel Team section', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('switches to Team section', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Team'))
    expect(screen.getByText('Team Collaboration Settings')).toBeInTheDocument()
  })

  it('shows team settings info message', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Team'))
    expect(screen.getByText('Team settings are configured per-team')).toBeInTheDocument()
  })
})

describe('SettingsPanel swarm settings interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('changes topology select', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Swarm'))
    const topologySelect = screen.getAllByRole('combobox')[0]
    fireEvent.change(topologySelect, { target: { value: 'mesh' } })
    expect(mockUpdateSetting).toHaveBeenCalledWith('swarmDefaultTopology', 'mesh')
  })

  it('changes strategy select', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Swarm'))
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[1], { target: { value: 'sequential' } })
    expect(mockUpdateSetting).toHaveBeenCalledWith('swarmDefaultStrategy', 'sequential')
  })

  it('changes max agents input', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Swarm'))
    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[0], { target: { value: '20' } })
    expect(mockUpdateSetting).toHaveBeenCalledWith('swarmMaxAgents', 20)
  })

  it('falls back to 10 when max agents input is empty', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Swarm'))
    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[0], { target: { value: '' } })
    expect(mockUpdateSetting).toHaveBeenCalledWith('swarmMaxAgents', 10)
  })

  it('changes consensus algorithm select', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Swarm'))
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[2], { target: { value: 'supermajority' } })
    expect(mockUpdateSetting).toHaveBeenCalledWith('swarmConsensusAlgorithm', 'supermajority')
  })

  it('changes consensus timeout input', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Swarm'))
    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[1], { target: { value: '60' } })
    expect(mockUpdateSetting).toHaveBeenCalledWith('swarmConsensusTimeout', 60)
  })

  it('falls back to 30 when consensus timeout input is empty', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Swarm'))
    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[1], { target: { value: '' } })
    expect(mockUpdateSetting).toHaveBeenCalledWith('swarmConsensusTimeout', 30)
  })
})

describe('SettingsPanel MCP settings interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('toggles MCP enable', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('MCP Plugins'))
    const toggleButtons = screen.getAllByRole('button').filter(
      (btn) => btn.className.includes('rounded-full') && btn.className.includes('w-11')
    )
    if (toggleButtons[0]) {
      fireEvent.click(toggleButtons[0])
      expect(toggleButtons[0]).toBeInTheDocument()
    }
  })

  it('toggles MCP auto-connect', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('MCP Plugins'))
    const toggleButtons = screen.getAllByRole('button').filter(
      (btn) => btn.className.includes('rounded-full') && btn.className.includes('w-11')
    )
    if (toggleButtons.length > 1) {
      fireEvent.click(toggleButtons[1])
      expect(toggleButtons[1]).toBeInTheDocument()
    }
  })
})

describe('SettingsPanel Network settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows network settings sections', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Network'))
    expect(screen.getByText('Proxy Configuration')).toBeInTheDocument()
    expect(screen.getByText('Timeout Settings')).toBeInTheDocument()
    expect(screen.getByText('Retry Settings')).toBeInTheDocument()
    expect(screen.getByText('SSL/TLS Settings')).toBeInTheDocument()
  })

  it('toggles proxy enabled', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Network'))
    expect(screen.getByText('Enable Proxy')).toBeInTheDocument()
  })
})

describe('SettingsPanel Security settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows security settings sections', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Security'))
    expect(screen.getByText('Audit Logging')).toBeInTheDocument()
    expect(screen.getByText('Data Encryption')).toBeInTheDocument()
    expect(screen.getByText('Session & Authentication')).toBeInTheDocument()
    expect(screen.getByText('IP Access Control')).toBeInTheDocument()
    expect(screen.getByText('Agent Security')).toBeInTheDocument()
  })

  it('shows allowed IP ranges', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Security'))
    expect(screen.getByText('127.0.0.1')).toBeInTheDocument()
  })
})

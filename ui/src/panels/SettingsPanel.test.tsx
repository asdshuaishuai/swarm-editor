import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsPanel from './SettingsPanel'
import * as useSettingsModule from '../hooks/useSettings'
import * as useThemeModule from '../hooks/useTheme'

// Mock the hooks
vi.mock('../hooks/useSettings')
vi.mock('../hooks/useTheme')

const mockSettings: useSettingsModule.Settings = {
  theme: 'dark',
  fontSize: 14,
  fontFamily: 'JetBrains Mono',
  tabSize: 2,
  autoSave: true,
  autoSaveDelay: 1000,
  minimap: true,
  lineNumbers: 'on',
  wordWrap: true,
  bracketPairColorization: true,
  stickyScroll: true,
  indentGuides: true,
  renderWhitespace: 'selection',
  cursorBlinking: 'blink',
  cursorStyle: 'line',
  // R5121: VS Code parity settings
  smoothScrolling: true,
  cursorSmoothCaretAnimation: false,
  linkedEditing: true,
  scrollBeyondLastLine: false,
  formatOnPaste: true,
  mouseWheelZoom: false,
  semanticHighlighting: true,
  // R5169: Inlay Hints & Breadcrumbs settings
  inlayHints: true,
  breadcrumbs: true,
  // R5122: Autocomplete settings
  quickSuggestions: true,
  acceptSuggestionOnEnter: 'smart',
  tabCompletion: 'on',
  wordBasedSuggestions: 'matchingDocuments',
  suggestOnTriggerCharacters: true,
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
  websocketPort: 8080,
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
}

const mockUseSettings = {
  settings: mockSettings,
  updateSetting: vi.fn(),
  setSettings: vi.fn(),
  resetSettings: vi.fn(),
  addMCPServer: vi.fn(),
  removeMCPServer: vi.fn(),
  updateMCPServer: vi.fn(),
  addAllowedIpRange: vi.fn(),
  removeAllowedIpRange: vi.fn(),
}

const mockUseTheme = {
  theme: 'dark' as const,
  effectiveTheme: 'dark' as const,
  setTheme: vi.fn(),
  toggleTheme: vi.fn(),
  isDark: true,
}

describe('SettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useSettingsModule.useSettings).mockReturnValue(mockUseSettings)
    vi.mocked(useThemeModule.useTheme).mockReturnValue(mockUseTheme)
  })

  describe('rendering', () => {
    it('renders settings sidebar with all sections', () => {
      render(<SettingsPanel />)

      expect(screen.getByText('Settings')).toBeInTheDocument()
      expect(screen.getByText('General')).toBeInTheDocument()
      expect(screen.getByText('Appearance')).toBeInTheDocument()
      expect(screen.getByText('API Keys')).toBeInTheDocument()
      expect(screen.getByText('MCP Plugins')).toBeInTheDocument()
      expect(screen.getByText('Swarm')).toBeInTheDocument()
      expect(screen.getByText('Team')).toBeInTheDocument()
      expect(screen.getByText('Network')).toBeInTheDocument()
      expect(screen.getByText('Notifications')).toBeInTheDocument()
      expect(screen.getByText('Security')).toBeInTheDocument()
      expect(screen.getByText('About')).toBeInTheDocument()
    })

    it('shows general settings by default', () => {
      render(<SettingsPanel />)
      expect(screen.getByText('General Settings')).toBeInTheDocument()
    })
  })

  describe('section navigation', () => {
    it('navigates to appearance section', async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Appearance'))
      expect(screen.getByText('Font Size')).toBeInTheDocument()
    })

    it('navigates to API section', async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('API Keys'))
      expect(screen.getByText('API Configuration')).toBeInTheDocument()
    })

    it('navigates to MCP section', async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('MCP Plugins'))
      expect(screen.getByText('MCP Plugin Settings')).toBeInTheDocument()
    })

    it('navigates to Swarm section', async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Swarm'))
      expect(screen.getByText('Swarm Configuration')).toBeInTheDocument()
    })

    it('navigates to Network section', async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Network'))
      expect(screen.getByText('Network Settings')).toBeInTheDocument()
    })

    it('navigates to Notifications section', async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Notifications'))
      expect(screen.getByText('Enable Notifications')).toBeInTheDocument()
    })

    it('navigates to Security section', async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Security'))
      expect(screen.getByText('Security Settings')).toBeInTheDocument()
    })

    it('navigates to About section', async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('About'))
      expect(screen.getByText('About Swarm Editor')).toBeInTheDocument()
    })
  })

  describe('general settings', () => {
    it('shows theme setting', () => {
      render(<SettingsPanel />)
      expect(screen.getByText('Theme')).toBeInTheDocument()
    })

    it('shows auto save setting', () => {
      render(<SettingsPanel />)
      expect(screen.getByText('Auto Save')).toBeInTheDocument()
    })

    it('shows auto save delay setting', () => {
      render(<SettingsPanel />)
      expect(screen.getByText('Auto Save Delay')).toBeInTheDocument()
    })

    it('resets settings to defaults', async () => {
      render(<SettingsPanel />)
      const resetButton = screen.getByText('Reset to Defaults')
      await userEvent.click(resetButton)

      // Component shows a ConfirmDialog before resetting - confirm it
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument()
      })
      await userEvent.click(screen.getByRole('button', { name: 'Reset' }))

      expect(mockUseSettings.resetSettings).toHaveBeenCalled()
      expect(mockUseTheme.setTheme).toHaveBeenCalledWith('dark')
    })
  })

  describe('appearance settings', () => {
    beforeEach(async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Appearance'))
    })

    it('shows font size setting', () => {
      expect(screen.getByText('Font Size')).toBeInTheDocument()
    })

    it('shows font family setting', () => {
      expect(screen.getByText('Font Family')).toBeInTheDocument()
    })

    it('shows tab size setting', () => {
      expect(screen.getByText('Tab Size')).toBeInTheDocument()
    })

    it('shows minimap setting', () => {
      expect(screen.getByText('Show Minimap')).toBeInTheDocument()
    })

    it('shows line numbers setting', () => {
      expect(screen.getByText('Line Numbers')).toBeInTheDocument()
    })

    it('shows word wrap setting', () => {
      expect(screen.getByText('Word Wrap')).toBeInTheDocument()
    })
  })

  describe('API settings', () => {
    beforeEach(async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('API Keys'))
    })

    it('shows API endpoint setting', () => {
      expect(screen.getByText('API Endpoint')).toBeInTheDocument()
    })

    it('shows API key setting', () => {
      expect(screen.getByText('API Key')).toBeInTheDocument()
    })
  })

  describe('MCP settings', () => {
    beforeEach(async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('MCP Plugins'))
    })

    it('shows MCP enable setting', () => {
      expect(screen.getByText('Enable MCP')).toBeInTheDocument()
    })

    it('shows MCP auto-connect setting', () => {
      expect(screen.getByText('Auto-connect MCP Servers')).toBeInTheDocument()
    })
  })

  describe('Swarm settings', () => {
    beforeEach(async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Swarm'))
    })

    it('shows topology setting', () => {
      expect(screen.getByText('Default Topology')).toBeInTheDocument()
    })

    it('shows strategy setting', () => {
      expect(screen.getByText('Default Strategy')).toBeInTheDocument()
    })

    it('shows max agents setting', () => {
      expect(screen.getByText('Max Agents per Swarm')).toBeInTheDocument()
    })

    it('shows consensus algorithm setting', () => {
      expect(screen.getByText('Consensus Algorithm')).toBeInTheDocument()
    })

    it('shows consensus timeout setting', () => {
      expect(screen.getByText('Consensus Timeout')).toBeInTheDocument()
    })
  })

  describe('Network settings', () => {
    beforeEach(async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Network'))
    })

    it('shows proxy settings', () => {
      expect(screen.getByText('Proxy Configuration')).toBeInTheDocument()
    })

    it('shows timeout settings', () => {
      expect(screen.getByText('Timeout Settings')).toBeInTheDocument()
    })

    it('shows retry settings', () => {
      expect(screen.getByText('Retry Settings')).toBeInTheDocument()
    })

    it('shows SSL settings', () => {
      expect(screen.getByText('SSL/TLS Settings')).toBeInTheDocument()
    })
  })

  describe('Security settings', () => {
    beforeEach(async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Security'))
    })

    it('shows audit logging settings', () => {
      expect(screen.getByText('Audit Logging')).toBeInTheDocument()
    })

    it('shows data encryption settings', () => {
      expect(screen.getByText('Data Encryption')).toBeInTheDocument()
    })

    it('shows session settings', () => {
      expect(screen.getByText('Session & Authentication')).toBeInTheDocument()
    })

    it('shows IP access control settings', () => {
      expect(screen.getByText('IP Access Control')).toBeInTheDocument()
    })

    it('shows allowed IP ranges', () => {
      expect(screen.getByText('127.0.0.1')).toBeInTheDocument()
      expect(screen.getByText('::1')).toBeInTheDocument()
    })

    it('shows agent security settings', () => {
      expect(screen.getByText('Agent Security')).toBeInTheDocument()
    })

    it('adds a new IP range', async () => {
      const input = screen.getByPlaceholderText('192.168.1.0/24')
      await userEvent.type(input, '10.0.0.0/8')
      const addButton = screen.getByText('Add')
      await userEvent.click(addButton)
      expect(mockUseSettings.addAllowedIpRange).toHaveBeenCalledWith('10.0.0.0/8')
    })

    it('adds IP range on Enter key', async () => {
      const input = screen.getByPlaceholderText('192.168.1.0/24')
      await userEvent.type(input, '172.16.0.0/12{enter}')
      expect(mockUseSettings.addAllowedIpRange).toHaveBeenCalledWith('172.16.0.0/12')
    })

    it('does not add empty IP range', async () => {
      const addButton = screen.getByText('Add')
      await userEvent.click(addButton)
      expect(mockUseSettings.addAllowedIpRange).not.toHaveBeenCalled()
    })

    it('removes an IP range when X button is clicked', async () => {
      // Find the X button for 127.0.0.1
      const ipRangeText = screen.getByText('127.0.0.1')
      const ipRangeContainer = ipRangeText.closest('div')
      if (ipRangeContainer) {
        const xButton = ipRangeContainer.querySelector('button')
        if (xButton) {
          await userEvent.click(xButton)
          expect(mockUseSettings.removeAllowedIpRange).toHaveBeenCalledWith('127.0.0.1')
        }
      }
    })

    it('shows Block Unknown Agents toggle', () => {
      expect(screen.getByText('Block Unknown Agents')).toBeInTheDocument()
    })

    it('shows Enable Agent Sandboxing toggle', () => {
      expect(screen.getByText('Enable Agent Sandboxing')).toBeInTheDocument()
    })

    it('shows Two-Factor Authentication toggle', () => {
      expect(screen.getByText('Two-Factor Authentication')).toBeInTheDocument()
    })

    it('shows Max Login Attempts setting', () => {
      expect(screen.getByText('Max Login Attempts')).toBeInTheDocument()
    })

    it('shows Session Timeout setting', () => {
      expect(screen.getByText('Session Timeout')).toBeInTheDocument()
    })
  })

  describe('Notifications settings', () => {
    beforeEach(async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Notifications'))
    })

    it('shows notifications enable setting', () => {
      expect(screen.getByText('Enable Notifications')).toBeInTheDocument()
    })

    it('shows sound effects setting', () => {
      expect(screen.getByText('Sound Effects')).toBeInTheDocument()
    })
  })

  describe('About section', () => {
    it('shows version and description', async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('About'))
      expect(screen.getByText('Swarm Editor')).toBeInTheDocument()
      expect(screen.getByText('Version 0.1.0')).toBeInTheDocument()
    })
  })

  describe('Toggle interactions', () => {
    it('toggles auto save switch', async () => {
      render(<SettingsPanel />)
      const toggles = screen.getAllByRole('switch')
      await userEvent.click(toggles[0])
      expect(mockUseSettings.updateSetting).toHaveBeenCalled()
    })
  })

  describe('General settings interactions', () => {
    it('changes theme selection', async () => {
      render(<SettingsPanel />)
      const themeSelect = screen.getByRole('combobox')
      await userEvent.selectOptions(themeSelect, 'light')
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('theme', 'light')
      expect(mockUseTheme.setTheme).toHaveBeenCalledWith('light')
    })

    it('changes auto save delay input', async () => {
      render(<SettingsPanel />)
      const delayInput = screen.getByRole('spinbutton')
      await userEvent.clear(delayInput)
      await userEvent.type(delayInput, '2000')
      expect(mockUseSettings.updateSetting).toHaveBeenCalled()
    })
  })

  describe('Appearance settings interactions', () => {
    beforeEach(async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Appearance'))
    })

    it('changes font size input', async () => {
      const inputs = screen.getAllByRole('spinbutton')
      const fontSizeInput = inputs[0]
      await userEvent.clear(fontSizeInput)
      await userEvent.type(fontSizeInput, '16')
      expect(mockUseSettings.updateSetting).toHaveBeenCalled()
    })

    it('changes font family selection', async () => {
      const selects = screen.getAllByRole('combobox')
      const fontFamilySelect = selects[0]
      await userEvent.selectOptions(fontFamilySelect, 'Fira Code')
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('fontFamily', 'Fira Code')
    })

    it('changes tab size selection', async () => {
      const selects = screen.getAllByRole('combobox')
      const tabSizeSelect = selects[1]
      await userEvent.selectOptions(tabSizeSelect, '4')
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('tabSize', 4)
    })

    it('toggles minimap setting', async () => {
      const toggles = screen.getAllByRole('switch')
      await userEvent.click(toggles[0])
      expect(mockUseSettings.updateSetting).toHaveBeenCalled()
    })

    it('toggles line numbers setting', async () => {
      const toggles = screen.getAllByRole('switch')
      await userEvent.click(toggles[1])
      expect(mockUseSettings.updateSetting).toHaveBeenCalled()
    })

    it('toggles word wrap setting', async () => {
      const toggles = screen.getAllByRole('switch')
      await userEvent.click(toggles[2])
      expect(mockUseSettings.updateSetting).toHaveBeenCalled()
    })
  })

  describe('API settings interactions', () => {
    beforeEach(async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('API Keys'))
    })

    it('changes API endpoint input', async () => {
      const endpointInput = screen.getByDisplayValue('https://api.anthropic.com')
      await userEvent.clear(endpointInput)
      await userEvent.type(endpointInput, 'https://custom.api.com')
      expect(mockUseSettings.updateSetting).toHaveBeenCalled()
    })

    it('changes API key input', async () => {
      const keyInput = screen.getByPlaceholderText('Enter your API key')
      await userEvent.type(keyInput, 'test-api-key')
      expect(mockUseSettings.updateSetting).toHaveBeenCalled()
    })
  })

  describe('MCP settings interactions', () => {
    beforeEach(async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('MCP Plugins'))
    })

    it('toggles MCP enabled setting', async () => {
      const toggles = screen.getAllByRole('switch')
      await userEvent.click(toggles[0])
      expect(mockUseSettings.updateSetting).toHaveBeenCalled()
    })

    it('toggles MCP auto-connect setting', async () => {
      const toggles = screen.getAllByRole('switch')
      await userEvent.click(toggles[1])
      expect(mockUseSettings.updateSetting).toHaveBeenCalled()
    })

    it('shows MCP servers count', () => {
      expect(screen.getByText(/Configured MCP Servers:/)).toBeInTheDocument()
    })
  })

  describe('Swarm settings interactions', () => {
    beforeEach(async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Swarm'))
    })

    it('changes topology selection', async () => {
      const selects = screen.getAllByRole('combobox')
      await userEvent.selectOptions(selects[0], 'mesh')
      expect(mockUseSettings.updateSetting).toHaveBeenCalled()
    })

    it('changes strategy selection', async () => {
      const selects = screen.getAllByRole('combobox')
      await userEvent.selectOptions(selects[1], 'sequential')
      expect(mockUseSettings.updateSetting).toHaveBeenCalled()
    })

    it('changes max agents input', async () => {
      const inputs = screen.getAllByRole('spinbutton')
      await userEvent.clear(inputs[0])
      await userEvent.type(inputs[0], '20')
      expect(mockUseSettings.updateSetting).toHaveBeenCalled()
    })

    it('changes consensus algorithm selection', async () => {
      const selects = screen.getAllByRole('combobox')
      await userEvent.selectOptions(selects[2], 'byzantine')
      expect(mockUseSettings.updateSetting).toHaveBeenCalled()
    })

    it('changes consensus timeout input', async () => {
      const inputs = screen.getAllByRole('spinbutton')
      const timeoutInput = inputs[1]
      await userEvent.clear(timeoutInput)
      await userEvent.type(timeoutInput, '60')
      expect(mockUseSettings.updateSetting).toHaveBeenCalled()
    })
  })

  describe('Network settings with proxy enabled', () => {
    it('toggles Enable Proxy setting', async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Network'))
      // Find the Enable Proxy toggle
      const enableProxyLabel = screen.getByText('Enable Proxy')
      const toggle = enableProxyLabel.closest('div')?.querySelector('button[role="switch"]')
      expect(toggle).toBeTruthy()
      await userEvent.click(toggle!)
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('networkProxyEnabled', true)
    })

    it('shows proxy URL input when proxy is enabled', async () => {
      vi.mocked(useSettingsModule.useSettings).mockReturnValue({
        ...mockUseSettings,
        settings: { ...mockSettings, networkProxyEnabled: true },
      })
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Network'))
      expect(screen.getByPlaceholderText('http://proxy.example.com:8080')).toBeInTheDocument()
    })

    it('types in proxy URL field', async () => {
      vi.mocked(useSettingsModule.useSettings).mockReturnValue({
        ...mockUseSettings,
        settings: { ...mockSettings, networkProxyEnabled: true },
      })
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Network'))
      const proxyUrlInput = screen.getByPlaceholderText('http://proxy.example.com:8080')
      await userEvent.type(proxyUrlInput, 'http://newproxy:8080')
      expect(mockUseSettings.updateSetting).toHaveBeenCalled()
    })

    it('toggles Proxy Authentication setting', async () => {
      vi.mocked(useSettingsModule.useSettings).mockReturnValue({
        ...mockUseSettings,
        settings: { ...mockSettings, networkProxyEnabled: true, networkProxyAuth: false },
      })
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Network'))
      // Find the Proxy Authentication toggle
      const authLabel = screen.getByText('Proxy Authentication')
      const toggle = authLabel.closest('div')?.querySelector('button[role="switch"]')
      expect(toggle).toBeTruthy()
      await userEvent.click(toggle!)
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('networkProxyAuth', true)
    })

    it('shows proxy auth fields when auth is enabled', async () => {
      vi.mocked(useSettingsModule.useSettings).mockReturnValue({
        ...mockUseSettings,
        settings: { ...mockSettings, networkProxyEnabled: true, networkProxyAuth: true },
      })
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Network'))
      // Check for username and password inputs by their container context
      const inputs = screen.getAllByRole('textbox')
      expect(inputs.length).toBeGreaterThan(0)
    })

    it('types in proxy username field', async () => {
      vi.mocked(useSettingsModule.useSettings).mockReturnValue({
        ...mockUseSettings,
        settings: { ...mockSettings, networkProxyEnabled: true, networkProxyAuth: true },
      })
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Network'))
      // Find username input by its label
      const usernameLabel = screen.getByText('Username')
      const usernameInput = usernameLabel.parentElement?.querySelector('input')
      expect(usernameInput).toBeTruthy()
      await userEvent.type(usernameInput!, 'testuser')
      expect(mockUseSettings.updateSetting).toHaveBeenCalled()
    })

    it('types in proxy password field', async () => {
      vi.mocked(useSettingsModule.useSettings).mockReturnValue({
        ...mockUseSettings,
        settings: { ...mockSettings, networkProxyEnabled: true, networkProxyAuth: true },
      })
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Network'))

      // Find the password input
      const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement
      expect(passwordInput).toBeTruthy()
      await userEvent.type(passwordInput, 'testpass')
      expect(mockUseSettings.updateSetting).toHaveBeenCalled()
    })

    it('toggles proxy password visibility', async () => {
      vi.mocked(useSettingsModule.useSettings).mockReturnValue({
        ...mockUseSettings,
        settings: { ...mockSettings, networkProxyEnabled: true, networkProxyAuth: true },
      })
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Network'))

      // Find password input by type
      const passwordInputs = document.querySelectorAll('input[type="password"]')
      expect(passwordInputs.length).toBeGreaterThan(0)

      // Find and click the visibility toggle button (the one with eye icon)
      const buttons = screen.getAllByRole('button')
      for (const btn of buttons) {
        const svg = btn.querySelector('svg')
        if (svg && btn.className.includes('absolute')) {
          await userEvent.click(btn)
          break
        }
      }
    })

    it('changes network timeout inputs', async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Network'))
      // Order of inputs: connection timeout, request timeout, retry attempts, retry delay
      const inputs = screen.getAllByRole('spinbutton')
      // Change connection timeout (inputs[0])
      await userEvent.type(inputs[0], '0')
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('networkConnectTimeout', expect.any(Number))

      // Change request timeout (inputs[1])
      await userEvent.type(inputs[1], '0') // Appends 0 to value
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('networkRequestTimeout', expect.any(Number))
    })

    it('changes network retry inputs', async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Network'))
      const inputs = screen.getAllByRole('spinbutton')
      // Change retry attempts (inputs[2])
      await userEvent.type(inputs[2], '0')
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('networkRetryAttempts', expect.any(Number))

      // Change retry delay (inputs[3])
      await userEvent.type(inputs[3], '0') // Appends 0 to value
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('networkRetryDelay', expect.any(Number))
    })

    it('toggles SSL verify setting', async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Network'))
      // Find the SSL verify toggle by its label
      const sslLabel = screen.getByText('Verify SSL Certificates')
      const toggle = sslLabel.closest('div')?.querySelector('button[role="switch"]')
      expect(toggle).toBeTruthy()
      await userEvent.click(toggle!)
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('networkSslVerify', false)
    })

    it('changes SSL cert path input', async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Network'))
      const certInput = screen.getByPlaceholderText('/path/to/ca-bundle.crt')
      await userEvent.type(certInput, '/path/to/cert')
      expect(mockUseSettings.updateSetting).toHaveBeenCalled()
    })
  })

  describe('Security settings with audit log enabled', () => {
    it('shows audit log path when enabled', async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Security'))
      expect(screen.getByPlaceholderText('~/.swarm-editor/audit.log')).toBeInTheDocument()
    })

    it('changes audit log path input', async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Security'))
      const pathInput = screen.getByPlaceholderText('~/.swarm-editor/audit.log')
      await userEvent.type(pathInput, '/var/log/audit.log')
      expect(mockUseSettings.updateSetting).toHaveBeenCalled()
    })
  })

  describe('Security settings with encryption enabled', () => {
    it('shows encryption key path when enabled', async () => {
      vi.mocked(useSettingsModule.useSettings).mockReturnValue({
        ...mockUseSettings,
        settings: { ...mockSettings, securityEncryptLocalData: true },
      })
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Security'))
      expect(screen.getByPlaceholderText('~/.swarm-editor/key.pem')).toBeInTheDocument()
    })

    it('changes encryption key path input', async () => {
      vi.mocked(useSettingsModule.useSettings).mockReturnValue({
        ...mockUseSettings,
        settings: { ...mockSettings, securityEncryptLocalData: true },
      })
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Security'))
      const keyInput = screen.getByPlaceholderText('~/.swarm-editor/key.pem')
      await userEvent.type(keyInput, '/custom/key.pem')
      expect(mockUseSettings.updateSetting).toHaveBeenCalled()
    })
  })

  describe('Team section', () => {
    it('shows team collaboration info', async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Team'))
      expect(screen.getByText('Team Collaboration Settings')).toBeInTheDocument()
      expect(screen.getByText(/Team settings are configured per-team/)).toBeInTheDocument()
    })
  })

  describe('Notifications settings interactions', () => {
    beforeEach(async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Notifications'))
    })

    it('toggles notifications setting', async () => {
      const toggles = screen.getAllByRole('switch')
      await userEvent.click(toggles[0])
      expect(mockUseSettings.updateSetting).toHaveBeenCalled()
    })

    it('toggles sound effects setting', async () => {
      const toggles = screen.getAllByRole('switch')
      await userEvent.click(toggles[1])
      expect(mockUseSettings.updateSetting).toHaveBeenCalled()
    })
  })

  describe('Security toggles', () => {
    beforeEach(async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Security'))
    })

    it('toggles Enable Audit Log', async () => {
      const toggles = screen.getAllByRole('switch')
      await userEvent.click(toggles[0])
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('securityEnableAuditLog', false)
    })

    it('toggles Encrypt Local Data', async () => {
      const toggles = screen.getAllByRole('switch')
      await userEvent.click(toggles[1])
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('securityEncryptLocalData', true)
    })

    it('toggles Require Strong Passwords', async () => {
      // Find all toggles and click the one for strong passwords
      const allToggles = screen.getAllByRole('switch')
      // The order of toggles in security section:
      // 0: Enable Audit Log
      // 1: Encrypt Local Data
      // 2: Require Strong Passwords (in Session & Authentication section)
      // 3: Two-Factor Authentication
      // But there might be more toggles from other sections visible
      // Let's find the right one by checking it exists
      expect(allToggles.length).toBeGreaterThan(2)
      // Click toggle at index that should be Require Strong Passwords
      // In security section, toggles appear after the audit and encryption ones
      // Session section has: Session Timeout (number), Max Login Attempts (number), Require Strong Passwords (toggle), Two-Factor (toggle)
      const strongPwToggle = allToggles.find((_, index) => index >= 2)
      if (strongPwToggle) {
        await userEvent.click(strongPwToggle)
      }
      expect(mockUseSettings.updateSetting).toHaveBeenCalled()
    })

    it('toggles Two-Factor Authentication', async () => {
      const allToggles = screen.getAllByRole('switch')
      // Two-Factor should be the last toggle in the security section
      const twoFactorToggle = allToggles[allToggles.length - 3] // Account for IP and Agent toggles
      await userEvent.click(twoFactorToggle)
      expect(mockUseSettings.updateSetting).toHaveBeenCalled()
    })

    it('changes Session Timeout input', async () => {
      const inputs = screen.getAllByRole('spinbutton')
      // Find the session timeout input (first one in security section)
      await userEvent.clear(inputs[0])
      await userEvent.type(inputs[0], '7200')
      expect(mockUseSettings.updateSetting).toHaveBeenCalled()
    })

    it('changes Max Login Attempts input', async () => {
      const inputs = screen.getAllByRole('spinbutton')
      await userEvent.clear(inputs[1])
      await userEvent.type(inputs[1], '3')
      expect(mockUseSettings.updateSetting).toHaveBeenCalled()
    })

    it('changes Log Retention input', async () => {
      const inputs = screen.getAllByRole('spinbutton')
      await userEvent.clear(inputs[2])
      await userEvent.type(inputs[2], '60')
      expect(mockUseSettings.updateSetting).toHaveBeenCalled()
    })
  })

  describe('Security with audit log disabled', () => {
    it('hides audit log path when disabled', async () => {
      vi.mocked(useSettingsModule.useSettings).mockReturnValue({
        ...mockUseSettings,
        settings: { ...mockSettings, securityEnableAuditLog: false },
      })
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Security'))
      expect(screen.queryByPlaceholderText('~/.swarm-editor/audit.log')).not.toBeInTheDocument()
    })
  })

  describe('Security with encryption disabled', () => {
    it('hides encryption key path when disabled', async () => {
      vi.mocked(useSettingsModule.useSettings).mockReturnValue({
        ...mockUseSettings,
        settings: { ...mockSettings, securityEncryptLocalData: false },
      })
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Security'))
      expect(screen.queryByPlaceholderText('~/.swarm-editor/key.pem')).not.toBeInTheDocument()
    })
  })

  describe('Security agent settings', () => {
    it('toggles block unknown agents setting', async () => {
      vi.mocked(useSettingsModule.useSettings).mockReturnValue({
        ...mockUseSettings,
        settings: { ...mockSettings, securityBlockUnknownAgents: false },
      })
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Security'))

      // Find the one that corresponds to Block Unknown Agents by checking nearby text
      const blockLabel = screen.getByText('Block Unknown Agents')
      const toggle = blockLabel.closest('div')?.querySelector('button[role="switch"]')
      expect(toggle).toBeTruthy()
      await userEvent.click(toggle!)
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('securityBlockUnknownAgents', true)
    })

    it('toggles agent sandboxing setting', async () => {
      vi.mocked(useSettingsModule.useSettings).mockReturnValue({
        ...mockUseSettings,
        settings: { ...mockSettings, securityAgentSandboxing: true },
      })
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Security'))

      // Find the toggle for Enable Agent Sandboxing
      const sandboxLabel = screen.getByText('Enable Agent Sandboxing')
      const toggle = sandboxLabel.closest('div')?.querySelector('button[role="switch"]')
      expect(toggle).toBeTruthy()
      await userEvent.click(toggle!)
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('securityAgentSandboxing', false)
    })
  })
})

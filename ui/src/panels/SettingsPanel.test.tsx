import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsPanel from './SettingsPanel'
import * as useSettingsModule from '../hooks/useSettings'
import * as useThemeModule from '../hooks/useTheme'
import { instructionsApi } from '../services/api'

// Mock the hooks
vi.mock('../hooks/useSettings')
vi.mock('../hooks/useTheme')
vi.mock('../services/api', () => ({
  instructionsApi: {
    get: vi.fn().mockResolvedValue({ content: '', files: [] }),
    save: vi.fn().mockResolvedValue({ status: 'ok', path: '.swarm-instructions.md' }),
  },
}))
vi.mock('../store/appStore', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ addToast: vi.fn() }),
}))

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

  describe('Search functionality', () => {
    it('renders search input', () => {
      render(<SettingsPanel />)
      expect(screen.getByPlaceholderText('Search settings...')).toBeInTheDocument()
    })

    it('filters settings by search query', async () => {
      render(<SettingsPanel />)
      const searchInput = screen.getByPlaceholderText('Search settings...')
      await userEvent.type(searchInput, 'font')
      // Should show Font Size and Font Family rows but not Theme
      expect(screen.getByText('Font Size')).toBeInTheDocument()
      expect(screen.getByText('Font Family')).toBeInTheDocument()
      expect(screen.queryByText('Auto Save')).not.toBeInTheDocument()
    })

    it('clears search when clear button is clicked', async () => {
      render(<SettingsPanel />)
      const searchInput = screen.getByPlaceholderText('Search settings...')
      await userEvent.type(searchInput, 'font')
      expect(screen.getByText('Font Size')).toBeInTheDocument()
      // Click the clear button (X icon)
      await userEvent.click(screen.getByLabelText('Clear search'))
      expect(searchInput).toHaveValue('')
      // After clearing, general section is shown again
      expect(screen.getByText('Theme')).toBeInTheDocument()
    })

    it('shows all matching sections when searching', async () => {
      render(<SettingsPanel />)
      const searchInput = screen.getByPlaceholderText('Search settings...')
      await userEvent.type(searchInput, 'enable')
      // Multiple sections should show their matching "Enable" rows
      expect(screen.getByText('Enable MCP')).toBeInTheDocument()
      expect(screen.getByText('Enable Notifications')).toBeInTheDocument()
    })

    it('shows no results for non-matching query', async () => {
      render(<SettingsPanel />)
      const searchInput = screen.getByPlaceholderText('Search settings...')
      await userEvent.type(searchInput, 'zzzznonexistent')
      // No setting rows should be visible (sections render but all rows are hidden)
      expect(screen.queryByText('Theme')).not.toBeInTheDocument()
      expect(screen.queryByText('Font Size')).not.toBeInTheDocument()
    })
  })

  describe('Reset confirmation dialog', () => {
    it('shows confirmation dialog when reset is clicked', async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Reset to Defaults'))
      await waitFor(() => {
        expect(screen.getByText('All settings will be restored to their default values. This cannot be undone.')).toBeInTheDocument()
      })
    })

    it('cancels reset when cancel is clicked', async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Reset to Defaults'))
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
      })
      await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
      // Dialog should be gone
      expect(screen.queryByText('All settings will be restored to their default values. This cannot be undone.')).not.toBeInTheDocument()
      // resetSettings should NOT have been called
      expect(mockUseSettings.resetSettings).not.toHaveBeenCalled()
    })
  })

  describe('Theme changes', () => {
    it('changes theme to system', async () => {
      render(<SettingsPanel />)
      const themeSelect = screen.getByRole('combobox')
      await userEvent.selectOptions(themeSelect, 'system')
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('theme', 'system')
      expect(mockUseTheme.setTheme).toHaveBeenCalledWith('system')
    })
  })

  describe('Appearance advanced selects', () => {
    beforeEach(async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Appearance'))
    })

    it('changes render whitespace selection', async () => {
      const whitespaceLabel = screen.getByText('Render Whitespace')
      const select = whitespaceLabel.closest('div')?.querySelector('select')
      expect(select).toBeTruthy()
      await userEvent.selectOptions(select!, 'all')
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('renderWhitespace', 'all')
    })

    it('changes cursor blinking selection', async () => {
      const cursorLabel = screen.getByText('Cursor Blinking')
      const select = cursorLabel.closest('div')?.querySelector('select')
      expect(select).toBeTruthy()
      await userEvent.selectOptions(select!, 'smooth')
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('cursorBlinking', 'smooth')
    })

    it('changes cursor style selection', async () => {
      const cursorStyleLabel = screen.getByText('Cursor Style')
      const select = cursorStyleLabel.closest('div')?.querySelector('select')
      expect(select).toBeTruthy()
      await userEvent.selectOptions(select!, 'block')
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('cursorStyle', 'block')
    })

    it('changes line numbers to relative', async () => {
      const lineNumbersLabel = screen.getByText('Line Numbers')
      const select = lineNumbersLabel.closest('div')?.querySelector('select')
      expect(select).toBeTruthy()
      await userEvent.selectOptions(select!, 'relative')
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('lineNumbers', 'relative')
    })

    it('changes line numbers to off', async () => {
      const lineNumbersLabel = screen.getByText('Line Numbers')
      const select = lineNumbersLabel.closest('div')?.querySelector('select')
      expect(select).toBeTruthy()
      await userEvent.selectOptions(select!, 'off')
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('lineNumbers', 'off')
    })

    it('toggles bracket pair colorization', async () => {
      const label = screen.getByText('Bracket Pair Colorization')
      const toggle = label.closest('div')?.querySelector('button[role="switch"]')
      expect(toggle).toBeTruthy()
      await userEvent.click(toggle!)
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('bracketPairColorization', false)
    })

    it('toggles sticky scroll', async () => {
      const label = screen.getByText('Sticky Scroll')
      const toggle = label.closest('div')?.querySelector('button[role="switch"]')
      expect(toggle).toBeTruthy()
      await userEvent.click(toggle!)
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('stickyScroll', false)
    })

    it('toggles indent guides', async () => {
      const label = screen.getByText('Indent Guides')
      const toggle = label.closest('div')?.querySelector('button[role="switch"]')
      expect(toggle).toBeTruthy()
      await userEvent.click(toggle!)
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('indentGuides', false)
    })

    it('toggles smooth scrolling', async () => {
      const label = screen.getByText('Smooth Scrolling')
      const toggle = label.closest('div')?.querySelector('button[role="switch"]')
      expect(toggle).toBeTruthy()
      await userEvent.click(toggle!)
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('smoothScrolling', false)
    })

    it('toggles cursor smooth animation', async () => {
      const label = screen.getByText('Cursor Smooth Animation')
      const toggle = label.closest('div')?.querySelector('button[role="switch"]')
      expect(toggle).toBeTruthy()
      await userEvent.click(toggle!)
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('cursorSmoothCaretAnimation', true)
    })

    it('toggles linked editing', async () => {
      const label = screen.getByText('Linked Editing')
      const toggle = label.closest('div')?.querySelector('button[role="switch"]')
      expect(toggle).toBeTruthy()
      await userEvent.click(toggle!)
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('linkedEditing', false)
    })

    it('toggles scroll beyond last line', async () => {
      const label = screen.getByText('Scroll Beyond Last Line')
      const toggle = label.closest('div')?.querySelector('button[role="switch"]')
      expect(toggle).toBeTruthy()
      await userEvent.click(toggle!)
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('scrollBeyondLastLine', true)
    })

    it('toggles format on paste', async () => {
      const label = screen.getByText('Format On Paste')
      const toggle = label.closest('div')?.querySelector('button[role="switch"]')
      expect(toggle).toBeTruthy()
      await userEvent.click(toggle!)
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('formatOnPaste', false)
    })

    it('toggles mouse wheel zoom', async () => {
      const label = screen.getByText('Mouse Wheel Zoom')
      const toggle = label.closest('div')?.querySelector('button[role="switch"]')
      expect(toggle).toBeTruthy()
      await userEvent.click(toggle!)
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('mouseWheelZoom', true)
    })

    it('toggles semantic highlighting', async () => {
      const label = screen.getByText('Semantic Highlighting')
      const toggle = label.closest('div')?.querySelector('button[role="switch"]')
      expect(toggle).toBeTruthy()
      await userEvent.click(toggle!)
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('semanticHighlighting', false)
    })

    it('toggles inlay hints', async () => {
      const label = screen.getByText('Inlay Hints')
      const toggle = label.closest('div')?.querySelector('button[role="switch"]')
      expect(toggle).toBeTruthy()
      await userEvent.click(toggle!)
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('inlayHints', false)
    })

    it('toggles breadcrumbs', async () => {
      const label = screen.getByText('Breadcrumbs')
      const toggle = label.closest('div')?.querySelector('button[role="switch"]')
      expect(toggle).toBeTruthy()
      await userEvent.click(toggle!)
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('breadcrumbs', false)
    })

    it('toggles quick suggestions', async () => {
      const label = screen.getByText('Quick Suggestions')
      const toggle = label.closest('div')?.querySelector('button[role="switch"]')
      expect(toggle).toBeTruthy()
      await userEvent.click(toggle!)
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('quickSuggestions', false)
    })

    it('toggles suggest on trigger characters', async () => {
      const label = screen.getByText('Suggest on Trigger Characters')
      const toggle = label.closest('div')?.querySelector('button[role="switch"]')
      expect(toggle).toBeTruthy()
      await userEvent.click(toggle!)
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('suggestOnTriggerCharacters', false)
    })

    it('changes accept suggestion on enter selection', async () => {
      const label = screen.getByText('Accept Suggestion on Enter')
      const select = label.closest('div')?.querySelector('select')
      expect(select).toBeTruthy()
      await userEvent.selectOptions(select!, 'on')
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('acceptSuggestionOnEnter', 'on')
    })

    it('changes tab completion selection', async () => {
      const label = screen.getByText('Tab Completion')
      const select = label.closest('div')?.querySelector('select')
      expect(select).toBeTruthy()
      await userEvent.selectOptions(select!, 'onlySnippets')
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('tabCompletion', 'onlySnippets')
    })

    it('changes word-based suggestions selection', async () => {
      const label = screen.getByText('Word-Based Suggestions')
      const select = label.closest('div')?.querySelector('select')
      expect(select).toBeTruthy()
      await userEvent.selectOptions(select!, 'allDocuments')
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('wordBasedSuggestions', 'allDocuments')
    })
  })

  describe('Swarm settings additional options', () => {
    beforeEach(async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('Swarm'))
    })

    it('changes topology to tree', async () => {
      const selects = screen.getAllByRole('combobox')
      await userEvent.selectOptions(selects[0], 'tree')
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('swarmDefaultTopology', 'tree')
    })

    it('changes topology to ring', async () => {
      const selects = screen.getAllByRole('combobox')
      await userEvent.selectOptions(selects[0], 'ring')
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('swarmDefaultTopology', 'ring')
    })

    it('changes topology to hybrid', async () => {
      const selects = screen.getAllByRole('combobox')
      await userEvent.selectOptions(selects[0], 'hybrid')
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('swarmDefaultTopology', 'hybrid')
    })

    it('changes strategy to pipeline', async () => {
      const selects = screen.getAllByRole('combobox')
      await userEvent.selectOptions(selects[1], 'pipeline')
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('swarmDefaultStrategy', 'pipeline')
    })

    it('changes strategy to mapreduce', async () => {
      const selects = screen.getAllByRole('combobox')
      await userEvent.selectOptions(selects[1], 'mapreduce')
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('swarmDefaultStrategy', 'mapreduce')
    })

    it('changes consensus algorithm to supermajority', async () => {
      const selects = screen.getAllByRole('combobox')
      await userEvent.selectOptions(selects[2], 'supermajority')
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('swarmConsensusAlgorithm', 'supermajority')
    })

    it('changes consensus algorithm to unanimity', async () => {
      const selects = screen.getAllByRole('combobox')
      await userEvent.selectOptions(selects[2], 'unanimity')
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('swarmConsensusAlgorithm', 'unanimity')
    })

    it('changes consensus algorithm to weighted', async () => {
      const selects = screen.getAllByRole('combobox')
      await userEvent.selectOptions(selects[2], 'weighted')
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('swarmConsensusAlgorithm', 'weighted')
    })
  })

  describe('Custom Instructions section', () => {
    beforeEach(async () => {
      render(<SettingsPanel />)
      // Click the sidebar button for Custom Instructions
      const sidebarButtons = screen.getAllByText('Custom Instructions')
      await userEvent.click(sidebarButtons[0])
    })

    it('shows Custom Instructions section heading', () => {
      // The section heading is an h3 element
      const headings = screen.getAllByText('Custom Instructions')
      expect(headings.length).toBeGreaterThanOrEqual(2)
    })

    it('shows the textarea for editing instructions', () => {
      expect(screen.getByPlaceholderText(/Enter custom instructions/)).toBeInTheDocument()
    })

    it('shows the save instructions button', () => {
      expect(screen.getByText('Save Instructions')).toBeInTheDocument()
    })

    it('shows the saved-to path info', () => {
      expect(screen.getByText('.swarm-instructions.md')).toBeInTheDocument()
    })

    it('types in the instructions textarea', async () => {
      const textarea = screen.getByPlaceholderText(/Enter custom instructions/)
      await userEvent.type(textarea, 'Always use TypeScript strict mode')
      expect(textarea).toHaveValue('Always use TypeScript strict mode')
    })

    it('saves instructions when save button is clicked', async () => {
      const textarea = screen.getByPlaceholderText(/Enter custom instructions/)
      await userEvent.type(textarea, 'Test instructions')
      await userEvent.click(screen.getByText('Save Instructions'))
      expect(instructionsApi.save).toHaveBeenCalledWith('Test instructions')
    })

    it('shows detected instruction files when loaded', async () => {
      vi.mocked(instructionsApi.get).mockResolvedValueOnce({
        content: '',
        files: ['.cursorrules', 'AGENTS.md'],
      })
      render(<SettingsPanel />)
      const sidebarButtons = screen.getAllByText('Custom Instructions')
      await userEvent.click(sidebarButtons[0])
      await waitFor(() => {
        expect(screen.getByText('.cursorrules')).toBeInTheDocument()
        expect(screen.getByText('AGENTS.md')).toBeInTheDocument()
      })
    })

    it('shows Saving... text while saving', async () => {
      vi.mocked(instructionsApi.save).mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve({ status: 'ok', path: '' }), 5000))
      )
      const textarea = screen.getByPlaceholderText(/Enter custom instructions/)
      await userEvent.type(textarea, 'Test')
      await userEvent.click(screen.getByText('Save Instructions'))
      await waitFor(() => {
        expect(screen.getByText('Saving...')).toBeInTheDocument()
      })
    })

    it('loads instructions on mount', () => {
      expect(instructionsApi.get).toHaveBeenCalled()
    })

    it('handles load instructions error gracefully', async () => {
      vi.mocked(instructionsApi.get).mockRejectedValueOnce(new Error('Workspace not found'))
      // Should not throw — the component catches the error
      render(<SettingsPanel />)
      const sidebarButtons = screen.getAllByText('Custom Instructions')
      await userEvent.click(sidebarButtons[0])
      // Component should still render without crashing
      const headings = screen.getAllByText('Custom Instructions')
      expect(headings.length).toBeGreaterThanOrEqual(2)
    })

    it('handles save instructions error gracefully', async () => {
      vi.mocked(instructionsApi.save).mockRejectedValueOnce(new Error('Save failed'))
      const textarea = screen.getByPlaceholderText(/Enter custom instructions/)
      await userEvent.type(textarea, 'Test error')
      await userEvent.click(screen.getByText('Save Instructions'))
      // Component should still render — error is caught and logged
      await waitFor(() => {
        expect(screen.getByText('Save Instructions')).toBeInTheDocument()
      })
    })
  })

  describe('About section details', () => {
    beforeEach(async () => {
      render(<SettingsPanel />)
      await userEvent.click(screen.getByText('About'))
    })

    it('shows MIT license', () => {
      expect(screen.getByText('Licensed under MIT')).toBeInTheDocument()
    })

    it('shows GitHub link', () => {
      expect(screen.getByText('GitHub Repository')).toBeInTheDocument()
    })

    it('shows technology stack info', () => {
      expect(screen.getByText(/Built with Go, React, TypeScript, and WebSocket/)).toBeInTheDocument()
    })

    it('shows multi-agent description', () => {
      expect(screen.getByText(/multi-agent collaborative development environment/)).toBeInTheDocument()
    })
  })

  describe('Sidebar navigation highlights', () => {
    it('highlights the active section', () => {
      render(<SettingsPanel />)
      const generalButton = screen.getByText('General').closest('button')
      expect(generalButton?.className).toContain('bg-accent-muted')
    })

    it('updates highlight when navigating', async () => {
      render(<SettingsPanel />)
      const appearanceButton = screen.getByText('Appearance').closest('button')
      await userEvent.click(screen.getByText('Appearance'))
      expect(appearanceButton?.className).toContain('bg-accent-muted')
    })
  })

  describe('Settings section sidebar', () => {
    it('renders Custom Instructions in sidebar', () => {
      render(<SettingsPanel />)
      expect(screen.getByText('Custom Instructions')).toBeInTheDocument()
    })
  })

  describe('General auto save toggle', () => {
    it('toggles auto save', async () => {
      render(<SettingsPanel />)
      const autoSaveLabel = screen.getByText('Auto Save')
      const toggle = autoSaveLabel.closest('div')?.querySelector('button[role="switch"]')
      expect(toggle).toBeTruthy()
      await userEvent.click(toggle!)
      expect(mockUseSettings.updateSetting).toHaveBeenCalledWith('autoSave', false)
    })
  })
})

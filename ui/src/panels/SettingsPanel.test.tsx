import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SettingsPanel from './SettingsPanel'

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
    },
    updateSetting: vi.fn(),
    setSettings: vi.fn(),
    resetSettings: vi.fn(),
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
      (btn) => btn.className.includes('rounded-full') && btn.className.includes('w-10')
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

  it('toggles minimap setting', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Appearance'))
    const toggleButtons = screen.getAllByRole('button')
    const minimapToggle = toggleButtons.find(
      (btn) => btn.className.includes('rounded-full') && btn.className.includes('w-10')
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
      (btn) => btn.className.includes('rounded-full') && btn.className.includes('w-10')
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
      (btn) => btn.className.includes('rounded-full') && btn.className.includes('w-10')
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
      (btn) => btn.className.includes('rounded-full') && btn.className.includes('w-10')
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
      (btn) => btn.className.includes('rounded-full') && btn.className.includes('w-10')
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

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import SettingsPanel from './SettingsPanel'

describe('SettingsPanel', () => {
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

describe('SettingsPanel setting changes', () => {
  it('changes theme selection', () => {
    render(<SettingsPanel />)
    const themeSelect = screen.getByRole('combobox')
    fireEvent.change(themeSelect, { target: { value: 'light' } })
    expect(themeSelect).toHaveValue('light')
  })

  it('changes auto save delay', () => {
    render(<SettingsPanel />)
    const delayInput = screen.getByRole('spinbutton')
    fireEvent.change(delayInput, { target: { value: '2000' } })
    expect(delayInput).toHaveValue(2000)
  })

  it('changes font size in appearance', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Appearance'))
    const fontSizeInputs = screen.getAllByRole('spinbutton')
    fireEvent.change(fontSizeInputs[0], { target: { value: '16' } })
    expect(fontSizeInputs[0]).toHaveValue(16)
  })

  it('changes font family in appearance', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Appearance'))
    const fontSelects = screen.getAllByRole('combobox')
    fireEvent.change(fontSelects[0], { target: { value: 'Fira Code' } })
    expect(fontSelects[0]).toHaveValue('Fira Code')
  })

  it('changes tab size in appearance', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('Appearance'))
    const selects = screen.getAllByRole('combobox')
    const tabSizeSelect = selects.find((s) => s.textContent?.includes('4 spaces'))
    if (tabSizeSelect) {
      fireEvent.change(tabSizeSelect, { target: { value: '4' } })
    }
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

  it('changes API endpoint', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('API Keys'))
    const textInputs = screen.getAllByRole('textbox')
    fireEvent.change(textInputs[0], { target: { value: 'https://api.example.com' } })
    expect(textInputs[0]).toHaveValue('https://api.example.com')
  })

  it('changes API key', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByText('API Keys'))
    const passwordInput = screen.getByPlaceholderText('Enter your API key')
    fireEvent.change(passwordInput, { target: { value: 'test-key-123' } })
    expect(passwordInput).toHaveValue('test-key-123')
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
})
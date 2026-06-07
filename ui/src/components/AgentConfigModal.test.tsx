import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AgentConfigModal from './AgentConfigModal'

const mockAddAgent = vi.fn().mockResolvedValue({})
const mockUpdateAgent = vi.fn().mockResolvedValue({})
const mockGetAgentConfig = vi.fn()
const mockUpdateAgentConfig = vi.fn().mockResolvedValue({ success: true })
const mockGetAgentConfigFile = vi.fn()
const mockUpdateAgentConfigFile = vi.fn().mockResolvedValue({ success: true })
const mockAddToast = vi.fn()

vi.mock('../services', () => ({
  api: {
    agent: {
      addAgent: (...args: any[]) => mockAddAgent(...args),
      updateAgent: (...args: any[]) => mockUpdateAgent(...args),
      getAgentConfig: (...args: any[]) => mockGetAgentConfig(...args),
      updateAgentConfig: (...args: any[]) => mockUpdateAgentConfig(...args),
      getAgentConfigFile: (...args: any[]) => mockGetAgentConfigFile(...args),
      updateAgentConfigFile: (...args: any[]) => mockUpdateAgentConfigFile(...args),
    },
  },
}))

vi.mock('../utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('../store/appStore', () => ({
  useAppStore: (selector: any) => selector({ addToast: mockAddToast }),
}))

vi.mock('lucide-react', () => ({
  Bot: () => <span data-testid="bot-icon" />,
  Loader2: (props: any) => <span data-testid="loader" className={props.className} />,
  X: () => <span data-testid="x-icon" />,
  Shield: () => <span data-testid="shield-icon" />,
  Globe: () => <span data-testid="globe-icon" />,
  Eye: () => <span data-testid="eye-icon" />,
  EyeOff: () => <span data-testid="eye-off-icon" />,
}))

const defaultNativeConfig = {
  agentId: 'claude-code',
  agentName: 'Claude Code',
  configPath: '/home/user/.claude/settings.json',
  providerCategory: 'first_party' as const,
  providerPreset: 'Anthropic Official',
  providerPresets: [
    { name: 'Anthropic Official', category: 'first_party' as const, baseUrl: 'https://api.anthropic.com', models: ['claude-sonnet-4-20250514'] },
    { name: 'OpenRouter', category: 'third_party' as const, baseUrl: 'https://openrouter.ai/api/v1' },
    { name: 'XiaoMi MiMo', category: 'third_party' as const, baseUrl: 'https://token-plan-sgp.xiaomimimo.com/anthropic' },
  ],
  model: 'claude-sonnet-4-20250514',
  apiKey: 'sk-***masked***',
  baseUrl: 'https://api.anthropic.com',
  raw: { permissions: { allow: ['Bash(ls)'] } },
}

const defaultRawFile = {
  content: '{"model":"claude-sonnet-4-20250514"}',
  language: 'json',
  path: '/home/user/.claude/settings.json',
}

describe('AgentConfigModal', () => {
  const onClose = vi.fn()
  const onSaved = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAgentConfigFile.mockResolvedValue(defaultRawFile)
  })

  // ─── Basic Mode Tests ────────────────────────────────────────────────────

  it('renders "Add New Agent" title for new agent', () => {
    render(<AgentConfigModal onClose={onClose} onSaved={onSaved} />)
    expect(screen.getByText('Add New Agent')).toBeInTheDocument()
  })

  it('renders "Edit: {name}" title when editing', () => {
    render(
      <AgentConfigModal
        agent={{ id: 'test', name: 'Test Agent', command: '/bin/test', enabled: true }}
        onClose={onClose} onSaved={onSaved}
      />,
    )
    expect(screen.getByText('Edit: Test Agent')).toBeInTheDocument()
  })

  it('has role=dialog', () => {
    render(<AgentConfigModal onClose={onClose} onSaved={onSaved} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes on X button click', () => {
    render(<AgentConfigModal onClose={onClose} onSaved={onSaved} />)
    fireEvent.click(screen.getByTestId('x-icon'))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Cancel click', () => {
    render(<AgentConfigModal onClose={onClose} onSaved={onSaved} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows required field labels', () => {
    render(<AgentConfigModal onClose={onClose} onSaved={onSaved} />)
    expect(screen.getByText('Agent ID *')).toBeInTheDocument()
    expect(screen.getByText('Display Name *')).toBeInTheDocument()
    expect(screen.getByText('Command Path *')).toBeInTheDocument()
  })

  it('shows swarm config section', () => {
    render(<AgentConfigModal onClose={onClose} onSaved={onSaved} />)
    expect(screen.getByText('Swarm Configuration')).toBeInTheDocument()
    expect(screen.getByText('Can be Coordinator')).toBeInTheDocument()
    expect(screen.getByText('Can be Worker')).toBeInTheDocument()
  })

  it('shows preferred roles checkboxes', () => {
    render(<AgentConfigModal onClose={onClose} onSaved={onSaved} />)
    expect(screen.getByText('coder')).toBeInTheDocument()
    expect(screen.getByText('reviewer')).toBeInTheDocument()
    expect(screen.getByText('tester')).toBeInTheDocument()
    expect(screen.getByText('architect')).toBeInTheDocument()
  })

  it('shows validation error when required fields are empty', () => {
    render(<AgentConfigModal onClose={onClose} onSaved={onSaved} />)
    fireEvent.click(screen.getByText('Add Agent'))
    expect(screen.getByText('ID, Name, and Command are required')).toBeInTheDocument()
  })

  it('calls addAgent when creating new agent', async () => {
    render(<AgentConfigModal onClose={onClose} onSaved={onSaved} />)
    fireEvent.change(screen.getByPlaceholderText('claude-code'), { target: { value: 'test-agent' } })
    fireEvent.change(screen.getByPlaceholderText('Claude Code'), { target: { value: 'Test Agent' } })
    fireEvent.change(screen.getByPlaceholderText('/usr/local/bin/claude-code'), { target: { value: '/bin/test' } })
    fireEvent.click(screen.getByText('Add Agent'))
    await screen.findByText('Add Agent')
    expect(mockAddAgent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'test-agent', name: 'Test Agent', command: '/bin/test' }),
    )
  })

  it('populates form from defaults', () => {
    render(
      <AgentConfigModal
        defaults={{ id: 'scanner-1', name: 'Scanned Agent', command: '/usr/bin/scan' }}
        onClose={onClose} onSaved={onSaved}
      />,
    )
    expect(screen.getByDisplayValue('scanner-1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Scanned Agent')).toBeInTheDocument()
    expect(screen.getByDisplayValue('/usr/bin/scan')).toBeInTheDocument()
  })

  it('disables Agent ID input when editing existing agent', () => {
    render(
      <AgentConfigModal
        agent={{ id: 'existing', name: 'Existing', command: '/bin/existing', enabled: true }}
        onClose={onClose} onSaved={onSaved}
      />,
    )
    expect(screen.getByDisplayValue('existing').closest('input')?.disabled).toBe(true)
  })

  it('shows Save Changes button when editing', () => {
    render(
      <AgentConfigModal
        agent={{ id: 'x', name: 'X', command: '/bin/x', enabled: true }}
        onClose={onClose} onSaved={onSaved}
      />,
    )
    expect(screen.getByText('Save Changes')).toBeInTheDocument()
  })

  // ─── Native Mode Tests ───────────────────────────────────────────────────

  it('shows structured/raw tabs for native agent (claude-code)', async () => {
    mockGetAgentConfig.mockResolvedValue(defaultNativeConfig)
    render(
      <AgentConfigModal
        defaults={{ id: 'claude-code', name: 'Claude Code', command: 'claude' }}
        onClose={onClose} onSaved={onSaved}
      />,
    )
    expect(screen.getByText('结构化配置')).toBeInTheDocument()
    expect(screen.getByText('原始配置文件')).toBeInTheDocument()
  })

  it('loads native config on mount for native agent', async () => {
    mockGetAgentConfig.mockResolvedValue(defaultNativeConfig)
    render(
      <AgentConfigModal
        defaults={{ id: 'claude-code', name: 'Claude Code', command: 'claude' }}
        onClose={onClose} onSaved={onSaved}
      />,
    )
    await waitFor(() => expect(mockGetAgentConfig).toHaveBeenCalledWith('claude-code'))
    await waitFor(() => expect(screen.getByDisplayValue('claude-sonnet-4-20250514')).toBeInTheDocument())
  })

  it('loads raw config file on mount for native agent', async () => {
    mockGetAgentConfig.mockResolvedValue(defaultNativeConfig)
    render(
      <AgentConfigModal
        defaults={{ id: 'claude-code', name: 'Claude Code', command: 'claude' }}
        onClose={onClose} onSaved={onSaved}
      />,
    )
    await waitFor(() => expect(mockGetAgentConfigFile).toHaveBeenCalledWith('claude-code'))
  })

  it('shows provider category tabs (Official / Third-party)', async () => {
    mockGetAgentConfig.mockResolvedValue(defaultNativeConfig)
    render(
      <AgentConfigModal
        defaults={{ id: 'claude-code', name: 'Claude Code', command: 'claude' }}
        onClose={onClose} onSaved={onSaved}
      />,
    )
    await waitFor(() => expect(screen.getByText('Official')).toBeInTheDocument())
    expect(screen.getByText('Third-party')).toBeInTheDocument()
  })

  it('shows provider presets', async () => {
    mockGetAgentConfig.mockResolvedValue(defaultNativeConfig)
    render(
      <AgentConfigModal
        defaults={{ id: 'claude-code', name: 'Claude Code', command: 'claude' }}
        onClose={onClose} onSaved={onSaved}
      />,
    )
    await waitFor(() => expect(screen.getByText('Anthropic Official')).toBeInTheDocument())
    // Switch to third-party to see other presets
    fireEvent.click(screen.getByText('Third-party'))
    expect(screen.getByText('OpenRouter')).toBeInTheDocument()
    expect(screen.getByText('XiaoMi MiMo')).toBeInTheDocument()
  })

  it('shows model and base URL fields', async () => {
    mockGetAgentConfig.mockResolvedValue(defaultNativeConfig)
    render(
      <AgentConfigModal
        defaults={{ id: 'claude-code', name: 'Claude Code', command: 'claude' }}
        onClose={onClose} onSaved={onSaved}
      />,
    )
    await waitFor(() => expect(screen.getByText('Model Configuration')).toBeInTheDocument())
    expect(screen.getByDisplayValue('claude-sonnet-4-20250514')).toBeInTheDocument()
    expect(screen.getByDisplayValue('https://api.anthropic.com')).toBeInTheDocument()
  })

  it('shows API key as password by default', async () => {
    mockGetAgentConfig.mockResolvedValue(defaultNativeConfig)
    render(
      <AgentConfigModal
        defaults={{ id: 'claude-code', name: 'Claude Code', command: 'claude' }}
        onClose={onClose} onSaved={onSaved}
      />,
    )
    await waitFor(() => {
      const apiInput = screen.getByPlaceholderText('sk-...') as HTMLInputElement
      expect(apiInput.type).toBe('password')
    })
  })

  it('toggles API key visibility', async () => {
    mockGetAgentConfig.mockResolvedValue(defaultNativeConfig)
    render(
      <AgentConfigModal
        defaults={{ id: 'claude-code', name: 'Claude Code', command: 'claude' }}
        onClose={onClose} onSaved={onSaved}
      />,
    )
    await waitFor(() => expect(screen.getByTestId('eye-icon')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('eye-icon'))
    expect(screen.getByTestId('eye-off-icon')).toBeInTheDocument()
  })

  it('shows loading state while fetching native config', () => {
    mockGetAgentConfig.mockImplementation(() => new Promise(() => {})) // never resolves
    render(
      <AgentConfigModal
        defaults={{ id: 'claude-code', name: 'Claude Code', command: 'claude' }}
        onClose={onClose} onSaved={onSaved}
      />,
    )
    expect(screen.getByText('Loading configuration...')).toBeInTheDocument()
  })

  it('shows error and retry button when native config load fails', async () => {
    mockGetAgentConfig.mockRejectedValue(new Error('Config not found'))
    render(
      <AgentConfigModal
        defaults={{ id: 'claude-code', name: 'Claude Code', command: 'claude' }}
        onClose={onClose} onSaved={onSaved}
      />,
    )
    await waitFor(() => expect(screen.getByText('Config not found')).toBeInTheDocument())
    expect(screen.getByText('Retry')).toBeInTheDocument()
  })

  it('calls updateAgentConfig on native save', async () => {
    mockGetAgentConfig.mockResolvedValue(defaultNativeConfig)
    render(
      <AgentConfigModal
        defaults={{ id: 'claude-code', name: 'Claude Code', command: 'claude' }}
        onClose={onClose} onSaved={onSaved}
      />,
    )
    await waitFor(() => expect(screen.getByText('Save & Sync')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Save & Sync'))
    await waitFor(() => expect(mockUpdateAgentConfig).toHaveBeenCalledWith('claude-code', expect.objectContaining({
      providerCategory: 'first_party',
      providerPreset: 'Anthropic Official',
      model: 'claude-sonnet-4-20250514',
    })))
  })

  it('switches to raw tab and shows textarea', async () => {
    mockGetAgentConfig.mockResolvedValue(defaultNativeConfig)
    render(
      <AgentConfigModal
        defaults={{ id: 'claude-code', name: 'Claude Code', command: 'claude' }}
        onClose={onClose} onSaved={onSaved}
      />,
    )
    await waitFor(() => expect(screen.getByText('原始配置文件')).toBeInTheDocument())
    fireEvent.click(screen.getByText('原始配置文件'))
    // Should show a textarea for raw editing
    const textarea = document.querySelector('textarea')
    expect(textarea).toBeInTheDocument()
  })

  it('does not show native tabs for non-native agent', () => {
    render(
      <AgentConfigModal
        defaults={{ id: 'custom-agent', name: 'Custom', command: '/bin/custom' }}
        onClose={onClose} onSaved={onSaved}
      />,
    )
    expect(screen.queryByText('结构化配置')).not.toBeInTheDocument()
    expect(screen.queryByText('原始配置文件')).not.toBeInTheDocument()
  })

  it('shows config path for native agent in header', async () => {
    mockGetAgentConfig.mockResolvedValue(defaultNativeConfig)
    render(
      <AgentConfigModal
        defaults={{ id: 'claude-code', name: 'Claude Code', command: 'claude' }}
        onClose={onClose} onSaved={onSaved}
      />,
    )
    await waitFor(() => expect(screen.getByText('/home/user/.claude/settings.json')).toBeInTheDocument())
  })

  it('renders for all native agent IDs', async () => {
    for (const agentId of ['kimi-code', 'opencode', 'qwen-code']) {
      mockGetAgentConfig.mockResolvedValue({ ...defaultNativeConfig, agentId })
      mockGetAgentConfigFile.mockResolvedValue({ ...defaultRawFile, path: `/home/user/.${agentId}/config.json` })
      const { unmount } = render(
        <AgentConfigModal
          key={agentId}
          defaults={{ id: agentId, name: agentId, command: 'cmd' }}
          onClose={onClose} onSaved={onSaved}
        />,
      )
      await waitFor(() => expect(mockGetAgentConfig).toHaveBeenCalledWith(agentId))
      unmount()
      mockGetAgentConfig.mockClear()
      mockGetAgentConfigFile.mockClear()
    }
  })

  it('calls onSaved with AgentConfig on native save success', async () => {
    mockGetAgentConfig.mockResolvedValue(defaultNativeConfig)
    render(
      <AgentConfigModal
        defaults={{ id: 'claude-code', name: 'Claude Code', command: 'claude' }}
        onClose={onClose} onSaved={onSaved}
      />,
    )
    await waitFor(() => expect(screen.getByText('Save & Sync')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Save & Sync'))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'claude-code' })))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows toast on native save success', async () => {
    mockGetAgentConfig.mockResolvedValue(defaultNativeConfig)
    render(
      <AgentConfigModal
        defaults={{ id: 'claude-code', name: 'Claude Code', command: 'claude' }}
        onClose={onClose} onSaved={onSaved}
      />,
    )
    await waitFor(() => expect(screen.getByText('Save & Sync')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Save & Sync'))
    await waitFor(() => expect(mockAddToast).toHaveBeenCalledWith('success', 'Config saved', expect.any(String)))
  })

  it('validates JSON in raw tab textarea', async () => {
    mockGetAgentConfig.mockResolvedValue(defaultNativeConfig)
    render(
      <AgentConfigModal
        defaults={{ id: 'claude-code', name: 'Claude Code', command: 'claude' }}
        onClose={onClose} onSaved={onSaved}
      />,
    )
    await waitFor(() => expect(screen.getByText('原始配置文件')).toBeInTheDocument())
    fireEvent.click(screen.getByText('原始配置文件'))
    const textarea = document.querySelector('textarea')!
    // Invalid JSON — should show a validation error containing the parse error
    fireEvent.change(textarea, { target: { value: '{invalid' } })
    await waitFor(() => {
      const spans = document.querySelectorAll('span')
      const errorSpan = Array.from(spans).find(s => s.textContent?.includes('Expected'))
      expect(errorSpan).toBeTruthy()
    })
    // Valid JSON — should show Valid JSON label
    fireEvent.change(textarea, { target: { value: '{"ok":true}' } })
    await waitFor(() => {
      const spans = document.querySelectorAll('span')
      const validSpan = Array.from(spans).find(s => s.textContent?.includes('Valid JSON'))
      expect(validSpan).toBeTruthy()
    })
  })

  it('shows Save File button in raw tab for native agent', async () => {
    mockGetAgentConfig.mockResolvedValue(defaultNativeConfig)
    render(
      <AgentConfigModal
        defaults={{ id: 'claude-code', name: 'Claude Code', command: 'claude' }}
        onClose={onClose} onSaved={onSaved}
      />,
    )
    await waitFor(() => expect(screen.getByText('原始配置文件')).toBeInTheDocument())
    fireEvent.click(screen.getByText('原始配置文件'))
    expect(screen.getByText('Save File')).toBeInTheDocument()
  })

  it('saves raw config file when Save File is clicked with modifications', async () => {
    mockGetAgentConfig.mockResolvedValue(defaultNativeConfig)
    render(
      <AgentConfigModal
        defaults={{ id: 'claude-code', name: 'Claude Code', command: 'claude' }}
        onClose={onClose} onSaved={onSaved}
      />,
    )
    await waitFor(() => expect(screen.getByText('原始配置文件')).toBeInTheDocument())
    fireEvent.click(screen.getByText('原始配置文件'))
    const textarea = document.querySelector('textarea')!
    fireEvent.change(textarea, { target: { value: '{"model":"new-model"}' } })
    fireEvent.click(screen.getByText('Save File'))
    await waitFor(() => expect(mockUpdateAgentConfigFile).toHaveBeenCalledWith('claude-code', '{"model":"new-model"}'))
    await waitFor(() => expect(mockAddToast).toHaveBeenCalledWith('success', '配置已保存', '原始配置文件已更新'))
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ExternalModPrompt } from './ExternalModPrompt'

vi.mock('../stores/workspaceStore', () => ({
  useWorkspaceStore: {
    getState: () => ({
      fileContents: new Map(),
      setState: vi.fn(),
    }),
  },
}))

const mockReadFile = vi.fn().mockResolvedValue('new content')

vi.mock('../services/api', () => ({
  fsApi: {
    readFile: (...args: any[]) => mockReadFile(...args),
  },
}))

vi.mock('../utils', () => ({
  logger: { error: vi.fn(), debug: vi.fn() },
}))

describe('ExternalModPrompt', () => {
  const onDismiss = vi.fn()
  const filePath = 'src/App.tsx'

  beforeEach(() => {
    vi.clearAllMocks()
    mockReadFile.mockResolvedValue('new content')
  })

  it('renders reload prompt text', () => {
    render(<ExternalModPrompt filePath={filePath} onDismiss={onDismiss} />)
    expect(screen.getByText(/文件已在外部修改/)).toBeInTheDocument()
  })

  it('renders reload and keep buttons', () => {
    render(<ExternalModPrompt filePath={filePath} onDismiss={onDismiss} />)
    expect(screen.getByText('重新加载')).toBeInTheDocument()
    expect(screen.getByText('保持当前')).toBeInTheDocument()
  })

  it('calls onDismiss when keep button clicked', () => {
    render(<ExternalModPrompt filePath={filePath} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByText('保持当前'))
    expect(onDismiss).toHaveBeenCalledWith(filePath)
  })

  it('calls readFile when reload clicked', () => {
    render(<ExternalModPrompt filePath={filePath} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByText('重新加载'))
    expect(mockReadFile).toHaveBeenCalledWith(filePath)
  })
})

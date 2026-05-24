import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SourceControlPanel from './SourceControlPanel'

const mockGetStatus = vi.fn().mockResolvedValue([])
const mockStage = vi.fn().mockResolvedValue(undefined)
const mockUnstage = vi.fn().mockResolvedValue(undefined)
const mockCommit = vi.fn().mockResolvedValue({ hash: 'abc1234', message: 'test commit' })
const mockGetBranch = vi.fn().mockResolvedValue('main')
const mockGetLog = vi.fn().mockResolvedValue([])
const mockDiff = vi.fn().mockResolvedValue({ original: '', modified: '' })
const mockPush = vi.fn().mockResolvedValue(undefined)
const mockPull = vi.fn().mockResolvedValue(undefined)
const mockDiscard = vi.fn().mockResolvedValue(undefined)
const mockStash = vi.fn().mockResolvedValue(undefined)

vi.mock('../services/api', () => ({
  gitApi: {
    getStatus: () => mockGetStatus(),
    stage: (...args: any[]) => mockStage(...args),
    unstage: (...args: any[]) => mockUnstage(...args),
    commit: (...args: any[]) => mockCommit(...args),
    getBranch: () => mockGetBranch(),
    getLog: () => mockGetLog(),
    push: () => mockPush(),
    pull: () => mockPull(),
    discard: (...args: any[]) => mockDiscard(...args),
    stash: () => mockStash(),
    stashPop: () => vi.fn().mockResolvedValue(undefined)(),
  },
  gitDiffApi: {
    getFileDiff: () => mockDiff(),
  },
}))

vi.mock('../utils', () => ({
  logger: { error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
  getFileIcon: () => (props: any) => <svg {...props} />,
  getFileIconColor: () => '',
}))

const mockAddToast = vi.fn()

vi.mock('../store/appStore', () => ({
  useAppStore: (selector: any) => selector({ addToast: mockAddToast }),
}))

describe('SourceControlPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetStatus.mockResolvedValue([])
    mockGetBranch.mockResolvedValue('main')
    mockGetLog.mockResolvedValue([])
  })

  it('renders source control header', async () => {
    render(<SourceControlPanel />)
    expect(await screen.findByText('Source Control')).toBeInTheDocument()
  })

  it('shows current branch', async () => {
    render(<SourceControlPanel />)
    expect(await screen.findByText(/main/)).toBeInTheDocument()
  })

  it('renders commit input', async () => {
    render(<SourceControlPanel />)
    const input = await screen.findByPlaceholderText('Commit message')
    expect(input).toBeInTheDocument()
  })

  it('calls gitApi.getStatus on mount', async () => {
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    expect(mockGetStatus).toHaveBeenCalled()
  })

  it('shows file paths from git status', async () => {
    mockGetStatus.mockResolvedValue([
      { path: 'src/App.tsx', status: 'modified', origPath: '' },
      { path: 'src/utils.ts', status: 'added', origPath: '' },
    ])
    render(<SourceControlPanel />)
    expect(await screen.findByText('src/App.tsx')).toBeInTheDocument()
    expect(screen.getByText('src/utils.ts')).toBeInTheDocument()
  })

  it('calls onStatusChange with file list', async () => {
    const onStatusChange = vi.fn()
    const files = [
      { path: 'a.ts', status: 'modified', origPath: '' },
    ]
    mockGetStatus.mockResolvedValue(files)
    render(<SourceControlPanel onStatusChange={onStatusChange} />)
    await screen.findByText('a.ts')
    expect(onStatusChange).toHaveBeenCalledWith(files)
  })

  it('renders branch name from getBranch', async () => {
    mockGetBranch.mockResolvedValue('feature/test')
    render(<SourceControlPanel />)
    expect(await screen.findByText(/feature\/test/)).toBeInTheDocument()
  })

  it('stages a file on stage button click', async () => {
    mockGetStatus.mockResolvedValue([
      { path: 'a.ts', status: 'modified', origPath: '' },
    ])
    render(<SourceControlPanel />)
    const stageBtn = await screen.findByTitle('Stage')
    fireEvent.click(stageBtn)
    await waitFor(() => {
      expect(mockStage).toHaveBeenCalledWith('a.ts')
    })
  })

  it('unstakes a file on unstage button click', async () => {
    mockGetStatus.mockResolvedValue([
      { path: 'a.ts', status: 'modified', staged: true, origPath: '' },
    ])
    render(<SourceControlPanel />)
    const unstageBtn = await screen.findByTitle('Unstage')
    fireEvent.click(unstageBtn)
    await waitFor(() => {
      expect(mockUnstage).toHaveBeenCalledWith('a.ts')
    })
  })

  it('commits with message when commit button clicked', async () => {
    mockGetStatus
      .mockResolvedValueOnce([{ path: 'a.ts', status: 'modified', staged: true, origPath: '' }])
      .mockResolvedValueOnce([])
    render(<SourceControlPanel />)
    const input = await screen.findByPlaceholderText('Commit message')
    fireEvent.change(input, { target: { value: 'fix: bug fix' } })
    const btn = screen.getByTitle(/Ctrl\+Enter to commit/)
    fireEvent.click(btn)
    await waitFor(() => {
      expect(mockCommit).toHaveBeenCalledWith('fix: bug fix')
    })
  })
})

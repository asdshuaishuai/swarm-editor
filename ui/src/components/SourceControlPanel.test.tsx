import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import SourceControlPanel from './SourceControlPanel'

const mockGetStatus = vi.fn().mockResolvedValue([])
const mockStage = vi.fn().mockResolvedValue(undefined)
const mockUnstage = vi.fn().mockResolvedValue(undefined)
const mockCommit = vi.fn().mockResolvedValue({ hash: 'abc1234', message: 'test commit' })
const mockGetBranch = vi.fn().mockResolvedValue('main')
const mockGetLog = vi.fn().mockResolvedValue([])
const mockDiff = vi.fn().mockResolvedValue({ original: '', modified: '', path: 'a.ts' })
const mockPush = vi.fn().mockResolvedValue({ output: 'pushed to origin/main' })
const mockPull = vi.fn().mockResolvedValue({ output: 'pulled from origin/main' })
const mockDiscard = vi.fn().mockResolvedValue(undefined)
const mockStash = vi.fn().mockResolvedValue({ output: 'stash ok' })
const mockStashPop = vi.fn().mockResolvedValue({ output: 'stash pop ok' })
const mockUndoCommit = vi.fn().mockResolvedValue({ output: 'undo ok' })
const mockListBranches = vi.fn().mockResolvedValue([])
const mockCheckoutBranch = vi.fn().mockResolvedValue({ branch: 'feature/test' })
const mockCreateBranch = vi.fn().mockResolvedValue({ branch: 'feature/new' })

vi.mock('../services/api', () => ({
  gitApi: {
    getStatus: () => mockGetStatus(),
    stage: (...args: any[]) => mockStage(...args),
    unstage: (...args: any[]) => mockUnstage(...args),
    commit: (...args: any[]) => mockCommit(...args),
    getBranch: () => mockGetBranch(),
    log: () => mockGetLog(),
    push: (...args: any[]) => mockPush(...args),
    pull: (...args: any[]) => mockPull(...args),
    discard: (...args: any[]) => mockDiscard(...args),
    stash: () => mockStash(),
    stashPop: () => mockStashPop(),
    undoCommit: () => mockUndoCommit(),
    listBranches: () => mockListBranches(),
    checkoutBranch: (...args: any[]) => mockCheckoutBranch(...args),
    createBranch: (...args: any[]) => mockCreateBranch(...args),
  },
  gitDiffApi: {
    getFileDiff: (...args: any[]) => mockDiff(...args),
  },
}))

vi.mock('../utils', () => ({
  logger: { error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
  getFileIcon: () => (props: any) => <svg {...props} />,
  getFileIconColor: () => '',
}))

vi.mock('../hooks/useMenuKeyboardNav', () => ({
  useMenuKeyboardNav: () => () => {},
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
    mockPush.mockResolvedValue({ output: 'pushed to origin/main' })
    mockPull.mockResolvedValue({ output: 'pulled from origin/main' })
    mockStash.mockResolvedValue({ output: 'stash ok' })
    mockStashPop.mockResolvedValue({ output: 'stash pop ok' })
    mockUndoCommit.mockResolvedValue({ output: 'undo ok' })
    mockListBranches.mockResolvedValue([])
    mockCheckoutBranch.mockResolvedValue({ branch: 'feature/test' })
    mockCreateBranch.mockResolvedValue({ branch: 'feature/new' })
  })

  // ─── Basic rendering ───

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
      { path: 'src/App.tsx', status: 'modified', staged: false },
      { path: 'src/utils.ts', status: 'added', staged: false },
    ])
    render(<SourceControlPanel />)
    expect(await screen.findByText('src/App.tsx')).toBeInTheDocument()
    expect(screen.getByText('src/utils.ts')).toBeInTheDocument()
  })

  it('calls onStatusChange with file list', async () => {
    const onStatusChange = vi.fn()
    const files = [
      { path: 'a.ts', status: 'modified', staged: false },
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

  // ─── Empty state ───

  it('shows empty state when no changes', async () => {
    render(<SourceControlPanel />)
    expect(await screen.findByText('No changes')).toBeInTheDocument()
  })

  it('does not show empty state when there are changes', async () => {
    mockGetStatus.mockResolvedValue([
      { path: 'a.ts', status: 'M', staged: true },
    ])
    render(<SourceControlPanel />)
    await screen.findByText('a.ts')
    expect(screen.queryByText('No changes')).not.toBeInTheDocument()
  })

  // ─── Stage / Unstage single files ───

  it('stages a file on stage button click', async () => {
    mockGetStatus.mockResolvedValue([
      { path: 'a.ts', status: 'M', staged: false },
    ])
    render(<SourceControlPanel />)
    const stageBtn = await screen.findByTitle('Stage')
    fireEvent.click(stageBtn)
    await waitFor(() => {
      expect(mockStage).toHaveBeenCalledWith('a.ts')
    })
  })

  it('unstages a file on unstage button click', async () => {
    mockGetStatus.mockResolvedValue([
      { path: 'a.ts', status: 'M', staged: true },
    ])
    render(<SourceControlPanel />)
    const unstageBtn = await screen.findByTitle('Unstage')
    fireEvent.click(unstageBtn)
    await waitFor(() => {
      expect(mockUnstage).toHaveBeenCalledWith('a.ts')
    })
  })

  // ─── Stage all / Unstage all ───

  it('stages all files on stage all button click', async () => {
    mockGetStatus.mockResolvedValue([
      { path: 'a.ts', status: 'M', staged: false },
      { path: 'b.ts', status: 'A', staged: false },
    ])
    render(<SourceControlPanel />)
    const stageAllBtn = await screen.findByTitle('Stage all')
    fireEvent.click(stageAllBtn)
    await waitFor(() => {
      expect(mockStage).toHaveBeenCalledWith()
    })
  })

  it('unstages all files on unstage all button click', async () => {
    mockGetStatus.mockResolvedValue([
      { path: 'a.ts', status: 'M', staged: true },
      { path: 'b.ts', status: 'A', staged: true },
    ])
    render(<SourceControlPanel />)
    const unstageAllBtn = await screen.findByTitle('Unstage all')
    fireEvent.click(unstageAllBtn)
    await waitFor(() => {
      expect(mockUnstage).toHaveBeenCalledWith()
    })
  })

  // ─── Commit ───

  it('commits with message when commit button clicked', async () => {
    mockGetStatus
      .mockResolvedValueOnce([{ path: 'a.ts', status: 'M', staged: true }])
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

  it('clears commit message after successful commit', async () => {
    mockGetStatus
      .mockResolvedValueOnce([{ path: 'a.ts', status: 'M', staged: true }])
      .mockResolvedValueOnce([])
    render(<SourceControlPanel />)
    const input = await screen.findByPlaceholderText('Commit message')
    fireEvent.change(input, { target: { value: 'fix: bug fix' } })
    const btn = screen.getByTitle(/Ctrl\+Enter to commit/)
    fireEvent.click(btn)
    await waitFor(() => {
      expect(mockCommit).toHaveBeenCalled()
    })
    expect(input).toHaveValue('')
  })

  it('shows success toast after commit', async () => {
    mockGetStatus
      .mockResolvedValueOnce([{ path: 'a.ts', status: 'M', staged: true }])
      .mockResolvedValueOnce([])
    render(<SourceControlPanel />)
    const input = await screen.findByPlaceholderText('Commit message')
    fireEvent.change(input, { target: { value: 'feat: new feature' } })
    const btn = screen.getByTitle(/Ctrl\+Enter to commit/)
    fireEvent.click(btn)
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        'success', 'Committed',
        expect.stringContaining('abc1234')
      )
    })
  })

  it('shows Committing... text while committing', async () => {
    let resolveCommit: (val: any) => void
    mockCommit.mockReturnValue(new Promise(r => { resolveCommit = r }))
    mockGetStatus.mockResolvedValue([{ path: 'a.ts', status: 'M', staged: true }])
    render(<SourceControlPanel />)
    const input = await screen.findByPlaceholderText('Commit message')
    fireEvent.change(input, { target: { value: 'wip' } })
    const btn = screen.getByTitle(/Ctrl\+Enter to commit/)
    fireEvent.click(btn)
    await waitFor(() => {
      expect(screen.getByText('Committing...')).toBeInTheDocument()
    })
    await act(async () => { resolveCommit!({ hash: 'abc', message: 'wip' }) })
  })

  it('commit button is disabled when no message', async () => {
    mockGetStatus.mockResolvedValue([{ path: 'a.ts', status: 'M', staged: true }])
    render(<SourceControlPanel />)
    await screen.findByText('a.ts')
    const btn = screen.getByTitle(/Ctrl\+Enter to commit/)
    expect(btn).toBeDisabled()
  })

  it('commit button is disabled when no staged files', async () => {
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const input = screen.getByPlaceholderText('Commit message')
    fireEvent.change(input, { target: { value: 'msg' } })
    const btn = screen.getByTitle(/Ctrl\+Enter to commit/)
    expect(btn).toBeDisabled()
  })

  it('does not commit with empty message', async () => {
    mockGetStatus.mockResolvedValue([{ path: 'a.ts', status: 'M', staged: true }])
    render(<SourceControlPanel />)
    await screen.findByText('a.ts')
    const input = screen.getByPlaceholderText('Commit message')
    fireEvent.change(input, { target: { value: '   ' } })
    const btn = screen.getByTitle(/Ctrl\+Enter to commit/)
    fireEvent.click(btn)
    expect(mockCommit).not.toHaveBeenCalled()
  })

  it('commits on Ctrl+Enter in the input field', async () => {
    mockGetStatus
      .mockResolvedValueOnce([{ path: 'a.ts', status: 'M', staged: true }])
      .mockResolvedValueOnce([])
    render(<SourceControlPanel />)
    const input = await screen.findByPlaceholderText('Commit message')
    fireEvent.change(input, { target: { value: 'feat: shortcut' } })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    await waitFor(() => {
      expect(mockCommit).toHaveBeenCalledWith('feat: shortcut')
    })
  })

  it('shows error toast on commit failure', async () => {
    mockCommit.mockRejectedValue(new Error('commit failed'))
    mockGetStatus.mockResolvedValue([{ path: 'a.ts', status: 'M', staged: true }])
    render(<SourceControlPanel />)
    const input = await screen.findByPlaceholderText('Commit message')
    fireEvent.change(input, { target: { value: 'wip' } })
    const btn = screen.getByTitle(/Ctrl\+Enter to commit/)
    fireEvent.click(btn)
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', 'Commit failed', 'commit failed')
    })
  })

  it('shows error toast with unknown error on commit failure with non-Error', async () => {
    mockCommit.mockRejectedValue('string error')
    mockGetStatus.mockResolvedValue([{ path: 'a.ts', status: 'M', staged: true }])
    render(<SourceControlPanel />)
    const input = await screen.findByPlaceholderText('Commit message')
    fireEvent.change(input, { target: { value: 'wip' } })
    const btn = screen.getByTitle(/Ctrl\+Enter to commit/)
    fireEvent.click(btn)
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', 'Commit failed', 'Unknown error')
    })
  })

  // ─── Push / Pull ───

  it('calls push with origin and current branch', async () => {
    mockGetStatus.mockResolvedValue([])
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const pushBtn = screen.getByTitle('Push (git push)')
    fireEvent.click(pushBtn)
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('origin', 'main')
    })
  })

  it('shows success toast on push', async () => {
    mockPush.mockResolvedValue({ output: 'Everything up-to-date' })
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const pushBtn = screen.getByTitle('Push (git push)')
    fireEvent.click(pushBtn)
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('success', 'Pushed', expect.stringContaining('Everything'))
    })
  })

  it('shows fallback toast when push output is empty', async () => {
    mockPush.mockResolvedValue({ output: '' })
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const pushBtn = screen.getByTitle('Push (git push)')
    fireEvent.click(pushBtn)
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('success', 'Pushed', 'Pushed to origin/main')
    })
  })

  it('shows error toast on push failure', async () => {
    mockPush.mockRejectedValue(new Error('push rejected'))
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const pushBtn = screen.getByTitle('Push (git push)')
    fireEvent.click(pushBtn)
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', 'Push failed', 'push rejected')
    })
  })

  it('calls pull with origin and current branch', async () => {
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const pullBtn = screen.getByTitle('Pull (git pull)')
    fireEvent.click(pullBtn)
    await waitFor(() => {
      expect(mockPull).toHaveBeenCalledWith('origin', 'main')
    })
  })

  it('shows success toast on pull', async () => {
    mockPull.mockResolvedValue({ output: 'Already up to date.' })
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const pullBtn = screen.getByTitle('Pull (git pull)')
    fireEvent.click(pullBtn)
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('success', 'Pulled', expect.stringContaining('Already'))
    })
  })

  it('shows fallback toast when pull output is empty', async () => {
    mockPull.mockResolvedValue({ output: '' })
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const pullBtn = screen.getByTitle('Pull (git pull)')
    fireEvent.click(pullBtn)
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('success', 'Pulled', 'Pulled from origin/main')
    })
  })

  it('shows error toast on pull failure', async () => {
    mockPull.mockRejectedValue(new Error('merge conflict'))
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const pullBtn = screen.getByTitle('Pull (git pull)')
    fireEvent.click(pullBtn)
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', 'Pull failed', 'merge conflict')
    })
  })

  it('refreshes status after pull', async () => {
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const prevCallCount = mockGetStatus.mock.calls.length
    const pullBtn = screen.getByTitle('Pull (git pull)')
    fireEvent.click(pullBtn)
    await waitFor(() => {
      expect(mockGetStatus.mock.calls.length).toBeGreaterThan(prevCallCount)
    })
  })

  // ─── Stash / Stash Pop ───

  it('calls stash from more menu and shows info toast', async () => {
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const moreBtn = screen.getByTitle('More actions')
    fireEvent.click(moreBtn)
    const stashBtn = await screen.findByText('Stash Changes')
    fireEvent.click(stashBtn)
    await waitFor(() => {
      expect(mockStash).toHaveBeenCalled()
      expect(mockAddToast).toHaveBeenCalledWith('info', 'Stashed', 'Working changes stashed')
    })
  })

  it('shows error toast on stash failure', async () => {
    mockStash.mockRejectedValue(new Error('stash error'))
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const moreBtn = screen.getByTitle('More actions')
    fireEvent.click(moreBtn)
    const stashBtn = await screen.findByText('Stash Changes')
    fireEvent.click(stashBtn)
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', 'Stash failed', 'stash error')
    })
  })

  it('calls stashPop from more menu and shows info toast', async () => {
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const moreBtn = screen.getByTitle('More actions')
    fireEvent.click(moreBtn)
    const popBtn = await screen.findByText('Pop Stash')
    fireEvent.click(popBtn)
    await waitFor(() => {
      expect(mockStashPop).toHaveBeenCalled()
      expect(mockAddToast).toHaveBeenCalledWith('info', 'Stash popped', 'Stashed changes restored')
    })
  })

  it('shows error toast on stash pop failure', async () => {
    mockStashPop.mockRejectedValue(new Error('no stash'))
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const moreBtn = screen.getByTitle('More actions')
    fireEvent.click(moreBtn)
    const popBtn = await screen.findByText('Pop Stash')
    fireEvent.click(popBtn)
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', 'Stash pop failed', 'no stash')
    })
  })

  // ─── Undo Commit ───

  it('calls undoCommit from more menu and shows info toast', async () => {
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const moreBtn = screen.getByTitle('More actions')
    fireEvent.click(moreBtn)
    const undoBtn = await screen.findByText('Undo Last Commit')
    fireEvent.click(undoBtn)
    await waitFor(() => {
      expect(mockUndoCommit).toHaveBeenCalled()
      expect(mockAddToast).toHaveBeenCalledWith('info', 'Commit undone', 'Last commit moved to staged changes')
    })
  })

  it('shows error toast on undoCommit failure', async () => {
    mockUndoCommit.mockRejectedValue(new Error('nothing to undo'))
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const moreBtn = screen.getByTitle('More actions')
    fireEvent.click(moreBtn)
    const undoBtn = await screen.findByText('Undo Last Commit')
    fireEvent.click(undoBtn)
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', 'Undo commit failed', 'nothing to undo')
    })
  })

  // ─── Discard ───

  it('opens discard confirmation dialog on discard button click', async () => {
    mockGetStatus.mockResolvedValue([
      { path: 'src/foo.ts', status: 'M', staged: false },
    ])
    render(<SourceControlPanel />)
    await screen.findByText('src/foo.ts')
    const discardBtn = screen.getByTitle('Discard changes')
    fireEvent.click(discardBtn)
    expect(await screen.findByText('Discard Changes?')).toBeInTheDocument()
    expect(screen.getByText('foo.ts')).toBeInTheDocument()
  })

  it('cancels discard when Cancel button clicked', async () => {
    mockGetStatus.mockResolvedValue([
      { path: 'src/foo.ts', status: 'M', staged: false },
    ])
    render(<SourceControlPanel />)
    await screen.findByText('src/foo.ts')
    const discardBtn = screen.getByTitle('Discard changes')
    fireEvent.click(discardBtn)
    const cancelBtn = await screen.findByText('Cancel')
    fireEvent.click(cancelBtn)
    await waitFor(() => {
      expect(screen.queryByText('Discard Changes?')).not.toBeInTheDocument()
    })
    expect(mockDiscard).not.toHaveBeenCalled()
  })

  it('executes discard on confirm button click', async () => {
    mockGetStatus
      .mockResolvedValueOnce([{ path: 'src/foo.ts', status: 'M', staged: false }])
      .mockResolvedValueOnce([])
    render(<SourceControlPanel />)
    await screen.findByText('src/foo.ts')
    const discardBtn = screen.getByTitle('Discard changes')
    fireEvent.click(discardBtn)
    const confirmBtn = await screen.findByRole('button', { name: 'Discard' })
    fireEvent.click(confirmBtn)
    await waitFor(() => {
      expect(mockDiscard).toHaveBeenCalledWith('src/foo.ts')
    })
  })

  it('closes discard dialog when clicking backdrop', async () => {
    mockGetStatus.mockResolvedValue([
      { path: 'src/foo.ts', status: 'M', staged: false },
    ])
    render(<SourceControlPanel />)
    await screen.findByText('src/foo.ts')
    const discardBtn = screen.getByTitle('Discard changes')
    fireEvent.click(discardBtn)
    await screen.findByText('Discard Changes?')
    // Click the backdrop (the fixed overlay)
    const backdrop = document.querySelector('.fixed.inset-0.bg-black\\/60')!
    fireEvent.click(backdrop)
    await waitFor(() => {
      expect(screen.queryByText('Discard Changes?')).not.toBeInTheDocument()
    })
  })

  it('shows error toast on discard failure', async () => {
    mockDiscard.mockRejectedValue(new Error('discard error'))
    mockGetStatus.mockResolvedValue([{ path: 'a.ts', status: 'M', staged: false }])
    render(<SourceControlPanel />)
    await screen.findByText('a.ts')
    const discardBtn = screen.getByTitle('Discard changes')
    fireEvent.click(discardBtn)
    const confirmBtn = await screen.findByRole('button', { name: 'Discard' })
    fireEvent.click(confirmBtn)
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', 'Discard failed', 'discard error')
    })
  })

  // ─── Git Log ───

  it('toggles log view on clock button click', async () => {
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const logBtn = screen.getByTitle('Git Log')
    fireEvent.click(logBtn)
    await waitFor(() => {
      expect(mockGetLog).toHaveBeenCalled()
      expect(screen.getByText('Back to changes')).toBeInTheDocument()
    })
  })

  it('shows commits in log view', async () => {
    mockGetLog.mockResolvedValue([
      { hash: 'abc1234', message: 'initial commit', author: 'dev', date: '2025-01-01' },
      { hash: 'def5678', message: 'add feature', author: 'dev', date: '2025-01-02' },
    ])
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const logBtn = screen.getByTitle('Git Log')
    fireEvent.click(logBtn)
    expect(await screen.findByText('abc1234')).toBeInTheDocument()
    expect(screen.getByText('initial commit')).toBeInTheDocument()
    expect(screen.getByText('def5678')).toBeInTheDocument()
    expect(screen.getByText('add feature')).toBeInTheDocument()
  })

  it('shows "No commits" when log is empty', async () => {
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const logBtn = screen.getByTitle('Git Log')
    fireEvent.click(logBtn)
    expect(await screen.findByText('No commits')).toBeInTheDocument()
  })

  it('returns to changes view from log', async () => {
    mockGetLog.mockResolvedValue([{ hash: 'abc1234', message: 'test', author: 'dev', date: '2025-01-01' }])
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const logBtn = screen.getByTitle('Git Log')
    // Open log
    fireEvent.click(logBtn)
    await screen.findByText('Back to changes')
    // Close log (clicking log button again while open just closes it)
    const backBtn = screen.getByText('Back to changes')
    fireEvent.click(backBtn)
    await waitFor(() => {
      expect(screen.queryByText('Back to changes')).not.toBeInTheDocument()
    })
  })

  it('shows error toast on log failure', async () => {
    mockGetLog.mockRejectedValue(new Error('log error'))
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const logBtn = screen.getByTitle('Git Log')
    fireEvent.click(logBtn)
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', 'Git log failed', 'log error')
    })
  })

  // ─── Diff view (file click) ───

  it('opens diff for staged file on file name click', async () => {
    mockGetStatus.mockResolvedValue([
      { path: 'a.ts', status: 'M', staged: true },
    ])
    mockDiff.mockResolvedValue({ original: 'old', modified: 'new', path: 'a.ts' })
    render(<SourceControlPanel />)
    const fileLink = await screen.findByTitle('Open diff: a.ts')
    fireEvent.click(fileLink)
    await waitFor(() => {
      expect(mockDiff).toHaveBeenCalledWith('a.ts', true)
    })
  })

  it('opens diff for unstaged file on file name click', async () => {
    mockGetStatus.mockResolvedValue([
      { path: 'b.ts', status: 'M', staged: false },
    ])
    mockDiff.mockResolvedValue({ original: 'old', modified: 'new', path: 'b.ts' })
    render(<SourceControlPanel />)
    const fileLink = await screen.findByTitle('Open diff: b.ts')
    fireEvent.click(fileLink)
    await waitFor(() => {
      expect(mockDiff).toHaveBeenCalledWith('b.ts', false)
    })
  })

  it('dispatches editor:show-diff event on successful diff', async () => {
    mockGetStatus.mockResolvedValue([
      { path: 'a.ts', status: 'M', staged: true },
    ])
    mockDiff.mockResolvedValue({ original: 'old code', modified: 'new code', path: 'a.ts' })
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    render(<SourceControlPanel />)
    const fileLink = await screen.findByTitle('Open diff: a.ts')
    fireEvent.click(fileLink)
    await waitFor(() => {
      expect(dispatchSpy).toHaveBeenCalled()
    })
    const call = dispatchSpy.mock.calls[0][0] as CustomEvent
    expect(call.type).toBe('editor:show-diff')
    expect(call.detail.path).toBe('a.ts')
    expect(call.detail.original).toBe('old code')
    expect(call.detail.modified).toBe('new code')
    dispatchSpy.mockRestore()
  })

  it('shows error toast on diff failure', async () => {
    mockGetStatus.mockResolvedValue([
      { path: 'a.ts', status: 'M', staged: true },
    ])
    mockDiff.mockRejectedValue(new Error('diff error'))
    render(<SourceControlPanel />)
    const fileLink = await screen.findByTitle('Open diff: a.ts')
    fireEvent.click(fileLink)
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', 'Diff failed', expect.stringContaining('a.ts'))
    })
  })

  // ─── Branch menu ───

  it('opens branch menu on branch button click', async () => {
    mockListBranches.mockResolvedValue([
      { name: 'main', current: true },
      { name: 'develop', current: false },
    ])
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const branchBtn = screen.getByRole('button', { name: /main/ })
    fireEvent.click(branchBtn)
    expect(await screen.findByText('develop')).toBeInTheDocument()
  })

  it('shows Loading... when no branches exist', async () => {
    mockListBranches.mockResolvedValue([])
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const branchBtn = screen.getByRole('button', { name: /main/ })
    fireEvent.click(branchBtn)
    // Menu opens with empty branches list, showing "Loading..."
    expect(await screen.findByText('Loading...')).toBeInTheDocument()
  })

  it('checks out a branch from branch menu', async () => {
    mockListBranches.mockResolvedValue([
      { name: 'main', current: true },
      { name: 'feature/test', current: false },
    ])
    mockGetStatus
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const branchBtn = screen.getByRole('button', { name: /main/ })
    fireEvent.click(branchBtn)
    const featureItem = await screen.findByText('feature/test')
    fireEvent.click(featureItem)
    await waitFor(() => {
      expect(mockCheckoutBranch).toHaveBeenCalledWith('feature/test')
      expect(mockAddToast).toHaveBeenCalledWith('info', 'Branch switched', 'Checked out feature/test')
    })
  })

  it('shows error toast on checkout failure', async () => {
    mockListBranches.mockResolvedValue([
      { name: 'main', current: true },
      { name: 'feature/test', current: false },
    ])
    mockCheckoutBranch.mockRejectedValue(new Error('checkout error'))
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const branchBtn = screen.getByRole('button', { name: /main/ })
    fireEvent.click(branchBtn)
    const featureItem = await screen.findByText('feature/test')
    fireEvent.click(featureItem)
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', 'Checkout failed', 'checkout error')
    })
  })

  it('creates a new branch from branch menu', async () => {
    mockListBranches.mockResolvedValue([
      { name: 'main', current: true },
    ])
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const branchBtn = screen.getByRole('button', { name: /main/ })
    fireEvent.click(branchBtn)
    const branchInput = await screen.findByPlaceholderText('Create branch...')
    fireEvent.change(branchInput, { target: { value: 'feature/new' } })
    fireEvent.keyDown(branchInput, { key: 'Enter' })
    await waitFor(() => {
      expect(mockCreateBranch).toHaveBeenCalledWith('feature/new', true)
      expect(mockAddToast).toHaveBeenCalledWith('success', 'Branch created', expect.stringContaining('feature/new'))
    })
  })

  it('does not create branch with empty name', async () => {
    mockListBranches.mockResolvedValue([{ name: 'main', current: true }])
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const branchBtn = screen.getByRole('button', { name: /main/ })
    fireEvent.click(branchBtn)
    const branchInput = await screen.findByPlaceholderText('Create branch...')
    fireEvent.change(branchInput, { target: { value: '   ' } })
    fireEvent.keyDown(branchInput, { key: 'Enter' })
    expect(mockCreateBranch).not.toHaveBeenCalled()
  })

  it('shows error toast on create branch failure', async () => {
    mockListBranches.mockResolvedValue([{ name: 'main', current: true }])
    mockCreateBranch.mockRejectedValue(new Error('branch exists'))
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const branchBtn = screen.getByRole('button', { name: /main/ })
    fireEvent.click(branchBtn)
    const branchInput = await screen.findByPlaceholderText('Create branch...')
    fireEvent.change(branchInput, { target: { value: 'feature/new' } })
    fireEvent.keyDown(branchInput, { key: 'Enter' })
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', 'Create branch failed', 'branch exists')
    })
  })

  it('closes branch menu on backdrop click', async () => {
    mockListBranches.mockResolvedValue([{ name: 'main', current: true }])
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const branchBtn = screen.getByRole('button', { name: /main/ })
    fireEvent.click(branchBtn)
    // Wait for the menu to appear (it will show "current" for the main branch)
    await screen.findByText('current')
    // Click the first fixed overlay (branch menu backdrop)
    const backdrop = document.querySelector('.fixed.inset-0') as HTMLElement
    fireEvent.click(backdrop)
    await waitFor(() => {
      expect(screen.queryByText('current')).not.toBeInTheDocument()
    })
  })

  // ─── More actions menu ───

  it('opens and closes more actions menu', async () => {
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const moreBtn = screen.getByTitle('More actions')
    fireEvent.click(moreBtn)
    expect(await screen.findByText('Stash Changes')).toBeInTheDocument()
    expect(screen.getByText('Pop Stash')).toBeInTheDocument()
    expect(screen.getByText('Undo Last Commit')).toBeInTheDocument()
    // Close by clicking backdrop
    const backdrops = document.querySelectorAll('.fixed.inset-0.z-\\[100\\]')
    // The more menu backdrop
    const moreBackdrop = backdrops[backdrops.length - 1]
    fireEvent.click(moreBackdrop)
    await waitFor(() => {
      expect(screen.queryByText('Stash Changes')).not.toBeInTheDocument()
    })
  })

  it('closes branch menu when opening more menu', async () => {
    mockListBranches.mockResolvedValue([{ name: 'main', current: true }])
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    // Open branch menu first
    const branchBtn = screen.getByRole('button', { name: /main/ })
    fireEvent.click(branchBtn)
    // Wait for branch menu to render
    await screen.findByText('current')
    // Open more menu — should close branch menu
    const moreBtn = screen.getByTitle('More actions')
    fireEvent.click(moreBtn)
    await screen.findByText('Stash Changes')
    // Branch menu items should be gone (current label disappears)
    expect(screen.queryByText('current')).not.toBeInTheDocument()
  })

  // ─── Error handling for stage / unstage ───

  it('shows error toast on stage failure', async () => {
    mockStage.mockRejectedValue(new Error('stage error'))
    mockGetStatus.mockResolvedValue([{ path: 'a.ts', status: 'M', staged: false }])
    render(<SourceControlPanel />)
    const stageBtn = await screen.findByTitle('Stage')
    fireEvent.click(stageBtn)
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', 'Stage failed', 'stage error')
    })
  })

  it('shows error toast with unknown error on stage failure with non-Error', async () => {
    mockStage.mockRejectedValue('string error')
    mockGetStatus.mockResolvedValue([{ path: 'a.ts', status: 'M', staged: false }])
    render(<SourceControlPanel />)
    const stageBtn = await screen.findByTitle('Stage')
    fireEvent.click(stageBtn)
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', 'Stage failed', 'Unknown error')
    })
  })

  it('shows error toast on unstage failure', async () => {
    mockUnstage.mockRejectedValue(new Error('unstage error'))
    mockGetStatus.mockResolvedValue([{ path: 'a.ts', status: 'M', staged: true }])
    render(<SourceControlPanel />)
    const unstageBtn = await screen.findByTitle('Unstage')
    fireEvent.click(unstageBtn)
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', 'Unstage failed', 'unstage error')
    })
  })

  it('shows error toast on stage all failure', async () => {
    mockStage.mockRejectedValue(new Error('stage all error'))
    mockGetStatus.mockResolvedValue([
      { path: 'a.ts', status: 'M', staged: false },
      { path: 'b.ts', status: 'A', staged: false },
    ])
    render(<SourceControlPanel />)
    const stageAllBtn = await screen.findByTitle('Stage all')
    fireEvent.click(stageAllBtn)
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', 'Stage all failed', 'stage all error')
    })
  })

  it('shows error toast on unstage all failure', async () => {
    mockUnstage.mockRejectedValue(new Error('unstage all error'))
    mockGetStatus.mockResolvedValue([
      { path: 'a.ts', status: 'M', staged: true },
    ])
    render(<SourceControlPanel />)
    const unstageAllBtn = await screen.findByTitle('Unstage all')
    fireEvent.click(unstageAllBtn)
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', 'Unstage all failed', 'unstage all error')
    })
  })

  // ─── Status labels ───

  it('renders correct status labels for different file statuses', async () => {
    mockGetStatus.mockResolvedValue([
      { path: 'mod.ts', status: 'M', staged: false },
      { path: 'add.ts', status: 'A', staged: false },
      { path: 'del.ts', status: 'D', staged: false },
      { path: 'ren.ts', status: 'R', staged: false },
      { path: 'unt.ts', status: '??', staged: false },
    ])
    render(<SourceControlPanel />)
    await screen.findByText('mod.ts')
    expect(screen.getByTitle('Modified')).toBeInTheDocument()
    expect(screen.getByTitle('Added')).toBeInTheDocument()
    expect(screen.getByTitle('Deleted')).toBeInTheDocument()
    expect(screen.getByTitle('Renamed')).toBeInTheDocument()
    expect(screen.getByTitle('Untracked')).toBeInTheDocument()
  })

  it('renders status label text for unknown status', async () => {
    mockGetStatus.mockResolvedValue([
      { path: 'weird.ts', status: 'C', staged: false },
    ])
    render(<SourceControlPanel />)
    expect(await screen.findByTitle('C')).toBeInTheDocument()
  })

  // ─── Staged/Unstaged section collapse ───

  it('collapses staged section on header click', async () => {
    mockGetStatus.mockResolvedValue([
      { path: 'a.ts', status: 'M', staged: true },
      { path: 'b.ts', status: 'M', staged: false },
    ])
    render(<SourceControlPanel />)
    await screen.findByText('Staged Changes')
    const stagedHeader = screen.getByText('Staged Changes').closest('button')!
    // Section initially expanded (has aria-expanded)
    expect(stagedHeader).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(stagedHeader)
    expect(stagedHeader).toHaveAttribute('aria-expanded', 'false')
  })

  it('collapses unstaged section on header click', async () => {
    mockGetStatus.mockResolvedValue([
      { path: 'a.ts', status: 'M', staged: false },
    ])
    render(<SourceControlPanel />)
    await screen.findByText('Changes')
    const changesHeader = screen.getByText('Changes').closest('button')!
    expect(changesHeader).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(changesHeader)
    expect(changesHeader).toHaveAttribute('aria-expanded', 'false')
  })

  // ─── git-checkout event listener ───

  it('opens branch menu on git-checkout window event', async () => {
    mockListBranches.mockResolvedValue([
      { name: 'main', current: true },
    ])
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    expect(screen.queryByPlaceholderText('Create branch...')).not.toBeInTheDocument()
    await act(async () => {
      window.dispatchEvent(new Event('git-checkout'))
    })
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Create branch...')).toBeInTheDocument()
    })
  })

  it('removes git-checkout listener on unmount', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    expect(addSpy).toHaveBeenCalledWith('git-checkout', expect.any(Function))
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('git-checkout', expect.any(Function))
    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  // ─── Refresh status error ───

  it('logs error when refreshStatus fails on mount', async () => {
    const { logger } = await import('../utils')
    mockGetStatus.mockRejectedValue(new Error('status error'))
    render(<SourceControlPanel />)
    await waitFor(() => {
      expect(logger.error).toHaveBeenCalled()
    })
  })

  // ─── Push disabled when no branch ───

  it('push button is disabled when no current branch', async () => {
    mockGetBranch.mockResolvedValue('')
    render(<SourceControlPanel />)
    await screen.findByText('no branch')
    const pushBtn = screen.getByTitle('Push (git push)')
    expect(pushBtn).toBeDisabled()
  })

  // ─── CreateBranchItem clear on Escape ───

  it('clears branch creation input on Escape', async () => {
    mockListBranches.mockResolvedValue([{ name: 'main', current: true }])
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const branchBtn = screen.getByRole('button', { name: /main/ })
    fireEvent.click(branchBtn)
    const branchInput = await screen.findByPlaceholderText('Create branch...')
    fireEvent.change(branchInput, { target: { value: 'test-branch' } })
    expect(branchInput).toHaveValue('test-branch')
    fireEvent.keyDown(branchInput, { key: 'Escape' })
    expect(branchInput).toHaveValue('')
  })

  // ─── CreateBranchItem submit button ───

  it('shows submit button only when input has value', async () => {
    mockListBranches.mockResolvedValue([{ name: 'main', current: true }])
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const branchBtn = screen.getByRole('button', { name: /main/ })
    fireEvent.click(branchBtn)
    await screen.findByPlaceholderText('Create branch...')
    // The + button should not be visible when input is empty
    const input = screen.getByPlaceholderText('Create branch...')
    fireEvent.change(input, { target: { value: 'x' } })
    // After typing, the + button appears — it's inside the branch menu
    const plusButtons = document.querySelectorAll('button.p-0\\.5')
    expect(plusButtons.length).toBeGreaterThan(0)
  })

  // ─── Commit button shows staged count ───

  it('shows staged file count in commit button', async () => {
    mockGetStatus.mockResolvedValue([
      { path: 'a.ts', status: 'M', staged: true },
      { path: 'b.ts', status: 'A', staged: true },
    ])
    render(<SourceControlPanel />)
    expect(await screen.findByText(/Commit \(2\)/)).toBeInTheDocument()
  })

  // ─── Log view toggle (close by re-clicking log button while open) ───

  it('closes log view when log button clicked while log is shown', async () => {
    mockGetLog.mockResolvedValue([{ hash: 'abc', message: 't', author: 'd', date: 'x' }])
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const logBtn = screen.getByTitle('Git Log')
    // Open log
    fireEvent.click(logBtn)
    await screen.findByText('Back to changes')
    // Click log button again — this toggles showLog to false (short-circuit return)
    fireEvent.click(logBtn)
    await waitFor(() => {
      expect(screen.queryByText('Back to changes')).not.toBeInTheDocument()
    })
  })

  // ─── Load branches error ───

  it('logs error when loadBranches fails', async () => {
    const { logger } = await import('../utils')
    mockListBranches.mockRejectedValue(new Error('branches error'))
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const branchBtn = screen.getByRole('button', { name: /main/ })
    fireEvent.click(branchBtn)
    await waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        'SourceControl', 'Failed to load branches:', expect.any(Error)
      )
    })
  })

  // ─── Component shows "current" label for active branch ───

  it('shows current label next to active branch in branch menu', async () => {
    mockListBranches.mockResolvedValue([
      { name: 'main', current: true },
      { name: 'develop', current: false },
    ])
    render(<SourceControlPanel />)
    await screen.findByText('Source Control')
    const branchBtn = screen.getByRole('button', { name: /main/ })
    fireEvent.click(branchBtn)
    expect(await screen.findByText('current')).toBeInTheDocument()
  })
})

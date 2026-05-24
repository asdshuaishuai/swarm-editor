import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CodeObserver, type FileChange, type AgentPerformance } from './CodeObserver'

const sampleChanges: FileChange[] = [
  { path: 'src/main.ts', additions: 10, deletions: 2, status: 'modified' },
  { path: 'src/utils/helpers.ts', additions: 30, deletions: 0, status: 'added' },
  { path: 'src/old-module.ts', additions: 0, deletions: 50, status: 'deleted' },
]

const samplePerformance: AgentPerformance[] = [
  { agentId: 'claude-code', name: 'Claude Code', status: 'working', latency: 120, tasksCompleted: 5 },
  { agentId: 'gemini-cli', name: 'Gemini CLI', status: 'idle', latency: 80, tasksCompleted: 3 },
  { agentId: 'opencode', name: 'OpenCode', status: 'completed', latency: 200, tasksCompleted: 8 },
]

describe('CodeObserver', () => {
  const onFileSelect = vi.fn()

  beforeEach(() => vi.clearAllMocks())

  it('renders changes tab by default with file list', () => {
    render(<CodeObserver changes={sampleChanges} agentPerformance={[]} />)
    expect(screen.getByText('main.ts')).toBeInTheDocument()
    expect(screen.getByText('helpers.ts')).toBeInTheDocument()
    expect(screen.getByText('old-module.ts')).toBeInTheDocument()
  })

  it('shows additions and deletions for each file', () => {
    render(<CodeObserver changes={sampleChanges} agentPerformance={[]} />)
    // First file: +10 -2
    expect(screen.getByText('+10')).toBeInTheDocument()
    expect(screen.getByText('-2')).toBeInTheDocument()
  })

  it('calls onFileSelect when a file is clicked', () => {
    render(
      <CodeObserver
        changes={sampleChanges}
        agentPerformance={[]}
        onFileSelect={onFileSelect}
      />,
    )
    fireEvent.click(screen.getByText('main.ts'))
    expect(onFileSelect).toHaveBeenCalledWith('src/main.ts')
  })

  it('shows empty state when no changes', () => {
    render(<CodeObserver changes={[]} agentPerformance={[]} />)
    expect(screen.getByText('暂无变更')).toBeInTheDocument()
  })

  it('switches to performance tab and shows agent data', () => {
    render(
      <CodeObserver changes={[]} agentPerformance={samplePerformance} />,
    )
    fireEvent.click(screen.getByText('Agent 性能'))
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
    expect(screen.getByText('工作中')).toBeInTheDocument()
    expect(screen.getByText('延迟: 120ms')).toBeInTheDocument()
  })

  it('shows empty state when no agent performance data', () => {
    render(<CodeObserver changes={[]} agentPerformance={[]} />)
    fireEvent.click(screen.getByText('Agent 性能'))
    expect(screen.getByText('暂无 Agent 运行')).toBeInTheDocument()
  })

  it('switches to diagnostics tab', () => {
    render(<CodeObserver changes={[]} agentPerformance={[]} />)
    fireEvent.click(screen.getByText('诊断'))
    expect(screen.getByText('LSP')).toBeInTheDocument()
    expect(screen.getByText('Git')).toBeInTheDocument()
    expect(screen.getByText('Terminal')).toBeInTheDocument()
  })

  it('highlights selected file', () => {
    render(
      <CodeObserver
        changes={sampleChanges}
        agentPerformance={[]}
        selectedFile="src/main.ts"
      />,
    )
    const fileButton = screen.getByText('main.ts').closest('button')
    expect(fileButton?.className).toContain('bg-primary/10')
  })
})

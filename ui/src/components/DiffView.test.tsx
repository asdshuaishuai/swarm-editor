import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import DiffView from './DiffView'

// Mock CodeMirror modules
vi.mock('@codemirror/merge', () => ({
  MergeView: { create: vi.fn() },
  unifiedMergeView: vi.fn(() => (() => {}) as unknown as import('@codemirror/state').Extension),
  goToNextChunk: vi.fn(),
  goToPreviousChunk: vi.fn(),
  getChunks: vi.fn(() => []),
}))

vi.mock('@codemirror/view', () => ({
  EditorView: {
    theme: vi.fn(() => (() => {}) as unknown as import('@codemirror/state').Extension),
  },
}))

vi.mock('@codemirror/basic-setup', () => ({
  basicSetup: [],
}))

vi.mock('../utils/codemirrorTheme', () => ({
  swarmDarkTheme: [],
}))

vi.mock('../utils/codemirrorSetup', () => ({
  getLanguageExtension: vi.fn(() => []),
}))

describe('DiffView', () => {
  it('renders diff header with filename', () => {
    render(
      <DiffView
        original="hello"
        modified="world"
        filename="test.ts"
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('test.ts')).toBeInTheDocument()
  })

  it('renders diff stats', () => {
    render(
      <DiffView
        original="hello"
        modified="world"
        filename="test.ts"
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('+1')).toBeInTheDocument()
    expect(screen.getByText('-1')).toBeInTheDocument()
  })

  it('renders close button', () => {
    render(
      <DiffView
        original="hello"
        modified="world"
        filename="test.ts"
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByTitle('Close diff view')).toBeInTheDocument()
  })

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn()
    render(
      <DiffView
        original="hello"
        modified="world"
        filename="test.ts"
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByTitle('Close diff view'))
    expect(onClose).toHaveBeenCalled()
  })

  it('renders mode toggle button', () => {
    render(
      <DiffView
        original="hello"
        modified="world"
        filename="test.ts"
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByTitle('Switch to unified view')).toBeInTheDocument()
  })

  it('renders chunk navigation buttons', () => {
    render(
      <DiffView
        original="hello"
        modified="world"
        filename="test.ts"
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByTitle('Previous change (Alt+F5)')).toBeInTheDocument()
    expect(screen.getByTitle('Next change (F5)')).toBeInTheDocument()
  })

  it('shows chunk count', () => {
    render(
      <DiffView
        original="hello"
        modified="world"
        filename="test.ts"
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('0/0')).toBeInTheDocument()
  })
})

import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { FileAutocomplete } from './FileAutocomplete'
import type { FileItem } from './FileAutocomplete'

const sampleFiles: FileItem[] = [
  { path: '/src/index.ts', type: 'file', name: 'index.ts' },
  { path: '/src/components/App.tsx', type: 'file', name: 'App.tsx' },
  { path: '/src/utils', type: 'folder', name: 'utils' },
  { path: '/src/components/Button.tsx', type: 'file', name: 'Button.tsx' },
  { path: '/README.md', type: 'file', name: 'README.md' },
]

describe('FileAutocomplete', () => {
  const onSelect = vi.fn()
  const onClose = vi.fn()
  const position = { top: 100, left: 50 }

  beforeEach(() => {
    vi.clearAllMocks()
    // scrollIntoView is not implemented in jsdom
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('renders file list with files', () => {
    render(
      <FileAutocomplete query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    expect(screen.getByText(/5 results/)).toBeInTheDocument()
    expect(screen.getByText('index.ts')).toBeInTheDocument()
    expect(screen.getByText('App.tsx')).toBeInTheDocument()
    expect(screen.getByText('Button.tsx')).toBeInTheDocument()
  })

  it('filters files by query', () => {
    render(
      <FileAutocomplete query="button" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    expect(screen.getByText('Button.tsx')).toBeInTheDocument()
    expect(screen.queryByText('index.ts')).toBeNull()
    expect(screen.queryByText('App.tsx')).toBeNull()
  })

  it('shows empty state when no files match', () => {
    render(
      <FileAutocomplete query="zzznonexistent" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    expect(screen.getByText(/No files found matching/)).toBeInTheDocument()
    expect(screen.getByText(/zzznonexistent/)).toBeInTheDocument()
  })

  it('calls onSelect and onClose when a file is clicked', () => {
    render(
      <FileAutocomplete query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    fireEvent.click(screen.getByText('index.ts'))
    expect(onSelect).toHaveBeenCalledWith('/src/index.ts')
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape key', () => {
    render(
      <FileAutocomplete query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('selects item on Enter key', () => {
    render(
      <FileAutocomplete query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' })
    })
    // First item should be selected by default
    expect(onSelect).toHaveBeenCalledWith('/src/index.ts')
    expect(onClose).toHaveBeenCalled()
  })

  it('navigates with arrow keys', () => {
    render(
      <FileAutocomplete query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    // Arrow down to second item
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown' })
    })
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' })
    })
    // Second item is App.tsx
    expect(onSelect).toHaveBeenCalledWith('/src/components/App.tsx')
  })

  it('respects maxResults prop', () => {
    render(
      <FileAutocomplete query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} maxResults={2} />
    )
    expect(screen.getByText(/2 results/)).toBeInTheDocument()
  })
})

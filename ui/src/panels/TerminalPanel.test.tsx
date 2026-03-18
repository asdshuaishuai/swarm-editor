import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import TerminalPanel, { TerminalEntry } from './TerminalPanel'

describe('TerminalPanel', () => {
  const mockEntries: TerminalEntry[] = [
    {
      id: '1',
      type: 'info',
      message: 'Info message',
      timestamp: new Date('2024-01-01T10:00:00'),
    },
    {
      id: '2',
      type: 'success',
      message: 'Success message',
      timestamp: new Date('2024-01-01T10:00:01'),
    },
    {
      id: '3',
      type: 'error',
      message: 'Error message',
      timestamp: new Date('2024-01-01T10:00:02'),
      details: 'Error details',
    },
    {
      id: '4',
      type: 'warning',
      message: 'Warning message',
      timestamp: new Date('2024-01-01T10:00:03'),
    },
    {
      id: '5',
      type: 'command',
      message: 'Command message',
      timestamp: new Date('2024-01-01T10:00:04'),
    },
  ]

  const mockOnClear = vi.fn()
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not render when no entries', () => {
    render(
      <TerminalPanel
        entries={[]}
        onClear={mockOnClear}
      />
    )
    expect(screen.queryByText('Terminal Output')).not.toBeInTheDocument()
  })

  it('renders terminal header with entry count', () => {
    render(
      <TerminalPanel
        entries={mockEntries}
        onClear={mockOnClear}
      />
    )
    expect(screen.getByText('Terminal Output')).toBeInTheDocument()
    expect(screen.getByText('(5 entries)')).toBeInTheDocument()
  })

  it('renders all entry messages', () => {
    render(
      <TerminalPanel
        entries={mockEntries}
        onClear={mockOnClear}
      />
    )
    expect(screen.getByText('Info message')).toBeInTheDocument()
    expect(screen.getByText('Success message')).toBeInTheDocument()
    expect(screen.getByText('Error message')).toBeInTheDocument()
    expect(screen.getByText('Warning message')).toBeInTheDocument()
    expect(screen.getByText('Command message')).toBeInTheDocument()
  })

  it('renders entry details', () => {
    render(
      <TerminalPanel
        entries={mockEntries}
        onClear={mockOnClear}
      />
    )
    expect(screen.getByText('Error details')).toBeInTheDocument()
  })

  it('calls onClear when clear button clicked', () => {
    render(
      <TerminalPanel
        entries={mockEntries}
        onClear={mockOnClear}
      />
    )
    fireEvent.click(screen.getByTitle('Clear Output'))
    expect(mockOnClear).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when close button clicked', () => {
    render(
      <TerminalPanel
        entries={mockEntries}
        onClear={mockOnClear}
        onClose={mockOnClose}
      />
    )
    fireEvent.click(screen.getByTitle('Close'))
    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('does not show close button when onClose not provided', () => {
    render(
      <TerminalPanel
        entries={mockEntries}
        onClear={mockOnClear}
      />
    )
    expect(screen.queryByTitle('Close')).not.toBeInTheDocument()
  })

  it('toggles collapse state when collapse button clicked', () => {
    render(
      <TerminalPanel
        entries={mockEntries}
        onClear={mockOnClear}
      />
    )
    // Initially expanded - output should be visible
    expect(screen.getByText('Info message')).toBeInTheDocument()

    // Click collapse button
    fireEvent.click(screen.getByTitle('Collapse'))
    expect(screen.queryByText('Info message')).not.toBeInTheDocument()

    // Click expand button
    fireEvent.click(screen.getByTitle('Expand'))
    expect(screen.getByText('Info message')).toBeInTheDocument()
  })

  it('renders timestamps in correct format', () => {
    render(
      <TerminalPanel
        entries={mockEntries}
        onClear={mockOnClear}
      />
    )
    // Timestamps should be in HH:MM:SS format
    expect(screen.getByText(/\[10:00:00\]/)).toBeInTheDocument()
    expect(screen.getByText(/\[10:00:01\]/)).toBeInTheDocument()
    expect(screen.getByText(/\[10:00:02\]/)).toBeInTheDocument()
  })

  it('renders success icon', () => {
    render(
      <TerminalPanel
        entries={mockEntries}
        onClear={mockOnClear}
      />
    )
    expect(screen.getByText('✓')).toBeInTheDocument()
  })

  it('renders error icon', () => {
    render(
      <TerminalPanel
        entries={mockEntries}
        onClear={mockOnClear}
      />
    )
    expect(screen.getByText('✗')).toBeInTheDocument()
  })

  it('renders warning icon', () => {
    render(
      <TerminalPanel
        entries={mockEntries}
        onClear={mockOnClear}
      />
    )
    expect(screen.getByText('⚠')).toBeInTheDocument()
  })

  it('renders command icon', () => {
    render(
      <TerminalPanel
        entries={mockEntries}
        onClear={mockOnClear}
      />
    )
    expect(screen.getByText('>')).toBeInTheDocument()
  })

  it('renders info icon', () => {
    render(
      <TerminalPanel
        entries={mockEntries}
        onClear={mockOnClear}
      />
    )
    expect(screen.getByText('●')).toBeInTheDocument()
  })

  it('has resizable handle', () => {
    render(
      <TerminalPanel
        entries={mockEntries}
        onClear={mockOnClear}
      />
    )
    // Check for resize handle by class
    const resizeHandle = document.querySelector('.cursor-ns-resize')
    expect(resizeHandle).toBeInTheDocument()
  })
})

describe('TerminalPanel resizing', () => {
  const mockEntries: TerminalEntry[] = [
    {
      id: '1',
      type: 'info',
      message: 'Test message',
      timestamp: new Date(),
    },
  ]

  const mockOnClear = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts with default height', () => {
    render(
      <TerminalPanel
        entries={mockEntries}
        onClear={mockOnClear}
        defaultHeight={250}
      />
    )
    const panel = screen.getByText('Terminal Output').closest('div[class*="flex-col"]')
    expect(panel).toHaveStyle({ height: '250px' })
  })

  it('respects min and max height constraints', () => {
    render(
      <TerminalPanel
        entries={mockEntries}
        onClear={mockOnClear}
        defaultHeight={150}
        minHeight={100}
        maxHeight={300}
      />
    )
    const panel = screen.getByText('Terminal Output').closest('div[class*="flex-col"]')
    expect(panel).toHaveStyle({ height: '150px' })
  })

  it('handles resize drag interaction', () => {
    render(
      <TerminalPanel
        entries={mockEntries}
        onClear={mockOnClear}
        defaultHeight={200}
        minHeight={100}
        maxHeight={300}
      />
    )

    const resizeHandle = document.querySelector('.cursor-ns-resize') as HTMLElement
    expect(resizeHandle).toBeInTheDocument()

    // Start resize
    fireEvent.mouseDown(resizeHandle, { clientY: 300 })

    // Move mouse up (should increase height)
    fireEvent.mouseMove(document, { clientY: 250 })

    // End resize
    fireEvent.mouseUp(document)

    // Panel should have been resized
    const panel = screen.getByText('Terminal Output').closest('div[class*="flex-col"]')
    expect(panel).toHaveStyle({ height: '250px' })
  })

  it('constrains resize to maxHeight', () => {
    render(
      <TerminalPanel
        entries={mockEntries}
        onClear={mockOnClear}
        defaultHeight={200}
        minHeight={100}
        maxHeight={250}
      />
    )

    const resizeHandle = document.querySelector('.cursor-ns-resize') as HTMLElement

    // Start resize
    fireEvent.mouseDown(resizeHandle, { clientY: 200 })

    // Try to move beyond maxHeight
    fireEvent.mouseMove(document, { clientY: -100 })

    // Should be constrained to maxHeight
    const panel = screen.getByText('Terminal Output').closest('div[class*="flex-col"]')
    expect(panel).toHaveStyle({ height: '250px' })
  })

  it('constrains resize to minHeight', () => {
    render(
      <TerminalPanel
        entries={mockEntries}
        onClear={mockOnClear}
        defaultHeight={200}
        minHeight={100}
        maxHeight={300}
      />
    )

    const resizeHandle = document.querySelector('.cursor-ns-resize') as HTMLElement

    // Start resize
    fireEvent.mouseDown(resizeHandle, { clientY: 200 })

    // Try to move beyond minHeight (drag down)
    fireEvent.mouseMove(document, { clientY: 500 })

    // Should be constrained to minHeight
    const panel = screen.getByText('Terminal Output').closest('div[class*="flex-col"]')
    expect(panel).toHaveStyle({ height: '100px' })
  })

  it('removes event listeners on mouseup', () => {
    render(
      <TerminalPanel
        entries={mockEntries}
        onClear={mockOnClear}
      />
    )

    const resizeHandle = document.querySelector('.cursor-ns-resize') as HTMLElement

    // Start and end resize
    fireEvent.mouseDown(resizeHandle, { clientY: 200 })
    fireEvent.mouseUp(document)

    // Move after mouseup should not affect height
    const panelBefore = screen.getByText('Terminal Output').closest('div[class*="flex-col"]')
    const heightBefore = (panelBefore as HTMLElement).style.height

    fireEvent.mouseMove(document, { clientY: 100 })

    const panelAfter = screen.getByText('Terminal Output').closest('div[class*="flex-col"]')
    expect((panelAfter as HTMLElement).style.height).toBe(heightBefore)
  })
})

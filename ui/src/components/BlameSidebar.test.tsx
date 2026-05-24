import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BlameSidebar } from './BlameSidebar'
import type { BlameLine } from '../services/api'

const lines: BlameLine[] = [
  { line: 1, author: 'Alice', authorMail: 'alice@test.com', authorTime: '2025-01-01', summary: 'init', commit: 'abc1234' },
  { line: 2, author: 'Bob', authorMail: 'bob@test.com', authorTime: '2025-01-02', summary: 'fix', commit: 'def5678' },
]

describe('BlameSidebar', () => {
  it('renders nothing when lines is empty', () => {
    const { container } = render(<BlameSidebar lines={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders author and time for each line', () => {
    render(<BlameSidebar lines={lines} />)
    expect(screen.getByText('Alice 2025-01-01')).toBeInTheDocument()
    expect(screen.getByText('Bob 2025-01-02')).toBeInTheDocument()
  })

  it('sets title with full blame info', () => {
    render(<BlameSidebar lines={lines} />)
    const firstLine = screen.getByText('Alice 2025-01-01').closest('div')
    expect(firstLine?.getAttribute('title')).toContain('alice@test.com')
    expect(firstLine?.getAttribute('title')).toContain('init')
    expect(firstLine?.getAttribute('title')).toContain('abc1234')
  })

  it('renders correct number of lines', () => {
    const { container } = render(<BlameSidebar lines={lines} />)
    const divs = container.querySelectorAll('div[class*="truncate"]')
    expect(divs.length).toBe(2)
  })
})

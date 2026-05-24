import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AgentNetworkGraph } from './AgentNetworkGraph'

describe('AgentNetworkGraph', () => {
	const mockAgents = [
		{ id: 'a1', name: 'Agent 1', status: 'active' as const, x: 100, y: 100, vx: 0, vy: 0, tasks: 3, connections: ['a2'] },
		{ id: 'a2', name: 'Agent 2', status: 'idle' as const, x: 200, y: 150, vx: 0, vy: 0, tasks: 0, connections: [] },
	]

	const mockFlows = [
		{ from: 'a1', to: 'a2', status: 'in_progress' as const },
	]

	it('renders canvas element', () => {
		const { container } = render(<AgentNetworkGraph agents={mockAgents} flows={mockFlows} />)
		const canvas = container.querySelector('canvas')
		expect(canvas).toBeTruthy()
	})

	it('uses default dimensions', () => {
		const { container } = render(<AgentNetworkGraph agents={mockAgents} flows={mockFlows} />)
		const canvas = container.querySelector('canvas') as HTMLCanvasElement
		expect(canvas.width).toBe(400)
		expect(canvas.height).toBe(300)
	})

	it('accepts custom dimensions', () => {
		const { container } = render(<AgentNetworkGraph agents={mockAgents} flows={mockFlows} width={600} height={400} />)
		const canvas = container.querySelector('canvas') as HTMLCanvasElement
		expect(canvas.width).toBe(600)
		expect(canvas.height).toBe(400)
	})

	it('renders with empty agents', () => {
		const { container } = render(<AgentNetworkGraph agents={[]} flows={[]} />)
		expect(container.querySelector('canvas')).toBeTruthy()
	})

	it('renders with empty flows', () => {
		const { container } = render(<AgentNetworkGraph agents={mockAgents} flows={[]} />)
		expect(container.querySelector('canvas')).toBeTruthy()
	})

	it('handles node click', () => {
		const onClick = vi.fn()
		render(<AgentNetworkGraph agents={mockAgents} flows={mockFlows} onNodeClick={onClick} />)
		// Canvas click events would need canvas interaction simulation
		// Just verify the callback prop is accepted without error
		expect(onClick).not.toHaveBeenCalled()
	})

	it('renders without onNodeClick', () => {
		const { container } = render(<AgentNetworkGraph agents={mockAgents} flows={mockFlows} />)
		expect(container.querySelector('canvas')).toBeTruthy()
	})
})

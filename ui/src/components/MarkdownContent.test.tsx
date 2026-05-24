import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarkdownContent } from './MarkdownContent'

describe('MarkdownContent', () => {
	it('renders plain text', () => {
		render(<MarkdownContent content="Hello world" />)
		expect(screen.getByText('Hello world')).toBeTruthy()
	})

	it('renders markdown bold', () => {
		render(<MarkdownContent content="**bold**" />)
		const el = document.querySelector('strong')
		expect(el).toBeTruthy()
		expect(el?.textContent).toBe('bold')
	})

	it('renders markdown heading', () => {
		render(<MarkdownContent content="# Title" />)
		const h1 = document.querySelector('h1')
		expect(h1).toBeTruthy()
		expect(h1?.textContent).toBe('Title')
	})

	it('renders code block', () => {
		render(<MarkdownContent content="```javascript\nconsole.log('hi')\n```" />)
		// SyntaxHighlighter renders the code
		expect(document.querySelector('code, pre')).toBeTruthy()
	})

	it('applies className', () => {
		const { container } = render(<MarkdownContent content="test" className="my-class" />)
		expect(container.firstChild).toHaveClass('my-class')
	})

	it('renders empty content', () => {
		const { container } = render(<MarkdownContent content="" />)
		expect(container.firstChild).toBeTruthy()
	})

	it('renders link', () => {
		render(<MarkdownContent content="[click](https://example.com)" />)
		const link = document.querySelector('a')
		expect(link).toBeTruthy()
		expect(link?.getAttribute('href')).toBe('https://example.com')
	})
})

import { describe, it, expect } from 'vitest'
import { swarmDarkTheme, swarmTheme, swarmColors } from './codemirrorTheme'

describe('codemirrorTheme', () => {
	it('exports swarmDarkTheme as an extension', () => {
		expect(swarmDarkTheme).toBeDefined()
	})

	it('exports swarmTheme as a theme instance', () => {
		expect(swarmTheme).toBeDefined()
	})

	it('exports swarmColors with expected palette', () => {
		expect(swarmColors.background).toBe('#0d1117')
		expect(swarmColors.gutter).toBe('#161b22')
		expect(swarmColors.accent).toBe('#58a6ff')
		expect(swarmColors.border).toBe('#30363d')
		expect(swarmColors.foreground).toBe('#d1d5db')
		expect(swarmColors.cursor).toBe('#aeafad')
		expect(swarmColors.selection).toBe('#264f78')
		expect(swarmColors.error).toBe('#f44747')
	})

	it('has all required color tokens', () => {
		const required = [
			'background', 'gutter', 'selection', 'cursor', 'lineHighlight',
			'foreground', 'comment', 'keyword', 'string', 'number', 'type',
			'function', 'variable', 'operator', 'error', 'accent', 'border',
			'inactiveCursor', 'matchingBracket', 'nonmatchingBracket', 'whitespace',
		]
		for (const key of required) {
			expect(swarmColors[key as keyof typeof swarmColors]).toBeTruthy()
		}
	})
})

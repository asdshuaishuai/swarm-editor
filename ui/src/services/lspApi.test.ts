import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInvoke = vi.fn().mockResolvedValue({})
vi.mock('./websocket', () => ({
  getWebSocketClient: () => ({
    invoke: mockInvoke,
  }),
}))

import { lspApi } from './lspApi'

describe('lspApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInvoke.mockResolvedValue({})
  })

  describe('completion', () => {
    it('calls lsp_completion with correct params', async () => {
      const items = [{ label: 'foo' }]
      mockInvoke.mockResolvedValueOnce({ items })

      const result = await lspApi.completion('test.ts', 10, 5, 'file:///test.ts', 1, '.')

      expect(mockInvoke).toHaveBeenCalledWith('lsp_completion', {
        file: 'test.ts', line: 10, column: 5, uri: 'file:///test.ts', triggerKind: 1, triggerCharacter: '.'
      })
      expect(result.items).toEqual(items)
    })

    it('works without optional params', async () => {
      await lspApi.completion('test.ts', 1, 1)
      expect(mockInvoke).toHaveBeenCalledWith('lsp_completion', {
        file: 'test.ts', line: 1, column: 1, uri: undefined, triggerKind: undefined, triggerCharacter: undefined
      })
    })
  })

  describe('hover', () => {
    it('calls lsp_hover with correct params', async () => {
      const hover = { contents: 'type info' }
      mockInvoke.mockResolvedValueOnce(hover)

      const result = await lspApi.hover('test.ts', 5, 10)

      expect(mockInvoke).toHaveBeenCalledWith('lsp_hover', { file: 'test.ts', line: 5, column: 10, uri: undefined })
      expect(result).toEqual(hover)
    })
  })

  describe('definition', () => {
    it('calls lsp_definition with correct params', async () => {
      const locations = [{ uri: 'file:///other.ts', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } }]
      mockInvoke.mockResolvedValueOnce({ locations })

      const result = await lspApi.definition('test.ts', 10, 5)

      expect(mockInvoke).toHaveBeenCalledWith('lsp_definition', { file: 'test.ts', line: 10, column: 5, uri: undefined })
      expect(result.locations).toEqual(locations)
    })
  })

  describe('implementation', () => {
    it('calls lsp_implementation', async () => {
      await lspApi.implementation('test.ts', 1, 1)
      expect(mockInvoke).toHaveBeenCalledWith('lsp_implementation', { file: 'test.ts', line: 1, column: 1, uri: undefined })
    })
  })

  describe('typeDefinition', () => {
    it('calls lsp_type_definition', async () => {
      await lspApi.typeDefinition('test.ts', 1, 1)
      expect(mockInvoke).toHaveBeenCalledWith('lsp_type_definition', { file: 'test.ts', line: 1, column: 1, uri: undefined })
    })
  })

  describe('references', () => {
    it('calls lsp_references', async () => {
      await lspApi.references('test.ts', 5, 10)
      expect(mockInvoke).toHaveBeenCalledWith('lsp_references', { file: 'test.ts', line: 5, column: 10, uri: undefined })
    })
  })

  describe('didOpen', () => {
    it('calls lsp_did_open', async () => {
      await lspApi.didOpen('file:///test.ts', 'test.ts', 'typescript', 'const x = 1')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_did_open', { uri: 'file:///test.ts', file: 'test.ts', language: 'typescript', content: 'const x = 1' })
    })
  })

  describe('didChange', () => {
    it('calls lsp_did_change', async () => {
      await lspApi.didChange('test.ts', 'new content')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_did_change', { file: 'test.ts', content: 'new content' })
    })
  })

  describe('didChangeIncremental', () => {
    it('calls lsp_did_change_incremental', async () => {
      const changes = [{ text: 'x' }]
      await lspApi.didChangeIncremental('test.ts', changes)
      expect(mockInvoke).toHaveBeenCalledWith('lsp_did_change_incremental', { file: 'test.ts', changes })
    })
  })

  describe('didClose', () => {
    it('calls lsp_did_close', async () => {
      await lspApi.didClose('test.ts')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_did_close', { file: 'test.ts' })
    })
  })

  describe('didSave', () => {
    it('calls lsp_did_save with text', async () => {
      await lspApi.didSave('test.ts', 'saved content')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_did_save', { file: 'test.ts', text: 'saved content' })
    })

    it('calls lsp_did_save without text', async () => {
      await lspApi.didSave('test.ts')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_did_save', { file: 'test.ts', text: null })
    })
  })

  describe('status', () => {
    it('calls lsp_status', async () => {
      const status = { servers: [], rootDir: '/project' }
      mockInvoke.mockResolvedValueOnce(status)

      const result = await lspApi.status()

      expect(mockInvoke).toHaveBeenCalledWith('lsp_status')
      expect(result).toEqual(status)
    })
  })

  describe('supportsIncrementalSync', () => {
    it('calls lsp_supports_incremental', async () => {
      mockInvoke.mockResolvedValueOnce(true)
      const result = await lspApi.supportsIncrementalSync('test.ts')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_supports_incremental', { file: 'test.ts' })
      expect(result).toBe(true)
    })
  })

  describe('diagnostics', () => {
    it('calls lsp_diagnostics with uri', async () => {
      const diags = { diagnostics: { 'file:///test.ts': [] } }
      mockInvoke.mockResolvedValueOnce(diags)

      const result = await lspApi.diagnostics('file:///test.ts')

      expect(mockInvoke).toHaveBeenCalledWith('lsp_diagnostics', { uri: 'file:///test.ts' })
      expect(result).toEqual(diags)
    })

    it('defaults uri to empty string', async () => {
      await lspApi.diagnostics()
      expect(mockInvoke).toHaveBeenCalledWith('lsp_diagnostics', { uri: '' })
    })
  })

  describe('signatureHelp', () => {
    it('calls lsp_signature_help', async () => {
      await lspApi.signatureHelp('test.ts', 1, 1)
      expect(mockInvoke).toHaveBeenCalledWith('lsp_signature_help', { file: 'test.ts', line: 1, column: 1, uri: undefined })
    })
  })

  describe('documentSymbols', () => {
    it('calls lsp_document_symbols', async () => {
      const symbols = [{ name: 'foo', kind: 12 }]
      mockInvoke.mockResolvedValueOnce({ symbols })

      const result = await lspApi.documentSymbols('test.ts')

      expect(mockInvoke).toHaveBeenCalledWith('lsp_document_symbols', { file: 'test.ts', uri: undefined })
      expect(result.symbols).toEqual(symbols)
    })
  })

  describe('documentHighlight', () => {
    it('calls lsp_document_highlight', async () => {
      await lspApi.documentHighlight('test.ts', 1, 1)
      expect(mockInvoke).toHaveBeenCalledWith('lsp_document_highlight', { file: 'test.ts', line: 1, column: 1, uri: undefined })
    })
  })

  describe('inlayHints', () => {
    it('calls lsp_inlay_hints', async () => {
      await lspApi.inlayHints('test.ts', 0, 10)
      expect(mockInvoke).toHaveBeenCalledWith('lsp_inlay_hints', { file: 'test.ts', startLine: 0, endLine: 10, uri: undefined })
    })
  })

  describe('foldingRanges', () => {
    it('calls lsp_folding_ranges', async () => {
      await lspApi.foldingRanges('test.ts')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_folding_ranges', { file: 'test.ts', uri: undefined })
    })
  })

  describe('workspaceSymbols', () => {
    it('calls lsp_workspace_symbols', async () => {
      await lspApi.workspaceSymbols('query')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_workspace_symbols', { query: 'query' })
    })
  })

  describe('codeActions', () => {
    it('calls lsp_code_actions', async () => {
      await lspApi.codeActions('test.ts', 1, 1)
      expect(mockInvoke).toHaveBeenCalledWith('lsp_code_actions', { file: 'test.ts', line: 1, column: 1, uri: undefined })
    })
  })

  describe('rename', () => {
    it('calls lsp_rename', async () => {
      await lspApi.rename('test.ts', 1, 1, 'newName')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_rename', { file: 'test.ts', line: 1, column: 1, newName: 'newName', uri: undefined })
    })
  })

  describe('formatting', () => {
    it('calls lsp_formatting', async () => {
      await lspApi.formatting('test.ts', undefined, 2, true)
      expect(mockInvoke).toHaveBeenCalledWith('lsp_formatting', { file: 'test.ts', uri: undefined, tabSize: 2, insertSpaces: true })
    })
  })

  describe('rangeFormatting', () => {
    it('calls lsp_range_formatting', async () => {
      await lspApi.rangeFormatting('test.ts', 0, 0, 10, 5)
      expect(mockInvoke).toHaveBeenCalledWith('lsp_range_formatting', {
        file: 'test.ts', uri: undefined, startLine: 0, startCol: 0, endLine: 10, endCol: 5, tabSize: undefined, insertSpaces: undefined
      })
    })
  })

  describe('onTypeFormatting', () => {
    it('calls lsp_on_type_formatting', async () => {
      await lspApi.onTypeFormatting('test.ts', 1, 1, ';')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_on_type_formatting', {
        file: 'test.ts', uri: undefined, line: 1, column: 1, triggerChar: ';', tabSize: undefined, insertSpaces: undefined
      })
    })
  })

  describe('selectionRange', () => {
    it('calls lsp_selection_range', async () => {
      const positions = [{ line: 1, character: 5 }]
      await lspApi.selectionRange('test.ts', positions)
      expect(mockInvoke).toHaveBeenCalledWith('lsp_selection_range', { file: 'test.ts', positions, uri: undefined })
    })
  })

  describe('semanticTokens', () => {
    it('calls lsp_semantic_tokens', async () => {
      const tokens = { data: [0, 0, 5, 1, 0] }
      mockInvoke.mockResolvedValueOnce({ tokens })

      const result = await lspApi.semanticTokens('test.ts')

      expect(mockInvoke).toHaveBeenCalledWith('lsp_semantic_tokens', { file: 'test.ts', uri: undefined })
      expect(result.tokens).toEqual(tokens)
    })
  })

  describe('semanticTokensRange', () => {
    it('calls lsp_semantic_tokens_range', async () => {
      await lspApi.semanticTokensRange('test.ts', 0, 0, 10, 0)
      expect(mockInvoke).toHaveBeenCalledWith('lsp_semantic_tokens_range', {
        file: 'test.ts', startLine: 0, startCol: 0, endLine: 10, endCol: 0, uri: undefined
      })
    })
  })

  describe('semanticTokensLegend', () => {
    it('calls lsp_semantic_tokens_legend', async () => {
      const legend = { tokenTypes: ['keyword'], tokenModifiers: ['declaration'] }
      mockInvoke.mockResolvedValueOnce({ legend })

      const result = await lspApi.semanticTokensLegend('test.ts')

      expect(mockInvoke).toHaveBeenCalledWith('lsp_semantic_tokens_legend', { file: 'test.ts' })
      expect(result.legend).toEqual(legend)
    })
  })

  describe('error handling', () => {
    it('propagates invoke errors', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('LSP not available'))

      await expect(lspApi.completion('test.ts', 1, 1)).rejects.toThrow('LSP not available')
    })
  })
})

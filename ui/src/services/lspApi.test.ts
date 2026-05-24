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

  // ---------------------------------------------------------------------------
  // completion
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // hover
  // ---------------------------------------------------------------------------
  describe('hover', () => {
    it('calls lsp_hover with correct params', async () => {
      const hover = { contents: 'type info' }
      mockInvoke.mockResolvedValueOnce(hover)

      const result = await lspApi.hover('test.ts', 5, 10)

      expect(mockInvoke).toHaveBeenCalledWith('lsp_hover', { file: 'test.ts', line: 5, column: 10, uri: undefined })
      expect(result).toEqual(hover)
    })

    it('passes optional uri param', async () => {
      await lspApi.hover('test.ts', 5, 10, 'file:///test.ts')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_hover', { file: 'test.ts', line: 5, column: 10, uri: 'file:///test.ts' })
    })
  })

  // ---------------------------------------------------------------------------
  // definition
  // ---------------------------------------------------------------------------
  describe('definition', () => {
    it('calls lsp_definition with correct params', async () => {
      const locations = [{ uri: 'file:///other.ts', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } }]
      mockInvoke.mockResolvedValueOnce({ locations })

      const result = await lspApi.definition('test.ts', 10, 5)

      expect(mockInvoke).toHaveBeenCalledWith('lsp_definition', { file: 'test.ts', line: 10, column: 5, uri: undefined })
      expect(result.locations).toEqual(locations)
    })

    it('passes optional uri param', async () => {
      await lspApi.definition('test.ts', 10, 5, 'file:///test.ts')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_definition', { file: 'test.ts', line: 10, column: 5, uri: 'file:///test.ts' })
    })
  })

  // ---------------------------------------------------------------------------
  // implementation
  // ---------------------------------------------------------------------------
  describe('implementation', () => {
    it('calls lsp_implementation', async () => {
      await lspApi.implementation('test.ts', 1, 1)
      expect(mockInvoke).toHaveBeenCalledWith('lsp_implementation', { file: 'test.ts', line: 1, column: 1, uri: undefined })
    })

    it('passes optional uri param', async () => {
      await lspApi.implementation('test.ts', 1, 1, 'file:///test.ts')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_implementation', { file: 'test.ts', line: 1, column: 1, uri: 'file:///test.ts' })
    })
  })

  // ---------------------------------------------------------------------------
  // typeDefinition
  // ---------------------------------------------------------------------------
  describe('typeDefinition', () => {
    it('calls lsp_type_definition', async () => {
      await lspApi.typeDefinition('test.ts', 1, 1)
      expect(mockInvoke).toHaveBeenCalledWith('lsp_type_definition', { file: 'test.ts', line: 1, column: 1, uri: undefined })
    })

    it('passes optional uri param', async () => {
      await lspApi.typeDefinition('test.ts', 1, 1, 'file:///test.ts')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_type_definition', { file: 'test.ts', line: 1, column: 1, uri: 'file:///test.ts' })
    })
  })

  // ---------------------------------------------------------------------------
  // references
  // ---------------------------------------------------------------------------
  describe('references', () => {
    it('calls lsp_references', async () => {
      await lspApi.references('test.ts', 5, 10)
      expect(mockInvoke).toHaveBeenCalledWith('lsp_references', { file: 'test.ts', line: 5, column: 10, uri: undefined })
    })

    it('passes optional uri param', async () => {
      await lspApi.references('test.ts', 5, 10, 'file:///test.ts')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_references', { file: 'test.ts', line: 5, column: 10, uri: 'file:///test.ts' })
    })
  })

  // ---------------------------------------------------------------------------
  // didOpen
  // ---------------------------------------------------------------------------
  describe('didOpen', () => {
    it('calls lsp_did_open', async () => {
      await lspApi.didOpen('file:///test.ts', 'test.ts', 'typescript', 'const x = 1')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_did_open', { uri: 'file:///test.ts', file: 'test.ts', language: 'typescript', content: 'const x = 1' })
    })
  })

  // ---------------------------------------------------------------------------
  // didChange
  // ---------------------------------------------------------------------------
  describe('didChange', () => {
    it('calls lsp_did_change', async () => {
      await lspApi.didChange('test.ts', 'new content')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_did_change', { file: 'test.ts', content: 'new content' })
    })
  })

  // ---------------------------------------------------------------------------
  // didChangeIncremental
  // ---------------------------------------------------------------------------
  describe('didChangeIncremental', () => {
    it('calls lsp_did_change_incremental', async () => {
      const changes = [{ text: 'x' }]
      await lspApi.didChangeIncremental('test.ts', changes)
      expect(mockInvoke).toHaveBeenCalledWith('lsp_did_change_incremental', { file: 'test.ts', changes })
    })

    it('passes changes with range', async () => {
      const changes = [{
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
        rangeLength: 5,
        text: 'hello',
      }]
      await lspApi.didChangeIncremental('test.ts', changes)
      expect(mockInvoke).toHaveBeenCalledWith('lsp_did_change_incremental', { file: 'test.ts', changes })
    })
  })

  // ---------------------------------------------------------------------------
  // didClose
  // ---------------------------------------------------------------------------
  describe('didClose', () => {
    it('calls lsp_did_close', async () => {
      await lspApi.didClose('test.ts')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_did_close', { file: 'test.ts' })
    })
  })

  // ---------------------------------------------------------------------------
  // didSave
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // status
  // ---------------------------------------------------------------------------
  describe('status', () => {
    it('calls lsp_status', async () => {
      const status = { servers: [], rootDir: '/project' }
      mockInvoke.mockResolvedValueOnce(status)

      const result = await lspApi.status()

      expect(mockInvoke).toHaveBeenCalledWith('lsp_status')
      expect(result).toEqual(status)
    })
  })

  // ---------------------------------------------------------------------------
  // supportsIncrementalSync
  // ---------------------------------------------------------------------------
  describe('supportsIncrementalSync', () => {
    it('calls lsp_supports_incremental', async () => {
      mockInvoke.mockResolvedValueOnce(true)
      const result = await lspApi.supportsIncrementalSync('test.ts')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_supports_incremental', { file: 'test.ts' })
      expect(result).toBe(true)
    })

    it('returns false when server does not support', async () => {
      mockInvoke.mockResolvedValueOnce(false)
      const result = await lspApi.supportsIncrementalSync('test.ts')
      expect(result).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // diagnostics
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // signatureHelp
  // ---------------------------------------------------------------------------
  describe('signatureHelp', () => {
    it('calls lsp_signature_help', async () => {
      await lspApi.signatureHelp('test.ts', 1, 1)
      expect(mockInvoke).toHaveBeenCalledWith('lsp_signature_help', { file: 'test.ts', line: 1, column: 1, uri: undefined })
    })

    it('passes optional uri param', async () => {
      await lspApi.signatureHelp('test.ts', 1, 1, 'file:///test.ts')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_signature_help', { file: 'test.ts', line: 1, column: 1, uri: 'file:///test.ts' })
    })
  })

  // ---------------------------------------------------------------------------
  // documentSymbols
  // ---------------------------------------------------------------------------
  describe('documentSymbols', () => {
    it('calls lsp_document_symbols', async () => {
      const symbols = [{ name: 'foo', kind: 12 }]
      mockInvoke.mockResolvedValueOnce({ symbols })

      const result = await lspApi.documentSymbols('test.ts')

      expect(mockInvoke).toHaveBeenCalledWith('lsp_document_symbols', { file: 'test.ts', uri: undefined })
      expect(result.symbols).toEqual(symbols)
    })

    it('passes optional uri param', async () => {
      await lspApi.documentSymbols('test.ts', 'file:///test.ts')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_document_symbols', { file: 'test.ts', uri: 'file:///test.ts' })
    })
  })

  // ---------------------------------------------------------------------------
  // documentHighlight
  // ---------------------------------------------------------------------------
  describe('documentHighlight', () => {
    it('calls lsp_document_highlight', async () => {
      await lspApi.documentHighlight('test.ts', 1, 1)
      expect(mockInvoke).toHaveBeenCalledWith('lsp_document_highlight', { file: 'test.ts', line: 1, column: 1, uri: undefined })
    })

    it('passes optional uri param', async () => {
      await lspApi.documentHighlight('test.ts', 1, 1, 'file:///test.ts')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_document_highlight', { file: 'test.ts', line: 1, column: 1, uri: 'file:///test.ts' })
    })
  })

  // ---------------------------------------------------------------------------
  // inlayHints
  // ---------------------------------------------------------------------------
  describe('inlayHints', () => {
    it('calls lsp_inlay_hints', async () => {
      await lspApi.inlayHints('test.ts', 0, 10)
      expect(mockInvoke).toHaveBeenCalledWith('lsp_inlay_hints', { file: 'test.ts', startLine: 0, endLine: 10, uri: undefined })
    })

    it('passes optional uri param', async () => {
      await lspApi.inlayHints('test.ts', 0, 10, 'file:///test.ts')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_inlay_hints', { file: 'test.ts', startLine: 0, endLine: 10, uri: 'file:///test.ts' })
    })
  })

  // ---------------------------------------------------------------------------
  // foldingRanges
  // ---------------------------------------------------------------------------
  describe('foldingRanges', () => {
    it('calls lsp_folding_ranges', async () => {
      await lspApi.foldingRanges('test.ts')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_folding_ranges', { file: 'test.ts', uri: undefined })
    })

    it('passes optional uri param', async () => {
      await lspApi.foldingRanges('test.ts', 'file:///test.ts')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_folding_ranges', { file: 'test.ts', uri: 'file:///test.ts' })
    })
  })

  // ---------------------------------------------------------------------------
  // workspaceSymbols
  // ---------------------------------------------------------------------------
  describe('workspaceSymbols', () => {
    it('calls lsp_workspace_symbols', async () => {
      await lspApi.workspaceSymbols('query')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_workspace_symbols', { query: 'query' })
    })

    it('passes empty query', async () => {
      await lspApi.workspaceSymbols('')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_workspace_symbols', { query: '' })
    })
  })

  // ---------------------------------------------------------------------------
  // codeActions
  // ---------------------------------------------------------------------------
  describe('codeActions', () => {
    it('calls lsp_code_actions', async () => {
      await lspApi.codeActions('test.ts', 1, 1)
      expect(mockInvoke).toHaveBeenCalledWith('lsp_code_actions', { file: 'test.ts', line: 1, column: 1, uri: undefined })
    })

    it('passes optional uri param', async () => {
      await lspApi.codeActions('test.ts', 1, 1, 'file:///test.ts')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_code_actions', { file: 'test.ts', line: 1, column: 1, uri: 'file:///test.ts' })
    })
  })

  // ---------------------------------------------------------------------------
  // rename
  // ---------------------------------------------------------------------------
  describe('rename', () => {
    it('calls lsp_rename', async () => {
      await lspApi.rename('test.ts', 1, 1, 'newName')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_rename', { file: 'test.ts', line: 1, column: 1, newName: 'newName', uri: undefined })
    })

    it('passes optional uri param', async () => {
      await lspApi.rename('test.ts', 1, 1, 'newName', 'file:///test.ts')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_rename', { file: 'test.ts', line: 1, column: 1, newName: 'newName', uri: 'file:///test.ts' })
    })
  })

  // ---------------------------------------------------------------------------
  // formatting
  // ---------------------------------------------------------------------------
  describe('formatting', () => {
    it('calls lsp_formatting', async () => {
      await lspApi.formatting('test.ts', undefined, 2, true)
      expect(mockInvoke).toHaveBeenCalledWith('lsp_formatting', { file: 'test.ts', uri: undefined, tabSize: 2, insertSpaces: true })
    })

    it('works with only file param', async () => {
      await lspApi.formatting('test.ts')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_formatting', { file: 'test.ts', uri: undefined, tabSize: undefined, insertSpaces: undefined })
    })
  })

  // ---------------------------------------------------------------------------
  // rangeFormatting
  // ---------------------------------------------------------------------------
  describe('rangeFormatting', () => {
    it('calls lsp_range_formatting', async () => {
      await lspApi.rangeFormatting('test.ts', 0, 0, 10, 5)
      expect(mockInvoke).toHaveBeenCalledWith('lsp_range_formatting', {
        file: 'test.ts', uri: undefined, startLine: 0, startCol: 0, endLine: 10, endCol: 5, tabSize: undefined, insertSpaces: undefined
      })
    })

    it('passes all optional params', async () => {
      await lspApi.rangeFormatting('test.ts', 1, 2, 20, 10, 'file:///test.ts', 4, false)
      expect(mockInvoke).toHaveBeenCalledWith('lsp_range_formatting', {
        file: 'test.ts', uri: 'file:///test.ts', startLine: 1, startCol: 2, endLine: 20, endCol: 10, tabSize: 4, insertSpaces: false
      })
    })
  })

  // ---------------------------------------------------------------------------
  // onTypeFormatting
  // ---------------------------------------------------------------------------
  describe('onTypeFormatting', () => {
    it('calls lsp_on_type_formatting', async () => {
      await lspApi.onTypeFormatting('test.ts', 1, 1, ';')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_on_type_formatting', {
        file: 'test.ts', uri: undefined, line: 1, column: 1, triggerChar: ';', tabSize: undefined, insertSpaces: undefined
      })
    })

    it('passes all optional params', async () => {
      await lspApi.onTypeFormatting('test.ts', 5, 10, '}', 'file:///test.ts', 2, true)
      expect(mockInvoke).toHaveBeenCalledWith('lsp_on_type_formatting', {
        file: 'test.ts', uri: 'file:///test.ts', line: 5, column: 10, triggerChar: '}', tabSize: 2, insertSpaces: true
      })
    })
  })

  // ---------------------------------------------------------------------------
  // selectionRange
  // ---------------------------------------------------------------------------
  describe('selectionRange', () => {
    it('calls lsp_selection_range', async () => {
      const positions = [{ line: 1, character: 5 }]
      await lspApi.selectionRange('test.ts', positions)
      expect(mockInvoke).toHaveBeenCalledWith('lsp_selection_range', { file: 'test.ts', positions, uri: undefined })
    })

    it('passes optional uri param', async () => {
      const positions = [{ line: 1, character: 5 }, { line: 3, character: 10 }]
      await lspApi.selectionRange('test.ts', positions, 'file:///test.ts')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_selection_range', { file: 'test.ts', positions, uri: 'file:///test.ts' })
    })

    it('handles empty positions array', async () => {
      await lspApi.selectionRange('test.ts', [])
      expect(mockInvoke).toHaveBeenCalledWith('lsp_selection_range', { file: 'test.ts', positions: [], uri: undefined })
    })
  })

  // ---------------------------------------------------------------------------
  // semanticTokens
  // ---------------------------------------------------------------------------
  describe('semanticTokens', () => {
    it('calls lsp_semantic_tokens', async () => {
      const tokens = { data: [0, 0, 5, 1, 0] }
      mockInvoke.mockResolvedValueOnce({ tokens })

      const result = await lspApi.semanticTokens('test.ts')

      expect(mockInvoke).toHaveBeenCalledWith('lsp_semantic_tokens', { file: 'test.ts', uri: undefined })
      expect(result.tokens).toEqual(tokens)
    })

    it('passes optional uri param', async () => {
      await lspApi.semanticTokens('test.ts', 'file:///test.ts')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_semantic_tokens', { file: 'test.ts', uri: 'file:///test.ts' })
    })
  })

  // ---------------------------------------------------------------------------
  // semanticTokensRange
  // ---------------------------------------------------------------------------
  describe('semanticTokensRange', () => {
    it('calls lsp_semantic_tokens_range', async () => {
      await lspApi.semanticTokensRange('test.ts', 0, 0, 10, 0)
      expect(mockInvoke).toHaveBeenCalledWith('lsp_semantic_tokens_range', {
        file: 'test.ts', startLine: 0, startCol: 0, endLine: 10, endCol: 0, uri: undefined
      })
    })

    it('passes optional uri param', async () => {
      await lspApi.semanticTokensRange('test.ts', 0, 0, 10, 0, 'file:///test.ts')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_semantic_tokens_range', {
        file: 'test.ts', startLine: 0, startCol: 0, endLine: 10, endCol: 0, uri: 'file:///test.ts'
      })
    })
  })

  // ---------------------------------------------------------------------------
  // semanticTokensLegend
  // ---------------------------------------------------------------------------
  describe('semanticTokensLegend', () => {
    it('calls lsp_semantic_tokens_legend', async () => {
      const legend = { tokenTypes: ['keyword'], tokenModifiers: ['declaration'] }
      mockInvoke.mockResolvedValueOnce({ legend })

      const result = await lspApi.semanticTokensLegend('test.ts')

      expect(mockInvoke).toHaveBeenCalledWith('lsp_semantic_tokens_legend', { file: 'test.ts' })
      expect(result.legend).toEqual(legend)
    })

    it('returns null legend', async () => {
      mockInvoke.mockResolvedValueOnce({ legend: null })
      const result = await lspApi.semanticTokensLegend('test.ts')
      expect(result.legend).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // documentLinks
  // ---------------------------------------------------------------------------
  describe('documentLinks', () => {
    it('calls lsp_document_links', async () => {
      const links = [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } }, target: 'file:///other.ts' }]
      mockInvoke.mockResolvedValueOnce({ links })

      const result = await lspApi.documentLinks('test.ts')

      expect(mockInvoke).toHaveBeenCalledWith('lsp_document_links', { file: 'test.ts', uri: undefined })
      expect(result.links).toEqual(links)
    })

    it('passes optional uri param', async () => {
      await lspApi.documentLinks('test.ts', 'file:///test.ts')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_document_links', { file: 'test.ts', uri: 'file:///test.ts' })
    })

    it('handles links without target', async () => {
      const links = [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } } }]
      mockInvoke.mockResolvedValueOnce({ links })
      const result = await lspApi.documentLinks('test.ts')
      expect(result.links).toEqual(links)
    })
  })

  // ---------------------------------------------------------------------------
  // codeLenses
  // ---------------------------------------------------------------------------
  describe('codeLenses', () => {
    it('calls lsp_code_lenses', async () => {
      const lenses = [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } }]
      mockInvoke.mockResolvedValueOnce({ lenses })

      const result = await lspApi.codeLenses('test.ts')

      expect(mockInvoke).toHaveBeenCalledWith('lsp_code_lenses', { file: 'test.ts', uri: undefined })
      expect(result.lenses).toEqual(lenses)
    })

    it('passes optional uri param', async () => {
      await lspApi.codeLenses('test.ts', 'file:///test.ts')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_code_lenses', { file: 'test.ts', uri: 'file:///test.ts' })
    })

    it('handles code lens with command', async () => {
      const lenses = [{
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
        command: { title: 'Go to Definition', command: 'editor.action.goToDefinition', arguments: [] },
      }]
      mockInvoke.mockResolvedValueOnce({ lenses })
      const result = await lspApi.codeLenses('test.ts')
      expect(result.lenses).toEqual(lenses)
    })
  })

  // ---------------------------------------------------------------------------
  // prepareCallHierarchy
  // ---------------------------------------------------------------------------
  describe('prepareCallHierarchy', () => {
    it('calls lsp_prepare_call_hierarchy', async () => {
      const items = [{ name: 'myFunc', kind: 12, uri: 'file:///test.ts', range: { start: { line: 0, character: 0 }, end: { line: 5, character: 1 } }, selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } } }]
      mockInvoke.mockResolvedValueOnce({ items })

      const result = await lspApi.prepareCallHierarchy('test.ts', 1, 1)

      expect(mockInvoke).toHaveBeenCalledWith('lsp_prepare_call_hierarchy', { file: 'test.ts', line: 1, column: 1, uri: undefined })
      expect(result.items).toEqual(items)
    })

    it('passes optional uri param', async () => {
      await lspApi.prepareCallHierarchy('test.ts', 1, 1, 'file:///test.ts')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_prepare_call_hierarchy', { file: 'test.ts', line: 1, column: 1, uri: 'file:///test.ts' })
    })
  })

  // ---------------------------------------------------------------------------
  // callHierarchyIncomingCalls
  // ---------------------------------------------------------------------------
  describe('callHierarchyIncomingCalls', () => {
    it('calls lsp_call_hierarchy_incoming_calls', async () => {
      const item = { name: 'myFunc', kind: 12, uri: 'file:///test.ts', range: { start: { line: 0, character: 0 }, end: { line: 5, character: 1 } }, selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } } }
      const calls = [{ from: item, fromRanges: [{ start: { line: 2, character: 0 }, end: { line: 2, character: 5 } }] }]
      mockInvoke.mockResolvedValueOnce({ calls })

      const result = await lspApi.callHierarchyIncomingCalls('test.ts', item)

      expect(mockInvoke).toHaveBeenCalledWith('lsp_call_hierarchy_incoming_calls', { file: 'test.ts', item })
      expect(result.calls).toEqual(calls)
    })
  })

  // ---------------------------------------------------------------------------
  // callHierarchyOutgoingCalls
  // ---------------------------------------------------------------------------
  describe('callHierarchyOutgoingCalls', () => {
    it('calls lsp_call_hierarchy_outgoing_calls', async () => {
      const item = { name: 'myFunc', kind: 12, uri: 'file:///test.ts', range: { start: { line: 0, character: 0 }, end: { line: 5, character: 1 } }, selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } } }
      const calls = [{ to: item, fromRanges: [{ start: { line: 1, character: 0 }, end: { line: 1, character: 5 } }] }]
      mockInvoke.mockResolvedValueOnce({ calls })

      const result = await lspApi.callHierarchyOutgoingCalls('test.ts', item)

      expect(mockInvoke).toHaveBeenCalledWith('lsp_call_hierarchy_outgoing_calls', { file: 'test.ts', item })
      expect(result.calls).toEqual(calls)
    })
  })

  // ---------------------------------------------------------------------------
  // prepareTypeHierarchy
  // ---------------------------------------------------------------------------
  describe('prepareTypeHierarchy', () => {
    it('calls lsp_prepare_type_hierarchy', async () => {
      const items = [{ name: 'MyClass', kind: 5, uri: 'file:///test.ts', range: { start: { line: 0, character: 0 }, end: { line: 20, character: 1 } }, selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } } }]
      mockInvoke.mockResolvedValueOnce({ items })

      const result = await lspApi.prepareTypeHierarchy('test.ts', 1, 1)

      expect(mockInvoke).toHaveBeenCalledWith('lsp_prepare_type_hierarchy', { file: 'test.ts', line: 1, column: 1, uri: undefined })
      expect(result.items).toEqual(items)
    })

    it('passes optional uri param', async () => {
      await lspApi.prepareTypeHierarchy('test.ts', 1, 1, 'file:///test.ts')
      expect(mockInvoke).toHaveBeenCalledWith('lsp_prepare_type_hierarchy', { file: 'test.ts', line: 1, column: 1, uri: 'file:///test.ts' })
    })
  })

  // ---------------------------------------------------------------------------
  // typeHierarchySupertypes
  // ---------------------------------------------------------------------------
  describe('typeHierarchySupertypes', () => {
    it('calls lsp_type_hierarchy_supertypes', async () => {
      const item = { name: 'MyClass', kind: 5, uri: 'file:///test.ts', range: { start: { line: 0, character: 0 }, end: { line: 20, character: 1 } }, selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } } }
      const items = [{ name: 'BaseClass', kind: 5, uri: 'file:///base.ts', range: { start: { line: 0, character: 0 }, end: { line: 10, character: 1 } }, selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 9 } } }]
      mockInvoke.mockResolvedValueOnce({ items })

      const result = await lspApi.typeHierarchySupertypes('test.ts', item)

      expect(mockInvoke).toHaveBeenCalledWith('lsp_type_hierarchy_supertypes', { file: 'test.ts', item })
      expect(result.items).toEqual(items)
    })
  })

  // ---------------------------------------------------------------------------
  // typeHierarchySubtypes
  // ---------------------------------------------------------------------------
  describe('typeHierarchySubtypes', () => {
    it('calls lsp_type_hierarchy_subtypes', async () => {
      const item = { name: 'BaseClass', kind: 5, uri: 'file:///base.ts', range: { start: { line: 0, character: 0 }, end: { line: 10, character: 1 } }, selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 9 } } }
      const items = [{ name: 'MyClass', kind: 5, uri: 'file:///test.ts', range: { start: { line: 0, character: 0 }, end: { line: 20, character: 1 } }, selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } } }]
      mockInvoke.mockResolvedValueOnce({ items })

      const result = await lspApi.typeHierarchySubtypes('test.ts', item)

      expect(mockInvoke).toHaveBeenCalledWith('lsp_type_hierarchy_subtypes', { file: 'test.ts', item })
      expect(result.items).toEqual(items)
    })
  })

  // ---------------------------------------------------------------------------
  // error handling
  // ---------------------------------------------------------------------------
  describe('error handling', () => {
    it('propagates invoke errors', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('LSP not available'))

      await expect(lspApi.completion('test.ts', 1, 1)).rejects.toThrow('LSP not available')
    })

    it('propagates invoke errors from hover', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('connection lost'))

      await expect(lspApi.hover('test.ts', 1, 1)).rejects.toThrow('connection lost')
    })

    it('propagates invoke errors from didOpen', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('server error'))

      await expect(lspApi.didOpen('file:///test.ts', 'test.ts', 'ts', '')).rejects.toThrow('server error')
    })
  })

  // ---------------------------------------------------------------------------
  // getClient delegation
  // ---------------------------------------------------------------------------
  describe('getClient delegation', () => {
    it('all methods delegate to getClient().invoke()', async () => {
      // Verify that multiple methods use the same getClient pattern
      const methods = [
        () => lspApi.completion('a.ts', 1, 1),
        () => lspApi.hover('a.ts', 1, 1),
        () => lspApi.definition('a.ts', 1, 1),
        () => lspApi.implementation('a.ts', 1, 1),
        () => lspApi.typeDefinition('a.ts', 1, 1),
        () => lspApi.references('a.ts', 1, 1),
        () => lspApi.didOpen('uri', 'a.ts', 'ts', ''),
        () => lspApi.didChange('a.ts', ''),
        () => lspApi.didClose('a.ts'),
        () => lspApi.didSave('a.ts'),
        () => lspApi.status(),
        () => lspApi.supportsIncrementalSync('a.ts'),
        () => lspApi.diagnostics(),
        () => lspApi.signatureHelp('a.ts', 1, 1),
        () => lspApi.documentSymbols('a.ts'),
        () => lspApi.documentHighlight('a.ts', 1, 1),
        () => lspApi.inlayHints('a.ts', 0, 10),
        () => lspApi.foldingRanges('a.ts'),
        () => lspApi.workspaceSymbols('q'),
        () => lspApi.codeActions('a.ts', 1, 1),
        () => lspApi.rename('a.ts', 1, 1, 'n'),
        () => lspApi.formatting('a.ts'),
        () => lspApi.rangeFormatting('a.ts', 0, 0, 1, 1),
        () => lspApi.onTypeFormatting('a.ts', 1, 1, ';'),
        () => lspApi.selectionRange('a.ts', []),
        () => lspApi.semanticTokens('a.ts'),
        () => lspApi.semanticTokensRange('a.ts', 0, 0, 1, 1),
        () => lspApi.semanticTokensLegend('a.ts'),
        () => lspApi.documentLinks('a.ts'),
        () => lspApi.codeLenses('a.ts'),
        () => lspApi.prepareCallHierarchy('a.ts', 1, 1),
        () => lspApi.prepareTypeHierarchy('a.ts', 1, 1),
      ]

      for (const fn of methods) {
        await fn()
      }

      // Each method should have called invoke exactly once
      expect(mockInvoke).toHaveBeenCalledTimes(methods.length)
    })
  })
})

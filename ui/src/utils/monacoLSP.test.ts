import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock lspApi
const mockCompletion = vi.fn()
const mockHover = vi.fn()
const mockDefinition = vi.fn()
const mockImplementation = vi.fn()
const mockTypeDefinition = vi.fn()
const mockReferences = vi.fn()
const mockSignatureHelp = vi.fn()
const mockCodeActions = vi.fn()
const mockRename = vi.fn()
const mockDocumentHighlight = vi.fn()
const mockDocumentSymbols = vi.fn()
const mockDocumentLinks = vi.fn()
const mockInlayHints = vi.fn()
const mockFoldingRanges = vi.fn()
const mockSelectionRange = vi.fn()
const mockSemanticTokens = vi.fn()
const mockSemanticTokensLegend = vi.fn()
const mockFormatting = vi.fn()
const mockRangeFormatting = vi.fn()
const mockOnTypeFormatting = vi.fn()

vi.mock('../services/lspApi', () => ({
  lspApi: {
    completion: mockCompletion,
    hover: mockHover,
    definition: mockDefinition,
    implementation: mockImplementation,
    typeDefinition: mockTypeDefinition,
    references: mockReferences,
    signatureHelp: mockSignatureHelp,
    codeActions: mockCodeActions,
    rename: mockRename,
    documentHighlight: mockDocumentHighlight,
    documentSymbols: mockDocumentSymbols,
    documentLinks: mockDocumentLinks,
    inlayHints: mockInlayHints,
    foldingRanges: mockFoldingRanges,
    selectionRange: mockSelectionRange,
    semanticTokens: mockSemanticTokens,
    semanticTokensLegend: mockSemanticTokensLegend,
    formatting: mockFormatting,
    rangeFormatting: mockRangeFormatting,
    onTypeFormatting: mockOnTypeFormatting,
  },
}))

vi.mock('../utils/monaco', () => ({
  hasLSPSupport: vi.fn((path: string) => {
    const ext = path.split('.').pop()
    return ['ts', 'tsx', 'js', 'jsx', 'go', 'py', 'rs'].includes(ext || '')
  }),
  convertSelectionRangeChain: vi.fn((ranges: any[]) => ranges),
  parseWorkspaceEdits: vi.fn(() => ({})),
}))

function createMockMonaco() {
  const registeredProviders: any[] = []
  const registeredCommands: Record<string, Function> = {}

  return {
    languages: {
      registerCompletionItemProvider: vi.fn((_s: any, p: any) => { registeredProviders.push({ type: 'completion', provider: p }); return { dispose: vi.fn() } }),
      registerHoverProvider: vi.fn((_s: any, p: any) => { registeredProviders.push({ type: 'hover', provider: p }); return { dispose: vi.fn() } }),
      registerDefinitionProvider: vi.fn((_s: any, p: any) => { registeredProviders.push({ type: 'definition', provider: p }); return { dispose: vi.fn() } }),
      registerImplementationProvider: vi.fn((_s: any, p: any) => { registeredProviders.push({ type: 'implementation', provider: p }); return { dispose: vi.fn() } }),
      registerTypeDefinitionProvider: vi.fn((_s: any, p: any) => { registeredProviders.push({ type: 'typeDefinition', provider: p }); return { dispose: vi.fn() } }),
      registerReferenceProvider: vi.fn((_s: any, p: any) => { registeredProviders.push({ type: 'references', provider: p }); return { dispose: vi.fn() } }),
      registerSignatureHelpProvider: vi.fn((_s: any, p: any) => { registeredProviders.push({ type: 'signatureHelp', provider: p }); return { dispose: vi.fn() } }),
      registerCodeActionProvider: vi.fn((_s: any, p: any) => { registeredProviders.push({ type: 'codeActions', provider: p }); return { dispose: vi.fn() } }),
      registerRenameProvider: vi.fn((_s: any, p: any) => { registeredProviders.push({ type: 'rename', provider: p }); return { dispose: vi.fn() } }),
      registerDocumentHighlightProvider: vi.fn((_s: any, p: any) => { registeredProviders.push({ type: 'documentHighlight', provider: p }); return { dispose: vi.fn() } }),
      registerDocumentSymbolProvider: vi.fn((_s: any, p: any) => { registeredProviders.push({ type: 'documentSymbols', provider: p }); return { dispose: vi.fn() } }),
      registerLinkProvider: vi.fn((_s: any, p: any) => { registeredProviders.push({ type: 'documentLinks', provider: p }); return { dispose: vi.fn() } }),
      registerCodeLensProvider: vi.fn((_s: any, p: any) => { registeredProviders.push({ type: 'codeLens', provider: p }); return { dispose: vi.fn() } }),
      registerInlayHintsProvider: vi.fn((_s: any, p: any) => { registeredProviders.push({ type: 'inlayHints', provider: p }); return { dispose: vi.fn() } }),
      registerFoldingRangeProvider: vi.fn((_s: any, p: any) => { registeredProviders.push({ type: 'foldingRanges', provider: p }); return { dispose: vi.fn() } }),
      registerSelectionRangeProvider: vi.fn((_s: any, p: any) => { registeredProviders.push({ type: 'selectionRange', provider: p }); return { dispose: vi.fn() } }),
      registerDocumentSemanticTokensProvider: vi.fn((_s: any, p: any) => { registeredProviders.push({ type: 'semanticTokens', provider: p }); return { dispose: vi.fn() } }),
      registerDocumentRangeSemanticTokensProvider: vi.fn((_s: any, p: any) => { registeredProviders.push({ type: 'semanticTokensRange', provider: p }); return { dispose: vi.fn() } }),
      registerDocumentFormattingEditProvider: vi.fn((_s: any, p: any) => { registeredProviders.push({ type: 'formatting', provider: p }); return { dispose: vi.fn() } }),
      registerDocumentRangeFormattingEditProvider: vi.fn((_s: any, p: any) => { registeredProviders.push({ type: 'rangeFormatting', provider: p }); return { dispose: vi.fn() } }),
      registerOnTypeFormattingEditProvider: vi.fn((_s: any, p: any) => { registeredProviders.push({ type: 'onTypeFormatting', provider: p }); return { dispose: vi.fn() } }),
      CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
      SymbolKind: { Function: 12, Class: 5, Variable: 13, Interface: 11, Method: 6, Property: 7 },
    },
    editor: {
      registerCommand: vi.fn((id: string, handler: Function) => { registeredCommands[id] = handler; return { dispose: vi.fn() } }),
    },
    Uri: {
      parse: vi.fn((uri: string) => ({ toString: () => uri, path: new URL(uri).pathname })),
    },
    Range: vi.fn(function(this: any, sl: number, sc: number, el: number, ec: number) { this.startLineNumber = sl; this.startColumn = sc; this.endLineNumber = el; this.endColumn = ec }),
    _registeredProviders: registeredProviders,
    _registeredCommands: registeredCommands,
  }
}

function createMockModel(uri = 'file:///project/src/test.ts') {
  return { uri: { toString: () => uri, path: new URL(uri).pathname } }
}

function createMockPosition(line: number, column: number) {
  return { lineNumber: line, column }
}

describe('monacoLSP', () => {
  let monaco: ReturnType<typeof createMockMonaco>
  let disposables: any[]
  let refs: any

  beforeEach(() => {
    vi.clearAllMocks()
    monaco = createMockMonaco()
    disposables = []
    refs = {
      inlayHintsRef: { current: true },
      lspInitiatedEditRef: { current: false },
      lspOpenFileRef: { current: null },
      lspPendingChangesRef: { current: [] },
    }
  })

  async function loadAndRegister() {
    const mod = await import('./monacoLSP')
    const editor = {
      onDidChangeModelContent: vi.fn(() => ({ dispose: vi.fn() })),
      onDidChangeCursorPosition: vi.fn(() => ({ dispose: vi.fn() })),
      onDidChangeModel: vi.fn(() => ({ dispose: vi.fn() })),
    }
    mod.registerLSPProviders(monaco as any, editor as any, disposables, refs)
  }

  function getProvider(type: string) {
    return monaco._registeredProviders.find((p: any) => p.type === type)?.provider
  }

  describe('registration', () => {
    it('registers all providers', async () => {
      await loadAndRegister()
      expect(monaco._registeredProviders.length).toBeGreaterThan(10)
    })
  })

  describe('completion provider', () => {
    it('returns suggestions from LSP', async () => {
      mockCompletion.mockResolvedValueOnce({ items: [{ label: 'foo', kind: 2, insertText: 'foo()' }] })
      await loadAndRegister()
      const result = await getProvider('completion').provideCompletionItems(createMockModel(), createMockPosition(1, 1), {}, { isCancellationRequested: false })
      expect(result.suggestions).toHaveLength(1)
      expect(result.suggestions[0].label).toBe('foo')
    })

    it('returns empty for unsupported files', async () => {
      await loadAndRegister()
      const result = await getProvider('completion').provideCompletionItems(createMockModel('file:///test.txt'), createMockPosition(1, 1), {}, {})
      expect(result.suggestions).toEqual([])
    })

    it('returns empty on cancellation', async () => {
      mockCompletion.mockResolvedValueOnce({ items: [{ label: 'foo' }] })
      await loadAndRegister()
      const result = await getProvider('completion').provideCompletionItems(createMockModel(), createMockPosition(1, 1), {}, { isCancellationRequested: true })
      expect(result.suggestions).toEqual([])
    })

    it('returns empty on error', async () => {
      mockCompletion.mockRejectedValueOnce(new Error('fail'))
      await loadAndRegister()
      const result = await getProvider('completion').provideCompletionItems(createMockModel(), createMockPosition(1, 1), {}, {})
      expect(result.suggestions).toEqual([])
    })

    it('handles snippet insertTextFormat', async () => {
      mockCompletion.mockResolvedValueOnce({ items: [{ label: 'fn', insertText: 'fn(${1:arg})', insertTextFormat: 2 }] })
      await loadAndRegister()
      const result = await getProvider('completion').provideCompletionItems(createMockModel(), createMockPosition(1, 1), {}, {})
      expect(result.suggestions[0].insertTextRules).toBe(4)
    })
  })

  describe('hover provider', () => {
    it('returns hover contents', async () => {
      mockHover.mockResolvedValueOnce({ contents: { value: 'type info' } })
      await loadAndRegister()
      const result = await getProvider('hover').provideHover(createMockModel(), createMockPosition(1, 1), {})
      expect(result.contents).toBeDefined()
    })

    it('handles string contents', async () => {
      mockHover.mockResolvedValueOnce({ contents: 'string content' })
      await loadAndRegister()
      const result = await getProvider('hover').provideHover(createMockModel(), createMockPosition(1, 1), {})
      expect(result.contents[0].value).toBe('string content')
    })

    it('returns null for unsupported files', async () => {
      await loadAndRegister()
      const result = await getProvider('hover').provideHover(createMockModel('file:///test.txt'), createMockPosition(1, 1), {})
      expect(result).toBeNull()
    })

    it('returns null when no result', async () => {
      mockHover.mockResolvedValueOnce(null)
      await loadAndRegister()
      const result = await getProvider('hover').provideHover(createMockModel(), createMockPosition(1, 1), {})
      expect(result).toBeNull()
    })
  })

  describe('definition provider', () => {
    it('returns locations', async () => {
      mockDefinition.mockResolvedValueOnce({ locations: [{ uri: 'file:///project/src/other.ts', range: { start: { line: 5, character: 10 }, end: { line: 5, character: 15 } } }] })
      await loadAndRegister()
      const result = await getProvider('definition').provideDefinition(createMockModel(), createMockPosition(1, 1), {})
      expect(result).toHaveLength(1)
      expect(monaco.Uri.parse).toHaveBeenCalledWith('file:///project/src/other.ts')
    })

    it('returns null for no results', async () => {
      mockDefinition.mockResolvedValueOnce({ locations: [] })
      await loadAndRegister()
      const result = await getProvider('definition').provideDefinition(createMockModel(), createMockPosition(1, 1), {})
      expect(result).toBeNull()
    })
  })

  describe('implementation provider', () => {
    it('returns locations', async () => {
      mockImplementation.mockResolvedValueOnce({ locations: [{ uri: 'file:///project/src/impl.ts', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } }] })
      await loadAndRegister()
      const result = await getProvider('implementation').provideImplementation(createMockModel(), createMockPosition(1, 1), {})
      expect(result).toHaveLength(1)
    })
  })

  describe('typeDefinition provider', () => {
    it('returns locations', async () => {
      mockTypeDefinition.mockResolvedValueOnce({ locations: [{ uri: 'file:///project/src/type.ts', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } }] })
      await loadAndRegister()
      const result = await getProvider('typeDefinition').provideTypeDefinition(createMockModel(), createMockPosition(1, 1), {})
      expect(result).toHaveLength(1)
    })
  })

  describe('references provider', () => {
    it('returns locations', async () => {
      mockReferences.mockResolvedValueOnce({ locations: [{ uri: 'file:///project/src/ref.ts', range: { start: { line: 10, character: 0 }, end: { line: 10, character: 5 } } }] })
      await loadAndRegister()
      const result = await getProvider('references').provideReferences(createMockModel(), createMockPosition(1, 1), {}, {})
      expect(result).toHaveLength(1)
    })
  })

  describe('signatureHelp provider', () => {
    it('returns signatures', async () => {
      mockSignatureHelp.mockResolvedValueOnce({ signatures: [{ label: 'fn(a: string)', parameters: [{ label: 'a: string' }] }], activeSignature: 0, activeParameter: 0 })
      await loadAndRegister()
      const result = await getProvider('signatureHelp').provideSignatureHelp(createMockModel(), createMockPosition(1, 1), {})
      expect(result.value.signatures).toHaveLength(1)
    })
  })

  describe('codeActions provider', () => {
    it('returns actions', async () => {
      mockCodeActions.mockResolvedValueOnce({ actions: [{ title: 'Fix import', kind: 'quickfix', isPreferred: true }] })
      await loadAndRegister()
      const result = await getProvider('codeActions').provideCodeActions(createMockModel(), { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 }, {})
      expect(result.actions).toHaveLength(1)
      expect(result.actions[0].title).toBe('Fix import')
    })

    it('routes edits through guarded command', async () => {
      mockCodeActions.mockResolvedValueOnce({ actions: [{ title: 'Fix', edit: { changes: [{ uri: 'file:///test.ts', edits: [] }] } }] })
      await loadAndRegister()
      const result = await getProvider('codeActions').provideCodeActions(createMockModel(), { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 }, {})
      expect(result.actions[0].command.id).toBe('swarm.applyCodeAction')
    })
  })

  describe('rename provider', () => {
    it('returns edits', async () => {
      mockRename.mockResolvedValueOnce({ edit: { changes: [{ uri: 'file:///project/src/test.ts', edits: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }, newText: 'newName' }] }] } })
      await loadAndRegister()
      const result = await getProvider('rename').provideRenameEdits(createMockModel(), createMockPosition(1, 1), 'newName', {})
      expect(result).toBeDefined()
    })
  })

  describe('documentHighlight provider', () => {
    it('returns highlights', async () => {
      mockDocumentHighlight.mockResolvedValueOnce({ highlights: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, kind: 1 }] })
      await loadAndRegister()
      const result = await getProvider('documentHighlight').provideDocumentHighlights(createMockModel(), createMockPosition(1, 1), {})
      expect(result).toHaveLength(1)
    })
  })

  describe('documentSymbols provider', () => {
    it('returns symbols', async () => {
      mockDocumentSymbols.mockResolvedValueOnce({ symbols: [{ name: 'myFunction', kind: 12, detail: 'function', range: { start: { line: 0, character: 0 }, end: { line: 10, character: 1 } }, selectionRange: { start: { line: 0, character: 9 }, end: { line: 0, character: 19 } }, children: [] }] })
      await loadAndRegister()
      const result = await getProvider('documentSymbols').provideDocumentSymbols(createMockModel(), {})
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('myFunction')
    })

    it('handles nested symbols', async () => {
      mockDocumentSymbols.mockResolvedValueOnce({ symbols: [{ name: 'MyClass', kind: 5, range: { start: { line: 0, character: 0 }, end: { line: 20, character: 1 } }, selectionRange: { start: { line: 0, character: 6 }, end: { line: 0, character: 13 } }, children: [{ name: 'method', kind: 6, range: { start: { line: 5, character: 2 }, end: { line: 8, character: 3 } }, selectionRange: { start: { line: 5, character: 2 }, end: { line: 5, character: 8 } }, children: [] }] }] })
      await loadAndRegister()
      const result = await getProvider('documentSymbols').provideDocumentSymbols(createMockModel(), {})
      expect(result[0].children).toHaveLength(1)
    })
  })

  describe('error handling', () => {
    it('all providers handle errors gracefully', async () => {
      mockCompletion.mockRejectedValueOnce(new Error('fail'))
      mockHover.mockRejectedValueOnce(new Error('fail'))
      mockDefinition.mockRejectedValueOnce(new Error('fail'))
      mockImplementation.mockRejectedValueOnce(new Error('fail'))
      mockTypeDefinition.mockRejectedValueOnce(new Error('fail'))
      mockReferences.mockRejectedValueOnce(new Error('fail'))
      mockDocumentHighlight.mockRejectedValueOnce(new Error('fail'))
      mockDocumentSymbols.mockRejectedValueOnce(new Error('fail'))

      await loadAndRegister()
      const model = createMockModel()
      const pos = createMockPosition(1, 1)

      expect(await getProvider('completion').provideCompletionItems(model, pos, {}, {})).toEqual({ suggestions: [] })
      expect(await getProvider('hover').provideHover(model, pos, {})).toBeNull()
      expect(await getProvider('definition').provideDefinition(model, pos, {})).toBeNull()
      expect(await getProvider('implementation').provideImplementation(model, pos, {})).toBeNull()
      expect(await getProvider('typeDefinition').provideTypeDefinition(model, pos, {})).toBeNull()
      expect(await getProvider('references').provideReferences(model, pos, {}, {})).toBeNull()
      expect(await getProvider('documentHighlight').provideDocumentHighlights(model, pos, {})).toBeNull()
      expect(await getProvider('documentSymbols').provideDocumentSymbols(model, {})).toBeNull()
    })
  })
})

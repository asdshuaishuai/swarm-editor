import { lspApi } from '../services/lspApi'
import { hasLSPSupport, convertSelectionRangeChain, parseWorkspaceEdits } from '../utils/monaco'
import { logger } from '.'

// Module-level refs set by registerLSPProviders, used by semantic token registration
let _monaco: any = null
let _disposables: any[] = []

// Register LSP semantic tokens provider (LSP-driven syntax highlighting — Cursor/Windsurf pattern)
// Monaco requires per-language providers because each LSP server has a different legend.
// We lazily register providers when a file of that language is first opened.

// Default legend (gopls) used before LSP server provides its legend
const defaultLegend = {
  tokenTypes: [
    'namespace', 'type', 'typeParameter', 'parameter', 'variable',
    'function', 'method', 'macro', 'keyword', 'comment',
    'string', 'number', 'operator', 'label',
  ],
  tokenModifiers: [
    'definition', 'readonly', 'defaultLibrary',
    'array', 'bool', 'chan', 'format', 'interface',
    'map', 'number', 'pointer', 'signature', 'slice', 'string', 'struct',
  ],
}

// Track which languages have providers registered
const registeredLanguages = new Set<string>()

// Register semantic tokens provider for a specific language with its legend
const registerSemanticTokensProvider = (languageId: string, legend: { tokenTypes: string[]; tokenModifiers: string[] }) => {
  if (registeredLanguages.has(languageId) || !_monaco) return
  registeredLanguages.add(languageId)

  // Register full document provider
  _disposables.push(_monaco.languages.registerDocumentSemanticTokensProvider(languageId, {
    displayName: `LSP-${languageId}`,
    getLegend: () => legend,
    provideDocumentSemanticTokens: async (model: any, _lastResultId: string | null, token: any) => {
      const filePath = model.uri.path.replace(/^\//, '')
      if (!hasLSPSupport(filePath)) return null
      try {
        const result = await lspApi.semanticTokens(filePath)
        if (token?.isCancellationRequested) return null
        if (!result?.tokens?.data) return null

        return {
          resultId: result.tokens.resultId,
          data: new Uint32Array(result.tokens.data),
        }
      } catch (e) { logger.debug('LSP', 'provider error', e);
        return null
      }
    },
    releaseDocumentSemanticTokens: () => {},
  }))

  // Register range provider
  _disposables.push(_monaco.languages.registerDocumentRangeSemanticTokensProvider(languageId, {
    displayName: `LSP-${languageId}`,
    getLegend: () => legend,
    provideDocumentRangeSemanticTokens: async (model: any, range: any, token: any) => {
      const filePath = model.uri.path.replace(/^\//, '')
      if (!hasLSPSupport(filePath)) return null
      try {
        const result = await lspApi.semanticTokensRange(
          filePath,
          range.startLineNumber - 1,
          range.startColumn - 1,
          range.endLineNumber - 1,
          range.endColumn - 1,
        )
        if (token?.isCancellationRequested) return null
        if (!result?.tokens?.data) return null

        return {
          resultId: result.tokens.resultId,
          data: new Uint32Array(result.tokens.data),
        }
      } catch (e) { logger.debug('LSP', 'provider error', e);
        return null
      }
    },
  }))
}

// Lazy registration: fetch legend from LSP server when a file of that language is first opened.
// Falls back to defaultLegend (gopls) if the server doesn't provide one.
export const ensureSemanticTokensProvider = async (languageId: string, filePath: string) => {
  if (registeredLanguages.has(languageId)) return
  try {
    const result = await lspApi.semanticTokensLegend(filePath)
    const legend = result?.legend
    if (legend?.tokenTypes?.length) {
      registerSemanticTokensProvider(languageId, legend)
      return
    }
  } catch { /* fall through to default */ }
  registerSemanticTokensProvider(languageId, defaultLegend)
}

export function registerLSPProviders(
  monaco: any,
  editor: any,
  disposables: any[],
  refs: {
    inlayHintsRef: React.MutableRefObject<boolean>
    lspInitiatedEditRef: React.MutableRefObject<boolean>
    lspOpenFileRef: React.MutableRefObject<string | null>
    lspPendingChangesRef: React.MutableRefObject<any[]>
  },
) {
  const { inlayHintsRef, lspInitiatedEditRef, lspOpenFileRef, lspPendingChangesRef } = refs
  _monaco = monaco
  _disposables = disposables

disposables.push(monaco.languages.registerCompletionItemProvider('*', {
  triggerCharacters: ['.', '(', '"', "'", '/', '@', '<', ' '],
  provideCompletionItems: async (model: any, position: any, _context: any, token: any) => {
    const filePath = model.uri.path.replace(/^\//, '')
    if (!hasLSPSupport(filePath)) return { suggestions: [] }
    try {
      const result = await lspApi.completion(filePath, position.lineNumber - 1, position.column - 1)
      if (token?.isCancellationRequested) return { suggestions: [] }
      return {
        suggestions: (result.items || []).map((item: any, i: number) => {
          const suggestion: any = {
            label: item.label || '',
            kind: item.kind ?? 1,
            detail: item.detail,
            documentation: item.documentation,
            insertText: item.insertText || item.label || '',
            sortText: String(i).padStart(6, '0'),
          }
          // LSP snippet support (insertTextFormat: 2 = snippet with tab stops)
          if (item.insertTextFormat === 2) {
            suggestion.insertTextRules = 4 // monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
          }
          // Use LSP-provided range for precise text replacement
          if (item.range) {
            suggestion.range = new monaco.Range(
              item.range.start.line + 1, item.range.start.character + 1,
              item.range.end.line + 1, item.range.end.character + 1,
            )
          }
          // Allow fuzzy-matched items to pass Monaco's filter
          if (item.filterText) {
            suggestion.filterText = item.filterText
          }
          return suggestion
        }),
      }
    } catch (e) { logger.debug('LSP', 'provider error', e);
      return { suggestions: [] }
    }
  },
}))

// Register LSP hover provider
disposables.push(monaco.languages.registerHoverProvider('*', {
  provideHover: async (model: any, position: any, token: any) => {
    const filePath = model.uri.path.replace(/^\//, '')
    if (!hasLSPSupport(filePath)) return null
    try {
      const result = await lspApi.hover(filePath, position.lineNumber - 1, position.column - 1)
      if (token?.isCancellationRequested) return null
      if (!result || !result.contents) return null
      const contents = typeof result.contents === 'string'
        ? [{ value: result.contents }]
        : Array.isArray(result.contents)
          ? result.contents.map((c: any) => typeof c === 'string' ? { value: c } : c)
          : [{ value: String(result.contents) }]
      return { contents }
    } catch (e) { logger.debug('LSP', 'provider error', e);
      return null
    }
  },
}))

// Register LSP definition provider
disposables.push(monaco.languages.registerDefinitionProvider('*', {
  provideDefinition: async (model: any, position: any, token: any) => {
    const filePath = model.uri.path.replace(/^\//, '')
    if (!hasLSPSupport(filePath)) return null
    try {
      const result = await lspApi.definition(filePath, position.lineNumber - 1, position.column - 1)
      if (token?.isCancellationRequested) return null
      if (!result?.locations?.length) return null
      return result.locations.map((loc: any) => ({
        uri: monaco.Uri.parse(loc.uri),
        range: new monaco.Range(
          loc.range.start.line + 1, loc.range.start.character + 1,
          loc.range.end.line + 1, loc.range.end.character + 1,
        ),
      }))
    } catch (e) { logger.debug('LSP', 'provider error', e);
      return null
    }
  },
}))

// Register LSP implementation provider (go to impl — Cursor/Windsurf pattern)
disposables.push(monaco.languages.registerImplementationProvider('*', {
  provideImplementation: async (model: any, position: any, token: any) => {
    const filePath = model.uri.path.replace(/^\//, '')
    if (!hasLSPSupport(filePath)) return null
    try {
      const result = await lspApi.implementation(filePath, position.lineNumber - 1, position.column - 1)
      if (token?.isCancellationRequested) return null
      if (!result?.locations?.length) return null
      return result.locations.map((loc: any) => ({
        uri: monaco.Uri.parse(loc.uri),
        range: new monaco.Range(
          loc.range.start.line + 1, loc.range.start.character + 1,
          loc.range.end.line + 1, loc.range.end.character + 1,
        ),
      }))
    } catch (e) { logger.debug('LSP', 'provider error', e);
      return null
    }
  },
}))

// Register LSP type definition provider (go to type — Cursor/Windsurf pattern)
disposables.push(monaco.languages.registerTypeDefinitionProvider('*', {
  provideTypeDefinition: async (model: any, position: any, token: any) => {
    const filePath = model.uri.path.replace(/^\//, '')
    if (!hasLSPSupport(filePath)) return null
    try {
      const result = await lspApi.typeDefinition(filePath, position.lineNumber - 1, position.column - 1)
      if (token?.isCancellationRequested) return null
      if (!result?.locations?.length) return null
      return result.locations.map((loc: any) => ({
        uri: monaco.Uri.parse(loc.uri),
        range: new monaco.Range(
          loc.range.start.line + 1, loc.range.start.character + 1,
          loc.range.end.line + 1, loc.range.end.character + 1,
        ),
      }))
    } catch (e) { logger.debug('LSP', 'provider error', e);
      return null
    }
  },
}))

// Register LSP references provider
disposables.push(monaco.languages.registerReferenceProvider('*', {
  provideReferences: async (model: any, position: any, _context: any, token: any) => {
    const filePath = model.uri.path.replace(/^\//, '')
    if (!hasLSPSupport(filePath)) return null
    try {
      const result = await lspApi.references(filePath, position.lineNumber - 1, position.column - 1)
      if (token?.isCancellationRequested) return null
      if (!result?.locations?.length) return null
      return result.locations.map((loc: any) => ({
        uri: monaco.Uri.parse(loc.uri),
        range: new monaco.Range(
          loc.range.start.line + 1, loc.range.start.character + 1,
          loc.range.end.line + 1, loc.range.end.character + 1,
        ),
      }))
    } catch (e) { logger.debug('LSP', 'provider error', e);
      return null
    }
  },
}))

// Register LSP signature help provider
disposables.push(monaco.languages.registerSignatureHelpProvider('*', {
  signatureHelpTriggerCharacters: ['(', ','],
  signatureHelpRetriggerCharacters: [','],
  provideSignatureHelp: async (model: any, position: any, token: any) => {
    const filePath = model.uri.path.replace(/^\//, '')
    if (!hasLSPSupport(filePath)) return null
    try {
      const result = await lspApi.signatureHelp(filePath, position.lineNumber - 1, position.column - 1)
      if (token?.isCancellationRequested) return null
      if (!result?.signatures?.length) return null
      return {
        value: {
          signatures: result.signatures.map((sig: any) => ({
            label: sig.label,
            documentation: sig.documentation
              ? (typeof sig.documentation === 'string' ? { value: sig.documentation } : sig.documentation)
              : undefined,
            parameters: sig.parameters?.map((param: any) => ({
              label: param.label,
              documentation: param.documentation
                ? (typeof param.documentation === 'string' ? { value: param.documentation } : param.documentation)
                : undefined,
            })),
          })),
          activeSignature: result.activeSignature ?? 0,
          activeParameter: result.activeParameter ?? 0,
        },
        dispose() {},
      }
    } catch (e) { logger.debug('LSP', 'provider error', e);
      return null
    }
  },
}))

// Register command for code action edit application (guards against stale incremental changes)
disposables.push(monaco.editor.registerCommand('swarm.applyCodeAction', (_accessor: any, workspaceEdit: any) => {
  if (!editor || !monaco) return
  lspInitiatedEditRef.current = true
  try {
    const m = monaco as any
    if (!workspaceEdit?.changes) return
    for (const change of workspaceEdit.changes) {
      if (!change.uri || !change.edits) continue
      const targetModel = m.editor.getModel(m.Uri.parse(change.uri))
      if (targetModel) {
        const edits = change.edits.map((e: any) => ({
          range: new m.Range(
            e.range.start.line + 1, e.range.start.character + 1,
            e.range.end.line + 1, e.range.end.character + 1,
          ),
          text: e.newText,
        }))
        targetModel.pushEditOperations([], edits, () => [])
      }
    }
  } finally {
    lspInitiatedEditRef.current = false
  }
}))

// Register LSP code actions provider (lightbulb quick fixes — Cursor/Windsurf pattern)
disposables.push(monaco.languages.registerCodeActionProvider('*', {
  provideCodeActions: async (model: any, range: any, token: any) => {
    const filePath = model.uri.path.replace(/^\//, '')
    if (!hasLSPSupport(filePath)) return { actions: [] } as any
    try {
      const result = await lspApi.codeActions(filePath, range.startLineNumber - 1, range.startColumn - 1)
      if (token?.isCancellationRequested) return { actions: [] } as any
      const actions = (result.actions || []).map((action: any) => {
        // Route edits through guarded command to prevent stale incremental changes
        if (action.edit && action.edit.changes && action.edit.changes.length > 0) {
          return {
            title: action.title || '',
            kind: action.kind,
            command: { id: 'swarm.applyCodeAction', arguments: [action.edit] },
            diagnostics: action.diagnostics,
            isPreferred: action.isPreferred,
          }
        }
        return {
          title: action.title || '',
          kind: action.kind,
          edit: action.edit,
          command: action.command,
          diagnostics: action.diagnostics,
          isPreferred: action.isPreferred,
        }
      })
      return { actions } as any
    } catch (e) { logger.debug('LSP', 'provider error', e);
      return { actions: [] } as any
    }
  },
}))

// Register LSP rename provider (F2 rename — Cursor/Windsurf pattern)
disposables.push(monaco.languages.registerRenameProvider('*', {
  provideRenameEdits: async (model: any, position: any, newName: string, token: any) => {
    const filePath = model.uri.path.replace(/^\//, '')
    if (!hasLSPSupport(filePath)) return null
    try {
      const result = await lspApi.rename(filePath, position.lineNumber - 1, position.column - 1, newName)
      if (token?.isCancellationRequested) return null
      const edit = result.edit
      if (!edit || !edit.changes || edit.changes.length === 0) return null
      // Convert WorkspaceEdit to Monaco rename edits
      const edits: Record<string, any[]> = {}
      for (const change of edit.changes) {
        const uri = monaco.Uri.parse(change.uri)
        edits[uri.toString()] = (change.edits || []).map((e: any) => ({
          range: new monaco.Range(
            e.range.start.line + 1,
            e.range.start.character + 1,
            e.range.end.line + 1,
            e.range.end.character + 1,
          ),
          text: e.newText,
        }))
      }
      // Flag prevents onDidChangeModelContent from accumulating rename edits
      // as stale incremental changes (prevents LSP server state corruption)
      lspInitiatedEditRef.current = true
      setTimeout(() => { lspInitiatedEditRef.current = false }, 0)
      return edits
    } catch (e) { logger.debug('LSP', 'provider error', e);
      return null
    }
  },
}))

// Register LSP document highlight provider (symbol occurrence highlighting — Cursor/Windsurf pattern)
disposables.push(monaco.languages.registerDocumentHighlightProvider('*', {
  provideDocumentHighlights: async (model: any, position: any, token: any) => {
    const filePath = model.uri.path.replace(/^\//, '')
    if (!hasLSPSupport(filePath)) return null
    try {
      const result = await lspApi.documentHighlight(filePath, position.lineNumber - 1, position.column - 1)
      if (token?.isCancellationRequested) return null
      if (!result?.highlights?.length) return null
      return result.highlights.map((h: any) => ({
        range: new monaco.Range(
          h.range.start.line + 1, h.range.start.character + 1,
          h.range.end.line + 1, h.range.end.character + 1,
        ),
        kind: h.kind ?? 1,
      }))
    } catch (e) { logger.debug('LSP', 'provider error', e);
      return null
    }
  },
}))

// Register LSP document symbol provider (outline view, breadcrumb navigation — Cursor/Windsurf pattern)
// Provides symbols for the file outline (functions, classes, variables, etc.)
disposables.push(monaco.languages.registerDocumentSymbolProvider('*', {
  displayName: 'LSP',
  provideDocumentSymbols: async (model: any, token: any) => {
    const filePath = model.uri.path.replace(/^\//, '')
    if (!hasLSPSupport(filePath)) return null
    try {
      const result = await lspApi.documentSymbols(filePath)
      if (token?.isCancellationRequested) return null
      if (!result?.symbols?.length) return null

      // Convert LSP DocumentSymbol[] to Monaco DocumentSymbol[]
      const convertSymbol = (sym: any): any => {
        const range = new monaco.Range(
          sym.range.start.line + 1, sym.range.start.character + 1,
          sym.range.end.line + 1, sym.range.end.character + 1,
        )
        const selectionRange = sym.selectionRange
          ? new monaco.Range(
              sym.selectionRange.start.line + 1, sym.selectionRange.start.character + 1,
              sym.selectionRange.end.line + 1, sym.selectionRange.end.character + 1,
            )
          : range

        return {
          name: sym.name,
          detail: sym.detail || '',
          kind: sym.kind || 1, // Monaco SymbolKind
          tags: sym.tags || [],
          range,
          selectionRange,
          children: sym.children?.map(convertSymbol) || [],
        }
      }

      return result.symbols.map(convertSymbol)
    } catch (e) { logger.debug('LSP', 'provider error', e);
      return null
    }
  },
}))

// Register LSP link provider (clickable URLs, package imports — Cursor/Windsurf pattern)
// Enables Ctrl+click on URLs in comments and package import paths
disposables.push(monaco.languages.registerLinkProvider('*', {
  provideLinks: async (model: any, token: any) => {
    const filePath = model.uri.path.replace(/^\//, '')
    if (!hasLSPSupport(filePath)) return null
    try {
      const result = await lspApi.documentLinks(filePath)
      if (token?.isCancellationRequested) return null
      if (!result?.links?.length) return null

      const links = result.links.map((link: any) => ({
        range: new monaco.Range(
          link.range.start.line + 1, link.range.start.character + 1,
          link.range.end.line + 1, link.range.end.character + 1,
        ),
        url: link.target || undefined,
        tooltip: link.tooltip || undefined,
      }))
      return { links }
    } catch (e) { logger.debug('LSP', 'provider error', e);
      return null
    }
  },
}))

// Register LSP code lens provider (inline actionable indicators — Cursor/Windsurf pattern)
// Shows "N references", "Run test", etc. inline in the editor
disposables.push(monaco.languages.registerCodeLensProvider('*', {
  provideCodeLenses: async (model: any, token: any) => {
    const filePath = model.uri.path.replace(/^\//, '')
    if (!hasLSPSupport(filePath)) return { lenses: [] }
    try {
      const result = await lspApi.codeLenses(filePath)
      if (token?.isCancellationRequested) return { lenses: [] }
      if (!result?.lenses?.length) return { lenses: [] }

      const lenses = result.lenses.map((lens: any) => ({
        range: new monaco.Range(
          lens.range.start.line + 1, lens.range.start.character + 1,
          lens.range.end.line + 1, lens.range.end.character + 1,
        ),
        command: lens.command ? {
          id: lens.command.command,
          title: lens.command.title,
          arguments: lens.command.arguments,
        } : undefined,
      }))
      return { lenses, dispose: () => {} }
    } catch (e) { logger.debug('LSP', 'provider error', e);
      return { lenses: [] }
    }
  },
  resolveCodeLens: async (_model: any, codeLens: any, _token: any) => {
    // Resolve code lens if needed (some LSP servers return unresolved lenses)
    return codeLens
  },
}))

// Register LSP inlay hints provider (type annotations, parameter names — Cursor/Windsurf pattern)
disposables.push(monaco.languages.registerInlayHintsProvider('*', {
  provideInlayHints: async (model: any, range: any, token: any) => {
    // R5169: Respect inlayHints setting — read from ref to avoid stale closure
    if (!inlayHintsRef.current) return { hints: [] }
    const filePath = model.uri.path.replace(/^\//, '')
    if (!hasLSPSupport(filePath)) return { hints: [] }
    try {
      const result = await lspApi.inlayHints(
        filePath,
        range.startLineNumber - 1,
        range.endLineNumber - 1,
      )
      if (token?.isCancellationRequested) return { hints: [] }
      const hints = (result.hints || []).map((h: any) => ({
        position: new (monaco as any).Position(h.position.line + 1, h.position.character + 1),
        label: h.label,
        kind: h.kind === 2 ? 2 /* InlayHintKind.Parameter */ : 1 /* InlayHintKind.Type */,
        tooltip: h.tooltip || undefined,
        paddingLeft: h.paddingLeft || false,
        paddingRight: h.paddingRight || false,
      }))
      return { hints, dispose: () => {} }
    } catch (e) { logger.debug('LSP', 'provider error', e);
      return { hints: [] }
    }
  },
}))

// Register LSP folding range provider (code folding — Cursor/Windsurf pattern)
disposables.push(monaco.languages.registerFoldingRangeProvider('*', {
  provideFoldingRanges: async (model: any, _context: any, token: any) => {
    const filePath = model.uri.path.replace(/^\//, '')
    if (!hasLSPSupport(filePath)) return []
    try {
      const result = await lspApi.foldingRanges(filePath)
      if (token?.isCancellationRequested) return []
      const ranges = (result.ranges || []).map((r: any) => ({
        start: r.startLine + 1,
        end: r.endLine + 1,
        kind: r.kind === 1 ? 1 /* FoldingRangeKind.Comment */
             : r.kind === 2 ? 2 /* FoldingRangeKind.Imports */
             : r.kind === 3 ? 3 /* FoldingRangeKind.Region */
             : undefined,
      }))
      return ranges
    } catch (e) { logger.debug('LSP', 'provider error', e);
      return []
    }
  },
}))

// Note: Workspace symbols requires a QuickPick-style UI component, not a Monaco provider.
// The lspApi.workspaceSymbols() is available for future UI implementation (Ctrl+T search).

// Register LSP selection range provider (expand selection — Cursor/Windsurf pattern)
// Supports Ctrl+Shift+→ to intelligently expand selection: word → expression → statement → function
disposables.push(monaco.languages.registerSelectionRangeProvider('*', {
  provideSelectionRanges: async (model: any, positions: any[], token: any) => {
    const filePath = model.uri.path.replace(/^\//, '')
    if (!hasLSPSupport(filePath)) return []
    try {
      const lspPositions = positions.map((p: any) => ({
        line: p.lineNumber - 1,
        character: p.column - 1,
      }))
      const result = await lspApi.selectionRange(filePath, lspPositions)
      if (token?.isCancellationRequested) return []
      if (!result?.ranges?.length) return []

      // Convert LSP SelectionRange tree to Monaco SelectionRange[][]
      // LSP returns one SelectionRange per position, each with parent chain
      // Monaco expects SelectionRange[][] — outer array per position, inner array is expand chain
      const chains: any[][] = result.ranges.map((sr: any) => convertSelectionRangeChain(sr, monaco))
      return chains
    } catch (e) { logger.debug('LSP', 'provider error', e);
      return []
    }
  },
}))

// Register LSP range formatting provider (format selection — Cursor/Windsurf pattern)
disposables.push(monaco.languages.registerDocumentRangeFormattingEditProvider('*', {
  displayName: 'LSP',
  provideDocumentRangeFormattingEdits: async (model: any, range: any, options: any, token: any) => {
    const filePath = model.uri.path.replace(/^\//, '')
    if (!hasLSPSupport(filePath)) return null
    try {
      const result = await lspApi.rangeFormatting(
        filePath,
        range.startLineNumber - 1,
        range.startColumn - 1,
        range.endLineNumber - 1,
        range.endColumn - 1,
        undefined,
        options.tabSize,
        options.insertSpaces,
      )
      if (token?.isCancellationRequested) return null
      if (!result?.edit) return null

      const edits = parseWorkspaceEdits(model, result.edit, monaco)
      return edits.length > 0 ? edits : null
    } catch (e) { logger.debug('LSP', 'provider error', e);
      return null
    }
  },
}))

// Register LSP on-type formatting provider (auto-format on trigger chars — Cursor/Windsurf pattern)
// Note: gopls does NOT support onTypeFormattingProvider. This is infrastructure for other LSP servers.
// Trigger chars typically include: '}' for braces, ';' for statements, '\n' for newlines
disposables.push(monaco.languages.registerOnTypeFormattingEditProvider('*', {
  displayName: 'LSP',
  triggerCharacters: ['}', ';', '\n'],
  provideOnTypeFormattingEdits: async (model: any, position: any, ch: string, options: any, token: any) => {
    const filePath = model.uri.path.replace(/^\//, '')
    if (!hasLSPSupport(filePath)) return null
    try {
      const result = await lspApi.onTypeFormatting(
        filePath,
        position.lineNumber - 1,
        position.column - 1,
        ch,
        undefined,
        options.tabSize,
        options.insertSpaces,
      )
      if (token?.isCancellationRequested) return null
      if (!result?.edit) return null

      const edits = parseWorkspaceEdits(model, result.edit, monaco)
      return edits.length > 0 ? edits : null
    } catch (e) { logger.debug('LSP', 'provider error', e);
      return null
    }
  },
}))

// Eagerly register Go since it's the most common case and the defaultLegend matches gopls
registerSemanticTokensProvider('go', defaultLegend)
// Skip changes from LSP-initiated edits (formatting, rename, code actions)
// to prevent sending stale edits back to the LSP server as incremental changes
disposables.push(editor.onDidChangeModelContent((e: any) => {
  if (!lspOpenFileRef.current || !hasLSPSupport(lspOpenFileRef.current)) return
  if (lspInitiatedEditRef.current) return
  // Capture all changes for this edit batch
  const changes = e.changes?.map((ch: any) => ({
    range: ch.range ? {
      start: { line: ch.range.startLineNumber - 1, character: ch.range.startColumn - 1 },
      end: { line: ch.range.endLineNumber - 1, character: ch.range.endColumn - 1 },
    } : undefined,
    rangeLength: ch.rangeLength,
    text: ch.text,
  })) || []
  if (changes.length > 0) {
    lspPendingChangesRef.current.push(...changes)
  }
}))


}

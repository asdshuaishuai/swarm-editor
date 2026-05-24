import { getWebSocketClient } from './websocket'

function getClient() {
  return getWebSocketClient()
}

export interface CompletionItem {
  label: string
  kind?: number
  detail?: string
  documentation?: string
  insertText?: string
}

export interface LSPRange {
  start: { line: number; character: number }
  end: { line: number; character: number }
}

export interface HoverResult {
  contents: Array<{ language?: string; value: string } | string> | { kind: string; value: string }
  range?: LSPRange
}

export interface Location {
  uri: string
  range: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
}

export interface LSPStatus {
  servers: Array<{
    server: string
    initialized: boolean
    capabilities?: Record<string, unknown>
  }>
  rootDir: string
}

export interface Diagnostic {
  range: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
  severity?: number
  code?: string | number
  source?: string
  message: string
  relatedInformation?: Array<{
    location: Location
    message: string
  }>
  tags?: number[]
  data?: unknown
}

export interface DocumentSymbol {
  name: string
  kind: number
  range: LSPRange
  selectionRange: LSPRange
  detail?: string
  tags?: number[]
  children?: DocumentSymbol[]
}

export interface DocumentHighlight {
  range: LSPRange
  kind?: number
}

export interface InlayHint {
  position: { line: number; character: number }
  label: string | Array<{ value: string; tooltip?: string; location?: Location; command?: { title: string; command: string } }>
  kind?: number
  paddingLeft?: boolean
  paddingRight?: boolean
  tooltip?: string | { kind: string; value: string }
  textEdits?: TextEdit[]
  data?: unknown
}

export interface FoldingRange {
  startLine: number
  endLine: number
  startCharacter?: number
  endCharacter?: number
  kind?: string
  collapsedText?: string
}

export interface WorkspaceSymbol {
  name: string
  kind: number
  location: Location | { uri: string }
  containerName?: string
  data?: unknown
}

export interface CodeAction {
  title: string
  kind?: string
  diagnostics?: Diagnostic[]
  edit?: WorkspaceEdit
  command?: { title: string; command: string; arguments?: unknown[] }
  isPreferred?: boolean
  data?: unknown
}

export interface TextEdit {
  range: LSPRange
  newText: string
}

export interface WorkspaceEdit {
  changes?: Record<string, TextEdit[]>
  documentChanges?: Array<{ textDocument: { uri: string; version: number }; edits: TextEdit[] }>
}

export interface SignatureHelp {
  signatures: Array<{
    label: string
    documentation?: string | { kind: string; value: string }
    parameters?: Array<{
      label: string | [number, number]
      documentation?: string | { kind: string; value: string }
    }>
    activeParameter?: number
  }>
  activeSignature?: number
  activeParameter?: number
}

export interface SelectionRange {
  range: LSPRange
  parent?: SelectionRange
}

export const lspApi = {
  async completion(
    file: string,
    line: number,
    column: number,
    uri?: string,
    triggerKind?: number,
    triggerCharacter?: string
  ): Promise<{ items: CompletionItem[] }> {
    return getClient().invoke('lsp_completion', { file, line, column, uri, triggerKind, triggerCharacter })
  },

  async hover(
    file: string,
    line: number,
    column: number,
    uri?: string
  ): Promise<HoverResult> {
    return getClient().invoke('lsp_hover', { file, line, column, uri })
  },

  async definition(
    file: string,
    line: number,
    column: number,
    uri?: string
  ): Promise<{ locations: Location[] }> {
    return getClient().invoke('lsp_definition', { file, line, column, uri })
  },

  async implementation(
    file: string,
    line: number,
    column: number,
    uri?: string
  ): Promise<{ locations: Location[] }> {
    return getClient().invoke('lsp_implementation', { file, line, column, uri })
  },

  async typeDefinition(
    file: string,
    line: number,
    column: number,
    uri?: string
  ): Promise<{ locations: Location[] }> {
    return getClient().invoke('lsp_type_definition', { file, line, column, uri })
  },

  async references(
    file: string,
    line: number,
    column: number,
    uri?: string
  ): Promise<{ locations: Location[] }> {
    return getClient().invoke('lsp_references', { file, line, column, uri })
  },

  async didOpen(uri: string, file: string, language: string, content: string): Promise<void> {
    await getClient().invoke('lsp_did_open', { uri, file, language, content })
  },

  async didChange(file: string, content: string): Promise<void> {
    await getClient().invoke('lsp_did_change', { file, content })
  },

  async didChangeIncremental(
    file: string,
    changes: Array<{
      range?: { start: { line: number; character: number }; end: { line: number; character: number } }
      rangeLength?: number
      text: string
    }>
  ): Promise<void> {
    await getClient().invoke('lsp_did_change_incremental', { file, changes })
  },

  async didClose(file: string): Promise<void> {
    await getClient().invoke('lsp_did_close', { file })
  },

  async didSave(file: string, text?: string): Promise<void> {
    await getClient().invoke('lsp_did_save', { file, text: text ?? null })
  },

  async status(): Promise<LSPStatus> {
    return getClient().invoke('lsp_status')
  },

  async supportsIncrementalSync(file: string): Promise<boolean> {
    return getClient().invoke('lsp_supports_incremental', { file })
  },

  async diagnostics(uri?: string): Promise<{ diagnostics: Record<string, Diagnostic[]> }> {
    return getClient().invoke('lsp_diagnostics', { uri: uri ?? '' })
  },

  async signatureHelp(
    file: string,
    line: number,
    column: number,
    uri?: string
  ): Promise<SignatureHelp> {
    return getClient().invoke('lsp_signature_help', { file, line, column, uri })
  },

  async documentSymbols(
    file: string,
    uri?: string
  ): Promise<{ symbols: DocumentSymbol[] }> {
    return getClient().invoke('lsp_document_symbols', { file, uri })
  },

  async documentHighlight(
    file: string,
    line: number,
    column: number,
    uri?: string
  ): Promise<{ highlights: DocumentHighlight[] }> {
    return getClient().invoke('lsp_document_highlight', { file, line, column, uri })
  },

  async inlayHints(
    file: string,
    startLine: number,
    endLine: number,
    uri?: string
  ): Promise<{ hints: InlayHint[] }> {
    return getClient().invoke('lsp_inlay_hints', { file, startLine, endLine, uri })
  },

  async foldingRanges(
    file: string,
    uri?: string
  ): Promise<{ ranges: FoldingRange[] }> {
    return getClient().invoke('lsp_folding_ranges', { file, uri })
  },

  async workspaceSymbols(
    query: string
  ): Promise<{ symbols: WorkspaceSymbol[] }> {
    return getClient().invoke('lsp_workspace_symbols', { query })
  },

  async codeActions(
    file: string,
    line: number,
    column: number,
    uri?: string
  ): Promise<{ actions: CodeAction[] }> {
    return getClient().invoke('lsp_code_actions', { file, line, column, uri })
  },

  async rename(
    file: string,
    line: number,
    column: number,
    newName: string,
    uri?: string
  ): Promise<{ edit: WorkspaceEdit }> {
    return getClient().invoke('lsp_rename', { file, line, column, newName, uri })
  },

  async formatting(
    file: string,
    uri?: string,
    tabSize?: number,
    insertSpaces?: boolean
  ): Promise<{ edit: WorkspaceEdit }> {
    return getClient().invoke('lsp_formatting', { file, uri, tabSize, insertSpaces })
  },

  async rangeFormatting(
    file: string,
    startLine: number,
    startCol: number,
    endLine: number,
    endCol: number,
    uri?: string,
    tabSize?: number,
    insertSpaces?: boolean
  ): Promise<{ edit: WorkspaceEdit }> {
    return getClient().invoke('lsp_range_formatting', { file, uri, startLine, startCol, endLine, endCol, tabSize, insertSpaces })
  },

  async onTypeFormatting(
    file: string,
    line: number,
    column: number,
    triggerChar: string,
    uri?: string,
    tabSize?: number,
    insertSpaces?: boolean
  ): Promise<{ edit: WorkspaceEdit }> {
    return getClient().invoke('lsp_on_type_formatting', { file, uri, line, column, triggerChar, tabSize, insertSpaces })
  },

  async selectionRange(
    file: string,
    positions: Array<{ line: number; character: number }>,
    uri?: string
  ): Promise<{ ranges: SelectionRange[] }> {
    return getClient().invoke('lsp_selection_range', { file, positions, uri })
  },

  async semanticTokens(
    file: string,
    uri?: string
  ): Promise<{ tokens: { resultId?: string; data: number[] } }> {
    return getClient().invoke('lsp_semantic_tokens', { file, uri })
  },

  async semanticTokensRange(
    file: string,
    startLine: number,
    startCol: number,
    endLine: number,
    endCol: number,
    uri?: string
  ): Promise<{ tokens: { resultId?: string; data: number[] } }> {
    return getClient().invoke('lsp_semantic_tokens_range', { file, startLine, startCol, endLine, endCol, uri })
  },

  async semanticTokensLegend(
    file: string
  ): Promise<{ legend: { tokenTypes: string[]; tokenModifiers: string[] } | null }> {
    return getClient().invoke('lsp_semantic_tokens_legend', { file })
  },

  async documentLinks(
    file: string,
    uri?: string
  ): Promise<{ links: Array<{ range: LSPRange; target?: string; tooltip?: string }> }> {
    return getClient().invoke('lsp_document_links', { file, uri })
  },

  // Code Lens
  async codeLenses(
    file: string,
    uri?: string
  ): Promise<{ lenses: CodeLens[] }> {
    return getClient().invoke('lsp_code_lenses', { file, uri })
  },

  // Call Hierarchy
  async prepareCallHierarchy(
    file: string,
    line: number,
    column: number,
    uri?: string
  ): Promise<{ items: CallHierarchyItem[] }> {
    return getClient().invoke('lsp_prepare_call_hierarchy', { file, line, column, uri })
  },

  async callHierarchyIncomingCalls(
    file: string,
    item: CallHierarchyItem
  ): Promise<{ calls: CallHierarchyIncomingCall[] }> {
    return getClient().invoke('lsp_call_hierarchy_incoming_calls', { file, item })
  },

  async callHierarchyOutgoingCalls(
    file: string,
    item: CallHierarchyItem
  ): Promise<{ calls: CallHierarchyOutgoingCall[] }> {
    return getClient().invoke('lsp_call_hierarchy_outgoing_calls', { file, item })
  },

  // Type Hierarchy
  async prepareTypeHierarchy(
    file: string,
    line: number,
    column: number,
    uri?: string
  ): Promise<{ items: TypeHierarchyItem[] }> {
    return getClient().invoke('lsp_prepare_type_hierarchy', { file, line, column, uri })
  },

  async typeHierarchySupertypes(
    file: string,
    item: TypeHierarchyItem
  ): Promise<{ items: TypeHierarchyItem[] }> {
    return getClient().invoke('lsp_type_hierarchy_supertypes', { file, item })
  },

  async typeHierarchySubtypes(
    file: string,
    item: TypeHierarchyItem
  ): Promise<{ items: TypeHierarchyItem[] }> {
    return getClient().invoke('lsp_type_hierarchy_subtypes', { file, item })
  },
}

export interface CallHierarchyItem {
  name: string
  kind: number
  tags?: number[]
  detail?: string
  uri: string
  range: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
  selectionRange: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
  data?: unknown
}

export interface CallHierarchyIncomingCall {
  from: CallHierarchyItem
  fromRanges: Array<{
    start: { line: number; character: number }
    end: { line: number; character: number }
  }>
}

export interface CallHierarchyOutgoingCall {
  to: CallHierarchyItem
  fromRanges: Array<{
    start: { line: number; character: number }
    end: { line: number; character: number }
  }>
}

export interface CodeLens {
  range: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
  command?: {
    title: string
    command: string
    arguments?: unknown[]
  }
  data?: unknown
}

export interface TypeHierarchyItem {
  name: string
  kind: number
  tags?: number[]
  detail?: string
  uri: string
  range: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
  selectionRange: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
  data?: unknown
}

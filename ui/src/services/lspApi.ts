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

export interface HoverResult {
  contents: any
  range?: any
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
    capabilities?: any
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
  data?: any
}

export const lspApi = {
  async completion(
    file: string,
    line: number,
    column: number,
    uri?: string
  ): Promise<{ items: CompletionItem[] }> {
    return getClient().invoke('lsp_completion', { file, line, column, uri })
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
  ): Promise<any> {
    return getClient().invoke('lsp_signature_help', { file, line, column, uri })
  },

  async documentSymbols(
    file: string,
    uri?: string
  ): Promise<{ symbols: any[] }> {
    return getClient().invoke('lsp_document_symbols', { file, uri })
  },

  async documentHighlight(
    file: string,
    line: number,
    column: number,
    uri?: string
  ): Promise<{ highlights: any[] }> {
    return getClient().invoke('lsp_document_highlight', { file, line, column, uri })
  },

  async inlayHints(
    file: string,
    startLine: number,
    endLine: number,
    uri?: string
  ): Promise<{ hints: any[] }> {
    return getClient().invoke('lsp_inlay_hints', { file, startLine, endLine, uri })
  },

  async foldingRanges(
    file: string,
    uri?: string
  ): Promise<{ ranges: any[] }> {
    return getClient().invoke('lsp_folding_ranges', { file, uri })
  },

  async workspaceSymbols(
    query: string
  ): Promise<{ symbols: any[] }> {
    return getClient().invoke('lsp_workspace_symbols', { query })
  },

  async codeActions(
    file: string,
    line: number,
    column: number,
    uri?: string
  ): Promise<{ actions: any[] }> {
    return getClient().invoke('lsp_code_actions', { file, line, column, uri })
  },

  async rename(
    file: string,
    line: number,
    column: number,
    newName: string,
    uri?: string
  ): Promise<{ edit: any }> {
    return getClient().invoke('lsp_rename', { file, line, column, newName, uri })
  },

  async formatting(
    file: string,
    uri?: string,
    tabSize?: number,
    insertSpaces?: boolean
  ): Promise<{ edit: any }> {
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
  ): Promise<{ edit: any }> {
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
  ): Promise<{ edit: any }> {
    return getClient().invoke('lsp_on_type_formatting', { file, uri, line, column, triggerChar, tabSize, insertSpaces })
  },

  async selectionRange(
    file: string,
    positions: Array<{ line: number; character: number }>,
    uri?: string
  ): Promise<{ ranges: any[] }> {
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
  ): Promise<{ links: Array<{ range: any; target?: string; tooltip?: string }> }> {
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
  data?: any
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
    arguments?: any[]
  }
  data?: any
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
  data?: any
}

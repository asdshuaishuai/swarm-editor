// Single source of truth for LSP language support (extension → LSP language ID)
export const LSP_LANG_MAP: Record<string, string> = {
  'go': 'go', 'rs': 'rust', 'py': 'python',
  'ts': 'typescript', 'tsx': 'typescriptreact',
  'js': 'javascript', 'jsx': 'javascriptreact',
  'java': 'java', 'c': 'c', 'cpp': 'cpp',
  'cs': 'csharp', 'cc': 'cpp', 'h': 'c', 'hpp': 'cpp',
}

export function getLSPLanguageId(path: string): string | null {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  return LSP_LANG_MAP[ext] || null
}

export function hasLSPSupport(filePath: string): boolean {
  return getLSPLanguageId(filePath) !== null
}

// Shared Monaco editor options (DRY — used by both main and secondary pane)
export function buildEditorOptions(overrides: { minimapEnabled?: boolean; [key: string]: any } = {}): any {
  const { minimapEnabled, ...rest } = overrides
  return {
    fontSize: 14,
    fontFamily: 'JetBrains Mono, Fira Code, monospace',
    fontLigatures: true,
    minimap: { enabled: minimapEnabled ?? true, renderCharacters: true, maxColumn: 80 },
    scrollBeyondLastLine: true,
    smoothScrolling: true,
    cursorSmoothCaretAnimation: 'off',
    cursorBlinking: 'blink',
    automaticLayout: true,
    dragAndDrop: true,
    tabSize: 2,
    insertSpaces: true,
    wordWrap: 'on',
    lineNumbers: 'on',
    renderWhitespace: 'selection',
    renderLineHighlight: 'all',
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: true, indentation: true, highlightActiveBracketPair: true, highlightActiveIndentation: true },
    stickyScroll: { enabled: true },
    padding: { top: 16, bottom: 16 },
    autoClosingBrackets: 'always',
    autoClosingQuotes: 'always',
    autoClosingDelete: 'always',
    autoSurround: 'languageDefined',
    linkedEditing: true,
    find: { addExtraSpaceOnTop: false, autoFindInSelection: 'multiline', seedSearchStringFromSelection: 'selection' },
    suggest: {
      preview: true, showMethods: true, showFunctions: true, showConstructors: true,
      showFields: true, showVariables: true, showClasses: true, showStructs: true,
      showInterfaces: true, showModules: true, showProperties: true, showEvents: true,
      showOperators: true, showUnits: true, showValues: true, showConstants: true,
      showEnums: true, showEnumMembers: true, showKeywords: true, showWords: true,
      showColors: true, showFiles: true, showReferences: true, showFolders: true,
      showTypeParameters: true, showSnippets: true, showInlineSuggestions: true,
    },
    inlineSuggest: { enabled: true },
    parameterHints: { enabled: true },
    autoIndent: 'full',
    formatOnPaste: true,
    selectionHighlight: true,
    occurrencesHighlight: 'singleFile',
    roundedSelection: true,
    overviewRulerBorder: false,
    hideCursorInOverviewRuler: true,
    renderLineHighlightOnlyWhenFocus: false,
    scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
    ...rest,
  }
}

// Convert LSP SelectionRange tree to Monaco SelectionRange[] (flat array, smallest to largest)
// Monaco expects SelectionRange[][] — outer array per position, inner array is expand chain
// LSP returns { range, parent: { range, parent: ... } } — linked tree from inner to outer
export function convertSelectionRangeChain(sr: any, monacoInstance: any): any[] {
  const chain: any[] = []
  let current: any = sr
  while (current) {
    chain.push({
      range: new monacoInstance.Range(
        current.range.start.line + 1, current.range.start.character + 1,
        current.range.end.line + 1, current.range.end.character + 1,
      ),
    })
    current = current.parent
  }
  // chain is now [innermost, ..., outermost] — Monaco expects this order for expand selection
  return chain
}

// Parse LSP WorkspaceEdit into Monaco TextEdit[] for a single model
// P2 fix: Filter by file URI - WorkspaceEdit.changes is keyed by URI string
export function parseWorkspaceEdits(model: any, edit: any, monacoInstance: any): any[] {
  if (!edit?.changes) return []
  const edits: any[] = []
  const modelUri = model?.uri?.toString()
  if (!modelUri) return []

  // LSP WorkspaceEdit.changes is { [uri: string]: TextEdit[] }
  // Only process edits for this model's file
  const fileEdits = edit.changes[modelUri]
  if (!fileEdits) return []

  for (const e of fileEdits) {
    edits.push({
      range: new monacoInstance.Range(
        e.range.start.line + 1, e.range.start.character + 1,
        e.range.end.line + 1, e.range.end.character + 1,
      ),
      text: e.newText,
    })
  }
  return edits
}

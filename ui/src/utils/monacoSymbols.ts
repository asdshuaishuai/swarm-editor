/**
 * Find symbol path for cursor position (returns chain from root to containing symbol).
 * Guards against malformed LSP data.
 */
export function findSymbolPath(symbols: any[], line: number, column: number): any[] {
  for (const sym of symbols) {
    if (!sym?.range?.start || !sym?.range?.end) continue
    if (typeof sym.range.start.line !== 'number' || typeof sym.range.end.line !== 'number') continue
    if (typeof sym.range.start.character !== 'number' || typeof sym.range.end.character !== 'number') continue
    const startLine = sym.range.start.line + 1
    const endLine = sym.range.end.line + 1
    const startCol = sym.range.start.character + 1
    const endCol = sym.range.end.character + 1

    if (line >= startLine && line <= endLine) {
      if (line === startLine && column < startCol) continue
      if (line === endLine && column > endCol) continue

      if (sym.children?.length) {
        const childPath = findSymbolPath(sym.children, line, column)
        if (childPath.length) {
          return [sym, ...childPath]
        }
      }
      return [sym]
    }
  }
  return []
}

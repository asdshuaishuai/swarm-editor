import { ChevronRight, GitCompare } from 'lucide-react'

interface SymbolInfo {
  name: string
  kind?: string
  detail?: string
  selectionRange?: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
}

interface EditorBreadcrumbsProps {
  currentFile: string
  breadcrumbSymbols: SymbolInfo[]
  gitStatusMap: Record<string, { status: string }>
  hasDiffView: boolean
  onOpenDiff: (path: string) => void
  onNavigateToSymbol: (line: number, column: number) => void
  onExpandDirectory: (dirPath: string) => void
  onShowFileTree: () => void
}

export function EditorBreadcrumbs({
  currentFile,
  breadcrumbSymbols,
  gitStatusMap,
  hasDiffView,
  onOpenDiff,
  onNavigateToSymbol,
  onExpandDirectory,
  onShowFileTree,
}: EditorBreadcrumbsProps) {
  const segments = currentFile.split('/')

  const handleBreadcrumbClick = (index: number) => {
    const pathUpToHere = segments.slice(0, index + 1).join('/')
    onExpandDirectory(pathUpToHere)
    onShowFileTree()
  }

  return (
    <div className="flex items-center gap-1 px-3 py-1 bg-mac-bg/50 border-b border-glass-border text-xs text-text-secondary overflow-x-auto">
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1
        const isFolder = !isLast
        const pathUpToHere = segments.slice(0, index + 1).join('/')

        return (
          <span key={index} className="flex items-center gap-1 whitespace-nowrap">
            {index > 0 && <ChevronRight size={10} className="text-text-tertiary flex-shrink-0" />}
            <button
              onClick={isFolder ? () => handleBreadcrumbClick(index) : undefined}
              className={`${
                isLast && !breadcrumbSymbols.length ? 'text-text-primary font-medium' : 'text-text-secondary hover:text-text-primary hover:bg-card-hover px-1 rounded cursor-pointer'
              } ${isFolder ? 'transition-colors' : ''}`}
              title={pathUpToHere}
              disabled={!isFolder}
            >
              {segment}
            </button>
          </span>
        )
      })}
      {/* LSP symbol breadcrumbs (show scope containing cursor) */}
      {breadcrumbSymbols.map((sym, symIndex) => (
        <span key={`symbol-${symIndex}`} className="flex items-center gap-1 whitespace-nowrap">
          <ChevronRight size={10} className="text-text-tertiary flex-shrink-0" />
          <button
            onClick={() => {
              if (sym.selectionRange) {
                onNavigateToSymbol(sym.selectionRange.start.line, sym.selectionRange.start.character)
              }
            }}
            className={`${
              symIndex === breadcrumbSymbols.length - 1
                ? 'text-text-primary font-medium'
                : 'text-text-secondary hover:text-text-primary hover:bg-card-hover px-1 rounded cursor-pointer'
            } transition-colors`}
            title={`${sym.kind || 'Symbol'}: ${sym.name}${sym.detail ? ` — ${sym.detail}` : ''}`}
          >
            {sym.name}
          </button>
        </span>
      ))}
      {/* Open Diff button — show when current file has git changes */}
      {gitStatusMap[currentFile] && !hasDiffView && (
        <button
          onClick={() => onOpenDiff(currentFile)}
          className="flex items-center gap-1.5 px-2 py-0.5 text-xs text-text-secondary hover:text-accent hover:bg-accent/10 rounded-mac transition-colors ml-auto mr-2"
          title="Open diff view (HEAD vs Working Tree)"
        >
          <GitCompare size={13} />
          Diff
        </button>
      )}
    </div>
  )
}

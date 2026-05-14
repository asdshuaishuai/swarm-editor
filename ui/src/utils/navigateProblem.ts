import type { editor } from 'monaco-editor'

interface Problem {
  file: string
  line: number
  column: number
  severity: string
}

interface NavigateProblemOptions {
  editorInstance: editor.IStandaloneCodeEditor
  curFile: string | null
  direction: 1 | -1
  workspaceProblems: Problem[]
  openFile: (path: string) => Promise<void>
}

export function navigateProblem(options: NavigateProblemOptions) {
  const { editorInstance, curFile, direction, workspaceProblems, openFile } = options
  if (workspaceProblems.length === 0) return

  const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2, hint: 3 }
  const sorted = [...workspaceProblems].sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file)
    if (severityOrder[a.severity] !== severityOrder[b.severity]) return severityOrder[a.severity] - severityOrder[b.severity]
    return a.line - b.line || a.column - b.column
  })

  const pos = editorInstance.getPosition()
  let idx = -1
  if (pos && curFile) {
    if (direction === 1) {
      idx = sorted.findIndex(p =>
        p.file > curFile ||
        p.file === curFile && p.line > pos.lineNumber - 1 ||
        p.file === curFile && p.line === pos.lineNumber - 1 && p.column > pos.column
      )
    } else {
      idx = sorted.findIndex(p =>
        p.file > curFile ||
        p.file === curFile && p.line > pos.lineNumber - 1 ||
        p.file === curFile && p.line === pos.lineNumber - 1 && p.column > pos.column
      )
      idx = idx <= 0 ? sorted.length - 1 : idx - 1
    }
  }
  if (idx < 0) idx = direction === 1 ? 0 : sorted.length - 1

  const problem = sorted[idx]
  window.dispatchEvent(new CustomEvent('show-problems'))

  const reveal = () => {
    editorInstance.revealLineInCenter(problem.line + 1)
    editorInstance.setPosition({ lineNumber: problem.line + 1, column: problem.column + 1 })
    editorInstance.focus()
  }

  if (problem.file !== curFile) {
    openFile(problem.file).then(reveal)
  } else {
    reveal()
  }
}

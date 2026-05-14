import { useCallback, useEffect, useRef } from 'react'
import { gitDiffApi } from '../services/api'
import type { GitFileStatus } from '../services'

export function useGitDiffDecorations(
  editorRef: React.MutableRefObject<any>,
  secondaryEditorRef: React.MutableRefObject<any>,
  monacoRef: React.MutableRefObject<any>,
  currentFile: string | null,
  secondaryFile: string | null,
  splitDirection: string,
  gitStatusMap: Record<string, GitFileStatus>,
) {
  const gitDiffDecorationIdsRef = useRef<string[]>([])
  const secondaryGitDiffDecorationIdsRef = useRef<string[]>([])

  const updateGitDiffDecorations = useCallback(async (filePath: string | null, isSecondary: boolean = false) => {
    const editor = isSecondary ? secondaryEditorRef.current : editorRef.current
    const monaco = monacoRef.current
    const decorationIdsRef = isSecondary ? secondaryGitDiffDecorationIdsRef : gitDiffDecorationIdsRef

    if (!editor || !monaco || !filePath) {
      if (editor && decorationIdsRef.current.length > 0) {
        decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, [])
      }
      return
    }

    const status = gitStatusMap[filePath]
    if (!status || status.status === '??') {
      if (decorationIdsRef.current.length > 0) {
        decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, [])
      }
      return
    }

    try {
      const result = await gitDiffApi.getLineDiff(filePath, status.staged)
      const decorations = result.ranges.map((range: any) => {
        const isAdded = range.type === 'added'
        const isRemoved = range.type === 'removed'
        const startLine = isRemoved ? range.startOld : range.startNew
        const endLine = isRemoved ? range.endOld : range.endNew

        if (startLine <= 0 || endLine <= 0) return null

        const gutterClass = isAdded
          ? 'git-diff-added-gutter'
          : isRemoved
            ? 'git-diff-removed-gutter'
            : 'git-diff-modified-gutter'

        const lineClass = isAdded
          ? 'git-diff-added-line'
          : isRemoved
            ? 'git-diff-removed-line'
            : 'git-diff-modified-line'

        const overviewRulerColor = isAdded
          ? '#2ea043'
          : isRemoved
            ? '#f85149'
            : '#e3b341'

        return {
          range: new monaco.Range(startLine, 1, endLine, 1),
          options: {
            isWholeLine: true,
            linesDecorationsClassName: gutterClass,
            className: lineClass,
            overviewRuler: {
              color: overviewRulerColor,
              darkColor: overviewRulerColor,
              position: monaco.editor.OverviewRulerLane.Left,
            },
          },
        }
      }).filter(Boolean)

      decorationIdsRef.current = editor.deltaDecorations(
        decorationIdsRef.current,
        decorations as any[],
      )
    } catch {
      if (decorationIdsRef.current.length > 0) {
        decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, [])
      }
    }
  }, [gitStatusMap, editorRef, secondaryEditorRef, monacoRef])

  // Update decorations when main file changes or git status changes
  useEffect(() => {
    updateGitDiffDecorations(currentFile, false)
  }, [currentFile, gitStatusMap, updateGitDiffDecorations])

  // Update decorations for secondary pane
  useEffect(() => {
    if (splitDirection === 'horizontal' && secondaryFile) {
      updateGitDiffDecorations(secondaryFile, true)
    }
  }, [secondaryFile, gitStatusMap, splitDirection, updateGitDiffDecorations])

  return { updateGitDiffDecorations }
}

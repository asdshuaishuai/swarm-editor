import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { editor } from 'monaco-editor'

interface UseSearchParamNavigationOptions {
  currentFile: string | null
  editorRef: React.MutableRefObject<editor.IStandaloneCodeEditor | null>
  openFile: (path: string) => Promise<void>
}

export function useSearchParamNavigation(options: UseSearchParamNavigationOptions) {
  const { currentFile, editorRef, openFile } = options
  const [searchParams] = useSearchParams()

  useEffect(() => {
    const fileParam = searchParams.get('file')
    const lineParam = searchParams.get('line')

    const scrollToLine = (line: number) => {
      if (editorRef.current && !isNaN(line) && line >= 0) {
        editorRef.current.revealLineInCenter(line + 1)
        editorRef.current.setPosition({ lineNumber: line + 1, column: 1 })
        editorRef.current.focus()
      }
    }

    if (fileParam && fileParam !== currentFile) {
      openFile(fileParam).then(() => {
        if (lineParam) scrollToLine(parseInt(lineParam, 10))
      })
    } else if (lineParam) {
      scrollToLine(parseInt(lineParam, 10))
    }
  }, [searchParams, currentFile, openFile])
}

import { hasLSPSupport } from './monaco'
import { useSplitPaneStore } from '../stores/splitPaneStore'

interface RegisterSecondaryContentChangeListenerOptions {
  editor: any
  disposables: any[]
  secondaryLspInitiatedEditRef: React.MutableRefObject<boolean>
  secondaryLspPendingChangesRef: React.MutableRefObject<any[]>
}

export function registerSecondaryContentChangeListener(options: RegisterSecondaryContentChangeListenerOptions) {
  const { editor, disposables, secondaryLspInitiatedEditRef, secondaryLspPendingChangesRef } = options

  disposables.push(
    editor.onDidChangeModelContent((e: any) => {
      const paneFile = useSplitPaneStore.getState().paneFiles.secondary
      if (!paneFile || !hasLSPSupport(paneFile)) return
      if (secondaryLspInitiatedEditRef.current) return
      const changes = e.changes?.map((ch: any) => ({
        range: ch.range ? {
          start: { line: ch.range.startLineNumber - 1, character: ch.range.startColumn - 1 },
          end: { line: ch.range.endLineNumber - 1, character: ch.range.endColumn - 1 },
        } : undefined,
        rangeLength: ch.rangeLength,
        text: ch.text,
      })) || []
      if (changes.length > 0) {
        secondaryLspPendingChangesRef.current.push(...changes)
      }
    })
  )
}

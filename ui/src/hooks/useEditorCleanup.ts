import { useEffect } from 'react'
import { lspApi } from '../services/lspApi'

interface UseEditorCleanupOptions {
  mountedRef: React.MutableRefObject<boolean>
  lspDebounceRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  autoSaveTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  lspOpenFileRef: React.MutableRefObject<string | null>
  secondaryLspDebounceRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  secondaryAutoSaveTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  secondaryLspOpenFileRef: React.MutableRefObject<string | null>
  providerDisposablesRef: React.MutableRefObject<any[]>
}

export function useEditorCleanup(options: UseEditorCleanupOptions) {
  const {
    mountedRef, lspDebounceRef, autoSaveTimeoutRef, lspOpenFileRef,
    secondaryLspDebounceRef, secondaryAutoSaveTimeoutRef, secondaryLspOpenFileRef,
    providerDisposablesRef,
  } = options

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (lspDebounceRef.current) clearTimeout(lspDebounceRef.current)
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current)
      if (lspOpenFileRef.current) {
        lspApi.didClose(lspOpenFileRef.current).catch(() => {})
      }
      if (secondaryLspDebounceRef.current) clearTimeout(secondaryLspDebounceRef.current)
      if (secondaryAutoSaveTimeoutRef.current) clearTimeout(secondaryAutoSaveTimeoutRef.current)
      if (secondaryLspOpenFileRef.current) {
        lspApi.didClose(secondaryLspOpenFileRef.current).catch(() => {})
      }
      providerDisposablesRef.current.forEach(d => d.dispose())
      providerDisposablesRef.current = []
    }
  }, [])
}

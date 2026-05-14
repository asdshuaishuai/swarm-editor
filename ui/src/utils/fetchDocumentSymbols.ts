import { lspApi } from '../services/lspApi'
import { hasLSPSupport } from './monaco'

interface FetchDocumentSymbolsOptions {
  filePath: string
  setSymbols: (symbols: any[]) => void
}

export async function fetchDocumentSymbols(options: FetchDocumentSymbolsOptions) {
  const { filePath, setSymbols } = options

  if (!hasLSPSupport(filePath)) {
    setSymbols([])
    return
  }

  try {
    const result = await lspApi.documentSymbols(filePath)
    setSymbols(result?.symbols?.length ? result.symbols : [])
  } catch {
    setSymbols([])
  }
}

import { useWorkspaceStore } from '../stores/workspaceStore'
import { fsApi } from '../services/api'
import { logger } from '../utils'

interface ExternalModPromptProps {
  filePath: string
  onDismiss: (path: string) => void
}

export function ExternalModPrompt({ filePath, onDismiss }: ExternalModPromptProps) {
  const handleReload = async () => {
    try {
      const content = await fsApi.readFile(filePath)
      const newContents = new Map(useWorkspaceStore.getState().fileContents)
      newContents.set(filePath, content)
      useWorkspaceStore.setState({ fileContents: newContents })
      onDismiss(filePath)
    } catch (err) {
      logger.error('Editor', 'Failed to reload file:', err)
    }
  }

  return (
    <div
      className="flex items-center justify-between px-3 py-1.5 text-xs border-b"
      style={{ background: '#161b22', borderBottomColor: '#30363d', color: '#d1d5db' }}
    >
      <span>
        文件已在外部修改，是否重新加载？
      </span>
      <div className="flex gap-2">
        <button
          onClick={handleReload}
          className="px-2 py-0.5 rounded text-xs font-medium transition-colors"
          style={{ background: '#58a6ff', color: '#0d1117' }}
        >
          重新加载
        </button>
        <button
          onClick={() => onDismiss(filePath)}
          className="px-2 py-0.5 rounded text-xs font-medium transition-colors"
          style={{ background: '#21262d', color: '#d1d5db' }}
        >
          保持当前
        </button>
      </div>
    </div>
  )
}

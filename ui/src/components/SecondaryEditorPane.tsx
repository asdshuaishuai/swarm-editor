import Editor from '@monaco-editor/react'
import { XCircle } from 'lucide-react'

interface SecondaryEditorPaneProps {
  filePath: string | null
  language: string
  value: string
  onChange: (value: string | undefined) => void
  onMount: (editor: any, monaco: any) => void
  options: any
  isDropTarget: boolean
  isInactive: boolean
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onClose: () => void
}

export function SecondaryEditorPane({
  filePath,
  language,
  value,
  onChange,
  onMount,
  options,
  isDropTarget,
  isInactive,
  onDragOver,
  onDragLeave,
  onDrop,
  onClose,
}: SecondaryEditorPaneProps) {
  return (
    <div
      className={`flex-1 overflow-hidden flex flex-col transition-all ${isDropTarget ? 'bg-accent/10' : ''} ${isInactive ? 'opacity-75' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className={`flex items-center justify-between px-2 py-0.5 border-b border-glass-border text-xs transition-colors ${isDropTarget ? 'bg-accent/20 border-accent' : 'bg-panel-bg/30'}`}>
        <span className={`truncate ${isDropTarget ? 'text-accent font-medium' : 'text-text-secondary'}`}>
          {isDropTarget ? 'Drop to open in this pane' : filePath ? filePath.split('/').pop() : 'No file open'}
        </span>
        <button
          onClick={onClose}
          className="p-0.5 hover:bg-card-hover rounded transition-colors"
          title="Close split"
        >
          <XCircle size={12} className="text-text-tertiary" />
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          language={language}
          value={value}
          onChange={onChange}
          onMount={onMount}
          options={options}
        />
      </div>
    </div>
  )
}

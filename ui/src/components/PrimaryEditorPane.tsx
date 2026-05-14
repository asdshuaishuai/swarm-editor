import Editor from '@monaco-editor/react'

interface PrimaryEditorPaneProps {
  language: string
  value: string
  onChange: (value: string | undefined) => void
  onMount: (editor: any, monaco: any) => void
  options: any
  splitDirection: string
  isDropTarget: boolean
  isInactive: boolean
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}

export function PrimaryEditorPane({
  language,
  value,
  onChange,
  onMount,
  options,
  splitDirection,
  isDropTarget,
  isInactive,
  onDragOver,
  onDragLeave,
  onDrop,
}: PrimaryEditorPaneProps) {
  return (
    <div
      className={`overflow-hidden transition-all ${splitDirection === 'horizontal' ? 'flex-1 border-r border-glass-border' : 'w-full h-full'} ${isDropTarget ? 'bg-accent/10' : ''} ${isInactive ? 'opacity-75' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <Editor
        height="100%"
        language={language}
        value={value}
        onChange={onChange}
        onMount={onMount}
        options={options}
      />
    </div>
  )
}

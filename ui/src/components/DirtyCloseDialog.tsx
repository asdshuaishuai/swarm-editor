import { AlertTriangle } from 'lucide-react'

interface DirtyCloseDialogProps {
  dirtyClosePath: string | null
  openFiles: string[]
  dirtyFiles: Set<string>
  onCancel: () => void
  onCloseWithoutSaving: (path: string) => void
  onCloseAllWithoutSaving: () => void
  onSaveAndClose: (path: string) => Promise<void>
  onSaveAllAndClose: () => Promise<void>
}

export function DirtyCloseDialog({
  dirtyClosePath,
  openFiles,
  dirtyFiles,
  onCancel,
  onCloseWithoutSaving,
  onCloseAllWithoutSaving,
  onSaveAndClose,
  onSaveAllAndClose,
}: DirtyCloseDialogProps) {
  if (!dirtyClosePath) return null

  const isCloseAll = dirtyClosePath === '__close_all__'
  const dirtyCount = openFiles.filter(f => dirtyFiles.has(f)).length
  const fileName = dirtyClosePath.split('/').pop() || ''

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200]"
      onClick={onCancel}
    >
      <div
        className="bg-mac-panel/95 border border-glass-border rounded-mac-xl p-5 w-[400px] shadow-mac backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-mac shrink-0 bg-warning/20">
            <AlertTriangle size={24} className="text-warning" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-1">Save changes?</h3>
            <p className="text-sm text-text-secondary">
              {isCloseAll
                ? `You have unsaved changes in ${dirtyCount} file(s). Save all before closing?`
                : <>Do you want to save changes to <span className="text-text-primary font-medium">{fileName}</span>?</>
              }
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary bg-slate-800 hover:bg-slate-700 rounded-mac transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (isCloseAll) {
                onCloseAllWithoutSaving()
              } else {
                onCloseWithoutSaving(dirtyClosePath)
              }
            }}
            className="px-3 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary bg-slate-800 hover:bg-slate-700 rounded-mac transition-colors"
          >
            Don&apos;t Save
          </button>
          <button
            onClick={async () => {
              if (isCloseAll) {
                await onSaveAllAndClose()
              } else {
                await onSaveAndClose(dirtyClosePath)
              }
            }}
            className="px-3 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent/90 rounded-mac transition-colors"
          >
            {isCloseAll ? 'Save All' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

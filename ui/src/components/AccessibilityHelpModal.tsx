import { X } from 'lucide-react'

interface AccessibilityHelpModalProps {
  onClose: () => void
}

export function AccessibilityHelpModal({ onClose }: AccessibilityHelpModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
    >
      <div
        className="bg-panel-bg border border-glass-border rounded-mac-xl p-5 w-[480px] max-w-lg shadow-mac max-h-[80vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-label="Accessibility Help"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-text-primary">Accessibility Help</h3>
          <button onClick={onClose} className="p-1 hover:bg-card-hover rounded-mac transition-colors" aria-label="Close">
            <X size={16} className="text-text-tertiary" />
          </button>
        </div>
        <div className="space-y-4 text-sm">
          <div>
            <h4 className="text-xs font-semibold text-text-tertiary uppercase mb-2">Navigation</h4>
            <div className="space-y-1">
              <div className="flex justify-between"><span className="text-text-secondary">Go to File</span><kbd className="text-text-tertiary">Ctrl+P</kbd></div>
              <div className="flex justify-between"><span className="text-text-secondary">Go to Symbol</span><kbd className="text-text-tertiary">@ in Quick Open</kbd></div>
              <div className="flex justify-between"><span className="text-text-secondary">Workspace Symbol</span><kbd className="text-text-tertiary">@ in Quick Open</kbd></div>
              <div className="flex justify-between"><span className="text-text-secondary">Go to Line</span><kbd className="text-text-tertiary">: in Quick Open</kbd></div>
              <div className="flex justify-between"><span className="text-text-secondary">Quick Fix</span><kbd className="text-text-tertiary">Ctrl+.</kbd></div>
              <div className="flex justify-between"><span className="text-text-secondary">Rename Symbol</span><kbd className="text-text-tertiary">F2</kbd></div>
              <div className="flex justify-between"><span className="text-text-secondary">Go to Definition</span><kbd className="text-text-tertiary">F12</kbd></div>
              <div className="flex justify-between"><span className="text-text-secondary">Peek Definition</span><kbd className="text-text-tertiary">Alt+F12</kbd></div>
              <div className="flex justify-between"><span className="text-text-secondary">Go to References</span><kbd className="text-text-tertiary">Shift+F12</kbd></div>
              <div className="flex justify-between"><span className="text-text-secondary">Find</span><kbd className="text-text-tertiary">Ctrl+F</kbd></div>
              <div className="flex justify-between"><span className="text-text-secondary">Find Next/Prev</span><kbd className="text-text-tertiary">F3 / Shift+F3</kbd></div>
              <div className="flex justify-between"><span className="text-text-secondary">Replace</span><kbd className="text-text-tertiary">Ctrl+H</kbd></div>
              <div className="flex justify-between"><span className="text-text-secondary">Search in Files</span><kbd className="text-text-tertiary">Ctrl+Shift+F</kbd></div>
            </div>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-text-tertiary uppercase mb-2">Editor</h4>
            <div className="space-y-1">
              <div className="flex justify-between"><span className="text-text-secondary">Command Palette</span><kbd className="text-text-tertiary">Ctrl+Shift+P</kbd></div>
              <div className="flex justify-between"><span className="text-text-secondary">Toggle Sidebar</span><kbd className="text-text-tertiary">Ctrl+B</kbd></div>
              <div className="flex justify-between"><span className="text-text-secondary">Toggle Bottom Panel</span><kbd className="text-text-tertiary">Ctrl+J</kbd></div>
              <div className="flex justify-between"><span className="text-text-secondary">Toggle Terminal</span><kbd className="text-text-tertiary">Ctrl+`</kbd></div>
              <div className="flex justify-between"><span className="text-text-secondary">Split Editor</span><kbd className="text-text-tertiary">Ctrl+\</kbd></div>
              <div className="flex justify-between"><span className="text-text-secondary">Close Tab</span><kbd className="text-text-tertiary">Ctrl+W</kbd></div>
              <div className="flex justify-between"><span className="text-text-secondary">Reopen Closed Tab</span><kbd className="text-text-tertiary">Ctrl+Shift+T</kbd></div>
              <div className="flex justify-between"><span className="text-text-secondary">Toggle Word Wrap</span><kbd className="text-text-tertiary">Alt+Z</kbd></div>
              <div className="flex justify-between"><span className="text-text-secondary">Select to Bracket</span><kbd className="text-text-tertiary">Ctrl+Shift+Alt+\</kbd></div>
            </div>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-text-tertiary uppercase mb-2">Multi-Cursor</h4>
            <div className="space-y-1">
              <div className="flex justify-between"><span className="text-text-secondary">Add Cursor Above/Below</span><kbd className="text-text-tertiary">Ctrl+Alt+Up/Down</kbd></div>
              <div className="flex justify-between"><span className="text-text-secondary">Add Next Occurrence</span><kbd className="text-text-tertiary">Ctrl+D</kbd></div>
              <div className="flex justify-between"><span className="text-text-secondary">Select All Occurrences</span><kbd className="text-text-tertiary">Ctrl+Shift+L</kbd></div>
              <div className="flex justify-between"><span className="text-text-secondary">Undo Last Cursor</span><kbd className="text-text-tertiary">Ctrl+U</kbd></div>
              <div className="flex justify-between"><span className="text-text-secondary">Add Cursors to Line Ends</span><kbd className="text-text-tertiary">Shift+Alt+I</kbd></div>
            </div>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-text-tertiary uppercase mb-2">Accessibility</h4>
            <div className="space-y-1">
              <div className="flex justify-between"><span className="text-text-secondary">Show Accessibility Help</span><kbd className="text-text-tertiary">Alt+F1</kbd></div>
              <div className="flex justify-between"><span className="text-text-secondary">Toggle Tab Focus Mode</span><kbd className="text-text-tertiary">Ctrl+M</kbd></div>
              <div className="flex justify-between"><span className="text-text-secondary">Open Context Menu</span><kbd className="text-text-tertiary">Shift+F10</kbd></div>
              <div className="flex justify-between"><span className="text-text-secondary">Navigate Problems</span><kbd className="text-text-tertiary">F8 / Shift+F8</kbd></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

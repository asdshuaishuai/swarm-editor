import { Keyboard, Command, Search } from 'lucide-react'
import { getFileIcon, getFileIconColor } from '../utils'

interface WelcomePanelProps {
  recentFiles: string[]
  onFileClick: (path: string) => void
}

export function WelcomePanel({ recentFiles, onFileClick }: WelcomePanelProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-mac-bg text-text-secondary">
      <div className="text-center max-w-md px-6">
        <div className="mx-auto mb-4 flex justify-center">
          <span className="text-5xl font-bold bg-gradient-to-br from-accent to-blue-400 bg-clip-text text-transparent">S</span>
        </div>
        <h2 className="text-xl font-semibold text-text-primary mb-2">Swarm Editor</h2>
        <p className="text-sm mb-6">Open a file from the Explorer or use Quick Open</p>

        {recentFiles.length > 0 && (
          <div className="mb-6 w-full">
            <h3 className="text-xs font-medium text-text-tertiary uppercase mb-2 text-left">Recent Files</h3>
            <div className="space-y-1">
              {recentFiles.slice(0, 5).map((file) => {
                const filename = file.split('/').pop() || file
                const FileIcon = getFileIcon(filename)
                return (
                  <button
                    key={file}
                    onClick={() => onFileClick(file)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-mac hover:bg-card-hover transition-colors text-left"
                    aria-label={`Open recent file ${filename}`}
                  >
                    <FileIcon size={14} className={getFileIconColor(filename) + ' flex-shrink-0'} />
                    <span className="truncate text-sm text-text-primary flex-1">{filename}</span>
                    <span className="truncate text-xs text-text-tertiary max-w-[150px]">{file}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 text-sm text-left border-t border-glass-border pt-4">
          <div className="flex items-center gap-2">
            <Keyboard size={14} className="text-text-tertiary" />
            <span><kbd className="px-1.5 py-0.5 bg-surface rounded text-xs">Ctrl+P</kbd> Quick Open</span>
          </div>
          <div className="flex items-center gap-2">
            <Command size={14} className="text-text-tertiary" />
            <span><kbd className="px-1.5 py-0.5 bg-surface rounded text-xs">Ctrl+Shift+P</kbd> Command Palette</span>
          </div>
          <div className="flex items-center gap-2">
            <Search size={14} className="text-text-tertiary" />
            <span><kbd className="px-1.5 py-0.5 bg-surface rounded text-xs">Ctrl+Shift+F</kbd> Search in Files</span>
          </div>
          <div className="flex items-center gap-2">
            <Search size={14} className="text-text-tertiary" />
            <span><kbd className="px-1.5 py-0.5 bg-surface rounded text-xs">Ctrl+Shift+H</kbd> Replace in Files</span>
          </div>
          <div className="flex items-center gap-2">
            <Keyboard size={14} className="text-text-tertiary" />
            <span><kbd className="px-1.5 py-0.5 bg-surface rounded text-xs">@</kbd> Go to Symbol in File</span>
          </div>
          <div className="flex items-center gap-2">
            <Keyboard size={14} className="text-text-tertiary" />
            <span><kbd className="px-1.5 py-0.5 bg-surface rounded text-xs">#</kbd> Go to Symbol in Workspace</span>
          </div>
          <div className="flex items-center gap-2">
            <Keyboard size={14} className="text-text-tertiary" />
            <span><kbd className="px-1.5 py-0.5 bg-surface rounded text-xs">:</kbd> Go to Line</span>
          </div>
          <div className="flex items-center gap-2">
            <Keyboard size={14} className="text-text-tertiary" />
            <span><kbd className="px-1.5 py-0.5 bg-surface rounded text-xs">Ctrl+\\</kbd> Split Editor</span>
          </div>
          <div className="flex items-center gap-2">
            <Keyboard size={14} className="text-text-tertiary" />
            <span><kbd className="px-1.5 py-0.5 bg-surface rounded text-xs">Ctrl+W</kbd> Close Tab</span>
          </div>
          <div className="flex items-center gap-2">
            <Keyboard size={14} className="text-text-tertiary" />
            <span><kbd className="px-1.5 py-0.5 bg-surface rounded text-xs">Ctrl+Shift+T</kbd> Reopen Closed Tab</span>
          </div>
          <div className="flex items-center gap-2">
            <Keyboard size={14} className="text-text-tertiary" />
            <span><kbd className="px-1.5 py-0.5 bg-surface rounded text-xs">Ctrl+J</kbd> Toggle Panel</span>
          </div>
          <div className="flex items-center gap-2">
            <Keyboard size={14} className="text-text-tertiary" />
            <span><kbd className="px-1.5 py-0.5 bg-surface rounded text-xs">Ctrl+B</kbd> Toggle Sidebar</span>
          </div>
          <div className="flex items-center gap-2">
            <Keyboard size={14} className="text-text-tertiary" />
            <span><kbd className="px-1.5 py-0.5 bg-surface rounded text-xs">Ctrl+D</kbd> Add Next Selection</span>
          </div>
          <div className="flex items-center gap-2">
            <Keyboard size={14} className="text-text-tertiary" />
            <span><kbd className="px-1.5 py-0.5 bg-surface rounded text-xs">Ctrl+/</kbd> Toggle Comment</span>
          </div>
          <div className="flex items-center gap-2">
            <Keyboard size={14} className="text-text-tertiary" />
            <span><kbd className="px-1.5 py-0.5 bg-surface rounded text-xs">Ctrl+Shift+G</kbd> Source Control</span>
          </div>
          <div className="flex items-center gap-2">
            <Keyboard size={14} className="text-text-tertiary" />
            <span><kbd className="px-1.5 py-0.5 bg-surface rounded text-xs">Ctrl+Shift+M</kbd> Problems</span>
          </div>
          <div className="flex items-center gap-2">
            <Keyboard size={14} className="text-text-tertiary" />
            <span><kbd className="px-1.5 py-0.5 bg-surface rounded text-xs">Ctrl+`</kbd> Toggle Terminal</span>
          </div>
          <div className="flex items-center gap-2">
            <Keyboard size={14} className="text-text-tertiary" />
            <span><kbd className="px-1.5 py-0.5 bg-surface rounded text-xs">Alt+F1</kbd> Accessibility Help</span>
          </div>
        </div>
      </div>
    </div>
  )
}

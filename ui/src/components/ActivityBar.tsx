import { Files, GitBranch, ListTree } from 'lucide-react'

interface ActivityBarProps {
  activityView: 'explorer' | 'search' | 'sourceControl' | 'outline'
  onViewChange: (view: 'explorer' | 'search' | 'sourceControl' | 'outline') => void
  gitStatusCount: number
  errorCount: number
}

export function ActivityBar({
  activityView,
  onViewChange,
  gitStatusCount,
  errorCount,
}: ActivityBarProps) {
  return (
    <div className="w-12 bg-panel-bg/50 border-r border-glass-border flex flex-col items-center pt-1 shrink-0">
      <button
        onClick={() => onViewChange('explorer')}
        className={`w-12 h-12 flex items-center justify-center transition-colors relative ${
          activityView === 'explorer' ? 'text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
        }`}
        title="Explorer (Ctrl+Shift+E)"
      >
        {activityView === 'explorer' && <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-accent rounded-r" />}
        <Files size={24} />
      </button>
      <button
        onClick={() => onViewChange('sourceControl')}
        className={`w-12 h-12 flex items-center justify-center transition-colors relative ${
          activityView === 'sourceControl' ? 'text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
        }`}
        title="Source Control (Ctrl+Shift+G)"
      >
        {activityView === 'sourceControl' && <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-accent rounded-r" />}
        <GitBranch size={24} />
        {gitStatusCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-accent/80 text-white text-[9px] font-bold leading-none px-0.5">
            {gitStatusCount > 999 ? `${Math.floor(gitStatusCount / 1000)}K` : gitStatusCount}
          </span>
        )}
      </button>
      <button
        onClick={() => onViewChange('outline')}
        className={`w-12 h-12 flex items-center justify-center transition-colors relative ${
          activityView === 'outline' ? 'text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
        }`}
        title="Problems & Outline (Ctrl+Shift+O)"
      >
        {activityView === 'outline' && <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-accent rounded-r" />}
        <ListTree size={24} />
        {errorCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-error/80 text-white text-[9px] font-bold leading-none px-0.5">
            {errorCount > 99 ? '99+' : errorCount}
          </span>
        )}
      </button>
    </div>
  )
}

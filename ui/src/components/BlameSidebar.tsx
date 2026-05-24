import type { BlameLine } from '../services/api'

interface BlameSidebarProps {
  lines: BlameLine[]
}

export function BlameSidebar({ lines }: BlameSidebarProps) {
  if (lines.length === 0) return null

  return (
    <div
      className="w-[180px] shrink-0 overflow-hidden border-r text-[11px] font-mono leading-[20px] py-0 select-none"
      style={{
        backgroundColor: '#0d1117',
        borderRightColor: '#21262d',
        color: '#6b7280',
      }}
    >
      {lines.map((bl) => (
        <div
          key={bl.line}
          className="px-1 truncate"
          title={`${bl.author} (${bl.authorMail}) ${bl.authorTime}\n${bl.summary}\n${bl.commit}`}
          style={{ height: '20px' }}
        >
          {bl.author} {bl.authorTime}
        </div>
      ))}
    </div>
  )
}

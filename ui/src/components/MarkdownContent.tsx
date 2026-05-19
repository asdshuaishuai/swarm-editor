import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface MarkdownContentProps {
  content: string
  className?: string
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div className={className}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '')
          const code = String(children).replace(/\n$/, '')
          if (match) {
            return (
              <SyntaxHighlighter
                style={oneDark}
                language={match[1]}
                PreTag="div"
                customStyle={{ margin: '8px 0', borderRadius: '6px', fontSize: '13px' }}
              >
                {code}
              </SyntaxHighlighter>
            )
          }
          return (
            <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg-hover, #2d2d2d)' }} {...props}>
              {children}
            </code>
          )
        },
        p({ children }) {
          return <p style={{ marginBottom: '8px' }}>{children}</p>
        },
        a({ href, children }) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary, #6366f1)' }}>
              {children}
            </a>
          )
        },
        pre({ children }) {
          return <div style={{ margin: '8px 0' }}>{children}</div>
        },
        blockquote({ children }) {
          return (
            <blockquote style={{ borderLeft: '3px solid var(--border-default, #444)', paddingLeft: '12px', margin: '8px 0', opacity: 0.8 }}>
              {children}
            </blockquote>
          )
        },
        table({ children }) {
          return (
            <div style={{ overflowX: 'auto', margin: '8px 0' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>{children}</table>
            </div>
          )
        },
        th({ children }) {
          return (
            <th style={{ border: '1px solid var(--border-default, #444)', padding: '6px 12px', textAlign: 'left', background: 'var(--bg-hover, #2d2d2d)' }}>
              {children}
            </th>
          )
        },
        td({ children }) {
          return (
            <td style={{ border: '1px solid var(--border-default, #444)', padding: '6px 12px' }}>
              {children}
            </td>
          )
        },
        ul({ children }) {
          return <ul style={{ paddingLeft: '20px', marginBottom: '8px' }}>{children}</ul>
        },
        ol({ children }) {
          return <ol style={{ paddingLeft: '20px', marginBottom: '8px' }}>{children}</ol>
        },
        li({ children }) {
          return <li style={{ marginBottom: '4px' }}>{children}</li>
        },
        h1({ children }) {
          return <h1 style={{ fontSize: '1.4em', fontWeight: 600, margin: '12px 0 8px' }}>{children}</h1>
        },
        h2({ children }) {
          return <h2 style={{ fontSize: '1.2em', fontWeight: 600, margin: '10px 0 6px' }}>{children}</h2>
        },
        h3({ children }) {
          return <h3 style={{ fontSize: '1.1em', fontWeight: 600, margin: '8px 0 4px' }}>{children}</h3>
        },
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  )
}

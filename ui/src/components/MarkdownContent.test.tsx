import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MarkdownContent } from './MarkdownContent'

// Mock react-syntax-highlighter to avoid heavy ESM imports in tests
// Source uses: import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
vi.mock('react-syntax-highlighter', () => {
  const mockFn = vi.fn(({ children, language }: { children: string; language: string }) => (
    <pre data-testid="syntax-highlighter" data-language={language}>
      <code>{children}</code>
    </pre>
  ))
  return { Prism: mockFn }
})

vi.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({
  oneDark: {},
}))

describe('MarkdownContent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  describe('basic rendering', () => {
    it('renders plain text', () => {
      render(<MarkdownContent content="Hello world" />)
      expect(screen.getByText('Hello world')).toBeTruthy()
    })

    it('renders empty content', () => {
      const { container } = render(<MarkdownContent content="" />)
      expect(container.firstChild).toBeTruthy()
    })

    it('applies className to wrapper div', () => {
      const { container } = render(<MarkdownContent content="test" className="my-class" />)
      expect(container.firstChild).toHaveClass('my-class')
    })

    it('renders without className', () => {
      const { container } = render(<MarkdownContent content="test" />)
      expect(container.firstChild).toBeTruthy()
      expect((container.firstChild as HTMLElement).className).toBe('')
    })
  })

  describe('text formatting', () => {
    it('renders markdown bold', () => {
      const { container } = render(<MarkdownContent content="**bold**" />)
      const el = container.querySelector('strong')
      expect(el).toBeTruthy()
      expect(el?.textContent).toBe('bold')
    })

    it('renders markdown italic', () => {
      const { container } = render(<MarkdownContent content="*italic*" />)
      const el = container.querySelector('em')
      expect(el).toBeTruthy()
      expect(el?.textContent).toBe('italic')
    })

    it('renders inline code without language', () => {
      const { container } = render(<MarkdownContent content="Use `console.log` to debug" />)
      const codeEls = container.querySelectorAll('code')
      expect(codeEls.length).toBeGreaterThanOrEqual(1)
      expect(container.textContent).toContain('console.log')
    })

    it('applies custom style to inline code', () => {
      const { container } = render(<MarkdownContent content="`inline`" />)
      const codeEl = container.querySelector('code')
      expect(codeEl).toBeTruthy()
      expect(codeEl?.style.background).toBeTruthy()
    })

    it('inline code has expected classes', () => {
      const { container } = render(<MarkdownContent content="`inline`" />)
      const codeEl = container.querySelector('code')
      expect(codeEl?.className).toContain('px-1')
      expect(codeEl?.className).toContain('rounded')
    })
  })

  describe('headings', () => {
    it('renders h1 heading', () => {
      const { container } = render(<MarkdownContent content="# Title" />)
      const h1 = container.querySelector('h1')
      expect(h1).toBeTruthy()
      expect(h1?.textContent).toBe('Title')
    })

    it('renders h2 heading', () => {
      const { container } = render(<MarkdownContent content="## Subtitle" />)
      const h2 = container.querySelector('h2')
      expect(h2).toBeTruthy()
      expect(h2?.textContent).toBe('Subtitle')
    })

    it('renders h3 heading', () => {
      const { container } = render(<MarkdownContent content="### Section" />)
      const h3 = container.querySelector('h3')
      expect(h3).toBeTruthy()
      expect(h3?.textContent).toBe('Section')
    })

    it('applies styles to h1', () => {
      const { container } = render(<MarkdownContent content="# Title" />)
      const h1 = container.querySelector('h1')
      expect(h1?.style.fontSize).toBe('1.4em')
      expect(h1?.style.fontWeight).toBe('600')
    })

    it('applies styles to h2', () => {
      const { container } = render(<MarkdownContent content="## Subtitle" />)
      const h2 = container.querySelector('h2')
      expect(h2?.style.fontSize).toBe('1.2em')
      expect(h2?.style.fontWeight).toBe('600')
    })

    it('applies styles to h3', () => {
      const { container } = render(<MarkdownContent content="### Section" />)
      const h3 = container.querySelector('h3')
      expect(h3?.style.fontSize).toBe('1.1em')
      expect(h3?.style.fontWeight).toBe('600')
    })

    it('h1 has margin styles', () => {
      const { container } = render(<MarkdownContent content="# Title" />)
      const h1 = container.querySelector('h1')
      expect(h1?.style.margin).toBeTruthy()
    })

    it('h2 has margin styles', () => {
      const { container } = render(<MarkdownContent content="## Sub" />)
      const h2 = container.querySelector('h2')
      expect(h2?.style.margin).toBeTruthy()
    })

    it('h3 has margin styles', () => {
      const { container } = render(<MarkdownContent content="### Sec" />)
      const h3 = container.querySelector('h3')
      expect(h3?.style.margin).toBeTruthy()
    })
  })

  describe('code blocks', () => {
    it('renders fenced code block content', () => {
      const { container } = render(<MarkdownContent content={"```javascript\nconsole.log('hi')\n```"} />)
      expect(container.textContent).toContain("console.log('hi')")
    })

    it('renders code block with python language tag', () => {
      const { container } = render(<MarkdownContent content={"```python\nprint('hello')\n```"} />)
      expect(container.textContent).toContain("print('hello')")
    })

    it('renders code block with typescript language tag', () => {
      const { container } = render(<MarkdownContent content={"```typescript\nconst x: number = 1\n```"} />)
      expect(container.textContent).toContain('const x: number = 1')
    })

    it('renders inline code within paragraph', () => {
      const { container } = render(<MarkdownContent content="Use `npm install` to install" />)
      const p = container.querySelector('p')
      expect(p).toBeTruthy()
      expect(p?.textContent).toContain('npm install')
    })

    it('code block uses SyntaxHighlighter for language-tagged blocks', async () => {
      const { Prism } = await import('react-syntax-highlighter')
      render(<MarkdownContent content={"```javascript\nconsole.log('hi')\n```"} />)
      expect(Prism).toHaveBeenCalled()
    })
  })

  describe('links', () => {
    it('renders link', () => {
      const { container } = render(<MarkdownContent content="[click](https://example.com)" />)
      const link = container.querySelector('a')
      expect(link).toBeTruthy()
      expect(link?.getAttribute('href')).toBe('https://example.com')
    })

    it('link opens in new tab', () => {
      const { container } = render(<MarkdownContent content="[click](https://example.com)" />)
      const link = container.querySelector('a')
      expect(link?.getAttribute('target')).toBe('_blank')
      expect(link?.getAttribute('rel')).toBe('noopener noreferrer')
    })

    it('link has styled color', () => {
      const { container } = render(<MarkdownContent content="[click](https://example.com)" />)
      const link = container.querySelector('a')
      expect(link?.style.color).toBeTruthy()
    })

    it('link text is rendered', () => {
      const { container } = render(<MarkdownContent content="[Go Here](https://example.com)" />)
      const link = container.querySelector('a')
      expect(link?.textContent).toBe('Go Here')
    })
  })

  describe('paragraphs', () => {
    it('renders paragraph with margin style', () => {
      const { container } = render(<MarkdownContent content="Hello world" />)
      const p = container.querySelector('p')
      expect(p).toBeTruthy()
      expect(p?.style.marginBottom).toBe('8px')
    })

    it('renders single-line text as paragraph', () => {
      const { container } = render(<MarkdownContent content="Just text" />)
      const p = container.querySelector('p')
      expect(p).toBeTruthy()
      expect(p?.textContent).toBe('Just text')
    })
  })

  describe('lists', () => {
    it('renders unordered list', () => {
      const { container } = render(<MarkdownContent content="- item 1\n- item 2" />)
      const ul = container.querySelector('ul')
      expect(ul).toBeTruthy()
      expect(ul?.style.paddingLeft).toBe('20px')
    })

    it('renders ordered list', () => {
      const { container } = render(<MarkdownContent content="1. first\n2. second" />)
      const ol = container.querySelector('ol')
      expect(ol).toBeTruthy()
      expect(ol?.style.paddingLeft).toBe('20px')
    })

    it('renders list items', () => {
      const { container } = render(<MarkdownContent content={"- item 1\n\n- item 2"} />)
      const items = container.querySelectorAll('li')
      expect(items.length).toBeGreaterThanOrEqual(2)
    })

    it('list items have margin style', () => {
      const { container } = render(<MarkdownContent content="- item 1" />)
      const li = container.querySelector('li')
      expect(li?.style.marginBottom).toBe('4px')
    })

    it('unordered list has marginBottom', () => {
      const { container } = render(<MarkdownContent content="- item 1" />)
      const ul = container.querySelector('ul')
      expect(ul?.style.marginBottom).toBe('8px')
    })

    it('ordered list has marginBottom', () => {
      const { container } = render(<MarkdownContent content="1. first" />)
      const ol = container.querySelector('ol')
      expect(ol?.style.marginBottom).toBe('8px')
    })
  })

  describe('blockquotes', () => {
    it('renders blockquote', () => {
      const { container } = render(<MarkdownContent content="> quoted text" />)
      const bq = container.querySelector('blockquote')
      expect(bq).toBeTruthy()
      expect(bq?.textContent).toContain('quoted text')
    })

    it('blockquote has borderLeft style', () => {
      const { container } = render(<MarkdownContent content="> quoted" />)
      const bq = container.querySelector('blockquote')
      expect(bq?.style.borderLeft).toBeTruthy()
      expect(bq?.style.borderLeft).toContain('3px solid')
    })

    it('blockquote has opacity', () => {
      const { container } = render(<MarkdownContent content="> quoted" />)
      const bq = container.querySelector('blockquote')
      expect(bq?.style.opacity).toBe('0.8')
    })

    it('blockquote has paddingLeft', () => {
      const { container } = render(<MarkdownContent content="> quoted" />)
      const bq = container.querySelector('blockquote')
      expect(bq?.style.paddingLeft).toBe('12px')
    })

    it('blockquote has margin', () => {
      const { container } = render(<MarkdownContent content="> quoted" />)
      const bq = container.querySelector('blockquote')
      expect(bq?.style.margin).toBeTruthy()
    })
  })

  describe('tables', () => {
    it('renders table content with headers and cells', () => {
      const { container } = render(<MarkdownContent content={"| H1 | H2 |\n| --- | --- |\n| A | B |"} />)
      const bodyText = container.textContent ?? ''
      expect(bodyText).toContain('H1')
      expect(bodyText).toContain('H2')
      expect(bodyText).toContain('A')
      expect(bodyText).toContain('B')
    })

    it('renders table element when using GFM', () => {
      const { container } = render(<MarkdownContent content={"| H1 | H2 |\n| --- | --- |\n| A | B |"} />)
      const table = container.querySelector('table')
      expect(table).toBeTruthy()
    })

    it('table has border-collapse style', () => {
      const { container } = render(<MarkdownContent content={"| H1 | H2 |\n| --- | --- |\n| A | B |"} />)
      const table = container.querySelector('table')
      expect(table?.style.borderCollapse).toBe('collapse')
    })
  })

  describe('pre blocks', () => {
    it('pre override renders content', () => {
      const { container } = render(<MarkdownContent content={"```\ncode\n```"} />)
      expect(container.textContent).toContain('code')
    })
  })

  describe('GFM features (remark-gfm)', () => {
    it('renders strikethrough text', () => {
      const { container } = render(<MarkdownContent content="~~deleted~~" />)
      const del = container.querySelector('del')
      expect(del).toBeTruthy()
      expect(del?.textContent).toBe('deleted')
    })

    it('renders task list with checkboxes', () => {
      const { container } = render(<MarkdownContent content={"- [x] done\n\n- [ ] todo"} />)
      const checkboxes = container.querySelectorAll('input[type="checkbox"]')
      expect(checkboxes.length).toBeGreaterThanOrEqual(1)
    })

    it('renders checked task as checked', () => {
      const { container } = render(<MarkdownContent content="- [x] done" />)
      const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement
      expect(checkbox).toBeTruthy()
      expect(checkbox.checked).toBe(true)
    })

    it('renders unchecked task as not checked', () => {
      const { container } = render(<MarkdownContent content="- [ ] todo" />)
      const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement
      expect(checkbox).toBeTruthy()
      expect(checkbox.checked).toBe(false)
    })
  })

  describe('complex content', () => {
    it('renders mixed content with headings and text', () => {
      const { container } = render(<MarkdownContent content={"# Title\n\nSome **bold** text\n\n- item 1\n\n- item 2"} />)
      expect(container.querySelector('h1')).toBeTruthy()
      expect(container.querySelector('strong')).toBeTruthy()
      expect(container.querySelectorAll('li').length).toBeGreaterThanOrEqual(2)
    })

    it('renders multiple headings at different levels', () => {
      const { container } = render(<MarkdownContent content={"# H1\n\n## H2\n\n### H3"} />)
      expect(container.querySelector('h1')).toBeTruthy()
      expect(container.querySelector('h2')).toBeTruthy()
      expect(container.querySelector('h3')).toBeTruthy()
    })

    it('renders link within paragraph', () => {
      const { container } = render(<MarkdownContent content="Check out [the docs](https://docs.example.com) for info" />)
      const link = container.querySelector('a')
      expect(link).toBeTruthy()
      expect(link?.getAttribute('href')).toBe('https://docs.example.com')
    })

    it('handles content with only whitespace', () => {
      const { container } = render(<MarkdownContent content="   " />)
      expect(container.firstChild).toBeTruthy()
    })

    it('handles special characters in content', () => {
      const { container } = render(<MarkdownContent content="Use <div> & `code` for stuff" />)
      expect(container.textContent).toContain('code')
    })
  })
})

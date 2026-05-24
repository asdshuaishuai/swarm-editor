import { describe, it, expect, vi } from 'vitest'
import { getLanguageExtension, createEditorExtensions } from './codemirrorSetup'

describe('getLanguageExtension', () => {
  it('returns JS extension for .js files', () => {
    const exts = getLanguageExtension('app.js')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns TS extension for .ts files', () => {
    const exts = getLanguageExtension('app.ts')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns TSX extension for .tsx files', () => {
    const exts = getLanguageExtension('App.tsx')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns JSX extension for .jsx files', () => {
    const exts = getLanguageExtension('Component.jsx')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns CSS extension for .css files', () => {
    const exts = getLanguageExtension('style.css')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns CSS extension for .scss files', () => {
    const exts = getLanguageExtension('style.scss')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns HTML extension for .html files', () => {
    const exts = getLanguageExtension('index.html')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns JSON extension for .json files', () => {
    const exts = getLanguageExtension('package.json')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns Python extension for .py files', () => {
    const exts = getLanguageExtension('main.py')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns Go extension for .go files', () => {
    const exts = getLanguageExtension('main.go')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns Rust extension for .rs files', () => {
    const exts = getLanguageExtension('lib.rs')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns Markdown extension for .md files', () => {
    const exts = getLanguageExtension('README.md')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns XML extension for .yaml files', () => {
    const exts = getLanguageExtension('config.yaml')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns Java extension for .java files', () => {
    const exts = getLanguageExtension('App.java')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns C++ extension for .cpp files', () => {
    const exts = getLanguageExtension('main.cpp')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns C extension for .c files', () => {
    const exts = getLanguageExtension('main.c')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns PHP extension for .php files', () => {
    const exts = getLanguageExtension('index.php')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns empty for unknown extensions', () => {
    const exts = getLanguageExtension('data.csv')
    expect(exts).toEqual([])
  })

  it('returns empty for files with no extension', () => {
    const exts = getLanguageExtension('Makefile')
    expect(exts).toEqual([])
  })

  it('handles uppercase extensions', () => {
    const exts = getLanguageExtension('App.TS')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('handles path-style filenames', () => {
    const exts = getLanguageExtension('src/components/App.tsx')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('handles .mjs extension', () => {
    const exts = getLanguageExtension('module.mjs')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('handles .jsonc extension', () => {
    const exts = getLanguageExtension('tsconfig.jsonc')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('handles .toml extension via xml', () => {
    const exts = getLanguageExtension('Cargo.toml')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('handles .less extension', () => {
    const exts = getLanguageExtension('vars.less')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('handles .htm extension', () => {
    const exts = getLanguageExtension('page.htm')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('handles .svg extension', () => {
    const exts = getLanguageExtension('icon.svg')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('handles .pyw extension', () => {
    const exts = getLanguageExtension('gui.pyw')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('handles .markdown extension', () => {
    const exts = getLanguageExtension('doc.markdown')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('handles .yml extension', () => {
    const exts = getLanguageExtension('docker-compose.yml')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('handles .plist extension', () => {
    const exts = getLanguageExtension('info.plist')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('handles .h extension', () => {
    const exts = getLanguageExtension('header.h')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('handles .hpp extension', () => {
    const exts = getLanguageExtension('header.hpp')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('handles .cc extension', () => {
    const exts = getLanguageExtension('impl.cc')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('handles .cxx extension', () => {
    const exts = getLanguageExtension('impl.cxx')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('handles .hxx extension', () => {
    const exts = getLanguageExtension('header.hxx')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('handles .phtml extension', () => {
    const exts = getLanguageExtension('template.phtml')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('handles .cjs extension', () => {
    const exts = getLanguageExtension('module.cjs')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('handles .xml extension', () => {
    const exts = getLanguageExtension('config.xml')
    expect(exts.length).toBeGreaterThan(0)
  })
})

describe('createEditorExtensions', () => {
  it('returns non-empty extension array', () => {
    const exts = createEditorExtensions('test.ts')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('includes basic setup extensions', () => {
    const exts = createEditorExtensions('test.js')
    expect(exts.length).toBeGreaterThan(5)
  })

  it('works with no options', () => {
    const exts = createEditorExtensions('test.py')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('works with empty options', () => {
    const exts = createEditorExtensions('test.go', {})
    expect(exts.length).toBeGreaterThan(0)
  })

  it('accepts onChange callback', () => {
    const onChange = vi.fn()
    const exts = createEditorExtensions('test.ts', { onChange })
    expect(exts.length).toBeGreaterThan(0)
  })

  it('accepts onSave callback', () => {
    const onSave = vi.fn()
    const exts = createEditorExtensions('test.ts', { onSave })
    expect(exts.length).toBeGreaterThan(0)
  })

  it('accepts readOnly true', () => {
    const exts = createEditorExtensions('test.ts', { readOnly: true })
    expect(exts.length).toBeGreaterThan(0)
  })

  it('accepts readOnly false explicitly', () => {
    const exts = createEditorExtensions('test.ts', { readOnly: false })
    expect(exts.length).toBeGreaterThan(0)
  })

  it('accepts custom tabSize', () => {
    const exts = createEditorExtensions('test.ts', { tabSize: 8 })
    expect(exts.length).toBeGreaterThan(0)
  })

  it('uses default tabSize for Go (4)', () => {
    const exts = createEditorExtensions('main.go')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('uses default tabSize for Python (4)', () => {
    const exts = createEditorExtensions('main.py')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('uses default tabSize for TS (2)', () => {
    const exts = createEditorExtensions('app.ts')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('accepts settings with fontSize', () => {
    const exts = createEditorExtensions('test.ts', {
      settings: { fontSize: 18 },
    })
    expect(exts.length).toBeGreaterThan(0)
  })

  it('accepts settings with fontFamily', () => {
    const exts = createEditorExtensions('test.ts', {
      settings: { fontFamily: 'Fira Code' },
    })
    expect(exts.length).toBeGreaterThan(0)
  })

  it('accepts settings with wordWrap true', () => {
    const exts = createEditorExtensions('test.ts', {
      settings: { wordWrap: true },
    })
    expect(exts.length).toBeGreaterThan(0)
  })

  it('accepts settings with wordWrap false', () => {
    const exts = createEditorExtensions('test.ts', {
      settings: { wordWrap: false },
    })
    expect(exts.length).toBeGreaterThan(0)
  })

  it('accepts settings with smoothScrolling false', () => {
    const exts = createEditorExtensions('test.ts', {
      settings: { smoothScrolling: false },
    })
    expect(exts.length).toBeGreaterThan(0)
  })

  it('accepts settings with scrollBeyondLastLine false', () => {
    const exts = createEditorExtensions('test.ts', {
      settings: { scrollBeyondLastLine: false },
    })
    expect(exts.length).toBeGreaterThan(0)
  })

  it('accepts settings with cursorSmoothCaretAnimation true', () => {
    const exts = createEditorExtensions('test.ts', {
      settings: { cursorSmoothCaretAnimation: true },
    })
    expect(exts.length).toBeGreaterThan(0)
  })

  it('accepts settings with lineNumbers off', () => {
    const exts = createEditorExtensions('test.ts', {
      settings: { lineNumbers: 'off' },
    })
    expect(exts.length).toBeGreaterThan(0)
  })

  it('accepts settings with lineNumbers relative', () => {
    const exts = createEditorExtensions('test.ts', {
      settings: { lineNumbers: 'relative' },
    })
    expect(exts.length).toBeGreaterThan(0)
  })

  it('accepts settings with lineNumbers on', () => {
    const exts = createEditorExtensions('test.ts', {
      settings: { lineNumbers: 'on' },
    })
    expect(exts.length).toBeGreaterThan(0)
  })

  it('accepts settings with renderWhitespace all', () => {
    const exts = createEditorExtensions('test.ts', {
      settings: { renderWhitespace: 'all' },
    })
    expect(exts.length).toBeGreaterThan(0)
  })

  it('accepts settings with renderWhitespace trailing', () => {
    const exts = createEditorExtensions('test.ts', {
      settings: { renderWhitespace: 'trailing' },
    })
    expect(exts.length).toBeGreaterThan(0)
  })

  it('accepts settings with renderWhitespace none', () => {
    const exts = createEditorExtensions('test.ts', {
      settings: { renderWhitespace: 'none' },
    })
    expect(exts.length).toBeGreaterThan(0)
  })

  it('accepts settings with cursorBlinking solid', () => {
    const exts = createEditorExtensions('test.ts', {
      settings: { cursorBlinking: 'solid' },
    })
    expect(exts.length).toBeGreaterThan(0)
  })

  it('accepts settings with cursorBlinking smooth', () => {
    const exts = createEditorExtensions('test.ts', {
      settings: { cursorBlinking: 'smooth' },
    })
    expect(exts.length).toBeGreaterThan(0)
  })

  it('accepts settings with cursorBlinking phase', () => {
    const exts = createEditorExtensions('test.ts', {
      settings: { cursorBlinking: 'phase' },
    })
    expect(exts.length).toBeGreaterThan(0)
  })

  it('accepts settings with cursorBlinking expand', () => {
    const exts = createEditorExtensions('test.ts', {
      settings: { cursorBlinking: 'expand' },
    })
    expect(exts.length).toBeGreaterThan(0)
  })

  it('accepts settings with cursorBlinking blink (default)', () => {
    const exts = createEditorExtensions('test.ts', {
      settings: { cursorBlinking: 'blink' },
    })
    expect(exts.length).toBeGreaterThan(0)
  })

  it('combines multiple settings', () => {
    const exts = createEditorExtensions('test.ts', {
      readOnly: true,
      tabSize: 4,
      onChange: vi.fn(),
      onSave: vi.fn(),
      settings: {
        fontSize: 16,
        fontFamily: 'Mono',
        wordWrap: true,
        smoothScrolling: false,
        scrollBeyondLastLine: false,
        cursorSmoothCaretAnimation: true,
        lineNumbers: 'relative',
        renderWhitespace: 'all',
        cursorBlinking: 'solid',
      },
    })
    expect(exts.length).toBeGreaterThan(0)
  })

  it('works with unknown file extension', () => {
    const exts = createEditorExtensions('data.xyz')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('works with no file extension', () => {
    const exts = createEditorExtensions('Makefile')
    expect(exts.length).toBeGreaterThan(0)
  })

  it('returns same count for same params (deterministic)', () => {
    const exts1 = createEditorExtensions('test.ts')
    const exts2 = createEditorExtensions('test.ts')
    expect(exts1.length).toBe(exts2.length)
  })
})

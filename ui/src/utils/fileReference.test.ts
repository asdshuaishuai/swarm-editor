import { describe, it, expect } from 'vitest'
import {
  parseFileReferences,
  extractFilePaths,
  stripFileReferences,
  formatFileReferences,
  processFileReferences,
  isCursorInFileReference,
  getFileCompletions,
  getLanguageFromExtension,
  highlightFileReferences,
  matchGlob,
  expandGlob,
} from './fileReference'

describe('parseFileReferences', () => {
  it('should parse @File syntax', () => {
    const text = '@File path/to/file.ts'
    const refs = parseFileReferences(text)

    expect(refs).toHaveLength(1)
    expect(refs[0].path).toBe('path/to/file.ts')
    expect(refs[0].type).toBe('file')
    expect(refs[0].raw).toBe('@File path/to/file.ts')
  })

  it('should parse @Files syntax', () => {
    const text = '@Files path/to/file.ts'
    const refs = parseFileReferences(text)

    expect(refs).toHaveLength(1)
    expect(refs[0].path).toBe('path/to/file.ts')
  })

  it('should parse quoted paths', () => {
    const text = '@File "path with spaces/file.ts"'
    const refs = parseFileReferences(text)

    expect(refs).toHaveLength(1)
    expect(refs[0].path).toBe('path with spaces/file.ts')
  })

  it('should parse folder references', () => {
    const text = '@Files folder/'
    const refs = parseFileReferences(text)

    expect(refs).toHaveLength(1)
    expect(refs[0].type).toBe('folder')
  })

  it('should parse glob patterns', () => {
    const text = '@Files **/*.ts'
    const refs = parseFileReferences(text)

    expect(refs).toHaveLength(1)
    expect(refs[0].type).toBe('glob')
  })

  it('should parse multiple references', () => {
    const text = 'Check @File a.ts and @File b.ts'
    const refs = parseFileReferences(text)

    expect(refs).toHaveLength(2)
    expect(refs[0].path).toBe('a.ts')
    expect(refs[1].path).toBe('b.ts')
  })

  it('should be case insensitive', () => {
    const text = '@file path/to/file.ts @FILES other.ts'
    const refs = parseFileReferences(text)

    expect(refs).toHaveLength(2)
  })
})

describe('extractFilePaths', () => {
  it('should extract unique paths', () => {
    const refs = parseFileReferences('@File a.ts @File b.ts @File a.ts')
    const paths = extractFilePaths(refs)

    expect(paths).toHaveLength(2)
    expect(paths).toContain('a.ts')
    expect(paths).toContain('b.ts')
  })
})

describe('stripFileReferences', () => {
  it('should remove @File syntax', () => {
    const text = 'Check @File a.ts and @File b.ts'
    const stripped = stripFileReferences(text)

    expect(stripped).toBe('Check  and')
  })
})

describe('isCursorInFileReference', () => {
  it('should detect cursor after @File', () => {
    const text = '@File '
    const result = isCursorInFileReference(text, 6)

    expect(result.inReference).toBe(true)
    expect(result.query).toBe('')
  })

  it('should detect cursor in path', () => {
    const text = '@File src/comp'
    const result = isCursorInFileReference(text, text.length)

    expect(result.inReference).toBe(true)
    expect(result.query).toBe('src/comp')
  })

  it('should detect cursor inside reference', () => {
    const text = '@File src/component.ts more text'
    const result = isCursorInFileReference(text, 10)

    expect(result.inReference).toBe(true)
  })

  it('should return false when not in reference', () => {
    const text = 'Hello world'
    const result = isCursorInFileReference(text, 5)

    expect(result.inReference).toBe(false)
  })
})

describe('getFileCompletions', () => {
  const files = [
    'src/components/Button.tsx',
    'src/components/Input.tsx',
    'src/utils/helpers.ts',
    'src/App.tsx',
  ]

  it('should filter files by query', () => {
    const completions = getFileCompletions('Button', files)

    expect(completions).toHaveLength(1)
    expect(completions[0]).toBe('src/components/Button.tsx')
  })

  it('should match partial paths', () => {
    const completions = getFileCompletions('src/comp', files)

    expect(completions.length).toBeGreaterThan(0)
    expect(completions.every((f) => f.includes('comp'))).toBe(true)
  })

  it('should limit results', () => {
    const completions = getFileCompletions('src', files, 2)

    expect(completions.length).toBeLessThanOrEqual(2)
  })

  it('should prioritize exact matches', () => {
    const filesWithExact = ['App.tsx', 'src/App.tsx', 'src/components/App.tsx']
    const completions = getFileCompletions('App.tsx', filesWithExact)

    expect(completions[0]).toBe('App.tsx')
  })
})

describe('getLanguageFromExtension', () => {
  it('should map TypeScript extensions', () => {
    expect(getLanguageFromExtension('ts')).toBe('typescript')
    expect(getLanguageFromExtension('tsx')).toBe('typescript')
  })

  it('should map JavaScript extensions', () => {
    expect(getLanguageFromExtension('js')).toBe('javascript')
    expect(getLanguageFromExtension('jsx')).toBe('javascript')
  })

  it('should map common languages', () => {
    expect(getLanguageFromExtension('go')).toBe('go')
    expect(getLanguageFromExtension('py')).toBe('python')
    expect(getLanguageFromExtension('rs')).toBe('rust')
    expect(getLanguageFromExtension('java')).toBe('java')
  })

  it('should return extension for unknown languages', () => {
    expect(getLanguageFromExtension('xyz')).toBe('xyz')
  })
})

describe('highlightFileReferences', () => {
  it('should return single text segment when no references', () => {
    const result = highlightFileReferences('Hello world')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ type: 'text', content: 'Hello world' })
  })

  it('should split text into segments', () => {
    const result = highlightFileReferences('Check @File a.ts for details')
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ type: 'text', content: 'Check ' })
    expect(result[1]).toEqual({ type: 'reference', content: '@File a.ts' })
    expect(result[2]).toEqual({ type: 'text', content: ' for details' })
  })
})

describe('matchGlob', () => {
  it('should match single asterisk', () => {
    expect(matchGlob('*.ts', 'file.ts')).toBe(true)
    expect(matchGlob('*.ts', 'file.go')).toBe(false)
    expect(matchGlob('src/*.ts', 'src/file.ts')).toBe(true)
    expect(matchGlob('src/*.ts', 'lib/file.ts')).toBe(false)
  })

  it('should match double asterisk', () => {
    expect(matchGlob('**/*.ts', 'file.ts')).toBe(true)
    expect(matchGlob('**/*.ts', 'src/file.ts')).toBe(true)
    expect(matchGlob('**/*.ts', 'src/lib/file.ts')).toBe(true)
    expect(matchGlob('**/*.ts', 'src/file.go')).toBe(false)
  })

  it('should match question mark', () => {
    expect(matchGlob('file?.ts', 'file1.ts')).toBe(true)
    expect(matchGlob('file?.ts', 'file12.ts')).toBe(false)
    expect(matchGlob('file?.ts', 'file.ts')).toBe(false)
  })

  it('should be case insensitive', () => {
    expect(matchGlob('*.TS', 'file.ts')).toBe(true)
    expect(matchGlob('**/*.TS', 'src/file.TS')).toBe(true)
  })

  it('should handle complex patterns', () => {
    expect(matchGlob('src/**/*.test.ts', 'src/utils/helper.test.ts')).toBe(true)
    expect(matchGlob('src/**/*.test.ts', 'src/helper.test.ts')).toBe(true)
    expect(matchGlob('src/**/*.test.ts', 'lib/helper.test.ts')).toBe(false)
  })
})

describe('expandGlob', () => {
  const files = [
    'src/App.tsx',
    'src/components/Button.tsx',
    'src/components/Input.tsx',
    'src/utils/helpers.ts',
    'internal/api/handler.go',
    'internal/api/workspace.go',
    'README.md',
  ]

  it('should expand *.tsx pattern', () => {
    const result = expandGlob('*.tsx', files)
    expect(result).toHaveLength(0) // No files in root with .tsx
  })

  it('should expand **/*.tsx pattern', () => {
    const result = expandGlob('**/*.tsx', files)
    expect(result.length).toBe(3)
    expect(result).toContain('src/App.tsx')
    expect(result).toContain('src/components/Button.tsx')
    expect(result).toContain('src/components/Input.tsx')
  })

  it('should expand **/*.go pattern', () => {
    const result = expandGlob('**/*.go', files)
    expect(result.length).toBe(2)
    expect(result).toContain('internal/api/handler.go')
    expect(result).toContain('internal/api/workspace.go')
  })

  it('should expand src/**/*.ts pattern', () => {
    const result = expandGlob('src/**/*.ts', files)
    expect(result.length).toBe(1)
    expect(result).toContain('src/utils/helpers.ts')
  })

  it('should return empty array for no matches', () => {
    const result = expandGlob('**/*.xyz', files)
    expect(result).toHaveLength(0)
  })
})

describe('formatFileReferences', () => {
  it('replaces reference with formatted code block', () => {
    const text = 'Look at @File app.ts'
    const refs = parseFileReferences(text)
    const contents = new Map([['app.ts', 'console.log("hello")']])
    const result = formatFileReferences(text, refs, contents)
    expect(result).toContain('```typescript:app.ts')
    expect(result).toContain('console.log("hello")')
    expect(result).not.toContain('@File')
  })

  it('removes reference if content not available', () => {
    const text = 'See @File missing.ts here'
    const refs = parseFileReferences(text)
    const result = formatFileReferences(text, refs, new Map())
    expect(result).not.toContain('@File')
    expect(result).toContain('here')
  })

  it('handles multiple references', () => {
    const text = '@File a.ts and @File b.ts'
    const refs = parseFileReferences(text)
    const contents = new Map([['a.ts', 'codeA'], ['b.ts', 'codeB']])
    const result = formatFileReferences(text, refs, contents)
    expect(result).toContain('codeA')
    expect(result).toContain('codeB')
  })
})

describe('processFileReferences', () => {
  it('returns full context with references', () => {
    const text = 'Check @File app.ts'
    const contents = new Map([['app.ts', 'code']])
    const ctx = processFileReferences(text, contents)
    expect(ctx.hasReferences).toBe(true)
    expect(ctx.filePaths).toEqual(['app.ts'])
    expect(ctx.formattedPrompt).toContain('```typescript:app.ts')
  })

  it('returns no references context', () => {
    const ctx = processFileReferences('no refs', new Map())
    expect(ctx.hasReferences).toBe(false)
    expect(ctx.filePaths).toEqual([])
    expect(ctx.formattedPrompt).toBe('no refs')
  })
})

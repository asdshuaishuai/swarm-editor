import { describe, it, expect, vi } from 'vitest'
import { getOrCreateModel } from './monacoModelCache'

function makeMonaco() {
  const models = new Map<string, any>()
  return {
    Uri: { file: (p: string) => p },
    editor: {
      getModel: vi.fn((uri: string) => models.get(uri) || null),
      createModel: vi.fn((content: string, _lang: string, uri: string) => {
        const m = { uri, content, disposed: false }
        models.set(uri, m)
        return m
      }),
    },
    _models: models,
  }
}

describe('getOrCreateModel', () => {
  it('returns cached model from modelCache', () => {
    const monaco = makeMonaco()
    const modelCache = new Map<string, any>()
    const cached = { uri: '/a.ts', content: 'hello' }
    modelCache.set('/a.ts', cached)

    const result = getOrCreateModel({ path: '/a.ts', content: 'x', lang: 'typescript', monaco, modelCache })
    expect(result).toBe(cached)
    expect(monaco.editor.getModel).not.toHaveBeenCalled()
  })

  it('finds existing model via monaco.editor.getModel', () => {
    const monaco = makeMonaco()
    const existing = { uri: '/b.ts', content: 'old' }
    monaco._models.set('/b.ts', existing)
    const modelCache = new Map<string, any>()

    const result = getOrCreateModel({ path: '/b.ts', content: 'new', lang: 'ts', monaco, modelCache })
    expect(result).toBe(existing)
    expect(modelCache.get('/b.ts')).toBe(existing)
  })

  it('creates new model when not cached and not existing', () => {
    const monaco = makeMonaco()
    const modelCache = new Map<string, any>()

    const result = getOrCreateModel({ path: '/c.ts', content: 'fresh', lang: 'ts', monaco, modelCache })
    expect(result.content).toBe('fresh')
    expect(result.uri).toBe('/c.ts')
    expect(monaco.editor.createModel).toHaveBeenCalledWith('fresh', 'ts', '/c.ts')
    expect(modelCache.get('/c.ts')).toBe(result)
  })

  it('caches newly created model', () => {
    const monaco = makeMonaco()
    const modelCache = new Map<string, any>()

    const first = getOrCreateModel({ path: '/d.ts', content: 'x', lang: 'ts', monaco, modelCache })
    const second = getOrCreateModel({ path: '/d.ts', content: 'y', lang: 'ts', monaco, modelCache })
    expect(first).toBe(second)
    expect(monaco.editor.createModel).toHaveBeenCalledTimes(1)
  })
})

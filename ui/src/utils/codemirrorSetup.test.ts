import { describe, it, expect } from 'vitest'
import { getLanguageExtension } from './codemirrorSetup'

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
})

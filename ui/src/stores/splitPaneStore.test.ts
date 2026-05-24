import { describe, it, expect, beforeEach } from 'vitest'
import { useSplitPaneStore } from './splitPaneStore'

describe('splitPaneStore', () => {
  beforeEach(() => {
    useSplitPaneStore.setState({
      splitDirection: 'none',
      activePaneId: 'main',
      paneFiles: { main: null },
    })
  })

  it('starts with no split', () => {
    expect(useSplitPaneStore.getState().splitDirection).toBe('none')
    expect(useSplitPaneStore.getState().activePaneId).toBe('main')
  })

  it('setActivePane changes active pane', () => {
    useSplitPaneStore.getState().setActivePane('secondary')
    expect(useSplitPaneStore.getState().activePaneId).toBe('secondary')
  })

  it('setPaneFile sets file for a pane', () => {
    useSplitPaneStore.getState().setPaneFile('main', '/src/app.ts')
    expect(useSplitPaneStore.getState().paneFiles.main).toBe('/src/app.ts')
  })

  it('setPaneFile can clear a file', () => {
    useSplitPaneStore.getState().setPaneFile('main', '/src/app.ts')
    useSplitPaneStore.getState().setPaneFile('main', null)
    expect(useSplitPaneStore.getState().paneFiles.main).toBeNull()
  })

  it('toggleSplit opens horizontal split', () => {
    useSplitPaneStore.getState().setPaneFile('main', '/src/app.ts')
    useSplitPaneStore.getState().toggleSplit()
    expect(useSplitPaneStore.getState().splitDirection).toBe('horizontal')
    expect(useSplitPaneStore.getState().paneFiles.secondary).toBe('/src/app.ts')
    expect(useSplitPaneStore.getState().activePaneId).toBe('main')
  })

  it('toggleSplit closes split when already open', () => {
    useSplitPaneStore.getState().setPaneFile('main', '/src/app.ts')
    useSplitPaneStore.getState().toggleSplit()
    useSplitPaneStore.getState().toggleSplit()
    expect(useSplitPaneStore.getState().splitDirection).toBe('none')
    expect(useSplitPaneStore.getState().paneFiles.secondary).toBeUndefined()
  })

  it('toggleSplit preserves main file on close', () => {
    useSplitPaneStore.getState().setPaneFile('main', '/src/a.ts')
    useSplitPaneStore.getState().toggleSplit()
    useSplitPaneStore.getState().setPaneFile('secondary', '/src/b.ts')
    useSplitPaneStore.getState().toggleSplit() // close
    expect(useSplitPaneStore.getState().paneFiles.main).toBe('/src/a.ts')
  })

  it('toggleSplit falls back to secondary file if main is null', () => {
    useSplitPaneStore.getState().setPaneFile('main', '/src/a.ts')
    useSplitPaneStore.getState().toggleSplit()
    useSplitPaneStore.getState().setPaneFile('main', null)
    useSplitPaneStore.getState().setPaneFile('secondary', '/src/b.ts')
    useSplitPaneStore.getState().toggleSplit() // close
    expect(useSplitPaneStore.getState().paneFiles.main).toBe('/src/b.ts')
  })

  it('closeSplit resets to main pane', () => {
    useSplitPaneStore.getState().setPaneFile('main', '/src/a.ts')
    useSplitPaneStore.getState().toggleSplit()
    useSplitPaneStore.getState().setActivePane('secondary')
    useSplitPaneStore.getState().closeSplit()
    expect(useSplitPaneStore.getState().splitDirection).toBe('none')
    expect(useSplitPaneStore.getState().activePaneId).toBe('main')
  })

  it('closeSplit preserves file', () => {
    useSplitPaneStore.getState().setPaneFile('main', '/src/app.ts')
    useSplitPaneStore.getState().toggleSplit()
    useSplitPaneStore.getState().closeSplit()
    expect(useSplitPaneStore.getState().paneFiles.main).toBe('/src/app.ts')
  })

  it('setSplitDirection sets direction directly', () => {
    useSplitPaneStore.getState().setSplitDirection('horizontal')
    expect(useSplitPaneStore.getState().splitDirection).toBe('horizontal')
  })
})

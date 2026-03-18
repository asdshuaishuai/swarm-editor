import { describe, it, expect } from 'vitest'
import {
  useSettings,
  useTheme,
  useTauriEvents,
  useTauriEventStatus,
} from './index'

describe('hooks/index.ts', () => {
  it('should export useSettings', () => {
    expect(useSettings).toBeDefined()
    expect(typeof useSettings).toBe('function')
  })

  it('should export useTheme', () => {
    expect(useTheme).toBeDefined()
    expect(typeof useTheme).toBe('function')
  })

  it('should export useTauriEvents', () => {
    expect(useTauriEvents).toBeDefined()
    expect(typeof useTauriEvents).toBe('function')
  })

  it('should export useTauriEventStatus', () => {
    expect(useTauriEventStatus).toBeDefined()
    expect(typeof useTauriEventStatus).toBe('function')
  })
})
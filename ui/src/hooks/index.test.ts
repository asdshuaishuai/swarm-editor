import { describe, it, expect } from 'vitest'
import {
  useSettings,
  useTheme,
  useACPEvents,
  useACPEventStatus,
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

  it('should export useACPEvents', () => {
    expect(useACPEvents).toBeDefined()
    expect(typeof useACPEvents).toBe('function')
  })

  it('should export useACPEventStatus', () => {
    expect(useACPEventStatus).toBeDefined()
    expect(typeof useACPEventStatus).toBe('function')
  })
})

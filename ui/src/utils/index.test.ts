import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  cn,
  generateId,
  truncate,
  capitalize,
  formatBytes,
  formatDuration,
  formatRelativeTime,
  groupBy,
  unique,
  chunk,
  pick,
  omit,
  debounce,
  throttle,
  sleep,
  isDefined,
  isBrowser,
  logger,
} from './index'

describe('cn', () => {
  it('should merge class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('should handle undefined values', () => {
    expect(cn('foo', undefined, 'bar')).toBe('foo bar')
  })

  it('should handle falsy values', () => {
    const includeBar = false; expect(cn('foo', includeBar ? 'bar' : '')).toBe('foo')
  })

  it('should resolve Tailwind conflicts', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2')
  })

  it('should handle conditional classes', () => {
    const includeIncluded = true; const includeExcluded = false; expect(cn('base', includeIncluded ? 'included' : '', includeExcluded ? 'excluded' : '')).toBe('base included')
  })
})

describe('generateId', () => {
  it('should generate a unique ID', () => {
    const id1 = generateId()
    const id2 = generateId()
    expect(id1).not.toBe(id2)
  })

  it('should include prefix when provided', () => {
    const id = generateId('agent')
    expect(id.startsWith('agent-')).toBe(true)
  })

  it('should have expected length', () => {
    const id = generateId()
    expect(id.length).toBeGreaterThan(10)
  })
})

describe('truncate', () => {
  it('should return original string if shorter than max', () => {
    expect(truncate('short', 10)).toBe('short')
  })

  it('should truncate long strings with ellipsis', () => {
    expect(truncate('this is a very long string', 10)).toBe('this is...')
  })

  it('should handle exact length', () => {
    expect(truncate('exactly', 7)).toBe('exactly')
  })
})

describe('capitalize', () => {
  it('should capitalize first letter', () => {
    expect(capitalize('hello')).toBe('Hello')
  })

  it('should not change already capitalized strings', () => {
    expect(capitalize('WORLD')).toBe('WORLD')
  })

  it('should handle empty string', () => {
    expect(capitalize('')).toBe('')
  })
})

describe('formatBytes', () => {
  it('should format 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('should format kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
  })

  it('should format megabytes', () => {
    expect(formatBytes(1048576)).toBe('1 MB')
  })
})

describe('formatDuration', () => {
  it('should format milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms')
  })

  it('should format seconds', () => {
    expect(formatDuration(1500)).toBe('1.5s')
  })

  it('should format minutes', () => {
    expect(formatDuration(90000)).toBe('1.5m')
  })

  it('should format hours', () => {
    expect(formatDuration(5400000)).toBe('1.5h')
  })
})

describe('formatRelativeTime', () => {
  it('should format just now', () => {
    const now = new Date()
    expect(formatRelativeTime(now)).toBe('just now')
  })

  it('should format minutes ago', () => {
    const past = new Date(Date.now() - 5 * 60 * 1000)
    expect(formatRelativeTime(past)).toBe('5m ago')
  })

  it('should format hours ago', () => {
    const past = new Date(Date.now() - 2 * 60 * 60 * 1000)
    expect(formatRelativeTime(past)).toBe('2h ago')
  })

  it('should format days ago', () => {
    const past = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    expect(formatRelativeTime(past)).toBe('3d ago')
  })

  it('should format as date for older dates', () => {
    const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
    expect(formatRelativeTime(past)).toMatch(/^\d+\/\d+\/\d+$/)
  })

  it('should handle string date input', () => {
    const past = new Date(Date.now() - 30 * 1000).toISOString()
    expect(formatRelativeTime(past)).toBe('just now')
  })
})

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should debounce function calls', async () => {
    let callCount = 0
    const fn = debounce(() => {
      callCount++
    }, 100)

    fn()
    fn()
    fn()

    expect(callCount).toBe(0)

    vi.advanceTimersByTime(150)
    expect(callCount).toBe(1)
  })

  it('should pass arguments to debounced function', () => {
    let receivedArg: unknown
    const fn = debounce((arg: unknown) => {
      receivedArg = arg
    }, 100)

    fn(42)
    vi.advanceTimersByTime(150)
    expect(receivedArg).toBe(42)
  })
})

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should throttle function calls', () => {
    let callCount = 0
    const fn = throttle(() => {
      callCount++
    }, 100)

    fn()
    fn()
    fn()

    expect(callCount).toBe(1)
    vi.advanceTimersByTime(150)
    fn()
    expect(callCount).toBe(2)
  })
})

describe('sleep', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should resolve after specified time', async () => {
    const promise = sleep(1000)
    vi.advanceTimersByTime(1000)
    await expect(promise).resolves.toBeUndefined()
  })
})

describe('isDefined', () => {
  it('should return true for defined values', () => {
    expect(isDefined(1)).toBe(true)
    expect(isDefined('string')).toBe(true)
    expect(isDefined({})).toBe(true)
    expect(isDefined([])).toBe(true)
  })

  it('should return false for null', () => {
    expect(isDefined(null)).toBe(false)
  })

  it('should return false for undefined', () => {
    expect(isDefined(undefined)).toBe(false)
  })
})

describe('isBrowser', () => {
  it('should return true in test environment', () => {
    // jsdom provides window, so this should be true
    expect(isBrowser()).toBe(true)
  })
})

describe('logger', () => {
  it('should log debug messages in DEV mode', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // In test environment, DEV is typically true
    logger.debug('TestTag', 'debug message')

    // Verify console.warn was called (DEV mode)
    expect(consoleSpy).toHaveBeenCalledWith('[TestTag]', 'debug message')

    consoleSpy.mockRestore()
  })

  it('should not log debug messages in production mode', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Stub DEV to be false
    vi.stubEnv('DEV', false)

    // Re-import to get the new env value
    vi.resetModules()
    const { logger: prodLogger } = await import('./index')

    // Clear any calls from import
    consoleSpy.mockClear()

    prodLogger.debug('TestTag', 'debug message')

    // In production mode, debug should not call console.warn
    expect(consoleSpy).not.toHaveBeenCalled()

    vi.unstubAllEnvs()
    consoleSpy.mockRestore()
  })

  it('should log info messages', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    logger.info('TestTag', 'info message')

    expect(consoleSpy).toHaveBeenCalledWith('[TestTag]', 'info message')

    consoleSpy.mockRestore()
  })

  it('should log warn messages', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    logger.warn('TestTag', 'warn message')

    expect(consoleSpy).toHaveBeenCalledWith('[TestTag]', 'warn message')

    consoleSpy.mockRestore()
  })

  it('should log error messages', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    logger.error('TestTag', 'error message')

    expect(consoleSpy).toHaveBeenCalledWith('[TestTag]', 'error message')

    consoleSpy.mockRestore()
  })
})

describe('type assertions', () => {
  it('should return the correct type', () => {
    expect(typeof capitalize('test')).toBe('string')
    expect(typeof formatBytes(1024)).toBe('string')
    expect(typeof formatDuration(1000)).toBe('string')
    expect(typeof formatRelativeTime(new Date())).toBe('string')
  })
})

describe('object functions', () => {
  it('pick should extract specific keys', () => {
    const obj = { a: 1, b: 2, c: 3 }
    expect(pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 })
  })

  it('pick should handle non-existent keys', () => {
    const obj = { a: 1, b: 2 }
    expect(pick(obj, ['a', 'c' as keyof typeof obj])).toEqual({ a: 1 })
  })

  it('omit should remove specific keys', () => {
    const obj = { a: 1, b: 2, c: 3 }
    expect(omit(obj, ['b'])).toEqual({ a: 1, c: 3 })
  })
})

describe('array functions', () => {
  it('groupBy should group items by key', () => {
    const items = [
      { type: 'a', value: 1 },
      { type: 'b', value: 2 },
      { type: 'a', value: 3 },
    ]
    const grouped = groupBy(items, 'type')
    expect(grouped['a']).toHaveLength(2)
    expect(grouped['b']).toHaveLength(1)
  })

  it('unique should remove duplicates', () => {
    expect(unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3])
    expect(unique(['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('chunk should split array into chunks', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([1, 2, 3], 3)).toEqual([[1, 2, 3]])
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { act } from '@testing-library/react'
import React from 'react'
import { useAutoScroll } from './useAutoScroll'

function setRef(result: { current: { containerRef: React.RefObject<HTMLDivElement | null> } }, el: object) {
  ;(result.current.containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el as HTMLDivElement
}

describe('useAutoScroll', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns containerRef, autoScroll, and handleScroll', () => {
    const { result } = renderHook(() => useAutoScroll([]))
    expect(result.current.containerRef).toBeDefined()
    expect(result.current.autoScroll).toBe(true)
    expect(typeof result.current.handleScroll).toBe('function')
  })

  it('autoScroll defaults to true', () => {
    const { result } = renderHook(() => useAutoScroll([]))
    expect(result.current.autoScroll).toBe(true)
  })

  it('sets scrollTop to scrollHeight when autoScroll is true and data changes', () => {
    const mockElement = {
      scrollTop: 0,
      scrollHeight: 500,
      clientHeight: 100,
    }
    const { result, rerender } = renderHook(
      ({ data }: { data: string[] }) => useAutoScroll(data),
      { initialProps: { data: [] as string[] } }
    )
    setRef(result, mockElement)

    act(() => {
      rerender({ data: ['a', 'b'] })
    })

    expect(mockElement.scrollTop).toBe(500)
  })

  it('does not scroll when autoScroll is false', () => {
    const mockElement = {
      scrollTop: 0,
      scrollHeight: 500,
      clientHeight: 100,
    }
    const { result, rerender } = renderHook(
      ({ data }: { data: string[] }) => useAutoScroll(data),
      { initialProps: { data: [] as string[] } }
    )
    setRef(result, mockElement)

    act(() => {
      result.current.handleScroll()
    })

    expect(result.current.autoScroll).toBe(false)

    const prevScrollTop = mockElement.scrollTop
    act(() => {
      rerender({ data: ['a', 'b', 'c'] })
    })

    expect(mockElement.scrollTop).toBe(prevScrollTop)
  })

  it('handleScroll enables autoScroll when near bottom', () => {
    const mockElement = {
      scrollTop: 450,
      scrollHeight: 500,
      clientHeight: 48,
    }
    const { result } = renderHook(() => useAutoScroll([]))
    setRef(result, mockElement)

    act(() => {
      result.current.handleScroll()
    })

    expect(result.current.autoScroll).toBe(true)
  })

  it('handleScroll disables autoScroll when far from bottom', () => {
    const mockElement = {
      scrollTop: 100,
      scrollHeight: 500,
      clientHeight: 100,
    }
    const { result } = renderHook(() => useAutoScroll([]))
    setRef(result, mockElement)

    act(() => {
      result.current.handleScroll()
    })

    expect(result.current.autoScroll).toBe(false)
  })

  it('handleScroll is a no-op when containerRef is null', () => {
    const { result } = renderHook(() => useAutoScroll([]))
    expect(() => {
      result.current.handleScroll()
    }).not.toThrow()
    expect(result.current.autoScroll).toBe(true)
  })

  it('autoScroll re-enables when scrolled back to bottom', () => {
    const mockElement = {
      scrollTop: 100,
      scrollHeight: 500,
      clientHeight: 100,
    }
    const { result } = renderHook(() => useAutoScroll([]))
    setRef(result, mockElement)

    act(() => {
      result.current.handleScroll()
    })
    expect(result.current.autoScroll).toBe(false)

    mockElement.scrollTop = 455
    act(() => {
      result.current.handleScroll()
    })
    expect(result.current.autoScroll).toBe(true)
  })
})

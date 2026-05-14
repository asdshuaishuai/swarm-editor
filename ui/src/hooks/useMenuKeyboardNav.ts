import { useCallback, useEffect, useRef } from 'react'

/**
 * Keyboard navigation for W3C menu pattern (role="menu").
 * ArrowUp/Down cycles between menuitems, Home/End jumps, Escape/Tab closes.
 * Auto-focuses the first menuitem once when the menu opens.
 *
 * Usage:
 *   const menuRef = useRef<HTMLDivElement>(null)
 *   const handleKeyDown = useMenuKeyboardNav(menuRef, onClose)
 *   <div ref={menuRef} role="menu" onKeyDown={handleKeyDown}>
 *     <button role="menuitem">Item 1</button>
 *   </div>
 */
export function useMenuKeyboardNav(
  containerRef: React.RefObject<HTMLElement | null>,
  onClose?: () => void
) {
  const onCloseRef = useRef(onClose)
  const hasFocusedRef = useRef(false)

  // Update ref after render to avoid ESLint warning
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // Auto-focus first menuitem once when menu opens
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      hasFocusedRef.current = false
      return
    }
    if (hasFocusedRef.current) return
    hasFocusedRef.current = true
    const firstItem = container.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')
    if (firstItem) {
      requestAnimationFrame(() => firstItem.focus())
    }
  })

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const container = (e.currentTarget as HTMLElement)
    const items = Array.from(container.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'))
    if (items.length === 0) return

    const focusedIdx = items.indexOf(document.activeElement as HTMLElement)

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const nextIdx = focusedIdx < 0 ? 0 : (focusedIdx + 1) % items.length
      items[nextIdx].focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prevIdx = focusedIdx <= 0 ? items.length - 1 : focusedIdx - 1
      items[prevIdx].focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      items[0].focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      items[items.length - 1].focus()
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault()
      onCloseRef.current?.()
    }
  }, [])

  return handleKeyDown
}

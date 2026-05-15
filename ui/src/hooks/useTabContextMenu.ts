import { useEffect, type RefObject } from 'react'
import { useMenuKeyboardNav } from './useMenuKeyboardNav'

interface TabContextMenuState {
  visible: boolean
  x: number
  y: number
  path: string | null
}

interface UseTabContextMenuOptions {
  tabContextMenu: TabContextMenuState
  setTabContextMenu: (state: TabContextMenuState) => void
  tabContextMenuRef: RefObject<HTMLDivElement | null>
}

export function useTabContextMenu(options: UseTabContextMenuOptions) {
  const { tabContextMenu, setTabContextMenu, tabContextMenuRef } = options

  const handleTabContextMenu = (e: React.MouseEvent, path: string) => {
    setTabContextMenu({ visible: true, x: e.clientX, y: e.clientY, path })
  }

  const closeTabContextMenu = () => {
    setTabContextMenu({ visible: false, x: 0, y: 0, path: null })
  }

  const tabMenuKeyDown = useMenuKeyboardNav(tabContextMenuRef, closeTabContextMenu)

  // Close tab context menu on click outside / Escape
  useEffect(() => {
    if (!tabContextMenu.visible) return
    const handleClick = () => closeTabContextMenu()
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') closeTabContextMenu() }
    const stopNativePropagation = (e: Event) => e.stopPropagation()
    const menuRef = tabContextMenuRef.current
    document.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleEscape)
    menuRef?.addEventListener('click', stopNativePropagation, true)
    return () => {
      document.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleEscape)
      menuRef?.removeEventListener('click', stopNativePropagation, true)
    }
  }, [tabContextMenu.visible])

  return { handleTabContextMenu, closeTabContextMenu, tabMenuKeyDown }
}

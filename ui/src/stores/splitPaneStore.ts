import { create } from 'zustand'

export type SplitDirection = 'none' | 'horizontal'

export interface SplitPaneStore {
  splitDirection: SplitDirection
  activePaneId: string
  // Per-pane current file (which file each pane is showing)
  paneFiles: Record<string, string | null>

  setActivePane: (paneId: string) => void
  setPaneFile: (paneId: string, filePath: string | null) => void
  setSplitDirection: (direction: SplitDirection) => void
  toggleSplit: (direction?: SplitDirection) => void
  closeSplit: () => void
}

export const useSplitPaneStore = create<SplitPaneStore>((set, get) => ({
  splitDirection: 'none',
  activePaneId: 'main',
  paneFiles: { main: null },

  setActivePane: (paneId) => set({ activePaneId: paneId }),

  setPaneFile: (paneId, filePath) => set((state) => ({
    paneFiles: { ...state.paneFiles, [paneId]: filePath },
  })),

  setSplitDirection: (direction) => set({ splitDirection: direction }),

  toggleSplit: (direction = 'horizontal') => {
    const { splitDirection, paneFiles } = get()
    if (splitDirection !== 'none') {
      // Already split — close it
      set({ splitDirection: 'none', paneFiles: { main: paneFiles.main || paneFiles.secondary || null } })
    } else {
      // Open split — secondary pane shows same file as main
      set({
        splitDirection: direction,
        activePaneId: 'main',
        paneFiles: { main: paneFiles.main, secondary: paneFiles.main },
      })
    }
  },

  closeSplit: () => {
    const { paneFiles } = get()
    // P1 fix: Reset activePaneId to 'main' (was leaving it at 'secondary' if user was focused there)
    set({ splitDirection: 'none', activePaneId: 'main', paneFiles: { main: paneFiles.main || paneFiles.secondary || null } })
  },
}))

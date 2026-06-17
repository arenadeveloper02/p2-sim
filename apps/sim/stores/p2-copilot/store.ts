import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface P2CopilotPosition {
  x: number
  y: number
}

interface P2CopilotStore {
  isOpen: boolean
  position: P2CopilotPosition
  width: number
  height: number
  setIsOpen: (open: boolean) => void
  toggleOpen: () => void
  setPosition: (position: P2CopilotPosition) => void
  setDimensions: (dimensions: { width: number; height: number }) => void
}

const DEFAULT_WIDTH = 400
const DEFAULT_HEIGHT = 520

function defaultPosition(): P2CopilotPosition {
  if (typeof window === 'undefined') return { x: 100, y: 100 }
  const panelWidth = Number.parseInt(
    getComputedStyle(document.documentElement).getPropertyValue('--panel-width') || '0'
  )
  return {
    x: Math.max(16, window.innerWidth - panelWidth - DEFAULT_WIDTH - 24),
    y: Math.max(16, window.innerHeight - DEFAULT_HEIGHT - 96),
  }
}

export const useP2CopilotStore = create<P2CopilotStore>()(
  persist(
    (set) => ({
      isOpen: false,
      position: defaultPosition(),
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      setIsOpen: (open) => set({ isOpen: open }),
      toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
      setPosition: (position) => set({ position }),
      setDimensions: (dimensions) =>
        set({ width: dimensions.width, height: dimensions.height }),
    }),
    { name: 'p2-copilot-panel' }
  )
)

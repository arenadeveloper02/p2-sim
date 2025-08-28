import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UiFlagsState {
  // Controls if global actions are disabled
  globalActionsDisabled: boolean
  setGlobalActionsDisabled: (disabled: boolean) => void
  toggleGlobalActionsDisabled: () => void
}

export const useUiFlagsStore = create<UiFlagsState>()(
  persist(
    (set) => ({
      globalActionsDisabled: false,
      setGlobalActionsDisabled: (disabled) => set({ globalActionsDisabled: disabled }),
      toggleGlobalActionsDisabled: () =>
        set((state) => ({ globalActionsDisabled: !state.globalActionsDisabled })),
    }),
    {
      name: 'ui-flags',
    }
  )
)

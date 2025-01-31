import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { ConsoleStore, ConsoleEntry } from './types'

const MAX_ENTRIES = 50

export const useConsoleStore = create<ConsoleStore>()(
  devtools(
    persist(
      (set, get) => ({
        entries: [],

        addConsole: (entry) => {
          set((state) => {
            const newEntry: ConsoleEntry = {
              ...entry,
              id: crypto.randomUUID(),
              timestamp: new Date().toISOString(),
            }
            
            // Keep only the last MAX_ENTRIES
            const newEntries = [newEntry, ...state.entries].slice(0, MAX_ENTRIES)
            
            return { entries: newEntries }
          })
        },

        clearConsole: () => set({ entries: [] }),

        getWorkflowEntries: (workflowId) => {
          return get().entries.filter((entry) => entry.workflowId === workflowId)
        },
      }),
      {
        name: 'console-store',
      }
    )
  )
)
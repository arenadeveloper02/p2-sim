import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type {
  CreateKbApprovalRequest,
  KbApprovalGroup,
  KbApprovalWithDetails,
  UpdateKbApprovalRequest,
} from '@/lib/kb-approval/types'

interface KbApprovalState {
  // State
  individualApprovals: KbApprovalWithDetails[]
  groupedApprovals: KbApprovalGroup[]
  loading: boolean
  error: string | null

  // Actions
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setIndividualApprovals: (requests: KbApprovalWithDetails[]) => void
  setGroupedApprovals: (groups: KbApprovalGroup[]) => void
  addApprovalRequest: (request: KbApprovalWithDetails) => void
  updateApprovalRequest: (id: string, updates: Partial<KbApprovalWithDetails>) => void
  removeApprovalRequest: (id: string) => void

  // API Actions
  fetchApprovals: (kbId: string) => Promise<void>
  createApproval: (
    data: CreateKbApprovalRequest
  ) => Promise<{ groupingId: string; approvals: KbApprovalWithDetails[] } | null>
  updateApproval: (
    id: string,
    data: UpdateKbApprovalRequest
  ) => Promise<KbApprovalWithDetails | null>
  clearApprovals: () => void
}

export const useKbApprovalStore = create<KbApprovalState>()(
  devtools(
    (set, get) => ({
      // Initial state
      individualApprovals: [],
      groupedApprovals: [],
      loading: false,
      error: null,

      // Basic state setters
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),
      setIndividualApprovals: (individualApprovals) => set({ individualApprovals }),
      setGroupedApprovals: (groupedApprovals) => set({ groupedApprovals }),
      addApprovalRequest: (request) =>
        set((state) => ({
          individualApprovals: [...state.individualApprovals, request],
        })),
      updateApprovalRequest: (id, updates) =>
        set((state) => ({
          individualApprovals: state.individualApprovals.map((request) =>
            request.id === id ? { ...request, ...updates } : request
          ),
        })),
      removeApprovalRequest: (id) =>
        set((state) => ({
          individualApprovals: state.individualApprovals.filter((request) => request.id !== id),
        })),

      // API Actions
      fetchApprovals: async (kbId: string) => {
        set({ loading: true, error: null })

        try {
          const response = await fetch(`/api/kb-approval?kbId=${encodeURIComponent(kbId)}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || 'Failed to fetch approval requests')
          }

          const result = await response.json()
          set({
            individualApprovals: result.data.individual,
            groupedApprovals: result.data.grouped,
            loading: false,
          })
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
          set({ error: errorMessage, loading: false })
          console.error('Error fetching KB approvals:', error)
        }
      },

      createApproval: async (data: CreateKbApprovalRequest) => {
        set({ loading: true, error: null })

        try {
          const response = await fetch('/api/kb-approval', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || 'Failed to create approval request')
          }

          const result = await response.json()
          const { groupingId, approvals } = result.data

          // Add to state
          set((state) => ({
            individualApprovals: [...state.individualApprovals, ...approvals],
            loading: false,
          }))

          return { groupingId, approvals }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
          set({ error: errorMessage, loading: false })
          console.error('Error creating KB approval:', error)
          return null
        }
      },

      updateApproval: async (id: string, data: UpdateKbApprovalRequest) => {
        set({ loading: true, error: null })

        try {
          const response = await fetch(`/api/kb-approval/${id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || 'Failed to update approval request')
          }

          const result = await response.json()
          const updatedApproval = result.data

          // Update in state
          set((state) => ({
            individualApprovals: state.individualApprovals.map((request) =>
              request.id === id ? updatedApproval : request
            ),
            loading: false,
          }))

          return updatedApproval
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
          set({ error: errorMessage, loading: false })
          console.error('Error updating KB approval:', error)
          return null
        }
      },

      clearApprovals: () => set({ individualApprovals: [], groupedApprovals: [], error: null }),
    }),
    { name: 'kb-approval-store' }
  )
)

// store/userApprovalStore.ts
import { create } from 'zustand'

export interface UserType {
  id: string
  name: string
}

interface UserApprovalState {
  users: UserType[]
  loading: boolean
  error: string | null
  fetchUsers: () => Promise<void>
}

export const useUserApprovalStore = create<UserApprovalState>((set) => ({
  users: [],
  loading: false,
  error: null,

  fetchUsers: async () => {
    set({ loading: true, error: null })
    try {
      const res = await fetch('/api/users/approval')
      console.log('Fetch response:', res)
      if (!res.ok) {
        throw new Error(`Failed to fetch users: ${res.statusText}`)
      }
      const data = await res.json()
      set({ users: data.users || [], loading: false })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },
}))

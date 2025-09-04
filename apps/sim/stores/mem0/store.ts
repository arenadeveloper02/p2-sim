import { create } from 'zustand'
import type { Message } from './types'

interface ChatState {
  messages: Message[]
  runId: string | null
  userId: string | null
  workflowId: string | null
  agentId: string | null
  meta?: Record<string, any>

  // Actions
  addMessage: (message: Message) => void
  setMessages: (messages: Message[]) => void
  updateMeta: (
    data: Partial<
      Omit<ChatState, 'messages' | 'addMessage' | 'setMessages' | 'updateMeta' | 'resetStore'>
    >
  ) => void
  resetStore: () => void
}

export const useMem0Store = create<ChatState>((set) => ({
  messages: [],
  runId: null,
  userId: null,
  workflowId: null,
  agentId: null,
  meta: {},

  // Add a new message
  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),

  // Set entire messages array (if needed)
  setMessages: (messages) => set({ messages }),

  // Update runId, userId, workflowId, etc.
  updateMeta: (data) => set((state) => ({ ...state, ...data })),

  // Reset store
  resetStore: () =>
    set({
      messages: [],
      runId: null,
      userId: null,
      workflowId: null,
    }),
}))

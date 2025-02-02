import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

export interface Comment {
  id: string
  text: string
  position: { x: number; y: number }
  createdAt: number
}

interface CommentStore {
  comments: Record<string, Comment>
  isCommentMode: boolean
  addComment: (position: { x: number; y: number }) => void
  updateComment: (id: string, text: string) => void
  updateCommentPosition: (id: string, position: { x: number; y: number }) => void
  removeComment: (id: string) => void
  toggleCommentMode: () => void
}

export const useCommentStore = create<CommentStore>()(
  devtools(
    persist(
      (set) => ({
        comments: {},
        isCommentMode: false,

        addComment: (position) => {
          const id = crypto.randomUUID()
          set((state) => ({
            comments: {
              ...state.comments,
              [id]: {
                id,
                text: '',
                position,
                createdAt: Date.now(),
              },
            },
            isCommentMode: false,
          }))
        },

        updateComment: (id, text) => {
          set((state) => ({
            comments: {
              ...state.comments,
              [id]: {
                ...state.comments[id],
                text,
              },
            },
          }))
        },

        updateCommentPosition: (id, position) => {
          set((state) => ({
            comments: {
              ...state.comments,
              [id]: {
                ...state.comments[id],
                position,
              },
            },
          }))
        },

        removeComment: (id) => {
          set((state) => {
            const newComments = { ...state.comments }
            delete newComments[id]
            return { comments: newComments }
          })
        },

        toggleCommentMode: () => {
          set((state) => ({ isCommentMode: !state.isCommentMode }))
        },
      }),
      {
        name: 'comments-storage',
      }
    )
  )
)
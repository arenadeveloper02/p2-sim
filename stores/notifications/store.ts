import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { Notification, NotificationStore, NotificationType } from './types'

const STORAGE_KEY = 'workflow-notifications'

// Helper to load persisted notifications
const loadPersistedNotifications = (): Notification[] => {
  if (typeof window === 'undefined') return []
  const saved = localStorage.getItem(STORAGE_KEY)
  return saved ? JSON.parse(saved) : []
}

// Helper to save notifications to localStorage
const persistNotifications = (notifications: Notification[]) => {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications))
}

export const useNotificationStore = create<NotificationStore>()(
  devtools(
    (set, get) => ({
      notifications: loadPersistedNotifications(),

      addNotification: (type, message, workflowId) => {
        // Only create notifications on the client side
        if (typeof window === 'undefined') return

        const notification: Notification = {
          id: crypto.randomUUID(),
          type,
          message,
          timestamp: Date.now(), // Simplified timestamp handling
          isVisible: true,
          workflowId,
        }

        set((state) => {
          const newNotifications = [...state.notifications, notification]
          persistNotifications(newNotifications)
          return { notifications: newNotifications }
        })
      },

      hideNotification: (id) =>
        set((state) => {
          const newNotifications = state.notifications.map((n) =>
            n.id === id ? { ...n, isVisible: false } : n
          )
          persistNotifications(newNotifications)
          return { notifications: newNotifications }
        }),

      showNotification: (id) =>
        set((state) => {
          const newNotifications = state.notifications.map((n) =>
            n.id === id ? { ...n, isVisible: true } : n
          )
          persistNotifications(newNotifications)
          return { notifications: newNotifications }
        }),

      removeNotification: (id) =>
        set((state) => {
          const newNotifications = state.notifications.filter((n) => n.id !== id)
          persistNotifications(newNotifications)
          return { notifications: newNotifications }
        }),

      clearNotifications: () => {
        persistNotifications([])
        set({ notifications: [] })
      },

      getWorkflowNotifications: (workflowId) => {
        return get().notifications.filter((n) => n.workflowId === workflowId)
      },
    }),
    { name: 'notification-store' }
  )
)

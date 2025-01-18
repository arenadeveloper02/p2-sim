import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export type NotificationType = 'error' | 'console'

export interface Notification {
  id: string
  type: NotificationType
  message: string
  timestamp: number
  isVisible: boolean
}

interface NotificationStore {
  notifications: Notification[]
  addNotification: (type: NotificationType, message: string) => void
  hideNotification: (id: string) => void
  showNotification: (id: string) => void
  removeNotification: (id: string) => void
  clearNotifications: () => void
}

export const useNotificationStore = create<NotificationStore>()(
  devtools(
    (set) => ({
      notifications: [],
      addNotification: (type, message) => {
        const notification: Notification = {
          id: crypto.randomUUID(),
          type,
          message,
          timestamp: Date.now(),
          isVisible: true,
        }
        set((state) => ({
          notifications: [...state.notifications, notification],
        }))
      },
      hideNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, isVisible: false } : n
          ),
        })),
      showNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, isVisible: true } : n
          ),
        })),
      removeNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),
      clearNotifications: () => set({ notifications: [] }),
    }),
    { name: 'notification-store' }
  )
)
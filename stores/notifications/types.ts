export type NotificationType = 'error' | 'console'

export interface Notification {
  id: string
  type: NotificationType
  message: string
  timestamp: number
  isVisible: boolean
}

export interface NotificationStore {
  notifications: Notification[]
  addNotification: (type: NotificationType, message: string) => void
  hideNotification: (id: string) => void
  showNotification: (id: string) => void
  removeNotification: (id: string) => void
  clearNotifications: () => void
}
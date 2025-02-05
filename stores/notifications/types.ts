export type NotificationType = 'error' | 'console'

export interface Notification {
  id: string
  type: NotificationType
  message: string
  timestamp: number
  isVisible: boolean
  workflowId: string | null
}

export interface NotificationStore {
  notifications: Notification[]
  addNotification: (type: NotificationType, message: string, workflowId: string | null) => void
  hideNotification: (id: string) => void
  showNotification: (id: string) => void
  removeNotification: (id: string) => void
  clearNotifications: () => void
  getWorkflowNotifications: (workflowId: string) => Notification[]
}

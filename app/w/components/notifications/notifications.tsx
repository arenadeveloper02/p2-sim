import { useEffect, useState } from 'react'
import { AlertCircle, Terminal } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useNotificationStore } from '@/stores/notifications/notifications-store'
import { cn } from '@/lib/utils'
import { ErrorIcon } from '@/components/icons'

const NOTIFICATION_TIMEOUT = 4000
const FADE_DURATION = 300

const NotificationIcon = {
  error: ErrorIcon,
  console: Terminal,
}

const NotificationColors = {
  error:
    'border-red-500 bg-red-50 text-destructive dark:border-border dark:text-foreground dark:bg-background',
  console:
    'border-border bg-background text-foreground dark:border-border dark:text-foreground dark:bg-background',
}

export function NotificationList() {
  const { notifications, hideNotification } = useNotificationStore()
  const [fadingNotifications, setFadingNotifications] = useState<Set<string>>(
    new Set()
  )

  // Only show visible notifications in the display
  const visibleNotifications = notifications.filter((n) => n.isVisible)

  useEffect(() => {
    notifications.forEach((notification) => {
      if (!notification.isVisible) return

      // Start fade out
      const fadeTimer = setTimeout(() => {
        setFadingNotifications((prev) => new Set([...prev, notification.id]))
      }, NOTIFICATION_TIMEOUT)

      // Hide notification after fade
      const hideTimer = setTimeout(() => {
        hideNotification(notification.id)
        setFadingNotifications((prev) => {
          const next = new Set(prev)
          next.delete(notification.id)
          return next
        })
      }, NOTIFICATION_TIMEOUT + FADE_DURATION)

      return () => {
        clearTimeout(fadeTimer)
        clearTimeout(hideTimer)
      }
    })
  }, [notifications, hideNotification])

  if (visibleNotifications.length === 0) return null

  return (
    <div
      className="absolute left-1/2 z-50 space-y-2 max-w-md w-full"
      style={{
        top: '30px',
        transform: 'translateX(-50%)',
      }}
    >
      {visibleNotifications.map((notification) => {
        const Icon = NotificationIcon[notification.type]
        const isFading = fadingNotifications.has(notification.id)

        return (
          <Alert
            key={notification.id}
            className={cn(
              'transition-all duration-300 ease-in-out opacity-0 translate-y-[-100%]',
              isFading
                ? 'animate-notification-fade-out'
                : 'animate-notification-slide',
              NotificationColors[notification.type]
            )}
          >
            <Icon
              className={cn('h-4 w-4', {
                '!text-red-500': notification.type === 'error',
                'text-foreground': notification.type === 'console',
              })}
            />
            <AlertTitle className="ml-2">
              {notification.type === 'error' ? 'Error' : 'Console'}
            </AlertTitle>
            <AlertDescription className="ml-2">
              {notification.message}
            </AlertDescription>
          </Alert>
        )
      })}
    </div>
  )
}

import { formatDistanceToNow } from 'date-fns'
import { Terminal, AlertCircle } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import {
  NotificationType,
  NotificationStore,
} from '@/stores/notifications/types'
import { useNotificationStore } from '@/stores/notifications/notifications-store'
import { cn } from '@/lib/utils'
import { ErrorIcon } from '@/components/icons'
import { useState, useEffect } from 'react'

interface NotificationDropdownItemProps {
  id: string
  type: NotificationType
  message: string
  timestamp: number
}

const NotificationIcon = {
  error: ErrorIcon,
  console: Terminal,
}

const NotificationColors = {
  error: 'text-destructive',
  console: 'text-foreground',
}

export function NotificationDropdownItem({
  id,
  type,
  message,
  timestamp,
}: NotificationDropdownItemProps) {
  const { showNotification } = useNotificationStore()
  const Icon = NotificationIcon[type]
  const [, forceUpdate] = useState({})

  // Update the time display every minute
  useEffect(() => {
    const interval = setInterval(() => forceUpdate({}), 60000)
    return () => clearInterval(interval)
  }, [])

  const timeAgo = formatDistanceToNow(timestamp, { addSuffix: true })

  // Truncate message if it's too long
  const truncatedMessage =
    message.length > 50 ? `${message.slice(0, 50)}...` : message

  return (
    <DropdownMenuItem
      className="flex items-start gap-2 p-3 cursor-pointer"
      onClick={() => showNotification(id)}
    >
      <Icon className={cn('h-4 w-4', NotificationColors[type])} />
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">
            {type === 'error' ? 'Error' : 'Console'}
          </span>
          <span className="text-xs text-muted-foreground">{timeAgo}</span>
        </div>
        <p className="text-sm text-foreground">{truncatedMessage}</p>
      </div>
    </DropdownMenuItem>
  )
}

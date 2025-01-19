'use client'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { History, Bell, Play } from 'lucide-react'
import { useNotificationStore } from '@/stores/notifications/notifications-store'
import { NotificationDropdownItem } from './components/notification-dropdown-item'
import { useWorkflowStore } from '@/stores/workflow/workflow-store'
import { HistoryDropdownItem } from './components/history-dropdown-item'

export function ControlBar() {
  const { notifications } = useNotificationStore()
  const { history, undo, redo } = useWorkflowStore()

  return (
    <div className="flex h-16 w-full items-center justify-between bg-background px-6 border-b">
      {/* Left Section - Workflow Info */}
      <div className="flex flex-col gap-[2px]">
        <h2 className="font-semibold text-sm">Workflow 1</h2>
        <p className="text-xs text-muted-foreground">Saved 2 minutes ago</p>
      </div>

      {/* Middle Section - Reserved for future use */}
      <div className="flex-1" />

      {/* Right Section - Actions */}
      <div className="flex items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <History />
              <span className="sr-only">Version History</span>
            </Button>
          </DropdownMenuTrigger>

          {history.past.length === 0 ? (
            <DropdownMenuContent align="end" className="w-50">
              <DropdownMenuItem className="text-sm text-muted-foreground">
                No history available
              </DropdownMenuItem>
            </DropdownMenuContent>
          ) : (
            <DropdownMenuContent align="end" className="w-60">
              {[...history.past].reverse().map((entry) => (
                <HistoryDropdownItem
                  key={entry.timestamp}
                  action={entry.action}
                  timestamp={entry.timestamp}
                  onClick={undo}
                />
              ))}
            </DropdownMenuContent>
          )}
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <Bell />
              <span className="sr-only">Notifications</span>
            </Button>
          </DropdownMenuTrigger>

          {notifications.length === 0 ? (
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem className="text-sm text-muted-foreground">
                No new notifications
              </DropdownMenuItem>
            </DropdownMenuContent>
          ) : (
            <DropdownMenuContent align="end" className="w-60">
              {[...notifications]
                .sort((a, b) => b.timestamp - a.timestamp)
                .map((notification) => (
                  <NotificationDropdownItem
                    id={notification.id}
                    key={notification.id}
                    type={notification.type}
                    message={notification.message}
                    timestamp={notification.timestamp}
                  />
                ))}
            </DropdownMenuContent>
          )}
        </DropdownMenu>

        <Button className="gap-2 bg-[#7F2FFF] hover:bg-[#7F2FFF]/90">
          <Play fill="currentColor" className="!h-3.5 !w-3.5" />
          Run
        </Button>
      </div>
    </div>
  )
}

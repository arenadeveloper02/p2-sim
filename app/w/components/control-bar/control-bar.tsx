'use client'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { History, Bell, Play, Trash2 } from 'lucide-react'
import { useNotificationStore } from '@/stores/notifications/notifications-store'
import { NotificationDropdownItem } from './components/notification-dropdown-item'
import { useWorkflowStore } from '@/stores/workflow/workflow-store'
import { HistoryDropdownItem } from './components/history-dropdown-item'
import { formatDistanceToNow } from 'date-fns'
import { useEffect, useState } from 'react'
import { useWorkflowExecution } from '../../hooks/use-workflow-execution'
import { useWorkflowRegistry } from '@/stores/workflow/workflow-registry'
import { useRouter } from 'next/navigation'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export function ControlBar() {
  const { notifications, getWorkflowNotifications } = useNotificationStore()
  const { history, undo, redo, revertToHistoryState } = useWorkflowStore()
  const [, forceUpdate] = useState({})
  const { isExecuting, handleRunWorkflow } = useWorkflowExecution()
  const { workflows, removeWorkflow, activeWorkflowId } = useWorkflowRegistry()
  const router = useRouter()

  // Use client-side only rendering for the timestamp
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  // Get notifications for current workflow
  const workflowNotifications = activeWorkflowId
    ? getWorkflowNotifications(activeWorkflowId)
    : notifications // Show all if no workflow is active

  const handleDeleteWorkflow = () => {
    if (!activeWorkflowId) return
    const newWorkflows = { ...workflows }
    delete newWorkflows[activeWorkflowId]
    const remainingIds = Object.keys(newWorkflows)

    removeWorkflow(activeWorkflowId)

    if (remainingIds.length > 0) {
      router.push(`/w/${remainingIds[0]}`)
    } else {
      router.push('/')
    }
  }

  // Update the time display every minute
  useEffect(() => {
    const interval = setInterval(() => forceUpdate({}), 60000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex h-16 w-full items-center justify-between bg-background px-6 border-b transition-all duration-300">
      {/* Left Section - Workflow Info */}
      <div className="flex flex-col gap-[2px]">
        <h2 className="font-semibold text-sm">
          {activeWorkflowId ? workflows[activeWorkflowId].name : 'Workflow'}
        </h2>
        {mounted && ( // Only render the timestamp after client-side hydration
          <p className="text-xs text-muted-foreground">
            Saved{' '}
            {formatDistanceToNow(history.present.timestamp, {
              addSuffix: true,
            })}
          </p>
        )}
      </div>

      {/* Middle Section - Reserved for future use */}
      <div className="flex-1" />

      {/* Right Section - Actions */}
      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDeleteWorkflow}
              disabled={Object.keys(workflows).length <= 1}
              className="hover:text-red-600"
            >
              <Trash2 className="h-5 w-5" />
              <span className="sr-only">Delete Workflow</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete Workflow</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <History />
              <span className="sr-only">Version History</span>
            </Button>
          </DropdownMenuTrigger>

          {history.past.length === 0 && history.future.length === 0 ? (
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem className="text-sm text-muted-foreground">
                No history available
              </DropdownMenuItem>
            </DropdownMenuContent>
          ) : (
            <DropdownMenuContent
              align="end"
              className="w-60 max-h-[300px] overflow-y-auto"
            >
              <>
                {[...history.future].reverse().map((entry, index) => (
                  <HistoryDropdownItem
                    key={`future-${entry.timestamp}-${index}`}
                    action={entry.action}
                    timestamp={entry.timestamp}
                    onClick={() =>
                      revertToHistoryState(
                        history.past.length +
                          1 +
                          (history.future.length - 1 - index)
                      )
                    }
                    isFuture={true}
                  />
                ))}
                <HistoryDropdownItem
                  key={`current-${history.present.timestamp}`}
                  action={history.present.action}
                  timestamp={history.present.timestamp}
                  isCurrent={true}
                  onClick={() => {}}
                />
                {[...history.past].reverse().map((entry, index) => (
                  <HistoryDropdownItem
                    key={`past-${entry.timestamp}-${index}`}
                    action={entry.action}
                    timestamp={entry.timestamp}
                    onClick={() =>
                      revertToHistoryState(history.past.length - 1 - index)
                    }
                  />
                ))}
              </>
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

          {workflowNotifications.length === 0 ? (
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem className="text-sm text-muted-foreground">
                No new notifications
              </DropdownMenuItem>
            </DropdownMenuContent>
          ) : (
            <DropdownMenuContent
              align="end"
              className="w-60 max-h-[300px] overflow-y-auto"
            >
              {[...workflowNotifications]
                .sort((a, b) => b.timestamp - a.timestamp)
                .map((notification) => (
                  <NotificationDropdownItem
                    key={notification.id}
                    {...notification}
                  />
                ))}
            </DropdownMenuContent>
          )}
        </DropdownMenu>

        <Button
          className="gap-2 bg-[#7F2FFF] hover:bg-[#7F2FFF]/90"
          onClick={handleRunWorkflow}
          disabled={isExecuting}
        >
          <Play fill="currentColor" className="!h-3.5 !w-3.5" />
          {isExecuting ? 'Running...' : 'Run'}
        </Button>
      </div>
    </div>
  )
}

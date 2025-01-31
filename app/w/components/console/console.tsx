'use client'

import { useState, useMemo, useEffect } from 'react'
import { formatDistanceToNow, format } from 'date-fns'
import {
  PanelLeftClose,
  Terminal,
  XCircle,
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useConsoleStore } from '@/stores/console/store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { ConsoleEntry as ConsoleEntryType } from '@/stores/console/types'
import { useWorkflowRegistry } from '@/stores/workflow/registry'

function JSONView({ data, level = 0 }: { data: any; level?: number }) {
  const [isCollapsed, setIsCollapsed] = useState(true)

  if (data === null) return <span className="text-muted-foreground">null</span>
  if (typeof data !== 'object') {
    return (
      <span
        className={`${
          typeof data === 'string' ? 'text-success' : 'text-info'
        } break-all`}
      >
        {JSON.stringify(data)}
      </span>
    )
  }

  const isArray = Array.isArray(data)
  const items = isArray ? data : Object.entries(data)
  const isEmpty = items.length === 0

  if (isEmpty) {
    return <span>{isArray ? '[]' : '{}'}</span>
  }

  return (
    <div className="relative">
      <span
        className="cursor-pointer select-none"
        onClick={(e) => {
          e.stopPropagation()
          setIsCollapsed(!isCollapsed)
        }}
      >
        {isCollapsed ? '▶' : '▼'} {isArray ? '[' : '{'}
        {isCollapsed ? '...' : ''}
      </span>
      {!isCollapsed && (
        <div className="ml-4 break-words">
          {isArray
            ? items.map((item, index) => (
                <div key={index} className="break-all">
                  <JSONView data={item} level={level + 1} />
                  {index < items.length - 1 && ','}
                </div>
              ))
            : (items as [string, any][]).map(([key, value], index) => (
                <div key={key} className="break-all">
                  <span className="text-muted-foreground">{key}</span>:{' '}
                  <JSONView data={value} level={level + 1} />
                  {index < items.length - 1 && ','}
                </div>
              ))}
        </div>
      )}
      <span>{isArray ? ']' : '}'}</span>
    </div>
  )
}

function ConsoleEntry({ entry }: { entry: ConsoleEntryType }) {
  const [isExpanded, setIsExpanded] = useState(false)

  const timeAgo = useMemo(
    () =>
      formatDistanceToNow(new Date(entry.startedAt), {
        addSuffix: true,
      }),
    [entry.startedAt]
  )

  return (
    <div className="border-b border-border hover:bg-accent/50 transition-colors">
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span>{format(new Date(entry.startedAt), 'HH:mm:ss')}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span>Duration: {entry.durationMs}ms</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-start gap-2">
            <Terminal className="h-4 w-4 text-muted-foreground mt-1" />
            <div className="text-sm font-mono flex-1">
              <JSONView data={entry.output} />
            </div>
          </div>

          {entry.error && (
            <div className="flex items-start gap-2 border rounded-md p-3 border-red-500 bg-red-50 text-destructive dark:border-border dark:text-foreground dark:bg-background">
              <AlertCircle className="h-4 w-4 text-red-500 mt-1" />
              <div className="flex-1 break-all">
                <div className="font-medium">Error</div>
                <pre className="text-sm whitespace-pre-wrap">{entry.error}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function Console() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [width, setWidth] = useState(336) // 84 * 4 = 336px (default width)
  const [isDragging, setIsDragging] = useState(false)
  const entries = useConsoleStore((state) => state.entries)
  const clearConsole = useConsoleStore((state) => state.clearConsole)
  const { activeWorkflowId } = useWorkflowRegistry()

  // Filter entries for active workflow
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => entry.workflowId === activeWorkflowId)
  }, [entries, activeWorkflowId])

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    e.preventDefault()
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newWidth = window.innerWidth - e.clientX
        setWidth(Math.max(336, Math.min(newWidth, window.innerWidth * 0.8)))
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setIsCollapsed(false)}
            className="fixed right-4 bottom-[18px] z-10 flex h-9 w-9 items-center justify-center rounded-lg bg-background text-muted-foreground transition-colors hover:text-foreground hover:bg-accent border"
          >
            <Terminal className="h-5 w-5" />
            <span className="sr-only">Open Console</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">Open Console</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div
      className="fixed right-0 top-16 z-10 h-[calc(100vh-4rem)] border-l bg-background"
      style={{ width: `${width}px` }}
    >
      <div
        className="absolute left-[-4px] top-0 bottom-0 w-4 cursor-ew-resize hover:bg-accent/50 z-50"
        onMouseDown={handleMouseDown}
      />

      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-sm font-medium">Console</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={clearConsole}
          className="text-muted-foreground hover:text-foreground"
        >
          Clear
        </Button>
      </div>

      <ScrollArea className="h-[calc(100%-4rem)]">
        {filteredEntries.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground pt-4">
            No console entries
          </div>
        ) : (
          filteredEntries.map((entry) => (
            <ConsoleEntry key={entry.id} entry={entry} />
          ))
        )}
      </ScrollArea>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setIsCollapsed(true)}
            className="absolute left-4 bottom-[18px] flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground hover:bg-accent"
          >
            <PanelLeftClose className="h-5 w-5" />
            <span className="sr-only">Close Console</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Close Console</TooltipContent>
      </Tooltip>
    </div>
  )
}

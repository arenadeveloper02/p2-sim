'use client'

import { useState, useMemo, useEffect } from 'react'
import { PanelLeftClose, Terminal } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useConsoleStore } from '@/stores/console/store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { useWorkflowRegistry } from '@/stores/workflow/registry'
import { ConsoleEntry } from './components/console-entry/console-entry'

export function Console() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [width, setWidth] = useState(336) // 84 * 4 = 336px (default width)
  const [isDragging, setIsDragging] = useState(false)
  const entries = useConsoleStore((state) => state.entries)
  const clearConsole = useConsoleStore((state) => state.clearConsole)
  const { activeWorkflowId } = useWorkflowRegistry()

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

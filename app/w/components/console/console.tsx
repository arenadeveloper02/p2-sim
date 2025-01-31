'use client'

import { useState } from 'react'
import { PanelLeftClose, PanelLeft, Terminal } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export function Console() {
  const [isCollapsed, setIsCollapsed] = useState(false)

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
    <div className="fixed right-0 top-16 z-10 h-[calc(100vh-4rem)] overflow-y-auto w-72 border-l bg-background sm:block">
      {/* Console content will go here */}

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

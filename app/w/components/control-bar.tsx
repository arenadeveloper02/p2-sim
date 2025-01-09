import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { History, Bell, Play } from 'lucide-react'

export function ControlBar() {
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
          <DropdownMenuContent align="end">
            <DropdownMenuItem>View History</DropdownMenuItem>
            <DropdownMenuItem>Compare Versions</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <Bell />
              <span className="sr-only">Notifications</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>No new notifications</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button className="gap-2 bg-[#7F2FFF] hover:bg-[#7F2FFF]/90">
          <Play fill="currentColor" className="!h-3.5 !w-3.5" />
          Run
        </Button>
      </div>
    </div>
  )
}

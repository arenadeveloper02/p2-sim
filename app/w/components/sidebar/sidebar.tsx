import Link from 'next/link'
import { NavItem } from './components/nav-item'
import { Settings, Plus } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { AgentIcon } from '@/components/icons'

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-10 hidden w-14 flex-col border-r bg-background sm:flex">
      <nav className="flex flex-col items-center gap-4 px-2 sm:py-5">
        <Link
          href="#"
          className="group flex h-8 w-8 items-center justify-center rounded-lg bg-[#7F2FFF]"
        >
          <AgentIcon className="text-white transition-all group-hover:scale-110 -translate-y-[0.5px] w-5 h-5" />
          <span className="sr-only">Sim Studio</span>
        </Link>

        <NavItem href="#" label="Add Workflow">
          <Plus className="h-5 w-5" />
        </NavItem>

        <NavItem href="#" label="Workflow 1">
          <div className="h-4 w-4 rounded-full bg-[#3972F6]" />
        </NavItem>

        <NavItem href="#" label="Workflow 2">
          <div className="h-4 w-4 rounded-full bg-[#F639DD]" />
        </NavItem>
      </nav>
      <nav className="mt-auto flex flex-col items-center gap-4 px-2 sm:py-5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="#"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground md:h-8 md:w-8"
            >
              <Settings className="h-5 w-5" />
              <span className="sr-only">Settings</span>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip>
      </nav>
    </aside>
  )
}

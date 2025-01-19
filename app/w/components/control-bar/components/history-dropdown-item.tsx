import { formatDistanceToNow } from 'date-fns'
import { Clock } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface HistoryDropdownItemProps {
  action: string
  timestamp: number
  onClick?: () => void
  isCurrent?: boolean
}

export function HistoryDropdownItem({
  action,
  timestamp,
  onClick,
  isCurrent = false,
}: HistoryDropdownItemProps) {
  const timeAgo = formatDistanceToNow(timestamp, { addSuffix: true })

  return (
    <DropdownMenuItem
      className="flex items-start gap-2 p-3 cursor-pointer"
      onClick={onClick}
    >
      <Clock className="h-4 w-4 text-muted-foreground" />
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          {isCurrent ? (
            <span className="text-xs text-muted-foreground">Current</span>
          ) : (
            <span className="text-xs text-muted-foreground">{timeAgo}</span>
          )}
        </div>
        <p className="text-sm text-foreground">{action}</p>
      </div>
    </DropdownMenuItem>
  )
}

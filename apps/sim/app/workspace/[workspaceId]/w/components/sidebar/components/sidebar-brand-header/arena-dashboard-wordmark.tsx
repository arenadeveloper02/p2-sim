import { cn } from '@sim/emcn'
import {
  ARENA_DASHBOARD_WORDMARK_MARK_PATHS,
  ARENA_DASHBOARD_WORDMARK_TEXT_PATHS,
  ARENA_DASHBOARD_WORDMARK_VIEW_BOX,
} from '@/lib/branding/arena-dashboard-wordmark'

interface ArenaDashboardWordmarkProps {
  className?: string
  /** Accessible name when the mark is meaningful (e.g. sidebar brand link). */
  title?: string
}

/**
 * Inline Arena gem + wordmark. Gem fills stay fixed; lettering follows
 * `currentColor` (`text-black dark:text-white`) — one SVG for both themes.
 */
export function ArenaDashboardWordmark({ className, title }: ArenaDashboardWordmarkProps) {
  return (
    <svg
      viewBox={`0 0 ${ARENA_DASHBOARD_WORDMARK_VIEW_BOX.width} ${ARENA_DASHBOARD_WORDMARK_VIEW_BOX.height}`}
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      className={cn('text-black dark:text-white', className)}
    >
      {title ? <title>{title}</title> : null}
      {ARENA_DASHBOARD_WORDMARK_MARK_PATHS.map((path) => (
        <path key={path.d} d={path.d} fill={path.fill} />
      ))}
      {ARENA_DASHBOARD_WORDMARK_TEXT_PATHS.map((d) => (
        <path key={d} d={d} fill='currentColor' />
      ))}
    </svg>
  )
}

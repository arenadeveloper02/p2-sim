import { cn } from '@/lib/core/utils/cn'

type WorkspaceConicLoaderProps = {
  className?: string
}

/**
 * Workspace loading ring used on workspace picker redirect, /w redirect, and route fallbacks.
 * Uses `--text-muted` so it stays visible in light and dark (unlike `hsl(var(--muted-foreground))` in `.dark`).
 */
export function WorkspaceConicLoader({ className }: WorkspaceConicLoaderProps) {
  return (
    <div
      className={cn('h-[18px] w-[18px] shrink-0 animate-spin rounded-full', className)}
      style={{
        background:
          'conic-gradient(from 0deg, var(--text-muted) 0deg 120deg, transparent 120deg 180deg, var(--text-muted) 180deg 300deg, transparent 300deg 360deg)',
        mask: 'radial-gradient(farthest-side, transparent calc(100% - 1.5px), black calc(100% - 1.5px))',
        WebkitMask:
          'radial-gradient(farthest-side, transparent calc(100% - 1.5px), black calc(100% - 1.5px))',
      }}
      aria-hidden
    />
  )
}

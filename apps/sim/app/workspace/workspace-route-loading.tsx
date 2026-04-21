import { Loader2 } from 'lucide-react'

/**
 * Full-screen loader for /workspace routes while RSC streaming / Suspense resolves.
 */
export function WorkspaceRouteLoading() {
  return (
    <div className='flex h-screen w-full items-center justify-center bg-[var(--surface-1)]'>
      <Loader2
        className='h-8 w-8 animate-spin text-muted-foreground'
        aria-hidden
      />
      <span className='sr-only'>Loading workspace…</span>
    </div>
  )
}

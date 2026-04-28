import { WorkspaceConicLoader } from '@/app/workspace/workspace-conic-loader'

/**
 * Full-screen loader for /workspace routes while RSC streaming / Suspense resolves.
 */
export function WorkspaceRouteLoading() {
  return (
    <div className='flex h-screen w-full items-center justify-center bg-[var(--surface-1)]'>
      <WorkspaceConicLoader />
      <span className='sr-only'>Loading workspace…</span>
    </div>
  )
}

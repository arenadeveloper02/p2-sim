import { WorkspaceConicLoader } from '@/app/workspace/workspace-conic-loader'

/**
 * Shown while the Home RSC payload / client bundle streams into the workspace shell.
 */
export default function HomeLoading() {
  return (
    <div className='flex h-full min-h-0 w-full flex-1 items-center justify-center bg-[var(--bg)]'>
      <WorkspaceConicLoader />
      <span className='sr-only'>Loading home…</span>
    </div>
  )
}

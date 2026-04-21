'use client'

import { usePathname } from 'next/navigation'
import { Sidebar } from '@/app/workspace/[workspaceId]/w/components/sidebar/sidebar'

interface WorkspaceChromeProps {
  children: React.ReactNode
}

/**
 * Returns true when the workspace shell should hide the left sidebar (duplicate full-bleed views).
 */
function isFullscreenWorkspaceRoute(pathname: string): boolean {
  return /^\/workspace\/[^/]+\/home\/embed\/?$/.test(pathname)
}

/**
 * Workspace main area: optional left sidebar plus bordered content region.
 */
export function WorkspaceChrome({ children }: WorkspaceChromeProps) {
  const pathname = usePathname()
  const hideSidebar = isFullscreenWorkspaceRoute(pathname)

  if (hideSidebar) {
    return (
      <div className='flex min-h-0 flex-1'>
        <div className='flex min-w-0 flex-1 flex-col p-[8px]'>
          <div className='flex-1 overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--bg)]'>
            {children}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className='flex min-h-0 flex-1'>
      <div className='shrink-0' suppressHydrationWarning>
        <Sidebar />
      </div>
      <div className='flex min-w-0 flex-1 flex-col p-[8px] pl-0'>
        <div className='flex-1 overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--bg)]'>
          {children}
        </div>
      </div>
    </div>
  )
}

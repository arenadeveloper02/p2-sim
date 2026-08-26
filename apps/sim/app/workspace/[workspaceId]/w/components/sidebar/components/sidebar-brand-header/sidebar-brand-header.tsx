'use client'

import { chipVariants, cn } from '@sim/emcn'
import { ArrowLeft } from '@sim/emcn/icons'
import Link from 'next/link'
import { SidebarTooltip } from '@/app/workspace/[workspaceId]/w/components/sidebar/sidebar'

interface SidebarBrandHeaderProps {
  workspaceId: string
  isCollapsed: boolean
  showCollapsedTooltips: boolean
  /** Square logo shown in the collapsed sidebar. */
  brandLogoUrl?: string
  /** Wide wordmark shown in the expanded sidebar; falls back to `brandLogoUrl`. */
  brandWordmarkUrl?: string
  brandName?: string
  arenaHubAgentsUrl?: string | null
}

/**
 * Arena-branded sidebar header: logo, divider, and optional back-to-hub link.
 */
export function SidebarBrandHeader({
  workspaceId,
  isCollapsed,
  showCollapsedTooltips,
  brandLogoUrl,
  brandWordmarkUrl,
  brandName,
  arenaHubAgentsUrl,
}: SidebarBrandHeaderProps) {
  const expandedBrandUrl = brandWordmarkUrl || brandLogoUrl

  if (!brandLogoUrl && !expandedBrandUrl && !arenaHubAgentsUrl) return null

  return (
    <div className='flex-shrink-0'>
      {brandLogoUrl || expandedBrandUrl ? (
        <>
          <div
            className={cn(
              isCollapsed
                ? 'flex flex-col items-center px-2 py-2.5'
                : 'flex items-center px-3 pt-3 pb-2.5'
            )}
          >
            <Link
              href={`/workspace/${workspaceId}/home`}
              className={cn(
                'rounded-[8px] hover-hover:bg-[var(--surface-hover)]',
                isCollapsed
                  ? 'relative flex size-[34px] items-center justify-center'
                  : 'relative inline-flex h-[44px] items-center'
              )}
              aria-label={brandName}
            >
              {isCollapsed
                ? (brandLogoUrl || expandedBrandUrl) && (
                    <img
                      src={brandLogoUrl || expandedBrandUrl}
                      alt={brandName || ''}
                      className='size-[34px] object-contain'
                    />
                  )
                : expandedBrandUrl && (
                    <img
                      src={expandedBrandUrl}
                      alt={brandName || ''}
                      className='h-[44px] w-auto max-w-[220px] object-contain object-left'
                    />
                  )}
            </Link>
          </div>
          <div className='border-[var(--border)] border-b' />
        </>
      ) : null}

      {arenaHubAgentsUrl ? (
        <div className='flex flex-shrink-0 flex-col px-2 pt-2 pb-0'>
          <SidebarTooltip label='Back to Arena agents' enabled={showCollapsedTooltips} side='right'>
            <a
              href={arenaHubAgentsUrl}
              className={chipVariants({ fullWidth: true })}
              aria-label='Back to Arena agents'
            >
              <ArrowLeft className='size-[16px] flex-shrink-0 text-[var(--text-icon)]' />
              <span className='sidebar-collapse-hide truncate text-[var(--text-body)]'>
                Back to Arena agents
              </span>
            </a>
          </SidebarTooltip>
        </div>
      ) : null}
    </div>
  )
}

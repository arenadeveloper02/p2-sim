'use client'

import Image from 'next/image'
import Link from 'next/link'
import { chipVariants } from '@/components/emcn'
import { ArrowLeft } from '@/components/emcn/icons'
import { cn } from '@/lib/core/utils/cn'
import { SidebarTooltip } from '@/app/workspace/[workspaceId]/w/components/sidebar/sidebar'

interface SidebarBrandHeaderProps {
  workspaceId: string
  isCollapsed: boolean
  showCollapsedTooltips: boolean
  brandLogoUrl?: string
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
  brandName,
  arenaHubAgentsUrl,
}: SidebarBrandHeaderProps) {
  if (!brandLogoUrl && !arenaHubAgentsUrl) return null

  return (
    <div className='flex-shrink-0'>
      {brandLogoUrl ? (
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
              <Image
                src={brandLogoUrl}
                alt={brandName || ''}
                width={140}
                height={44}
                className='sidebar-collapse-hide sidebar-collapse-remove h-[44px] w-auto max-w-[220px] object-contain object-left'
                unoptimized
              />
              <Image
                src={brandLogoUrl}
                alt={brandName || ''}
                width={34}
                height={34}
                className='sidebar-collapse-show absolute inset-0 m-auto size-[34px] object-contain'
                unoptimized
              />
            </Link>
          </div>
          <div className='border-[var(--border)] border-b' />
        </>
      ) : null}

      {arenaHubAgentsUrl ? (
        <div className='flex flex-shrink-0 flex-col px-2 pt-2 pb-0'>
          <SidebarTooltip
            label='Back to Arena agents'
            enabled={showCollapsedTooltips}
            side='right'
          >
            <Link
              href={arenaHubAgentsUrl}
              className={chipVariants({ fullWidth: true })}
              aria-label='Back to Arena agents'
            >
              <ArrowLeft className='size-[16px] flex-shrink-0 text-[var(--text-icon)]' />
              <span className='sidebar-collapse-hide truncate text-[var(--text-body)]'>
                Back to Arena agents
              </span>
            </Link>
          </SidebarTooltip>
        </div>
      ) : null}
    </div>
  )
}

'use client'

import { type ReactNode, useState } from 'react'
import { cn, Expandable, ExpandableContent } from '@sim/emcn'
import { ChevronDown } from '@sim/emcn/icons'
import type { UsageTab } from '@/app/workspace/[workspaceId]/settings/components/usage/search-params'

/** Collapsible analytics group ids on the Usage page. */
export type UsageCollapsibleGroupId = 'overview' | 'workflows' | 'mothership' | 'breakdowns'

interface UsageCollapsibleGroupProps {
  label: string
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}

/**
 * Tab-aware default open map for Usage collapsible groups.
 * Overview stays open; Workflows / Mothership open when that source tab is selected;
 * Breakdowns stays closed until the user expands it.
 */
export function getDefaultUsageGroupOpen(tab: UsageTab): Record<UsageCollapsibleGroupId, boolean> {
  return {
    overview: true,
    workflows: tab === 'workflow',
    mothership: tab === 'mothership',
    breakdowns: false,
  }
}

/**
 * Component-local open state for Usage groups. Resets to tab defaults when `tab` changes
 * so workflow / mothership filters force their group open and `all` restores Overview-only.
 */
export function useUsageCollapsibleGroups(tab: UsageTab) {
  const [openGroups, setOpenGroups] = useState(() => getDefaultUsageGroupOpen(tab))
  const [prevTab, setPrevTab] = useState(tab)

  if (tab !== prevTab) {
    setPrevTab(tab)
    setOpenGroups(getDefaultUsageGroupOpen(tab))
  }

  function setGroupOpen(id: UsageCollapsibleGroupId, open: boolean) {
    setOpenGroups((prev) => ({ ...prev, [id]: open }))
  }

  return { openGroups, setGroupOpen }
}

/**
 * Collapsible Usage analytics group — SettingsSection rhythm (muted label + hairline)
 * with a chevron toggle. Uses Expandable for height animation; parent owns open state.
 */
export function UsageCollapsibleGroup({
  label,
  open,
  onOpenChange,
  children,
}: UsageCollapsibleGroupProps) {
  return (
    <section className='flex flex-col'>
      <button
        type='button'
        onClick={() => onOpenChange(!open)}
        className='flex w-full items-center gap-1.5 pl-0.5 text-left'
        aria-expanded={open}
      >
        <span className='text-[var(--text-muted)] text-small'>{label}</span>
        <ChevronDown
          className={cn(
            'ml-auto size-[14px] flex-shrink-0 text-[var(--text-icon)] transition-transform duration-200',
            open && 'rotate-180'
          )}
        />
      </button>
      <div className='mt-[9px] mb-3 h-px bg-[var(--border)]' />
      <Expandable expanded={open}>
        <ExpandableContent>
          <div className='flex flex-col gap-8'>{children}</div>
        </ExpandableContent>
      </Expandable>
    </section>
  )
}

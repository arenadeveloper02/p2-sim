'use client'

import { Loader } from '@sim/emcn/icons'

/**
 * Centered spinner for a resource table (or chrome fallback) while the first
 * page of rows is still arriving. Sits in {@link Resource.Table}'s `emptyState`
 * slot so column headers stay put.
 */
export function ResourceListLoading() {
  return (
    <div className='flex min-h-0 flex-1 items-center justify-center py-16'>
      <Loader className='size-[20px] text-[var(--text-secondary)]' animate />
    </div>
  )
}

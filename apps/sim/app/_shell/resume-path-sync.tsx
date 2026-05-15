'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/** Same key as `deployment/maintenance.html` (fallback if LB strips the path during deploy). */
export const SIM_DEPLOY_RESUME_PATH_KEY = 'sim_resume_path'

/**
 * Persists the current path so the static maintenance page can restore deep links after deployment.
 */
export function ResumePathSync() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    const qs = searchParams.toString()
    const path = qs ? `${pathname}?${qs}` : pathname
    try {
      sessionStorage.setItem(SIM_DEPLOY_RESUME_PATH_KEY, path + window.location.hash)
    } catch {
      // Quota or private mode — ignore.
    }
  }, [pathname, searchParams])

  return null
}

'use client'

import { BillingCreditUsagePanel } from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-credit-usage-panel'
import { SettingsPanel } from '@/app/workspace/[workspaceId]/settings/components/settings-panel'

/**
 * Settings → Usage. Shows remaining-credits / org-pool stats and activity detail
 * via the shared billing credit-usage panel (always, independent of billing flags).
 * Title comes from settings nav meta; the panel supplies the near-real-time subtitle.
 */
export function Usage() {
  return (
    <SettingsPanel description=''>
      <BillingCreditUsagePanel />
    </SettingsPanel>
  )
}

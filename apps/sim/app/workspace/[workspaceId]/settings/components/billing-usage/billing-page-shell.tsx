import { Billing } from '@/app/workspace/[workspaceId]/settings/components/billing/billing'

interface BillingPageShellProps {
  scope: 'account' | 'organization'
  organizationId?: string
  workspaceId?: string
  creditUsageHref?: string
  governingWorkspaceName?: string
}

/** Arena billing settings with plan management, Stripe controls, and invoices. */
export function BillingPageShell({
  scope,
  organizationId,
  workspaceId,
  creditUsageHref,
  governingWorkspaceName,
}: BillingPageShellProps) {
  return (
    <Billing
      scope={scope}
      organizationId={organizationId}
      workspaceId={workspaceId}
      creditUsageHref={creditUsageHref}
      governingWorkspaceName={governingWorkspaceName}
      hideCreditUsageSection
      hideUsageControls
      showArenaPricing
    />
  )
}

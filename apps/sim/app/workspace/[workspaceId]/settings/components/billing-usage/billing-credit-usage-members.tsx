import { cn } from '@/lib/core/utils/cn'
import type { MemberCreditUsageRow } from '@/lib/api/contracts/billing-credit-usage'

interface BillingCreditUsageMembersProps {
  members: MemberCreditUsageRow[]
}

/**
 * Per-member credit usage table for organization admins.
 */
export function BillingCreditUsageMembers({ members }: BillingCreditUsageMembersProps) {
  if (members.length === 0) {
    return (
      <p className='text-[var(--text-muted)] text-small'>No member usage recorded this period.</p>
    )
  }

  return (
    <div className='-mx-2 flex flex-col gap-y-0.5'>
      <div className='grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2 px-2 pb-1 text-[var(--text-muted)] text-small'>
        <span>Member</span>
        <span className='text-right'>Total</span>
        <span className='hidden text-right sm:inline'>Mothership</span>
        <span className='hidden text-right sm:inline'>Workflows</span>
      </div>
      {members.map((member) => (
        <div
          key={member.userId}
          className={cn(
            'grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 rounded-lg p-2',
            'hover-hover:bg-[var(--surface-active)]'
          )}
        >
          <div className='min-w-0'>
            <p className='truncate text-[14px] text-[var(--text-body)]'>{member.userName}</p>
            <p className='truncate text-[12px] text-[var(--text-muted)]'>{member.userEmail}</p>
          </div>
          <span className='text-right text-[12px] text-[var(--text-body)] tabular-nums'>
            {member.totalCredits.toLocaleString()}
          </span>
          <span className='hidden text-right text-[12px] text-[var(--text-muted)] tabular-nums sm:inline'>
            {member.mothershipCredits.toLocaleString()}
          </span>
          <span className='hidden text-right text-[12px] text-[var(--text-muted)] tabular-nums sm:inline'>
            {member.workflowCredits.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  )
}

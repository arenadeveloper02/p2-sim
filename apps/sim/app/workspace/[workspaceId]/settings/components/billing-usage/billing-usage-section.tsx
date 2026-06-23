import type { ReactNode } from 'react'

interface BillingUsageSectionProps {
  label: string
  children: ReactNode
}

/**
 * Local labeled section for the billing usage panel — mirrors settings section
 * rhythm without modifying shared settings components.
 */
export function BillingUsageSection({ label, children }: BillingUsageSectionProps) {
  return (
    <section className='flex flex-col'>
      <div className='flex items-center gap-1.5 pl-0.5'>
        <span className='text-[var(--text-muted)] text-small'>{label}</span>
      </div>
      <div className='mt-[9px] mb-3 h-px bg-[var(--border)]' />
      {children}
    </section>
  )
}

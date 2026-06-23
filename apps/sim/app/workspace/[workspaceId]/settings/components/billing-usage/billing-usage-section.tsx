import type { ReactNode } from 'react'

interface BillingUsageSectionProps {
  label: string
  description?: string
  headerAccessory?: ReactNode
  children: ReactNode
}

/**
 * Local labeled section for the billing usage panel — mirrors settings section
 * rhythm without modifying shared settings components.
 */
export function BillingUsageSection({
  label,
  description,
  headerAccessory,
  children,
}: BillingUsageSectionProps) {
  return (
    <section className='flex flex-col'>
      <div className='flex items-start justify-between gap-3 pl-0.5'>
        <div className='flex min-w-0 flex-col gap-1'>
          <div className='flex items-center gap-1.5'>
            <span className='font-medium text-[var(--text-body)] text-small'>{label}</span>
            {headerAccessory}
          </div>
          {description ? (
            <p className='text-[var(--text-muted)] text-small'>{description}</p>
          ) : null}
        </div>
      </div>
      <div className='mt-[9px] mb-3 h-px bg-[var(--border)]' />
      {children}
    </section>
  )
}

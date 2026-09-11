'use client'

import { ChipSwitch, ChipTag, cn } from '@sim/emcn'
import { ANNUAL_DISCOUNT_RATE } from '@/lib/billing/constants'

/**
 * Props for {@link BillingPeriodToggle}.
 */
export interface BillingPeriodToggleProps {
  /** Whether the annual billing period is currently selected. */
  isAnnual: boolean
  /** Invoked with the next selection when a segment is clicked. */
  onChange: (isAnnual: boolean) => void
  /** When true, ignores clicks and shows a muted non-interactive state. */
  disabled?: boolean
  /** Optional additional classes merged onto the container. */
  className?: string
}

/**
 * Discount label derived from the real billing constant so it stays in sync if
 * the rate changes (e.g. `0.15` renders as `-15%`).
 */
const DISCOUNT_LABEL = `-${Math.round(ANNUAL_DISCOUNT_RATE * 100)}%`

type Period = 'annual' | 'monthly'

/**
 * Annual / monthly billing-period segmented switch. Built on {@link ChipSwitch}
 * with an inline brand-tinted discount badge on the annual segment.
 */
export function BillingPeriodToggle({
  isAnnual,
  onChange,
  disabled = false,
  className,
}: BillingPeriodToggleProps) {
  return (
    <ChipSwitch<Period>
      aria-label='Billing period'
      value={isAnnual ? 'annual' : 'monthly'}
      onChange={(next) => {
        if (disabled) return
        onChange(next === 'annual')
      }}
      className={cn(disabled && 'pointer-events-none opacity-50', className)}
      options={[
        {
          value: 'annual',
          label: (
            <>
              Annual
              <ChipTag variant='mono' className={isAnnual ? undefined : 'text-inherit'}>
                {DISCOUNT_LABEL}
              </ChipTag>
            </>
          ),
        },
        { value: 'monthly', label: 'Monthly' },
      ]}
    />
  )
}

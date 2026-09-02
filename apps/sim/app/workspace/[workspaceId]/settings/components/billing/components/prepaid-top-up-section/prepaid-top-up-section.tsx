'use client'

import { useMemo, useState } from 'react'
import { ButtonGroup, ButtonGroupItem, Chip, ChipInput, toast } from '@sim/emcn'
import { getErrorMessage } from '@sim/utils/errors'
import {
  dollarsToCredits,
  formatCreditsLabel,
  formatDollarAmount,
} from '@/lib/billing/credits/conversion'
import { SettingsSection } from '@/app/workspace/[workspaceId]/settings/components/settings-section/settings-section'
import { usePurchaseCredits } from '@/hooks/queries/subscription'

const PREPAID_TOP_UP_PRESETS = [30, 50, 100] as const
const PREPAID_TOP_UP_MIN = 10
const PREPAID_TOP_UP_MAX = 1000
const PREPAID_TOP_UP_PRESET_SET = new Set<number>(PREPAID_TOP_UP_PRESETS)

type PrepaidAmountPreset = (typeof PREPAID_TOP_UP_PRESETS)[number]
type PrepaidAmountSelection = PrepaidAmountPreset | 'custom'

interface PrepaidTopUpSectionProps {
  canPurchase: boolean
  onManagePaymentMethod: () => void
}

function parseSelectionValue(value: string): PrepaidAmountSelection | null {
  if (value === 'custom') return 'custom'
  const preset = Number(value)
  if (PREPAID_TOP_UP_PRESET_SET.has(preset)) return preset as PrepaidAmountPreset
  return null
}

function parseTopUpAmount(selection: PrepaidAmountSelection, customDraft: string): number | null {
  if (selection !== 'custom') return selection

  const trimmed = customDraft.trim()
  if (trimmed === '') return null

  const parsed = Number.parseFloat(trimmed)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

function isValidTopUpAmount(amount: number | null): amount is number {
  return amount !== null && amount >= PREPAID_TOP_UP_MIN && amount <= PREPAID_TOP_UP_MAX
}

/** Formats the live top-up amount preview to match whole-dollar screenshot copy. */
function formatTopUpAmountPreview(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '$0'
  if (Number.isInteger(amount)) return `$${amount.toLocaleString()}`
  return formatDollarAmount(amount)
}

/**
 * Stripe credit purchase controls for paid organization billing.
 */
export function PrepaidTopUpSection({
  canPurchase,
  onManagePaymentMethod,
}: PrepaidTopUpSectionProps) {
  const purchaseCredits = usePurchaseCredits()
  const [selection, setSelection] = useState<PrepaidAmountSelection>(PREPAID_TOP_UP_PRESETS[0])
  const [customDraft, setCustomDraft] = useState('')

  const selectedAmount = useMemo(
    () => parseTopUpAmount(selection, customDraft),
    [selection, customDraft]
  )

  const displayAmount =
    selectedAmount !== null && Number.isFinite(selectedAmount) && selectedAmount > 0
      ? selectedAmount
      : 0
  const displayCredits = dollarsToCredits(displayAmount)
  const canSubmit = canPurchase && isValidTopUpAmount(selectedAmount) && !purchaseCredits.isPending

  const handleTopUp = async () => {
    if (!canSubmit || !isValidTopUpAmount(selectedAmount)) return

    try {
      await purchaseCredits.mutateAsync(selectedAmount)
      toast.success('Credits purchased', {
        description: 'Your balance will update shortly after payment is confirmed.',
      })
    } catch (error) {
      const message = getErrorMessage(error, 'Failed to process payment')
      const needsPaymentMethod = message.toLowerCase().includes('payment method')
      toast.error("Couldn't buy credits", {
        description: needsPaymentMethod
          ? 'Add a payment method in Stripe, then try again.'
          : message,
        action: needsPaymentMethod
          ? {
              label: 'Manage in Stripe',
              onClick: onManagePaymentMethod,
            }
          : undefined,
      })
    }
  }

  if (!canPurchase) return null

  return (
    <SettingsSection label='Buy Credits'>
      <div className='flex flex-col gap-4 rounded-[8px] border border-[var(--border)] bg-[var(--surface-1)] p-4'>
        <ButtonGroup
          value={String(selection)}
          onValueChange={(value) => {
            const next = parseSelectionValue(value)
            if (next !== null) setSelection(next)
          }}
        >
          {PREPAID_TOP_UP_PRESETS.map((preset) => (
            <ButtonGroupItem key={preset} value={String(preset)}>
              ${preset}
            </ButtonGroupItem>
          ))}
          <ButtonGroupItem value='custom'>Custom</ButtonGroupItem>
        </ButtonGroup>

        {selection === 'custom' && (
          <ChipInput
            type='number'
            inputMode='decimal'
            min={PREPAID_TOP_UP_MIN}
            max={PREPAID_TOP_UP_MAX}
            step='0.01'
            value={customDraft}
            onChange={(event) => setCustomDraft(event.target.value)}
            placeholder='Enter amount'
            className='w-full'
            inputClassName='[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
          />
        )}

        <div className='flex items-center justify-between gap-3'>
          <div className='min-w-0'>
            <p className='font-medium text-[20px] text-[var(--text-primary)] leading-none'>
              {formatTopUpAmountPreview(displayAmount)}
            </p>
            <p className='mt-1.5 text-[var(--text-muted)] text-small'>
              {formatCreditsLabel(displayCredits)}
            </p>
          </div>

          <Chip variant='primary' disabled={!canSubmit} onClick={handleTopUp}>
            {purchaseCredits.isPending ? 'Processing…' : 'Top up'}
          </Chip>
        </div>
      </div>
    </SettingsSection>
  )
}

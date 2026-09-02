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

type PrepaidAmountSelection = (typeof PREPAID_TOP_UP_PRESETS)[number] | 'custom'

interface PrepaidTopUpSectionProps {
  creditBalance: number
  canPurchase: boolean
  onManagePaymentMethod: () => void
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

/**
 * Prepaid balance display and Stripe top-up controls for paid organization billing.
 */
export function PrepaidTopUpSection({
  creditBalance,
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
  const customPreviewCredits =
    selection === 'custom' && selectedAmount !== null && Number.isFinite(selectedAmount)
      ? dollarsToCredits(selectedAmount)
      : null

  const balanceCreditsLabel = formatCreditsLabel(dollarsToCredits(creditBalance))

  const handleTopUp = async () => {
    if (!canPurchase) return

    if (!isValidTopUpAmount(selectedAmount)) {
      toast.error('Invalid amount', {
        description: `Enter an amount between $${PREPAID_TOP_UP_MIN} and $${PREPAID_TOP_UP_MAX}.`,
      })
      return
    }

    try {
      await purchaseCredits.mutateAsync(selectedAmount)
      toast.success('Prepaid usage added', {
        description: 'Your balance will update shortly after payment is confirmed.',
      })
    } catch (error) {
      const message = getErrorMessage(error, 'Failed to process payment')
      const needsPaymentMethod = message.toLowerCase().includes('payment method')
      toast.error("Couldn't add prepaid usage", {
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

  const topUpAction = (
    <Chip
      disabled={purchaseCredits.isPending || !isValidTopUpAmount(selectedAmount)}
      onClick={handleTopUp}
    >
      {purchaseCredits.isPending ? 'Processing…' : 'Top up'}
    </Chip>
  )

  return (
    <>
      <SettingsSection label='Prepaid balance'>
        <p className='text-[var(--text-body)] text-small'>
          {formatDollarAmount(creditBalance)} ({balanceCreditsLabel})
        </p>
      </SettingsSection>

      {canPurchase && (
        <SettingsSection label='Add prepaid usage' action={topUpAction}>
          <div className='flex flex-col gap-3'>
            <ButtonGroup
              value={String(selection)}
              onValueChange={(value) => setSelection(value as PrepaidAmountSelection)}
            >
              {PREPAID_TOP_UP_PRESETS.map((preset) => (
                <ButtonGroupItem
                  key={preset}
                  value={String(preset)}
                  className='h-auto flex-col gap-0.5 px-3 py-2'
                >
                  <span>${preset}</span>
                  <span className='text-caption font-normal opacity-80'>
                    {formatCreditsLabel(dollarsToCredits(preset))}
                  </span>
                </ButtonGroupItem>
              ))}
              <ButtonGroupItem value='custom' className='h-auto px-3 py-2'>
                Custom
              </ButtonGroupItem>
            </ButtonGroup>

            {selection === 'custom' && (
              <div className='flex items-center gap-3'>
                <ChipInput
                  type='number'
                  inputMode='decimal'
                  min={PREPAID_TOP_UP_MIN}
                  max={PREPAID_TOP_UP_MAX}
                  step='0.01'
                  value={customDraft}
                  onChange={(event) => setCustomDraft(event.target.value)}
                  placeholder={`$${PREPAID_TOP_UP_MIN}–$${PREPAID_TOP_UP_MAX}`}
                  className='max-w-[160px]'
                  inputClassName='[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
                />
                {customPreviewCredits !== null && (
                  <span className='text-[var(--text-muted)] text-caption'>
                    {formatCreditsLabel(customPreviewCredits)}
                  </span>
                )}
              </div>
            )}
          </div>
        </SettingsSection>
      )}
    </>
  )
}

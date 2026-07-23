'use client'

import { useState } from 'react'
import { Checkbox, ChipTextarea, cn } from '@sim/emcn'
import { X } from 'lucide-react'
import { messageActionIconButtonClass } from '@/app/(interfaces)/chat/components/message/components/message-action-icons'
import {
  DEPLOYED_CHAT_CANVAS_BG,
  DEPLOYED_CHAT_DIVIDER,
  DEPLOYED_CHAT_SIDEBAR_BORDER,
  DEPLOYED_CHAT_TEXT_BODY,
  DEPLOYED_CHAT_TEXT_DISPLAY,
  DEPLOYED_CHAT_TEXT_MUTED,
} from '@/app/(interfaces)/chat/constants'

export interface FeedbackBoxProps {
  isOpen?: boolean
  onClose?: () => void
  onSubmit?: (feedback: FeedbackData, currentExecutionId: string) => void
  currentExecutionId?: string
  isLikeFeedback?: boolean
}

export interface FeedbackData {
  tooLong: boolean
  outOfDate: boolean
  incomplete: boolean
  tooShort: boolean
  inaccurate: boolean
  comment?: string
}

type FeedbackCheckboxField = keyof Omit<FeedbackData, 'comment'>

const INITIAL_FEEDBACK: FeedbackData = {
  tooLong: false,
  outOfDate: false,
  incomplete: false,
  tooShort: false,
  inaccurate: false,
  comment: '',
}

/** Tints the checkbox's checked state with the Arena brand blue instead of emcn's default dark fill. */
function feedbackCheckboxClass() {
  return cn(
    'data-[state=checked]:!border-[var(--color-ds-brand-default,#1A73E8)]',
    'data-[state=checked]:!bg-[var(--color-ds-brand-default,#1A73E8)]'
  )
}

interface FeedbackOptionProps {
  id: FeedbackCheckboxField
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

function FeedbackOption({ id, label, checked, onCheckedChange }: FeedbackOptionProps) {
  return (
    <div className='flex items-center gap-2'>
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className={feedbackCheckboxClass()}
      />
      <label
        htmlFor={id}
        className='cursor-pointer font-normal text-[14px]'
        style={{ color: DEPLOYED_CHAT_TEXT_BODY }}
      >
        {label}
      </label>
    </div>
  )
}

export function FeedbackBox({
  isOpen,
  onClose,
  onSubmit,
  currentExecutionId,
  isLikeFeedback = false,
}: FeedbackBoxProps) {
  const [feedback, setFeedback] = useState<FeedbackData>(INITIAL_FEEDBACK)

  const handleCheckboxChange = (field: FeedbackCheckboxField, checked: boolean) => {
    setFeedback((prev) => ({ ...prev, [field]: checked }))
  }

  const handleCommentChange = (value: string) => {
    setFeedback((prev) => ({ ...prev, comment: value }))
  }

  const handleSubmit = () => {
    onSubmit?.(feedback, currentExecutionId || '')
    setFeedback(INITIAL_FEEDBACK)
    onClose?.()
  }

  // For like feedback, allow submission even without a comment
  const hasAnyFeedback = isLikeFeedback
    ? true
    : feedback.tooLong ||
      feedback.outOfDate ||
      feedback.incomplete ||
      feedback.tooShort ||
      feedback.inaccurate ||
      Boolean(feedback.comment?.trim())

  if (!isOpen) return null

  return (
    <div
      className='overflow-auto rounded-2xl border p-4'
      style={{
        backgroundColor: DEPLOYED_CHAT_CANVAS_BG,
        borderColor: DEPLOYED_CHAT_SIDEBAR_BORDER,
      }}
    >
      <div className='mb-3 flex items-center justify-between gap-3'>
        <h3
          className='font-semibold text-[length:var(--text-ds-heading-xsm,16px)] leading-[var(--leading-ds-heading-xsm,24px)]'
          style={{ color: DEPLOYED_CHAT_TEXT_DISPLAY }}
        >
          Help us out
        </h3>
        <button
          type='button'
          onClick={onClose}
          className={messageActionIconButtonClass()}
          aria-label='Close feedback form'
        >
          <X className='size-4' />
        </button>
      </div>

      <div
        className='space-y-4 rounded-xl border bg-white p-4'
        style={{ borderColor: DEPLOYED_CHAT_DIVIDER }}
      >
        {!isLikeFeedback && (
          <div className='grid grid-cols-2 gap-4'>
            <div className='space-y-3'>
              <FeedbackOption
                id='tooLong'
                label='Too Long'
                checked={feedback.tooLong}
                onCheckedChange={(checked) => handleCheckboxChange('tooLong', checked)}
              />
              <FeedbackOption
                id='outOfDate'
                label='Out of Date'
                checked={feedback.outOfDate}
                onCheckedChange={(checked) => handleCheckboxChange('outOfDate', checked)}
              />
              <FeedbackOption
                id='incomplete'
                label='Incomplete'
                checked={feedback.incomplete}
                onCheckedChange={(checked) => handleCheckboxChange('incomplete', checked)}
              />
            </div>
            <div className='space-y-3'>
              <FeedbackOption
                id='tooShort'
                label='Too Short'
                checked={feedback.tooShort}
                onCheckedChange={(checked) => handleCheckboxChange('tooShort', checked)}
              />
              <FeedbackOption
                id='inaccurate'
                label='Inaccurate'
                checked={feedback.inaccurate}
                onCheckedChange={(checked) => handleCheckboxChange('inaccurate', checked)}
              />
            </div>
          </div>
        )}

        <div className='space-y-2'>
          <div className='font-normal text-[14px]' style={{ color: DEPLOYED_CHAT_TEXT_MUTED }}>
            {isLikeFeedback ? 'Feedback' : 'Other feedback'}
          </div>
          <ChipTextarea
            placeholder={isLikeFeedback ? 'Share your feedback...' : 'Other feedback'}
            value={feedback.comment}
            onChange={(e) => handleCommentChange(e.target.value)}
            rows={4}
          />
        </div>

        <div className='flex justify-end gap-2 pt-1'>
          <button
            type='button'
            onClick={onClose}
            className='rounded-lg border px-3 py-1.5 font-medium text-[14px] transition-colors hover:bg-[var(--color-ds-brand-surface,#F3F8FE)]'
            style={{ borderColor: DEPLOYED_CHAT_DIVIDER, color: DEPLOYED_CHAT_TEXT_BODY }}
          >
            Cancel
          </button>
          <button
            type='button'
            onClick={handleSubmit}
            disabled={!hasAnyFeedback}
            className='rounded-lg bg-[var(--color-ds-brand-default,#1A73E8)] px-3 py-1.5 font-medium text-[14px] text-white transition-colors hover:bg-[var(--color-ds-brand-hover,#155CBA)] disabled:cursor-not-allowed disabled:opacity-50'
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  )
}

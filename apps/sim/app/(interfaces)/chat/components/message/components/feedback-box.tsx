'use client'

import { useState } from 'react'
import { Button, Checkbox, ChipTextarea } from '@sim/emcn'
import { X } from 'lucide-react'
import { messageActionIconButtonClass } from '@/app/(interfaces)/chat/components/message/components/message-action-icons'

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
      />
      <label htmlFor={id} className='cursor-pointer text-[var(--text-primary)] text-sm'>
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
    <div className='overflow-auto rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4'>
      <div className='mb-3 flex items-center justify-between gap-3'>
        <h3 className='text-[16px] text-[var(--text-primary)] leading-[24px]'>Help us out</h3>
        <button
          type='button'
          onClick={onClose}
          className={messageActionIconButtonClass()}
          aria-label='Close feedback form'
        >
          <X className='size-4' />
        </button>
      </div>

      <div className='space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4'>
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
          <div className='text-[var(--text-muted)] text-sm'>
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
          <Button type='button' variant='ghost' onClick={onClose}>
            Cancel
          </Button>
          <Button type='button' variant='primary' onClick={handleSubmit} disabled={!hasAnyFeedback}>
            Submit
          </Button>
        </div>
      </div>
    </div>
  )
}

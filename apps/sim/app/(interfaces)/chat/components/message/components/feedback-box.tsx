'use client'

import { useState } from 'react'
import {
  Checkbox,
  ChipModal,
  ChipModalBody,
  ChipModalField,
  ChipModalFooter,
  ChipModalHeader,
} from '@sim/emcn'

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

const DISLIKE_OPTIONS: Array<{ id: FeedbackCheckboxField; label: string }> = [
  { id: 'tooLong', label: 'Too long' },
  { id: 'tooShort', label: 'Too short' },
  { id: 'outOfDate', label: 'Out of date' },
  { id: 'inaccurate', label: 'Inaccurate' },
  { id: 'incomplete', label: 'Incomplete' },
]

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
      <label
        htmlFor={id}
        className='cursor-pointer font-[family-name:var(--font-inter)] text-[var(--text-primary)] text-small'
      >
        {label}
      </label>
    </div>
  )
}

export function FeedbackBox({
  isOpen = false,
  onClose,
  onSubmit,
  currentExecutionId,
  isLikeFeedback = false,
}: FeedbackBoxProps) {
  const [feedback, setFeedback] = useState<FeedbackData>(INITIAL_FEEDBACK)

  const handleCheckboxChange = (field: FeedbackCheckboxField, checked: boolean) => {
    setFeedback((prev) => ({ ...prev, [field]: checked }))
  }

  const handleClose = () => {
    setFeedback(INITIAL_FEEDBACK)
    onClose?.()
  }

  const handleSubmit = () => {
    onSubmit?.(feedback, currentExecutionId || '')
    setFeedback(INITIAL_FEEDBACK)
    onClose?.()
  }

  const hasAnyFeedback = isLikeFeedback
    ? true
    : feedback.tooLong ||
      feedback.outOfDate ||
      feedback.incomplete ||
      feedback.tooShort ||
      feedback.inaccurate ||
      Boolean(feedback.comment?.trim())

  return (
    <ChipModal
      open={isOpen}
      onOpenChange={(open) => !open && handleClose()}
      srTitle='Give feedback'
    >
      <ChipModalHeader onClose={handleClose}>Give feedback</ChipModalHeader>
      <ChipModalBody>
        {!isLikeFeedback && (
          <div className='grid grid-cols-2 gap-3 px-2'>
            {DISLIKE_OPTIONS.map((option) => (
              <FeedbackOption
                key={option.id}
                id={option.id}
                label={option.label}
                checked={feedback[option.id]}
                onCheckedChange={(checked) => handleCheckboxChange(option.id, checked)}
              />
            ))}
          </div>
        )}
        <ChipModalField
          type='textarea'
          title='Feedback'
          value={feedback.comment ?? ''}
          onChange={(value) => setFeedback((prev) => ({ ...prev, comment: value }))}
          rows={6}
          minHeight={140}
          resizable
          placeholder={
            isLikeFeedback ? 'Tell us what was helpful...' : 'Tell us what went wrong...'
          }
        />
      </ChipModalBody>
      <ChipModalFooter
        onCancel={handleClose}
        primaryAction={{
          label: 'Submit',
          onClick: handleSubmit,
          disabled: !hasAnyFeedback,
        }}
      />
    </ChipModal>
  )
}

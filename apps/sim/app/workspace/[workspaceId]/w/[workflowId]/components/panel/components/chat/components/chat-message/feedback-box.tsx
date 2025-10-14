import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'

interface FeedbackBoxProps {
  isOpen?: boolean
  onClose?: () => void
  onSubmit?: (feedback: FeedbackData) => void
}

interface FeedbackData {
  tooLong: boolean
  outOfDate: boolean
  incomplete: boolean
  tooShort: boolean
  inaccurate: boolean
  comment?: string
}

export function FeedbackBox({ isOpen, onClose, onSubmit }: FeedbackBoxProps) {
  const [feedback, setFeedback] = useState<FeedbackData>({
    tooLong: false,
    outOfDate: false,
    incomplete: false,
    tooShort: false,
    inaccurate: false,
    comment: '',
  })

  const handleCheckboxChange = (field: keyof Omit<FeedbackData, 'comment'>, checked: boolean) => {
    setFeedback((prev) => ({
      ...prev,
      [field]: checked,
    }))
  }

  const handleCommentChange = (value: string) => {
    setFeedback((prev) => ({
      ...prev,
      comment: value,
    }))
  }

  const handleSubmit = () => {
    onSubmit?.(feedback)
    // Reset form
    setFeedback({
      tooLong: false,
      outOfDate: false,
      incomplete: false,
      tooShort: false,
      inaccurate: false,
      comment: '',
    })
    onClose?.()
  }

  const hasAnyFeedback =
    feedback.tooLong ||
    feedback.outOfDate ||
    feedback.incomplete ||
    feedback.tooShort ||
    feedback.inaccurate ||
    feedback.comment?.trim()

  if (!isOpen) return null

  return (
      <Card className='  max-w-lg overflow-auto shadow-lg'>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='text-center font-medium text-xl'>Help us out</CardTitle>
          <Button
            variant='ghost'
            size='icon'
            className='h-8 w-8 rounded-full hover:bg-gray-100'
            onClick={onClose}
            type='button'
            aria-label='Close feedback form'
          >
            <X className='h-4 w-4' />
          </Button>
        </CardHeader>
        <CardContent className='space-y-4'>
          {/* Feedback checkboxes */}
          <div className='grid grid-cols-2 gap-4'>
            <div className='space-y-3'>
              <div className='flex items-center space-x-2'>
                <Checkbox
                  id='tooLong'
                  checked={feedback.tooLong}
                  onCheckedChange={(checked) => handleCheckboxChange('tooLong', checked as boolean)}
                />
                <label htmlFor='tooLong' className='font-medium text-sm'>
                  Too Long
                </label>
              </div>
              <div className='flex items-center space-x-2'>
                <Checkbox
                  id='outOfDate'
                  checked={feedback.outOfDate}
                  onCheckedChange={(checked) =>
                    handleCheckboxChange('outOfDate', checked as boolean)
                  }
                />
                <label htmlFor='outOfDate' className='font-medium text-sm'>
                  Out of Date
                </label>
              </div>
              <div className='flex items-center space-x-2'>
                <Checkbox
                  id='incomplete'
                  checked={feedback.incomplete}
                  onCheckedChange={(checked) =>
                    handleCheckboxChange('incomplete', checked as boolean)
                  }
                />
                <label htmlFor='incomplete' className='font-medium text-sm'>
                  Incomplete
                </label>
              </div>
            </div>

            <div className='space-y-3'>
              <div className='flex items-center space-x-2'>
                <Checkbox
                  id='tooShort'
                  checked={feedback.tooShort}
                  onCheckedChange={(checked) =>
                    handleCheckboxChange('tooShort', checked as boolean)
                  }
                />
                <label htmlFor='tooShort' className='font-medium text-sm'>
                  Too Short
                </label>
              </div>
              <div className='flex items-center space-x-2'>
                <Checkbox
                  id='inaccurate'
                  checked={feedback.inaccurate}
                  onCheckedChange={(checked) =>
                    handleCheckboxChange('inaccurate', checked as boolean)
                  }
                />
                <label htmlFor='inaccurate' className='font-medium text-sm'>
                  Inaccurate
                </label>
              </div>
            </div>
          </div>

          {/* Other feedback textarea */}
          <div className='space-y-2'>
            <div className='font-medium text-gray-700 text-sm dark:text-gray-300'>
              Other feedback
            </div>
            <Textarea
              id='comment'
              placeholder='Other feedback'
              value={feedback.comment}
              onChange={(e) => handleCommentChange(e.target.value)}
              className='min-h-[100px] resize-none'
            />
          </div>

          {/* Action buttons */}
          <div className='flex justify-end space-x-2 pt-4'>
            <Button variant='outline' onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!hasAnyFeedback}
              className='bg-blue-600 hover:bg-blue-700'
            >
              Submit
            </Button>
          </div>
        </CardContent>
      </Card>
  )
}

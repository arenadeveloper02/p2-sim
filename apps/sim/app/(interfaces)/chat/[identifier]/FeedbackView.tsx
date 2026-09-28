'use client'

import { Tooltip } from '@sim/emcn'
import { createLogger } from '@sim/logger'
import { ArrowLeft, ThumbsDown, ThumbsUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import MarkdownRenderer from '@/app/(interfaces)/chat/components/message/components/markdown-renderer'

const logger = createLogger('FeedbackView')

interface FeedbackItem {
  executionId?: string
  id?: string
  timestamp?: string
  createdAt?: string
  updatedAt?: string
  author?: string
  userId?: string
  userEmail?: string
  prompt?: string
  userQuery?: string
  userPrompt?: string
  response?: string
  agentResponse?: string
  feedback?: {
    inAccurate?: boolean
    inComplete?: boolean
    incomplete?: boolean
    outOfDate?: boolean
    tooLong?: boolean
    tooShort?: boolean
    comment?: string
    liked?: boolean | null
  }
  // Direct feedback fields (if API returns them at top level)
  inAccurate?: boolean
  inComplete?: boolean
  incomplete?: boolean
  outOfDate?: boolean
  tooLong?: boolean
  tooShort?: boolean
  comment?: string
  liked?: boolean | null
}

interface FeedbackViewProps {
  feedbackData: FeedbackItem[]
  isLoading: boolean
  error: string | null
  workflowTitle?: string
  page: number
  pageSize: number
  totalPages: number
  totalCount: number
  onPageChange: (page: number) => void
  onBack: () => void
}

const formatDate = (dateString: string) => {
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateString
  }
}

const getFeedbackTags = (item: FeedbackItem) => {
  const tags: Array<{ label: string; color: string }> = []

  // Check feedback object first, then top-level fields
  const inAccurate = item.feedback?.inAccurate ?? item.inAccurate
  const inComplete =
    item.feedback?.inComplete ?? item.feedback?.incomplete ?? item.inComplete ?? item.incomplete
  const outOfDate = item.feedback?.outOfDate ?? item.outOfDate
  const tooLong = item.feedback?.tooLong ?? item.tooLong
  const tooShort = item.feedback?.tooShort ?? item.tooShort
  const liked = item.feedback?.liked ?? item.liked
  const comment = item.feedback?.comment ?? item.comment

  if (inAccurate) tags.push({ label: 'Inaccurate', color: 'bg-red-100 text-red-800' })
  if (inComplete) tags.push({ label: 'Incomplete', color: 'bg-orange-100 text-orange-800' })
  if (outOfDate) tags.push({ label: 'Out of Date', color: 'bg-yellow-100 text-yellow-800' })
  if (tooLong) tags.push({ label: 'Too Long', color: 'bg-purple-100 text-purple-800' })
  if (tooShort) tags.push({ label: 'Too Short', color: 'bg-blue-100 text-blue-800' })
  // if (liked === true) tags.push({ label: 'Liked', color: 'bg-green-100 text-green-800' })

  return { tags, comment }
}

export function FeedbackView({
  feedbackData,
  isLoading,
  error,
  workflowTitle,
  page,
  pageSize,
  totalPages,
  totalCount,
  onPageChange,
  onBack,
}: FeedbackViewProps) {
  if (isLoading) {
    return (
      <div className='flex h-full w-full items-center justify-center bg-[var(--color-ds-brand-surface)]'>
        <div className='text-[var(--color-ds-text-secondary)] text-sm'>Loading feedback...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className='flex h-full w-full items-center justify-center bg-[var(--color-ds-brand-surface)]'>
        <div className='text-[var(--color-ds-status-error-default)] text-sm'>{error}</div>
      </div>
    )
  }

  return (
    <div className='flex h-full w-full flex-col overflow-hidden'>
      {/* Header */}
      <div className='flex items-center gap-4 border-[var(--color-ds-border-default)] border-b bg-[var(--color-ds-brand-surface)] px-6 py-4'>
        <Button variant='ghost' size='icon' className='h-8 w-8' onClick={onBack}>
          <ArrowLeft className='h-4 w-4' />
        </Button>
        <h1 className='font-semibold text-[var(--color-ds-text-primary)] text-base'>{'BACK'}</h1>
      </div>

      {/* Content */}
      <div className='flex-1 overflow-y-auto bg-[var(--color-ds-brand-surface)] px-6 py-6'>
        <Tooltip.Provider>
          <div className='mx-auto max-w-7xl space-y-6'>
            {feedbackData.length === 0 ? (
              <div className='flex items-center justify-center py-12'>
                <div className='text-[var(--color-ds-text-secondary)] text-sm'>
                  No feedback available
                </div>
              </div>
            ) : (
              feedbackData.map((item, index) => {
                const { tags: feedbackTags, comment } = getFeedbackTags(item)
                const itemId = item.executionId || item.id || `feedback-${index}`
                const timestamp = item.timestamp || item.createdAt || item.updatedAt || ''
                const author = item.author || item.userEmail || item.userId || 'Unknown'
                const prompt = item.userPrompt || item.prompt || item.userQuery || ''
                const response = item.response || item.agentResponse || ''

                return (
                  <div
                    key={itemId}
                    className='rounded-lg border border-[var(--color-ds-border-default)] bg-[var(--color-ds-surface-raised)] p-6 shadow-sm'
                  >
                    {/* Timestamp and Author */}
                    {timestamp && (
                      <div className='mb-4 flex items-center justify-between border-[var(--color-ds-border-subtle)] border-b pb-3'>
                        <div className='text-[var(--color-ds-text-secondary)] text-sm'>
                          {formatDate(timestamp)}
                        </div>
                        {author && (
                          <div className='text-[var(--color-ds-text-secondary)] text-sm'>
                            Author: {author}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Prompt */}
                    {prompt && (
                      <div className='mb-4'>
                        <div className='mb-2 font-semibold text-[var(--color-ds-text-secondary)] text-sm'>
                          Prompt
                        </div>
                        <div className='rounded-md bg-[var(--color-ds-brand-surface)] px-4 py-3'>
                          <div className='text-[var(--color-ds-text-primary)] text-sm'>
                            <MarkdownRenderer content={prompt} />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Response */}
                    {response && (
                      <div className='mb-4'>
                        <div className='mb-2 font-semibold text-[var(--color-ds-text-secondary)] text-sm'>
                          Response
                        </div>
                        <div className='rounded-md bg-[var(--color-ds-brand-surface)] px-4 py-3'>
                          <div className='text-[var(--color-ds-text-primary)] text-sm'>
                            <MarkdownRenderer content={response} />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Feedback */}
                    {(() => {
                      const liked = item.feedback?.liked ?? item.liked
                      const hasFeedback = feedbackTags.length > 0 || comment || liked === true

                      if (!hasFeedback) return null

                      // If only liked feedback with no tags or comments, show just the header
                      if (liked === true && feedbackTags.length === 0 && !comment) {
                        return (
                          <div>
                            <div className='mb-2 flex items-center gap-2 font-semibold text-[var(--color-ds-text-secondary)] text-sm'>
                              <span>Feedback</span>
                              <span className='flex items-center gap-1 font-medium text-[var(--color-ds-status-success-text)] text-xs'>
                                <ThumbsUp className='h-3 w-3' />
                                Liked
                              </span>
                            </div>
                          </div>
                        )
                      }

                      // Show full feedback section with tags and/or comments
                      return (
                        <div>
                          <div className='mb-2 flex items-center gap-2 font-semibold text-[var(--color-ds-text-secondary)] text-sm'>
                            <span>Feedback</span>
                            {liked === true && (
                              <span className='flex items-center gap-1 font-medium text-[var(--color-ds-status-success-text)] text-xs'>
                                <ThumbsUp className='h-3 w-3' />
                                Liked
                              </span>
                            )}
                            {liked === false && (
                              <span className='flex items-center gap-1 font-medium text-[var(--color-ds-status-error-text)] text-xs'>
                                <ThumbsDown className='h-3 w-3' />
                                Disliked
                              </span>
                            )}
                          </div>
                          <div className='flex flex-wrap gap-2'>
                            {feedbackTags.map((tag, tagIndex) => (
                              <span
                                key={tagIndex}
                                className={`rounded-full px-3 py-1 font-medium text-xs ${tag.color}`}
                              >
                                {tag.label}
                              </span>
                            ))}
                            {comment && (
                              <div className='mt-2 w-full rounded-md bg-[var(--color-ds-brand-surface)] px-4 py-2'>
                                <div className='text-[var(--color-ds-text-secondary)] text-sm'>
                                  <MarkdownRenderer content={comment} />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )
              })
            )}
          </div>
        </Tooltip.Provider>
        {feedbackData.length > 0 && (
          <div className='mx-auto mt-6 flex max-w-7xl items-center justify-between'>
            <div className='text-gray-600 text-sm'>
              Page {page} of {Math.max(totalPages, 1)} • {totalCount} items
            </div>
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => onPageChange(Math.max(page - 1, 1))}
                disabled={isLoading || page <= 1}
              >
                Previous
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={() => onPageChange(Math.min(page + 1, Math.max(totalPages, 1)))}
                disabled={isLoading || page >= Math.max(totalPages, 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

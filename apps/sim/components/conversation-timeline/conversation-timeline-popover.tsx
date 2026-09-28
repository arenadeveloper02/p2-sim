'use client'

import { cn, Tooltip } from '@sim/emcn'

/**
 * Same threshold as arena left-nav thread rows: only show a tooltip when the
 * prompt is long enough that the truncated label is useful to expand.
 */
const PROMPT_TOOLTIP_MIN_LENGTH = 23

export interface ConversationTimelinePopoverItem {
  id: string
  /** Full prompt text; CSS `truncate` ellipsizes in the row. */
  label: string
}

interface ConversationTimelinePopoverProps {
  items: ConversationTimelinePopoverItem[]
  /** Marker currently under the pointer (or scroll-active when none hovered). */
  highlightedId: string | null
  onSelect: (messageId: string) => void
  onHighlight: (messageId: string | null) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}

/**
 * ChatGPT-style prompt list that appears to the left of the timeline rail.
 * Row hover/active chrome matches arena left-nav threads (indication wash +
 * link-hover blue). Long prompts ellipsize and use the shared {@link Tooltip}.
 */
export function ConversationTimelinePopover({
  items,
  highlightedId,
  onSelect,
  onHighlight,
  onMouseEnter,
  onMouseLeave,
}: ConversationTimelinePopoverProps) {
  return (
    <Tooltip.Provider>
      <div
        role='listbox'
        aria-label='Conversation prompts'
        className={cn(
          'pointer-events-auto absolute top-1/2 right-full z-20 mr-3 w-[220px] -translate-y-1/2',
          'max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain rounded-xl border border-[var(--border)]',
          // Same contrast model as left-nav: canvas/brand panel so indication (raised) hover reads in light theme.
          'bg-[var(--color-ds-canvas,var(--color-ds-brand-surface,var(--surface-2)))] py-1.5 shadow-lg'
        )}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {items.map((item) => {
          const isHighlighted = item.id === highlightedId
          const showTooltip = item.label.length > PROMPT_TOOLTIP_MIN_LENGTH

          const row = (
            <button
              type='button'
              role='option'
              aria-selected={isHighlighted}
              className={cn(
                // Mirror arena left-nav thread rows: indication wash + link-hover blue text.
                'group flex w-full min-w-0 rounded-lg px-3 py-1.5 text-left text-sm transition-colors',
                isHighlighted
                  ? 'bg-[var(--color-ds-indication,var(--surface-5))] font-medium text-[var(--color-ds-text-link-hover,#155CBA)]'
                  : cn(
                      'bg-transparent font-normal text-[var(--color-ds-text-primary,var(--text-primary))]',
                      'hover:bg-[var(--color-ds-indication,var(--surface-5))] hover:text-[var(--color-ds-text-link-hover,#155CBA)]'
                    )
              )}
              onMouseEnter={() => onHighlight(item.id)}
              onClick={() => onSelect(item.id)}
            >
              <span className='min-w-0 flex-1 truncate'>{item.label}</span>
            </button>
          )

          if (!showTooltip) {
            return (
              <div key={item.id} className='min-w-0'>
                {row}
              </div>
            )
          }

          return (
            <Tooltip.Root key={item.id}>
              <Tooltip.Trigger asChild>{row}</Tooltip.Trigger>
              <Tooltip.Content side='left' className='text-sm'>
                <span className='block whitespace-normal break-words text-left'>{item.label}</span>
              </Tooltip.Content>
            </Tooltip.Root>
          )
        })}
      </div>
    </Tooltip.Provider>
  )
}

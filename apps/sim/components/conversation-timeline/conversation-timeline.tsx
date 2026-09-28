'use client'

import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { cn } from '@sim/emcn'
import { ConversationTimelinePopover } from '@/components/conversation-timeline/conversation-timeline-popover'

/**
 * Visibility gate: the timeline stays hidden until the conversation has more
 * than this many user turns (i.e. it appears starting at turn 6).
 */
export const CONVERSATION_TIMELINE_MIN_TURNS = 5

/**
 * Hard cap on rendered ticks. Long threads are evenly sampled so the stack
 * stays ChatGPT-sized instead of packing one tick per message.
 */
const MAX_TIMELINE_MARKERS = 36

/**
 * Reserved right padding on the scroll/content column while the timeline is
 * visible. Matches the absolute tick rail (`right-2` + ~28px hit target) so
 * message text never runs underneath the markers — critical in the narrow
 * copilot side panel.
 */
export const CONVERSATION_TIMELINE_GUTTER_CLASS = 'pr-11' as const

/** Delay before closing the prompt popover when the pointer leaves the rail. */
const POPOVER_CLOSE_DELAY_MS = 120

/**
 * Minimal message shape shared by arena deployed chat (`type`) and mothership
 * copilot chat (`role`). Either field is enough — surfaces pass their native
 * message objects without a mapping layer.
 */
export interface ConversationTimelineMessage {
  id: string
  content: string | Record<string, unknown>
  /** Arena deployed chat discriminator. */
  type?: 'user' | 'assistant'
  /** Mothership / copilot chat discriminator. */
  role?: 'user' | 'assistant'
  /** Welcome / greeting rows are excluded from markers. */
  isInitialMessage?: boolean
}

interface TimelineMarker {
  id: string
  /** 1-based index among rendered markers (used for aria labels). */
  index: number
  /** Truncated user-message preview shown in the hover popover. */
  label: string
}

interface ConversationTimelineProps {
  messages: ConversationTimelineMessage[]
  /** Scrollable chat transcript element — used for active-marker sync. */
  scrollContainerRef: RefObject<HTMLDivElement | null>
  /**
   * Surface-owned jump handler. Arena scrolls the DOM container; mothership
   * must use `virtualizer.scrollToIndex` because off-screen rows are unmounted.
   */
  onJumpToMessage: (messageId: string) => void
}

/** Normalize prompt text for popover rows; CSS truncate handles the ellipsis. */
function previewLabel(content: ConversationTimelineMessage['content']): string {
  if (typeof content === 'string') {
    return content.trim().replace(/\s+/g, ' ')
  }
  return 'Message'
}

/** Prefer `role` (mothership) then `type` (arena); skip welcome rows. */
function isUserTurn(message: ConversationTimelineMessage): boolean {
  const kind = message.role ?? message.type
  return kind === 'user' && !message.isInitialMessage
}

function getUserTurns(messages: ConversationTimelineMessage[]): ConversationTimelineMessage[] {
  return messages.filter(isUserTurn)
}

/**
 * Whether the timeline would render for this message list. Surfaces use this
 * to reserve {@link CONVERSATION_TIMELINE_GUTTER_CLASS} only when needed.
 */
export function shouldShowConversationTimeline(
  messages: ConversationTimelineMessage[]
): boolean {
  return getUserTurns(messages).length > CONVERSATION_TIMELINE_MIN_TURNS
}

/**
 * Evenly sample user turns across the full conversation when over the cap.
 * Always keeps endpoints so the first and last turns remain reachable.
 */
function selectMarkerTurns(
  turns: ConversationTimelineMessage[]
): ConversationTimelineMessage[] {
  if (turns.length <= MAX_TIMELINE_MARKERS) return turns

  const sampled: ConversationTimelineMessage[] = []
  const seen = new Set<string>()

  for (let i = 0; i < MAX_TIMELINE_MARKERS; i++) {
    const index = Math.round((i / (MAX_TIMELINE_MARKERS - 1)) * (turns.length - 1))
    const turn = turns[index]
    if (!turn || seen.has(turn.id)) continue
    seen.add(turn.id)
    sampled.push(turn)
  }

  return sampled
}

function buildMarkers(messages: ConversationTimelineMessage[]): TimelineMarker[] {
  return selectMarkerTurns(getUserTurns(messages)).map((turn, index) => ({
    id: turn.id,
    index: index + 1,
    label: previewLabel(turn.content),
  }))
}

/**
 * Resolve the active tick from scroll position.
 *
 * Prefers DOM measurement via `[data-message-id]` for mounted rows. When the
 * list is virtualized and the target row is unmounted, falls back to mapping
 * scroll progress onto the marker list so the highlight still tracks.
 */
function findActiveMarkerId(
  container: HTMLDivElement,
  markers: TimelineMarker[]
): string | null {
  if (markers.length === 0) return null

  // Bias toward the upper portion of the viewport — closer to how ChatGPT
  // treats the "current" section while reading.
  const targetY = container.getBoundingClientRect().top + container.clientHeight * 0.28
  let bestId: string | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (const marker of markers) {
    const element = container.querySelector(`[data-message-id="${marker.id}"]`)
    if (!(element instanceof HTMLElement)) continue

    const distance = Math.abs(element.getBoundingClientRect().top - targetY)
    if (distance < bestDistance) {
      bestDistance = distance
      bestId = marker.id
    }
  }

  if (bestId) return bestId

  const maxScroll = container.scrollHeight - container.clientHeight
  if (maxScroll <= 0) return markers[0]?.id ?? null
  const progress = Math.min(1, Math.max(0, container.scrollTop / maxScroll))
  const index = Math.round(progress * (markers.length - 1))
  return markers[index]?.id ?? null
}

/**
 * ChatGPT-style conversation timeline: a compact vertical stack of short
 * horizontal ticks on the right edge of the chat viewport.
 *
 * Hovering the rail opens a prompt-list popover (see
 * {@link ConversationTimelinePopover}) so users can scan and jump to earlier
 * turns without scrolling.
 *
 * Used by:
 * - Arena deployed chat (`/chat/…`)
 * - Mothership / copilot chat (`MothershipChat`)
 */
export function ConversationTimeline({
  messages,
  scrollContainerRef,
  onJumpToMessage,
}: ConversationTimelineProps) {
  const markers = useMemo(() => buildMarkers(messages), [messages])
  const markersRef = useRef(markers)
  markersRef.current = markers

  const [activeId, setActiveId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)
  const frameRef = useRef(0)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const openPopover = useCallback(() => {
    clearCloseTimer()
    setIsPopoverOpen(true)
  }, [clearCloseTimer])

  const scheduleClosePopover = useCallback(() => {
    clearCloseTimer()
    closeTimerRef.current = setTimeout(() => {
      setIsPopoverOpen(false)
      setHoveredId(null)
      closeTimerRef.current = null
    }, POPOVER_CLOSE_DELAY_MS)
  }, [clearCloseTimer])

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer])

  /**
   * Update the active tick. Uses a functional setState so identical ids do not
   * trigger an extra render on every scroll frame.
   */
  const syncActiveMarker = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const nextId = findActiveMarkerId(container, markersRef.current)
    if (!nextId) return
    setActiveId((prev) => (prev === nextId ? prev : nextId))
  }, [scrollContainerRef])

  useEffect(() => {
    if (markers.length <= CONVERSATION_TIMELINE_MIN_TURNS) {
      setActiveId(null)
      return
    }

    const container = scrollContainerRef.current
    if (!container) return

    // Coalesce scroll/resize bursts onto one rAF tick — avoids React work per
    // scroll pixel while keeping the highlight snappy.
    const scheduleSync = () => {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = requestAnimationFrame(syncActiveMarker)
    }

    syncActiveMarker()
    container.addEventListener('scroll', scheduleSync, { passive: true })

    const resizeObserver = new ResizeObserver(scheduleSync)
    resizeObserver.observe(container)

    return () => {
      cancelAnimationFrame(frameRef.current)
      container.removeEventListener('scroll', scheduleSync)
      resizeObserver.disconnect()
    }
  }, [markers.length, scrollContainerRef, syncActiveMarker])

  const handleJump = useCallback(
    (messageId: string) => {
      setActiveId(messageId)
      setHoveredId(messageId)
      setIsPopoverOpen(false)
      onJumpToMessage(messageId)
    },
    [onJumpToMessage]
  )

  const highlightedId = hoveredId ?? activeId

  if (markers.length <= CONVERSATION_TIMELINE_MIN_TURNS) {
    return null
  }

  return (
    <nav
      aria-label='Conversation timeline'
      className={cn(
        'absolute top-1/2 right-2 z-10 hidden w-7 -translate-y-1/2 md:flex',
        'max-h-[min(70vh,520px)] flex-col items-center justify-center'
      )}
      onMouseEnter={openPopover}
      onMouseLeave={scheduleClosePopover}
    >
      {isPopoverOpen ? (
        <ConversationTimelinePopover
          items={markers}
          highlightedId={highlightedId}
          onSelect={handleJump}
          onHighlight={setHoveredId}
          onMouseEnter={openPopover}
          onMouseLeave={scheduleClosePopover}
        />
      ) : null}

      {markers.map((marker) => {
        const isActive = marker.id === activeId
        const isHighlighted = marker.id === highlightedId

        return (
          <div key={marker.id} className='relative flex items-center justify-center'>
            {/*
              Hit target is taller than the 2–3px visual tick so ticks stay
              easy to click without looking like a scrollbar thumb.
            */}
            <button
              type='button'
              aria-label={`Jump to message ${marker.index}: ${marker.label}`}
              aria-current={isActive ? 'true' : undefined}
              className={cn(
                'flex h-2.5 w-7 items-center justify-center',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-1)]'
              )}
              onClick={() => handleJump(marker.id)}
              onMouseEnter={() => {
                openPopover()
                setHoveredId(marker.id)
              }}
              onFocus={() => {
                openPopover()
                setHoveredId(marker.id)
              }}
              onBlur={scheduleClosePopover}
            >
              <span
                aria-hidden
                className={cn(
                  'block rounded-full transition-all duration-200 ease-out',
                  isActive || isHighlighted
                    ? 'h-[3px] w-[22px] bg-[var(--text-primary)]'
                    : 'h-[2px] w-[18px] bg-[var(--text-muted)] opacity-55',
                  isHighlighted && !isActive && 'opacity-90'
                )}
              />
            </button>
          </div>
        )
      })}
    </nav>
  )
}

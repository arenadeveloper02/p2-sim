'use client'

import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { cn } from '@/lib/core/utils/cn'
import { ideogramBboxToPixelRect, pixelRectToIdeogramBbox } from '@/lib/ideogram/bbox'
import { parseIdeogramResolution } from '@/lib/ideogram/constants'
import type { IdeogramBbox, IdeogramBuilderElement } from '@/lib/ideogram/types'

interface BboxCanvasProps {
  resolution: string
  elements: IdeogramBuilderElement[]
  activeElementId?: string
  label?: string
  referenceImageUrl?: string
  referenceImageOpacity?: number
  canvasWidth?: number
  disabled?: boolean
  onSelectElement: (id: string) => void
  onChangeElementBbox: (id: string, bbox: IdeogramBbox | undefined) => void
  onDeleteElement?: (id: string) => void
}

const DEFAULT_CANVAS_WIDTH = 320
const HOLD_TO_MOVE_MS = 250
const DRAW_START_THRESHOLD_PX = 4

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

interface PixelRect {
  x: number
  y: number
  width: number
  height: number
}

interface DraftRect {
  elementId: string
  mode: 'draw' | 'resize' | 'pending-move' | 'move'
  selectionCandidateId?: string
  drawElementId?: string
  resizeHandle?: ResizeHandle
  originalRect?: PixelRect
  startX: number
  startY: number
  x: number
  y: number
  width: number
  height: number
}

const RESIZE_HANDLES = [
  { id: 'nw', className: 'top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize' },
  { id: 'n', className: 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize' },
  { id: 'ne', className: 'top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize' },
  { id: 'e', className: 'top-1/2 right-0 translate-x-1/2 -translate-y-1/2 cursor-ew-resize' },
  { id: 'se', className: 'right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize' },
  { id: 's', className: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-ns-resize' },
  { id: 'sw', className: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize' },
  { id: 'w', className: 'top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize' },
] as const satisfies readonly { id: ResizeHandle; className: string }[]

function normalizePixelRect(x1: number, y1: number, x2: number, y2: number): PixelRect {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  }
}

function resizePixelRect(rect: PixelRect, handle: ResizeHandle, x: number, y: number): PixelRect {
  const left = rect.x
  const top = rect.y
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height

  return normalizePixelRect(
    handle.includes('w') ? x : left,
    handle.includes('n') ? y : top,
    handle.includes('e') ? x : right,
    handle.includes('s') ? y : bottom
  )
}

function movePixelRect(
  rect: PixelRect,
  deltaX: number,
  deltaY: number,
  canvasWidth: number,
  canvasHeight: number
): PixelRect {
  const maxX = Math.max(0, canvasWidth - rect.width)
  const maxY = Math.max(0, canvasHeight - rect.height)

  return {
    ...rect,
    x: Math.min(maxX, Math.max(0, rect.x + deltaX)),
    y: Math.min(maxY, Math.max(0, rect.y + deltaY)),
  }
}

export function BboxCanvas({
  resolution,
  elements,
  activeElementId,
  label,
  referenceImageUrl,
  referenceImageOpacity = 0.35,
  canvasWidth = DEFAULT_CANVAS_WIDTH,
  disabled = false,
  onSelectElement,
  onChangeElementBbox,
  onDeleteElement,
}: BboxCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const holdToMoveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [draftRect, setDraftRect] = useState<DraftRect | null>(null)

  const { width: resolutionWidth, height: resolutionHeight } = parseIdeogramResolution(resolution)
  const canvasHeight = Math.max(120, Math.round((canvasWidth * resolutionHeight) / resolutionWidth))
  const activeElement = elements.find((element) => element.id === activeElementId)

  const displayedElements = useMemo(() => {
    return elements
      .map((element, index) => {
        const displayRect =
          element.id === draftRect?.elementId
            ? draftRect.mode === 'pending-move' && draftRect.originalRect
              ? draftRect.originalRect
              : draftRect
            : element.bbox
              ? ideogramBboxToPixelRect(element.bbox, canvasWidth, canvasHeight)
              : null
        return displayRect ? { element, index, displayRect } : null
      })
      .filter(
        (
          item
        ): item is {
          element: IdeogramBuilderElement
          index: number
          displayRect: {
            x: number
            y: number
            width: number
            height: number
          }
        } => item !== null
      )
  }, [canvasHeight, canvasWidth, draftRect, elements])

  const activeDisplayRect = useMemo(() => {
    if (draftRect?.elementId === activeElementId) {
      return draftRect.mode === 'pending-move' && draftRect.originalRect
        ? draftRect.originalRect
        : draftRect
    }
    if (!activeElement?.bbox) return null
    return ideogramBboxToPixelRect(activeElement.bbox, canvasWidth, canvasHeight)
  }, [activeElement?.bbox, activeElementId, canvasHeight, canvasWidth, draftRect])

  const clearHoldToMoveTimeout = useCallback(() => {
    if (!holdToMoveTimeoutRef.current) return
    clearTimeout(holdToMoveTimeoutRef.current)
    holdToMoveTimeoutRef.current = null
  }, [])

  useEffect(() => clearHoldToMoveTimeout, [clearHoldToMoveTimeout])

  const beginDraft = useCallback(
    (event: PointerEvent<HTMLElement>, elementId: string, selectionCandidateId?: string) => {
      if (disabled) return
      clearHoldToMoveTimeout()
      const bounds = canvasRef.current?.getBoundingClientRect()
      if (!bounds) return

      const startX = Math.min(canvasWidth, Math.max(0, event.clientX - bounds.left))
      const startY = Math.min(canvasHeight, Math.max(0, event.clientY - bounds.top))
      canvasRef.current?.focus()
      event.currentTarget.setPointerCapture(event.pointerId)
      setDraftRect({
        elementId,
        mode: 'draw',
        selectionCandidateId,
        startX,
        startY,
        x: startX,
        y: startY,
        width: 0,
        height: 0,
      })
    },
    [canvasHeight, canvasWidth, clearHoldToMoveTimeout, disabled]
  )

  const beginResize = useCallback(
    (
      event: PointerEvent<HTMLElement>,
      elementId: string,
      handle: ResizeHandle,
      rect: PixelRect
    ) => {
      if (disabled) return
      clearHoldToMoveTimeout()
      const bounds = canvasRef.current?.getBoundingClientRect()
      if (!bounds) return

      const startX = Math.min(canvasWidth, Math.max(0, event.clientX - bounds.left))
      const startY = Math.min(canvasHeight, Math.max(0, event.clientY - bounds.top))
      canvasRef.current?.focus()
      event.currentTarget.setPointerCapture(event.pointerId)
      onSelectElement(elementId)
      setDraftRect({
        elementId,
        mode: 'resize',
        resizeHandle: handle,
        originalRect: rect,
        startX,
        startY,
        ...resizePixelRect(rect, handle, startX, startY),
      })
    },
    [canvasHeight, canvasWidth, clearHoldToMoveTimeout, disabled, onSelectElement]
  )

  const beginPendingMove = useCallback(
    (
      event: PointerEvent<HTMLElement>,
      elementId: string,
      drawElementId: string,
      rect: PixelRect
    ) => {
      if (disabled) return
      clearHoldToMoveTimeout()
      const bounds = canvasRef.current?.getBoundingClientRect()
      if (!bounds) return

      const startX = Math.min(canvasWidth, Math.max(0, event.clientX - bounds.left))
      const startY = Math.min(canvasHeight, Math.max(0, event.clientY - bounds.top))
      canvasRef.current?.focus()
      event.currentTarget.setPointerCapture(event.pointerId)
      setDraftRect({
        elementId,
        mode: 'pending-move',
        selectionCandidateId: elementId,
        drawElementId,
        originalRect: rect,
        startX,
        startY,
        ...rect,
      })

      holdToMoveTimeoutRef.current = setTimeout(() => {
        holdToMoveTimeoutRef.current = null
        onSelectElement(elementId)
        setDraftRect((current) =>
          current?.mode === 'pending-move' && current.elementId === elementId
            ? { ...current, mode: 'move' }
            : current
        )
      }, HOLD_TO_MOVE_MS)
    },
    [canvasHeight, canvasWidth, clearHoldToMoveTimeout, disabled, onSelectElement]
  )

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (disabled || !activeElementId) return
      beginDraft(event, activeElementId)
    },
    [activeElementId, beginDraft, disabled]
  )

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (disabled || !draftRect) return
      const bounds = canvasRef.current?.getBoundingClientRect()
      if (!bounds) return

      const currentX = Math.min(canvasWidth, Math.max(0, event.clientX - bounds.left))
      const currentY = Math.min(canvasHeight, Math.max(0, event.clientY - bounds.top))

      if (draftRect.mode === 'pending-move') {
        const deltaX = currentX - draftRect.startX
        const deltaY = currentY - draftRect.startY
        const moved = Math.hypot(deltaX, deltaY)

        if (moved < DRAW_START_THRESHOLD_PX) {
          return
        }

        clearHoldToMoveTimeout()
        setDraftRect({
          ...draftRect,
          mode: 'draw',
          elementId: draftRect.drawElementId ?? draftRect.elementId,
          ...normalizePixelRect(draftRect.startX, draftRect.startY, currentX, currentY),
        })
        return
      }

      if (draftRect.mode === 'move' && draftRect.originalRect) {
        setDraftRect({
          ...draftRect,
          ...movePixelRect(
            draftRect.originalRect,
            currentX - draftRect.startX,
            currentY - draftRect.startY,
            canvasWidth,
            canvasHeight
          ),
        })
        return
      }

      if (draftRect.mode === 'resize' && draftRect.originalRect && draftRect.resizeHandle) {
        setDraftRect({
          ...draftRect,
          ...resizePixelRect(draftRect.originalRect, draftRect.resizeHandle, currentX, currentY),
        })
        return
      }

      setDraftRect({
        ...draftRect,
        ...normalizePixelRect(draftRect.startX, draftRect.startY, currentX, currentY),
      })
    },
    [canvasHeight, canvasWidth, clearHoldToMoveTimeout, disabled, draftRect]
  )

  const handlePointerUp = useCallback(() => {
    if (disabled || !draftRect) return
    clearHoldToMoveTimeout()
    if (draftRect.mode === 'pending-move') {
      if (draftRect.selectionCandidateId) {
        onSelectElement(draftRect.selectionCandidateId)
      }
      setDraftRect(null)
      return
    }

    if (draftRect.width < 4 || draftRect.height < 4) {
      if (draftRect.selectionCandidateId) {
        onSelectElement(draftRect.selectionCandidateId)
      }
      setDraftRect(null)
      return
    }

    onChangeElementBbox(
      draftRect.elementId,
      pixelRectToIdeogramBbox(draftRect, canvasWidth, canvasHeight)
    )
    onSelectElement(draftRect.elementId)
    setDraftRect(null)
  }, [
    canvasHeight,
    canvasWidth,
    clearHoldToMoveTimeout,
    disabled,
    draftRect,
    onChangeElementBbox,
    onSelectElement,
  ])

  const handlePointerCancel = useCallback(() => {
    clearHoldToMoveTimeout()
    setDraftRect(null)
  }, [clearHoldToMoveTimeout])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (disabled || !activeElementId || !onDeleteElement) return
      if (event.key !== 'Delete' && event.key !== 'Backspace') return

      event.preventDefault()
      setDraftRect(null)
      onDeleteElement(activeElementId)
    },
    [activeElementId, disabled, onDeleteElement]
  )

  return (
    <div className='space-y-1'>
      {label ? <p className='text-[12px] text-[var(--text-body-secondary)]'>{label}</p> : null}
      <div
        ref={canvasRef}
        className={cn(
          'relative overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)]',
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-crosshair'
        )}
        style={{ width: canvasWidth, height: canvasHeight }}
        tabIndex={disabled ? undefined : 0}
        aria-label='Ideogram composition frame'
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onKeyDown={handleKeyDown}
      >
        {referenceImageUrl ? (
          <img
            src={referenceImageUrl}
            alt=''
            className='pointer-events-none absolute inset-0 size-full object-cover'
            style={{ opacity: referenceImageOpacity }}
          />
        ) : null}
        {displayedElements.map(({ element, index, displayRect }) => {
          const isActive = element.id === activeElementId
          return (
            <div
              key={element.id}
              role='button'
              tabIndex={disabled ? undefined : 0}
              className={cn(
                'absolute cursor-crosshair border-2 bg-[var(--accent-primary)]/15 font-medium text-[10px]',
                element.shape === 'ellipse' && 'rounded-full',
                element.shape === 'freehand' && 'rounded-[35%]',
                element.shape === 'line' && 'h-1',
                isActive ? 'ring-2 ring-[var(--accent-primary)]' : 'opacity-70',
                element.hidden && 'opacity-30'
              )}
              style={{
                borderColor: element.color || 'var(--accent-primary)',
                backgroundColor: element.color ? `${element.color}24` : undefined,
                color: element.color || 'var(--text-body)',
                left: displayRect.x,
                top: displayRect.y,
                width: displayRect.width,
                height: displayRect.height,
              }}
              onPointerDown={(event) => {
                if (disabled) return
                event.preventDefault()
                event.stopPropagation()
                beginPendingMove(event, element.id, activeElementId ?? element.id, displayRect)
              }}
            >
              {element.shape === 'line' ? null : index + 1}
              {isActive
                ? RESIZE_HANDLES.map((handle) => (
                    <span
                      key={handle.id}
                      className={cn(
                        'absolute size-2 rounded-full border border-[var(--surface-1)] bg-[var(--accent-primary)]',
                        handle.className
                      )}
                      onPointerDown={(event) => {
                        if (disabled) return
                        event.preventDefault()
                        event.stopPropagation()
                        beginResize(event, element.id, handle.id, displayRect)
                      }}
                    />
                  ))
                : null}
            </div>
          )
        })}
      </div>
      <p className='text-[11px] text-[var(--text-body-secondary)]'>
        Select an element, drag in the frame to define its region, hold a box to move it, or use the
        handles to resize it. Bboxes serialize to Ideogram&apos;s 1000×1000 grid.
      </p>
      {activeDisplayRect ? (
        <p className='text-[11px] text-[var(--text-body-secondary)]'>
          Active region: {Math.round(activeDisplayRect.width)}×
          {Math.round(activeDisplayRect.height)}
          px preview.
        </p>
      ) : null}
    </div>
  )
}

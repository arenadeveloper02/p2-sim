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
import {
  BBOX_COORDINATE_LABELS,
  ideogramBboxToPixelRect,
  pixelRectToIdeogramBbox,
  snapIdeogramBbox,
  updateIdeogramBboxCoordinate,
} from '@/lib/ideogram/bbox'
import { parseIdeogramResolution } from '@/lib/ideogram/constants'
import type { IdeogramBbox, IdeogramBuilderElement, IdeogramCanvasSettings } from '@/lib/ideogram/types'
import { resolveElementPalette } from '@/lib/ideogram/build-json-prompt'
import { Input } from '@/components/emcn'

interface BboxCanvasProps {
  resolution: string
  elements: IdeogramBuilderElement[]
  activeElementId?: string
  selectedElementIds?: string[]
  label?: string
  referenceImageUrl?: string
  referenceImageOpacity?: number
  canvasWidth?: number
  canvasSettings?: IdeogramCanvasSettings
  disabled?: boolean
  showNumericEditors?: boolean
  onSelectElement: (id: string) => void
  onSelectElements?: (ids: string[]) => void
  onChangeElementBbox: (id: string, bbox: IdeogramBbox | undefined) => void
  onDeleteElement?: (id: string) => void
  onToggleElementLock?: (id: string) => void
}

const DEFAULT_CANVAS_WIDTH = 320
const HOLD_TO_MOVE_MS = 250
const DRAW_START_THRESHOLD_PX = 4
const SNAP_GRID_STEP = 50

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

function pointInRect(x: number, y: number, rect: PixelRect): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
}

function elementAccentColor(element: IdeogramBuilderElement): string | undefined {
  const palette = resolveElementPalette(element)
  return palette?.[0] ?? element.color
}

function CompositionGuides({
  guideMode,
  canvasWidth,
  canvasHeight,
}: {
  guideMode: NonNullable<IdeogramCanvasSettings['guideMode']>
  canvasWidth: number
  canvasHeight: number
}) {
  const lines: Array<{ key: string; style: React.CSSProperties }> = []

  if (guideMode === 'thirds' || guideMode === 'golden' || guideMode === 'spiral') {
    for (const fraction of [1 / 3, 2 / 3]) {
      lines.push({
        key: `v-${fraction}`,
        style: {
          left: canvasWidth * fraction,
          top: 0,
          width: 1,
          height: canvasHeight,
        },
      })
      lines.push({
        key: `h-${fraction}`,
        style: {
          left: 0,
          top: canvasHeight * fraction,
          width: canvasWidth,
          height: 1,
        },
      })
    }
  }

  if (guideMode === 'grid') {
    const stepX = canvasWidth / 10
    const stepY = canvasHeight / 10
    for (let index = 1; index < 10; index += 1) {
      lines.push({
        key: `grid-v-${index}`,
        style: { left: stepX * index, top: 0, width: 1, height: canvasHeight },
      })
      lines.push({
        key: `grid-h-${index}`,
        style: { left: 0, top: stepY * index, width: canvasWidth, height: 1 },
      })
    }
  }

  return (
    <>
      {lines.map((line) => (
        <span
          key={line.key}
          className='pointer-events-none absolute bg-[var(--text-body-secondary)]/35'
          style={line.style}
        />
      ))}
    </>
  )
}

export function BboxCanvas({
  resolution,
  elements,
  activeElementId,
  selectedElementIds,
  label,
  referenceImageUrl,
  referenceImageOpacity = 0.35,
  canvasWidth = DEFAULT_CANVAS_WIDTH,
  canvasSettings,
  disabled = false,
  showNumericEditors = true,
  onSelectElement,
  onSelectElements,
  onChangeElementBbox,
  onDeleteElement,
  onToggleElementLock,
}: BboxCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const holdToMoveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [draftRect, setDraftRect] = useState<DraftRect | null>(null)
  const [overlapCycleIndex, setOverlapCycleIndex] = useState(0)

  const { width: resolutionWidth, height: resolutionHeight } = parseIdeogramResolution(resolution)
  const canvasHeight = Math.max(120, Math.round((canvasWidth * resolutionHeight) / resolutionWidth))
  const activeElement = elements.find((element) => element.id === activeElementId)
  const showGuides = canvasSettings?.showGuides === true
  const snapToGrid = canvasSettings?.snapToGrid === true
  const hideBoxes = canvasSettings?.hideBoxes === true
  const guideMode = canvasSettings?.guideMode ?? 'thirds'

  const selectedIds = useMemo(() => {
    if (selectedElementIds && selectedElementIds.length > 0) return selectedElementIds
    return activeElementId ? [activeElementId] : []
  }, [activeElementId, selectedElementIds])

  const visibleElements = useMemo(
    () => elements.filter((element) => !element.hidden && (!hideBoxes || element.id === activeElementId)),
    [activeElementId, elements, hideBoxes]
  )

  const displayedElements = useMemo(() => {
    return visibleElements
      .map((element, index) => {
        const displayRect =
          draftRect && element.id === draftRect.elementId
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
          displayRect: PixelRect
        } => item !== null
      )
  }, [canvasHeight, canvasWidth, draftRect, visibleElements])

  const activeDisplayRect = useMemo(() => {
    if (draftRect && draftRect.elementId === activeElementId) {
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

  const finalizeBbox = useCallback(
    (rect: PixelRect): IdeogramBbox => {
      const bbox = pixelRectToIdeogramBbox(rect, canvasWidth, canvasHeight)
      return snapToGrid ? snapIdeogramBbox(bbox, SNAP_GRID_STEP) : bbox
    },
    [canvasHeight, canvasWidth, snapToGrid]
  )

  const findElementsAtPoint = useCallback(
    (x: number, y: number) => {
      return displayedElements
        .filter(({ displayRect }) => pointInRect(x, y, displayRect))
        .map(({ element }) => element.id)
    },
    [displayedElements]
  )

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
      const element = elements.find((item) => item.id === elementId)
      if (element?.locked) return

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
    [canvasHeight, canvasWidth, clearHoldToMoveTimeout, disabled, elements, onSelectElement]
  )

  const beginPendingMove = useCallback(
    (
      event: PointerEvent<HTMLElement>,
      elementId: string,
      drawElementId: string,
      rect: PixelRect
    ) => {
      if (disabled) return
      const element = elements.find((item) => item.id === elementId)
      if (element?.locked) {
        onSelectElement(elementId)
        return
      }

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
    [canvasHeight, canvasWidth, clearHoldToMoveTimeout, disabled, elements, onSelectElement]
  )

  const handleCanvasPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (disabled || !activeElementId) return

      const bounds = canvasRef.current?.getBoundingClientRect()
      if (!bounds) return

      const x = Math.min(canvasWidth, Math.max(0, event.clientX - bounds.left))
      const y = Math.min(canvasHeight, Math.max(0, event.clientY - bounds.top))
      const hits = findElementsAtPoint(x, y)

      if (event.altKey && hits.length > 0) {
        const nextIndex = (overlapCycleIndex + 1) % hits.length
        setOverlapCycleIndex(nextIndex)
        onSelectElement(hits[nextIndex] ?? hits[0])
        return
      }

      if (!event.shiftKey && hits.length > 0 && !event.altKey) {
        return
      }

      beginDraft(event, activeElementId)
    },
    [
      activeElementId,
      beginDraft,
      canvasHeight,
      canvasWidth,
      disabled,
      findElementsAtPoint,
      onSelectElement,
      overlapCycleIndex,
    ]
  )

  const handleElementPointerDown = useCallback(
    (
      event: PointerEvent<HTMLElement>,
      elementId: string,
      drawElementId: string,
      rect: PixelRect
    ) => {
      if (disabled) return
      event.preventDefault()
      event.stopPropagation()

      const bounds = canvasRef.current?.getBoundingClientRect()
      if (!bounds) return

      const x = Math.min(canvasWidth, Math.max(0, event.clientX - bounds.left))
      const y = Math.min(canvasHeight, Math.max(0, event.clientY - bounds.top))

      if (event.altKey) {
        const hits = findElementsAtPoint(x, y)
        const nextIndex = (overlapCycleIndex + 1) % Math.max(hits.length, 1)
        setOverlapCycleIndex(nextIndex)
        onSelectElement(hits[nextIndex] ?? elementId)
        return
      }

      if (event.shiftKey && onSelectElements) {
        const next = selectedIds.includes(elementId)
          ? selectedIds.filter((id) => id !== elementId)
          : [...selectedIds, elementId]
        onSelectElements(next)
        onSelectElement(elementId)
        return
      }

      if (event.shiftKey) {
        onSelectElement(elementId)
        beginDraft(event, drawElementId, elementId)
        return
      }

      beginPendingMove(event, elementId, drawElementId, rect)
    },
    [
      beginDraft,
      beginPendingMove,
      canvasHeight,
      canvasWidth,
      disabled,
      findElementsAtPoint,
      onSelectElement,
      onSelectElements,
      overlapCycleIndex,
      selectedIds,
    ]
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

    onChangeElementBbox(draftRect.elementId, finalizeBbox(draftRect))
    onSelectElement(draftRect.elementId)
    setDraftRect(null)
  }, [
    clearHoldToMoveTimeout,
    disabled,
    draftRect,
    finalizeBbox,
    onChangeElementBbox,
    onSelectElement,
  ])

  const handlePointerCancel = useCallback(() => {
    clearHoldToMoveTimeout()
    setDraftRect(null)
  }, [clearHoldToMoveTimeout])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (disabled || !activeElementId) return

      if ((event.key === 'Delete' || event.key === 'Backspace') && onDeleteElement) {
        event.preventDefault()
        setDraftRect(null)
        onDeleteElement(activeElementId)
        return
      }

      if (event.key.toLowerCase() === 'l' && onToggleElementLock) {
        event.preventDefault()
        onToggleElementLock(activeElementId)
      }
    },
    [activeElementId, disabled, onDeleteElement, onToggleElementLock]
  )

  const handleCoordinateChange = useCallback(
    (index: 0 | 1 | 2 | 3, value: string) => {
      if (!activeElement?.bbox) return
      const next = updateIdeogramBboxCoordinate(activeElement.bbox, index, value)
      if (!next) return
      onChangeElementBbox(activeElement.id, snapToGrid ? snapIdeogramBbox(next, SNAP_GRID_STEP) : next)
    },
    [activeElement, onChangeElementBbox, snapToGrid]
  )

  return (
    <div className='space-y-2'>
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
        onPointerDown={handleCanvasPointerDown}
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
        {showGuides ? (
          <CompositionGuides
            guideMode={guideMode}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
          />
        ) : null}
        {displayedElements.map(({ element, index, displayRect }) => {
          const isActive = selectedIds.includes(element.id)
          const accentColor = elementAccentColor(element)
          const palette = resolveElementPalette(element) ?? []

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
                element.locked && 'border-dashed',
                element.hidden && 'opacity-30'
              )}
              style={{
                borderColor: accentColor || 'var(--accent-primary)',
                backgroundColor: accentColor ? `${accentColor}24` : undefined,
                color: accentColor || 'var(--text-body)',
                left: displayRect.x,
                top: displayRect.y,
                width: displayRect.width,
                height: displayRect.height,
              }}
              onPointerDown={(event) =>
                handleElementPointerDown(
                  event,
                  element.id,
                  activeElementId ?? element.id,
                  displayRect
                )
              }
            >
              {element.shape === 'line' ? null : (
                <span className='px-1'>
                  {index + 1}
                  {element.locked ? ' 🔒' : ''}
                </span>
              )}
              {palette.length > 1 ? (
                <div className='absolute right-0 bottom-0 left-0 flex h-1.5 overflow-hidden'>
                  {palette.map((color) => (
                    <span key={color} className='flex-1' style={{ backgroundColor: color }} />
                  ))}
                </div>
              ) : null}
              {isActive && !element.locked
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
        Select an element, drag to define a region, hold a box to move, Shift+drag to draw over
        boxes, Alt+click to cycle overlaps, and press L to lock the active region.
      </p>
      {activeDisplayRect ? (
        <p className='text-[11px] text-[var(--text-body-secondary)]'>
          Active region: {Math.round(activeDisplayRect.width)}×
          {Math.round(activeDisplayRect.height)}
          px preview.
        </p>
      ) : null}
      {showNumericEditors && activeElement?.bbox ? (
        <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
          {BBOX_COORDINATE_LABELS.map((coordinateLabel, index) => (
            <div key={coordinateLabel} className='space-y-1'>
              <p className='text-[10px] text-[var(--text-body-secondary)]'>{coordinateLabel}</p>
              <Input
                value={String(activeElement.bbox?.[index] ?? '')}
                onChange={(event) =>
                  handleCoordinateChange(index as 0 | 1 | 2 | 3, event.target.value)
                }
                disabled={disabled || activeElement.locked}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

'use client'

import { type PointerEvent, useCallback, useMemo, useRef, useState } from 'react'
import { ideogramBboxToPixelRect, pixelRectToIdeogramBbox } from '@/lib/ideogram/bbox'
import { parseIdeogramResolution } from '@/lib/ideogram/constants'
import type { IdeogramBbox } from '@/lib/ideogram/types'
import { cn } from '@/lib/core/utils/cn'

interface BboxCanvasProps {
  resolution: string
  bbox?: IdeogramBbox
  label?: string
  disabled?: boolean
  onChange: (bbox: IdeogramBbox | undefined) => void
}

const CANVAS_WIDTH = 320

export function BboxCanvas({ resolution, bbox, label, disabled = false, onChange }: BboxCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [draftRect, setDraftRect] = useState<{
    startX: number
    startY: number
    x: number
    y: number
    width: number
    height: number
  } | null>(null)

  const { width: resolutionWidth, height: resolutionHeight } = parseIdeogramResolution(resolution)
  const canvasHeight = Math.max(120, Math.round((CANVAS_WIDTH * resolutionHeight) / resolutionWidth))

  const displayRect = useMemo(() => {
    if (draftRect) return draftRect
    if (!bbox) return null
    return ideogramBboxToPixelRect(bbox, CANVAS_WIDTH, canvasHeight)
  }, [bbox, canvasHeight, draftRect])

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (disabled) return
      const bounds = canvasRef.current?.getBoundingClientRect()
      if (!bounds) return

      const startX = event.clientX - bounds.left
      const startY = event.clientY - bounds.top
      event.currentTarget.setPointerCapture(event.pointerId)
      setDraftRect({ startX, startY, x: startX, y: startY, width: 0, height: 0 })
    },
    [disabled]
  )

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (disabled || !draftRect) return
      const bounds = canvasRef.current?.getBoundingClientRect()
      if (!bounds) return

      const currentX = Math.min(CANVAS_WIDTH, Math.max(0, event.clientX - bounds.left))
      const currentY = Math.min(canvasHeight, Math.max(0, event.clientY - bounds.top))
      const x = Math.min(draftRect.startX, currentX)
      const y = Math.min(draftRect.startY, currentY)
      const width = Math.abs(currentX - draftRect.startX)
      const height = Math.abs(currentY - draftRect.startY)
      setDraftRect({ ...draftRect, x, y, width, height })
    },
    [canvasHeight, disabled, draftRect]
  )

  const handlePointerUp = useCallback(() => {
    if (disabled || !draftRect) return
    if (draftRect.width < 4 || draftRect.height < 4) {
      setDraftRect(null)
      onChange(undefined)
      return
    }

    onChange(pixelRectToIdeogramBbox(draftRect, CANVAS_WIDTH, canvasHeight))
    setDraftRect(null)
  }, [canvasHeight, disabled, draftRect, onChange])

  return (
    <div className='space-y-1'>
      {label ? (
        <p className='text-[12px] text-[var(--text-body-secondary)]'>{label}</p>
      ) : null}
      <div
        ref={canvasRef}
        className={cn(
          'relative overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)]',
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-crosshair'
        )}
        style={{ width: CANVAS_WIDTH, height: canvasHeight }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {displayRect ? (
          <div
            className='absolute border-2 border-[var(--accent-primary)] bg-[var(--accent-primary)]/15'
            style={{
              left: displayRect.x,
              top: displayRect.y,
              width: displayRect.width,
              height: displayRect.height,
            }}
          />
        ) : null}
      </div>
      <p className='text-[11px] text-[var(--text-body-secondary)]'>
        Drag to define a region. Bboxes serialize to Ideogram&apos;s 1000×1000 grid.
      </p>
    </div>
  )
}

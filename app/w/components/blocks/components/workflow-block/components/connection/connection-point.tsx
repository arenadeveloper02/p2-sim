import { cn } from '@/lib/utils'
import { CoordinateTransformer } from '@/app/w/lib/coordinates'
import { useState, useCallback, useEffect } from 'react'

interface ConnectionPointProps {
  position: 'top' | 'bottom'
}

interface ConnectionLine {
  start: { x: number; y: number }
  end: { x: number; y: number }
}

export function ConnectionPoint({ position }: ConnectionPointProps) {
  const [isDrawing, setIsDrawing] = useState(false)
  const [line, setLine] = useState<ConnectionLine | null>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()

    const canvasElement = e.currentTarget.closest(
      '[style*="transform"]'
    ) as HTMLElement
    if (!canvasElement) return

    // Get raw client coordinates
    const startPoint = {
      x: e.clientX,
      y: e.clientY,
    }

    // Use the same conversion pattern as drag and drop
    const canvasPoint = CoordinateTransformer.viewportToCanvas(
      CoordinateTransformer.clientToViewport(startPoint),
      canvasElement
    )

    setIsDrawing(true)
    setLine({
      start: canvasPoint,
      end: canvasPoint,
    })
  }, [])

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDrawing || !line) return

      const canvasElement = document.querySelector(
        '[style*="transform"]'
      ) as HTMLElement
      if (!canvasElement) return

      // Convert current mouse position to canvas coordinates
      const currentPoint = CoordinateTransformer.viewportToCanvas(
        CoordinateTransformer.clientToViewport({
          x: e.clientX,
          y: e.clientY,
        }),
        canvasElement
      )

      setLine((prev) =>
        prev
          ? {
              ...prev,
              end: currentPoint,
            }
          : null
      )
    },
    [isDrawing, line]
  )

  const handleMouseUp = useCallback(() => {
    setIsDrawing(false)
    setLine(null)
  }, [])

  // Add and remove global mouse event listeners
  useEffect(() => {
    if (isDrawing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDrawing, handleMouseMove, handleMouseUp])

  return (
    <>
      <div
        data-connection-point
        onMouseDown={handleMouseDown}
        className={cn(
          'absolute left-1/2 -translate-x-1/2 w-3 h-3',
          'bg-white rounded-full border opacity-0 group-hover:opacity-100',
          'transition-opacity duration-200 cursor-crosshair hover:border-blue-500',
          'hover:scale-110 hover:shadow-sm',
          position === 'top'
            ? '-translate-y-1/2 top-0'
            : 'translate-y-1/2 bottom-0'
        )}
      />
      {line && (
        <svg
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 9999,
            pointerEvents: 'none',
          }}
        >
          <line
            x1={line.start.x}
            y1={line.start.y}
            x2={line.end.x}
            y2={line.end.y}
            stroke="rgb(59 130 246)"
            strokeWidth="2"
            strokeDasharray="5,5"
          />
        </svg>
      )}
    </>
  )
}

import { cn } from '@/lib/utils'
import { CoordinateTransformer } from '@/app/w/lib/coordinates'

interface ConnectionPointProps {
  position: 'top' | 'bottom'
}

export function ConnectionPoint({ position }: ConnectionPointProps) {
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const canvasElement = e.currentTarget.closest(
      '[style*="transform"]'
    ) as HTMLElement
    if (!canvasElement) return

    const elementPosition = CoordinateTransformer.getElementCanvasPosition(
      e.currentTarget,
      canvasElement
    )

    // Test distance calculation
    const testPoint = {
      x: e.clientX + 100,
      y: e.clientY + 100,
    }

    const distance = CoordinateTransformer.getTransformedDistance(
      { x: e.clientX, y: e.clientY },
      testPoint,
      canvasElement
    )

    console.log({
      viewport: CoordinateTransformer.getViewportDimensions(),
      canvasTransform: CoordinateTransformer.getCanvasTransform(canvasElement),
      elementPosition,
      transformedDistance: distance,
    })
  }

  return (
    <div
      data-connection-point
      onClick={handleClick}
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
  )
}

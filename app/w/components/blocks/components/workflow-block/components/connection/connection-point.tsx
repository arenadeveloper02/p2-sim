import { cn } from '@/lib/utils'

interface ConnectionPointProps {
  position: 'top' | 'bottom'
}

export function ConnectionPoint({ position }: ConnectionPointProps) {
  return (
    <div
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

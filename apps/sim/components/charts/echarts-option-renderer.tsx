'use client'

import { useEffect, useRef } from 'react'
import { createLogger } from '@sim/logger'
import {
  type EChartsOptionLike,
  sanitizeEChartsOption,
} from '@/lib/chart-generation/echarts-option'

const logger = createLogger('EChartsOptionRenderer')

export interface EChartsOptionRendererProps {
  option: EChartsOptionLike
  height?: number
  className?: string
  ariaLabel?: string
}

/**
 * Renders a sanitized ECharts option with a dynamic import so the library stays
 * out of the initial bundle and off the SSR path.
 */
export function EChartsOptionRenderer({
  option,
  height = 320,
  className,
  ariaLabel,
}: EChartsOptionRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let disposed = false
    let chart: import('echarts').ECharts | undefined
    let resizeObserver: ResizeObserver | undefined

    void import('echarts')
      .then((echarts) => {
        if (disposed || !container) return
        chart = echarts.init(container)
        chart.setOption(sanitizeEChartsOption(option))
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => chart?.resize())
          resizeObserver.observe(container)
        }
      })
      .catch((error) => {
        logger.error('Failed to render chart', { error })
      })

    return () => {
      disposed = true
      resizeObserver?.disconnect()
      chart?.dispose()
    }
  }, [option])

  return (
    <div
      ref={containerRef}
      className={className ?? 'w-full'}
      style={{ height }}
      role='img'
      aria-label={ariaLabel ?? 'Chart'}
    />
  )
}

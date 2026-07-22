'use client'

import { useEffect, useRef } from 'react'
import { createLogger } from '@sim/logger'
import {
  type EChartsOptionLike,
  sanitizeEChartsOption,
} from '@/lib/chart-generation/echarts-option'

const logger = createLogger('ChatEChartsRenderer')

interface ChatEChartsRendererProps {
  option: EChartsOptionLike
  height?: number
}

/**
 * Renders an agent/tool-provided ECharts option as an interactive chart inside a
 * chat message. ECharts is imported dynamically to keep it out of the initial
 * bundle and avoid SSR issues.
 */
export function ChatEChartsRenderer({ option, height = 400 }: ChatEChartsRendererProps) {
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
        resizeObserver = new ResizeObserver(() => chart?.resize())
        resizeObserver.observe(container)
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

  return <div ref={containerRef} className='my-4 w-full' style={{ height }} />
}

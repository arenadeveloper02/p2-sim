'use client'

import { useEffect, useRef } from 'react'
import { createLogger } from '@sim/logger'
import {
  type EChartsOptionLike,
  sanitizeEChartsOption,
} from '@/lib/chart-generation/echarts-option'

const logger = createLogger('ChatEChartsRenderer')

/**
 * Single shared ECharts module promise so the bundle is fetched once and every
 * chart on the page reuses the same in-flight download.
 */
let echartsModulePromise: Promise<typeof import('echarts')> | null = null

function loadECharts(): Promise<typeof import('echarts')> {
  echartsModulePromise ??= import('echarts')
  return echartsModulePromise
}

// Prefetch the ECharts bundle as soon as this module loads on the client
// (i.e. when a chat surface mounts), during idle time. By the time the first
// chart arrives the bundle is already downloaded, instead of the first chart
// paying the download cost.
if (typeof window !== 'undefined') {
  const prefetch = () => {
    loadECharts().catch(() => {
      // Allow a later render attempt to retry the import.
      echartsModulePromise = null
    })
  }
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(prefetch, { timeout: 3000 })
  } else {
    window.setTimeout(prefetch, 1000)
  }
}

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

    void loadECharts()
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

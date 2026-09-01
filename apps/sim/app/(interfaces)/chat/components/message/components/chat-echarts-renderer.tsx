'use client'

import { EChartsOptionRenderer } from '@/components/charts/echarts-option-renderer'
import type { EChartsOptionLike } from '@/lib/chart-generation/echarts-option'

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
  return <EChartsOptionRenderer option={option} height={height} className='my-4 w-full' />
}

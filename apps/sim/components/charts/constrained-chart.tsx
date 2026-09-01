'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { EChartsOptionRenderer } from '@/components/charts/echarts-option-renderer'
import {
  type ConstrainedChartDsl,
  type ConstrainedChartTheme,
  DEFAULT_CONSTRAINED_CHART_THEME,
  buildConstrainedEChartsOption,
} from '@/lib/chart-generation/constrained-echarts-option'
import type { EChartsOptionLike } from '@/lib/chart-generation/echarts-option'

export interface ConstrainedChartProps {
  dsl: ConstrainedChartDsl
  height?: number
  className?: string
}

function readCssColor(style: CSSStyleDeclaration, property: string, fallback: string): string {
  const value = style.getPropertyValue(property).trim()
  return value || fallback
}

export function resolveGuiChartTheme(element: HTMLElement): ConstrainedChartTheme {
  const style = getComputedStyle(element)
  return {
    text: readCssColor(style, '--gui-text', DEFAULT_CONSTRAINED_CHART_THEME.text),
    muted: readCssColor(style, '--gui-text-muted', DEFAULT_CONSTRAINED_CHART_THEME.muted),
    border: readCssColor(style, '--gui-border', DEFAULT_CONSTRAINED_CHART_THEME.border),
    brand: readCssColor(style, '--gui-brand', DEFAULT_CONSTRAINED_CHART_THEME.brand),
  }
}

/**
 * Arena GUI chart: resolve `--gui-*` tokens from the host, build a constrained
 * ECharts option, and render it with the shared canvas helper.
 */
export function ConstrainedChart({ dsl, height = 320, className }: ConstrainedChartProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [option, setOption] = useState<EChartsOptionLike | null>(null)
  const label = dsl.title ?? 'Chart'

  useLayoutEffect(() => {
    const host = hostRef.current
    const theme = host ? resolveGuiChartTheme(host) : DEFAULT_CONSTRAINED_CHART_THEME
    setOption(buildConstrainedEChartsOption(dsl, theme))
  }, [dsl])

  return (
    <div ref={hostRef} className={className ?? 'w-full'} data-testid='chart'>
      {option ? (
        <EChartsOptionRenderer option={option} height={height} ariaLabel={label} />
      ) : (
        <div className='w-full' style={{ height }} role='img' aria-label={label} />
      )}
    </div>
  )
}

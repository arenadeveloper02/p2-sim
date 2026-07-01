'use client'

import { memo, useEffect, useMemo, useRef, useState } from 'react'
import * as echarts from 'echarts'
import { createLogger } from '@sim/logger'
import { type ChartSpec, isSpec3D } from '@/lib/chat/chart-types'
import {
  type ChartTheme,
  DARK_THEME,
  LIGHT_THEME,
  specToEChartsOption,
} from '@/lib/chat/echarts-adapter'

const logger = createLogger('ChatChartRenderer')

const DEFAULT_HEIGHT = 320
const DEFAULT_HEIGHT_3D = 400

/** Loaded once per session; echarts-gl augments the global echarts instance. */
let glLoadPromise: Promise<void> | null = null
function ensureGLLoaded(): Promise<void> {
  if (!glLoadPromise) {
    glLoadPromise = import('echarts-gl')
      .then(() => undefined)
      .catch((err) => {
        glLoadPromise = null
        throw err
      })
  }
  return glLoadPromise
}

function detectTheme(): ChartTheme {
  if (typeof document === 'undefined') return DARK_THEME
  return document.documentElement.classList.contains('dark') ? DARK_THEME : LIGHT_THEME
}

const SingleChart = memo(function SingleChart({ spec }: { spec: ChartSpec }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const needs3D = isSpec3D(spec)
  const height = spec.height ?? (needs3D ? DEFAULT_HEIGHT_3D : DEFAULT_HEIGHT)

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      try {
        if (needs3D) await ensureGLLoaded()
        if (cancelled || !containerRef.current) return

        if (!chartRef.current) {
          chartRef.current = echarts.init(containerRef.current, undefined, {
            renderer: needs3D ? 'canvas' : 'svg',
          })
        }

        const option = specToEChartsOption(spec, detectTheme())
        chartRef.current.setOption(option, true)
        setReady(true)
      } catch (err) {
        logger.error('Failed to render chart', { err })
        if (!cancelled) setError('Unable to render chart.')
      }
    }

    init()

    return () => {
      cancelled = true
    }
  }, [spec, needs3D])

  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(() => {
      chartRef.current?.resize()
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    return () => {
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [])

  if (error) {
    return (
      <div className='rounded-lg border border-[var(--border-1)] bg-[var(--surface-5)] px-3 py-2 text-[var(--text-secondary)] text-xs'>
        {error}
      </div>
    )
  }

  return (
    <div className='w-full overflow-hidden rounded-lg border border-[var(--border-1)] bg-[var(--surface-3,transparent)]'>
      <div
        ref={containerRef}
        style={{ height, width: '100%', opacity: ready ? 1 : 0, transition: 'opacity 150ms' }}
      />
    </div>
  )
})

/**
 * Renders backend-provided chart specs. Shared by the deployed chat and the
 * in-workspace workflow chat panel. Rendering only — all chart structure (type,
 * axes, series) is decided by the backend and passed in via `specs`.
 */
export const ChartRenderer = memo(function ChartRenderer({ specs }: { specs: ChartSpec[] }) {
  const validSpecs = useMemo(
    () => specs.filter((s) => s && Array.isArray(s.series) && s.series.length > 0),
    [specs]
  )

  if (validSpecs.length === 0) return null

  return (
    <div className='flex w-full flex-col gap-3'>
      {validSpecs.map((spec, index) => (
        <SingleChart key={spec.id ?? index} spec={spec} />
      ))}
    </div>
  )
})

export default ChartRenderer

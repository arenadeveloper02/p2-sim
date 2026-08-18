'use client'

import {
  type CSSProperties,
  type FormEvent,
  Fragment,
  type ReactNode,
  useEffect,
  useState,
} from 'react'
import type { Spec } from '@json-render/core'
import { cn } from '@sim/emcn'
import { isPlainRecord } from '@sim/utils/object'
import {
  displayTextFromActionData,
  omitActionTelemetry,
  parseJsonLiteral,
  parseTabItems,
  splitNavTarget,
} from '@/lib/arena-generative-ui/types'
import { MarkdownText } from '@/app/(interfaces)/gui-apps/[identifier]/markdown-text'

interface SpecElement {
  type?: string
  props?: Record<string, unknown>
  children?: string[]
}

interface SpecRendererProps {
  spec: Spec
  state: Record<string, unknown>
  pending: boolean
  onNavigate: (path: string) => void
  onRunAction: (actionId: string, values: Record<string, unknown>) => Promise<void>
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asBoolean(value: unknown): boolean {
  return value === true
}

function asPositiveNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }
  return fallback
}

const DEFAULT_PROGRESS_DURATION_MS = 150_000

const SECTION_WIDTHS = {
  narrow: 'max-w-2xl',
  wide: 'max-w-[1280px]',
  full: 'max-w-none',
} as const

/** Minimum track width per `Grid.columns` before the grid collapses. */
const GRID_MIN_ITEM_WIDTHS: Record<string, string> = {
  '2': '420px',
  '3': '300px',
  '4': '240px',
}

const DEFAULT_GRID_MIN_ITEM_WIDTH = '280px'

const TONE_CLASSES = {
  info: 'bg-sky-50 text-sky-900',
  success: 'bg-emerald-50 text-emerald-800',
  warning: 'bg-amber-50 text-amber-900',
  error: 'bg-red-50 text-red-800',
} as const

function toneClass(value: unknown, fallback: keyof typeof TONE_CLASSES = 'info'): string {
  const tone = asString(value, fallback)
  return TONE_CLASSES[tone as keyof typeof TONE_CLASSES] ?? TONE_CLASSES[fallback]
}

const BUTTON_BASE_CLASS =
  'inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ds-blue-600,#2563eb)]'

const BUTTON_VARIANT_CLASSES = {
  primary:
    'bg-[var(--color-ds-blue-600,#2563eb)] text-white hover:bg-[var(--color-ds-blue-700,#1d4ed8)]',
  secondary:
    'border border-[var(--color-ds-grey-300,#c5c6cc)] bg-white text-[var(--color-ds-grey-800,#1f232d)] hover:bg-[var(--color-ds-grey-50,#f7f8f9)]',
  ghost: 'text-[var(--color-ds-grey-700,#3d414d)] hover:bg-[var(--color-ds-grey-100,#f0f1f3)]',
  destructive: 'bg-red-600 text-white hover:bg-red-700',
} as const

const BUTTON_SIZE_CLASSES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
} as const

/**
 * `secondary` is the default so a page that names no emphasis still reads as a
 * hierarchy rather than a wall of identical primary buttons.
 */
function buttonClass(
  props: Record<string, unknown>,
  fallbackVariant: keyof typeof BUTTON_VARIANT_CLASSES
): string {
  const variant = asString(props.variant, fallbackVariant)
  const size = asString(props.size, 'md')
  return cn(
    BUTTON_BASE_CLASS,
    BUTTON_VARIANT_CLASSES[variant as keyof typeof BUTTON_VARIANT_CLASSES] ??
      BUTTON_VARIANT_CLASSES[fallbackVariant],
    BUTTON_SIZE_CLASSES[size as keyof typeof BUTTON_SIZE_CLASSES] ?? BUTTON_SIZE_CLASSES.md
  )
}

const DELTA_TONE_CLASSES = {
  positive: 'text-emerald-700',
  negative: 'text-red-700',
  neutral: 'text-[var(--color-ds-grey-600,#5b5f6b)]',
} as const

function deltaToneClass(value: unknown): string {
  const tone = asString(value, 'neutral')
  return DELTA_TONE_CLASSES[tone as keyof typeof DELTA_TONE_CLASSES] ?? DELTA_TONE_CLASSES.neutral
}

function sectionWidthClass(value: unknown): string {
  const width = asString(value, 'wide')
  return SECTION_WIDTHS[width as keyof typeof SECTION_WIDTHS] ?? SECTION_WIDTHS.wide
}

const ALIGN_ITEMS_CLASSES = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
} as const

function alignItemsClass(value: unknown, fallback: keyof typeof ALIGN_ITEMS_CLASSES): string {
  const align = asString(value, fallback)
  return (
    ALIGN_ITEMS_CLASSES[align as keyof typeof ALIGN_ITEMS_CLASSES] ?? ALIGN_ITEMS_CLASSES[fallback]
  )
}

/**
 * `auto-fit` + `minmax` keeps the grid responsive without media queries, and
 * `min(100%, …)` stops a wide track from overflowing a narrow viewport.
 */
function gridTemplateColumns(props: Record<string, unknown>): string {
  const explicit = asString(props.minItemWidth)
  const fromColumns = GRID_MIN_ITEM_WIDTHS[asString(props.columns)]
  const minItemWidth = explicit || fromColumns || DEFAULT_GRID_MIN_ITEM_WIDTH
  return `repeat(auto-fit, minmax(min(100%, ${minItemWidth}), 1fr))`
}

/** Splits `a | b | c` cells, keeping empty middles so columns stay aligned. */
function splitTableRow(row: string): string[] {
  return row.split('|').map((cell) => cell.trim())
}

function tableRowsFromState(value: unknown, headers: string[]): string[][] {
  if (!Array.isArray(value)) return []
  return value.map((entry) => {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const record = entry as Record<string, unknown>
      return headers.map((header) => displayFromStateValue(record[header], ''))
    }
    return [displayFromStateValue(entry, '')]
  })
}

function tableHeadersFromState(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const headers: string[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    for (const key of Object.keys(entry as Record<string, unknown>)) {
      if (!headers.includes(key)) headers.push(key)
    }
  }
  return headers
}

/** Parses `key: value` rows, or an object from host state, into pairs. */
function keyValuePairs(items: unknown, stateValue: unknown): Array<[string, string]> {
  if (stateValue && typeof stateValue === 'object' && !Array.isArray(stateValue)) {
    return Object.entries(stateValue as Record<string, unknown>).map(([key, value]) => [
      key,
      displayFromStateValue(value, ''),
    ])
  }
  if (typeof items !== 'string') return []
  const pairs: Array<[string, string]> = []
  for (const line of items.split('\n')) {
    const row = line.trim()
    if (!row) continue
    const separator = row.indexOf(':')
    if (separator < 0) {
      pairs.push([row, ''])
      continue
    }
    pairs.push([row.slice(0, separator).trim(), row.slice(separator + 1).trim()])
  }
  return pairs
}

interface ProgressStepsViewProps {
  pending: boolean
  steps: string[]
  durationMs: number
}

function ProgressStepsView({ pending, steps, durationMs }: ProgressStepsViewProps) {
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    if (!pending) {
      setElapsedMs(0)
      return
    }
    const startedAt = Date.now()
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - startedAt)
    }, 100)
    return () => clearInterval(timer)
  }, [pending])

  if (!pending || steps.length === 0) {
    return null
  }

  const sliceMs = durationMs / steps.length
  const completedCount = Math.min(steps.length - 1, Math.floor(elapsedMs / sliceMs))

  return (
    <ol className='flex flex-col gap-2 text-sm'>
      {steps.map((label, index) => {
        const done = index < completedCount
        const current = index === completedCount
        return (
          <li
            key={`${index}-${label}`}
            className={cn(
              'flex items-center gap-2',
              done && 'text-[var(--color-ds-grey-800,#1f232d)]',
              current && 'text-[var(--color-ds-grey-800,#1f232d)]',
              !done && !current && 'text-[var(--color-ds-grey-400,#a0a3ad)]'
            )}
          >
            <span className='inline-flex size-5 items-center justify-center rounded-full border border-[var(--color-ds-grey-300,#c5c6cc)] text-xs'>
              {done ? '✓' : current ? '…' : ''}
            </span>
            {label}
          </li>
        )
      })}
    </ol>
  )
}

const SKELETON_BAR = 'animate-pulse rounded bg-[var(--color-ds-grey-200,#e2e3e5)]'

const DEFAULT_SKELETON_LINES: Record<SkeletonVariant, number> = {
  text: 3,
  stat: 1,
  table: 4,
  card: 3,
  form: 3,
}

type SkeletonVariant = 'text' | 'stat' | 'table' | 'card' | 'form'

function skeletonVariant(value: unknown): SkeletonVariant {
  const variant = asString(value, 'text')
  return variant in DEFAULT_SKELETON_LINES ? (variant as SkeletonVariant) : 'text'
}

interface SkeletonBlockProps {
  variant: SkeletonVariant
  lines: number
}

/**
 * Shape-matched loading placeholder. Widths taper so a text block reads as prose
 * rather than a solid slab.
 */
function SkeletonBlock({ variant, lines }: SkeletonBlockProps) {
  const rows = Math.max(1, Math.min(12, lines))

  if (variant === 'stat') {
    return (
      <div
        aria-hidden
        data-testid='skeleton'
        className='flex flex-col gap-2 rounded-xl border border-[var(--color-ds-grey-200,#e2e3e5)] bg-white p-4'
      >
        <div className={cn(SKELETON_BAR, 'h-3 w-1/2')} />
        <div className={cn(SKELETON_BAR, 'h-7 w-2/3')} />
      </div>
    )
  }

  if (variant === 'table') {
    return (
      <div aria-hidden data-testid='skeleton' className='flex w-full flex-col gap-2'>
        <div className={cn(SKELETON_BAR, 'h-4 w-full opacity-70')} />
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className={cn(SKELETON_BAR, 'h-8 w-full')} />
        ))}
      </div>
    )
  }

  const body = (
    <div className='flex w-full flex-col gap-2'>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className={cn(SKELETON_BAR, variant === 'form' ? 'h-9 w-full' : 'h-4')}
          style={variant === 'form' ? undefined : { width: index === rows - 1 ? '60%' : '100%' }}
        />
      ))}
    </div>
  )

  if (variant === 'card') {
    return (
      <div
        aria-hidden
        data-testid='skeleton'
        className='rounded-xl border border-[var(--color-ds-grey-200,#e2e3e5)] bg-white p-5'
      >
        {body}
      </div>
    )
  }

  return (
    <div aria-hidden data-testid='skeleton'>
      {body}
    </div>
  )
}

/**
 * True when a bound region has nothing to show yet, so a pending action can
 * render a placeholder instead of collapsing to nothing.
 */
function isEmptyStateValue(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0
  return false
}

function readStatePath(state: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined
    return (current as Record<string, unknown>)[segment]
  }, state)
}

function displayFromStateValue(value: unknown, fallback: string): string {
  if (value === undefined || value === null) return fallback
  const fromAction = displayTextFromActionData(value)
  if (fromAction) return fromAction
  return String(value)
}

function isRecordArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.length > 0 && value.every(isPlainRecord)
}

function hasProseDisplayField(record: Record<string, unknown>): boolean {
  for (const key of ['content', 'assistantContent', 'output', 'text', 'message'] as const) {
    const value = record[key]
    if (typeof value === 'string' && value.trim() && parseJsonLiteral(value) === undefined) {
      return true
    }
  }
  return false
}

type StructuredDataText =
  | { kind: 'table'; rows: Record<string, unknown>[] }
  | { kind: 'object'; record: Record<string, unknown> }

function structuredFromDataText(value: unknown): StructuredDataText | null {
  let current: unknown = value
  if (typeof current === 'string') {
    const parsed = parseJsonLiteral(current)
    if (parsed === undefined) return null
    current = parsed
  }
  if (isRecordArray(current)) {
    return { kind: 'table', rows: current }
  }
  if (isPlainRecord(current)) {
    const record = omitActionTelemetry(current)
    if (hasProseDisplayField(record)) return null
    if (Object.keys(record).length === 0) return null
    return { kind: 'object', record }
  }
  return null
}

function StateTable({
  value,
  columns,
  style,
}: {
  value: unknown
  columns?: string
  style?: CSSProperties
}) {
  const declaredHeaders = (columns ?? '')
    .split(',')
    .map((header) => header.trim())
    .filter(Boolean)
  const headers = declaredHeaders.length > 0 ? declaredHeaders : tableHeadersFromState(value)
  const rows = tableRowsFromState(value, headers)
  if (headers.length === 0 && rows.length === 0) return null
  return (
    <div className='w-full overflow-x-auto' style={style}>
      <table className='w-full border-collapse text-left text-sm'>
        {headers.length > 0 ? (
          <thead>
            <tr className='border-[var(--color-ds-grey-200,#e2e3e5)] border-b'>
              {headers.map((header) => (
                <th key={header} className='px-3 py-2 font-medium'>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={`row-${rowIndex}`}
              className='border-[var(--color-ds-grey-100,#f0f1f3)] border-b'
            >
              {row.map((cell, cellIndex) => (
                <td key={`cell-${cellIndex}`} className='px-3 py-2 align-top'>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StateKeyValue({ pairs }: { pairs: Array<[string, string]> }) {
  if (pairs.length === 0) return null
  return (
    <dl className='grid w-full grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-4 gap-y-2 text-sm'>
      {pairs.map(([key, value]) => (
        <Fragment key={key}>
          <dt className='text-[var(--color-ds-grey-500,#8a8d99)]'>{key}</dt>
          <dd className='text-[var(--color-ds-grey-800,#1f232d)]'>{value}</dd>
        </Fragment>
      ))}
    </dl>
  )
}

/**
 * `fallback` is empty-state copy, not loading copy, so a pending action still shows the skeleton —
 * otherwise every DataText that declares a fallback silently opts out of its loading state.
 */
function DataTextView({
  value,
  fallback,
  pending,
  style,
}: {
  value: unknown
  fallback: string
  pending: boolean
  style?: CSSProperties
}) {
  const structured = structuredFromDataText(value)
  const display = displayFromStateValue(value, fallback)
  if (pending && !structured && isEmptyStateValue(value)) {
    return <SkeletonBlock variant='text' lines={DEFAULT_SKELETON_LINES.text} />
  }
  if (structured?.kind === 'table') {
    return <StateTable value={structured.rows} style={style} />
  }
  if (structured?.kind === 'object') {
    const arrayEntries = Object.entries(structured.record).filter(([, nested]) =>
      isRecordArray(nested)
    )
    const scalars: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(structured.record)) {
      if (isRecordArray(nested)) continue
      scalars[key] = nested
    }
    return (
      <div className='flex flex-col gap-4' style={style}>
        {arrayEntries.map(([key, rows]) => (
          <StateTable key={key} value={rows} />
        ))}
        <StateKeyValue pairs={keyValuePairs(null, scalars)} />
      </div>
    )
  }
  return <MarkdownText className='font-medium' style={style} content={display} />
}

function submitButtonActionId(elements: Record<string, SpecElement>, childIds: string[]): string {
  for (const childId of childIds) {
    const child = elements[childId]
    if (!child) continue
    if (child.type === 'SubmitButton') {
      const actionId = asString(child.props?.actionId)
      if (actionId) return actionId
    }
    const nested = submitButtonActionId(elements, child.children ?? [])
    if (nested) return nested
  }
  return ''
}

/** `size` is a CSS length on text components but a scale token on buttons. */
function isCssLength(value: string): boolean {
  return /\d/.test(value)
}

function styleFromProps(props: Record<string, unknown>): CSSProperties {
  const style: CSSProperties = {}
  const backgroundColor = asString(props.backgroundColor)
  const color = asString(props.color)
  const padding = asString(props.padding)
  const maxWidth = asString(props.maxWidth)
  const gap = asString(props.gap)
  const size = asString(props.size)
  if (backgroundColor) style.backgroundColor = backgroundColor
  if (color) style.color = color
  if (padding) style.padding = padding
  if (maxWidth) style.maxWidth = maxWidth
  if (gap) style.gap = gap
  if (size && isCssLength(size)) style.fontSize = size
  return style
}

/**
 * Walks a json-render Spec and renders Arena Generative UI catalog components.
 */
export function SpecRenderer({ spec, state, pending, onNavigate, onRunAction }: SpecRendererProps) {
  const elements = (spec.elements ?? {}) as Record<string, SpecElement>
  const [formValues, setFormValues] = useState<Record<string, string>>({})

  const renderNode = (id: string): ReactNode => {
    const element = elements[id]
    if (!element) return null
    const props = element.props ?? {}
    const childIds = element.children ?? []
    const children = childIds.map((childId) => (
      <Fragment key={childId}>{renderNode(childId)}</Fragment>
    ))
    const hasChildren = childIds.length > 0

    switch (element.type) {
      case 'Page':
        return (
          <div
            className='min-h-full bg-[var(--color-ds-grey-50,#f7f8f9)]'
            style={styleFromProps(props)}
          >
            {asString(props.title) ? <h1 className='sr-only'>{asString(props.title)}</h1> : null}
            {children}
          </div>
        )
      case 'Section':
        return (
          <section
            className={cn('mx-auto w-full px-6 py-8', sectionWidthClass(props.width))}
            style={styleFromProps(props)}
          >
            {children}
          </section>
        )
      case 'Stack': {
        const justify = asString(props.justify, 'start')
        return (
          <div
            className={cn(
              'flex',
              asString(props.direction, 'vertical') === 'horizontal' ? 'flex-row' : 'flex-col',
              alignItemsClass(props.align, 'stretch'),
              justify === 'center' && 'justify-center',
              justify === 'between' && 'justify-between',
              justify === 'end' && 'justify-end',
              asBoolean(props.wrap) && 'flex-wrap'
            )}
            style={{ gap: asString(props.gap, '12px'), ...styleFromProps(props) }}
          >
            {children}
          </div>
        )
      }
      case 'Grid':
        return (
          <div
            className='grid w-full'
            style={{
              gridTemplateColumns: gridTemplateColumns(props),
              gap: asString(props.gap, '16px'),
              ...styleFromProps(props),
            }}
          >
            {children}
          </div>
        )
      case 'Columns': {
        const layout = asString(props.layout, 'equal')
        return (
          <div
            className={cn(
              'grid w-full grid-cols-1',
              layout === 'sidebar-left' && 'md:grid-cols-[280px_1fr]',
              layout === 'sidebar-right' && 'md:grid-cols-[1fr_280px]',
              layout === 'equal' && 'md:grid-cols-2'
            )}
            style={{ gap: asString(props.gap, '16px'), ...styleFromProps(props) }}
          >
            {children}
          </div>
        )
      }
      case 'PageHeader':
        return (
          <div
            className='flex w-full flex-wrap items-center justify-between gap-3'
            style={styleFromProps(props)}
          >
            <div className='flex flex-col gap-1'>
              <h1 className='font-semibold text-2xl tracking-tight'>{asString(props.title)}</h1>
              {asString(props.subtitle) ? (
                <p className='text-[var(--color-ds-grey-600,#5b5f6b)] text-sm'>
                  {asString(props.subtitle)}
                </p>
              ) : null}
            </div>
            {hasChildren ? <div className='flex items-center gap-2'>{children}</div> : null}
          </div>
        )
      case 'Toolbar': {
        const justify = asString(props.justify, 'start')
        return (
          <div
            className={cn(
              'flex w-full flex-wrap items-center gap-2',
              justify === 'center' && 'justify-center',
              justify === 'between' && 'justify-between',
              justify === 'end' && 'justify-end'
            )}
            style={styleFromProps(props)}
          >
            {children}
          </div>
        )
      }
      case 'Tabs': {
        const items = parseTabItems(props.items)
        const activePath = asString(props.activePath)
        if (items.length === 0) return null
        return (
          <nav
            className='flex w-full flex-wrap items-center gap-1 border-[var(--color-ds-grey-200,#e2e3e5)] border-b'
            style={styleFromProps(props)}
          >
            {items.map((item) => (
              <button
                key={item.path}
                type='button'
                onClick={() => onNavigate(item.path)}
                className={cn(
                  '-mb-px border-b-2 px-3 py-2 text-sm',
                  splitNavTarget(item.path).path === splitNavTarget(activePath).path
                    ? 'border-[var(--color-ds-blue-600,#2563eb)] font-medium text-[var(--color-ds-blue-600,#2563eb)]'
                    : 'border-transparent text-[var(--color-ds-grey-600,#5b5f6b)]'
                )}
              >
                {item.label}
              </button>
            ))}
          </nav>
        )
      }
      case 'Table': {
        const statePath = asString(props.statePath)
        const stateValue = statePath ? readStatePath(state, statePath) : undefined
        if (statePath && pending && isEmptyStateValue(stateValue)) {
          return <SkeletonBlock variant='table' lines={DEFAULT_SKELETON_LINES.table} />
        }
        if (stateValue === undefined) {
          const headers = asString(props.columns)
            .split(',')
            .map((header) => header.trim())
            .filter(Boolean)
          const rows = asString(props.rows)
            .split('\n')
            .map((row) => row.trim())
            .filter(Boolean)
            .map(splitTableRow)
          if (headers.length === 0 && rows.length === 0) return null
          return (
            <div className='w-full overflow-x-auto' style={styleFromProps(props)}>
              <table className='w-full border-collapse text-left text-sm'>
                {headers.length > 0 ? (
                  <thead>
                    <tr className='border-[var(--color-ds-grey-200,#e2e3e5)] border-b'>
                      {headers.map((header) => (
                        <th key={header} className='px-3 py-2 font-medium'>
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                ) : null}
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr
                      key={`row-${rowIndex}`}
                      className='border-[var(--color-ds-grey-100,#f0f1f3)] border-b'
                    >
                      {row.map((cell, cellIndex) => (
                        <td key={`cell-${cellIndex}`} className='px-3 py-2 align-top'>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        return (
          <StateTable
            value={stateValue}
            columns={asString(props.columns)}
            style={styleFromProps(props)}
          />
        )
      }
      case 'Stat': {
        const statePath = asString(props.statePath)
        const stateValue = statePath ? readStatePath(state, statePath) : undefined
        if (statePath && pending && isEmptyStateValue(stateValue) && !asString(props.value)) {
          return <SkeletonBlock variant='stat' lines={DEFAULT_SKELETON_LINES.stat} />
        }
        const value =
          stateValue === undefined
            ? asString(props.value)
            : displayFromStateValue(stateValue, asString(props.value))
        const delta = asString(props.delta)
        return (
          <div
            className='flex flex-col gap-1 rounded-xl border border-[var(--color-ds-grey-200,#e2e3e5)] bg-white p-4'
            style={styleFromProps(props)}
          >
            <span className='text-[var(--color-ds-grey-500,#8a8d99)] text-xs uppercase tracking-wide'>
              {asString(props.label)}
            </span>
            <div className='flex flex-wrap items-baseline gap-2'>
              <span className='font-semibold text-2xl'>{value}</span>
              {delta ? (
                <span className={cn('font-medium text-xs', deltaToneClass(props.deltaTone))}>
                  {delta}
                </span>
              ) : null}
            </div>
            {asString(props.hint) ? (
              <span className='text-[var(--color-ds-grey-600,#5b5f6b)] text-xs'>
                {asString(props.hint)}
              </span>
            ) : null}
          </div>
        )
      }
      case 'Badge':
        return (
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs',
              toneClass(props.tone)
            )}
            style={styleFromProps(props)}
          >
            {asString(props.text)}
          </span>
        )
      case 'KeyValue': {
        const statePath = asString(props.statePath)
        const stateValue = statePath ? readStatePath(state, statePath) : undefined
        const pairs = keyValuePairs(props.items, stateValue)
        if (pairs.length === 0 && statePath && pending) {
          return <SkeletonBlock variant='text' lines={DEFAULT_SKELETON_LINES.text} />
        }
        return <StateKeyValue pairs={pairs} />
      }
      case 'Card':
        return (
          <div
            className='rounded-xl border border-[var(--color-ds-grey-200,#e2e3e5)] bg-white p-5 shadow-sm'
            style={styleFromProps(props)}
          >
            {asString(props.title) || asString(props.description) ? (
              <div className='mb-3 flex flex-col gap-1'>
                {asString(props.title) ? (
                  <h2 className='font-semibold text-lg'>{asString(props.title)}</h2>
                ) : null}
                {asString(props.description) ? (
                  <p className='text-[var(--color-ds-grey-600,#5b5f6b)] text-sm'>
                    {asString(props.description)}
                  </p>
                ) : null}
              </div>
            ) : null}
            {children}
          </div>
        )
      case 'Heading': {
        const level = asString(props.level, 'h2')
        const Tag = (['h1', 'h2', 'h3', 'h4'].includes(level) ? level : 'h2') as
          | 'h1'
          | 'h2'
          | 'h3'
          | 'h4'
        return (
          <Tag className='font-semibold tracking-tight' style={styleFromProps(props)}>
            {asString(props.text)}
          </Tag>
        )
      }
      case 'Text':
        return (
          <MarkdownText
            className='text-[var(--color-ds-grey-700,#3d414d)]'
            style={styleFromProps(props)}
            content={asString(props.text)}
          />
        )
      case 'DataText': {
        return (
          <DataTextView
            value={readStatePath(state, asString(props.statePath))}
            fallback={asString(props.fallback, '')}
            pending={pending}
            style={styleFromProps(props)}
          />
        )
      }
      case 'Alert':
        return (
          <div className={cn('rounded-lg px-3 py-2 text-sm', toneClass(props.tone))}>
            <MarkdownText content={asString(props.text)} />
          </div>
        )
      case 'Spinner':
        return pending ? (
          <p className='text-[var(--color-ds-grey-500,#8a8d99)] text-sm'>
            {asString(props.label, 'Loading…')}
          </p>
        ) : null
      case 'Skeleton': {
        if (!pending) return null
        const variant = skeletonVariant(props.variant)
        return (
          <SkeletonBlock
            variant={variant}
            lines={asPositiveNumber(props.lines, DEFAULT_SKELETON_LINES[variant])}
          />
        )
      }
      case 'ProgressSteps': {
        const steps = asString(props.steps)
          .split('\n')
          .map((step) => step.trim())
          .filter(Boolean)
        return (
          <ProgressStepsView
            pending={pending}
            steps={steps}
            durationMs={asPositiveNumber(props.durationMs, DEFAULT_PROGRESS_DURATION_MS)}
          />
        )
      }
      case 'Form': {
        const actionId =
          asString(props.actionId) || submitButtonActionId(elements, element.children ?? [])
        const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          const values: Record<string, unknown> = { ...formValues }
          for (const [key, value] of form.entries()) {
            values[key] = String(value)
          }
          if (actionId) {
            void onRunAction(actionId, values)
          }
        }
        return (
          <form
            className={cn('flex flex-col gap-4', alignItemsClass(props.align, 'stretch'))}
            onSubmit={handleSubmit}
          >
            {children}
          </form>
        )
      }
      case 'TextInput':
      case 'TextArea': {
        const name = asString(props.name)
        const fieldId = `field-${name}`
        const common = {
          id: fieldId,
          name,
          required: asBoolean(props.required),
          placeholder: asString(props.placeholder) || undefined,
          value: formValues[name] ?? '',
          onChange: (event: { target: { value: string } }) =>
            setFormValues((current) => ({ ...current, [name]: event.target.value })),
          className:
            'w-full rounded-lg border border-[var(--color-ds-grey-300,#c5c6cc)] bg-white px-3 py-2 text-sm',
        }
        return (
          <div className='flex flex-col gap-1 text-sm'>
            {asString(props.label) ? (
              <label htmlFor={fieldId}>{asString(props.label)}</label>
            ) : null}
            {element.type === 'TextArea' ? (
              <textarea {...common} rows={4} />
            ) : (
              <input {...common} type='text' />
            )}
          </div>
        )
      }
      case 'Select': {
        const name = asString(props.name)
        const options = asString(props.options)
          .split(',')
          .map((option) => option.trim())
          .filter(Boolean)
        return (
          <label className='flex flex-col gap-1 text-sm'>
            {asString(props.label) ? <span>{asString(props.label)}</span> : null}
            <select
              name={name}
              required={asBoolean(props.required)}
              value={formValues[name] ?? ''}
              onChange={(event) =>
                setFormValues((current) => ({ ...current, [name]: event.target.value }))
              }
              className='w-full rounded-lg border border-[var(--color-ds-grey-300,#c5c6cc)] bg-white px-3 py-2 text-sm'
            >
              <option value=''>Select</option>
              {options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        )
      }
      case 'SubmitButton':
        return (
          <button type='submit' disabled={pending} className={buttonClass(props, 'primary')}>
            {asString(props.label, 'Submit')}
          </button>
        )
      case 'Button': {
        const href = asString(props.href)
        const navigateTo = asString(props.navigateTo)
        const actionId = asString(props.actionId)
        const className = buttonClass(props, 'secondary')
        if (href) {
          return (
            <a href={href} className={className} style={styleFromProps(props)} rel='noreferrer'>
              {asString(props.label)}
            </a>
          )
        }
        return (
          <button
            type='button'
            className={className}
            style={styleFromProps(props)}
            disabled={pending && Boolean(actionId)}
            onClick={() => {
              if (navigateTo) onNavigate(navigateTo)
              if (actionId) void onRunAction(actionId, formValues)
            }}
          >
            {asString(props.label)}
          </button>
        )
      }
      case 'NavLink':
        return (
          <button
            type='button'
            className='text-[var(--color-ds-blue-600,#2563eb)] text-sm underline-offset-2 hover:underline'
            onClick={() => onNavigate(asString(props.to))}
          >
            {asString(props.label)}
          </button>
        )
      case 'Link':
        return (
          <a
            href={asString(props.href)}
            className='text-[var(--color-ds-blue-600,#2563eb)] underline-offset-2 hover:underline'
            style={styleFromProps(props)}
            rel='noreferrer'
          >
            {asString(props.label)}
          </a>
        )
      case 'Image':
        return (
          <img
            src={asString(props.src)}
            alt={asString(props.alt)}
            width={asString(props.width) || undefined}
            height={asString(props.height) || undefined}
          />
        )
      case 'Divider':
        return (
          <hr className='border-[var(--color-ds-grey-200,#e2e3e5)]' style={styleFromProps(props)} />
        )
      case 'List': {
        const Tag = asBoolean(props.ordered) ? 'ol' : 'ul'
        return <Tag className='list-inside pl-1'>{children}</Tag>
      }
      case 'ListItem':
        return (
          <li>
            <MarkdownText content={asString(props.text)} />
          </li>
        )
      default:
        return <div>{children}</div>
    }
  }

  return <>{renderNode(spec.root)}</>
}

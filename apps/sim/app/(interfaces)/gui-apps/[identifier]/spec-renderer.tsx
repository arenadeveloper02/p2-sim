'use client'

import {
  type CSSProperties,
  type FormEvent,
  Fragment,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { Spec } from '@json-render/core'
import { cn } from '@sim/emcn'
import {
  BarChart3,
  Building2,
  Calendar,
  Check,
  FileText,
  Globe,
  Inbox,
  Link2,
  Loader2,
  type LucideIcon,
  MessageSquare,
  Search,
  Shield,
  Sparkles,
  Star,
  TrendingUp,
  Users,
} from 'lucide-react'
import { ConstrainedChart } from '@/components/charts/constrained-chart'
import {
  GENERATIVE_APP_SUCCESS_TOAST_MS,
  type RunGenerativeAppActionMeta,
} from '@/lib/arena-generative-ui/action-runtime'
import { bindChartData } from '@/lib/arena-generative-ui/bind-chart-data'
import {
  collectionUsesApiPagination,
  isActionControlPending,
  isBoundPathPending,
} from '@/lib/arena-generative-ui/binding-layout-plan'
import {
  type ArenaGenerativeChatProtocol,
  getGenerativeAppConversationId,
} from '@/lib/arena-generative-ui/chat-protocol'
import { chatTurnsFromState } from '@/lib/arena-generative-ui/chat-turns'
import {
  type ArenaGenerativeFormField,
  asFieldString,
  asFieldStringList,
  collectVisibleFieldValues,
  fieldIsVisible,
  isFormFieldType,
  isTruthyFieldValue,
  listFormFields,
  overlayClosePatch,
  overlayOpenPatch,
  overlayShowWhenUsesSelection,
  parseOptionList,
  resolveFieldValue,
  snapshotFormValues,
  validateVisibleFields,
  valuesFromFormElement,
} from '@/lib/arena-generative-ui/form-fields'
import {
  collectKnownActionIds,
  collectLocalDiscoveryQuery,
  filterCollectionItems,
  filterStaticTableRows,
  LOCAL_COLLECTION_PAGE_SIZE,
  type PaginatedCollection,
  paginateCollection,
} from '@/lib/arena-generative-ui/local-discovery'
import { paginationActionValues } from '@/lib/arena-generative-ui/pagination'
import { resolveArenaGenerativeSpacing } from '@/lib/arena-generative-ui/theme'
import {
  ARENA_GENERATIVE_SELECTED_ID_KEY,
  ARENA_GENERATIVE_STREAM_CONTENT_KEY,
  collectionFromBoundValue,
  displayTextFromActionData,
  interpolateElementProps,
  parseTabItems,
  type RepeatItemScope,
  readScopedStatePath,
  repeatItemActionValues,
  repeatItemKey,
  specHasSamePageSelectItem,
  splitNavTarget,
} from '@/lib/arena-generative-ui/types'
import type { ArenaGenerativeUxPlan } from '@/lib/arena-generative-ui/ux-compiler'
import { UX_DEFAULTS } from '@/lib/arena-generative-ui/ux-defaults'
import { ChatComposer } from '@/app/(interfaces)/gui-apps/[identifier]/chat-composer'
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
  /** Abandon in-flight CTAs so WorkingCard Cancel returns to idle. */
  onCancelPending?: () => void
  /** In-flight action ids. When set, bound regions and controls pending is per action. */
  pendingActionIds?: ReadonlySet<string>
  /** Host keys each action writes. Required for per-action bound-region pending. */
  actionHostKeys?: Record<string, readonly string[]>
  /** visitorEmail / constant input names the host stamps; those fields never render. */
  actionHiddenInputs?: Record<string, readonly string[]>
  /** Reserved Start protocol each action may bind through Chat. */
  actionChatProtocol?: Record<string, ArenaGenerativeChatProtocol>
  /** localStorage key for the Chat conversationId. */
  conversationStorageKey?: string
  /** Compiler action plan. When omitted, confirm falls back to destructive variant. */
  uxPlan?: ArenaGenerativeUxPlan
  /** Current page path; Tabs use this when it matches an item, otherwise `activePath`. */
  currentPath?: string
  onNavigate: (path: string) => void
  onRunAction: (
    actionId: string,
    values: Record<string, unknown>,
    meta?: RunGenerativeAppActionMeta
  ) => Promise<void>
  /** Copies a Repeat row into host state without calling an API. */
  onSelectItem?: (item: unknown, index: number) => void
  /** Drops the copied Repeat row so an in-page detail can return to the list. */
  onClearItem?: () => void
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

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

const ICON_BY_NAME: Record<string, LucideIcon> = {
  search: Search,
  file: FileText,
  chart: BarChart3,
  shield: Shield,
  building: Building2,
  check: Check,
  spark: Sparkles,
  users: Users,
  globe: Globe,
  message: MessageSquare,
  link: Link2,
  inbox: Inbox,
  calendar: Calendar,
  star: Star,
  trend: TrendingUp,
}

const CHIP_TONE_CLASSES = {
  muted:
    'bg-[var(--gui-canvas,#f7f8f9)] text-[var(--gui-text-muted,#575a66)] hover:bg-[var(--gui-border,#e2e3e5)]',
  brand:
    'bg-[var(--gui-brand-surface,#f3f8fe)] text-[var(--gui-brand,#1a73e8)] hover:bg-[var(--gui-info-border,#a3c7f6)]',
  info: 'bg-[var(--gui-info-surface,#f3f8fe)] text-[var(--gui-info-text,#10458b)] hover:bg-[var(--gui-info-border,#a3c7f6)]',
} as const

const CARD_MEDIA_TYPES = new Set(['Icon', 'Avatar'])
const CARD_FOOTER_TYPES = new Set(['Button', 'Chip', 'NavLink', 'Link', 'Toolbar'])

function looksLikeImageSrc(value: string): boolean {
  return /^(https?:|data:|\/)/i.test(value) || /\.(png|jpe?g|gif|svg|webp)(\?|$)/i.test(value)
}

function initialsFromName(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
}

interface AvatarModel {
  src: string
  initials: string
}

function avatarModel(
  props: Record<string, unknown>,
  state: Record<string, unknown>,
  scope?: RepeatItemScope
): AvatarModel {
  let src = asString(props.src) || asString(props.logoSrc)
  let initials = asString(props.initials)
  const statePath = asString(props.statePath)
  if (statePath) {
    const fromState = readScopedStatePath(state, statePath, scope)
    if (typeof fromState === 'string' && fromState.trim()) {
      if (looksLikeImageSrc(fromState)) src = src || fromState
      else initials = initials || initialsFromName(fromState)
    }
  }
  if (!initials && src) initials = initialsFromName(asString(props.title) || asString(props.alt))
  return { src, initials: initials || '?' }
}

function parseProgressStepLines(raw: string): Array<{ label: string; nested: boolean }> {
  return raw
    .split('\n')
    .map((line) => {
      if (!line.trim()) return null
      return { label: line.trim(), nested: /^\s{2,}|\t/.test(line) }
    })
    .filter((step): step is { label: string; nested: boolean } => step !== null)
}

function firstSearchFieldName(elements: Record<string, SpecElement>): string {
  for (const element of Object.values(elements)) {
    if (element.type !== 'SearchField') continue
    const name = asString(element.props?.name)
    if (name) return name
  }
  return 'query'
}

function parseChipSetValue(raw: string): { name: string | null; value: string } {
  const separator = raw.indexOf('=')
  if (separator > 0) {
    return { name: raw.slice(0, separator).trim(), value: raw.slice(separator + 1) }
  }
  return { name: null, value: raw }
}

function subtreeHasActionId(
  elements: Record<string, SpecElement>,
  id: string,
  actionId: string
): boolean {
  const element = elements[id]
  if (!element) return false
  if (asString(element.props?.actionId) === actionId) return true
  return (element.children ?? []).some((childId) => subtreeHasActionId(elements, childId, actionId))
}

/**
 * Patch that opens a closed Modal/Drawer. When `actionId` is set, only overlays
 * that contain that action (Form / SubmitButton / Button) are considered, so a
 * complete/delete CTA does not steal a create dialog.
 */
function closedOverlayOpenPatch(
  elements: Record<string, SpecElement>,
  visibilityValues: Record<string, unknown>,
  actionId?: string
): Record<string, unknown> | null {
  for (const [id, element] of Object.entries(elements)) {
    if (element.type !== 'Modal' && element.type !== 'Drawer') continue
    if (fieldIsVisible(element.props ?? {}, visibilityValues)) continue
    const patch = overlayOpenPatch(element.props?.showWhen)
    if (!patch) continue
    if (actionId && !subtreeHasActionId(elements, id, actionId)) continue
    return patch
  }
  return null
}

function overlayClosePatchForAction(
  elements: Record<string, SpecElement>,
  actionId: string
): Record<string, unknown> | null {
  if (!actionId) return null
  for (const [id, element] of Object.entries(elements)) {
    if (element.type !== 'Modal' && element.type !== 'Drawer') continue
    if (!subtreeHasActionId(elements, id, actionId)) continue
    const patch = overlayClosePatch(element.props?.showWhen)
    return Object.keys(patch).length > 0 ? patch : null
  }
  return null
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
  info: 'border border-[var(--gui-info-border,#a3c7f6)] bg-[var(--gui-info-surface,#f3f8fe)] text-[var(--gui-info-text,#10458b)]',
  success:
    'border border-[var(--gui-success-border,#b1e9ce)] bg-[var(--gui-success-surface,#f5fcf9)] text-[var(--gui-success-text,#23784f)]',
  warning:
    'border border-[var(--gui-warning-border,#fdcdb5)] bg-[var(--gui-warning-surface,#fff9f5)] text-[var(--gui-warning-text,#974d29)]',
  error:
    'border border-[var(--gui-error-border,#faa3a3)] bg-[var(--gui-error-surface,#fff3f3)] text-[var(--gui-error-text,#921010)]',
} as const

function toneClass(value: unknown, fallback: keyof typeof TONE_CLASSES = 'info'): string {
  const tone = asString(value, fallback)
  return TONE_CLASSES[tone as keyof typeof TONE_CLASSES] ?? TONE_CLASSES[fallback]
}

const BUTTON_BASE_CLASS =
  'inline-flex items-center justify-center rounded-[var(--gui-radius,12px)] font-medium transition-[background-color,color,border-color,transform,box-shadow] duration-100 ease-[cubic-bezier(0.4,0,0.2,1)] disabled:cursor-not-allowed disabled:opacity-[0.38] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gui-brand,#1a73e8)]'

const BUTTON_VARIANT_CLASSES = {
  primary:
    'bg-[var(--gui-brand,#1a73e8)] text-white hover:bg-[var(--gui-brand-hover,#155cba)] active:bg-[var(--gui-brand-pressed,#10458b)]',
  secondary:
    'border border-[var(--gui-border,#e2e3e5)] bg-[var(--gui-surface,#ffffff)] text-[var(--gui-text,#2c2d33)] hover:bg-[var(--gui-canvas,#f7f8f9)]',
  ghost: 'text-[var(--gui-text,#2c2d33)] hover:bg-[var(--gui-canvas,#f7f8f9)]',
  outline:
    'border border-[var(--gui-brand,#1a73e8)] bg-transparent text-[var(--gui-brand,#1a73e8)] hover:bg-[var(--gui-brand-surface,#f3f8fe)]',
  destructive:
    'border border-[var(--gui-danger,#f31a1a)] bg-transparent text-[var(--gui-danger,#f31a1a)] hover:bg-[var(--gui-error-surface,#fff3f3)]',
} as const

const BUTTON_SIZE_CLASSES = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-base',
} as const

function collectionPageKey(elementId: string, scope?: RepeatItemScope): string {
  return scope ? `${elementId}:${scope.index}` : elementId
}

function CollectionPageChrome({
  paged,
  onPageChange,
}: {
  paged: PaginatedCollection<unknown>
  onPageChange: (page: number) => void
}) {
  if (paged.total <= LOCAL_COLLECTION_PAGE_SIZE) return null
  return (
    <div className='col-span-full mt-3 flex w-full flex-wrap items-center justify-between gap-3'>
      <p className='text-[length:var(--gui-label-size,12px)] text-[var(--gui-text-muted,#575a66)]'>
        Showing {paged.from}–{paged.to} of {paged.total}
      </p>
      <div className='flex gap-2'>
        <button
          type='button'
          aria-label='Previous page'
          disabled={paged.page <= 1}
          className={cn(
            BUTTON_BASE_CLASS,
            BUTTON_VARIANT_CLASSES.secondary,
            BUTTON_SIZE_CLASSES.sm
          )}
          onClick={() => onPageChange(paged.page - 1)}
        >
          Previous
        </button>
        <button
          type='button'
          aria-label='Next page'
          disabled={paged.page >= paged.pageCount}
          className={cn(
            BUTTON_BASE_CLASS,
            BUTTON_VARIANT_CLASSES.secondary,
            BUTTON_SIZE_CLASSES.sm
          )}
          onClick={() => onPageChange(paged.page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  )
}

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
    BUTTON_SIZE_CLASSES[size as keyof typeof BUTTON_SIZE_CLASSES] ?? BUTTON_SIZE_CLASSES.md,
    asString(props.shape) === 'pill' && 'rounded-full'
  )
}

const DELTA_TONE_CLASSES = {
  positive: 'text-[var(--gui-success-text,#23784f)]',
  negative: 'text-[var(--gui-error-text,#921010)]',
  neutral: 'text-[var(--gui-text-muted,#575a66)]',
} as const

function deltaToneClass(value: unknown): string {
  const tone = asString(value, 'neutral')
  return DELTA_TONE_CLASSES[tone as keyof typeof DELTA_TONE_CLASSES] ?? DELTA_TONE_CLASSES.neutral
}

const SURFACE_CARD =
  'rounded-[var(--gui-radius,12px)] bg-[var(--gui-surface,#ffffff)] p-6 shadow-[var(--gui-shadow-card,0px_2px_8px_rgba(44,45,51,0.1))]'

const SURFACE_CARD_MUTED =
  'rounded-[var(--gui-radius,12px)] border border-[var(--gui-border,#e2e3e5)] bg-[var(--gui-surface,#ffffff)] p-6'

function cardSurfaceClass(variant: unknown): string {
  return asString(variant) === 'muted' ? SURFACE_CARD_MUTED : SURFACE_CARD
}

const SURFACE_STAT =
  'rounded-[var(--gui-radius,12px)] border border-[var(--gui-border,#e2e3e5)] bg-[var(--gui-surface,#ffffff)] p-6'

const HEADING_SIZE_CLASSES = {
  h1: 'text-[length:var(--gui-heading-size,32px)] leading-[var(--gui-heading-leading,40px)]',
  h2: 'text-[length:var(--gui-title-size,24px)] leading-[var(--gui-title-leading,32px)]',
  h3: 'text-xl leading-7',
  h4: 'text-base leading-6',
} as const

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
  steps: Array<{ label: string; nested: boolean }>
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
      {steps.map((step, index) => {
        const done = index < completedCount
        const current = index === completedCount
        return (
          <li
            key={`${index}-${step.label}`}
            className={cn(
              'flex items-center gap-2',
              step.nested && 'pl-6',
              done && 'text-[var(--gui-text,#2c2d33)]',
              current && 'font-medium text-[var(--gui-brand,#1a73e8)]',
              !done && !current && 'text-[var(--gui-text-tertiary,#8a8d99)]'
            )}
          >
            <span
              className={cn(
                'inline-flex size-5 items-center justify-center rounded-full border text-xs',
                done &&
                  'border-[var(--gui-brand,#1a73e8)] bg-[var(--gui-brand,#1a73e8)] text-white',
                current && 'border-[var(--gui-brand,#1a73e8)] text-[var(--gui-brand,#1a73e8)]',
                !done && !current && 'border-[var(--gui-border,#e2e3e5)]'
              )}
            >
              {done ? '✓' : current ? '…' : ''}
            </span>
            {step.label}
          </li>
        )
      })}
    </ol>
  )
}

const DEFAULT_WORKING_INTERVAL_MS = 2500

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds}s elapsed`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s elapsed`
}

interface WorkingCardViewProps {
  pending: boolean
  title: string
  estimate: string
  tip: string
  steps: Array<{ label: string; nested: boolean }>
  intervalMs: number
  cancelLabel: string
  showSkeleton: boolean
  onCancel?: () => void
}

function WorkingCardView({
  pending,
  title,
  estimate,
  tip,
  steps,
  intervalMs,
  cancelLabel,
  showSkeleton,
  onCancel,
}: WorkingCardViewProps) {
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    if (!pending) {
      setElapsedMs(0)
      return
    }
    const startedAt = Date.now()
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - startedAt)
    }, 250)
    return () => clearInterval(timer)
  }, [pending])

  if (!pending || steps.length === 0) {
    return null
  }

  const currentIndex = Math.min(steps.length - 1, Math.floor(elapsedMs / intervalMs))
  const percent = Math.round(((currentIndex + 1) / steps.length) * 100)
  const meta = [estimate, formatElapsed(elapsedMs)].filter(Boolean).join(' · ')

  return (
    <div className='flex w-full flex-col gap-4' data-testid='working-card'>
      <div className='flex flex-col gap-4 rounded-[var(--gui-radius,12px)] border border-[var(--gui-info-border,#a3c7f6)] bg-[var(--gui-info-surface,#f3f8fe)] p-5'>
        <div className='flex flex-wrap items-start justify-between gap-2'>
          <p className='font-semibold text-[var(--gui-brand,#1a73e8)]'>
            {title || steps[currentIndex]?.label}
          </p>
          {meta ? (
            <p className='text-[length:var(--gui-label-size,12px)] text-[var(--gui-info-text,#10458b)]'>
              {meta}
            </p>
          ) : null}
        </div>
        <div
          data-testid='working-card-bar'
          className='h-1.5 w-full overflow-hidden rounded-full bg-[var(--gui-info-border,#a3c7f6)]'
          role='progressbar'
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div
            className='h-full rounded-full bg-[var(--gui-brand,#1a73e8)] transition-[width] duration-300'
            style={{ width: `${percent}%` }}
          />
        </div>
        <ol className='flex flex-col gap-2.5'>
          {steps.map((step, index) => {
            const done = index < currentIndex
            const current = index === currentIndex
            return (
              <li
                key={`${index}-${step.label}`}
                className={cn(
                  'flex items-center gap-2.5 text-sm',
                  step.nested && 'pl-6',
                  done && 'text-[var(--gui-info-text,#10458b)] line-through',
                  current && 'font-semibold text-[var(--gui-brand-pressed,#10458b)]',
                  !done && !current && 'text-[var(--gui-info-text,#10458b)]'
                )}
              >
                {done ? (
                  <span className='inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--gui-success-text,#23784f)] text-white'>
                    <Check className='size-3' aria-hidden />
                  </span>
                ) : current ? (
                  <Loader2
                    className='size-5 shrink-0 animate-spin text-[var(--gui-brand,#1a73e8)]'
                    aria-hidden
                  />
                ) : (
                  <span className='size-5 shrink-0 rounded-full border border-[var(--gui-info-border,#a3c7f6)]' />
                )}
                <span aria-current={current ? 'step' : undefined}>{step.label}</span>
              </li>
            )
          })}
        </ol>
        {tip || onCancel ? (
          <div className='flex flex-col gap-3 border-[var(--gui-info-border,#a3c7f6)] border-t pt-3'>
            {tip ? (
              <p className='text-[length:var(--gui-label-size,12px)] text-[var(--gui-info-text,#10458b)] italic'>
                {tip}
              </p>
            ) : null}
            {onCancel ? (
              <button
                type='button'
                data-testid='working-card-cancel'
                className={cn(
                  BUTTON_BASE_CLASS,
                  BUTTON_VARIANT_CLASSES.outline,
                  BUTTON_SIZE_CLASSES.sm,
                  'w-fit'
                )}
                onClick={onCancel}
              >
                {cancelLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {showSkeleton ? <SkeletonBlock variant='outline' lines={6} /> : null}
    </div>
  )
}

const SKELETON_BAR =
  'animate-pulse rounded-[var(--gui-radius-sm,8px)] bg-[var(--gui-border,#e2e3e5)]'

const DEFAULT_SKELETON_LINES: Record<SkeletonVariant, number> = {
  text: 3,
  stat: 1,
  table: 4,
  card: 3,
  form: 3,
  outline: 6,
}

type SkeletonVariant = 'text' | 'stat' | 'table' | 'card' | 'form' | 'outline'

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
      <div aria-hidden data-testid='skeleton' className={cn('flex flex-col gap-2', SURFACE_STAT)}>
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

  if (variant === 'outline') {
    const widths = ['100%', '92%', '78%', '85%', '64%', '45%']
    return (
      <div aria-hidden data-testid='skeleton' className='flex w-full flex-col gap-3'>
        <div className={cn(SKELETON_BAR, 'h-5 w-full')} />
        {Array.from({ length: Math.max(0, rows - 1) }, (_, index) => (
          <div
            key={index}
            className={cn(SKELETON_BAR, 'h-3')}
            style={{ width: widths[Math.min(index + 1, widths.length - 1)] }}
          />
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
      <div aria-hidden data-testid='skeleton' className={SURFACE_CARD}>
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

function specHasDataTextContent(elements: Record<string, SpecElement>): boolean {
  return Object.values(elements).some(
    (element) =>
      element.type === 'DataText' &&
      asString(element.props?.statePath) === ARENA_GENERATIVE_STREAM_CONTENT_KEY
  )
}

function readStatePath(
  state: Record<string, unknown>,
  path: string,
  scope?: RepeatItemScope
): unknown {
  return readScopedStatePath(state, path, scope)
}

function displayFromStateValue(value: unknown, fallback: string): string {
  if (value === undefined || value === null) return fallback
  const fromAction = displayTextFromActionData(value)
  if (fromAction) return fromAction
  return String(value)
}

function StateTable({
  value,
  columns,
  style,
  busy,
}: {
  value: unknown
  columns?: string
  style?: CSSProperties
  busy?: boolean
}) {
  const declaredHeaders = (columns ?? '')
    .split(',')
    .map((header) => header.trim())
    .filter(Boolean)
  const headers = declaredHeaders.length > 0 ? declaredHeaders : tableHeadersFromState(value)
  const rows = tableRowsFromState(value, headers)
  if (headers.length === 0 && rows.length === 0) return null
  return (
    <div
      aria-busy={busy || undefined}
      className='w-full overflow-x-auto rounded-[var(--gui-radius,12px)] border border-[var(--gui-border,#e2e3e5)] bg-[var(--gui-surface,#ffffff)]'
      style={style}
    >
      <table className='w-full border-collapse text-left text-[length:var(--gui-body-size,16px)] leading-[var(--gui-body-leading,24px)]'>
        {headers.length > 0 ? (
          <thead>
            <tr className='border-[var(--gui-border,#e2e3e5)] border-b bg-[var(--gui-canvas,#f7f8f9)]'>
              {headers.map((header) => (
                <th
                  key={header}
                  className='px-4 py-3 font-medium text-[length:var(--gui-label-size,12px)] text-[var(--gui-text-muted,#575a66)] uppercase tracking-[0.25px]'
                >
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
              className='border-[var(--gui-border,#e2e3e5)] border-b last:border-b-0'
            >
              {row.map((cell, cellIndex) => (
                <td
                  key={`cell-${cellIndex}`}
                  className='px-4 py-3 align-top text-[var(--gui-text,#2c2d33)]'
                >
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

function StateKeyValue({ pairs, busy }: { pairs: Array<[string, string]>; busy?: boolean }) {
  if (pairs.length === 0) return null
  return (
    <dl
      aria-busy={busy || undefined}
      className='grid w-full grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-6 gap-y-3 text-[length:var(--gui-body-size,16px)] leading-[var(--gui-body-leading,24px)]'
    >
      {pairs.map(([key, value]) => (
        <Fragment key={key}>
          <dt className='font-medium text-[length:var(--gui-label-size,12px)] text-[var(--gui-text-muted,#575a66)] uppercase tracking-[0.25px]'>
            {key}
          </dt>
          <dd className='text-[var(--gui-text,#2c2d33)]'>{value}</dd>
        </Fragment>
      ))}
    </dl>
  )
}

const DEFAULT_EMPTY_TEXT = {
  collection: 'No results',
  details: 'No details',
} as const

/**
 * Zero-result copy for a bound collection. `col-span-full` lets it span a parent
 * Grid so an empty Repeat does not shrink to a single card cell.
 */
function EmptyState({ text }: { text: string }) {
  return (
    <p
      data-testid='empty-state'
      className='col-span-full rounded-[var(--gui-radius,12px)] border border-[var(--gui-border,#e2e3e5)] border-dashed bg-[var(--gui-surface,#ffffff)] px-6 py-10 text-center text-[length:var(--gui-body-size,16px)] text-[var(--gui-text-muted,#575a66)]'
    >
      {text}
    </p>
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
  const display = displayFromStateValue(value, fallback)
  if (pending && isEmptyStateValue(value)) {
    return (
      <div aria-live='polite' aria-busy='true'>
        <SkeletonBlock variant='text' lines={DEFAULT_SKELETON_LINES.text} />
      </div>
    )
  }
  return (
    <div aria-live='polite' aria-busy={pending || undefined}>
      <MarkdownText className='font-medium' style={style} content={display} />
    </div>
  )
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

const FIELD_INPUT_CLASS =
  'h-10 w-full rounded-[var(--gui-radius,12px)] border border-[var(--gui-border,#e2e3e5)] bg-[var(--gui-surface,#ffffff)] px-4 text-[length:var(--gui-body-size,16px)] leading-[var(--gui-body-leading,24px)] text-[var(--gui-text,#2c2d33)] outline-none transition-[background-color,border-color,box-shadow] duration-100 placeholder:text-[var(--gui-text-tertiary,#8a8d99)] focus-visible:border-[var(--gui-brand,#1a73e8)] focus-visible:bg-[var(--gui-brand-surface,#f3f8fe)] focus-visible:shadow-[0_0_0_3px_var(--gui-focus,rgb(26_115_232_/_30%))]'
const FIELD_TEXTAREA_CLASS =
  'min-h-[96px] w-full rounded-[var(--gui-radius,12px)] border border-[var(--gui-border,#e2e3e5)] bg-[var(--gui-surface,#ffffff)] px-4 py-2.5 text-[length:var(--gui-body-size,16px)] leading-[var(--gui-body-leading,24px)] text-[var(--gui-text,#2c2d33)] outline-none transition-[background-color,border-color,box-shadow] duration-100 placeholder:text-[var(--gui-text-tertiary,#8a8d99)] focus-visible:border-[var(--gui-brand,#1a73e8)] focus-visible:bg-[var(--gui-brand-surface,#f3f8fe)] focus-visible:shadow-[0_0_0_3px_var(--gui-focus,rgb(26_115_232_/_30%))]'

function fieldErrorClass(error: string | undefined): string {
  return error
    ? 'border-[var(--gui-danger,#f31a1a)] focus-visible:border-[var(--gui-danger,#f31a1a)]'
    : ''
}

function RequiredMark({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <span aria-hidden className='text-[var(--gui-danger,#f31a1a)]'>
      {' *'}
    </span>
  )
}

function ActionBusyMark({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <span
      data-testid='action-busy'
      aria-hidden
      className='inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent'
    />
  )
}

function FieldShell({
  name,
  label,
  htmlFor,
  error,
  required = false,
  children,
}: {
  name: string
  label: string
  htmlFor?: string
  error?: string
  required?: boolean
  children: ReactNode
}) {
  const title = label ? (
    <>
      {label}
      <RequiredMark show={required} />
    </>
  ) : null
  return (
    <div className='flex flex-col gap-1.5'>
      {title ? (
        htmlFor ? (
          <label
            htmlFor={htmlFor}
            className='font-medium text-[length:var(--gui-label-size,12px)] text-[var(--gui-text-muted,#575a66)] leading-[var(--gui-label-leading,16px)] tracking-[0.25px]'
          >
            {title}
          </label>
        ) : (
          <span className='font-medium text-[length:var(--gui-label-size,12px)] text-[var(--gui-text-muted,#575a66)] leading-[var(--gui-label-leading,16px)] tracking-[0.25px]'>
            {title}
          </span>
        )
      ) : null}
      {children}
      {error ? (
        <p
          data-testid={`field-error-${name}`}
          className='text-[length:var(--gui-label-size,12px)] text-[var(--gui-danger,#f31a1a)]'
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}

function sparklinePoints(values: number[]): string {
  if (values.length === 0) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return values
    .map((value, index) => {
      const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100
      const y = 100 - ((value - min) / span) * 100
      return `${x},${y}`
    })
    .join(' ')
}

function numbersFromSparklineProps(
  props: Record<string, unknown>,
  state: Record<string, unknown>,
  scope?: RepeatItemScope
): number[] {
  const statePath = asString(props.statePath)
  if (statePath) {
    const raw = readScopedStatePath(state, statePath, scope)
    if (Array.isArray(raw)) {
      return raw.map((item) => Number(item)).filter((item) => Number.isFinite(item))
    }
  }
  const literal = asString(props.values)
  if (!literal) return []
  return literal
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((item) => Number.isFinite(item))
}

const APP_HEADER_BAR_CLASS =
  'sticky top-0 z-20 w-full border-[var(--gui-border,#e2e3e5)] border-b bg-[var(--gui-surface,#ffffff)]'

function AppHeaderMark({ name }: { name: string }) {
  const Glyph = ICON_BY_NAME[name] ?? Sparkles
  return (
    <span
      data-testid='app-header-mark'
      className='inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--gui-radius-sm,8px)] bg-[var(--gui-text,#2c2d33)]'
    >
      <Glyph aria-hidden className='size-4 text-[var(--gui-surface,#ffffff)]' />
    </span>
  )
}

function AppHeaderBar({ children }: { children: ReactNode }) {
  return (
    <header data-testid='app-header' className={APP_HEADER_BAR_CLASS}>
      <div className='flex w-full items-center px-4 py-3'>{children}</div>
    </header>
  )
}

function isBrandMarkType(type: string | undefined): boolean {
  return type === 'Icon' || type === 'Avatar'
}

/**
 * True when `id` is product chrome: AppHeader, or a horizontal brand row the
 * generator faked with Icon + title inside Section.
 */
function isAppChromeElement(elements: Record<string, SpecElement>, id: string): boolean {
  const element = elements[id]
  if (!element) return false
  if (element.type === 'AppHeader') return true
  if (element.type !== 'Stack' && element.type !== 'Toolbar') return false
  const direction = asString(
    element.props?.direction,
    element.type === 'Toolbar' ? 'horizontal' : 'vertical'
  )
  if (element.type === 'Stack' && direction !== 'horizontal') return false
  const kids = element.children ?? []
  const first = kids[0] ? elements[kids[0]] : undefined
  if (isBrandMarkType(first?.type)) return true
  if (first?.type === 'Stack') {
    const nestedId = first.children?.[0]
    const nested = nestedId ? elements[nestedId] : undefined
    return isBrandMarkType(nested?.type)
  }
  return false
}

function resolvePageChrome(
  elements: Record<string, SpecElement>,
  pageChildIds: string[]
): { id: string | null; nested: boolean } {
  for (const id of pageChildIds) {
    if (elements[id]?.type === 'AppHeader') return { id, nested: false }
  }
  const firstId = pageChildIds[0]
  const first = firstId ? elements[firstId] : undefined
  if (first?.type === 'Section') {
    const sectionFirstId = first.children?.[0]
    if (sectionFirstId && isAppChromeElement(elements, sectionFirstId)) {
      return { id: sectionFirstId, nested: true }
    }
  }
  if (firstId && isAppChromeElement(elements, firstId)) {
    return { id: firstId, nested: false }
  }
  return { id: null, nested: false }
}

function CatalogIcon({ name, well }: { name: string; well: string }) {
  const Glyph = ICON_BY_NAME[name] ?? Search
  const wellClass =
    well === 'circle' ? 'rounded-full' : well === 'square' ? 'rounded-[var(--gui-radius,12px)]' : ''
  const icon = (
    <Glyph
      aria-hidden
      className={cn(well === 'none' ? 'size-5' : 'size-5', 'text-[var(--gui-brand,#1a73e8)]')}
    />
  )
  if (well === 'none') {
    return <span className='inline-flex items-center justify-center'>{icon}</span>
  }
  return (
    <span
      data-testid='icon-well'
      className={cn(
        'inline-flex size-10 items-center justify-center bg-[var(--gui-brand-surface,#f3f8fe)]',
        wellClass || 'rounded-full'
      )}
    >
      {icon}
    </span>
  )
}

function AvatarView({ src, initials }: AvatarModel) {
  return (
    <span
      data-testid='avatar'
      className='inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--gui-brand-surface,#f3f8fe)] font-medium text-[var(--gui-brand,#1a73e8)] text-sm'
    >
      {src ? <img src={src} alt='' className='size-full object-cover' /> : <span>{initials}</span>}
    </span>
  )
}

function specFormFields(elements: Record<string, SpecElement>): ArenaGenerativeFormField[] {
  return Object.values(elements).flatMap((element) =>
    isFormFieldType(element.type) ? [{ type: element.type, props: element.props ?? {} }] : []
  )
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
  if (padding) style.padding = resolveArenaGenerativeSpacing(padding)
  if (maxWidth) style.maxWidth = maxWidth
  if (gap) style.gap = resolveArenaGenerativeSpacing(gap)
  if (size && isCssLength(size)) style.fontSize = size
  return style
}

function WorkspaceView({
  children,
  showInspector,
  style,
}: {
  children: ReactNode
  showInspector: boolean
  style?: CSSProperties
}) {
  const panes = Array.isArray(children) ? children : [children]
  const navigator = panes[0] ?? null
  const primary = panes[1] ?? null
  const inspector = panes[2] ?? null
  return (
    <div
      className={cn(
        'grid w-full grid-cols-1',
        'md:grid-cols-[240px_minmax(0,1fr)]',
        showInspector && inspector ? 'xl:grid-cols-[240px_minmax(0,1fr)_minmax(220px,320px)]' : null
      )}
      style={style}
    >
      {navigator ? <div className='min-w-0'>{navigator}</div> : null}
      <div className='min-w-0'>{primary}</div>
      {showInspector && inspector ? <div className='min-w-0'>{inspector}</div> : null}
    </div>
  )
}

function CatalogStepper({
  items,
  activePath,
  currentPath,
  onNavigate,
  style,
}: {
  items: Array<{ label: string; path: string }>
  activePath: string
  currentPath?: string
  onNavigate: (path: string) => void
  style?: CSSProperties
}) {
  const itemPaths = items.map((item) => splitNavTarget(item.path).path)
  const routePath = currentPath ? splitNavTarget(currentPath).path : ''
  const resolvedActive = itemPaths.includes(routePath) ? routePath : splitNavTarget(activePath).path

  return (
    <ol className='flex w-full flex-wrap items-center gap-2' style={style}>
      {items.map((item, index) => {
        const path = splitNavTarget(item.path).path
        const isActive = path === resolvedActive
        const isLink = path.length > 0 && path !== item.label
        return (
          <li key={`${item.label}-${path}-${index}`} className='flex items-center gap-2'>
            {index > 0 ? (
              <span className='text-[var(--gui-text-muted,#575a66)]' aria-hidden>
                /
              </span>
            ) : null}
            {isLink ? (
              <button
                type='button'
                onClick={() => onNavigate(item.path)}
                aria-current={isActive ? 'step' : undefined}
                className={cn(
                  'text-[length:var(--gui-label-size,12px)]',
                  isActive
                    ? 'font-medium text-[var(--gui-brand,#1a73e8)]'
                    : 'text-[var(--gui-text-muted,#575a66)] hover:text-[var(--gui-text,#2c2d33)]'
                )}
              >
                {index + 1}. {item.label}
              </button>
            ) : (
              <span
                aria-current={isActive ? 'step' : undefined}
                className={cn(
                  'text-[length:var(--gui-label-size,12px)]',
                  isActive
                    ? 'font-medium text-[var(--gui-text,#2c2d33)]'
                    : 'text-[var(--gui-text-muted,#575a66)]'
                )}
              >
                {index + 1}. {item.label}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function CatalogTabs({
  items,
  activePath,
  currentPath,
  onNavigate,
  style,
}: {
  items: Array<{ label: string; path: string }>
  activePath: string
  currentPath?: string
  onNavigate: (path: string) => void
  style?: CSSProperties
}) {
  const itemPaths = items.map((item) => splitNavTarget(item.path).path)
  const routePath = currentPath ? splitNavTarget(currentPath).path : ''
  const resolvedActive = itemPaths.includes(routePath) ? routePath : splitNavTarget(activePath).path

  const focusTab = (event: KeyboardEvent<HTMLButtonElement>, index: number, key: string) => {
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') return
    event.preventDefault()
    const delta = key === 'ArrowRight' ? 1 : -1
    const next = (index + delta + items.length) % items.length
    const tabs = event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')
    const target = tabs?.[next]
    if (target instanceof HTMLElement) target.focus()
  }

  return (
    <nav
      className='flex w-full flex-wrap items-center gap-1 border-[var(--gui-border,#e2e3e5)] border-b'
      style={style}
    >
      {items.map((item, index) => {
        const isActive = splitNavTarget(item.path).path === resolvedActive
        return (
          <button
            key={item.path}
            type='button'
            role='tab'
            tabIndex={isActive ? 0 : -1}
            aria-selected={isActive}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onNavigate(item.path)}
            onKeyDown={(event) => focusTab(event, index, event.key)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2.5 text-[length:var(--gui-body-size,16px)]',
              isActive
                ? 'border-[var(--gui-brand,#1a73e8)] font-medium text-[var(--gui-brand,#1a73e8)]'
                : 'border-transparent text-[var(--gui-text-muted,#575a66)] hover:text-[var(--gui-text,#2c2d33)]'
            )}
          >
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}

function CatalogImage({
  src,
  alt,
  width,
  height,
}: {
  src: string
  alt: string
  width?: string
  height?: string
}) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div
        data-testid='image-fallback'
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        className='flex min-h-16 items-center justify-center bg-[var(--gui-canvas,#f7f8f9)] text-[length:var(--gui-label-size,12px)] text-[var(--gui-text-muted,#575a66)]'
      >
        {alt}
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading='lazy'
      onError={() => setFailed(true)}
    />
  )
}

/**
 * Local overlay chrome for catalog Modal / Drawer. Uses `--gui-*` tokens, not editor ChipModal.
 */
function CatalogOverlayShell({
  testId,
  title,
  placement,
  onClose,
  children,
}: {
  testId: string
  title: string
  placement: 'modal' | 'drawer-left' | 'drawer-right'
  onClose: () => void
  children: ReactNode
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const titleId = `${testId}-title`

  useEffect(() => {
    const previous = document.activeElement
    const focusable = dialogRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    focusable?.focus()
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [])

  const isDrawer = placement !== 'modal'
  const drawerSide = placement === 'drawer-left' ? 'left-0' : 'right-0'

  return (
    <div
      className={
        isDrawer
          ? 'pointer-events-none fixed inset-0 z-30'
          : 'fixed inset-0 z-30 flex items-center justify-center bg-[color-mix(in_srgb,var(--gui-text,#2c2d33)_40%,transparent)] p-4'
      }
    >
      <button
        type='button'
        aria-label='Close'
        className={cn(
          'absolute inset-0 cursor-default bg-transparent',
          isDrawer ? 'pointer-events-auto' : null
        )}
        onClick={() => onCloseRef.current()}
      />
      <div
        ref={dialogRef}
        role='dialog'
        aria-modal='true'
        aria-labelledby={titleId}
        data-testid={testId}
        className={cn(
          'pointer-events-auto flex max-h-[min(90vh,720px)] flex-col overflow-hidden border border-[var(--gui-border,#e8e8ed)] bg-[var(--gui-surface,#fff)] shadow-[var(--gui-shadow-card,0px_2px_8px_rgba(44,45,51,0.1))]',
          isDrawer
            ? cn('absolute top-0 bottom-0 w-[min(100%,24rem)]', drawerSide)
            : 'relative z-10 w-full max-w-lg rounded-[var(--gui-radius,12px)]'
        )}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return
          const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
          if (!nodes?.length) return
          const first = nodes[0]
          const last = nodes[nodes.length - 1]
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
          }
        }}
      >
        <div className='flex items-center justify-between gap-3 border-[var(--gui-border,#e8e8ed)] border-b px-4 py-3'>
          <h2 id={titleId} className='font-semibold text-[var(--gui-text,#2c2d33)] text-base'>
            {title}
          </h2>
          <button
            type='button'
            data-testid={`${testId}-close`}
            className='rounded-[var(--gui-radius,12px)] px-2 py-1 text-[var(--gui-text-muted,#6b7280)] text-sm hover:bg-[var(--gui-surface-muted,#f7f7f8)]'
            onClick={() => onCloseRef.current()}
          >
            Close
          </button>
        </div>
        <div className='min-h-0 flex-1 overflow-auto p-4'>{children}</div>
      </div>
    </div>
  )
}

function DismissibleCatalogOverlay({
  open,
  title,
  testId,
  placement,
  onClearItem,
  onDismiss,
  children,
}: {
  open: boolean
  title: string
  testId: string
  placement: 'modal' | 'drawer-left' | 'drawer-right'
  onClearItem?: () => void
  onDismiss?: () => void
  children: ReactNode
}) {
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!open) setDismissed(false)
  }, [open])

  if (!open || dismissed) return null

  return (
    <CatalogOverlayShell
      testId={testId}
      title={title}
      placement={placement}
      onClose={() => {
        setDismissed(true)
        onDismiss?.()
        onClearItem?.()
      }}
    >
      {children}
    </CatalogOverlayShell>
  )
}

function CatalogToastView({ text, tone }: { text: string; tone: unknown }) {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    setHidden(false)
    const timer = window.setTimeout(() => setHidden(true), GENERATIVE_APP_SUCCESS_TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [text])

  if (hidden) return null

  return (
    <div
      role='status'
      data-testid='catalog-toast'
      className='pointer-events-none fixed inset-x-0 bottom-6 z-20 flex justify-center px-4'
    >
      <p
        className={cn(
          'rounded-[var(--gui-radius,12px)] px-4 py-2 text-sm shadow-[var(--gui-shadow-card,0px_2px_8px_rgba(44,45,51,0.1))]',
          toneClass(tone, 'info')
        )}
      >
        {text}
      </p>
    </div>
  )
}

/**
 * Walks a json-render Spec and renders Arena Generative UI catalog components.
 */
export function SpecRenderer({
  spec,
  state,
  pending,
  pendingActionIds,
  actionHostKeys,
  actionHiddenInputs,
  actionChatProtocol,
  conversationStorageKey,
  uxPlan,
  currentPath,
  onNavigate,
  onRunAction,
  onSelectItem,
  onClearItem,
  onCancelPending,
}: SpecRendererProps) {
  const elements = (spec.elements ?? {}) as Record<string, SpecElement>
  const suppressBoundSkeleton = Object.values(elements).some((element) => {
    if (element.type !== 'WorkingCard') return false
    return element.props?.skeleton !== false
  })
  const [formValues, setFormValues] = useState<Record<string, unknown>>({})
  const [overlayFlags, setOverlayFlags] = useState<Record<string, unknown>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [localPages, setLocalPages] = useState<Record<string, number>>({})
  const knownActionIds = collectKnownActionIds(
    actionHostKeys,
    actionHiddenInputs,
    actionChatProtocol,
    uxPlan?.actions
  )
  const localDiscovery = collectLocalDiscoveryQuery({
    formValues,
    elements,
    knownActionIds,
  })
  const discoverySignature = `${localDiscovery.search}\u0000${JSON.stringify(localDiscovery.filters)}`
  const collectionLengthSignature = Object.entries(elements)
    .filter(([, element]) => element.type === 'Table' || element.type === 'Repeat')
    .map(([id, element]) => {
      const statePath = asString(element.props?.statePath)
      if (!statePath || statePath === 'item' || statePath.startsWith('item.')) {
        return `${id}:static`
      }
      const raw = collectionFromBoundValue(readStatePath(state, statePath))
      return `${id}:${raw?.length ?? 0}`
    })
    .join('|')
  const pageResetSignature = `${discoverySignature}\u0001${collectionLengthSignature}`
  useEffect(() => {
    setLocalPages({})
  }, [pageResetSignature])
  const selectedIdSet = isTruthyFieldValue(state[ARENA_GENERATIVE_SELECTED_ID_KEY])
  const hideListForSelection = selectedIdSet && specHasSamePageSelectItem(spec, currentPath)

  const boundPending = (statePath: string) => {
    if (suppressBoundSkeleton) return false
    return pendingActionIds
      ? isBoundPathPending(statePath, pendingActionIds, actionHostKeys ?? {})
      : pending
  }

  const controlPending = (actionId: string) => {
    if (!UX_DEFAULTS.Button.disabledWhileLoading) return false
    if (uxPlan && actionId && !(actionId in uxPlan.actions)) return false
    return isActionControlPending(actionId, pendingActionIds, pending)
  }

  const confirmAction = (actionId: string, fallbackDestructive = false) => {
    if (!actionId) return false
    const plan = uxPlan?.actions[actionId]
    return plan ? plan.confirm : fallbackDestructive
  }

  const confirmMeta = (
    actionId: string,
    fallbackDestructive = false
  ): RunGenerativeAppActionMeta | undefined =>
    confirmAction(actionId, fallbackDestructive) ? { destructive: true } : undefined

  const omitHiddenInputs = (actionId: string, values: Record<string, unknown>) => {
    const hidden = actionHiddenInputs?.[actionId]
    if (!hidden || hidden.length === 0) return values
    const drop = new Set(hidden)
    const next: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(values)) {
      if (!drop.has(key)) next[key] = value
    }
    return next
  }

  const dispatchAction = (
    actionId: string,
    values: Record<string, unknown>,
    meta?: RunGenerativeAppActionMeta
  ) => {
    let next = omitHiddenInputs(actionId, values)
    const protocol = actionChatProtocol?.[actionId]
    if (protocol?.input || protocol?.conversationId) {
      next = {
        ...next,
        conversationId: getGenerativeAppConversationId(conversationStorageKey ?? ''),
      }
    }
    if (meta) return onRunAction(actionId, next, meta)
    return onRunAction(actionId, next)
  }

  const requestNavigate = (target: string) => {
    const path = splitNavTarget(target).path
    if (currentPath && path === currentPath && selectedIdSet) {
      onClearItem?.()
      return
    }
    onNavigate(target)
  }

  function pageCollection<T>(
    elementId: string,
    items: readonly T[],
    statePath: string,
    itemScope?: RepeatItemScope
  ): { visible: readonly T[]; chrome: ReactNode } {
    const apiOwned = statePath.length > 0 && collectionUsesApiPagination(statePath, actionHostKeys)
    if (apiOwned || items.length <= LOCAL_COLLECTION_PAGE_SIZE) {
      return { visible: items, chrome: null }
    }
    const key = collectionPageKey(elementId, itemScope)
    const paged = paginateCollection(items, localPages[key] ?? 1)
    return {
      visible: paged.items,
      chrome: (
        <CollectionPageChrome
          paged={paged}
          onPageChange={(page) =>
            setLocalPages((current) => ({
              ...current,
              [key]: page,
            }))
          }
        />
      ),
    }
  }

  /**
   * Chrome hoisted out of Section is rendered once at Page, then skipped when
   * the Section walks the same child id.
   */
  const chromeSkipIds = new Set<string>()

  /**
   * `withinForm` tracks whether an ancestor is a `Form`. A `SubmitButton` outside one
   * submits nothing, so it needs its `actionId` wired to a click instead. `formActionId`
   * is the enclosing Form's action so submit and fields pending is per that CTA.
   */
  const renderNode = (
    id: string,
    scope?: RepeatItemScope,
    withinForm = false,
    formActionId = ''
  ): ReactNode => {
    if (chromeSkipIds.has(id)) return null
    const element = elements[id]
    if (!element) return null
    const props = interpolateElementProps(element.props ?? {}, { state, scope, pending })
    const childIds = element.children ?? []
    const childWithinForm = withinForm || element.type === 'Form'
    const nextFormActionId =
      element.type === 'Form'
        ? asString(props.actionId) || submitButtonActionId(elements, childIds)
        : formActionId
    const fieldActionId = asString(props.actionId) || nextFormActionId
    if (
      isFormFieldType(element.type) &&
      asString(props.name) &&
      (actionHiddenInputs?.[fieldActionId] ?? []).includes(asString(props.name))
    ) {
      return null
    }
    const children = childIds.map((childId) => (
      <Fragment key={childId}>
        {renderNode(childId, scope, childWithinForm, nextFormActionId)}
      </Fragment>
    ))
    const hasChildren = childIds.length > 0
    const fieldBusy = controlPending(formActionId)
    const fieldSnapshot = snapshotFormValues(specFormFields(elements), formValues, state, scope)
    const actionValues = {
      ...paginationActionValues(state),
      ...formValues,
      ...(scope ? repeatItemActionValues(scope.item, scope.index) : {}),
    }
    const visibilityValues = {
      ...state,
      ...formValues,
      ...(scope ? repeatItemActionValues(scope.item, scope.index) : {}),
      ...overlayFlags,
    }

    const applyOverlayPatch = (patch: Record<string, unknown>) => {
      setOverlayFlags((current) => ({ ...current, ...patch }))
    }

    const setNamedValue = (name: string, value: unknown) => {
      setFormValues((current) => ({ ...current, [name]: value }))
      setFieldErrors((current) => {
        if (!current[name]) return current
        const next = { ...current }
        delete next[name]
        return next
      })
    }

    switch (element.type) {
      case 'Page': {
        const hasPageHeader = childIds.some((childId) => elements[childId]?.type === 'PageHeader')
        const title = asString(props.title)
        const chrome = resolvePageChrome(elements, childIds)
        let chromeNode: ReactNode = null
        if (chrome.id) {
          const node = renderNode(chrome.id)
          chromeNode =
            elements[chrome.id]?.type === 'AppHeader' ? node : <AppHeaderBar>{node}</AppHeaderBar>
        }
        if (chrome.id && chrome.nested) chromeSkipIds.add(chrome.id)
        const bodyIds =
          chrome.id && !chrome.nested ? childIds.filter((id) => id !== chrome.id) : childIds
        return (
          <div
            className='relative min-h-full bg-[var(--gui-canvas,#f7f8f9)] text-[length:var(--gui-body-size,16px)] text-[var(--gui-text,#2c2d33)] leading-[var(--gui-body-leading,24px)]'
            style={styleFromProps(props)}
          >
            {chromeNode}
            {title && !hasPageHeader ? <h1 className='sr-only'>{title}</h1> : null}
            {bodyIds.map((childId) => (
              <Fragment key={childId}>{renderNode(childId)}</Fragment>
            ))}
          </div>
        )
      }
      case 'Section':
        if (!fieldIsVisible(props, visibilityValues)) return null
        return (
          <section
            className={cn(
              'mx-auto flex w-full flex-col gap-[var(--gui-section-gap,24px)] px-6 py-8',
              sectionWidthClass(props.width)
            )}
            style={styleFromProps(props)}
          >
            {children}
          </section>
        )
      case 'Stack': {
        if (!fieldIsVisible(props, visibilityValues)) return null
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
            style={{
              gap: resolveArenaGenerativeSpacing(asString(props.gap, 'var(--gui-gap, 16px)')),
              ...styleFromProps(props),
            }}
          >
            {children}
          </div>
        )
      }
      case 'Grid':
        if (!fieldIsVisible(props, visibilityValues)) return null
        return (
          <div
            className='grid w-full'
            style={{
              gridTemplateColumns: gridTemplateColumns(props),
              gap: resolveArenaGenerativeSpacing(asString(props.gap, 'var(--gui-gap, 16px)')),
              ...styleFromProps(props),
            }}
          >
            {children}
          </div>
        )
      case 'Repeat': {
        if (!fieldIsVisible(props, visibilityValues)) return null
        if (hideListForSelection) return null
        const statePath = asString(props.statePath)
        const stateValue = statePath ? readStatePath(state, statePath, scope) : undefined
        const rawItems = collectionFromBoundValue(stateValue)
        const items = filterCollectionItems(rawItems ?? [], localDiscovery)
        if (
          statePath &&
          boundPending(statePath) &&
          isEmptyStateValue(stateValue) &&
          (!rawItems || rawItems.length === 0)
        ) {
          return (
            <>
              {Array.from({ length: 3 }, (_, index) => (
                <SkeletonBlock
                  key={`repeat-skeleton-${index}`}
                  variant='card'
                  lines={DEFAULT_SKELETON_LINES.card}
                />
              ))}
            </>
          )
        }
        if (!rawItems || rawItems.length === 0) {
          if (!statePath) return null
          return <EmptyState text={asString(props.emptyText, DEFAULT_EMPTY_TEXT.collection)} />
        }
        if (items.length === 0) {
          return <EmptyState text={asString(props.emptyText, DEFAULT_EMPTY_TEXT.collection)} />
        }
        const { visible: visibleItems, chrome } = pageCollection(id, items, statePath, scope)
        const refetching = Boolean(statePath && boundPending(statePath))
        return (
          <>
            <div className='contents' aria-busy={refetching || undefined}>
              {visibleItems.map((item, index) => (
                <Fragment key={repeatItemKey(item, index)}>
                  {childIds.map((childId) => (
                    <Fragment key={childId}>{renderNode(childId, { item, index })}</Fragment>
                  ))}
                </Fragment>
              ))}
            </div>
            {chrome}
          </>
        )
      }
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
            style={{
              gap: resolveArenaGenerativeSpacing(asString(props.gap, 'var(--gui-gap, 16px)')),
              ...styleFromProps(props),
            }}
          >
            {children}
          </div>
        )
      }
      case 'Workspace': {
        const inspectorWhen = asString(props.inspectorWhen)
        const showInspector =
          !inspectorWhen || fieldIsVisible({ showWhen: inspectorWhen }, visibilityValues)
        return (
          <WorkspaceView
            showInspector={showInspector}
            style={{
              gap: resolveArenaGenerativeSpacing(asString(props.gap, 'var(--gui-gap, 16px)')),
              ...styleFromProps(props),
            }}
          >
            {children}
          </WorkspaceView>
        )
      }
      case 'AppHeader': {
        const title = asString(props.title)
        const icon = asString(props.icon, 'spark')
        return (
          <header
            data-testid='app-header'
            className={APP_HEADER_BAR_CLASS}
            style={styleFromProps(props)}
          >
            <div className='flex w-full items-center justify-between gap-3 px-4 py-3'>
              <div className='flex min-w-0 items-center gap-2.5'>
                <AppHeaderMark name={icon} />
                {title ? (
                  <p className='truncate font-semibold text-[length:var(--gui-body-size,16px)] text-[var(--gui-text,#2c2d33)] leading-[var(--gui-body-leading,24px)]'>
                    {title}
                  </p>
                ) : null}
              </div>
              {hasChildren ? (
                <div className='flex shrink-0 items-center gap-2'>{children}</div>
              ) : null}
            </div>
          </header>
        )
      }
      case 'PageHeader': {
        const align = asString(props.align, 'start')
        const kicker = asString(props.kicker)
        const subtitle = asString(props.subtitle)
        const isCenter = align === 'center'
        const title = (
          <h1
            className={cn(
              'font-semibold text-[var(--gui-text,#2c2d33)] tracking-tight',
              isCenter
                ? 'text-[length:var(--gui-display-size,40px)] leading-[var(--gui-display-leading,48px)]'
                : 'text-[length:var(--gui-heading-size,32px)] leading-[var(--gui-heading-leading,40px)]'
            )}
          >
            {asString(props.title)}
          </h1>
        )
        const copy = (
          <div
            className={cn(
              'flex min-w-0 flex-col gap-2',
              isCenter && 'mx-auto items-center text-center'
            )}
          >
            {kicker ? (
              <p className='font-medium text-[length:var(--gui-label-size,12px)] text-[var(--gui-brand,#1a73e8)] uppercase tracking-[0.16em]'>
                {kicker}
              </p>
            ) : null}
            {title}
            {subtitle ? (
              <p
                className={cn(
                  'max-w-[var(--gui-measure,40rem)] text-[length:var(--gui-body-size,16px)] text-[var(--gui-text-muted,#575a66)] leading-[1.5]',
                  isCenter && 'mx-auto'
                )}
              >
                {subtitle}
              </p>
            ) : null}
          </div>
        )
        if (isCenter) {
          return (
            <div className='relative w-full pb-1' style={styleFromProps(props)}>
              {hasChildren ? (
                <div className='absolute top-0 right-0 flex items-center gap-2'>{children}</div>
              ) : null}
              {copy}
            </div>
          )
        }
        return (
          <div
            className='flex w-full flex-wrap items-end justify-between gap-4 pb-1'
            style={styleFromProps(props)}
          >
            {copy}
            {hasChildren ? <div className='flex items-center gap-2'>{children}</div> : null}
          </div>
        )
      }
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
      case 'Filter': {
        if (!fieldIsVisible(props, visibilityValues)) return null
        const justify = asString(props.justify, 'start')
        return (
          <div
            data-testid='filter'
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
        if (items.length === 0) return null
        return (
          <CatalogTabs
            items={items}
            activePath={asString(props.activePath)}
            currentPath={currentPath}
            onNavigate={requestNavigate}
            style={styleFromProps(props)}
          />
        )
      }
      case 'Stepper': {
        const items = parseTabItems(props.items)
        if (items.length === 0) return null
        return (
          <CatalogStepper
            items={items}
            activePath={asString(props.activePath)}
            currentPath={currentPath}
            onNavigate={requestNavigate}
            style={styleFromProps(props)}
          />
        )
      }
      case 'Table': {
        const statePath = asString(props.statePath)
        const stateValue = statePath ? readStatePath(state, statePath, scope) : undefined
        const rawCollection = collectionFromBoundValue(stateValue)
        const collection = rawCollection
          ? filterCollectionItems(rawCollection, localDiscovery)
          : undefined
        const boundEmpty = Boolean(
          statePath && (rawCollection ? rawCollection.length === 0 : isEmptyStateValue(stateValue))
        )
        if (statePath && boundPending(statePath) && boundEmpty) {
          return <SkeletonBlock variant='table' lines={DEFAULT_SKELETON_LINES.table} />
        }
        if (statePath && !boundPending(statePath) && boundEmpty) {
          const hasStatic =
            asString(props.columns).trim().length > 0 || asString(props.rows).trim().length > 0
          if (stateValue !== undefined || !hasStatic) {
            return <EmptyState text={asString(props.emptyText, DEFAULT_EMPTY_TEXT.collection)} />
          }
        }
        if (rawCollection && rawCollection.length > 0 && collection && collection.length === 0) {
          return <EmptyState text={asString(props.emptyText, DEFAULT_EMPTY_TEXT.collection)} />
        }
        if (collection && collection.length > 0) {
          const { visible, chrome } = pageCollection(id, collection, statePath, scope)
          return (
            <div className='flex w-full flex-col'>
              <StateTable
                value={visible}
                columns={asString(props.columns)}
                style={styleFromProps(props)}
                busy={Boolean(statePath && boundPending(statePath))}
              />
              {chrome}
            </div>
          )
        }
        if (stateValue === undefined) {
          const headers = asString(props.columns)
            .split(',')
            .map((header) => header.trim())
            .filter(Boolean)
          const rows = filterStaticTableRows(
            headers,
            asString(props.rows)
              .split('\n')
              .map((row) => row.trim())
              .filter(Boolean)
              .map(splitTableRow),
            localDiscovery
          )
          if (headers.length === 0 && rows.length === 0) return null
          if (rows.length === 0) {
            return <EmptyState text={asString(props.emptyText, DEFAULT_EMPTY_TEXT.collection)} />
          }
          const { visible, chrome } = pageCollection(id, rows, '', scope)
          return (
            <div className='flex w-full flex-col'>
              <div
                className='w-full overflow-x-auto rounded-[var(--gui-radius,12px)] border border-[var(--gui-border,#e2e3e5)] bg-[var(--gui-surface,#ffffff)]'
                style={styleFromProps(props)}
              >
                <table className='w-full border-collapse text-left text-[length:var(--gui-body-size,16px)] leading-[var(--gui-body-leading,24px)]'>
                  {headers.length > 0 ? (
                    <thead>
                      <tr className='border-[var(--gui-border,#e2e3e5)] border-b bg-[var(--gui-canvas,#f7f8f9)]'>
                        {headers.map((header) => (
                          <th
                            key={header}
                            className='px-4 py-3 font-medium text-[length:var(--gui-label-size,12px)] text-[var(--gui-text-muted,#575a66)] uppercase tracking-[0.25px]'
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  ) : null}
                  <tbody>
                    {visible.map((row, rowIndex) => (
                      <tr
                        key={`row-${rowIndex}`}
                        className='border-[var(--gui-border,#e2e3e5)] border-b last:border-b-0'
                      >
                        {row.map((cell, cellIndex) => (
                          <td
                            key={`cell-${cellIndex}`}
                            className='px-4 py-3 align-top text-[var(--gui-text,#2c2d33)]'
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {chrome}
            </div>
          )
        }
        return (
          <StateTable
            value={stateValue}
            columns={asString(props.columns)}
            style={styleFromProps(props)}
            busy={Boolean(statePath && boundPending(statePath))}
          />
        )
      }
      case 'Stat': {
        const statePath = asString(props.statePath)
        const stateValue = statePath ? readStatePath(state, statePath, scope) : undefined
        if (
          statePath &&
          boundPending(statePath) &&
          isEmptyStateValue(stateValue) &&
          !asString(props.value)
        ) {
          return <SkeletonBlock variant='stat' lines={DEFAULT_SKELETON_LINES.stat} />
        }
        const value =
          stateValue === undefined
            ? asString(props.value)
            : displayFromStateValue(stateValue, asString(props.value))
        const delta = asString(props.delta)
        const isDisplay = asString(props.size) === 'display'
        const refetching =
          Boolean(statePath) && boundPending(statePath) && !isEmptyStateValue(stateValue)
        return (
          <div
            aria-busy={refetching || undefined}
            className={cn('flex flex-col gap-2', SURFACE_STAT)}
            style={styleFromProps(props)}
          >
            <span className='font-medium text-[length:var(--gui-label-size,12px)] text-[var(--gui-text-muted,#575a66)] uppercase tracking-[0.25px]'>
              {asString(props.label)}
            </span>
            <div className='flex flex-wrap items-baseline gap-2'>
              <span
                className={cn(
                  'font-semibold text-[var(--gui-text,#2c2d33)]',
                  isDisplay
                    ? 'text-[length:var(--gui-stat-size,40px)] leading-[var(--gui-stat-leading,48px)]'
                    : 'text-[length:var(--gui-title-size,24px)] leading-[var(--gui-title-leading,32px)]'
                )}
              >
                {value}
              </span>
              {delta ? (
                <span className={cn('font-medium text-sm', deltaToneClass(props.deltaTone))}>
                  {delta}
                </span>
              ) : null}
            </div>
            {asString(props.hint) ? (
              <span className='text-[length:var(--gui-label-size,12px)] text-[var(--gui-text-muted,#575a66)]'>
                {asString(props.hint)}
              </span>
            ) : null}
          </div>
        )
      }
      case 'Sparkline': {
        const series = numbersFromSparklineProps(props, state, scope)
        const statePath = asString(props.statePath)
        if (statePath && boundPending(statePath) && series.length === 0) {
          return <SkeletonBlock variant='stat' lines={1} />
        }
        const points = sparklinePoints(series)
        const label = asString(props.label)
        return (
          <div
            className='flex w-full flex-col gap-2'
            data-testid='sparkline'
            style={styleFromProps(props)}
          >
            {label ? (
              <span className='font-medium text-[length:var(--gui-label-size,12px)] text-[var(--gui-text-muted,#575a66)]'>
                {label}
              </span>
            ) : null}
            <svg
              viewBox='0 0 100 100'
              preserveAspectRatio='none'
              className='h-10 w-full'
              aria-hidden={label ? undefined : true}
              role={label ? 'img' : undefined}
            >
              {label ? <title>{label}</title> : null}
              {points ? (
                <polyline
                  fill='none'
                  stroke='var(--gui-brand, #1a73e8)'
                  strokeWidth='2'
                  strokeLinejoin='round'
                  strokeLinecap='round'
                  points={points}
                  vectorEffect='non-scaling-stroke'
                />
              ) : null}
            </svg>
          </div>
        )
      }
      case 'Chart': {
        const statePath = asString(props.statePath)
        const bound = bindChartData(props, state, scope)
        if (statePath && boundPending(statePath) && !bound.dsl) {
          return <SkeletonBlock variant='card' lines={4} />
        }
        if (!bound.dsl) {
          return <EmptyState text={bound.emptyText} />
        }
        return (
          <div className='w-full' style={styleFromProps(props)}>
            <ConstrainedChart dsl={bound.dsl} height={bound.height} />
          </div>
        )
      }
      case 'EmptyState':
        return (
          <div
            data-testid='empty-state'
            className='flex w-full flex-col items-center gap-3 rounded-[var(--gui-radius,12px)] border border-[var(--gui-border,#e2e3e5)] bg-[var(--gui-surface,#fff)] px-6 py-10 text-center'
            style={styleFromProps(props)}
          >
            {asString(props.icon) ? (
              <CatalogIcon name={asString(props.icon)} well='circle' />
            ) : null}
            <p className='font-semibold text-[length:var(--gui-title-size,24px)] text-[var(--gui-text,#2c2d33)]'>
              {asString(props.title)}
            </p>
            {asString(props.body) ? (
              <p className='max-w-[var(--gui-measure,40rem)] text-[length:var(--gui-body-size,16px)] text-[var(--gui-text-muted,#575a66)]'>
                {asString(props.body)}
              </p>
            ) : null}
            {hasChildren ? <div className='mt-1'>{children}</div> : null}
          </div>
        )
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
      case 'Chip': {
        const tone = asString(props.tone, 'muted')
        const text = asString(props.text)
        const actionId = asString(props.actionId)
        const navigateTo = asString(props.navigateTo)
        const setValue = asString(props.setValue)
        const interactive = Boolean(actionId || navigateTo || setValue)
        const className = cn(
          'inline-flex items-center rounded-full px-3 py-1.5 font-medium text-sm',
          CHIP_TONE_CLASSES[tone as keyof typeof CHIP_TONE_CLASSES] ?? CHIP_TONE_CLASSES.muted
        )
        const runChip = () => {
          if (actionId && confirmAction(actionId)) {
            void dispatchAction(actionId, actionValues, confirmMeta(actionId))
            return
          }
          if (setValue) {
            const parsed = parseChipSetValue(setValue)
            setNamedValue(parsed.name || firstSearchFieldName(elements), parsed.value)
          }
          if (navigateTo) requestNavigate(navigateTo)
          if (actionId) void dispatchAction(actionId, actionValues)
        }
        const chipBusy = Boolean(actionId) && controlPending(actionId)
        if (!interactive) {
          return (
            <span className={className} style={styleFromProps(props)}>
              {text}
            </span>
          )
        }
        return (
          <button
            type='button'
            disabled={chipBusy}
            aria-busy={chipBusy || undefined}
            className={cn(className, chipBusy && 'gap-2')}
            style={styleFromProps(props)}
            onClick={runChip}
          >
            <ActionBusyMark show={chipBusy} />
            {text}
          </button>
        )
      }
      case 'Icon':
        return (
          <CatalogIcon name={asString(props.name, 'spark')} well={asString(props.well, 'circle')} />
        )
      case 'Avatar':
        return <AvatarView {...avatarModel(props, state, scope)} />
      case 'EntityHeader': {
        const avatar = avatarModel(props, state, scope)
        const meta = parseOptionList(props.meta)
        return (
          <div
            data-testid='entity-header'
            className='flex w-full flex-col gap-3'
            style={styleFromProps(props)}
          >
            <div className='flex items-start gap-4'>
              <AvatarView {...avatar} />
              <div className='flex min-w-0 flex-1 flex-col gap-2'>
                <div className='flex flex-wrap items-center gap-2'>
                  <h2 className='font-semibold text-[length:var(--gui-title-size,24px)] text-[var(--gui-text,#2c2d33)] leading-[var(--gui-title-leading,32px)]'>
                    {asString(props.title)}
                  </h2>
                  {asString(props.badge) ? (
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs',
                        toneClass(props.badgeTone)
                      )}
                    >
                      {asString(props.badge)}
                    </span>
                  ) : null}
                </div>
                {asString(props.description) ? (
                  <p className='max-w-[var(--gui-measure,40rem)] text-[length:var(--gui-body-size,16px)] text-[var(--gui-text-muted,#575a66)] leading-[1.5]'>
                    {asString(props.description)}
                  </p>
                ) : null}
                {meta.length > 0 ? (
                  <div className='flex flex-wrap gap-2'>
                    {meta.map((item) => (
                      <span
                        key={item}
                        className={cn(
                          'inline-flex items-center rounded-full px-3 py-1 font-medium text-sm',
                          CHIP_TONE_CLASSES.muted
                        )}
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                ) : null}
                {hasChildren ? (
                  <div className='flex flex-wrap items-center gap-3'>{children}</div>
                ) : null}
              </div>
            </div>
          </div>
        )
      }
      case 'KeyValue': {
        const statePath = asString(props.statePath)
        const stateValue = statePath ? readStatePath(state, statePath, scope) : undefined
        const pairs = keyValuePairs(props.items, stateValue)
        if (pairs.length === 0 && statePath && boundPending(statePath)) {
          return <SkeletonBlock variant='text' lines={DEFAULT_SKELETON_LINES.text} />
        }
        if (pairs.length === 0 && statePath && !boundPending(statePath)) {
          return <EmptyState text={asString(props.emptyText, DEFAULT_EMPTY_TEXT.details)} />
        }
        return <StateKeyValue pairs={pairs} busy={Boolean(statePath && boundPending(statePath))} />
      }
      case 'Card': {
        if (!fieldIsVisible(props, visibilityValues)) return null
        const mediaIds: string[] = []
        const footerIds: string[] = []
        const bodyIds: string[] = []
        for (const childId of childIds) {
          const childType = elements[childId]?.type ?? ''
          if (CARD_MEDIA_TYPES.has(childType) && mediaIds.length === 0) {
            mediaIds.push(childId)
          } else if (CARD_FOOTER_TYPES.has(childType)) {
            footerIds.push(childId)
          } else {
            bodyIds.push(childId)
          }
        }
        const title = asString(props.title)
        const subtitle = asString(props.subtitle)
        const description = asString(props.description)
        const footerText = asString(props.footerText)
        const mediaType = mediaIds[0] ? elements[mediaIds[0]]?.type : undefined
        const mediaBesideTitle = mediaType === 'Avatar'
        const heading =
          title || subtitle || description ? (
            <div className='flex min-w-0 flex-col gap-1'>
              {title ? (
                <h2 className='font-semibold text-[length:var(--gui-title-size,24px)] text-[var(--gui-text,#2c2d33)] leading-[var(--gui-title-leading,32px)]'>
                  {title}
                </h2>
              ) : null}
              {subtitle ? (
                <p className='text-[length:var(--gui-body-size,16px)] text-[var(--gui-text-muted,#575a66)] leading-[var(--gui-body-leading,24px)]'>
                  {subtitle}
                </p>
              ) : null}
              {description ? (
                <p className='line-clamp-3 text-[length:var(--gui-body-size,16px)] text-[var(--gui-text-muted,#575a66)] leading-[var(--gui-body-leading,24px)]'>
                  {description}
                </p>
              ) : null}
            </div>
          ) : null
        return (
          <div
            data-testid='card'
            data-variant={asString(props.variant, 'default')}
            className={cn('flex flex-col gap-4', cardSurfaceClass(props.variant))}
            style={styleFromProps(props)}
          >
            {mediaBesideTitle ? (
              <div className='flex items-start gap-3'>
                {mediaIds.map((childId) => (
                  <Fragment key={childId}>{renderNode(childId, scope, childWithinForm)}</Fragment>
                ))}
                {heading}
              </div>
            ) : (
              <>
                {mediaIds.map((childId) => (
                  <Fragment key={childId}>{renderNode(childId, scope, childWithinForm)}</Fragment>
                ))}
                {heading}
              </>
            )}
            {bodyIds.map((childId) => (
              <Fragment key={childId}>{renderNode(childId, scope, childWithinForm)}</Fragment>
            ))}
            {footerText || footerIds.length > 0 ? (
              <div
                data-testid='card-footer'
                className='flex flex-wrap items-center justify-between gap-2 border-[var(--gui-border,#e2e3e5)] border-t pt-4'
              >
                {footerText ? (
                  <span className='text-[length:var(--gui-label-size,12px)] text-[var(--gui-text-muted,#575a66)]'>
                    {footerText}
                  </span>
                ) : (
                  <span />
                )}
                <div className='flex flex-wrap items-center gap-2'>
                  {footerIds.map((childId) => (
                    <Fragment key={childId}>{renderNode(childId, scope, childWithinForm)}</Fragment>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )
      }
      case 'Heading': {
        const level = asString(props.level, 'h2')
        const Tag = (['h1', 'h2', 'h3', 'h4'].includes(level) ? level : 'h2') as
          | 'h1'
          | 'h2'
          | 'h3'
          | 'h4'
        return (
          <Tag
            className={cn(
              'font-semibold text-[var(--gui-text,#2c2d33)] tracking-tight',
              HEADING_SIZE_CLASSES[Tag]
            )}
            style={styleFromProps(props)}
          >
            {asString(props.text)}
          </Tag>
        )
      }
      case 'Text':
        return (
          <MarkdownText
            className='text-[var(--gui-text,#2c2d33)]'
            style={styleFromProps(props)}
            content={asString(props.text)}
          />
        )
      case 'DataText': {
        if (!fieldIsVisible(props, visibilityValues)) return null
        const path = asString(props.statePath)
        if (path === ARENA_GENERATIVE_STREAM_CONTENT_KEY && chatTurnsFromState(state).length > 0) {
          return null
        }
        return (
          <DataTextView
            value={readStatePath(state, path, scope)}
            fallback={asString(props.fallback, '')}
            pending={boundPending(path)}
            style={styleFromProps(props)}
          />
        )
      }
      case 'Alert':
        return (
          <div
            className={cn('rounded-[var(--gui-radius-sm,8px)] px-4 py-3', toneClass(props.tone))}
          >
            <MarkdownText content={asString(props.text)} />
          </div>
        )
      case 'Toast': {
        if (!fieldIsVisible(props, visibilityValues)) return null
        return <CatalogToastView text={asString(props.text)} tone={props.tone} />
      }
      case 'Modal':
      case 'Drawer': {
        const side = asString(props.side, 'right')
        const closePatch = overlayClosePatch(props.showWhen)
        return (
          <DismissibleCatalogOverlay
            open={fieldIsVisible(props, visibilityValues)}
            title={asString(props.title)}
            testId={element.type === 'Modal' ? 'modal' : 'drawer'}
            placement={
              element.type === 'Modal' ? 'modal' : side === 'left' ? 'drawer-left' : 'drawer-right'
            }
            onDismiss={
              Object.keys(closePatch).length > 0 ? () => applyOverlayPatch(closePatch) : undefined
            }
            onClearItem={overlayShowWhenUsesSelection(props.showWhen) ? onClearItem : undefined}
          >
            {children}
          </DismissibleCatalogOverlay>
        )
      }
      case 'Spinner':
        return pending ? (
          <p className='text-[length:var(--gui-body-size,16px)] text-[var(--gui-text-muted,#575a66)]'>
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
        const steps = parseProgressStepLines(asString(props.steps))
        return (
          <ProgressStepsView
            pending={pending}
            steps={steps}
            durationMs={asPositiveNumber(props.durationMs, DEFAULT_PROGRESS_DURATION_MS)}
          />
        )
      }
      case 'WorkingCard': {
        const steps = parseProgressStepLines(asString(props.steps))
        const intervalMs = asPositiveNumber(
          props.intervalMs,
          steps.length > 0
            ? asPositiveNumber(props.durationMs, DEFAULT_WORKING_INTERVAL_MS * steps.length) /
                steps.length
            : DEFAULT_WORKING_INTERVAL_MS
        )
        const cancelTo = asString(props.cancelTo)
        const showSkeleton = props.skeleton !== false
        return (
          <WorkingCardView
            pending={pending}
            title={asString(props.title)}
            estimate={asString(props.estimate)}
            tip={asString(props.tip)}
            steps={steps}
            intervalMs={intervalMs}
            cancelLabel={asString(props.cancelLabel, 'Cancel')}
            showSkeleton={showSkeleton}
            onCancel={
              onCancelPending || cancelTo
                ? () => {
                    onCancelPending?.()
                    if (cancelTo) onNavigate(cancelTo)
                  }
                : undefined
            }
          />
        )
      }
      case 'ProgressBar': {
        const statePath = asString(props.statePath)
        const stateValue = statePath ? readStatePath(state, statePath, scope) : undefined
        const raw = stateValue === undefined ? props.value : stateValue
        const parsed = asFiniteNumber(raw)
        if (!pending && parsed === undefined) {
          return null
        }
        const percent = Math.min(100, Math.max(0, parsed ?? (pending ? 12 : 0)))
        const label = asString(props.label)
        return (
          <div className='flex w-full flex-col gap-2' style={styleFromProps(props)}>
            {label ? (
              <span className='text-[length:var(--gui-label-size,12px)] text-[var(--gui-text-muted,#575a66)]'>
                {label}
              </span>
            ) : null}
            <div
              data-testid='progress-bar'
              className='h-2 w-full overflow-hidden rounded-full bg-[var(--gui-border,#e2e3e5)]'
              role='progressbar'
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(percent)}
            >
              <div
                className='h-full rounded-full bg-[var(--gui-brand,#1a73e8)] transition-[width] duration-300'
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        )
      }
      case 'Chat': {
        const actionId = asString(props.actionId)
        if (!actionId) return null
        const protocol = actionChatProtocol?.[actionId]
        const turns = chatTurnsFromState(state)
        const contentValue = state[ARENA_GENERATIVE_STREAM_CONTENT_KEY]
        const contentPending = boundPending(ARENA_GENERATIVE_STREAM_CONTENT_KEY)
        const showTurnList = turns.length > 0
        const showLegacyTranscript =
          !showTurnList &&
          Boolean(protocol) &&
          !specHasDataTextContent(elements) &&
          (contentPending || !isEmptyStateValue(contentValue))
        const composer = (
          <ChatComposer
            actionId={actionId}
            placeholder={asString(props.placeholder, 'Message')}
            protocol={protocol}
            conversationStorageKey={conversationStorageKey}
            hostState={state}
            pending={controlPending(actionId)}
            onSubmit={(id, values) => dispatchAction(id, values, { surface: 'chat' })}
          />
        )
        if (!showTurnList && !showLegacyTranscript) return composer
        return (
          <div className='flex w-full flex-col gap-3'>
            <div data-testid='generative-chat-transcript' className='flex w-full flex-col gap-3'>
              {showTurnList ? (
                turns.map((turn, index) => (
                  <div
                    key={`${turn.role}-${index}`}
                    data-testid='generative-chat-turn'
                    data-role={turn.role}
                    className={cn(
                      'max-w-[85%] rounded-[var(--gui-radius,12px)] px-3 py-2',
                      turn.role === 'user'
                        ? 'self-end bg-[var(--gui-brand-surface,#f3f8fe)] text-[var(--gui-text,#2c2d33)]'
                        : 'self-start bg-[var(--gui-surface,#fff)] text-[var(--gui-text,#2c2d33)]'
                    )}
                  >
                    <DataTextView
                      value={turn.content}
                      fallback=''
                      pending={
                        turn.role === 'assistant' &&
                        index === turns.length - 1 &&
                        contentPending &&
                        !turn.content
                      }
                    />
                  </div>
                ))
              ) : (
                <DataTextView
                  value={contentValue}
                  fallback=''
                  pending={contentPending}
                  style={styleFromProps(props)}
                />
              )}
            </div>
            {composer}
          </div>
        )
      }
      case 'Form': {
        const actionId =
          asString(props.actionId) || submitButtonActionId(elements, element.children ?? [])
        const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
          event.preventDefault()
          const fields = listFormFields(elements, element.children ?? [])
          const mergedValues = {
            ...formValues,
            ...valuesFromFormElement(event.currentTarget),
          }
          const errors = validateVisibleFields(fields, mergedValues, state, scope)
          if (Object.keys(errors).length > 0) {
            setFieldErrors(errors)
            return
          }
          setFieldErrors({})
          const values = {
            ...actionValues,
            ...collectVisibleFieldValues(fields, mergedValues, state, scope),
          }
          if (actionId) {
            const closePatch = overlayClosePatchForAction(elements, actionId)
            if (closePatch) applyOverlayPatch(closePatch)
            void dispatchAction(actionId, values, confirmMeta(actionId))
          }
        }
        return (
          <form
            className={cn(
              'flex w-full max-w-[var(--gui-measure,40rem)] flex-col gap-[var(--gui-gap,16px)]',
              alignItemsClass(props.align, 'stretch')
            )}
            onSubmit={handleSubmit}
            noValidate
          >
            {children}
          </form>
        )
      }
      case 'SearchField': {
        if (!fieldIsVisible(props, fieldSnapshot)) return null
        const name = asString(props.name, 'query')
        const label = asString(props.label)
        const fieldId = `field-${name}`
        const error = fieldErrors[name]
        const value = resolveFieldValue('SearchField', props, formValues, state, scope)
        const suggestions = parseOptionList(props.suggestions)
        const submitLabel = asString(props.submitLabel, 'Search')
        const actionId = asString(props.actionId)
        const required = asBoolean(props.required)
        const searchBusy = controlPending(actionId)
        const searchInput = (
          <div className='flex flex-col gap-3'>
            {label ? (
              <label
                htmlFor={fieldId}
                className='font-medium text-[length:var(--gui-label-size,12px)] text-[var(--gui-text-muted,#575a66)]'
              >
                {label}
                <RequiredMark show={required} />
              </label>
            ) : (
              <label htmlFor={fieldId} className='sr-only'>
                {asString(props.placeholder, 'Search')}
              </label>
            )}
            <div
              data-testid='search-field'
              className={cn(
                'flex h-12 items-center gap-2 rounded-full border bg-[var(--gui-surface,#ffffff)] pr-1.5 pl-5 shadow-[var(--gui-shadow-card,0px_2px_8px_rgba(44,45,51,0.1))]',
                error ? 'border-[var(--gui-danger,#f31a1a)]' : 'border-[var(--gui-border,#e2e3e5)]'
              )}
            >
              <input
                id={fieldId}
                name={name}
                required={required}
                placeholder={asString(props.placeholder) || undefined}
                value={asFieldString(value)}
                onChange={(event) => setNamedValue(name, event.target.value)}
                className='h-full min-w-0 flex-1 bg-transparent text-[length:var(--gui-body-size,16px)] text-[var(--gui-text,#2c2d33)] outline-none placeholder:text-[var(--gui-text-tertiary,#8a8d99)]'
              />
              <button
                type='submit'
                disabled={searchBusy}
                aria-busy={searchBusy || undefined}
                className={cn(
                  buttonClass({ variant: 'primary', shape: 'pill' }, 'primary'),
                  searchBusy && 'gap-2'
                )}
              >
                <ActionBusyMark show={searchBusy} />
                {submitLabel}
              </button>
            </div>
            {error ? (
              <p
                data-testid={`field-error-${name}`}
                className='text-[length:var(--gui-label-size,12px)] text-[var(--gui-danger,#f31a1a)]'
              >
                {error}
              </p>
            ) : null}
            {suggestions.length > 0 ? (
              <div className='flex flex-wrap justify-center gap-2'>
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type='button'
                    className={cn(
                      'inline-flex items-center rounded-full px-3 py-1.5 font-medium text-sm',
                      CHIP_TONE_CLASSES.muted
                    )}
                    onClick={() => setNamedValue(name, suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )
        if (withinForm) return searchInput
        const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
          event.preventDefault()
          const fields: ArenaGenerativeFormField[] = [{ type: 'SearchField', props }]
          const mergedValues = {
            ...formValues,
            ...valuesFromFormElement(event.currentTarget),
          }
          const errors = validateVisibleFields(fields, mergedValues, state, scope)
          if (Object.keys(errors).length > 0) {
            setFieldErrors(errors)
            return
          }
          setFieldErrors({})
          const values = {
            ...actionValues,
            ...collectVisibleFieldValues(fields, mergedValues, state, scope),
          }
          if (actionId) {
            void dispatchAction(actionId, values, confirmMeta(actionId))
          }
        }
        return (
          <form className='w-full' onSubmit={handleSearchSubmit} noValidate>
            {searchInput}
          </form>
        )
      }
      case 'TextInput':
      case 'TextArea':
      case 'Select':
      case 'RadioGroup':
      case 'MultiSelect':
      case 'NumberInput':
      case 'DateInput':
      case 'Checkbox':
      case 'Switch': {
        if (!isFormFieldType(element.type)) return null
        if (!fieldIsVisible(props, fieldSnapshot)) return null
        const name = asString(props.name)
        const label = asString(props.label)
        const fieldId = `field-${name}`
        const error = fieldErrors[name]
        const value = resolveFieldValue(element.type, props, formValues, state, scope)
        const required = asBoolean(props.required)
        const inputClass = cn(FIELD_INPUT_CLASS, fieldErrorClass(error))

        if (element.type === 'TextArea') {
          return (
            <FieldShell
              name={name}
              label={label}
              htmlFor={fieldId}
              error={error}
              required={required}
            >
              <textarea
                id={fieldId}
                name={name}
                required={required}
                placeholder={asString(props.placeholder) || undefined}
                rows={4}
                value={asFieldString(value)}
                onChange={(event) => setNamedValue(name, event.target.value)}
                className={cn(FIELD_TEXTAREA_CLASS, fieldErrorClass(error))}
              />
            </FieldShell>
          )
        }
        if (element.type === 'Select') {
          const options = parseOptionList(props.options)
          return (
            <FieldShell
              name={name}
              label={label}
              htmlFor={fieldId}
              error={error}
              required={required}
            >
              <select
                id={fieldId}
                name={name}
                required={required}
                value={asFieldString(value)}
                onChange={(event) => setNamedValue(name, event.target.value)}
                className={inputClass}
              >
                <option value=''>Select</option>
                {options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </FieldShell>
          )
        }
        if (element.type === 'RadioGroup') {
          const options = parseOptionList(props.options)
          const selected = asFieldString(value)
          return (
            <FieldShell name={name} label={label} error={error} required={required}>
              <div role='radiogroup' aria-label={label || name} className='flex flex-col gap-2'>
                {options.map((option) => {
                  const optionId = `${fieldId}-${option}`
                  return (
                    <label key={option} htmlFor={optionId} className='flex items-center gap-2'>
                      <input
                        id={optionId}
                        type='radio'
                        name={name}
                        value={option}
                        checked={selected === option}
                        onChange={() => setNamedValue(name, option)}
                      />
                      <span>{option}</span>
                    </label>
                  )
                })}
              </div>
            </FieldShell>
          )
        }
        if (element.type === 'MultiSelect') {
          const options = parseOptionList(props.options)
          const selected = new Set(asFieldStringList(value))
          return (
            <FieldShell name={name} label={label} error={error} required={required}>
              <div className='flex flex-col gap-2'>
                {options.map((option) => {
                  const optionId = `${fieldId}-${option}`
                  return (
                    <label key={option} htmlFor={optionId} className='flex items-center gap-2'>
                      <input
                        id={optionId}
                        type='checkbox'
                        name={name}
                        value={option}
                        checked={selected.has(option)}
                        onChange={() => {
                          const next = selected.has(option)
                            ? asFieldStringList(value).filter((item) => item !== option)
                            : [...asFieldStringList(value), option]
                          setNamedValue(name, next)
                        }}
                      />
                      <span>{option}</span>
                    </label>
                  )
                })}
              </div>
            </FieldShell>
          )
        }
        if (element.type === 'Checkbox' || element.type === 'Switch') {
          const checked = value === true || value === 'true' || value === 'on'
          if (element.type === 'Switch') {
            const switchLabelId = `${fieldId}-label`
            return (
              <FieldShell name={name} label='' error={error}>
                <div
                  className={cn(
                    'flex items-center gap-2 text-sm',
                    fieldBusy && 'cursor-not-allowed opacity-60'
                  )}
                >
                  <button
                    id={fieldId}
                    type='button'
                    role='switch'
                    aria-checked={checked}
                    aria-labelledby={label ? switchLabelId : undefined}
                    aria-label={label ? undefined : name}
                    name={name}
                    disabled={fieldBusy}
                    onClick={() => setNamedValue(name, !checked)}
                  >
                    <span
                      className={cn(
                        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-100',
                        checked ? 'bg-[var(--gui-brand,#1a73e8)]' : 'bg-[var(--gui-border,#e2e3e5)]'
                      )}
                    >
                      <span
                        className={cn(
                          'inline-block size-4 rounded-full bg-[var(--gui-surface,#ffffff)] transition-transform',
                          checked ? 'translate-x-4' : 'translate-x-0.5'
                        )}
                      />
                    </span>
                  </button>
                  {label ? (
                    <label id={switchLabelId} htmlFor={fieldId}>
                      {label}
                      <RequiredMark show={required} />
                    </label>
                  ) : null}
                </div>
              </FieldShell>
            )
          }
          return (
            <FieldShell name={name} label='' error={error}>
              <label htmlFor={fieldId} className='flex items-center gap-2'>
                <input
                  id={fieldId}
                  type='checkbox'
                  name={name}
                  required={required}
                  checked={checked}
                  onChange={(event) => setNamedValue(name, event.target.checked)}
                />
                <span>
                  {label}
                  <RequiredMark show={required} />
                </span>
              </label>
            </FieldShell>
          )
        }
        const inputType =
          element.type === 'NumberInput' ? 'number' : element.type === 'DateInput' ? 'date' : 'text'
        return (
          <FieldShell name={name} label={label} htmlFor={fieldId} error={error} required={required}>
            <input
              id={fieldId}
              name={name}
              type={inputType}
              required={required}
              placeholder={asString(props.placeholder) || undefined}
              min={asString(props.min) || undefined}
              max={asString(props.max) || undefined}
              step={asString(props.step) || undefined}
              value={asFieldString(value)}
              onChange={(event) => setNamedValue(name, event.target.value)}
              className={inputClass}
            />
          </FieldShell>
        )
      }
      case 'SubmitButton': {
        const label = asString(props.label, 'Submit')
        const className = buttonClass(props, 'primary')
        const actionId = asString(props.actionId)
        const submitBusy = controlPending(actionId || formActionId)
        /**
         * Outside a Form there is nothing to submit, so a bare `type="submit"` would
         * be inert. Run the button's own `actionId` instead — this also revives
         * already-published drafts whose primary button never did anything.
         */
        if (!withinForm && actionId) {
          return (
            <button
              type='button'
              disabled={submitBusy}
              aria-busy={submitBusy || undefined}
              className={cn(className, submitBusy && 'gap-2')}
              onClick={() => void dispatchAction(actionId, actionValues, confirmMeta(actionId))}
            >
              <ActionBusyMark show={submitBusy} />
              {label}
            </button>
          )
        }
        return (
          <button
            type='submit'
            disabled={submitBusy}
            aria-busy={submitBusy || undefined}
            className={cn(className, withinForm && 'w-full', submitBusy && 'gap-2')}
          >
            <ActionBusyMark show={submitBusy} />
            {label}
          </button>
        )
      }
      case 'Button': {
        const href = asString(props.href)
        const navigateTo = asString(props.navigateTo)
        const actionId = asString(props.actionId)
        const setValue = asString(props.setValue)
        const className = buttonClass(props, 'secondary')
        if (!fieldIsVisible(props, visibilityValues)) return null
        if (href) {
          return (
            <a href={href} className={className} style={styleFromProps(props)} rel='noreferrer'>
              {asString(props.label)}
            </a>
          )
        }
        const actionBusy = controlPending(actionId)
        const destructiveLooks = asString(props.variant) === 'destructive' && Boolean(actionId)
        const confirm = confirmAction(actionId, destructiveLooks)
        return (
          <button
            type='button'
            className={cn(className, actionBusy && 'gap-2')}
            style={styleFromProps(props)}
            disabled={actionBusy}
            aria-busy={actionBusy || undefined}
            onClick={() => {
              if (confirm) {
                void dispatchAction(actionId, actionValues, { destructive: true })
                return
              }
              if (asBoolean(props.clearItem)) {
                onClearItem?.()
              }
              if (asBoolean(props.selectItem) && scope) {
                onSelectItem?.(scope.item, scope.index)
              }
              if (setValue) {
                const parsed = parseChipSetValue(setValue)
                if (parsed.name) applyOverlayPatch({ [parsed.name]: parsed.value })
              }
              const navPath = navigateTo ? splitNavTarget(navigateTo).path : ''
              const samePageNav = Boolean(navigateTo) && (!navPath || navPath === currentPath)
              const overlayPatch = asBoolean(props.selectItem)
                ? null
                : actionId
                  ? closedOverlayOpenPatch(elements, visibilityValues, actionId)
                  : samePageNav || (!navigateTo && !setValue)
                    ? closedOverlayOpenPatch(elements, visibilityValues)
                    : null
              if (overlayPatch) {
                applyOverlayPatch(overlayPatch)
                return
              }
              if (navigateTo) requestNavigate(navigateTo)
              if (actionId) void dispatchAction(actionId, actionValues)
            }}
          >
            <ActionBusyMark show={actionBusy} />
            {asString(props.label)}
          </button>
        )
      }
      case 'NavLink':
        return (
          <button
            type='button'
            className='font-medium text-[length:var(--gui-body-size,16px)] text-[var(--gui-brand,#1a73e8)] underline-offset-2 hover:text-[var(--gui-brand-hover,#155cba)] hover:underline'
            onClick={() => requestNavigate(asString(props.to))}
          >
            {asString(props.label)}
          </button>
        )
      case 'Link':
        return (
          <a
            href={asString(props.href)}
            className='font-medium text-[var(--gui-brand,#1a73e8)] underline-offset-2 hover:text-[var(--gui-brand-hover,#155cba)] hover:underline'
            style={styleFromProps(props)}
            rel='noreferrer'
          >
            {asString(props.label)}
          </a>
        )
      case 'Image':
        return (
          <CatalogImage
            src={asString(props.src)}
            alt={asString(props.alt)}
            width={asString(props.width) || undefined}
            height={asString(props.height) || undefined}
          />
        )
      case 'Divider':
        return <hr className='border-[var(--gui-border,#e2e3e5)]' style={styleFromProps(props)} />
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

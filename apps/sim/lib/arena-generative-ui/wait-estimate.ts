import type { Spec } from '@json-render/core'
import type { ArenaGenerativeAdoptedChange } from '@/lib/arena-generative-ui/generate-warnings'
import type { ArenaGenerativeAppManifest } from '@/lib/arena-generative-ui/types'

interface SpecElement {
  type?: string
  props?: Record<string, unknown>
  children?: string[]
}

type TimeUnit = 'minutes' | 'hours' | 'seconds'

interface ParsedWaitDuration {
  low: number
  high: number
  unit: TimeUnit
  upTo: boolean
  takeCue: boolean
}

const NUMBER_UNIT =
  /(\d+(?:\s*(?:[-–—]|to)\s*\d+)?)\s*(minutes?|mins?|hours?|hrs?|seconds?|secs?|s)\b/gi
const EVERY_EACH_PER = /(?:^|[\s,;:.(])(?:every|each|per)\s+$/i
const TAKE_CUE = /\b(?:take[s]?|taking|lasts?|lasting)\b/i
const WAIT_CUE =
  /\b(?:take[s]?|taking|lasts?|lasting|wait|usually|typically|about|around|roughly|approx|duration|long[- ]?run|might|may|should|expect|up to|job|generat|analy|research|process)\w*\b/i
const AN_HOUR = /\b(?:an|one)\s+hour\b/i
const HALF_HOUR = /\bhalf\s+(?:an\s+)?hour\b/i
const UP_TO_BEFORE = /\bup\s+to\s+$/i

function specElements(spec: Spec): Record<string, SpecElement> {
  if (!spec.elements || typeof spec.elements !== 'object' || Array.isArray(spec.elements)) {
    return {}
  }
  return spec.elements as Record<string, SpecElement>
}

function normalizeUnit(raw: string): TimeUnit | undefined {
  const unit = raw.toLowerCase()
  if (unit === 's' || unit.startsWith('sec')) return 'seconds'
  if (unit.startsWith('min')) return 'minutes'
  if (unit.startsWith('hr') || unit.startsWith('hour')) return 'hours'
  return undefined
}

function parseRange(raw: string): { low: number; high: number } | undefined {
  const parts = raw.split(/\s*(?:[-–—]|to)\s*/i)
  const low = Number(parts[0])
  const high = Number(parts[1] ?? parts[0])
  if (!Number.isFinite(low) || !Number.isFinite(high) || low <= 0 || high <= 0) return undefined
  return { low: Math.min(low, high), high: Math.max(low, high) }
}

function unitNoun(count: number, unit: TimeUnit): string {
  if (unit === 'minutes') return count === 1 ? 'minute' : 'minutes'
  if (unit === 'hours') return count === 1 ? 'hour' : 'hours'
  return count === 1 ? 'second' : 'seconds'
}

function formatWaitEstimate(duration: ParsedWaitDuration): string {
  const { low, high, unit, upTo } = duration
  if (low === high) {
    if (upTo) return `Usually takes up to ${low} ${unitNoun(low, unit)}`
    return `Usually takes about ${low} ${unitNoun(low, unit)}`
  }
  return `Usually takes ${low}–${high} ${unitNoun(high, unit)}`
}

function durationFromMatch(
  text: string,
  start: number,
  end: number,
  rangeRaw: string,
  unitRaw: string
): ParsedWaitDuration | undefined {
  const unit = normalizeUnit(unitRaw)
  const range = parseRange(rangeRaw)
  if (!unit || !range) return undefined
  const before = text.slice(Math.max(0, start - 48), start)
  if (EVERY_EACH_PER.test(before)) return undefined
  const window = `${before}${text.slice(start, Math.min(text.length, end + 24))}`
  if (!WAIT_CUE.test(window)) return undefined
  if (unit === 'seconds' && !TAKE_CUE.test(window) && range.high < 60) return undefined
  return {
    ...range,
    unit,
    upTo: UP_TO_BEFORE.test(before),
    takeCue: TAKE_CUE.test(window),
  }
}

function pushWordHour(text: string, candidates: ParsedWaitDuration[]) {
  const half = HALF_HOUR.exec(text)
  const hour = !half ? AN_HOUR.exec(text) : null
  const match = half ?? hour
  if (!match || match.index === undefined) return
  const window = text.slice(Math.max(0, match.index - 48), match.index + match[0].length + 24)
  if (!WAIT_CUE.test(window)) return
  candidates.push({
    low: half ? 30 : 1,
    high: half ? 30 : 1,
    unit: half ? 'minutes' : 'hours',
    upTo: false,
    takeCue: TAKE_CUE.test(window),
  })
}

function pickDuration(candidates: ParsedWaitDuration[]): ParsedWaitDuration | undefined {
  if (candidates.length === 0) return undefined
  const withTake = candidates.filter((candidate) => candidate.takeCue)
  const pool = withTake.length > 0 ? withTake : candidates
  const minutesOrHours = pool.filter((candidate) => candidate.unit !== 'seconds')
  const chosen = minutesOrHours.length > 0 ? minutesOrHours : pool
  return chosen[chosen.length - 1]
}

/**
 * Reads a visitor-facing wait duration from User Input / the stored brief.
 * Gold few-shots teach "Usually takes 90–150s"; this is the brief override.
 */
export function waitEstimateFromBrief(...texts: Array<string | undefined>): string | undefined {
  for (const text of texts) {
    const trimmed = text?.trim() ?? ''
    if (!trimmed) continue
    const estimate = waitEstimateFromOneBrief(trimmed)
    if (estimate) return estimate
  }
  return undefined
}

function waitEstimateFromOneBrief(text: string): string | undefined {
  const candidates: ParsedWaitDuration[] = []
  for (const match of text.matchAll(NUMBER_UNIT)) {
    if (match.index === undefined || match[1] === undefined || match[2] === undefined) continue
    const parsed = durationFromMatch(
      text,
      match.index,
      match.index + match[0].length,
      match[1],
      match[2]
    )
    if (parsed) candidates.push(parsed)
  }
  pushWordHour(text, candidates)
  const picked = pickDuration(candidates)
  return picked ? formatWaitEstimate(picked) : undefined
}

function applyWaitEstimateToSpec(spec: Spec, estimate: string): { spec: Spec; changed: boolean } {
  const elements = specElements(spec)
  let changed = false
  const next: Record<string, SpecElement> = { ...elements }
  for (const [id, element] of Object.entries(elements)) {
    if (element.type !== 'WorkingCard') continue
    const current = typeof element.props?.estimate === 'string' ? element.props.estimate.trim() : ''
    if (current === estimate) continue
    next[id] = {
      ...element,
      props: { ...element.props, estimate },
    }
    changed = true
  }
  return changed ? { spec: { ...spec, elements: next }, changed } : { spec, changed: false }
}

/**
 * Stamps WorkingCard.estimate from the brief so gold 90–150s copy cannot win.
 */
export function applyWaitEstimateFromBrief(
  manifest: ArenaGenerativeAppManifest,
  ...briefs: Array<string | undefined>
): { manifest: ArenaGenerativeAppManifest; adoptedChanges: ArenaGenerativeAdoptedChange[] } {
  const estimate = waitEstimateFromBrief(...briefs)
  if (!estimate) return { manifest, adoptedChanges: [] }

  let pages = manifest.pages
  let pagesChanged = false
  for (const [path, page] of Object.entries(manifest.pages)) {
    const applied = applyWaitEstimateToSpec(page.spec, estimate)
    if (!applied.changed) continue
    if (!pagesChanged) pages = { ...pages }
    pagesChanged = true
    pages[path] = { ...page, spec: applied.spec }
  }
  if (!pagesChanged) return { manifest, adoptedChanges: [] }

  return {
    manifest: { ...manifest, pages },
    adoptedChanges: [
      {
        code: 'wait-estimate',
        asked: 'Honour the job duration named in the brief.',
        adopted: `WorkingCard estimate is "${estimate}".`,
      },
    ],
  }
}

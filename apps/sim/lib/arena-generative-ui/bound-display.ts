import { formatBoundDateDisplay, isBoundIsoDate } from '@/lib/arena-generative-ui/bound-date-format'
import {
  formatBoundNumberDisplay,
  isBoundNumberFormat,
  parseBoundNumber,
} from '@/lib/arena-generative-ui/bound-number-format'

export interface BoundDisplayOptions {
  /** Preset or token from Card.dateFormat when the binding has no pipe. */
  dateFormat?: string
  /** Preset or token from Stat/Card.numberFormat when the binding has no pipe. */
  numberFormat?: string
  /** Clock for relative/ago dates. Defaults to Date.now(). */
  nowMs?: number
}

/**
 * Pretty-prints a bound scalar for display copy.
 * A pipe format wins. Otherwise ISO dates use `dateFormat` (default medium) and
 * numbers use `numberFormat` only when the brief named one.
 */
export function formatBoundDisplay(
  value: string,
  pipeFormat?: string,
  options: BoundDisplayOptions = {}
): string {
  if (pipeFormat) {
    if (isBoundNumberFormat(pipeFormat)) return formatBoundNumberDisplay(value, pipeFormat)
    return formatBoundDateDisplay(value, pipeFormat, options.nowMs)
  }
  if (options.numberFormat && parseBoundNumber(value) !== undefined && !isBoundIsoDate(value)) {
    return formatBoundNumberDisplay(value, options.numberFormat)
  }
  return formatBoundDateDisplay(value, options.dateFormat, options.nowMs)
}

/** Display formatting when the binding has no pipe — dates auto, numbers only if named. */
export function formatBoundScalarDisplay(value: string, options: BoundDisplayOptions = {}): string {
  if (options.dateFormat && isBoundNumberFormat(options.dateFormat)) {
    return formatBoundDisplay(value, options.dateFormat, options)
  }
  return formatBoundDisplay(value, undefined, options)
}

const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const ISO_DATETIME =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

const LONG_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

const PRESETS: Record<string, string> = {
  short: 'MMM D',
  medium: 'MMM D, YYYY',
  long: 'MMMM D, YYYY',
  iso: 'YYYY-MM-DD',
  numeric: 'MM/DD/YYYY',
  'numeric-eu': 'DD/MM/YYYY',
  eu: 'DD/MM/YYYY',
  datetime: 'MMM D, YYYY, h:mm A',
}

/** Default readable card/table date when the brief does not name a format. */
export const DEFAULT_BOUND_DATE_FORMAT = 'medium'

type DateTokenKind =
  | 'YYYY'
  | 'YY'
  | 'MMMM'
  | 'MMM'
  | 'MM'
  | 'M'
  | 'DD'
  | 'D'
  | 'HH'
  | 'H'
  | 'hh'
  | 'h'
  | 'mm'
  | 'ss'
  | 'A'
  | 'a'

interface BoundDateParts {
  year: number
  month: number
  day: number
  hour24?: number
  minute?: number
  second?: number
}

/**
 * Splits `{item.date|DD/MM/YYYY}` or `{item.price|currency}` into the binding
 * name and optional format.
 */
export function splitBindingDateFormat(rawToken: string): { name: string; format?: string } {
  const trimmed = rawToken.trim()
  const pipe = trimmed.indexOf('|')
  if (pipe <= 0) return { name: trimmed }
  const format = trimmed.slice(pipe + 1).trim()
  return {
    name: trimmed.slice(0, pipe).trim(),
    format: format || undefined,
  }
}

/**
 * Turns a bound ISO date or datetime into readable copy.
 * Date-only values stay calendar-stable (no timezone shift). Other strings pass through.
 * `format` is a preset (`medium`, `numeric-eu`) or a token pattern (`DD/MM/YYYY`).
 * Do not use this on navigation targets or query params.
 */
export function formatBoundDateDisplay(value: string, format?: string): string {
  const parts = parseBoundDateParts(value)
  if (!parts) return value
  return applyDatePattern(parts, resolveDatePattern(format))
}

/** True when `value` is an ISO date or datetime the host can pretty-print. */
export function isBoundIsoDate(value: string): boolean {
  return parseBoundDateParts(value) !== undefined
}

function parseBoundDateParts(value: string): BoundDateParts | undefined {
  const trimmed = value.trim()
  const dateOnly = ISO_DATE_ONLY.exec(trimmed)
  if (dateOnly) {
    const month = Number(dateOnly[2])
    const day = Number(dateOnly[3])
    if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
    return { year: Number(dateOnly[1]), month, day }
  }
  if (!ISO_DATETIME.test(trimmed)) return undefined
  const prefix = ISO_DATE_ONLY.exec(trimmed.slice(0, 10))
  if (!prefix) return undefined
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return undefined
  return {
    year: Number(prefix[1]),
    month: Number(prefix[2]),
    day: Number(prefix[3]),
    hour24: parsed.getHours(),
    minute: parsed.getMinutes(),
    second: parsed.getSeconds(),
  }
}

function resolveDatePattern(format?: string): string {
  const trimmed = format?.trim()
  if (!trimmed) return PRESETS[DEFAULT_BOUND_DATE_FORMAT]
  return PRESETS[trimmed.toLowerCase()] ?? trimmed
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function hour12(hour24: number): number {
  const hour = hour24 % 12
  return hour === 0 ? 12 : hour
}

function isMinuteMm(pattern: string, index: number): boolean {
  return index > 0 && pattern[index - 1] === ':'
}

function applyDatePattern(parts: BoundDateParts, pattern: string): string {
  let result = ''
  let index = 0
  while (index < pattern.length) {
    const token = matchDateToken(pattern, index)
    if (!token) {
      result += pattern[index]
      index += 1
      continue
    }
    result += renderDateToken(token.kind, parts)
    index += token.length
  }
  return result
}

function matchDateToken(
  pattern: string,
  index: number
): { kind: DateTokenKind; length: number } | undefined {
  const rest = pattern.slice(index)
  const upper = rest.toUpperCase()
  if (upper.startsWith('YYYY')) return { kind: 'YYYY', length: 4 }
  if (upper.startsWith('MMMM')) return { kind: 'MMMM', length: 4 }
  if (upper.startsWith('MMM')) return { kind: 'MMM', length: 3 }
  if (upper.startsWith('MM')) {
    return isMinuteMm(pattern, index) ? { kind: 'mm', length: 2 } : { kind: 'MM', length: 2 }
  }
  if (upper.startsWith('DD')) return { kind: 'DD', length: 2 }
  if (upper.startsWith('HH')) {
    return { kind: rest[0] === 'h' ? 'hh' : 'HH', length: 2 }
  }
  if (upper.startsWith('SS')) return { kind: 'ss', length: 2 }
  if (upper.startsWith('YY')) return { kind: 'YY', length: 2 }
  if (rest.startsWith('A')) return { kind: 'A', length: 1 }
  if (rest.startsWith('a')) return { kind: 'a', length: 1 }
  if (upper.startsWith('M')) return { kind: 'M', length: 1 }
  if (upper.startsWith('D')) return { kind: 'D', length: 1 }
  if (rest.startsWith('h')) return { kind: 'h', length: 1 }
  if (rest.startsWith('H')) return { kind: 'H', length: 1 }
  return undefined
}

function renderDateToken(kind: DateTokenKind, parts: BoundDateParts): string {
  const hour = parts.hour24 ?? 0
  const minute = parts.minute ?? 0
  const second = parts.second ?? 0
  switch (kind) {
    case 'YYYY':
      return String(parts.year)
    case 'YY':
      return String(parts.year).slice(-2)
    case 'MMMM':
      return LONG_MONTHS[parts.month - 1]
    case 'MMM':
      return SHORT_MONTHS[parts.month - 1]
    case 'MM':
      return pad2(parts.month)
    case 'M':
      return String(parts.month)
    case 'DD':
      return pad2(parts.day)
    case 'D':
      return String(parts.day)
    case 'HH':
      return pad2(hour)
    case 'H':
      return String(hour)
    case 'hh':
      return pad2(hour12(hour))
    case 'h':
      return String(hour12(hour))
    case 'mm':
      return pad2(minute)
    case 'ss':
      return pad2(second)
    case 'A':
      return hour >= 12 ? 'PM' : 'AM'
    case 'a':
      return hour >= 12 ? 'pm' : 'am'
  }
}

const CURRENCY_PREFIX: Record<string, string> = {
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  '₹': 'INR',
}

interface NumberFormatSpec {
  style: 'decimal' | 'currency' | 'percent' | 'percent-units' | 'compact'
  currency?: string
  grouping?: boolean
  minFrac?: number
  maxFrac?: number
  accounting?: boolean
}

const PRESETS: Record<string, NumberFormatSpec> = {
  integer: { style: 'decimal', grouping: true, minFrac: 0, maxFrac: 0 },
  int: { style: 'decimal', grouping: true, minFrac: 0, maxFrac: 0 },
  decimal: { style: 'decimal', grouping: true, minFrac: 0, maxFrac: 2 },
  number: { style: 'decimal', grouping: true, minFrac: 0, maxFrac: 2 },
  compact: { style: 'compact', grouping: true, minFrac: 0, maxFrac: 1 },
  currency: { style: 'currency', currency: 'USD' },
  usd: { style: 'currency', currency: 'USD' },
  eur: { style: 'currency', currency: 'EUR' },
  gbp: { style: 'currency', currency: 'GBP' },
  inr: { style: 'currency', currency: 'INR' },
  jpy: { style: 'currency', currency: 'JPY' },
  percent: { style: 'percent-units', grouping: true, minFrac: 0, maxFrac: 2 },
  pct: { style: 'percent-units', grouping: true, minFrac: 0, maxFrac: 2 },
  'percent-ratio': { style: 'percent', grouping: true, minFrac: 0, maxFrac: 1 },
  accounting: { style: 'currency', currency: 'USD', accounting: true },
}

const TOKEN_BODY = /^[#0][#0,]*(?:\.[#0]+)?$/

/**
 * True when a binding pipe or Stat/Card `numberFormat` is a number preset or token.
 * Date preset `numeric` is not a number format.
 */
export function isBoundNumberFormat(format: string): boolean {
  return Boolean(parseNumberPattern(format))
}

export function parseBoundNumber(value: string | number): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const stripped = trimmed.replace(/,/g, '')
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(stripped)) return undefined
  const parsed = Number(stripped)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Formats a bound number when `format` is a preset (`currency`, `percent`, `compact`)
 * or a token pattern (`$0,0.00`, `0.0%`). Non-numeric strings pass through.
 */
export function formatBoundNumberDisplay(value: string | number, format?: string): string {
  const spec = parseNumberPattern(format)
  if (!spec) return String(value)
  const amount = parseBoundNumber(value)
  if (amount === undefined) return String(value)
  return applyNumberSpec(amount, spec)
}

function parseNumberPattern(format?: string): NumberFormatSpec | undefined {
  const trimmed = format?.trim()
  if (!trimmed) return undefined
  const preset = PRESETS[trimmed.toLowerCase()]
  if (preset) return preset

  const prefix = trimmed[0] ?? ''
  const currency = CURRENCY_PREFIX[prefix]
  const rest = currency ? trimmed.slice(1) : trimmed
  const percent = rest.endsWith('%')
  const body = percent ? rest.slice(0, -1) : rest
  if (!TOKEN_BODY.test(body)) return undefined

  const dot = body.indexOf('.')
  const frac = dot >= 0 ? body.slice(dot + 1).length : 0
  const grouping = body.includes(',')
  if (percent) {
    return { style: 'percent-units', grouping, minFrac: frac, maxFrac: frac }
  }
  if (currency) {
    return {
      style: 'currency',
      currency,
      grouping,
      minFrac: currency === 'JPY' ? 0 : frac,
      maxFrac: currency === 'JPY' ? 0 : frac || 2,
    }
  }
  return { style: 'decimal', grouping, minFrac: frac, maxFrac: frac }
}

function applyNumberSpec(amount: number, spec: NumberFormatSpec): string {
  if (spec.style === 'percent-units') {
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'decimal',
      useGrouping: spec.grouping !== false,
      minimumFractionDigits: spec.minFrac ?? 0,
      maximumFractionDigits: spec.maxFrac ?? 2,
    }).format(amount)
    return `${formatted}%`
  }
  if (spec.style === 'compact') {
    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: spec.maxFrac ?? 1,
    }).format(amount)
  }
  if (spec.style === 'percent') {
    return new Intl.NumberFormat('en-US', {
      style: 'percent',
      useGrouping: spec.grouping !== false,
      minimumFractionDigits: spec.minFrac ?? 0,
      maximumFractionDigits: spec.maxFrac ?? 1,
    }).format(amount)
  }
  if (spec.style === 'currency') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: spec.currency ?? 'USD',
      currencySign: spec.accounting ? 'accounting' : 'standard',
      minimumFractionDigits: spec.minFrac,
      maximumFractionDigits: spec.maxFrac,
    }).format(amount)
  }
  return new Intl.NumberFormat('en-US', {
    style: 'decimal',
    useGrouping: spec.grouping !== false,
    minimumFractionDigits: spec.minFrac ?? 0,
    maximumFractionDigits: spec.maxFrac ?? 2,
  }).format(amount)
}

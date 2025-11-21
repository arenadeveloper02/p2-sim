import { createLogger } from '@/lib/logs/console/logger'

const logger = createLogger('FacebookDateExtraction')

export interface FacebookTimeRange {
  since: string
  until: string
}

export interface FacebookDateSelection {
  date_preset?: string
  time_range?: FacebookTimeRange
}

function formatDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildLastNDaysRange(days: number): FacebookTimeRange {
  const today = new Date()
  const until = new Date(today)
  const since = new Date(today)
  // inclusive range: N days ending today
  since.setDate(today.getDate() - (days - 1))
  return {
    since: formatDate(since),
    until: formatDate(until),
  }
}

export function extractFacebookDateSelection(input: string): FacebookDateSelection | null {
  const lower = input.toLowerCase()

  // Explicit presets first
  if (/(^|\b)today(\b|$)/.test(lower)) {
    logger.info('Detected date preset: today')
    return { date_preset: 'today' }
  }

  if (/(^|\b)yesterday(\b|$)/.test(lower)) {
    logger.info('Detected date preset: yesterday')
    return { date_preset: 'yesterday' }
  }

  if (/\bthis month\b|\bcurrent month\b/.test(lower)) {
    logger.info('Detected date preset: this_month')
    return { date_preset: 'this_month' }
  }

  if (/\blast month\b/.test(lower)) {
    logger.info('Detected date preset: last_month')
    return { date_preset: 'last_month' }
  }

  // "last N days" patterns
  const lastNDaysMatch = lower.match(/last\s+(\d+)\s+days?/)
  if (lastNDaysMatch) {
    const days = Number.parseInt(lastNDaysMatch[1], 10)
    if (Number.isFinite(days) && days > 0 && days <= 365) {
      // Map to Facebook presets when possible
      const presetMap: Record<number, string> = {
        3: 'last_3d',
        7: 'last_7d',
        14: 'last_14d',
        28: 'last_28d',
        30: 'last_30d',
        90: 'last_90d',
      }
      const preset = presetMap[days]
      if (preset) {
        logger.info('Detected date preset from "last N days"', { days, preset })
        return { date_preset: preset }
      }

      // For non-standard values (e.g. 12, 15), build a custom time_range
      const range = buildLastNDaysRange(days)
      logger.info('Detected custom time_range from "last N days"', { days, range })
      return { time_range: range }
    }
  }

  // ISO single date: YYYY-MM-DD
  const isoDateMatch = lower.match(/(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])/)
  if (isoDateMatch) {
    const [full] = isoDateMatch
    logger.info('Detected explicit ISO date', { date: full })
    return {
      time_range: {
        since: full,
        until: full,
      },
    }
  }

  // If nothing matched, return null and let DEFAULT_DATE_PRESET apply (last_30d)
  return null
}

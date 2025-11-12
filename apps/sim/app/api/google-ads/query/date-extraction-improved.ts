/**
 * IMPROVED Date Extraction Function
 * 
 * This is a reference implementation showing how to improve extractDateRanges
 * with better natural language support, validation, and maintainability.
 * 
 * Key improvements:
 * 1. Handles 20+ natural language patterns
 * 2. Date validation to prevent invalid dates
 * 3. Shared utilities (no code duplication)
 * 4. Word boundaries for precise matching
 * 5. Better error handling
 */

import type { Logger } from './route'
import {
  type DateRange,
  MONTH_MAP,
  isValidDateRange,
  formatDate,
  getToday,
  getYesterday,
  getCurrentWeekStart,
  getLastWeekRange,
  getThisMonthRange,
  getLastMonthRange,
  getLastNDaysRange,
  getLastNMonthsRange,
  getYearToDateRange,
  getMonthToDateRange,
  getMonthRange,
  getQuarterRange,
  getYearRange,
} from './date-utils'

/**
 * Improved date extraction with comprehensive natural language support
 */
export function extractDateRangesImproved(
  input: string,
  logger: Logger
): Array<DateRange> {
  const dateRanges: Array<DateRange> = []
  const lower = input.toLowerCase().trim()

  // ============================================
  // PRIORITY 1: Single-day queries (early return)
  // ============================================
  if (/\b(today)\b/.test(lower)) {
    const today = getToday()
    const range: DateRange = {
      start: formatDate(today),
      end: formatDate(today),
    }
    if (isValidDateRange(range)) {
      logger.info('Extracted "today" date range', range)
      return [range]
    }
  }

  if (/\b(yesterday)\b/.test(lower)) {
    const yesterday = getYesterday()
    const range: DateRange = {
      start: formatDate(yesterday),
      end: formatDate(yesterday),
    }
    if (isValidDateRange(range)) {
      logger.info('Extracted "yesterday" date range', range)
      return [range]
    }
  }

  // ============================================
  // PRIORITY 2: Week-based queries
  // ============================================
  if (/\b(this week|current week)\b/.test(lower)) {
    const start = getCurrentWeekStart()
    const end = getToday()
    const range: DateRange = {
      start: formatDate(start),
      end: formatDate(end),
    }
    if (isValidDateRange(range)) {
      logger.info('Extracted "this week" date range', range)
      return [range]
    }
  }

  if (/\b(last week|past week)\b/.test(lower)) {
    const range = getLastWeekRange()
    if (isValidDateRange(range)) {
      logger.info('Extracted "last week" date range', range)
      return [range]
    }
  }

  // ============================================
  // PRIORITY 3: Month-based queries
  // ============================================
  if (/\b(this month|current month)\b/.test(lower)) {
    const range = getThisMonthRange()
    if (isValidDateRange(range)) {
      logger.info('Extracted "this month" date range', range)
      return [range]
    }
  }

  if (/\b(last month)\b/.test(lower)) {
    const range = getLastMonthRange()
    if (isValidDateRange(range)) {
      logger.info('Extracted "last month" date range', range)
      return [range]
    }
  }

  if (/\b(month to date|mtd)\b/.test(lower)) {
    const range = getMonthToDateRange()
    if (isValidDateRange(range)) {
      logger.info('Extracted "MTD" date range', range)
      return [range]
    }
  }

  // ============================================
  // PRIORITY 4: Year-based queries
  // ============================================
  if (/\b(year to date|ytd)\b/.test(lower)) {
    const range = getYearToDateRange()
    if (isValidDateRange(range)) {
      logger.info('Extracted "YTD" date range', range)
      return [range]
    }
  }

  // Year-only: "2025" or "for 2025"
  const yearOnlyMatch = lower.match(/\b(?:for|in|during)\s+(\d{4})\b|\b(19|20)\d{2}\b/)
  if (yearOnlyMatch && !dateRanges.length) {
    const year = Number.parseInt(yearOnlyMatch[1] || yearOnlyMatch[2] + yearOnlyMatch[0].slice(-2))
    if (year >= 2000 && year <= new Date().getFullYear()) {
      const range = getYearRange(year)
      if (isValidDateRange(range)) {
        logger.info('Extracted year-only date range', { year, range })
        return [range]
      }
    }
  }

  // ============================================
  // PRIORITY 5: Relative period queries
  // ============================================
  // "last 7 days", "last 30 days", "last 90 days", "last N days"
  const lastNDaysMatch = lower.match(/\blast\s+(\d+)\s+days?\b/)
  if (lastNDaysMatch) {
    const days = Number.parseInt(lastNDaysMatch[1])
    if (days > 0 && days <= 365) {
      const range = getLastNDaysRange(days)
      if (isValidDateRange(range)) {
        logger.info('Extracted "last N days" date range', { days, range })
        return [range]
      }
    }
  }

  // "last 3 months", "last 6 months", "last N months"
  const lastNMonthsMatch = lower.match(/\blast\s+(\d+)\s+months?\b/)
  if (lastNMonthsMatch) {
    const months = Number.parseInt(lastNMonthsMatch[1])
    if (months > 0 && months <= 24) {
      const range = getLastNMonthsRange(months)
      if (isValidDateRange(range)) {
        logger.info('Extracted "last N months" date range', { months, range })
        return [range]
      }
    }
  }

  // ============================================
  // PRIORITY 6: Month name queries
  // ============================================
  // "January 2025", "Jan 2025", "for January", "in January"
  const monthYearMatch = lower.match(
    /\b(?:for|in|during)\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{4}))?\b/
  )
  if (monthYearMatch) {
    const monthStr = monthYearMatch[1]
    const year = monthYearMatch[2] ? Number.parseInt(monthYearMatch[2]) : new Date().getFullYear()
    const month = Number.parseInt(MONTH_MAP[monthStr] || '1')
    if (month >= 1 && month <= 12 && year >= 2000 && year <= new Date().getFullYear()) {
      const range = getMonthRange(month, year)
      if (isValidDateRange(range)) {
        logger.info('Extracted month name date range', { month: monthStr, year, range })
        return [range]
      }
    }
  }

  // ============================================
  // PRIORITY 7: Quarter queries
  // ============================================
  // "Q1 2025", "Q2 2025", "first quarter 2025"
  const quarterMatch = lower.match(/\b(?:q|quarter)\s*(\d)\s+(?:of\s+)?(\d{4})|\b(first|second|third|fourth)\s+quarter(?:\s+of)?\s+(\d{4})\b/)
  if (quarterMatch) {
    let quarter: number
    let year: number

    if (quarterMatch[1]) {
      quarter = Number.parseInt(quarterMatch[1])
      year = Number.parseInt(quarterMatch[2])
    } else {
      const quarterNames: Record<string, number> = {
        first: 1,
        second: 2,
        third: 3,
        fourth: 4,
      }
      quarter = quarterNames[quarterMatch[3].toLowerCase()]
      year = Number.parseInt(quarterMatch[4])
    }

    if (quarter >= 1 && quarter <= 4 && year >= 2000 && year <= new Date().getFullYear()) {
      const range = getQuarterRange(quarter, year)
      if (isValidDateRange(range)) {
        logger.info('Extracted quarter date range', { quarter, year, range })
        return [range]
      }
    }
  }

  // ============================================
  // PRIORITY 8: Comparison queries with "and then"
  // ============================================
  // "Sept 8-14 and then 15-21" or "10/8/2025 to 10/14/2025 and then 10/15/2025 to 10/21/2025"
  const comparisonPatterns = [
    // Numeric format with "and then"
    /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+to\s+|-|–)(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+and\s+then\s+)(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+to\s+|-|–)(\d{1,2})\/(\d{1,2})\/(\d{4})/i,
    // Month name format with "and then"
    /(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:\s+to\s+|-|–)(\d{1,2})(?:,?\s+)?(\d{4})(?:\s+and\s+then\s+|\s+and\s+)(\d{1,2})(?:\s+to\s+|-|–)(\d{1,2})(?:,?\s+)?(\d{4})/i,
  ]

  for (const pattern of comparisonPatterns) {
    const match = input.match(pattern)
    if (match) {
      // Parse first range
      const range1 = parseDateRangeFromMatch(match, 0, input)
      // Parse second range
      const range2 = parseDateRangeFromMatch(match, 1, input)
      if (range1 && range2 && isValidDateRange(range1) && isValidDateRange(range2)) {
        logger.info('Extracted comparison date ranges', { range1, range2 })
        return [range1, range2]
      }
    }
  }

  // ============================================
  // PRIORITY 9: Explicit date ranges
  // ============================================
  const explicitRangePatterns = [
    // Month name: "Sept 8 to 14 2025" or "September 8-14, 2025"
    /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:\s+to\s+|-|–)(\d{1,2})(?:,?\s+)?(\d{4})\b/gi,
    // Numeric: "9/8/2025 to 9/14/2025" or "9/8 to 9/14 2025"
    /\b(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+to\s+|-|–)(\d{1,2})\/(\d{1,2})\/(\d{4})\b/gi,
    // ISO: "2025-09-08 to 2025-09-14"
    /\b(\d{4})-(\d{2})-(\d{2})(?:\s+to\s+|-|–)(\d{4})-(\d{2})-(\d{2})\b/gi,
  ]

  for (const pattern of explicitRangePatterns) {
    const matches = [...input.matchAll(pattern)]
    for (const match of matches) {
      const range = parseDateRangeFromMatch(match, 0, input)
      if (range && isValidDateRange(range)) {
        dateRanges.push(range)
      }
    }
    if (dateRanges.length > 0) {
      logger.info('Extracted explicit date ranges', { count: dateRanges.length, ranges: dateRanges })
      return dateRanges
    }
  }

  // ============================================
  // FALLBACK: Return empty array (let AI handle it)
  // ============================================
  logger.info('No date ranges extracted from input', { input })
  return []
}

/**
 * Helper to parse date range from regex match
 */
function parseDateRangeFromMatch(
  match: RegExpMatchArray,
  rangeIndex: number,
  originalInput: string
): DateRange | null {
  try {
    let startDate: string
    let endDate: string

    if (match[0].includes('/')) {
      // Numeric format: M/D/YYYY
      const baseIndex = rangeIndex * 6
      const month1 = match[baseIndex + 1]?.padStart(2, '0')
      const day1 = match[baseIndex + 2]?.padStart(2, '0')
      const year1 = match[baseIndex + 3]
      const month2 = match[baseIndex + 4]?.padStart(2, '0')
      const day2 = match[baseIndex + 5]?.padStart(2, '0')
      const year2 = match[baseIndex + 6]

      if (!month1 || !day1 || !year1 || !month2 || !day2 || !year2) {
        return null
      }

      startDate = `${year1}-${month1}-${day1}`
      endDate = `${year2}-${month2}-${day2}`
    } else if (match[0].match(/^\d{4}-\d{2}-\d{2}/)) {
      // ISO format
      const baseIndex = rangeIndex * 6
      startDate = `${match[baseIndex + 1]}-${match[baseIndex + 2]}-${match[baseIndex + 3]}`
      endDate = `${match[baseIndex + 4]}-${match[baseIndex + 5]}-${match[baseIndex + 6]}`
    } else {
      // Month name format
      const monthStr = match[0].match(/^[A-Za-z]+/)?.[0] || ''
      const month = MONTH_MAP[monthStr.toLowerCase()]
      if (!month) return null

      const day1 = match[1]?.padStart(2, '0')
      const day2 = match[2]?.padStart(2, '0')
      const year = match[3] || new Date().getFullYear().toString()

      if (!day1 || !day2 || !year) return null

      startDate = `${year}-${month}-${day1}`
      endDate = `${year}-${month}-${day2}`
    }

    return { start: startDate, end: endDate }
  } catch (error) {
    return null
  }
}


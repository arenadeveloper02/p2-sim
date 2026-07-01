import { createLogger } from '@sim/logger'

const logger = createLogger('GeneratedAppBuildErrors')

const TS_ERROR_PATTERN = /error TS\d+:/i
const BUILD_ERROR_PATTERN =
  /Type error:|Module not found|Failed to compile|Cannot find module|Syntax error/i

/**
 * Pulls TypeScript and Next.js compile error lines from raw build/typecheck output.
 */
export function extractBuildErrorLines(output: string): string[] {
  const lines = output.split('\n')
  const errors = lines
    .filter((line) => TS_ERROR_PATTERN.test(line) || BUILD_ERROR_PATTERN.test(line))
    .map((line) => line.trim())

  if (errors.length > 0) {
    return errors
  }

  const tscMarkerIndex = output.lastIndexOf('=== tsc')
  if (tscMarkerIndex >= 0) {
    const tail = output
      .slice(tscMarkerIndex)
      .split('\n')
      .filter((line) => line.trim() && !line.startsWith('==='))
      .map((line) => line.trim())

    if (tail.length > 0 && tail.length <= 80) {
      return tail
    }
  }

  return []
}

/**
 * Formats validation output into a concise, user-facing error summary.
 */
export function formatBuildErrorsSummary(output: string, issues?: string[]): string {
  if (issues && issues.length > 0) {
    return issues.join('\n')
  }

  const errors = extractBuildErrorLines(output)
  if (errors.length > 0) {
    return errors.join('\n')
  }

  return output.trim()
}

export type GeneratedAppValidationPhase = 'structure' | 'typecheck' | 'vercel'

/**
 * Logs generated-app validation failures line-by-line so errors appear in the dev terminal.
 */
export function logGeneratedAppValidationErrors(options: {
  phase: GeneratedAppValidationPhase
  round: number
  output: string
  issues?: string[]
}): void {
  const { phase, round, output, issues } = options

  logger.error(`Generated app ${phase} validation failed (attempt ${round + 1})`)

  if (issues && issues.length > 0) {
    for (const issue of issues) {
      logger.error(issue)
    }
    return
  }

  const errors = extractBuildErrorLines(output)
  if (errors.length > 0) {
    logger.error('Build/typecheck errors:')
    for (const err of errors) {
      logger.error(err)
    }
    return
  }

  if (output.trim()) {
    logger.error(output.trim())
  }
}

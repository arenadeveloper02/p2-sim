import { execSync } from 'node:child_process'
import { VERIFY_COMMANDS, VERIFY_STEP_COMMANDS } from './config'

export type VerifyStepName = keyof typeof VERIFY_STEP_COMMANDS

export const ADVISORY_VERIFY_STEPS = [
  'check',
  'lint',
  'test',
] as const satisfies readonly VerifyStepName[]
export const BLOCKING_VERIFY_STEPS = ['build'] as const satisfies readonly VerifyStepName[]

export interface VerifyResult {
  command: string
  success: boolean
  output: string
  blocking: boolean
}

export interface RunVerificationOptions {
  /** Subset of steps to run. Default: check, lint, test, build. */
  steps?: readonly VerifyStepName[]
}

function isBlockingStep(step: VerifyStepName): boolean {
  return (BLOCKING_VERIFY_STEPS as readonly VerifyStepName[]).includes(step)
}

function stepFromCommand(command: string): VerifyStepName | undefined {
  return (Object.entries(VERIFY_STEP_COMMANDS) as Array<[VerifyStepName, string]>).find(
    ([, value]) => value === command
  )?.[0]
}

function runCommand(command: string, blocking: boolean): VerifyResult {
  try {
    const output = execSync(command, { encoding: 'utf8', stdio: 'pipe' })
    console.log(`[verify] ${command} — passed`)
    return { command, success: true, output, blocking }
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string }
    const output = [err.stdout, err.stderr, err.message].filter(Boolean).join('\n')
    if (blocking) {
      console.warn(`[verify] ${command} — failed (blocking; sync cannot complete)`)
    } else {
      console.warn(`[verify] ${command} — failed (advisory; does not fail the sync)`)
    }
    return { command, success: false, output, blocking }
  }
}

/** Run a single verify step so callers can pass build logs to a fix agent. */
export function runVerificationStep(step: VerifyStepName): VerifyResult {
  return runCommand(VERIFY_STEP_COMMANDS[step], isBlockingStep(step))
}

/**
 * Run verification commands. Lint/test/check stay advisory; build is blocking.
 * Failures never throw — callers decide whether to complete or spawn a fix agent.
 */
export function runVerification(options?: RunVerificationOptions): VerifyResult[] {
  const steps = options?.steps ?? (['check', 'lint', 'test', 'build'] as const)
  return steps.map((step) => runVerificationStep(step))
}

/**
 * Autofix Biome formatting after merge/agent edits.
 * Best-effort only — format failures do not fail the sync.
 */
export function autofixFormat(): VerifyResult {
  const command = 'TURBO_FORCE=1 bun run format'
  try {
    const output = execSync(command, {
      encoding: 'utf8',
      stdio: 'pipe',
      cwd: process.cwd(),
    })
    return { command, success: true, output, blocking: false }
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string }
    const output = [err.stdout, err.stderr, err.message].filter(Boolean).join('\n')
    return { command, success: false, output, blocking: false }
  }
}

export function formatVerifyResults(results: VerifyResult[]): string {
  if (results.length === 0) {
    return '_No verification commands ran._'
  }

  const blockingFailures = results.filter((r) => r.blocking && !r.success)
  const advisoryFailures = results.filter((r) => !r.blocking && !r.success)
  let summary: string
  if (blockingFailures.length > 0) {
    summary =
      '**Blocking verification failed** — build must pass before this sync can be marked completed.'
  } else if (advisoryFailures.length > 0) {
    summary =
      'Advisory verification failed (lint/test/check). These do not block the sync. Review and fix on the draft PR as needed.'
  } else if (results.every((r) => r.success)) {
    summary = 'All verification commands passed.'
  } else {
    summary = 'Verification finished with mixed results.'
  }

  const body = results
    .map((r) => {
      const snippet = r.success ? r.output.slice(0, 2000) : r.output.slice(-8000)
      const label = r.success
        ? '✅ passed'
        : r.blocking
          ? '❌ failed (blocking)'
          : '❌ failed (advisory)'
      return `### ${r.command}\n\n${label}\n\n\`\`\`\n${snippet}\n\`\`\``
    })
    .join('\n\n')

  return `${summary}\n\n${body}`
}

export function allVerificationPassed(results: VerifyResult[]): boolean {
  return results.length === VERIFY_COMMANDS.length && results.every((r) => r.success)
}

/**
 * Blocking gate for marking a sync completed.
 * Requires build to pass. Optionally also require `bun run check`.
 */
export function allBlockingVerificationPassed(
  results: VerifyResult[],
  options?: { requireCheck?: boolean }
): boolean {
  const build = getVerifyResult(results, 'build')
  if (!build?.success) return false
  if (options?.requireCheck) {
    const check = getVerifyResult(results, 'check')
    if (!check?.success) return false
  }
  return true
}

export function getVerifyResult(
  results: readonly VerifyResult[],
  step: VerifyStepName
): VerifyResult | undefined {
  const command = VERIFY_STEP_COMMANDS[step]
  return results.find((result) => result.command === command)
}

/** Build log tail for `child-fix-build` (empty when build was not run). */
export function formatBuildLogForFixAgent(result: VerifyResult | undefined): string {
  if (!result) return '_No build verification result. Run `bun run build` and retry._'
  if (result.success) return '_Build passed._'
  return result.output.slice(-12000)
}

/** One-line PR / summary strip for verification status. */
export function formatVerifyStatusLine(results: VerifyResult[]): string {
  if (results.length === 0) return '_Verification not run._'
  return results
    .map((r) => {
      const step = stepFromCommand(r.command)
      const blocking = r.blocking || (step ? isBlockingStep(step) : false)
      const mark = r.success ? '✅' : blocking ? '❌' : '⚠️'
      return `${mark} \`${r.command}\``
    })
    .join(' · ')
}

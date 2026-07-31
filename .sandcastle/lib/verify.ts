import { execSync } from 'node:child_process'
import { VERIFY_COMMANDS } from './config'

export interface VerifyResult {
  command: string
  success: boolean
  output: string
}

/**
 * Run advisory verification commands. Failures are recorded but never throw —
 * the harness publishes results and still finalizes the sync PR.
 */
export function runVerification(): VerifyResult[] {
  const results: VerifyResult[] = []

  for (const command of VERIFY_COMMANDS) {
    try {
      const output = execSync(command, { encoding: 'utf8', stdio: 'pipe' })
      results.push({ command, success: true, output })
      console.log(`[verify] ${command} — passed`)
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; message?: string }
      const output = [err.stdout, err.stderr, err.message].filter(Boolean).join('\n')
      results.push({ command, success: false, output })
      console.warn(`[verify] ${command} — failed (advisory; does not fail the sync)`)
    }
  }

  return results
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
    return { command, success: true, output }
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string }
    const output = [err.stdout, err.stderr, err.message].filter(Boolean).join('\n')
    return { command, success: false, output }
  }
}

export function formatVerifyResults(results: VerifyResult[]): string {
  if (results.length === 0) {
    return '_No verification commands ran._'
  }

  const summary = results.every((r) => r.success)
    ? 'All verification commands passed.'
    : 'Verification is **advisory** — failures do not block the sync. Review and fix on the draft PR as needed.'

  const body = results
    .map((r) => {
      const snippet = r.success ? r.output.slice(0, 2000) : r.output.slice(-8000)
      return `### ${r.command}\n\n${r.success ? '✅ passed' : '❌ failed'}\n\n\`\`\`\n${snippet}\n\`\`\``
    })
    .join('\n\n')

  return `${summary}\n\n${body}`
}

export function allVerificationPassed(results: VerifyResult[]): boolean {
  return results.length === VERIFY_COMMANDS.length && results.every((r) => r.success)
}

/** One-line PR / summary strip for verification status. */
export function formatVerifyStatusLine(results: VerifyResult[]): string {
  if (results.length === 0) return '_Verification not run._'
  return results.map((r) => `${r.success ? '✅' : '❌'} \`${r.command}\``).join(' · ')
}

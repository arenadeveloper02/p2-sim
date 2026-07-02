import { execSync } from 'node:child_process'
import { VERIFY_COMMANDS } from './config'

export interface VerifyResult {
  command: string
  success: boolean
  output: string
}

export function runVerification(): VerifyResult[] {
  const results: VerifyResult[] = []

  for (const command of VERIFY_COMMANDS) {
    try {
      const output = execSync(command, { encoding: 'utf8', stdio: 'pipe' })
      results.push({ command, success: true, output })
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; message?: string }
      const output = [err.stdout, err.stderr, err.message].filter(Boolean).join('\n')
      results.push({ command, success: false, output })
      break
    }
  }

  return results
}

export function formatVerifyResults(results: VerifyResult[]): string {
  return results
    .map((r) => `### ${r.command}\n\n${r.success ? '✅ passed' : '❌ failed'}\n\n\`\`\`\n${r.output.slice(0, 4000)}\n\`\`\``)
    .join('\n\n')
}

export function allVerificationPassed(results: VerifyResult[]): boolean {
  return results.length === VERIFY_COMMANDS.length && results.every((r) => r.success)
}

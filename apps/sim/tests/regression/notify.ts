import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { REGRESSION_CONFIG } from '@/tests/regression/config'
import type { RegressionReport } from '@/tests/regression/types'

const logger = createLogger('RegressionNotify')

function failedCases(report: RegressionReport) {
  return report.suites
    .flatMap((suite) => suite.cases)
    .filter((testCase) => testCase.status === 'fail')
}

function buildSlackPayload(report: RegressionReport, htmlPath?: string) {
  const failures = failedCases(report)
  const lines = failures.slice(0, 10).map((testCase) => {
    const why = testCase.why?.summary ?? testCase.what?.actual ?? 'Failed'
    return `• ${testCase.id} — ${why}`
  })

  const text = [
    `📊 Sim Daily Regression — ${report.meta.startedAt.slice(0, 10)}`,
    `Environment: ${report.meta.environment} (${report.meta.appUrl})`,
    `Pass rate: ${report.summary.passRate}% (${report.summary.passed}✅ ${report.summary.failed}❌ ${report.summary.skipped}⏭)`,
    `Duration: ${Math.round(report.summary.durationMs / 1000)}s`,
    failures.length ? '\nFailures:\n' + lines.join('\n') : '\nAll tests passed.',
    htmlPath ? `\nHTML report path: ${htmlPath}` : '',
    report.meta.githubRunUrl ? `GitHub run: ${report.meta.githubRunUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return { text }
}

function buildEmailBody(report: RegressionReport, htmlPath?: string): string {
  const failures = failedCases(report)
  const failureRows = failures
    .map((testCase) => {
      return [
        `Test: ${testCase.id}`,
        `What: ${testCase.what?.actual ?? 'n/a'}`,
        `Why: ${testCase.why?.summary ?? 'n/a'}`,
        `Reproduce: ${testCase.reproduce?.commandCli ?? 'See HTML report'}`,
        '---',
      ].join('\n')
    })
    .join('\n')

  return [
    `Sim Regression Report — ${report.meta.startedAt.slice(0, 10)}`,
    `Environment: ${report.meta.appUrl}`,
    `Pass rate: ${report.summary.passRate}%`,
    `Passed: ${report.summary.passed} | Failed: ${report.summary.failed} | Skipped: ${report.summary.skipped}`,
    htmlPath ? `HTML report: ${htmlPath}` : '',
    report.meta.githubRunUrl ? `GitHub run: ${report.meta.githubRunUrl}` : '',
    '',
    failures.length ? 'Failed cases:\n' + failureRows : 'No failures.',
  ]
    .filter(Boolean)
    .join('\n')
}

export async function notifyRegressionReport(
  report: RegressionReport,
  options?: { htmlPath?: string; reportsDir?: string }
): Promise<{ slackPosted: boolean; emailWritten: boolean }> {
  const slackWebhook = process.env.REGRESSION_SLACK_WEBHOOK
  const reportsDir = options?.reportsDir ?? REGRESSION_CONFIG.reports.outputDir
  let slackPosted = false
  let emailWritten = false

  if (slackWebhook) {
    try {
      const payload = buildSlackPayload(report, options?.htmlPath)
      const response = await fetch(slackWebhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        throw new Error(`Slack webhook returned ${response.status}`)
      }
      slackPosted = true
    } catch (error) {
      logger.error('Failed to post Slack regression notification', { error: getErrorMessage(error) })
    }
  } else {
    logger.warn('REGRESSION_SLACK_WEBHOOK not set — skipping Slack notification')
  }

  const emailBody = buildEmailBody(report, options?.htmlPath)
  const emailPath = path.join(reportsDir, 'email.txt')
  writeFileSync(emailPath, emailBody)
  emailWritten = true

  return { slackPosted, emailWritten }
}

if (import.meta.main) {
  const { readFileSync } = await import('node:fs')
  const reportPath = process.argv[2] ?? 'apps/sim/tests/regression/reports/report.json'
  const htmlPath = process.argv[3]
  const report = JSON.parse(readFileSync(reportPath, 'utf-8')) as RegressionReport
  notifyRegressionReport(report, { htmlPath }).then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`)
  })
}

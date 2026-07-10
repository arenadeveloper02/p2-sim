import { execSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createLogger } from '@sim/logger'
import { generateId } from '@sim/utils/id'
import { REGRESSION_CONFIG } from '@/tests/regression/config'
import { e2eSuiteRunner } from '@/tests/regression/suites/e2e'
import { liveSuiteRunner } from '@/tests/regression/suites/live'
import { staticSuiteRunner } from '@/tests/regression/suites/static'
import type {
  RegressionReport,
  RegressionRunContext,
  RegressionSuiteRunner,
  RegressionTrend,
} from '@/tests/regression/types'

const logger = createLogger('RegressionRunner')

const SUITE_RUNNERS: RegressionSuiteRunner[] = [staticSuiteRunner, liveSuiteRunner, e2eSuiteRunner]

function gitRoot(): string {
  return execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim()
}

function resolveGitSha(): string | undefined {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return undefined
  }
}

function parseArgs(argv: string[]) {
  let suiteFilter: string | undefined
  let caseFilter: string | undefined

  for (const arg of argv) {
    if (arg.startsWith('--suite=')) suiteFilter = arg.slice('--suite='.length)
    if (arg.startsWith('--case=')) caseFilter = arg.slice('--case='.length)
  }

  return { suiteFilter, caseFilter }
}

function buildSummary(suites: RegressionReport['suites']) {
  const allCases = suites.flatMap((suite) => suite.cases)
  const passed = allCases.filter((testCase) => testCase.status === 'pass').length
  const failed = allCases.filter((testCase) => testCase.status === 'fail').length
  const skipped = allCases.filter((testCase) => testCase.status === 'skip').length
  const flaky = allCases.filter((testCase) => testCase.status === 'flaky').length
  const total = allCases.length
  const passRate = total === 0 ? 100 : Number(((passed / total) * 100).toFixed(1))

  return {
    total,
    passed,
    failed,
    skipped,
    flaky,
    durationMs: suites.reduce((sum, suite) => sum + suite.durationMs, 0),
    passRate,
  }
}

function loadYesterdayTrend(
  historyPath: string,
  todayPassRate: number,
  todayFailedIds: string[]
): RegressionTrend | undefined {
  try {
    if (!existsSync(historyPath)) return undefined

    const lines = readFileSync(historyPath, 'utf-8').trim().split('\n').filter(Boolean)
    if (lines.length === 0) return undefined

    const yesterday = JSON.parse(lines[lines.length - 1]!) as {
      passRate: number
      failedCaseIds: string[]
    }
    const yesterdayFailed = new Set(yesterday.failedCaseIds)
    const todayFailed = new Set(todayFailedIds)

    return {
      passRateDelta: Number((todayPassRate - yesterday.passRate).toFixed(1)),
      newFailures: todayFailedIds.filter((id) => !yesterdayFailed.has(id)),
      fixed: yesterday.failedCaseIds.filter((id) => !todayFailed.has(id)),
    }
  } catch {
    return undefined
  }
}

function appendHistory(historyPath: string, report: RegressionReport) {
  mkdirSync(path.dirname(historyPath), { recursive: true })
  const failedCaseIds = report.suites
    .flatMap((suite) => suite.cases)
    .filter((testCase) => testCase.status === 'fail')
    .map((testCase) => testCase.id)

  appendFileSync(
    historyPath,
    `${JSON.stringify({
      date: report.meta.startedAt.slice(0, 10),
      passRate: report.summary.passRate,
      failed: report.summary.failed,
      failedCaseIds,
    })}\n`
  )
}

export async function runRegression(argv = process.argv.slice(2)): Promise<RegressionReport> {
  const { suiteFilter, caseFilter } = parseArgs(argv)
  const startedAt = new Date().toISOString()
  const runId = generateId()
  const root = gitRoot()
  const reportsDir = path.join(root, REGRESSION_CONFIG.reports.outputDir)
  mkdirSync(reportsDir, { recursive: true })

  const context: RegressionRunContext = {
    appUrl: process.env.REGRESSION_APP_URL ?? REGRESSION_CONFIG.environment.appUrl,
    gitSha: resolveGitSha(),
    githubRunUrl: process.env.GITHUB_SERVER_URL
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : undefined,
    trigger:
      process.env.GITHUB_EVENT_NAME === 'workflow_dispatch'
        ? 'manual'
        : process.env.GITHUB_EVENT_NAME === 'schedule'
          ? 'schedule'
          : process.env.GITHUB_ACTIONS === 'true'
            ? 'manual'
            : 'local',
    apiKey: process.env.REGRESSION_API_KEY,
    workspaceId: process.env.REGRESSION_WORKSPACE_ID,
  }

  const runners = SUITE_RUNNERS.filter((runner) => !suiteFilter || runner.id === suiteFilter)
  const suites = []

  for (const runner of runners) {
    logger.info('Running regression suite', { suiteId: runner.id })
    const suite = await runner.run(context)
    if (caseFilter) {
      suite.cases = suite.cases.filter((testCase) => testCase.id === caseFilter)
    }
    suites.push(suite)
  }

  const summary = buildSummary(suites)
  const failedCaseIds = suites
    .flatMap((suite) => suite.cases)
    .filter((testCase) => testCase.status === 'fail')
    .map((testCase) => testCase.id)

  const historyPath = path.join(root, REGRESSION_CONFIG.reports.historyFile)
  const vsYesterday = loadYesterdayTrend(historyPath, summary.passRate, failedCaseIds)

  const report: RegressionReport = {
    meta: {
      runId,
      startedAt,
      finishedAt: new Date().toISOString(),
      environment: REGRESSION_CONFIG.environment.name,
      appUrl: context.appUrl,
      gitSha: context.gitSha,
      tier: 'combined',
      trigger: context.trigger,
      githubRunUrl: context.githubRunUrl,
    },
    policy: {
      slackChannelId: REGRESSION_CONFIG.notifications.slack.channelId,
      slackChannelName: REGRESSION_CONFIG.notifications.slack.channelName,
      emailRecipient: REGRESSION_CONFIG.notifications.email.to[0]!,
      excludedIntegrations: [...REGRESSION_CONFIG.excludedIntegrations],
    },
    suites,
    summary: {
      ...summary,
      vsYesterday,
      durationMs: 0,
    },
  }

  report.meta.finishedAt = new Date().toISOString()
  report.summary.durationMs =
    new Date(report.meta.finishedAt).getTime() - new Date(report.meta.startedAt).getTime()

  const reportJsonPath = path.join(reportsDir, 'report.json')
  writeFileSync(reportJsonPath, JSON.stringify(report, null, 2))
  appendHistory(historyPath, report)

  logger.info('Regression run complete', {
    passed: report.summary.passed,
    failed: report.summary.failed,
    skipped: report.summary.skipped,
    reportJsonPath,
  })

  return report
}

if (import.meta.main) {
  runRegression()
    .then((report) => {
      if (report.summary.failed > 0) process.exit(1)
    })
    .catch((error) => {
      logger.error('Regression run failed', { error })
      process.exit(1)
    })
}

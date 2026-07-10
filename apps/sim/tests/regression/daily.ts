#!/usr/bin/env bun

import { execSync } from 'node:child_process'
import path from 'node:path'
import { createLogger } from '@sim/logger'
import { notifyRegressionReport } from '@/tests/regression/notify'
import { generateRegressionHtml } from '@/tests/regression/report-html'
import { runRegression } from '@/tests/regression/run'
import { REGRESSION_CONFIG } from '@/tests/regression/config'

const logger = createLogger('RegressionDaily')

function gitRoot(): string {
  return execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim()
}

async function main() {
  const root = gitRoot()
  const report = await runRegression()
  const reportJsonPath = path.join(root, REGRESSION_CONFIG.reports.outputDir, 'report.json')
  const htmlPath = generateRegressionHtml(reportJsonPath)
  const notifyResult = await notifyRegressionReport(report, {
    htmlPath,
    reportsDir: path.join(root, REGRESSION_CONFIG.reports.outputDir),
  })

  logger.info('Daily regression artifacts generated', {
    reportJsonPath,
    htmlPath,
    notifyResult,
  })

  if (report.summary.failed > 0) {
    process.exit(1)
  }
}

if (import.meta.main) {
  main().catch((error) => {
    logger.error('Daily regression pipeline failed', { error })
    process.exit(1)
  })
}

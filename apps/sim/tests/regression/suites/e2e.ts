import { REGRESSION_CONFIG } from '@/tests/regression/config'
import type {
  RegressionCase,
  RegressionRunContext,
  RegressionSuite,
  RegressionSuiteRunner,
} from '@/tests/regression/types'

/**
 * UI smoke suite placeholder. Full Playwright journeys can be enabled later
 * without modifying application code by setting REGRESSION_E2E_ENABLED=true.
 */
export const e2eSuiteRunner: RegressionSuiteRunner = {
  id: 'e2e',
  name: 'UI smoke (test-agent)',
  category: 'e2e',
  priority: 'P0',
  async run(context) {
    const started = Date.now()
    const enabled = process.env.REGRESSION_E2E_ENABLED === 'true'
    const caseId = 'e2e:smoke:login-and-workflow-list'

    const baseCase: RegressionCase = {
      id: caseId,
      status: enabled ? 'skip' : 'skip',
      durationMs: Date.now() - started,
      skipReason: enabled
        ? 'Playwright smoke specs not yet added — enable after apps/e2e is introduced'
        : 'Set REGRESSION_E2E_ENABLED=true and add Playwright specs to run UI smoke on test-agent',
      what: {
        title: 'UI smoke on test-agent.thearena.ai',
        expected: 'Login and workflow list loads',
        actual: enabled ? 'Awaiting Playwright implementation' : 'Skipped by default',
      },
      reproduce: {
        environment: REGRESSION_CONFIG.environment.name,
        appUrl: context.appUrl,
        gitSha: context.gitSha,
        stepsUi: [
          `Open ${context.appUrl}`,
          'Log in with the QA regression user',
          'Confirm workspace home and workflow list render',
        ],
        commandCli: 'REGRESSION_E2E_ENABLED=true bun run apps/sim/tests/regression/run.ts --suite=e2e',
      },
      artifacts: { githubRunUrl: context.githubRunUrl },
    }

    return {
      id: 'e2e',
      name: 'UI smoke (test-agent)',
      category: 'e2e',
      priority: 'P0',
      status: 'skip',
      durationMs: Date.now() - started,
      cases: [baseCase],
    }
  },
}

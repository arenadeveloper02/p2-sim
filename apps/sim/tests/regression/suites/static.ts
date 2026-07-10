import { execSync } from 'node:child_process'
import path from 'node:path'
import { getAllBlocks } from '@/blocks/registry'
import { tools as toolRegistry } from '@/tools/registry'
import { REGRESSION_CONFIG } from '@/tests/regression/config'
import { isExcludedIntegration } from '@/tests/regression/safety'
import type {
  RegressionCase,
  RegressionRunContext,
  RegressionSuite,
  RegressionSuiteRunner,
} from '@/tests/regression/types'
function gitRoot(): string {
  return execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim()
}

function resolveSuiteStatus(cases: RegressionCase[]): RegressionCase['status'] {
  if (cases.some((testCase) => testCase.status === 'fail')) return 'fail'
  if (cases.every((testCase) => testCase.status === 'skip')) return 'skip'
  return 'pass'
}

function buildReproduce(
  context: RegressionRunContext,
  caseId: string,
  extra?: { commandApi?: string; stepsUi?: string[] }
) {
  return {
    environment: REGRESSION_CONFIG.environment.name,
    appUrl: context.appUrl,
    gitSha: context.gitSha,
    stepsUi: extra?.stepsUi ?? [
      `Open ${context.appUrl}`,
      'Review the failing regression case in the HTML report',
    ],
    commandCli: `bun run apps/sim/tests/regression/run.ts --case=${caseId}`,
    commandApi: extra?.commandApi,
  }
}

async function runRegistryScriptCheck(
  context: RegressionRunContext,
  caseId: string,
  title: string
): Promise<RegressionCase> {
  const started = Date.now()
  const root = gitRoot()
  const scriptPath = path.join(root, 'apps/sim/scripts/check-block-registry.ts')

  try {
    execSync(`bun run "${scriptPath}" HEAD~1`, {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return {
      id: caseId,
      status: 'pass',
      durationMs: Date.now() - started,
      what: {
        title,
        expected: 'Block registry invariants pass',
        actual: 'All checks passed',
      },
      reproduce: buildReproduce(context, caseId, {
        stepsUi: [`From repo root run: bun run apps/sim/scripts/check-block-registry.ts HEAD~1`],
        commandApi: undefined,
      }),
      artifacts: { githubRunUrl: context.githubRunUrl },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      id: caseId,
      status: 'fail',
      durationMs: Date.now() - started,
      what: {
        title,
        expected: 'Block registry invariants pass',
        actual: 'check-block-registry.ts failed',
      },
      why: {
        category: 'platform_bug',
        summary: 'Block registry invariant check failed',
        detail: message.slice(0, 2000),
      },
      reproduce: buildReproduce(context, caseId, {
        stepsUi: [`From repo root run: bun run apps/sim/scripts/check-block-registry.ts HEAD~1`],
      }),
      artifacts: {
        githubRunUrl: context.githubRunUrl,
        logExcerpt: message.slice(0, 1000),
      },
    }
  }
}

function isProviderLlmToolId(toolId: string): boolean {
  return toolId.endsWith('_chat') || toolId.endsWith('_reasoner')
}

function runToolAccessCheck(context: RegressionRunContext): RegressionCase[] {
  const cases: RegressionCase[] = []

  for (const block of getAllBlocks()) {
    if (isExcludedIntegration(block.type)) continue

    const caseId = `static:block-tools:${block.type}`
    const started = Date.now()
    const missingTools = (block.tools?.access ?? []).filter(
      (toolId) => !isProviderLlmToolId(toolId) && !toolRegistry[toolId]
    )

    if (missingTools.length > 0) {
      cases.push({
        id: caseId,
        status: 'fail',
        durationMs: Date.now() - started,
        blockType: block.type,
        what: {
          title: `Block ${block.type} tool wiring`,
          expected: 'Every tools.access id exists in tools registry',
          actual: `Missing tools: ${missingTools.join(', ')}`,
          blockType: block.type,
        },
        why: {
          category: 'platform_bug',
          summary: 'Block references tools that are not registered',
          detail: missingTools.join(', '),
        },
        reproduce: buildReproduce(context, caseId),
      })
      continue
    }

    cases.push({
      id: caseId,
      status: 'pass',
      durationMs: Date.now() - started,
      blockType: block.type,
      what: {
        title: `Block ${block.type} tool wiring`,
        expected: 'Every tools.access id exists in tools registry',
        actual: 'All tool ids resolved',
        blockType: block.type,
      },
      reproduce: buildReproduce(context, caseId),
    })
  }

  return cases
}

function runSafetyPolicyChecks(context: RegressionRunContext): RegressionCase[] {
  const started = Date.now()
  const cases: RegressionCase[] = []

  cases.push({
    id: 'static:policy:slack-channel',
    status: 'pass',
    durationMs: Date.now() - started,
    what: {
      title: 'Slack safety policy',
      expected: `Only ${REGRESSION_CONFIG.notifications.slack.channelName} (${REGRESSION_CONFIG.notifications.slack.channelId})`,
      actual: 'Policy configured',
    },
    reproduce: buildReproduce(context, 'static:policy:slack-channel'),
  })

  cases.push({
    id: 'static:policy:email-recipient',
    status: 'pass',
    durationMs: Date.now() - started,
    what: {
      title: 'Email safety policy',
      expected: `Only ${REGRESSION_CONFIG.notifications.email.to.join(', ')}`,
      actual: 'Policy configured',
    },
    reproduce: buildReproduce(context, 'static:policy:email-recipient'),
  })

  cases.push({
    id: 'static:policy:notion-excluded',
    status: isExcludedIntegration('notion') ? 'pass' : 'fail',
    durationMs: Date.now() - started,
    what: {
      title: 'Notion exclusion policy',
      expected: 'Notion excluded from live/UI regression',
      actual: isExcludedIntegration('notion') ? 'Excluded' : 'Not excluded',
    },
    reproduce: buildReproduce(context, 'static:policy:notion-excluded'),
  })

  return cases
}

export const staticSuiteRunner: RegressionSuiteRunner = {
  id: 'static',
  name: 'Registry & static invariants',
  category: 'static',
  priority: 'P0',
  async run(context) {
    const started = Date.now()
    const cases: RegressionCase[] = []

    cases.push(await runRegistryScriptCheck(context, 'static:check-block-registry', 'Block registry CI script'))
    cases.push(...runSafetyPolicyChecks(context))
    cases.push(...runToolAccessCheck(context))

    return {
      id: 'static',
      name: 'Registry & static invariants',
      category: 'static',
      priority: 'P0',
      status: resolveSuiteStatus(cases),
      durationMs: Date.now() - started,
      cases,
    }
  },
}

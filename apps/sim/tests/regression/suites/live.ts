import { readFileSync } from 'node:fs'
import path from 'node:path'
import { REGRESSION_CONFIG } from '@/tests/regression/config'
import { assertAllowedEmailDestinations, assertAllowedSlackDestination, isExcludedIntegration } from '@/tests/regression/safety'
import type {
  RegressionCase,
  RegressionRunContext,
  RegressionSuite,
  RegressionSuiteRunner,
} from '@/tests/regression/types'
import { getErrorMessage } from '@sim/utils/errors'
import { sleep } from '@sim/utils/helpers'

interface LiveManifestEntry {
  id: string
  operation: string
  workflowId?: string
  priority?: 'P0' | 'P1' | 'P2'
  params?: Record<string, unknown>
  expected?: {
    workflowSuccess?: boolean
    outputContains?: string[]
  }
}

interface LiveManifest {
  integrations: LiveManifestEntry[]
}

function loadManifest(): LiveManifest {
  const manifestPath = path.join(import.meta.dir, '..', 'live', 'manifest.json')
  return JSON.parse(readFileSync(manifestPath, 'utf-8')) as LiveManifest
}

function buildReproduce(context: RegressionRunContext, entry: LiveManifestEntry, caseId: string) {
  const workflowPath = entry.workflowId
    ? `${context.appUrl}/workspace/${context.workspaceId ?? '{workspaceId}'}/w/${entry.workflowId}`
    : context.appUrl

  return {
    environment: REGRESSION_CONFIG.environment.name,
    appUrl: context.appUrl,
    gitSha: context.gitSha,
    workspaceId: context.workspaceId,
    workflowId: entry.workflowId,
    stepsUi: entry.workflowId
      ? [
          `Open ${workflowPath}`,
          'Click Run (manual trigger)',
          'Open Terminal and inspect the failing block output',
        ]
      : [`Configure workflow id for ${entry.id} in live/manifest.json`],
    commandCli: `bun run apps/sim/tests/regression/run.ts --case=${caseId}`,
    commandApi: entry.workflowId
      ? `curl -X POST "${context.appUrl}/api/workflows/${entry.workflowId}/execute" -H "x-api-key: $REGRESSION_API_KEY" -H "Content-Type: application/json" -d '${JSON.stringify({ input: entry.params ?? {} })}'`
      : undefined,
    inputs: entry.params,
    fixturePath: 'apps/sim/tests/regression/live/manifest.json',
  }
}

async function executeWorkflow(
  context: RegressionRunContext,
  entry: LiveManifestEntry
): Promise<{ success: boolean; executionId?: string; error?: string; output?: unknown }> {
  if (!entry.workflowId || !context.apiKey) {
    return { success: false, error: 'Missing workflowId or REGRESSION_API_KEY' }
  }

  const response = await fetch(`${context.appUrl}/api/workflows/${entry.workflowId}/execute`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': context.apiKey,
    },
    body: JSON.stringify({
      input: entry.params ?? {},
      triggerType: 'api',
    }),
  })

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    return {
      success: false,
      error: getErrorMessage(body.error ?? body.message, `HTTP ${response.status}`),
    }
  }

  const executionId =
    typeof body.executionId === 'string'
      ? body.executionId
      : typeof body.id === 'string'
        ? body.id
        : undefined

  // Poll briefly for async executions when only an id is returned.
  if (executionId && body.success === undefined) {
    await sleep(2000)
  }

  const success = body.success !== false
  return { success, executionId, output: body }
}

async function runLiveEntry(
  context: RegressionRunContext,
  entry: LiveManifestEntry
): Promise<RegressionCase> {
  const caseId = `live:${entry.id}:${entry.operation}`
  const started = Date.now()

  if (isExcludedIntegration(entry.id)) {
    return {
      id: caseId,
      status: 'skip',
      durationMs: Date.now() - started,
      skipReason: `${entry.id} is excluded from regression`,
      reproduce: buildReproduce(context, entry, caseId),
    }
  }

  try {
    if (entry.id === 'slack') {
      const channel =
        typeof entry.params?.channel === 'string'
          ? entry.params.channel
          : typeof entry.params?.channelId === 'string'
            ? entry.params.channelId
            : undefined
      assertAllowedSlackDestination({ channel, channelId: channel })
    }

    if (entry.id.includes('mail') || entry.id.includes('email') || entry.operation.includes('email')) {
      assertAllowedEmailDestinations({ to: entry.params?.to as string | undefined })
    }
  } catch (error) {
    return {
      id: caseId,
      status: 'fail',
      durationMs: Date.now() - started,
      what: {
        title: `${entry.id} → ${entry.operation}`,
        expected: 'Params satisfy safety policy',
        actual: getErrorMessage(error),
      },
      why: {
        category: 'safety',
        summary: 'Safety policy blocked this test before execution',
        detail: getErrorMessage(error),
      },
      reproduce: buildReproduce(context, entry, caseId),
    }
  }

  if (!context.apiKey || !entry.workflowId) {
    return {
      id: caseId,
      status: 'skip',
      durationMs: Date.now() - started,
      skipReason: 'Set REGRESSION_API_KEY and workflowId in live/manifest.json to enable live tests',
      what: {
        title: `${entry.id} → ${entry.operation}`,
        expected: 'Live workflow execution succeeds',
        actual: 'Skipped — credentials or workflow not configured',
      },
      reproduce: buildReproduce(context, entry, caseId),
    }
  }

  try {
    const result = await executeWorkflow(context, entry)
    const expectedSuccess = entry.expected?.workflowSuccess ?? true

    if (!result.success || result.success !== expectedSuccess) {
      return {
        id: caseId,
        status: 'fail',
        durationMs: Date.now() - started,
        what: {
          title: `${entry.id} → ${entry.operation}`,
          expected: expectedSuccess ? 'Workflow succeeds' : 'Workflow fails as expected',
          actual: result.error ?? 'Workflow returned unsuccessful result',
          blockType: entry.id,
        },
        why: {
          category: 'unknown',
          summary: result.error ?? 'Live workflow execution failed',
        },
        reproduce: buildReproduce(context, entry, caseId),
        artifacts: {
          githubRunUrl: context.githubRunUrl,
          simExecutionUrl: result.executionId
            ? `${context.appUrl}/workspace/${context.workspaceId ?? ''}/w/${entry.workflowId}?execution=${result.executionId}`
            : undefined,
          logExcerpt: result.error,
        },
      }
    }

    return {
      id: caseId,
      status: 'pass',
      durationMs: Date.now() - started,
      what: {
        title: `${entry.id} → ${entry.operation}`,
        expected: 'Workflow succeeds',
        actual: 'Workflow succeeded',
        blockType: entry.id,
      },
      reproduce: buildReproduce(context, entry, caseId),
      artifacts: {
        simExecutionUrl: result.executionId
          ? `${context.appUrl}/workspace/${context.workspaceId ?? ''}/w/${entry.workflowId}?execution=${result.executionId}`
          : undefined,
      },
    }
  } catch (error) {
    return {
      id: caseId,
      status: 'fail',
      durationMs: Date.now() - started,
      what: {
        title: `${entry.id} → ${entry.operation}`,
        expected: 'Workflow succeeds',
        actual: getErrorMessage(error),
        blockType: entry.id,
      },
      why: {
        category: 'platform_bug',
        summary: 'Live workflow execution threw an error',
        detail: getErrorMessage(error),
      },
      reproduce: buildReproduce(context, entry, caseId),
      artifacts: { githubRunUrl: context.githubRunUrl },
    }
  }
}

export const liveSuiteRunner: RegressionSuiteRunner = {
  id: 'live',
  name: 'Live integrations (QA)',
  category: 'feature',
  priority: 'P0',
  async run(context) {
    const started = Date.now()
    const manifest = loadManifest()
    const cases: RegressionCase[] = []

    for (const entry of manifest.integrations) {
      cases.push(await runLiveEntry(context, entry))
    }

    const status = cases.some((testCase) => testCase.status === 'fail')
      ? 'fail'
      : cases.every((testCase) => testCase.status === 'skip')
        ? 'skip'
        : 'pass'

    return {
      id: 'live',
      name: 'Live integrations (QA)',
      category: 'feature',
      priority: 'P0',
      status,
      durationMs: Date.now() - started,
      cases,
    }
  },
}

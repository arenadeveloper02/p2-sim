import { db } from '@sim/db'
import { workflow } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { generateId } from '@sim/utils/id'
import { eq } from 'drizzle-orm'
import type { DeployedAppRecord } from '@/lib/arena-generative-ui/deployment'
import { isHttpUrlAllowlisted } from '@/lib/arena-generative-ui/http-allowlist'
import type {
  ArenaGenerativeApiBinding,
  ArenaGenerativeAppManifest,
} from '@/lib/arena-generative-ui/types'
import { releaseExecutionSlot } from '@/lib/billing/calculations/usage-reservation'
import { isDev } from '@/lib/core/config/env-flags'
import { getEffectiveDecryptedEnv } from '@/lib/environment/utils'
import { preprocessExecution } from '@/lib/execution/preprocessing'
import { LoggingSession } from '@/lib/logs/execution/logging-session'

const logger = createLogger('ArenaGenerativeUiAction')

const HTTP_TIMEOUT_MS = 15_000
const HTTP_MAX_BYTES = 1_048_576

function mapActionInput(
  values: Record<string, unknown>,
  inputMapping?: Record<string, string>
): Record<string, unknown> {
  if (!inputMapping || Object.keys(inputMapping).length === 0) {
    return values
  }
  const mapped: Record<string, unknown> = {}
  for (const [targetKey, sourceKey] of Object.entries(inputMapping)) {
    mapped[targetKey] = values[sourceKey] ?? values[targetKey]
  }
  return mapped
}

function parseSecretHeaders(raw: string | undefined): Record<string, string> {
  if (!raw?.trim()) return {}
  const trimmed = raw.trim()
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const headers: Record<string, string> = {}
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === 'string' && value) {
          headers[key] = value
        }
      }
      return headers
    }
  } catch {
    // Secret is a bearer token rather than a JSON header map.
  }
  return { Authorization: trimmed.startsWith('Bearer ') ? trimmed : `Bearer ${trimmed}` }
}

async function runWorkflowBinding(options: {
  binding: ArenaGenerativeApiBinding
  mappedInput: Record<string, unknown>
  actorUserId: string
  requestId: string
}): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const workflowId = options.binding.workflowId
  if (!workflowId) {
    return { ok: false, error: 'Workflow binding is missing workflowId' }
  }

  const [workflowRecord] = await db
    .select({
      id: workflow.id,
      userId: workflow.userId,
      workspaceId: workflow.workspaceId,
      isDeployed: workflow.isDeployed,
      variables: workflow.variables,
    })
    .from(workflow)
    .where(eq(workflow.id, workflowId))
    .limit(1)

  if (!workflowRecord) {
    return { ok: false, error: 'Bound workflow was not found' }
  }
  if (!workflowRecord.isDeployed) {
    return { ok: false, error: 'Bound workflow is not deployed' }
  }
  if (!workflowRecord.workspaceId) {
    return { ok: false, error: 'Bound workflow has no workspace' }
  }

  const executionId = generateId()
  const loggingSession = new LoggingSession(workflowId, executionId, 'api', options.requestId)

  const preprocessResult = await preprocessExecution({
    workflowId,
    userId: workflowRecord.userId,
    triggerType: 'api',
    executionId,
    requestId: options.requestId,
    checkRateLimit: true,
    checkDeployment: true,
    loggingSession,
  })

  if (!preprocessResult.success) {
    return {
      ok: false,
      error: preprocessResult.error?.message || 'Failed to process request',
    }
  }

  const { actorUserId, billingAttribution } = preprocessResult
  const resolvedActorUserId = actorUserId ?? options.actorUserId

  try {
    await loggingSession.safeStart({
      userId: resolvedActorUserId,
      actorUserId: resolvedActorUserId,
      billingAttribution,
      workspaceId: workflowRecord.workspaceId,
      variables: {},
      executionActor: preprocessResult.executionActor,
    })

    const { executeWorkflow } = await import('@/lib/workflows/executor/execute-workflow')
    const result = await executeWorkflow(
      {
        id: workflowRecord.id,
        userId: workflowRecord.userId,
        workspaceId: workflowRecord.workspaceId,
        isDeployed: workflowRecord.isDeployed,
        variables: (workflowRecord.variables as Record<string, unknown>) ?? undefined,
      },
      options.requestId,
      options.mappedInput,
      resolvedActorUserId,
      {
        enabled: true,
        isSecureMode: true,
        workflowTriggerType: 'api',
        executionMode: 'sync',
        billingAttribution,
      },
      executionId
    )

    if (!result.success) {
      return { ok: false, error: result.error || 'Workflow execution failed', data: result.output }
    }

    return { ok: true, data: result.output }
  } catch (error) {
    await releaseExecutionSlot(executionId)
    logger.error('Generative app workflow action failed', {
      workflowId,
      error: getErrorMessage(error),
    })
    return { ok: false, error: getErrorMessage(error, 'Workflow execution failed') }
  }
}

async function runHttpBinding(options: {
  binding: ArenaGenerativeApiBinding
  mappedInput: Record<string, unknown>
  allowlist: string[]
  userId: string
  workspaceId: string
}): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const http = options.binding.http
  if (!http) {
    return { ok: false, error: 'HTTP binding is missing url/method' }
  }

  const allowHttp = isDev
  const allowlisted = isHttpUrlAllowlisted(http.url, options.allowlist, { allowHttp })
  if (!allowlisted.ok) {
    return { ok: false, error: allowlisted.error ?? 'HTTP host is not allowlisted' }
  }

  const envVars = await getEffectiveDecryptedEnv(options.userId, options.workspaceId)
  const secretHeaders = http.headersSecretName
    ? parseSecretHeaders(envVars[http.headersSecretName])
    : {}

  const method = http.method
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)

  try {
    const init: RequestInit = {
      method,
      headers: {
        Accept: 'application/json',
        ...secretHeaders,
      },
      signal: controller.signal,
    }

    let url = http.url
    if (method === 'GET' || method === 'DELETE') {
      const parsed = new URL(url)
      for (const [key, value] of Object.entries(options.mappedInput)) {
        if (value === undefined || value === null) continue
        parsed.searchParams.set(key, String(value))
      }
      url = parsed.toString()
    } else {
      init.headers = {
        ...(init.headers as Record<string, string>),
        'Content-Type': 'application/json',
      }
      init.body = JSON.stringify(options.mappedInput)
    }

    const response = await fetch(url, init)
    const buffer = await response.arrayBuffer()
    if (buffer.byteLength > HTTP_MAX_BYTES) {
      return { ok: false, error: 'HTTP response exceeded size limit' }
    }
    const text = new TextDecoder().decode(buffer)
    let data: unknown = text
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = text
    }

    if (!response.ok) {
      return {
        ok: false,
        error: `HTTP ${response.status}`,
        data,
      }
    }

    return { ok: true, data }
  } catch (error) {
    return { ok: false, error: getErrorMessage(error, 'HTTP request failed') }
  } finally {
    clearTimeout(timeout)
  }
}

export interface RunDeployedAppActionResult {
  ok: boolean
  data?: unknown
  navigate?: string
  setState?: Record<string, unknown>
  error?: string
}

export interface RunGenerativeAppActionOptions {
  manifest: ArenaGenerativeAppManifest
  apiBindings: ArenaGenerativeApiBinding[]
  httpAllowlist: string[]
  userId: string
  workspaceId: string
  actionId: string
  values: Record<string, unknown>
  requestId: string
  actorUserId: string
}

/**
 * Executes a generative-app CTA (workflow or allowlisted HTTP) from a draft or deployment.
 */
export async function runGenerativeAppAction(
  options: RunGenerativeAppActionOptions
): Promise<RunDeployedAppActionResult> {
  const action = options.manifest.actions[options.actionId]
  if (!action) {
    return { ok: false, error: `Unknown action "${options.actionId}"` }
  }

  const binding = options.apiBindings.find((item) => item.key === action.apiKey)
  if (!binding) {
    return { ok: false, error: `Unknown API binding "${action.apiKey}"` }
  }

  const mappedInput = mapActionInput(options.values, action.inputMapping)

  const result =
    binding.kind === 'http'
      ? await runHttpBinding({
          binding,
          mappedInput,
          allowlist: options.httpAllowlist,
          userId: options.userId,
          workspaceId: options.workspaceId,
        })
      : await runWorkflowBinding({
          binding,
          mappedInput,
          actorUserId: options.actorUserId,
          requestId: options.requestId,
        })

  if (!result.ok) {
    return {
      ok: false,
      data: result.data,
      error: result.error,
      setState: action.onError?.setState,
    }
  }

  const setState =
    action.onSuccess?.setState && Object.keys(action.onSuccess.setState).length > 0
      ? {
          ...(typeof result.data === 'object' && result.data
            ? (result.data as Record<string, unknown>)
            : {}),
          ...action.onSuccess.setState,
        }
      : typeof result.data === 'object' && result.data
        ? (result.data as Record<string, unknown>)
        : { result: result.data }

  return {
    ok: true,
    data: result.data,
    navigate: action.onSuccess?.navigate,
    setState,
  }
}

/**
 * Executes a published generative-app CTA (workflow or allowlisted HTTP).
 */
export async function runDeployedAppAction(options: {
  deployment: DeployedAppRecord
  actionId: string
  values: Record<string, unknown>
  requestId: string
}): Promise<RunDeployedAppActionResult> {
  return runGenerativeAppAction({
    manifest: options.deployment.manifest,
    apiBindings: options.deployment.apiBindings,
    httpAllowlist: options.deployment.httpAllowlist,
    userId: options.deployment.userId,
    workspaceId: options.deployment.workspaceId,
    actionId: options.actionId,
    values: options.values,
    requestId: options.requestId,
    actorUserId: options.deployment.userId,
  })
}

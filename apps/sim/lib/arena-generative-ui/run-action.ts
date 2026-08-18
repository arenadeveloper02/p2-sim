import { db } from '@sim/db'
import { workflow } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { generateId } from '@sim/utils/id'
import { eq } from 'drizzle-orm'
import type { DeployedAppRecord } from '@/lib/arena-generative-ui/deployment'
import { isHttpUrlAllowlisted } from '@/lib/arena-generative-ui/http-allowlist'
import {
  type ArenaGenerativeApiBinding,
  type ArenaGenerativeAppManifest,
  displayTextFromActionData,
  streamingActionIdsFrom,
} from '@/lib/arena-generative-ui/types'
import { releaseExecutionSlot } from '@/lib/billing/calculations/usage-reservation'
import { isDev } from '@/lib/core/config/env-flags'
import { encodeSSE, readSSELines, SSE_HEADERS } from '@/lib/core/utils/sse'
import {
  type EnvironmentResolutionSnapshot,
  getEffectiveEnvironmentSnapshot,
} from '@/lib/environment/utils'
import { preprocessExecution } from '@/lib/execution/preprocessing'
import { LoggingSession } from '@/lib/logs/execution/logging-session'

const logger = createLogger('ArenaGenerativeUiAction')

const HTTP_TIMEOUT_MS = 15_000
export const HTTP_STREAM_TIMEOUT_MS = 180_000
const HTTP_MAX_BYTES = 1_048_576
const API_KEY_SECRET_NAME = /API[_-]?KEY$/i

/**
 * Env var names as stored on a binding may carry a `$` prefix or `{{ }}`
 * wrappers from a pasted curl. Strip those so lookup matches the env map.
 */
export function normalizeSecretName(raw: string | undefined): string {
  let name = raw?.trim() ?? ''
  if (name.startsWith('{{') && name.endsWith('}}')) {
    name = name.slice(2, -2).trim()
  }
  if (name.startsWith('$')) {
    name = name.slice(1).trim()
  }
  return name
}

function parseSecretHeaders(
  raw: string | undefined,
  authHeaderName?: string
): Record<string, string> {
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
      if (Object.keys(headers).length > 0) {
        return headers
      }
    }
  } catch {
    // Secret is a bearer token rather than a JSON header map.
  }
  if (authHeaderName) {
    return { [authHeaderName]: trimmed }
  }
  return { Authorization: trimmed.startsWith('Bearer ') ? trimmed : `Bearer ${trimmed}` }
}

function resolveAuthHeaderName(http: {
  authHeaderName?: string
  headersSecretName?: string
}): string | undefined {
  const explicit = http.authHeaderName?.trim()
  if (explicit) return explicit
  const secretName = normalizeSecretName(http.headersSecretName)
  if (secretName && API_KEY_SECRET_NAME.test(secretName)) {
    return 'X-API-Key'
  }
  return undefined
}

/**
 * Curl and Secrets often disagree on a `W_` workspace prefix. Try both.
 */
function secretNameCandidates(name: string): string[] {
  if (/^W_/i.test(name)) {
    return [name, name.replace(/^W_/i, '')]
  }
  return [name, `W_${name}`]
}

function findEnvKey(map: Record<string, string>, wanted: string): string | undefined {
  if (Object.hasOwn(map, wanted)) {
    return wanted
  }
  const lower = wanted.toLowerCase()
  return Object.keys(map).find((key) => key.toLowerCase() === lower)
}

function lookupSecretValue(
  snapshot: EnvironmentResolutionSnapshot,
  secretName: string
): { key: string; value: string } | undefined {
  const sources = [snapshot.workspaceDecrypted, snapshot.personalDecrypted]
  for (const candidate of secretNameCandidates(secretName)) {
    for (const source of sources) {
      const key = findEnvKey(source, candidate)
      const value = key ? source[key] : undefined
      if (key && value?.trim()) {
        return { key, value }
      }
    }
  }
  return undefined
}

function knownSecretKeys(snapshot: EnvironmentResolutionSnapshot): string[] {
  return [
    ...new Set([
      ...Object.keys(snapshot.personalEncrypted),
      ...Object.keys(snapshot.workspaceEncrypted),
      ...Object.keys(snapshot.personalDecrypted),
      ...Object.keys(snapshot.workspaceDecrypted),
    ]),
  ].sort((left, right) => left.localeCompare(right))
}

function findKnownSecretKey(
  snapshot: EnvironmentResolutionSnapshot,
  secretName: string
): string | undefined {
  const keys = knownSecretKeys(snapshot)
  for (const candidate of secretNameCandidates(secretName)) {
    const exact = keys.find((key) => key === candidate)
    if (exact) return exact
    const lower = candidate.toLowerCase()
    const match = keys.find((key) => key.toLowerCase() === lower)
    if (match) return match
  }
  return undefined
}

function missingSecretError(secretName: string, accessibleNames: string[]): string {
  if (accessibleNames.length === 0) {
    return `Secret "${secretName}" was not found in workspace or personal environment`
  }
  const shown = accessibleNames.slice(0, 20)
  const extra = accessibleNames.length > 20 ? ` (+${accessibleNames.length - 20} more)` : ''
  return `Secret "${secretName}" was not found in workspace or personal environment. Accessible secrets: ${shown.join(', ')}${extra}`
}

function resolveSecretHeaders(
  http: { headersSecretName?: string; authHeaderName?: string },
  snapshot: EnvironmentResolutionSnapshot
): { ok: true; headers: Record<string, string> } | { ok: false; error: string } {
  const secretName = normalizeSecretName(http.headersSecretName)
  if (!secretName) {
    return { ok: true, headers: {} }
  }

  const matched = lookupSecretValue(snapshot, secretName)
  if (!matched) {
    const knownKey = findKnownSecretKey(snapshot, secretName)
    if (knownKey) {
      const decryptFailed = snapshot.decryptionFailures.some(
        (failed) => failed.toLowerCase() === knownKey.toLowerCase()
      )
      return {
        ok: false,
        error: decryptFailed
          ? `Secret "${knownKey}" exists but could not be decrypted. Re-save it in Settings → Secrets.`
          : `Secret "${knownKey}" is empty. Set a value in Settings → Secrets.`,
      }
    }
    return { ok: false, error: missingSecretError(secretName, knownSecretKeys(snapshot)) }
  }

  const authHeaderName = resolveAuthHeaderName({
    authHeaderName: http.authHeaderName,
    headersSecretName: secretName,
  })
  const headers = parseSecretHeaders(matched.value, authHeaderName)
  logger.info('Attached HTTP secret headers', {
    secretName,
    resolvedSecretName: matched.key,
    headerNames: Object.keys(headers),
  })
  return { ok: true, headers }
}

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

async function runWorkflowBinding(options: {
  binding: ArenaGenerativeApiBinding
  mappedInput: Record<string, unknown>
  actorUserId: string
  requestId: string
  onChunk?: (content: string) => void | Promise<void>
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
        executionMode: options.onChunk ? 'stream' : 'sync',
        billingAttribution,
        onStream: options.onChunk
          ? async (streamingExec) => {
              const reader = streamingExec.stream.getReader()
              const decoder = new TextDecoder()
              try {
                while (true) {
                  const { done, value } = await reader.read()
                  if (done) break
                  const chunk = decoder.decode(value, { stream: true })
                  if (chunk) await options.onChunk?.(chunk)
                }
              } finally {
                reader.releaseLock()
              }
            }
          : undefined,
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
  actorUserId: string
  workspaceId: string
  onChunk?: (content: string) => void | Promise<void>
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

  const snapshot = await getEffectiveEnvironmentSnapshot(options.actorUserId, options.workspaceId)
  const secret = resolveSecretHeaders(http, snapshot)
  if (!secret.ok) {
    return { ok: false, error: secret.error }
  }
  const secretHeaders = secret.headers

  const method = http.method
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    options.onChunk ? HTTP_STREAM_TIMEOUT_MS : HTTP_TIMEOUT_MS
  )

  try {
    const init: RequestInit = {
      method,
      headers: {
        Accept: options.onChunk
          ? 'text/event-stream, text/plain, application/json'
          : 'application/json',
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
    if (options.onChunk) {
      return await readHttpResponseStream(response, options.onChunk)
    }
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

function contentFromSseData(raw: string): string {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'string') return parsed
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>
      if (typeof record.content === 'string') return record.content
      if (typeof record.delta === 'string') return record.delta
      if (typeof record.text === 'string') return record.text
      if (typeof record.chunk === 'string') return record.chunk
    }
  } catch {
    return raw
  }
  return raw
}

async function readHttpResponseStream(
  response: Response,
  onChunk: (content: string) => void | Promise<void>
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const contentType = response.headers.get('content-type') ?? ''
  try {
    if (contentType.includes('text/event-stream')) {
      let totalBytes = 0
      let accumulated = ''
      await readSSELines(response, {
        onData: async (raw) => {
          const piece = contentFromSseData(raw)
          if (!piece) return
          totalBytes += new TextEncoder().encode(piece).byteLength
          if (totalBytes > HTTP_MAX_BYTES) {
            throw new Error('HTTP response exceeded size limit')
          }
          accumulated += piece
          await onChunk(piece)
        },
      })
      if (!response.ok) {
        return { ok: false, error: `HTTP ${response.status}`, data: { content: accumulated } }
      }
      return { ok: true, data: { content: accumulated } }
    }

    if (contentType.includes('text/plain') && response.body) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let totalBytes = 0
      let accumulated = ''
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          totalBytes += value.byteLength
          if (totalBytes > HTTP_MAX_BYTES) {
            return { ok: false, error: 'HTTP response exceeded size limit' }
          }
          const chunk = decoder.decode(value, { stream: true })
          if (!chunk) continue
          accumulated += chunk
          await onChunk(chunk)
        }
      } finally {
        reader.releaseLock()
      }
      if (!response.ok) {
        return { ok: false, error: `HTTP ${response.status}`, data: { content: accumulated } }
      }
      return { ok: true, data: { content: accumulated } }
    }
  } catch (error) {
    return { ok: false, error: getErrorMessage(error, 'HTTP request failed') }
  }

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
    return { ok: false, error: `HTTP ${response.status}`, data }
  }
  return { ok: true, data }
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
  onChunk?: (content: string) => void | Promise<void>
}

/**
 * True when this action id is bound to an API with `stream: true`.
 */
export function isStreamingAction(
  manifest: ArenaGenerativeAppManifest,
  bindings: ArenaGenerativeApiBinding[],
  actionId: string
): boolean {
  return streamingActionIdsFrom(manifest, bindings).includes(actionId)
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
          actorUserId: options.actorUserId,
          workspaceId: options.workspaceId,
          onChunk: options.onChunk,
        })
      : await runWorkflowBinding({
          binding,
          mappedInput,
          actorUserId: options.actorUserId,
          requestId: options.requestId,
          onChunk: options.onChunk,
        })

  if (!result.ok) {
    return {
      ok: false,
      data: result.data,
      error: result.error,
      setState: action.onError?.setState,
    }
  }

  const fromData =
    typeof result.data === 'object' && result.data && !Array.isArray(result.data)
      ? (result.data as Record<string, unknown>)
      : { result: result.data }
  const display = displayTextFromActionData(result.data)
  const setState = {
    ...(action.onSuccess?.setState ?? {}),
    ...fromData,
    ...(display ? { content: display } : {}),
  }

  return {
    ok: true,
    data: result.data,
    navigate: action.onSuccess?.navigate,
    setState,
  }
}

/**
 * SSE wrapper for a streaming CTA. Emits `{ type: "chunk" }` then `{ type: "done" }`.
 */
export function createGenerativeAppActionSseResponse(
  options: RunGenerativeAppActionOptions
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const result = await runGenerativeAppAction({
          ...options,
          onChunk: (content) => {
            controller.enqueue(encodeSSE({ type: 'chunk', content }))
          },
        })
        controller.enqueue(
          encodeSSE({
            type: 'done',
            ok: result.ok,
            data: result.data,
            navigate: result.navigate,
            setState: result.setState,
            error: result.error,
          })
        )
      } catch (error) {
        controller.enqueue(
          encodeSSE({
            type: 'done',
            ok: false,
            error: getErrorMessage(error, 'Action failed'),
          })
        )
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, { headers: SSE_HEADERS })
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

export function createDeployedAppActionSseResponse(options: {
  deployment: DeployedAppRecord
  actionId: string
  values: Record<string, unknown>
  requestId: string
}): Response {
  return createGenerativeAppActionSseResponse({
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

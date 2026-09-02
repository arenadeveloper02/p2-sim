import { db } from '@sim/db'
import { workflow } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { sleep } from '@sim/utils/helpers'
import { generateId } from '@sim/utils/id'
import { backoffWithJitter, parseRetryAfter } from '@sim/utils/retry'
import { truncate } from '@sim/utils/string'
import { eq } from 'drizzle-orm'
import {
  actionStateFromPlan,
  layoutPlanForBinding,
  proseContentFromPlanState,
  shouldBindActionContent,
} from '@/lib/arena-generative-ui/binding-layout-plan'
import {
  type ArenaGenerativeActionSurface,
  applyChatProtocolToActionValues,
  chatProtocolReservedKeys,
} from '@/lib/arena-generative-ui/chat-protocol'
import type { DeployedAppRecord } from '@/lib/arena-generative-ui/deployment'
import { isHttpUrlAllowlisted } from '@/lib/arena-generative-ui/http-allowlist'
import {
  applyBindingInputSources,
  constrainBindingInput,
} from '@/lib/arena-generative-ui/input-schema'
import { outputSchemaWarning } from '@/lib/arena-generative-ui/output-schema'
import {
  applyPaginationToInput,
  collectAppendKeys,
  paginationStateFromData,
} from '@/lib/arena-generative-ui/pagination'
import {
  ARENA_GENERATIVE_ACTOR_EMAIL_KEY,
  ARENA_GENERATIVE_SCHEMA_WARNING_KEY,
  type ArenaGenerativeApiBinding,
  type ArenaGenerativeAppManifest,
  type ArenaGenerativeHttpBinding,
  displayTextFromActionData,
  streamingActionIdsFrom,
  unwrapResponseBlockEnvelope,
} from '@/lib/arena-generative-ui/types'
import { releaseExecutionSlot } from '@/lib/billing/calculations/usage-reservation'
import { isDev } from '@/lib/core/config/env-flags'
import { encodeSSE, readSSELines, SSE_HEADERS } from '@/lib/core/utils/sse'
import {
  type EnvironmentResolutionSnapshot,
  getEffectiveEnvironmentSnapshot,
} from '@/lib/environment/utils'
import { processExecutionFiles } from '@/lib/execution/files'
import { preprocessExecution } from '@/lib/execution/preprocessing'
import { LoggingSession } from '@/lib/logs/execution/logging-session'
import type { StreamingExecution } from '@/executor/types'

const logger = createLogger('ArenaGenerativeUiAction')

/**
 * Generous by default: CTA bindings routinely front LLM or report endpoints, and
 * a binding that needs longer can raise it up to `MAX_HTTP_TIMEOUT_MS`.
 */
const DEFAULT_HTTP_TIMEOUT_MS = 60_000
export const HTTP_STREAM_TIMEOUT_MS = 180_000
const MIN_HTTP_TIMEOUT_MS = 1_000
const MAX_HTTP_TIMEOUT_MS = 300_000
export const HTTP_MAX_BYTES = 1_048_576
export const HTTP_RESPONSE_TOO_LARGE_ERROR =
  'HTTP response exceeded 1 MB. Ask the API for a smaller page (pagination, limit, or a narrower field set) and retry.'
const HTTP_ERROR_DETAIL_MAX_LENGTH = 300
const API_KEY_SECRET_NAME = /API[_-]?KEY$/i
const RETRYABLE_HTTP_STATUS = new Set([429, 502, 503, 504])
const MAX_HTTP_ATTEMPTS = 3
const IDEMPOTENT_HTTP_METHODS = new Set(['GET', 'DELETE'])

function resolveHttpTimeoutMs(binding: ArenaGenerativeHttpBinding, streaming: boolean): number {
  const fallback = streaming ? HTTP_STREAM_TIMEOUT_MS : DEFAULT_HTTP_TIMEOUT_MS
  const requested = binding.timeoutMs
  if (typeof requested !== 'number' || !Number.isFinite(requested)) {
    return fallback
  }
  return Math.min(Math.max(requested, MIN_HTTP_TIMEOUT_MS), MAX_HTTP_TIMEOUT_MS)
}

/**
 * Pulls a human message out of an error response body so the app shows what the
 * upstream said instead of a bare status code.
 */
function httpErrorDetail(data: unknown): string {
  if (typeof data === 'string') {
    return truncate(data.trim(), HTTP_ERROR_DETAIL_MAX_LENGTH)
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return ''
  }
  const record = data as Record<string, unknown>
  for (const key of ['error', 'message', 'detail', 'error_description'] as const) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return truncate(value.trim(), HTTP_ERROR_DETAIL_MAX_LENGTH)
    }
    if (value && typeof value === 'object') {
      const nested = (value as Record<string, unknown>).message
      if (typeof nested === 'string' && nested.trim()) {
        return truncate(nested.trim(), HTTP_ERROR_DETAIL_MAX_LENGTH)
      }
    }
  }
  return ''
}

function httpErrorMessage(status: number, data: unknown): string {
  const detail = httpErrorDetail(data)
  return detail ? `HTTP ${status}: ${detail}` : `HTTP ${status}`
}

function httpFailureMessage(error: unknown, timeoutMs: number): string {
  if (error instanceof Error && error.name === 'AbortError') {
    return `HTTP request timed out after ${Math.round(timeoutMs / 1000)}s`
  }
  return getErrorMessage(error, 'HTTP request failed')
}

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

/**
 * Replaces any caller-supplied `arenaEmailId` with the server's resolved value, so
 * the key has exactly one source. Workflow bindings always receive it — they execute
 * inside the same workspace. HTTP bindings receive it only when the binding sets
 * `forwardEmailId`, so no existing binding starts disclosing a visitor's address to
 * a third-party endpoint.
 */
function withActorEmail(
  values: Record<string, unknown>,
  binding: ArenaGenerativeApiBinding,
  arenaEmailId?: string
): Record<string, unknown> {
  const next = { ...values }
  delete next[ARENA_GENERATIVE_ACTOR_EMAIL_KEY]
  const allowed = binding.kind === 'workflow' || binding.forwardEmailId === true
  if (allowed && arenaEmailId?.trim()) {
    next[ARENA_GENERATIVE_ACTOR_EMAIL_KEY] = arenaEmailId.trim()
  }
  return next
}

/**
 * Remap overlay: keep constrained form keys and write mapped targets on top.
 * A lone `{ email: "arenaEmailId" }` must not drop `keyword` / `client`.
 */
function mapActionInput(
  values: Record<string, unknown>,
  inputMapping?: Record<string, string>
): Record<string, unknown> {
  if (!inputMapping || Object.keys(inputMapping).length === 0) {
    return values
  }
  const mapped: Record<string, unknown> = { ...values }
  for (const [targetKey, sourceKey] of Object.entries(inputMapping)) {
    const value = values[sourceKey] ?? values[targetKey]
    if (value !== undefined) {
      mapped[targetKey] = value
    }
  }
  return mapped
}

/**
 * Chat protocol keys are host-stamped like `arenaEmailId` and must survive a
 * mapping that omitted them.
 */
function withChatProtocolKeys(
  mapped: Record<string, unknown>,
  constrained: Record<string, unknown>,
  binding: Pick<ArenaGenerativeApiBinding, 'chatProtocol'>
): Record<string, unknown> {
  const keys = chatProtocolReservedKeys(binding.chatProtocol)
  if (keys.length === 0) return mapped
  const next = { ...mapped }
  for (const key of keys) {
    if (constrained[key] !== undefined) {
      next[key] = constrained[key]
    }
  }
  return next
}

async function withProcessedChatFiles(options: {
  binding: ArenaGenerativeApiBinding
  mappedInput: Record<string, unknown>
  workspaceId: string
  workflowId: string
  executionId: string
  requestId: string
  userId: string
}): Promise<Record<string, unknown>> {
  if (!options.binding.chatProtocol?.files || options.mappedInput.files === undefined) {
    return options.mappedInput
  }
  const uploaded = await processExecutionFiles(
    options.mappedInput.files,
    {
      workspaceId: options.workspaceId,
      workflowId: options.workflowId,
      executionId: options.executionId,
    },
    options.requestId,
    options.userId
  )
  return { ...options.mappedInput, files: uploaded }
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

    const mappedInput = await withProcessedChatFiles({
      binding: options.binding,
      mappedInput: options.mappedInput,
      workspaceId: workflowRecord.workspaceId,
      workflowId,
      executionId,
      requestId: options.requestId,
      userId: resolvedActorUserId,
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
      mappedInput,
      resolvedActorUserId,
      {
        enabled: true,
        isSecureMode: true,
        workflowTriggerType: 'api',
        executionMode: options.onChunk ? 'stream' : 'sync',
        billingAttribution,
        onStream: options.onChunk
          ? async (streamingExec) => {
              await consumeWorkflowExecutionStream(streamingExec, options.onChunk)
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

function retryAfterFromResponse(response: Response): number | null {
  const headers = response.headers
  if (!headers || typeof headers.get !== 'function') return null
  return parseRetryAfter(headers.get('Retry-After'))
}

function isTimeoutAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

async function readHttpJsonBody(
  response: Response
): Promise<{ tooLarge: true } | { tooLarge: false; data: unknown }> {
  const buffer = await response.arrayBuffer()
  if (buffer.byteLength > HTTP_MAX_BYTES) {
    return { tooLarge: true }
  }
  const text = new TextDecoder().decode(buffer)
  if (!text) return { tooLarge: false, data: null }
  try {
    return { tooLarge: false, data: JSON.parse(text) }
  } catch {
    return { tooLarge: false, data: text }
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

  let snapshot: EnvironmentResolutionSnapshot
  try {
    snapshot = await getEffectiveEnvironmentSnapshot(options.actorUserId, options.workspaceId)
  } catch (error) {
    return { ok: false, error: getErrorMessage(error, 'Failed to load secrets') }
  }
  const secret = resolveSecretHeaders(http, snapshot)
  if (!secret.ok) {
    return { ok: false, error: secret.error }
  }
  const secretHeaders = secret.headers

  const method = http.method
  const streaming = Boolean(options.onChunk)
  const timeoutMs = resolveHttpTimeoutMs(http, streaming)
  const canRetry = !streaming && IDEMPOTENT_HTTP_METHODS.has(method)
  const maxAttempts = canRetry ? MAX_HTTP_ATTEMPTS : 1

  let lastFailure: { ok: false; error: string; data?: unknown } | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const init: RequestInit = {
        method,
        headers: {
          Accept: streaming
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
        const body =
          streaming && options.mappedInput.stream === undefined
            ? { ...options.mappedInput, stream: true }
            : options.mappedInput
        init.body = JSON.stringify(body)
      }

      const response = await fetch(url, init)
      if (options.onChunk) {
        return await readHttpResponseStream(response, options.onChunk, timeoutMs)
      }

      const body = await readHttpJsonBody(response)
      if (body.tooLarge) {
        return { ok: false, error: HTTP_RESPONSE_TOO_LARGE_ERROR }
      }

      if (response.ok) {
        return { ok: true, data: body.data }
      }

      lastFailure = {
        ok: false,
        error: httpErrorMessage(response.status, body.data),
        data: body.data,
      }
      const retryableStatus = RETRYABLE_HTTP_STATUS.has(response.status)
      if (canRetry && retryableStatus && attempt < maxAttempts) {
        await sleep(backoffWithJitter(attempt, retryAfterFromResponse(response)))
        continue
      }
      return lastFailure
    } catch (error) {
      lastFailure = { ok: false, error: httpFailureMessage(error, timeoutMs) }
      if (isTimeoutAbort(error) || !canRetry || attempt >= maxAttempts) {
        return lastFailure
      }
      await sleep(backoffWithJitter(attempt, null))
    } finally {
      clearTimeout(timer)
    }
  }

  return lastFailure ?? { ok: false, error: 'HTTP request failed' }
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

function nestedRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  return value as Record<string, unknown>
}

/**
 * Pulls token text out of a streamed JSON payload: Sim `{ chunk }` / `{ content }`,
 * OpenAI `choices[0].delta.content`, Anthropic `delta.text`, or a raw string.
 * Objects with no text field return empty so they are not dumped into DataText.
 */
function extractStreamPayloadText(raw: string): string {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'string') return parsed
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return ''
    }
    const record = parsed as Record<string, unknown>
    const nested = nestedRecord(record.data)
    const fromNestedChunk = stringField(nested?.chunk)
    if (fromNestedChunk) return fromNestedChunk
    const fromContent = stringField(record.content)
    if (fromContent) return fromContent
    const fromDelta = stringField(record.delta)
    if (fromDelta) return fromDelta
    const fromText = stringField(record.text)
    if (fromText) return fromText
    const fromChunk = stringField(record.chunk)
    if (fromChunk) return fromChunk

    const choices = Array.isArray(record.choices) ? record.choices : []
    const choice = nestedRecord(choices[0])
    if (choice) {
      const fromChoiceText = stringField(choice.text)
      if (fromChoiceText) return fromChoiceText
      const fromChoiceDelta = stringField(nestedRecord(choice.delta)?.content)
      if (fromChoiceDelta) return fromChoiceDelta
      const fromChoiceMessage = stringField(nestedRecord(choice.message)?.content)
      if (fromChoiceMessage) return fromChoiceMessage
    }

    const fromAnthropicDelta = stringField(nestedRecord(record.delta)?.text)
    if (fromAnthropicDelta) return fromAnthropicDelta
    return ''
  } catch {
    return raw
  }
}

function contentFromSseData(raw: string): string {
  return extractStreamPayloadText(raw)
}

/**
 * Pulls answer text out of a workflow byte-stream piece: SSE `stream:chunk`
 * frames, `{ chunk }` JSON, or raw token text. Whole execution envelopes with
 * no text field are dropped so they are not concatenated into DataText.
 */
export function contentFromWorkflowStreamChunk(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''

  if (trimmed.includes('data:')) {
    const pieces: string[] = []
    for (const block of trimmed.split(/\n\n+/)) {
      const dataLines = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
      if (!dataLines || dataLines === '[DONE]') continue
      const extracted = extractStreamPayloadText(dataLines)
      if (extracted) pieces.push(extracted)
    }
    if (pieces.length > 0) return pieces.join('')
  }

  return extractStreamPayloadText(trimmed)
}

/**
 * Forwards live `text_delta` when the execution exposes a sink; otherwise
 * extracts token text from the projected byte stream. Always drains the byte
 * stream so the executor pump can finish.
 */
async function consumeWorkflowExecutionStream(
  streamingExec: StreamingExecution,
  onChunk?: (content: string) => void | Promise<void>
): Promise<void> {
  if (!onChunk) return

  const useSink = Boolean(streamingExec.subscribe) && streamingExec.clientStreamTransformed !== true
  let unsubscribe: (() => void) | undefined
  if (useSink && streamingExec.subscribe) {
    unsubscribe = streamingExec.subscribe({
      onEvent: async (event) => {
        if (event.type === 'text_delta' && event.turn !== 'intermediate' && event.text) {
          await onChunk(event.text)
        }
      },
    })
  }

  const reader = streamingExec.stream.getReader()
  const decoder = new TextDecoder()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (useSink) continue
      const chunk = decoder.decode(value, { stream: true })
      const text = contentFromWorkflowStreamChunk(chunk)
      if (text) await onChunk(text)
    }
  } finally {
    unsubscribe?.()
    reader.releaseLock()
  }
}

async function readHttpResponseStream(
  response: Response,
  onChunk: (content: string) => void | Promise<void>,
  timeoutMs: number
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
            throw new Error(HTTP_RESPONSE_TOO_LARGE_ERROR)
          }
          accumulated += piece
          await onChunk(piece)
        },
      })
      if (!response.ok) {
        return {
          ok: false,
          error: httpErrorMessage(response.status, accumulated),
          data: { content: accumulated },
        }
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
            return { ok: false, error: HTTP_RESPONSE_TOO_LARGE_ERROR }
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
        return {
          ok: false,
          error: httpErrorMessage(response.status, accumulated),
          data: { content: accumulated },
        }
      }
      return { ok: true, data: { content: accumulated } }
    }
  } catch (error) {
    if (error instanceof Error && error.message === HTTP_RESPONSE_TOO_LARGE_ERROR) {
      return { ok: false, error: HTTP_RESPONSE_TOO_LARGE_ERROR }
    }
    return { ok: false, error: httpFailureMessage(error, timeoutMs) }
  }

  const body = await readHttpJsonBody(response)
  if (body.tooLarge) {
    return { ok: false, error: HTTP_RESPONSE_TOO_LARGE_ERROR }
  }
  if (!response.ok) {
    return { ok: false, error: httpErrorMessage(response.status, body.data), data: body.data }
  }
  return { ok: true, data: body.data }
}

export interface RunDeployedAppActionResult {
  ok: boolean
  data?: unknown
  navigate?: string
  setState?: Record<string, unknown>
  error?: string
  appendKeys?: string[]
  schemaWarning?: string
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
  /** Visitor's Arena emailId. Unverified — see `ARENA_GENERATIVE_ACTOR_EMAIL_KEY`. */
  arenaEmailId?: string
  /**
   * `chat` keeps reserved Start keys the binding's chatProtocol declared.
   * Omitted / `form` strips `input`, `conversationId`, and `files`.
   */
  surface?: ArenaGenerativeActionSurface
  onChunk?: (content: string) => void | Promise<void>
}

/**
 * True when this action id is bound to an API with `stream: true` or
 * `chatProtocol.input`.
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

  const binding = action.apiKey
    ? options.apiBindings.find((item) => item.key === action.apiKey)
    : undefined
  if (!action.apiKey || !binding) {
    const setState = {
      ...(options.values ?? {}),
      ...(action.onSuccess?.setState ?? {}),
    }
    return {
      ok: true,
      data: setState,
      navigate: action.onSuccess?.navigate,
      setState,
    }
  }

  /**
   * Host-owned keys (`visitorEmail`, `constant`, `arenaEmailId`, chat protocol)
   * are applied on both sides of `mapActionInput`. Constants and visitorEmail
   * are stamped first so form composition can include them. After mapping,
   * they are stamped again so a remap that omitted a host-owned Start field
   * still receives it — plus reserved Start keys.
   */
  const withHostInputs = (values: Record<string, unknown>) =>
    withActorEmail(
      applyBindingInputSources(values, binding, options.arenaEmailId),
      binding,
      options.arenaEmailId
    )
  const hostedValues = withHostInputs(options.values)
  const surfaceValues = applyChatProtocolToActionValues(hostedValues, binding, options.surface)
  const constrained = constrainBindingInput(surfaceValues, binding, action.inputMapping)
  const mappedInput = applyPaginationToInput(
    binding.pagination,
    withHostInputs(
      withChatProtocolKeys(mapActionInput(constrained, action.inputMapping), constrained, binding)
    )
  )

  let streamedContent = ''
  const onChunk = options.onChunk
    ? async (content: string) => {
        streamedContent += content
        await options.onChunk?.(content)
      }
    : undefined

  const result =
    binding.kind === 'http'
      ? await runHttpBinding({
          binding,
          mappedInput,
          allowlist: options.httpAllowlist,
          actorUserId: options.actorUserId,
          workspaceId: options.workspaceId,
          onChunk,
        })
      : await runWorkflowBinding({
          binding,
          mappedInput,
          actorUserId: options.actorUserId,
          requestId: options.requestId,
          onChunk,
        })

  if (!result.ok) {
    return {
      ok: false,
      data: result.data,
      error: result.error,
      setState: action.onError?.setState,
    }
  }

  const payload = unwrapResponseBlockEnvelope(result.data)
  const plan = layoutPlanForBinding(binding)
  const fromData = actionStateFromPlan(payload, plan)
  const paginationPatch = binding.pagination
    ? paginationStateFromData(binding.pagination, payload, mappedInput)
    : {}
  const display = streamedContent.trim() ? streamedContent : displayTextFromActionData(payload)
  const boundContent =
    display && shouldBindActionContent(plan, display, streamedContent)
      ? display
      : proseContentFromPlanState(fromData, plan)
  const setState: Record<string, unknown> = {
    ...(action.onSuccess?.setState ?? {}),
    ...fromData,
    ...paginationPatch,
    ...(boundContent ? { content: boundContent } : {}),
  }
  const schemaWarning = outputSchemaWarning(binding.outputSchema, setState)
  if (schemaWarning) {
    logger.warn('Generative app outputSchema drift', {
      actionId: options.actionId,
      bindingKey: binding.key,
      schemaWarning,
    })
    setState[ARENA_GENERATIVE_SCHEMA_WARNING_KEY] = schemaWarning
  }
  const appendKeys = collectAppendKeys(binding.pagination, mappedInput, action.append)

  return {
    ok: true,
    data: result.data,
    navigate: action.onSuccess?.navigate,
    setState,
    appendKeys: appendKeys.length > 0 ? appendKeys : undefined,
    schemaWarning,
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
            appendKeys: result.appendKeys,
            schemaWarning: result.schemaWarning,
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
  arenaEmailId?: string
  surface?: ArenaGenerativeActionSurface
}): Promise<RunDeployedAppActionResult> {
  return runGenerativeAppAction(deployedRunnerOptions(options))
}

export function createDeployedAppActionSseResponse(options: {
  deployment: DeployedAppRecord
  actionId: string
  values: Record<string, unknown>
  requestId: string
  arenaEmailId?: string
  surface?: ArenaGenerativeActionSurface
}): Response {
  return createGenerativeAppActionSseResponse(deployedRunnerOptions(options))
}

function deployedRunnerOptions(options: {
  deployment: DeployedAppRecord
  actionId: string
  values: Record<string, unknown>
  requestId: string
  arenaEmailId?: string
  surface?: ArenaGenerativeActionSurface
}): RunGenerativeAppActionOptions {
  return {
    manifest: options.deployment.manifest,
    apiBindings: options.deployment.apiBindings,
    httpAllowlist: options.deployment.httpAllowlist,
    userId: options.deployment.userId,
    workspaceId: options.deployment.workspaceId,
    actionId: options.actionId,
    values: options.values,
    requestId: options.requestId,
    actorUserId: options.deployment.userId,
    arenaEmailId: options.arenaEmailId,
    surface: options.surface,
  }
}

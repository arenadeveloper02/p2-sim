import { createLogger } from '@sim/logger'
import { getErrorMessage, toError } from '@sim/utils/errors'
import { sleep } from '@sim/utils/helpers'
import { isValidUuid } from '@sim/utils/id'
import { randomFloat } from '@sim/utils/random'
import { getBYOKKey } from '@/lib/api-key/byok'
import { generateInternalToken } from '@/lib/auth/internal'
import { isHosted } from '@/lib/core/config/env-flags'
import { DEFAULT_EXECUTION_TIMEOUT_MS, getMaxExecutionTimeout } from '@/lib/core/execution-limits'
import { getHostedKeyRateLimiter } from '@/lib/core/rate-limiter'
import {
  secureFetchWithPinnedIP,
  validateUrlWithDNS,
} from '@/lib/core/security/input-validation.server'
import { PlatformEvents } from '@/lib/core/telemetry'
import { generateRequestId } from '@/lib/core/utils/request'
import {
  isPayloadSizeLimitError,
  readResponseToBufferWithLimit,
} from '@/lib/core/utils/stream-limits'
import { getBaseUrl, getInternalApiBaseUrl } from '@/lib/core/utils/urls'
import { isUserFile } from '@/lib/core/utils/user-file'
import { isSameOrigin } from '@/lib/core/utils/validation'
import { getAccessibleOAuthCredentials } from '@/lib/credentials/environment'
import { SIM_VIA_HEADER, serializeCallChain } from '@/lib/execution/call-chain'
import {
  sanitizeImageGenerationWrapperParams,
  stripInlinePayloadFromFileReference,
} from '@/lib/image-generation/nano-banana-inputs'
import { generateOpenAIImageToolResponse } from '@/lib/image-generation/openai-generate.server'
import { parseMcpToolId } from '@/lib/mcp/utils'
import { hostedKeyMetrics } from '@/lib/monitoring/metrics'
import { resolveUnipileExternalAccountId } from '@/lib/unipile/account-from-credential'
import { resolveWorkspaceFileReference } from '@/lib/uploads/contexts/workspace/workspace-file-manager'
import { generateNanoBananaImage } from '@/app/api/google/api-service'
import { assertPermissionsAllowed } from '@/ee/access-control/utils/permission-check'
import { isCustomTool, isMcpTool } from '@/executor/constants'
import { resolveSkillContent } from '@/executor/handlers/agent/skills-resolver'
import type { ExecutionContext, UserFile } from '@/executor/types'
import type { ErrorInfo } from '@/tools/error-extractors'
import { extractErrorMessage } from '@/tools/error-extractors'
import { getImageGenerationWrapperBaseToolId } from '@/tools/image_generation/wrapper-ids'
import type {
  BYOKProviderId,
  OAuthTokenPayload,
  ToolConfig,
  ToolHostingPricing,
  ToolResponse,
  ToolRetryConfig,
} from '@/tools/types'
import {
  formatRequestParams,
  getTool,
  resolveToolId,
  safeStringify,
  validateRequiredParametersAfterMerge,
} from '@/tools/utils'
import * as toolsUtilsServer from '@/tools/utils.server'

const logger = createLogger('Tools')

interface ToolExecutionScope {
  workspaceId?: string
  workflowId?: string
  userId?: string
  executionId?: string
  callChain?: string[]
  isDeployedContext?: boolean
  enforceCredentialAccess?: boolean
  copilotToolExecution?: boolean
}

async function executeNanoBananaDirect(params: Record<string, any>): Promise<ToolResponse> {
  logger.info('Running Nano Banana generation in-process')
  const inputImages = Array.isArray(params.inputImages) ? params.inputImages : undefined
  const { toolResponse } = await generateNanoBananaImage({
    model: params.model ?? '',
    prompt: params.prompt ?? '',
    aspectRatio: params.aspectRatio,
    imageSize: params.imageSize,
    inputImage: inputImages?.length
      ? undefined
      : stripInlinePayloadFromFileReference(params.inputImage),
    inputImageMimeType: params.inputImageMimeType,
    inputImages: inputImages?.map(stripInlinePayloadFromFileReference),
    _context: params._context,
  })
  return toolResponse
}

async function executeImageGenerateDirect(params: Record<string, any>): Promise<ToolResponse> {
  if (params.__skipSmartWrapper === true) {
    logger.info('Running direct image generation provider in-process')
    const { buildImageToolBodyFromExecutionParams, runImageToolGeneration } = await import(
      '@/lib/image-generation/run-image-tool.server'
    )

    const context = params._context as { userId?: string } | undefined
    const userId =
      context?.userId ??
      (typeof params.userId === 'string' ? params.userId : undefined) ??
      (typeof params.sessionUserId === 'string' ? params.sessionUserId : undefined)

    if (!userId) {
      return {
        success: false,
        output: {},
        error: 'Missing userId for image generation',
      }
    }

    try {
      const body = buildImageToolBodyFromExecutionParams(params as Record<string, unknown>)
      const output = await runImageToolGeneration(body, { userId })
      return {
        success: true,
        output: { ...output },
      }
    } catch (error) {
      return {
        success: false,
        output: {},
        error: getErrorMessage(error, 'Image generation failed'),
      }
    }
  }

  logger.info('Running image generation wrapper in-process')
  const { runImageGenerationWrapper } = await import('@/lib/image-generation/run-wrapper.server')
  const result = await runImageGenerationWrapper({
    baseToolId: 'image_generate',
    params: sanitizeImageGenerationWrapperParams(params as Record<string, unknown>),
  })

  if (!result.success) {
    return {
      success: false,
      output: {},
      error: result.error,
    }
  }

  return {
    success: true,
    output: result.output,
  }
}

async function executeOpenAIImageDirect(params: Record<string, any>): Promise<ToolResponse> {
  return generateOpenAIImageToolResponse(params as Record<string, unknown>)
}

async function executeImageGenerationWrapperV2Direct(
  toolId: string,
  params: Record<string, any>
): Promise<ToolResponse> {
  const baseToolId = getImageGenerationWrapperBaseToolId(toolId)
  if (!baseToolId) {
    return {
      success: false,
      output: {},
      error: `Unknown image generation wrapper: ${toolId}`,
    }
  }

  logger.info('Running image generation wrapper in-process', { toolId, baseToolId })
  const { runImageGenerationWrapper } = await import('@/lib/image-generation/run-wrapper.server')
  const result = await runImageGenerationWrapper({
    baseToolId,
    params: sanitizeImageGenerationWrapperParams(params as Record<string, unknown>),
  })

  if (!result.success) {
    return {
      success: false,
      output: {},
      error: result.error,
    }
  }

  return {
    success: true,
    output: result.output,
  }
}

async function executeDevelopmentGenerateAppDirect(
  params: Record<string, any>
): Promise<ToolResponse> {
  const [{ generateNextjsApp }, { mapGenerateAppResultToToolResponse }] = await Promise.all([
    import('@/lib/development/nextjs-app-generator'),
    import('@/tools/development/map-generate-app-response'),
  ])
  return mapGenerateAppResultToToolResponse(
    await generateNextjsApp({
      userInput: params.userInput,
      repoName: params.repoName,
      privateRepo: params.privateRepo,
    })
  )
}

async function executeDevelopmentEditAppDirect(params: Record<string, any>): Promise<ToolResponse> {
  const [{ editNextjsApp }, { mapGenerateAppResultToToolResponse }] = await Promise.all([
    import('@/lib/development/nextjs-app-generator'),
    import('@/tools/development/map-generate-app-response'),
  ])
  return mapGenerateAppResultToToolResponse(
    await editNextjsApp({
      userInput: params.userInput,
      repoName: params.repoName,
      referenceImage: params.referenceImage,
    })
  )
}

function resolveToolScope(
  params: Record<string, unknown>,
  executionContext?: ExecutionContext
): ToolExecutionScope {
  const ctx = params._context as Record<string, unknown> | undefined
  return {
    workspaceId: (executionContext?.workspaceId ?? ctx?.workspaceId) as string | undefined,
    workflowId: (executionContext?.workflowId ?? ctx?.workflowId) as string | undefined,
    userId: (executionContext?.userId ?? ctx?.userId) as string | undefined,
    executionId: (executionContext?.executionId ?? ctx?.executionId) as string | undefined,
    callChain: (executionContext?.callChain ?? ctx?.callChain) as string[] | undefined,
    isDeployedContext: (executionContext?.isDeployedContext ?? ctx?.isDeployedContext) as
      | boolean
      | undefined,
    enforceCredentialAccess: (executionContext?.enforceCredentialAccess ??
      ctx?.enforceCredentialAccess) as boolean | undefined,
    copilotToolExecution: (executionContext?.copilotToolExecution ?? ctx?.copilotToolExecution) as
      | boolean
      | undefined,
  }
}

function toUserFileFromWorkspaceRecord(record: {
  id: string
  name: string
  path: string
  url?: string
  size: number
  type: string
  key: string
}): UserFile {
  return {
    id: record.id,
    name: record.name,
    url: record.url ?? record.path,
    size: record.size,
    type: record.type,
    key: record.key,
    context: 'workspace',
  }
}

async function resolveCopilotFileReference(
  value: unknown,
  workspaceId: string,
  paramId: string
): Promise<UserFile | unknown> {
  if (isUserFile(value)) {
    return value
  }

  const referenceId =
    typeof value === 'string'
      ? value
      : value &&
          typeof value === 'object' &&
          typeof (value as Record<string, unknown>).id === 'string'
        ? ((value as Record<string, unknown>).id as string)
        : null

  if (!referenceId) {
    return value
  }

  const fileRecord = await resolveWorkspaceFileReference(workspaceId, referenceId)
  if (!fileRecord) {
    throw new Error(
      `Could not resolve workspace file reference "${referenceId}" for parameter "${paramId}"`
    )
  }

  const resolvedFile = toUserFileFromWorkspaceRecord(fileRecord)
  if (!value || typeof value !== 'object') {
    return resolvedFile
  }

  const candidate = value as Record<string, unknown>
  return {
    ...resolvedFile,
    context: typeof candidate.context === 'string' ? candidate.context : resolvedFile.context,
    base64: typeof candidate.base64 === 'string' ? candidate.base64 : undefined,
  }
}

async function normalizeCopilotFileParams(
  tool: ToolConfig,
  params: Record<string, unknown>,
  scope: ToolExecutionScope
): Promise<void> {
  if (!scope.copilotToolExecution) {
    return
  }

  for (const [paramId, paramDef] of Object.entries(tool.params || {})) {
    const paramType = paramDef?.type
    const currentValue = params[paramId]
    if (currentValue === undefined || currentValue === null) {
      continue
    }

    if (paramType === 'file') {
      if (!scope.workspaceId) {
        throw new Error(`Missing workspaceId while resolving file parameter "${paramId}"`)
      }
      params[paramId] = await resolveCopilotFileReference(currentValue, scope.workspaceId, paramId)
      continue
    }

    if (paramType === 'file[]') {
      if (!scope.workspaceId) {
        throw new Error(`Missing workspaceId while resolving file parameter "${paramId}"`)
      }

      const values = Array.isArray(currentValue) ? currentValue : [currentValue]
      params[paramId] = await Promise.all(
        values.map((item) => resolveCopilotFileReference(item, scope.workspaceId!, paramId))
      )
    }
  }
}

function readExplicitCredentialSelector(params: Record<string, unknown>): string | undefined {
  for (const key of ['credentialId', 'oauthCredential', 'credential'] as const) {
    const value = params[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }
  return undefined
}

function normalizeCopilotCredentialParams(params: Record<string, unknown>): void {
  const credentialId = typeof params.credentialId === 'string' ? params.credentialId.trim() : ''
  if (credentialId && !params.credential && !params.oauthCredential) {
    params.credential = credentialId
  }
}

function enforceCopilotCredentialSelection(
  toolId: string,
  tool: ToolConfig,
  params: Record<string, unknown>,
  scope: ToolExecutionScope
): void {
  if (!scope.copilotToolExecution || !tool.oauth?.required) {
    return
  }

  if (readExplicitCredentialSelector(params)) {
    return
  }

  const toolLabel = tool.name || toolId
  throw new Error(
    `Copilot must pass credentialId for ${toolLabel}. Read environment/credentials.json and pass the exact credentialId for provider "${tool.oauth.provider}".`
  )
}

/** Result from hosted key injection */
interface HostedKeyInjectionResult {
  isUsingHostedKey: boolean
  envVarName?: string
}

/**
 * Fills `credential` when an OAuth tool runs without one (e.g. integration nested in an agent)
 * using the runner's first accessible workspace credential for the tool's provider.
 */
async function injectOAuthCredentialFromUserContextIfNeeded(
  tool: ToolConfig,
  params: Record<string, any>,
  executionContext: ExecutionContext | undefined,
  requestId: string
): Promise<void> {
  if (typeof window !== 'undefined') return
  const oauth = tool.oauth
  if (!oauth?.required || !oauth.provider) return
  const pick = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  if (
    pick(params.credential) ||
    pick(params.oauthCredential) ||
    pick(params.credentialId) ||
    pick(params.accessToken) ||
    pick(params.botToken)
  ) {
    if (pick(params.accessToken) || pick(params.botToken)) {
      logger.info(
        `[${requestId}] Using user-supplied token for ${tool.id}; skipping OAuth auto-resolve`
      )
    }
    return
  }
  const ctx = params._context as { userId?: string; workspaceId?: string } | undefined
  const userId = executionContext?.userId ?? ctx?.userId
  const workspaceId = executionContext?.workspaceId ?? ctx?.workspaceId
  if (!userId || !workspaceId) return
  try {
    const accessible = await getAccessibleOAuthCredentials(workspaceId, userId)
    const match = accessible.find((c) => c.providerId === oauth.provider)
    if (!match) return
    params.credential = match.id
    logger.info(`[${requestId}] Auto-resolved OAuth credential for ${tool.id}`, {
      provider: oauth.provider,
      credentialId: match.id,
    })
  } catch (error) {
    logger.warn(`[${requestId}] Failed to auto-resolve OAuth credential for ${tool.id}`, {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Resolves workspace credential UUIDs to external Unipile account ids for tool routes.
 */
async function injectUnipileAccountIdFromCredentialIfNeeded(
  params: Record<string, unknown>,
  requestId: string
): Promise<void> {
  const pick = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const raw =
    pick(params.account_id) ||
    pick(params.unipileCredential) ||
    pick(params.oauthCredential) ||
    pick(params.credential)
  if (!raw) return

  if (!isValidUuid(raw)) {
    params.account_id = raw
    return
  }

  const externalId = await resolveUnipileExternalAccountId(raw)
  if (!externalId) {
    logger.warn(`[${requestId}] Could not resolve Unipile account for credential`, {
      credentialId: raw,
    })
    return
  }

  params.account_id = externalId
  logger.info(`[${requestId}] Resolved Unipile account_id for credential`, {
    credentialId: raw,
  })
}

/**
 * Inject hosted API key if tool supports it and user didn't provide one.
 * Checks BYOK workspace keys first, then uses the HostedKeyRateLimiter for round-robin key selection.
 * Returns whether a hosted (billable) key was injected and which env var it came from.
 */
async function injectHostedKeyIfNeeded(
  tool: ToolConfig,
  params: Record<string, unknown>,
  executionContext: ExecutionContext | undefined,
  requestId: string
): Promise<HostedKeyInjectionResult> {
  if (!tool.hosting) return { isUsingHostedKey: false }
  if (!isHosted) return { isUsingHostedKey: false }
  if (tool.hosting.enabled && !tool.hosting.enabled(params)) {
    return { isUsingHostedKey: false }
  }

  const { envKeyPrefix, apiKeyParam, byokProviderId, rateLimit } = tool.hosting
  const userProvidedKey = params[apiKeyParam]
  if (typeof userProvidedKey === 'string' && userProvidedKey.trim().length > 0) {
    return { isUsingHostedKey: false }
  }

  const { workspaceId, userId, workflowId } = resolveToolScope(params, executionContext)

  // Check BYOK workspace key first
  if (byokProviderId && workspaceId) {
    try {
      const byokResult = await getBYOKKey(workspaceId, byokProviderId as BYOKProviderId)
      if (byokResult) {
        params[apiKeyParam] = byokResult.apiKey
        logger.info(`[${requestId}] Using BYOK key for ${tool.id}`)
        return { isUsingHostedKey: false } // Don't bill - user's own key
      }
    } catch (error) {
      logger.error(`[${requestId}] Failed to get BYOK key for ${tool.id}:`, error)
      // Fall through to hosted key
    }
  }

  const rateLimiter = getHostedKeyRateLimiter()
  const provider = byokProviderId || tool.id
  const billingActorId = workspaceId

  if (!billingActorId) {
    logger.error(`[${requestId}] No workspace ID available for hosted key rate limiting`)
    return { isUsingHostedKey: false }
  }

  const acquireResult = await rateLimiter.acquireKey(
    provider,
    envKeyPrefix,
    rateLimit,
    billingActorId,
    executionContext?.abortSignal
  )

  if (!acquireResult.success && acquireResult.billingActorRateLimited) {
    logger.warn(`[${requestId}] Billing actor ${billingActorId} rate limited for ${tool.id}`, {
      provider,
      retryAfterMs: acquireResult.retryAfterMs,
    })

    PlatformEvents.hostedKeyUserThrottled({
      toolId: tool.id,
      reason: 'billing_actor_limit',
      provider,
      retryAfterMs: acquireResult.retryAfterMs ?? 0,
      userId,
      workspaceId,
      workflowId,
    })

    const error = new Error(acquireResult.error || `Rate limit exceeded for ${tool.id}`)
    ;(error as any).status = 429
    ;(error as any).retryAfterMs = acquireResult.retryAfterMs
    throw error
  }

  // Handle no keys configured (503)
  if (!acquireResult.success) {
    logger.error(`[${requestId}] No hosted keys configured for ${tool.id}: ${acquireResult.error}`)
    const error = new Error(acquireResult.error || `No hosted keys configured for ${tool.id}`)
    ;(error as any).status = 503
    throw error
  }

  params[apiKeyParam] = acquireResult.key
  params.__usingHostedKey = true
  logger.info(`[${requestId}] Using hosted key for ${tool.id} (${acquireResult.envVarName})`, {
    keyIndex: acquireResult.keyIndex,
    provider,
  })

  return {
    isUsingHostedKey: true,
    envVarName: acquireResult.envVarName,
  }
}

/**
 * Re-acquire a hosted key after upstream-429 retries have been exhausted. Calls
 * `acquireKey` (which now blocks on the per-workspace bucket) and re-injects the
 * fresh key into `params`. Returns false if no key could be obtained — caller
 * should re-throw the original upstream 429.
 *
 * Does not consult BYOK. We only enter this path from inside the hosted-key
 * branch of `executeTool`, so BYOK has already been ruled out for this call.
 */
async function reacquireHostedKey(
  tool: ToolConfig,
  params: Record<string, unknown>,
  executionContext: ExecutionContext | undefined,
  requestId: string
): Promise<string | null> {
  if (!tool.hosting) return null
  const { envKeyPrefix, apiKeyParam, byokProviderId, rateLimit } = tool.hosting
  const { workspaceId } = resolveToolScope(params, executionContext)
  if (!workspaceId) return null

  const provider = byokProviderId || tool.id
  const acquireResult = await getHostedKeyRateLimiter().acquireKey(
    provider,
    envKeyPrefix,
    rateLimit,
    workspaceId,
    executionContext?.abortSignal
  )

  if (!acquireResult.success || !acquireResult.key) {
    logger.warn(
      `[${requestId}] Re-acquire of hosted key for ${tool.id} failed: ${acquireResult.error ?? 'unknown'}`
    )
    return null
  }

  params[apiKeyParam] = acquireResult.key
  logger.info(
    `[${requestId}] Re-acquired hosted key for ${tool.id} (${acquireResult.envVarName}) after upstream throttling`
  )
  return acquireResult.envVarName ?? 'unknown'
}

/**
 * Check if an error is a rate limit (throttling) or quota exhaustion error.
 * Some providers (e.g. Perplexity) return 401/403 with "insufficient_quota"
 * instead of the standard 429, so we also inspect the error message.
 */
function isRateLimitError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const status = (error as { status?: number }).status
    if (status === 429 || status === 503) return true

    if (status === 401 || status === 403) {
      const message = ((error as { message?: string }).message || '').toLowerCase()
      if (message.includes('quota') || message.includes('rate limit')) {
        return true
      }
    }
  }
  return false
}

/**
 * Map a thrown tool error to a hosted-key failure reason for metrics. Mirrors
 * `isRateLimitError`: some providers signal quota/rate-limit via 401/403 with a
 * descriptive message, so those count as `rate_limited`, not `auth`.
 */
function classifyHostedKeyFailure(error: unknown): 'rate_limited' | 'auth' | 'other' {
  const status = (error as { status?: number } | null)?.status
  if (status === 429 || status === 503) return 'rate_limited'
  if (status === 401 || status === 403) {
    const message = ((error as { message?: string } | null)?.message ?? '').toLowerCase()
    if (message.includes('quota') || message.includes('rate limit')) return 'rate_limited'
    return 'auth'
  }
  return 'other'
}

/** Context for retry with rate limit tracking */
interface RetryContext {
  requestId: string
  toolId: string
  provider: string
  envVarName: string
  executionContext?: ExecutionContext
  /**
   * Optional callback invoked after the local exponential backoff has been exhausted by
   * upstream 429s. Should re-enter the per-workspace hosted-key queue (which now blocks
   * on the bucket) and return a fresh execution thunk bound to the newly acquired key.
   * If the callback returns null, we give up and re-throw the last error.
   */
  reacquireAfterRetriesExhausted?: () => Promise<(() => Promise<unknown>) | null>
}

/**
 * Execute a function with exponential backoff retry for rate limiting errors.
 * Only used for hosted key requests. Tracks rate limit events via telemetry.
 *
 * On terminal upstream 429, optionally re-enters the hosted-key queue (which waits for
 * the per-workspace bucket to refill) and retries once with a freshly acquired key.
 * This handles the case where the upstream provider's limit is tighter than ours — we
 * re-queue the call instead of surfacing the error.
 */
async function executeWithRetry<T>(
  fn: () => Promise<T>,
  context: RetryContext,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<T> {
  const {
    requestId,
    toolId,
    provider,
    envVarName,
    executionContext,
    reacquireAfterRetriesExhausted,
  } = context
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      if (!isRateLimitError(error) || attempt === maxRetries) {
        if (isRateLimitError(error) && attempt === maxRetries) {
          if (reacquireAfterRetriesExhausted) {
            try {
              const requeued = await reacquireAfterRetriesExhausted()
              if (requeued) {
                logger.warn(
                  `[${requestId}] Upstream retries exhausted for ${toolId} (${envVarName}); re-queued and retrying once with fresh key`
                )
                return (await requeued()) as T
              }
            } catch (requeueError) {
              logger.error(
                `[${requestId}] Re-queue after exhausted upstream retries failed for ${toolId}`,
                { error: toError(requeueError).message }
              )
            }
          }

          PlatformEvents.hostedKeyUserThrottled({
            toolId,
            reason: 'upstream_retries_exhausted',
            provider,
            userId: executionContext?.userId,
            workspaceId: executionContext?.workspaceId,
            workflowId: executionContext?.workflowId,
          })
        }
        throw error
      }

      const delayMs = baseDelayMs * 2 ** attempt

      // Track throttling event via telemetry
      PlatformEvents.hostedKeyRateLimited({
        toolId,
        envVarName,
        attempt: attempt + 1,
        maxRetries,
        delayMs,
        userId: executionContext?.userId,
        workspaceId: executionContext?.workspaceId,
        workflowId: executionContext?.workflowId,
      })

      logger.warn(
        `[${requestId}] Rate limited for ${toolId} (${envVarName}), retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`
      )
      await sleep(delayMs)
    }
  }

  throw lastError
}

/** Result from cost calculation */
interface ToolCostResult {
  cost: number
  metadata?: Record<string, unknown>
}

/**
 * Calculate cost based on pricing model
 */
function calculateToolCost(
  pricing: ToolHostingPricing,
  params: Record<string, unknown>,
  response: Record<string, unknown>
): ToolCostResult {
  switch (pricing.type) {
    case 'per_request':
      return { cost: pricing.cost }

    case 'custom': {
      const result = pricing.getCost(params, response)
      if (typeof result === 'number') {
        return { cost: result }
      }
      return result
    }

    default: {
      const exhaustiveCheck: never = pricing
      throw new Error(`Unknown pricing type: ${(exhaustiveCheck as ToolHostingPricing).type}`)
    }
  }
}

interface HostedKeyCostResult {
  cost: number
  metadata?: Record<string, unknown>
}

/**
 * Calculate and log hosted key cost for a tool execution.
 * Logs to usageLog for audit trail and returns cost + metadata for output.
 */
async function processHostedKeyCost(
  tool: ToolConfig,
  params: Record<string, unknown>,
  response: Record<string, unknown>,
  executionContext: ExecutionContext | undefined,
  requestId: string
): Promise<HostedKeyCostResult> {
  if (!tool.hosting?.pricing) {
    return { cost: 0 }
  }

  const { cost, metadata } = calculateToolCost(tool.hosting.pricing, params, response)

  if (cost <= 0) return { cost: 0 }

  const { userId } = resolveToolScope(params, executionContext)

  if (!userId) return { cost, metadata }

  logger.debug(
    `[${requestId}] Hosted key cost for ${tool.id}: $${cost}`,
    metadata ? { metadata } : {}
  )

  return { cost, metadata }
}

/**
 * Report custom dimension usage after successful hosted-key tool execution.
 * Only applies to tools with `custom` rate limit mode. Fires and logs;
 * failures here do not block the response since execution already succeeded.
 */
async function reportCustomDimensionUsage(
  tool: ToolConfig,
  params: Record<string, unknown>,
  response: Record<string, unknown>,
  executionContext: ExecutionContext | undefined,
  requestId: string
): Promise<void> {
  if (tool.hosting?.rateLimit.mode !== 'custom') return
  const { workspaceId: billingActorId } = resolveToolScope(params, executionContext)
  if (!billingActorId) return

  const rateLimiter = getHostedKeyRateLimiter()
  const provider = tool.hosting.byokProviderId || tool.id

  try {
    const result = await rateLimiter.reportUsage(
      provider,
      billingActorId,
      tool.hosting.rateLimit,
      params,
      response
    )

    for (const dim of result.dimensions) {
      if (!dim.allowed) {
        logger.warn(`[${requestId}] Dimension ${dim.name} overdrawn after ${tool.id} execution`, {
          consumed: dim.consumed,
          tokensRemaining: dim.tokensRemaining,
        })
      }
    }
  } catch (error) {
    logger.error(`[${requestId}] Failed to report custom dimension usage for ${tool.id}:`, error)
  }
}

/**
 * Strips internal fields (keys starting with `__`) from tool output before
 * returning to users. The double-underscore prefix is reserved for transient
 * data (e.g. `__costDollars`) and will never collide with legitimate API
 * fields like `_id`.
 */
function stripInternalFields(output: Record<string, unknown>): Record<string, unknown> {
  if (typeof output !== 'object' || output === null || Array.isArray(output)) {
    return output
  }
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(output)) {
    if (!key.startsWith('__')) {
      result[key] = value
    }
  }
  return result
}

export function postProcessToolOutput(toolId: string, output: Record<string, unknown>) {
  return isCustomTool(toolId) ? output : stripInternalFields(output)
}

/**
 * Apply post-execution hosted-key cost tracking to a successful tool result.
 * Reports custom dimension usage, calculates cost, and merges it into the output.
 */
async function applyHostedKeyCostToResult(
  finalResult: ToolResponse,
  tool: ToolConfig,
  params: Record<string, unknown>,
  executionContext: ExecutionContext | undefined,
  requestId: string,
  envVarName: string | undefined
): Promise<void> {
  await reportCustomDimensionUsage(tool, params, finalResult.output, executionContext, requestId)

  const { cost: hostedKeyCost, metadata } = await processHostedKeyCost(
    tool,
    params,
    finalResult.output,
    executionContext,
    requestId
  )

  const provider = tool.hosting?.byokProviderId || tool.id
  const key = envVarName ?? 'unknown'
  hostedKeyMetrics.recordUsed({ provider, tool: tool.id, key })
  hostedKeyMetrics.recordCostCharged(hostedKeyCost, { provider, tool: tool.id })

  if (hostedKeyCost > 0) {
    finalResult.output = {
      ...finalResult.output,
      cost: {
        ...metadata,
        total: hostedKeyCost,
      },
    }
  }
}

import { normalizeToolId } from '@/tools/normalize'

/**
 * Maximum request body sizes before we fail with a clear error.
 * Internal Next.js routes can reject/truncate JSON bodies around 10MB, which otherwise
 * surfaces as "Unterminated string in JSON" when large inline images are posted.
 */
const INTERNAL_ROUTE_MAX_REQUEST_BODY_SIZE_BYTES = 9.5 * 1024 * 1024
const MAX_REQUEST_BODY_SIZE_BYTES = 100 * 1024 * 1024 // 10MB
const MAX_TOOL_RESPONSE_BODY_BYTES = 10 * 1024 * 1024 // 10MB

/**
 * User-friendly error message for body size limit exceeded
 */
const BODY_SIZE_LIMIT_ERROR_MESSAGE =
  'Request body size limit exceeded. The workflow data is too large to process. Try reducing the size of variables, inputs, or data being passed between blocks. For image generation, upload reference images as files or use image URLs instead of inline base64 data.'

const RESPONSE_SIZE_LIMIT_ERROR_MESSAGE =
  'Tool response size limit exceeded (10MB). The response is too large to keep in workflow data. Reduce the response size or return a file reference instead.'

/**
 * Validates request body size and throws a user-friendly error if exceeded
 * @param body - The request body string to check
 * @param requestId - Request ID for logging
 * @param context - Context string for logging (e.g., toolId)
 * @throws Error if body size exceeds the limit
 */
function validateRequestBodySize(
  body: string | undefined,
  requestId: string,
  context: string,
  maxSizeBytes = MAX_REQUEST_BODY_SIZE_BYTES
): void {
  if (!body) return

  const bodySize = Buffer.byteLength(body, 'utf8')
  if (bodySize > maxSizeBytes) {
    const bodySizeMB = (bodySize / (1024 * 1024)).toFixed(2)
    const maxSizeMB = (maxSizeBytes / (1024 * 1024)).toFixed(1)
    logger.error(`[${requestId}] Request body size exceeds limit for ${context}:`, {
      bodySize,
      bodySizeMB: `${bodySizeMB}MB`,
      maxSize: maxSizeBytes,
      maxSizeMB: `${maxSizeMB}MB`,
    })
    throw new Error(BODY_SIZE_LIMIT_ERROR_MESSAGE)
  }
}

/**
 * Checks if an error message indicates a body size limit issue
 * @param errorMessage - The error message to check
 * @returns true if the error is related to body size limits
 */
function isBodySizeLimitError(errorMessage: string): boolean {
  const lowerMessage = errorMessage.toLowerCase()
  return (
    lowerMessage.includes('body size') ||
    lowerMessage.includes('payload too large') ||
    lowerMessage.includes('entity too large') ||
    lowerMessage.includes('request entity too large') ||
    lowerMessage.includes('body_not_allowed') ||
    lowerMessage.includes('request body larger than')
  )
}

/**
 * Handles body size limit errors by logging and throwing a user-friendly error
 * @param error - The original error
 * @param requestId - Request ID for logging
 * @param context - Context string for logging (e.g., toolId)
 * @throws Error with user-friendly message if it's a size limit error
 * @returns false if not a size limit error (caller should continue handling)
 */
function handleBodySizeLimitError(error: unknown, requestId: string, context: string): boolean {
  const errorMessage = toError(error).message

  if (isBodySizeLimitError(errorMessage)) {
    logger.error(`[${requestId}] Request body size limit exceeded for ${context}:`, {
      originalError: errorMessage,
    })
    throw new Error(BODY_SIZE_LIMIT_ERROR_MESSAGE)
  }

  return false
}

function handleResponseSizeLimitError(error: unknown, requestId: string, context: string): boolean {
  if (!isPayloadSizeLimitError(error)) return false

  logger.error(`[${requestId}] Response body size limit exceeded for ${context}:`, {
    label: error.label,
    maxBytes: error.maxBytes,
    observedBytes: error.observedBytes,
  })
  throw new Error(RESPONSE_SIZE_LIMIT_ERROR_MESSAGE)
}

function cloneResponseHeaders(headers: Headers | HeadersInit | undefined): Headers {
  const clonedHeaders = new Headers()
  if (!headers) return clonedHeaders

  if (typeof (headers as Headers).forEach === 'function') {
    ;(headers as Headers).forEach((value, key) => {
      clonedHeaders.set(key, value)
    })
    return clonedHeaders
  }

  return new Headers(headers)
}

async function readToolResponseBody(
  response: {
    ok?: boolean
    headers?: { get(name: string): string | null }
    body?: ReadableStream<Uint8Array> | null
    arrayBuffer?: () => Promise<ArrayBuffer>
    text?: () => Promise<string>
  },
  options: {
    requestId: string
    toolId: string
    signal?: AbortSignal
  }
): Promise<Buffer> {
  try {
    return await readResponseToBufferWithLimit(response, {
      maxBytes: MAX_TOOL_RESPONSE_BODY_BYTES,
      label: `${options.toolId} response body`,
      signal: options.signal,
      allowNoBodyFallback: true,
    })
  } catch (error) {
    if (isPayloadSizeLimitError(error) || response.ok !== false) {
      throw error
    }

    logger.warn(
      `[${options.requestId}] Failed to read non-OK response body for ${options.toolId}`,
      {
        error: toError(error).message,
      }
    )
    return Buffer.alloc(0)
  }
}

/**
 * System parameters that should be filtered out when extracting tool arguments
 * These are internal parameters used by the execution framework, not tool inputs
 */
const MCP_SYSTEM_PARAMETERS = new Set([
  'serverId',
  'serverUrl',
  'toolName',
  'serverName',
  '_context',
  'envVars',
  'workflowVariables',
  'blockData',
  'blockNameMapping',
  '_toolSchema',
])

/**
 * Create an Error instance from errorInfo and attach useful context
 * Uses the error extractor registry to find the best error message
 */
function createTransformedErrorFromErrorInfo(errorInfo?: ErrorInfo, extractorId?: string): Error {
  const message = extractErrorMessage(errorInfo, extractorId)
  const transformed = new Error(message)
  Object.assign(transformed, {
    status: errorInfo?.status,
    statusText: errorInfo?.statusText,
    data: errorInfo?.data,
  })
  return transformed
}

/**
 * Process file outputs for a tool result if execution context is available
 * Uses dynamic imports to avoid client-side bundling issues
 */
async function processFileOutputs(
  result: ToolResponse,
  tool: ToolConfig,
  executionContext?: ExecutionContext
): Promise<ToolResponse> {
  // Skip file processing if no execution context or not successful
  if (!executionContext || !result.success) {
    return result
  }

  // Skip file processing on client-side (no Node.js modules available)
  if (typeof window !== 'undefined') {
    return result
  }

  try {
    // Dynamic import to avoid client-side bundling issues
    const { FileToolProcessor } = await import('@/executor/utils/file-tool-processor')

    // Check if tool has file outputs
    if (!FileToolProcessor.hasFileOutputs(tool)) {
      return result
    }

    const processedOutput = await FileToolProcessor.processToolOutputs(
      result.output,
      tool,
      executionContext
    )

    return {
      ...result,
      output: processedOutput,
    }
  } catch (error) {
    logger.error(`Error processing file outputs for tool ${tool.id}:`, error)
    // Return original result if file processing fails
    return result
  }
}

export interface ExecuteToolOptions {
  skipPostProcess?: boolean
  executionContext?: ExecutionContext
  signal?: AbortSignal
}

/**
 * Execute a tool by making the appropriate HTTP request
 * All requests go directly - internal routes use regular fetch, external use SSRF-protected fetch
 */
export async function executeTool(
  toolId: string,
  params: Record<string, any>,
  options: ExecuteToolOptions = {}
): Promise<ToolResponse> {
  const { skipPostProcess = false, executionContext, signal } = options
  // Fall back to the workflow execution's abort signal so plan-based execution timeouts
  // and cancellation propagate to tool fetches when the caller passes no explicit signal.
  const effectiveSignal = signal ?? executionContext?.abortSignal
  // Capture start time for precise timing
  const startTime = new Date()
  const startTimeISO = startTime.toISOString()
  const requestId = generateRequestId()

  // Hoisted so the outer catch can attribute a thrown failure to the chosen key.
  let hostedKeyForMetrics: { provider: string; tool: string; key: string } | undefined

  try {
    let tool: ToolConfig | undefined

    // Normalize tool ID to strip resource suffixes (e.g., workflow_executor_<uuid> -> workflow_executor)
    const normalizedToolId = normalizeToolId(toolId)

    const scope = resolveToolScope(params, executionContext)

    const toolKind: 'skill' | 'custom' | 'mcp' | undefined =
      normalizedToolId === 'load_skill' || normalizedToolId === 'load_user_skill'
        ? 'skill'
        : isCustomTool(normalizedToolId)
          ? 'custom'
          : isMcpTool(normalizedToolId)
            ? 'mcp'
            : undefined

    if (toolKind && scope.userId && scope.workspaceId) {
      await assertPermissionsAllowed({
        userId: scope.userId,
        workspaceId: scope.workspaceId,
        toolKind,
        ctx: executionContext,
      })
    }

    if (normalizedToolId === 'load_skill' || normalizedToolId === 'load_user_skill') {
      const skillName = params.skill_name
      if (!skillName || !scope.workspaceId) {
        return {
          success: false,
          output: { error: 'Missing skill_name or workspace context' },
          error: 'Missing skill_name or workspace context',
        }
      }
      const content = await resolveSkillContent(skillName, scope.workspaceId)
      if (!content) {
        return {
          success: false,
          output: { error: `Skill "${skillName}" not found` },
          error: `Skill "${skillName}" not found`,
        }
      }
      return {
        success: true,
        output: { content },
      }
    }

    if (isCustomTool(normalizedToolId)) {
      tool = await toolsUtilsServer.getToolAsync(normalizedToolId, {
        workflowId: scope.workflowId,
        userId: scope.userId,
        workspaceId: scope.workspaceId,
      })
      if (!tool) {
        logger.error(`[${requestId}] Custom tool not found: ${normalizedToolId}`)
      }
    } else if (isMcpTool(normalizedToolId)) {
      return await executeMcpTool(
        normalizedToolId,
        params,
        executionContext,
        requestId,
        startTimeISO,
        effectiveSignal
      )
    } else {
      // Copilot/mothership agent schemas omit `_vN`; canvas blocks serialize exact registry ids.
      const registryToolId = scope.copilotToolExecution
        ? resolveToolId(normalizedToolId)
        : normalizedToolId
      tool = getTool(registryToolId)
      if (!tool) {
        logger.error(
          `[${requestId}] Built-in tool not found: ${normalizedToolId}${registryToolId !== normalizedToolId ? ` (resolved: ${registryToolId})` : ''}`
        )
      }
    }

    // Ensure context is preserved if it exists
    const contextParams = { ...params }

    if (tool) {
      await injectOAuthCredentialFromUserContextIfNeeded(
        tool,
        contextParams,
        executionContext,
        requestId
      )
    }

    // Validate the tool and its parameters
    validateRequiredParametersAfterMerge(toolId, tool, contextParams)

    // After validation, we know tool exists
    if (!tool) {
      throw new Error(`Tool not found: ${toolId}`)
    }

    await normalizeCopilotFileParams(tool, contextParams, scope)
    normalizeCopilotCredentialParams(contextParams)
    enforceCopilotCredentialSelection(toolId, tool, contextParams, scope)

    if (normalizedToolId.startsWith('unipile_')) {
      await injectUnipileAccountIdFromCredentialIfNeeded(contextParams, requestId)
    }

    // Inject hosted API key if tool supports it and user didn't provide one
    const hostedKeyInfo = await injectHostedKeyIfNeeded(
      tool,
      contextParams,
      executionContext,
      requestId
    )

    if (hostedKeyInfo.isUsingHostedKey) {
      hostedKeyForMetrics = {
        provider: tool.hosting?.byokProviderId || tool.id,
        tool: tool.id,
        key: hostedKeyInfo.envVarName ?? 'unknown',
      }
    }

    // If we have a credential parameter, fetch the access token
    if (contextParams.oauthCredential) {
      contextParams.credential = contextParams.oauthCredential
    }
    if (contextParams.credential) {
      logger.info(
        `[${requestId}] Tool ${toolId} needs access token for credential: ${contextParams.credential}`
      )
      try {
        const baseUrl = getInternalApiBaseUrl()

        const workflowId = contextParams._context?.workflowId
        const userId = contextParams._context?.userId

        const tokenPayload: OAuthTokenPayload = {
          credentialId: contextParams.credential as string,
        }
        if (workflowId) {
          tokenPayload.workflowId = workflowId
        }
        if (contextParams.impersonateUserEmail) {
          tokenPayload.impersonateEmail = contextParams.impersonateUserEmail as string
        }
        if (tool?.oauth?.provider) {
          const { getCanonicalScopesForProvider } = await import('@/lib/oauth/utils')
          const providerScopes = getCanonicalScopesForProvider(tool.oauth.provider)
          if (providerScopes.length > 0) {
            tokenPayload.scopes = providerScopes
          }
        }

        logger.info(`[${requestId}] Fetching access token from ${baseUrl}/api/auth/oauth/token`)

        const tokenUrlObj = new URL('/api/auth/oauth/token', baseUrl)
        if (workflowId) {
          tokenUrlObj.searchParams.set('workflowId', workflowId)
        }
        if (userId && contextParams._context?.enforceCredentialAccess) {
          tokenUrlObj.searchParams.set('userId', userId)
        }

        // Always send Content-Type; add internal auth on server-side runs
        const tokenHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
        if (typeof window === 'undefined') {
          try {
            const internalToken = await generateInternalToken(userId)
            tokenHeaders.Authorization = `Bearer ${internalToken}`
          } catch (_e) {
            // Swallow token generation errors; the request will fail and be reported upstream
          }
        }

        const response = await fetch(tokenUrlObj.toString(), {
          method: 'POST',
          headers: tokenHeaders,
          body: JSON.stringify(tokenPayload),
        })

        if (!response.ok) {
          const errorText = await response.text()
          logger.error(`[${requestId}] Token fetch failed for ${toolId}:`, {
            status: response.status,
            error: errorText,
          })
          let parsedError = errorText
          try {
            const parsed = JSON.parse(errorText)
            if (parsed.error) parsedError = parsed.error
          } catch {
            // Use raw text
          }
          const toolLabel = tool?.name || toolId
          throw new Error(`Failed to obtain credential for ${toolLabel}: ${parsedError}`)
        }

        const data = await response.json()

        // Check if tool requires user token instead of bot token.
        // Some blocks (e.g., Slack "Custom Bot") request user token via params.useUserToken.
        const useUserToken = Boolean(tool.oauth?.useUserToken || contextParams.useUserToken)
        const hasIdToken = data.idToken && data.idToken.trim() !== ''

        logger.info(`[${requestId}] Token selection debug for ${toolId}:`, {
          hasToolOauth: !!tool.oauth,
          useUserToken: useUserToken,
          hasIdToken: hasIdToken,
          idTokenLength: data.idToken ? data.idToken.length : 0,
          idTokenPrefix: data.idToken ? `${data.idToken.substring(0, 10)}...` : 'none',
          accessTokenPrefix: data.accessToken ? `${data.accessToken.substring(0, 10)}...` : 'none',
        })

        if (useUserToken && hasIdToken) {
          // Use user token for tools that require it
          contextParams.accessToken = data.idToken
          contextParams.userToken = data.idToken
          logger.info(
            `[${requestId}] Using user token for ${toolId} (${data.idToken.substring(0, 10)}...)`
          )
        } else {
          // Use bot token (default behavior)
          contextParams.accessToken = data.accessToken
          if (data.idToken) {
            contextParams.idToken = data.idToken
          }
          const tokenType = useUserToken && !hasIdToken ? 'user (fallback to bot)' : 'bot'
          logger.info(`[${requestId}] Using ${tokenType} token for ${toolId}`)
        }

        if (data.instanceUrl) {
          contextParams.instanceUrl = data.instanceUrl
        }
        if (data.cloudId && !contextParams.cloudId) {
          contextParams.cloudId = data.cloudId
        }
        if (data.domain && !contextParams.domain) {
          contextParams.domain = data.domain
        }

        // Avoid passing token-selection hints downstream.
        contextParams.useUserToken = undefined

        // Preserve credential for downstream transforms while removing it from request payload
        // so we don't leak it to external services.
        if (contextParams.credential) {
          ;(contextParams as any)._credentialId = contextParams.credential
        }
        if (workflowId) {
          ;(contextParams as any)._workflowId = workflowId
        }
        // Clean up params we don't need to pass to the actual tool
        contextParams.credential = undefined
        contextParams.impersonateUserEmail = undefined
        if (contextParams.workflowId) contextParams.workflowId = undefined
      } catch (error: any) {
        logger.error(`[${requestId}] Error fetching access token for ${toolId}:`, {
          error: toError(error).message,
        })
        throw error
      }
    }

    // Check for direct execution (no HTTP request needed)
    const wrapperBaseToolId = getImageGenerationWrapperBaseToolId(normalizedToolId)
    const directExecution =
    normalizedToolId === 'google_nano_banana'
      ? executeNanoBananaDirect
      : normalizedToolId === 'image_generate'
        ? executeImageGenerateDirect
        : normalizedToolId === 'openai_image'
          ? executeOpenAIImageDirect
          : wrapperBaseToolId
            ? (params: Record<string, any>) =>
                executeImageGenerationWrapperV2Direct(normalizedToolId, params)
      : normalizedToolId === 'development_generate_app'
        ? executeDevelopmentGenerateAppDirect
        : normalizedToolId === 'development_edit_app'
          ? executeDevelopmentEditAppDirect
          : tool.directExecution
    if (directExecution) {
      logger.info(`[${requestId}] Using directExecution for ${toolId}`)
      const result = await directExecution(contextParams)

      // Apply post-processing if available and not skipped
      let finalResult = result
      if (tool.postProcess && result.success && !skipPostProcess) {
        try {
          finalResult = await tool.postProcess(result, contextParams, executeTool)
        } catch (error) {
          logger.error(`[${requestId}] Post-processing error for ${toolId}:`, {
            error: toError(error).message,
          })
          finalResult = result
        }
      }

      // Process file outputs if execution context is available
      finalResult = await processFileOutputs(finalResult, tool, executionContext)

      // Add timing data to the result
      const endTime = new Date()
      const endTimeISO = endTime.toISOString()
      const duration = endTime.getTime() - startTime.getTime()

      if (hostedKeyInfo.isUsingHostedKey && finalResult.success) {
        await applyHostedKeyCostToResult(
          finalResult,
          tool,
          contextParams,
          executionContext,
          requestId,
          hostedKeyInfo.envVarName
        )
      } else if (hostedKeyForMetrics) {
        hostedKeyMetrics.recordFailed({ ...hostedKeyForMetrics, reason: 'other' })
      }

      const strippedOutput = postProcessToolOutput(normalizedToolId, finalResult.output ?? {})

      return {
        ...finalResult,
        output: strippedOutput,
        timing: {
          startTime: startTimeISO,
          endTime: endTimeISO,
          duration,
        },
      }
    }

    // Execute the tool request directly (internal routes use regular fetch, external use SSRF-protected fetch)
    // Wrap with retry logic for hosted keys to handle rate limiting due to higher usage
    const result = hostedKeyInfo.isUsingHostedKey
      ? await executeWithRetry(
          () => executeToolRequest(toolId, tool, contextParams, effectiveSignal),
          {
            requestId,
            toolId,
            provider: tool.hosting?.byokProviderId || tool.id,
            envVarName: hostedKeyInfo.envVarName!,
            executionContext,
            reacquireAfterRetriesExhausted: async () => {
              const reacquiredEnvVar = await reacquireHostedKey(
                tool,
                contextParams,
                executionContext,
                requestId
              )
              if (!reacquiredEnvVar) return null
              // Re-point metric labels at the freshly acquired key.
              hostedKeyInfo.envVarName = reacquiredEnvVar
              if (hostedKeyForMetrics) hostedKeyForMetrics.key = reacquiredEnvVar
              return () => executeToolRequest(toolId, tool, contextParams, effectiveSignal)
            },
          }
        )
      : await executeToolRequest(toolId, tool, contextParams, effectiveSignal)

    // Apply post-processing if available and not skipped
    let finalResult = result
    if (tool.postProcess && result.success && !skipPostProcess) {
      try {
        finalResult = await tool.postProcess(result, contextParams, executeTool)
      } catch (error) {
        logger.error(`[${requestId}] Post-processing error for ${toolId}:`, {
          error: toError(error).message,
        })
        finalResult = result
      }
    }

    // Process file outputs if execution context is available
    finalResult = await processFileOutputs(finalResult, tool, executionContext)

    // Add timing data to the result
    const endTime = new Date()
    const endTimeISO = endTime.toISOString()
    const duration = endTime.getTime() - startTime.getTime()

    if (hostedKeyInfo.isUsingHostedKey && finalResult.success) {
      await applyHostedKeyCostToResult(
        finalResult,
        tool,
        contextParams,
        executionContext,
        requestId,
        hostedKeyInfo.envVarName
      )
    } else if (hostedKeyForMetrics) {
      hostedKeyMetrics.recordFailed({ ...hostedKeyForMetrics, reason: 'other' })
    }

    const strippedOutput = postProcessToolOutput(normalizedToolId, finalResult.output ?? {})

    return {
      ...finalResult,
      output: strippedOutput,
      timing: {
        startTime: startTimeISO,
        endTime: endTimeISO,
        duration,
      },
    }
  } catch (error: any) {
    logger.error(`[${requestId}] Error executing tool ${toolId}:`, {
      error: toError(error).message,
      stack: error instanceof Error ? error.stack : undefined,
    })

    if (hostedKeyForMetrics) {
      hostedKeyMetrics.recordFailed({
        ...hostedKeyForMetrics,
        reason: classifyHostedKeyFailure(error),
      })
    }

    // Default error handling
    let errorMessage = 'Unknown error occurred'
    let errorDetails = {}

    if (error instanceof Error) {
      errorMessage = error.message || `Error executing tool ${toolId}`
      // HTTP errors are thrown as Error instances carrying `status`/`statusText`/
      // `data` (see createTransformedErrorFromErrorInfo). Surface them on the
      // output so callers can branch on the status (e.g. treat 404 as a clean
      // no-match) — the object branch below only ran for non-Error throws.
      const httpStatus = (error as { status?: unknown }).status
      if (typeof httpStatus === 'number') {
        errorDetails = {
          status: httpStatus,
          statusText: (error as { statusText?: string }).statusText,
          data: (error as { data?: unknown }).data,
        }
      }
    } else if (typeof error === 'string') {
      errorMessage = error
    } else if (error && typeof error === 'object') {
      // Handle HTTP response errors
      if (error.status) {
        errorMessage = `HTTP ${error.status}: ${error.statusText || 'Request failed'}`

        if (error.data) {
          if (typeof error.data === 'string') {
            errorMessage = `${errorMessage} - ${error.data}`
          } else if (error.data.message) {
            errorMessage = `${errorMessage} - ${error.data.message}`
          } else if (error.data.error) {
            errorMessage = `${errorMessage} - ${
              typeof error.data.error === 'string'
                ? error.data.error
                : JSON.stringify(error.data.error)
            }`
          }
        }

        errorDetails = {
          status: error.status,
          statusText: error.statusText,
          data: error.data,
        }
      }
      // Handle other errors with messages
      else if (error.message) {
        // Don't pass along "undefined (undefined)" messages
        if (error.message === 'undefined (undefined)') {
          errorMessage = `Error executing tool ${toolId}`
          // Add status if available
          if (error.status) {
            errorMessage += ` (Status: ${error.status})`
          }
        } else {
          errorMessage = error.message
        }

        if ((error as any).cause) {
          errorMessage = `${errorMessage} (${(error as any).cause})`
        }
      }
    }

    // Add timing data even for errors
    const endTime = new Date()
    const endTimeISO = endTime.toISOString()
    const duration = endTime.getTime() - startTime.getTime()
    return {
      success: false,
      output: errorDetails,
      error: errorMessage,
      timing: {
        startTime: startTimeISO,
        endTime: endTimeISO,
        duration,
      },
    }
  }
}

/**
 * Determines if a response or result represents an error condition
 */
function isErrorResponse(
  response: Response | any,
  data?: any
): { isError: boolean; errorInfo?: { status?: number; statusText?: string; data?: any } } {
  // HTTP Response object
  if (response && typeof response === 'object' && 'ok' in response) {
    if (!response.ok) {
      return {
        isError: true,
        errorInfo: {
          status: response.status,
          statusText: response.statusText,
          data: data,
        },
      }
    }
    return { isError: false }
  }

  // ToolResponse object
  if (response && typeof response === 'object' && 'success' in response) {
    return {
      isError: !response.success,
      errorInfo: response.success ? undefined : { data: response },
    }
  }

  // Check for error indicators in data
  if (data && typeof data === 'object') {
    if (data.error || data.success === false) {
      return {
        isError: true,
        errorInfo: { data: data },
      }
    }
  }

  return { isError: false }
}

/**
 * Checks whether a fully resolved URL points back to this Sim instance.
 * Used to propagate cycle-detection headers on API blocks that target
 * the platform's own workflow execution endpoints via absolute URL.
 */
function isSelfOriginUrl(url: string): boolean {
  return isSameOrigin(url, getBaseUrl()) || isSameOrigin(url, getInternalApiBaseUrl())
}

/**
 * Add internal authentication token to headers if running on server
 * @param headers - Headers object to modify
 * @param isInternalRoute - Whether the target URL is an internal route
 * @param requestId - Request ID for logging
 * @param context - Context string for logging (e.g., toolId or 'proxy')
 */
async function addInternalAuthIfNeeded(
  headers: Headers | Record<string, string>,
  isInternalRoute: boolean,
  requestId: string,
  context: string,
  userId?: string
): Promise<void> {
  if (typeof window === 'undefined') {
    if (isInternalRoute) {
      try {
        const internalToken = await generateInternalToken(userId)
        if (headers instanceof Headers) {
          headers.set('Authorization', `Bearer ${internalToken}`)
        } else {
          headers.Authorization = `Bearer ${internalToken}`
        }
        logger.info(`[${requestId}] Added internal auth token for ${context}`)
      } catch (error) {
        logger.error(`[${requestId}] Failed to generate internal token for ${context}:`, error)
      }
    } else {
      logger.info(`[${requestId}] Skipping internal auth token for external URL: ${context}`)
    }
  }
}

interface ResolvedRetryConfig {
  maxRetries: number
  initialDelayMs: number
  maxDelayMs: number
}

function getRetryConfig(
  retry: ToolRetryConfig | undefined,
  params: Record<string, any>,
  method: string
): ResolvedRetryConfig | null {
  if (!retry?.enabled) return null

  const isIdempotent = ['GET', 'HEAD', 'PUT', 'DELETE'].includes(method.toUpperCase())
  if (retry.retryIdempotentOnly && !isIdempotent && !params.retryNonIdempotent) {
    return null
  }

  const maxRetries = Math.min(10, Math.max(0, Number(params.retries) || retry.maxRetries || 0))
  if (maxRetries === 0) return null

  return {
    maxRetries,
    initialDelayMs: Number(params.retryDelayMs) || retry.initialDelayMs || 500,
    maxDelayMs: Number(params.retryMaxDelayMs) || retry.maxDelayMs || 30000,
  }
}

function isRetryableFailure(error: unknown, status?: number): boolean {
  if (status === 429 || (status && status >= 500 && status <= 599)) return true
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'ECONNABORTED') {
      return true
    }
    const msg = error.message.toLowerCase()
    if (isBodySizeLimitError(msg)) return false
    return msg.includes('timeout') || msg.includes('timed out')
  }
  return false
}

function calculateBackoff(attempt: number, initialDelayMs: number, maxDelayMs: number): number {
  const base = Math.min(initialDelayMs * 2 ** attempt, maxDelayMs)
  return Math.round(base / 2 + randomFloat() * (base / 2))
}

function parseRetryAfterHeader(header: string | null): number {
  if (!header) return 0
  const trimmed = header.trim()
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number.parseInt(trimmed, 10)
    return seconds > 0 ? seconds * 1000 : 0
  }
  const date = new Date(trimmed)
  if (!Number.isNaN(date.getTime())) {
    const deltaMs = date.getTime() - Date.now()
    return deltaMs > 0 ? deltaMs : 0
  }
  return 0
}

function shouldRetryWithoutReadingBody(
  status: number,
  headers: { get(name: string): string | null },
  retryConfig: ResolvedRetryConfig | null | undefined,
  isLastAttempt: boolean
): boolean {
  if (!retryConfig || isLastAttempt || !isRetryableFailure(null, status)) {
    return false
  }
  return parseRetryAfterHeader(headers.get('retry-after')) <= retryConfig.maxDelayMs
}

/**
 * Execute a tool request directly
 * Internal routes (/api/...) use regular fetch
 * External URLs use SSRF-protected fetch with DNS validation and IP pinning
 */
async function executeToolRequest(
  toolId: string,
  tool: ToolConfig,
  params: Record<string, any>,
  signal?: AbortSignal
): Promise<ToolResponse> {
  const requestId = generateRequestId()

  const requestParams = await formatRequestParams(tool, params)

  try {
    const resolvedEndpointUrl: unknown =
      typeof tool.request.url === 'function' ? tool.request.url(params) : tool.request.url

    // Check if the URL function returned an error response
    if (
      resolvedEndpointUrl &&
      typeof resolvedEndpointUrl === 'object' &&
      '_errorResponse' in resolvedEndpointUrl
    ) {
      const errorResponse = (
        resolvedEndpointUrl as {
          _errorResponse?: {
            data?: {
              error?: { message?: string }
              message?: string
            }
          }
        }
      )._errorResponse
      return {
        success: false,
        output: errorResponse?.data || {},
        error:
          errorResponse?.data?.error?.message ||
          errorResponse?.data?.message ||
          'Tool execution failed',
      }
    }

    const endpointUrl = String(resolvedEndpointUrl)
    const isInternalRoute = endpointUrl.startsWith('/api/')
    const baseUrl = isInternalRoute ? getInternalApiBaseUrl() : getBaseUrl()
    const fullUrlObj = new URL(endpointUrl, baseUrl)

    if (isInternalRoute) {
      const workflowId = params._context?.workflowId
      if (workflowId) {
        fullUrlObj.searchParams.set('workflowId', workflowId)
      }
      const userId =
        params._context?.sessionUserId ?? params._context?.workflowUserId ?? params._context?.userId
      if (userId) {
        fullUrlObj.searchParams.set('userId', userId)
      }
      const workspaceId = params._context?.workspaceId
      if (workspaceId) {
        fullUrlObj.searchParams.set('workspaceId', workspaceId)
      }
    }

    const fullUrl = fullUrlObj.toString()

    if (isCustomTool(toolId) && tool.request.body) {
      const requestBody = tool.request.body(params)
      if (
        typeof requestBody === 'object' &&
        requestBody !== null &&
        'schema' in requestBody &&
        'params' in requestBody
      ) {
        try {
          validateClientSideParams(
            requestBody.params as Record<string, any>,
            requestBody.schema as {
              type: string
              properties: Record<string, any>
              required?: string[]
            }
          )
        } catch (validationError) {
          logger.error(`[${requestId}] Custom tool validation failed for ${toolId}:`, {
            error: toError(validationError).message,
          })
          throw validationError
        }
      }
    }

    const headers = new Headers(requestParams.headers)
    await addInternalAuthIfNeeded(
      headers,
      isInternalRoute,
      requestId,
      toolId,
      params._context?.userId
    )

    const shouldPropagateCallChain = isInternalRoute || isSelfOriginUrl(fullUrl)
    if (shouldPropagateCallChain) {
      const callChain = params._context?.callChain as string[] | undefined
      if (callChain && callChain.length > 0) {
        headers.set(SIM_VIA_HEADER, serializeCallChain(callChain))
      }
    }

    // Check request body size before sending to detect potential size limit issues
    validateRequestBodySize(
      requestParams.body,
      requestId,
      toolId,
      isInternalRoute ? INTERNAL_ROUTE_MAX_REQUEST_BODY_SIZE_BYTES : MAX_REQUEST_BODY_SIZE_BYTES
    )

    // Convert Headers to plain object for secureFetchWithPinnedIP
    const headersRecord: Record<string, string> = {}
    headers.forEach((value, key) => {
      headersRecord[key] = value
    })

    const retryConfig = getRetryConfig(tool.request.retry, params, requestParams.method)
    const maxAttempts = retryConfig ? 1 + retryConfig.maxRetries : 1

    let response: Response | undefined
    let lastError: unknown
    const nullBodyStatuses = new Set([101, 204, 205, 304])

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const isLastAttempt = attempt === maxAttempts - 1

      try {
        if (isInternalRoute) {
          const controller = new AbortController()
          // With a caller/execution abort signal present, the plan-based timeout bounds the call and
          // this only acts as a ceiling; without one, keep the tighter default as the hang safety net.
          const timeout =
            requestParams.timeout ||
            (signal ? getMaxExecutionTimeout() : DEFAULT_EXECUTION_TIMEOUT_MS)
          const timeoutId = setTimeout(
            () => controller.abort(`timeout:internal_tool_fetch:${timeout}ms`),
            timeout
          )

          let abortListener: (() => void) | null = null
          if (signal) {
            if (signal.aborted) {
              controller.abort('caller_aborted')
            } else {
              abortListener = () => controller.abort('caller_aborted')
              signal.addEventListener('abort', abortListener, { once: true })
            }
          }

          try {
            const internalResponse = await fetch(fullUrl, {
              method: requestParams.method,
              headers: headers,
              body: requestParams.body,
              signal: controller.signal,
            })
            if (
              nullBodyStatuses.has(internalResponse.status) ||
              shouldRetryWithoutReadingBody(
                internalResponse.status,
                internalResponse.headers,
                retryConfig,
                isLastAttempt
              )
            ) {
              internalResponse.body?.cancel().catch(() => {})
              response = new Response(null, {
                status: internalResponse.status,
                statusText: internalResponse.statusText,
                headers: cloneResponseHeaders(internalResponse.headers),
              })
            } else {
              const bodyBuffer = await readToolResponseBody(internalResponse, {
                requestId,
                toolId,
                signal: controller.signal,
              })
              response = new Response(new Uint8Array(bodyBuffer), {
                status: internalResponse.status,
                statusText: internalResponse.statusText,
                headers: cloneResponseHeaders(internalResponse.headers),
              })
            }
          } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
              // Distinguish caller cancellation from local timeout: rethrow the AbortError
              // when the caller's signal triggered the abort so cancellation propagates as-is.
              if (signal?.aborted) {
                throw error
              }
              throw new Error(`Request timed out after ${timeout}ms`)
            }
            throw error
          } finally {
            clearTimeout(timeoutId)
            if (abortListener) {
              signal?.removeEventListener('abort', abortListener)
            }
          }
        } else {
          const urlValidation = await validateUrlWithDNS(fullUrl, 'toolUrl')
          if (!urlValidation.isValid) {
            throw new Error(`Invalid tool URL: ${urlValidation.error}`)
          }

          const secureResponse = await secureFetchWithPinnedIP(fullUrl, urlValidation.resolvedIP!, {
            method: requestParams.method,
            headers: headersRecord,
            body: requestParams.body ?? undefined,
            timeout: requestParams.timeout,
            maxResponseBytes: MAX_TOOL_RESPONSE_BODY_BYTES,
            signal,
          })

          const responseHeaders = new Headers(secureResponse.headers.toRecord())

          if (
            nullBodyStatuses.has(secureResponse.status) ||
            shouldRetryWithoutReadingBody(
              secureResponse.status,
              responseHeaders,
              retryConfig,
              isLastAttempt
            )
          ) {
            secureResponse.body?.cancel().catch(() => {})
            response = new Response(null, {
              status: secureResponse.status,
              statusText: secureResponse.statusText,
              headers: responseHeaders,
            })
          } else {
            const bodyBuffer = await readToolResponseBody(secureResponse, {
              requestId,
              toolId,
              signal,
            })
            response = new Response(new Uint8Array(bodyBuffer), {
              status: secureResponse.status,
              statusText: secureResponse.statusText,
              headers: responseHeaders,
            })
          }
        }
      } catch (error) {
        lastError = error
        if (!retryConfig || isLastAttempt || !isRetryableFailure(error)) {
          throw error
        }
        const delayMs = calculateBackoff(
          attempt,
          retryConfig.initialDelayMs,
          retryConfig.maxDelayMs
        )
        logger.warn(
          `[${requestId}] Retrying ${toolId} after error (attempt ${attempt + 1}/${maxAttempts})`,
          { delayMs }
        )
        await sleep(delayMs)
        continue
      }

      if (
        retryConfig &&
        !isLastAttempt &&
        response &&
        !response.ok &&
        isRetryableFailure(null, response.status)
      ) {
        const retryAfterMs = parseRetryAfterHeader(response.headers.get('retry-after'))
        if (retryAfterMs > retryConfig.maxDelayMs) {
          logger.warn(
            `[${requestId}] Retry-After (${retryAfterMs}ms) exceeds maxDelayMs (${retryConfig.maxDelayMs}ms), skipping retry`
          )
          break
        }
        try {
          await response.arrayBuffer()
        } catch {
          // Ignore errors when consuming body
        }
        const backoffMs = calculateBackoff(
          attempt,
          retryConfig.initialDelayMs,
          retryConfig.maxDelayMs
        )
        const delayMs = Math.max(backoffMs, retryAfterMs)
        logger.warn(
          `[${requestId}] Retrying ${toolId} after HTTP ${response.status} (attempt ${attempt + 1}/${maxAttempts})`,
          { delayMs }
        )
        await sleep(delayMs)
        continue
      }

      break
    }

    if (!response) {
      throw lastError ?? new Error(`Request failed for ${toolId}`)
    }

    const contentType = response.headers.get('content-type') || ''
    const hasTransformResponse = Boolean(tool?.transformResponse)
    const prefersTextTransform =
      hasTransformResponse &&
      (toolId === 'semrush_query' || !contentType.toLowerCase().includes('application/json'))

    if (!response.ok) {
      let errorData: any
      try {
        const errorText = await response.text()
        try {
          errorData = JSON.parse(errorText)
        } catch {
          errorData = errorText
        }
      } catch {
        logger.error(`[${requestId}] Failed to read response body for ${toolId}`)
        errorData = null
      }

      const errorInfo: ErrorInfo = {
        status: response.status,
        statusText: response.statusText,
        data: errorData,
      }

      const errorToTransform = createTransformedErrorFromErrorInfo(errorInfo, tool.errorExtractor)
      const hasStructuredErrorPayload =
        errorData !== null &&
        typeof errorData === 'object' &&
        !Array.isArray(errorData) &&
        ('error' in errorData || 'message' in errorData)

      if (response.status === 413 && !hasStructuredErrorPayload) {
        logger.error(`[${requestId}] Request body too large for ${toolId} (HTTP 413):`, {
          status: response.status,
          statusText: response.statusText,
          errorData,
        })
        throw new Error(BODY_SIZE_LIMIT_ERROR_MESSAGE)
      }

      logger.error(`[${requestId}] Internal API error for ${toolId}:`, {
        status: errorInfo.status,
        errorData: errorInfo.data,
      })

      throw errorToTransform
    }

    let responseData
    const status = response.status
    if (status === 202 || status === 204 || status === 205) {
      responseData = { status }
    } else if (!hasTransformResponse || !prefersTextTransform) {
      try {
        responseData = await response.json()
      } catch (jsonError) {
        logger.error(`[${requestId}] JSON parse error for ${toolId}:`, {
          error: jsonError instanceof Error ? jsonError.message : String(jsonError),
        })
        throw new Error(`Failed to parse response from ${toolId}: ${jsonError}`)
      }
    } else {
      responseData = null
    }

    // Check for error conditions
    const { isError, errorInfo } = isErrorResponse(response, responseData)

    if (isError) {
      // Handle error case
      const errorToTransform = createTransformedErrorFromErrorInfo(errorInfo, tool.errorExtractor)

      logger.error(`[${requestId}] Internal API error for ${toolId}:`, {
        status: errorInfo?.status,
        errorData: errorInfo?.data,
      })

      throw errorToTransform
    }

    // Success case: use transformResponse if available
    if (tool.transformResponse) {
      // If the tool expects text (Semrush), pass through the original response immediately so it can read the body.
      if (prefersTextTransform) {
        try {
          const data = await tool.transformResponse(response, params)
          return data
        } catch (transformError) {
          logger.error(`[${requestId}] Transform response error for ${toolId}:`, {
            error:
              transformError instanceof Error ? transformError.message : String(transformError),
          })
          throw transformError
        }
      }

      try {
        // Create a mock response object that provides the methods transformResponse needs
        const mockResponse = {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          url: fullUrl,
          json: async () => responseData ?? (await response.clone().json()),
          text: async () =>
            responseData !== null && responseData !== undefined
              ? typeof responseData === 'string'
                ? responseData
                : JSON.stringify(responseData)
              : await response.clone().text(),
          arrayBuffer: () => response.arrayBuffer(),
          blob: () => response.blob(),
        } as Response

        const data = await tool.transformResponse(mockResponse, params)
        return data
      } catch (transformError) {
        logger.error(`[${requestId}] Transform response error for ${toolId}:`, {
          error: toError(transformError).message,
        })
        throw transformError
      }
    }

    // Default success response handling
    return {
      success: true,
      output: responseData.output || responseData,
      error: undefined,
    }
  } catch (error: any) {
    handleResponseSizeLimitError(error, requestId, toolId)

    // Check if this is a body size limit error and throw user-friendly message
    handleBodySizeLimitError(error, requestId, toolId)

    logger.error(`[${requestId}] Internal request error for ${toolId}:`, {
      error: toError(error).message,
    })

    // Let the error bubble up to be handled in the main executeTool function
    throw error
  }
}

/**
 * Validates parameters on the client side before sending to the execute endpoint
 */
function validateClientSideParams(
  params: Record<string, any>,
  schema: {
    type: string
    properties: Record<string, any>
    required?: string[]
  }
) {
  if (!schema || schema.type !== 'object') {
    throw new Error('Invalid schema format')
  }

  // Internal parameters that should be excluded from validation
  const internalParamSet = new Set([
    '_context',
    '_toolSchema',
    'workflowId',
    'envVars',
    'workflowVariables',
    'blockData',
    'blockNameMapping',
  ])

  // Check required parameters
  if (schema.required) {
    for (const requiredParam of schema.required) {
      if (!(requiredParam in params)) {
        throw new Error(`Required parameter missing: ${requiredParam}`)
      }
    }
  }

  // Check parameter types (basic validation)
  for (const [paramName, paramValue] of Object.entries(params)) {
    // Skip validation for internal parameters
    if (internalParamSet.has(paramName)) {
      continue
    }

    const paramSchema = schema.properties[paramName]
    if (!paramSchema) {
      throw new Error(`Unknown parameter: ${paramName}`)
    }

    // Basic type checking
    const type = paramSchema.type
    if (type === 'string' && typeof paramValue !== 'string') {
      throw new Error(`Parameter ${paramName} should be a string`)
    }
    if (type === 'number' && typeof paramValue !== 'number') {
      throw new Error(`Parameter ${paramName} should be a number`)
    }
    if (type === 'boolean' && typeof paramValue !== 'boolean') {
      throw new Error(`Parameter ${paramName} should be a boolean`)
    }
    if (type === 'array' && !Array.isArray(paramValue)) {
      throw new Error(`Parameter ${paramName} should be an array`)
    }
    if (type === 'object' && (typeof paramValue !== 'object' || paramValue === null)) {
      throw new Error(`Parameter ${paramName} should be an object`)
    }
  }
}

/**
 * Handle a request via the proxy
 */
async function handleProxyRequest(
  toolId: string,
  params: Record<string, any>,
  executionContext?: ExecutionContext
): Promise<ToolResponse> {
  const requestId = generateRequestId()

  const baseUrl = getBaseUrl()
  const proxyUrl = new URL('/api/proxy', baseUrl).toString()

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    await addInternalAuthIfNeeded(headers, true, requestId, `proxy:${toolId}`)

    // Extract only the minimal executionContext fields needed by the proxy
    // The proxy doesn't use the full executionContext, so we only send what's needed
    // to avoid serializing large Maps, Sets, and accumulated loop data
    const minimalExecutionContext = executionContext
      ? {
          workflowId: executionContext.workflowId,
          workspaceId: executionContext.workspaceId,
          executionId: executionContext.executionId,
          userId: executionContext.userId,
        }
      : undefined

    // Use safeStringify to handle circular references and large objects
    let body: string | undefined
    try {
      body = safeStringify(
        { toolId, params, executionContext: minimalExecutionContext },
        `proxy:${toolId}`
      )
    } catch (stringifyError) {
      logger.error(`[${requestId}] Failed to stringify request body for proxy:${toolId}`, {
        error: stringifyError instanceof Error ? stringifyError.message : String(stringifyError),
        toolId,
      })
      throw new Error(
        `Failed to prepare request body: ${stringifyError instanceof Error ? stringifyError.message : String(stringifyError)}. This may be due to circular references or data that is too large.`
      )
    }

    // Check request body size before sending
    validateRequestBodySize(body, requestId, `proxy:${toolId}`)

    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers,
      body,
    })

    if (!response.ok) {
      // Check for 413 (Entity Too Large) - body size limit exceeded
      if (response.status === 413) {
        logger.error(`[${requestId}] Request body too large for proxy:${toolId} (HTTP 413)`)
        throw new Error(BODY_SIZE_LIMIT_ERROR_MESSAGE)
      }

      const errorText = await response.text()
      logger.error(`[${requestId}] Proxy request failed for ${toolId}:`, {
        status: response.status,
        statusText: response.statusText,
        error: errorText.substring(0, 200), // Limit error text length
      })

      let errorMessage = `HTTP error ${response.status}: ${response.statusText}`

      try {
        const errorJson = JSON.parse(errorText)
        errorMessage =
          // Primary error patterns
          errorJson.errors?.[0]?.message ||
          errorJson.errors?.[0]?.detail ||
          errorJson.error?.message ||
          (typeof errorJson.error === 'string' ? errorJson.error : undefined) ||
          errorJson.message ||
          errorJson.error_description ||
          errorJson.fault?.faultstring ||
          errorJson.faultstring ||
          // Fallback
          (typeof errorJson.error === 'object'
            ? `API Error: ${response.status} ${response.statusText}`
            : `HTTP error ${response.status}: ${response.statusText}`)
      } catch (parseError) {
        // If not JSON, use the raw text
        if (errorText) {
          errorMessage = `${errorMessage}: ${errorText}`
        }
      }

      throw new Error(errorMessage)
    }

    // Parse the successful response
    const result = await response.json()
    return result
  } catch (error: any) {
    // Check if this is a body size limit error and throw user-friendly message
    handleBodySizeLimitError(error, requestId, `proxy:${toolId}`)

    logger.error(`[${requestId}] Proxy request error for ${toolId}:`, {
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      output: {},
      error: error.message || 'Proxy request failed',
    }
  }
}

/**
 * Execute an MCP tool via the server-side proxy
 *
 * @param toolId - MCP tool ID in format "mcp-serverId-toolName"
 * @param params - Tool parameters
 * @param executionContext - Execution context
 * @param requestId - Request ID for logging
 * @param startTimeISO - Start time for timing
 */
async function executeMcpTool(
  toolId: string,
  params: Record<string, any>,
  executionContext?: ExecutionContext,
  requestId?: string,
  startTimeISO?: string,
  signal?: AbortSignal
): Promise<ToolResponse> {
  const actualRequestId = requestId || generateRequestId()
  const actualStartTime = startTimeISO || new Date().toISOString()

  try {
    logger.info(`[${actualRequestId}] Executing MCP tool: ${toolId}`)

    const { serverId, toolName } = parseMcpToolId(toolId)

    const baseUrl = getInternalApiBaseUrl()

    const mcpScope = resolveToolScope(params, executionContext)

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }

    if (typeof window === 'undefined') {
      try {
        const internalToken = await generateInternalToken(mcpScope.userId)
        headers.Authorization = `Bearer ${internalToken}`
      } catch (error) {
        logger.error(`[${actualRequestId}] Failed to generate internal token:`, error)
      }
    }

    // Handle two different parameter structures:
    // 1. Direct MCP blocks: arguments are stored as JSON string in 'arguments' field
    // 2. Agent blocks: arguments are passed directly as top-level parameters
    let toolArguments = {}

    // First check if we have the 'arguments' field (direct MCP block usage)
    if (params.arguments) {
      if (typeof params.arguments === 'string') {
        try {
          toolArguments = JSON.parse(params.arguments)
        } catch (error) {
          logger.warn(`[${actualRequestId}] Failed to parse MCP arguments JSON:`, params.arguments)
          toolArguments = {}
        }
      } else {
        toolArguments = params.arguments
      }
    } else {
      // Agent block usage: extract MCP-specific arguments by filtering out system parameters
      toolArguments = Object.fromEntries(
        Object.entries(params).filter(([key]) => !MCP_SYSTEM_PARAMETERS.has(key))
      )
    }

    if (mcpScope.callChain && mcpScope.callChain.length > 0) {
      headers[SIM_VIA_HEADER] = serializeCallChain(mcpScope.callChain)
    }

    if (!mcpScope.workspaceId) {
      return {
        success: false,
        output: {},
        error: `Missing workspaceId in execution context for MCP tool ${toolName}`,
        timing: {
          startTime: actualStartTime,
          endTime: new Date().toISOString(),
          duration: Date.now() - new Date(actualStartTime).getTime(),
        },
      }
    }

    const requestBody: Record<string, any> = {
      serverId,
      toolName,
      arguments: toolArguments,
      workflowId: mcpScope.workflowId,
      workspaceId: mcpScope.workspaceId,
    }

    const body = JSON.stringify(requestBody)

    // Check request body size before sending
    validateRequestBodySize(body, actualRequestId, `mcp:${toolId}`)

    logger.info(`[${actualRequestId}] Making MCP tool request to ${toolName} on ${serverId}`, {
      hasWorkspaceId: !!mcpScope.workspaceId,
      hasWorkflowId: !!mcpScope.workflowId,
    })

    const mcpUrl = new URL('/api/mcp/tools/execute', baseUrl)
    if (mcpScope.userId) {
      mcpUrl.searchParams.set('userId', mcpScope.userId)
    }

    const response = await fetch(mcpUrl.toString(), {
      method: 'POST',
      headers,
      body,
      signal,
    })

    const endTime = new Date()
    const endTimeISO = endTime.toISOString()
    const duration = endTime.getTime() - new Date(actualStartTime).getTime()

    if (!response.ok) {
      // Check for 413 (Entity Too Large) - body size limit exceeded
      if (response.status === 413) {
        logger.error(`[${actualRequestId}] Request body too large for mcp:${toolId} (HTTP 413)`)
        return {
          success: false,
          output: {},
          error: BODY_SIZE_LIMIT_ERROR_MESSAGE,
          timing: {
            startTime: actualStartTime,
            endTime: endTimeISO,
            duration,
          },
        }
      }

      let errorMessage = `MCP tool execution failed: ${response.status} ${response.statusText}`

      try {
        const errorData = await response.json()
        if (errorData.error) {
          errorMessage = errorData.error
        }
      } catch {
        // Failed to parse error response, use default message
      }

      return {
        success: false,
        output: {},
        error: errorMessage,
        timing: {
          startTime: actualStartTime,
          endTime: endTimeISO,
          duration,
        },
      }
    }

    const result = await response.json()

    if (!result.success) {
      return {
        success: false,
        output: {},
        error: result.error || 'MCP tool execution failed',
        timing: {
          startTime: actualStartTime,
          endTime: endTimeISO,
          duration,
        },
      }
    }

    logger.info(`[${actualRequestId}] MCP tool ${toolId} executed successfully`)

    return {
      success: true,
      output: result.data?.output || result.output || result.data || {},
      timing: {
        startTime: actualStartTime,
        endTime: endTimeISO,
        duration,
      },
    }
  } catch (error) {
    const endTime = new Date()
    const endTimeISO = endTime.toISOString()
    const duration = endTime.getTime() - new Date(actualStartTime).getTime()

    // Check if this is a body size limit error
    const errorMsg = toError(error).message
    if (isBodySizeLimitError(errorMsg)) {
      logger.error(`[${actualRequestId}] Request body size limit exceeded for mcp:${toolId}:`, {
        originalError: errorMsg,
      })
      return {
        success: false,
        output: {},
        error: BODY_SIZE_LIMIT_ERROR_MESSAGE,
        timing: {
          startTime: actualStartTime,
          endTime: endTimeISO,
          duration,
        },
      }
    }

    logger.error(`[${actualRequestId}] Error executing MCP tool ${toolId}:`, error)

    const errorMessage = getErrorMessage(error, `Failed to execute MCP tool ${toolId}`)

    return {
      success: false,
      output: {},
      error: errorMessage,
      timing: {
        startTime: actualStartTime,
        endTime: endTimeISO,
        duration,
      },
    }
  }
}

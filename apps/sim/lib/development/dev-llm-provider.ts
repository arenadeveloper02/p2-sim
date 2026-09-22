import { AsyncLocalStorage } from 'node:async_hooks'
import Anthropic from '@anthropic-ai/sdk'
import { transformJSONSchema } from '@anthropic-ai/sdk/lib/transform-json-schema'
import { type Content, type GoogleGenAI, type Part, type Schema } from '@google/genai'
import { createLogger } from '@sim/logger'
import { createAnthropicMessage } from '@/lib/anthropic/create-message'
import { getRotatingApiKey } from '@/lib/core/config/api-keys'
import type { DevelopmentReferenceMedia } from '@/lib/development/resolve-development-reference-image'
import {
  createLocalCopilotVertexClient,
  getLocalCopilotVertexNotConfiguredMessage,
  isLocalCopilotVertexConfigured,
} from '@/local-copilot/lib/providers/vertex-auth'
import { cleanSchemaForGemini } from '@/providers/google/utils'
import { supportsTemperature } from '@/providers/utils'

const logger = createLogger('DevelopmentLlm')

/**
 * Per-request provider from the Development / Arena Development block UI Model dropdown.
 * Defaults to `vertex` (Gemini 3.8 Flash) when the UI does not set one.
 */
const llmProviderStorage = new AsyncLocalStorage<DevelopmentLlmProvider>()

/**
 * Anthropic beta header for the JSON-schema-constrained response format used by
 * the Development block generator. Keep in sync with the Anthropic API spec.
 */
const STRUCTURED_OUTPUTS_BETA = 'structured-outputs-2025-11-13'

/**
 * Provider-purpose default models (fixed — the block UI picks provider only).
 */
const DEFAULT_ANTHROPIC_CREATION_MODEL = 'claude-fable-5'
const DEFAULT_ANTHROPIC_EDIT_MODEL = 'claude-fable-5'
const DEFAULT_VERTEX_CREATION_MODEL = 'gemini-3.8-flash'
const DEFAULT_VERTEX_EDIT_MODEL = 'gemini-3.8-flash'

/**
 * Anthropic Opus 4.8+ supports 128k output; Sonnet 4.x caps at 64k. Vertex
 * `gemini-3.8-flash` caps at 65_536 output tokens (see `apps/sim/providers/models.ts`).
 */
const ANTHROPIC_DEFAULT_MAX_OUTPUT_TOKENS = 128_000
const ANTHROPIC_SONNET_MAX_OUTPUT_TOKENS = 64_000
const VERTEX_DEFAULT_MAX_OUTPUT_TOKENS = 65_536

/**
 * Which purpose the caller is invoking. Anthropic and Vertex both resolve to
 * their own default per purpose, and each has independent env overrides.
 */
export type DevelopmentModelPurpose = 'creation' | 'edit'

/** Which LLM backend drives the Next.js app generator. */
export type DevelopmentLlmProvider = 'anthropic' | 'vertex'

/**
 * Provider-neutral message shape used inside the generator's continuation loop.
 * Concrete provider content blocks are built inside {@link requestStructuredJsonMessage}.
 */
export interface DevLlmMessage {
  role: 'user' | 'assistant'
  text: string
  /**
   * Optional inline PDF reference attached to a user turn. Never valid on an
   * assistant continuation reply — the generator only attaches it to the first
   * user turn today.
   */
  pdf?: DevelopmentReferenceMedia
}

interface AnthropicDevClient {
  kind: 'anthropic'
  anthropic: Anthropic
}

interface VertexDevClient {
  kind: 'vertex'
  ai: GoogleGenAI
}

/** Discriminated client the generator threads through every LLM call. */
export type DevLlmClient = AnthropicDevClient | VertexDevClient

export interface DevLlmResponse {
  /** Raw text the model produced across all content parts (thoughts filtered on Vertex). */
  text: string
  /** True when the model stopped because it hit `max_tokens` / `MAX_TOKENS`. */
  hitMaxTokens: boolean
  /**
   * Provider-normalized usage. Uses Anthropic's `input_tokens` / `output_tokens`
   * names so callers can hand this directly to the existing usage tracker.
   */
  usage: {
    input_tokens: number
    output_tokens: number
  }
}

/**
 * Parses a raw provider id from the block UI or request body.
 * Returns `undefined` for empty / unrecognized values so callers can fall back.
 */
export function parseDevelopmentLlmProvider(
  value: string | undefined | null
): DevelopmentLlmProvider | undefined {
  const raw = value?.trim().toLowerCase()
  if (raw === 'anthropic' || raw === 'vertex') return raw
  return undefined
}

/**
 * Resolves the active LLM backend for this request.
 * Priority: explicit argument → AsyncLocalStorage (block UI Model) → `vertex`.
 */
export function resolveDevelopmentLlmProvider(
  override?: DevelopmentLlmProvider
): DevelopmentLlmProvider {
  return override ?? llmProviderStorage.getStore() ?? 'vertex'
}

/**
 * Runs `fn` with a per-request LLM provider (from the block UI Model dropdown).
 * Always enters ALS — including the default — so nested
 * {@link createDevelopmentLlmClient} calls without an explicit override still
 * see the request's selection. Prefer passing the provider explicitly to
 * {@link createDevelopmentLlmClient} when possible (avoids ALS splits under
 * Next.js HMR / duplicate module graphs).
 */
export async function runWithDevelopmentLlmProvider<T>(
  provider: DevelopmentLlmProvider | undefined,
  fn: () => Promise<T>
): Promise<T> {
  const resolved = parseDevelopmentLlmProvider(provider) ?? 'vertex'
  return llmProviderStorage.run(resolved, async () => fn())
}

/**
 * Builds the provider-specific SDK client the caller will thread through every
 * generator LLM call. Vertex reuses the Local Copilot Vertex wiring
 * (`VERTEX_PROJECT` / `VERTEX_LOCATION` / service-account JSON / ADC / access
 * token) so both surfaces authenticate the same way.
 *
 * Prefer passing `override` from the block UI selection rather than relying
 * solely on AsyncLocalStorage — Next.js can load this module twice in dev,
 * which silently drops the ALS store and falls back to vertex.
 */
export function createDevelopmentLlmClient(override?: DevelopmentLlmProvider): DevLlmClient {
  const provider = resolveDevelopmentLlmProvider(override)
  logger.info('Resolved development LLM provider', {
    provider,
    fromOverride: override != null,
    fromAls: override == null && llmProviderStorage.getStore() != null,
  })

  if (provider === 'anthropic') {
    return { kind: 'anthropic', anthropic: buildAnthropicApiClient() }
  }

  if (!isLocalCopilotVertexConfigured()) {
    throw new Error(
      `Development block: llmProvider=vertex but ${getLocalCopilotVertexNotConfiguredMessage()} Switch the Model dropdown to Claude, or configure Vertex (VERTEX_PROJECT + credentials).`
    )
  }

  return { kind: 'vertex', ai: createLocalCopilotVertexClient() }
}

function buildAnthropicApiClient(): Anthropic {
  let apiKey: string
  try {
    apiKey = getRotatingApiKey('anthropic')
  } catch {
    throw new Error(
      'ANTHROPIC_API_KEY is not configured. Set ANTHROPIC_API_KEY or ANTHROPIC_API_KEY_1 through _3 to enable Next.js app generation on Claude, or switch the Model dropdown to Gemini 3.8 Flash (Vertex).'
    )
  }
  return new Anthropic({
    apiKey,
    defaultHeaders: { 'anthropic-beta': STRUCTURED_OUTPUTS_BETA },
  })
}

/**
 * Resolves the concrete model id for the given purpose.
 * Provider comes from the block UI; model ids are fixed defaults per provider.
 */
export function getDevelopmentModelId(
  client: DevLlmClient,
  purpose: DevelopmentModelPurpose
): string {
  if (client.kind === 'anthropic') {
    return purpose === 'edit' ? DEFAULT_ANTHROPIC_EDIT_MODEL : DEFAULT_ANTHROPIC_CREATION_MODEL
  }
  return purpose === 'edit' ? DEFAULT_VERTEX_EDIT_MODEL : DEFAULT_VERTEX_CREATION_MODEL
}

/** Provider-aware max-output-tokens cap for the resolved model. */
export function getDevelopmentMaxOutputTokens(client: DevLlmClient, modelId: string): number {
  if (client.kind === 'anthropic') {
    if (/claude-sonnet-4-[0-5]/.test(modelId) || modelId === 'claude-sonnet-4-6') {
      return ANTHROPIC_SONNET_MAX_OUTPUT_TOKENS
    }
    return ANTHROPIC_DEFAULT_MAX_OUTPUT_TOKENS
  }
  return VERTEX_DEFAULT_MAX_OUTPUT_TOKENS
}

/**
 * Sends a JSON-schema-constrained request to the resolved provider and returns
 * the raw JSON text (already extracted) plus a normalized truncation flag and
 * usage snapshot. Providers accept an optional inline PDF on user turns — the
 * caller carries that intent in {@link DevLlmMessage.pdf}.
 *
 * The caller is responsible for continuation on {@link DevLlmResponse.hitMaxTokens}:
 * append the returned text as an assistant turn and a follow-up user turn, then
 * re-invoke. That flow matches the pre-existing loop inside the generator.
 */
export async function requestStructuredJsonMessage(
  client: DevLlmClient,
  params: {
    systemPrompt: string
    messages: DevLlmMessage[]
    schema: Record<string, unknown>
    modelId: string
    maxOutputTokens: number
  }
): Promise<DevLlmResponse> {
  const { systemPrompt, messages, schema, modelId, maxOutputTokens } = params

  if (client.kind === 'anthropic') {
    return sendAnthropicJsonRequest(client.anthropic, {
      systemPrompt,
      messages,
      schema,
      modelId,
      maxOutputTokens,
    })
  }

  return sendVertexJsonRequest(client.ai, {
    systemPrompt,
    messages,
    schema,
    modelId,
    maxOutputTokens,
  })
}

async function sendAnthropicJsonRequest(
  anthropic: Anthropic,
  params: {
    systemPrompt: string
    messages: DevLlmMessage[]
    schema: Record<string, unknown>
    modelId: string
    maxOutputTokens: number
  }
): Promise<DevLlmResponse> {
  const anthropicMessages: Anthropic.Messages.MessageParam[] = params.messages.map((m) => ({
    role: m.role,
    content: buildAnthropicMessageContent(m),
  }))

  const message = await createAnthropicMessage(anthropic, {
    model: params.modelId,
    max_tokens: params.maxOutputTokens,
    ...(supportsTemperature(params.modelId) ? { temperature: 0.2 } : {}),
    system: params.systemPrompt,
    messages: anthropicMessages,
    output_config: {
      format: {
        type: 'json_schema',
        schema: transformJSONSchema(params.schema),
      },
    },
  })

  const text = getAnthropicMessageText(message)
  return {
    text,
    hitMaxTokens: message.stop_reason === 'max_tokens',
    usage: {
      input_tokens: message.usage?.input_tokens ?? 0,
      output_tokens: message.usage?.output_tokens ?? 0,
    },
  }
}

async function sendVertexJsonRequest(
  ai: GoogleGenAI,
  params: {
    systemPrompt: string
    messages: DevLlmMessage[]
    schema: Record<string, unknown>
    modelId: string
    maxOutputTokens: number
  }
): Promise<DevLlmResponse> {
  const contents: Content[] = params.messages.map(toGeminiContent)

  const response = await ai.models.generateContent({
    model: params.modelId,
    contents,
    config: {
      systemInstruction: params.systemPrompt,
      maxOutputTokens: params.maxOutputTokens,
      ...(supportsTemperature(params.modelId) ? { temperature: 0.2 } : {}),
      responseMimeType: 'application/json',
      responseSchema: cleanSchemaForGemini(params.schema) as Schema,
    },
  })

  const candidate = response.candidates?.[0]
  const finishReason = candidate?.finishReason ? String(candidate.finishReason) : ''
  const parts = candidate?.content?.parts ?? []
  const text = extractGeminiText(parts) || (response.text ?? '')
  const hitMaxTokens = finishReason === 'MAX_TOKENS'

  if (!text.trim() && !hitMaxTokens) {
    logger.warn('Vertex Gemini returned no text content', {
      model: params.modelId,
      finishReason,
      partCount: parts.length,
    })
    throw new Error('LLM did not return text content for app generation')
  }

  return {
    text,
    hitMaxTokens,
    usage: {
      input_tokens: response.usageMetadata?.promptTokenCount ?? 0,
      output_tokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    },
  }
}

function buildAnthropicMessageContent(
  message: DevLlmMessage
): Anthropic.Messages.MessageParam['content'] {
  if (!message.pdf) return message.text

  if (message.pdf.mediaType !== 'application/pdf') {
    throw new Error('Reference media must be a PDF')
  }

  return [
    {
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: message.pdf.base64,
      },
    },
    { type: 'text', text: message.text },
  ]
}

function toGeminiContent(message: DevLlmMessage): Content {
  const role: 'user' | 'model' = message.role === 'assistant' ? 'model' : 'user'
  const parts: Part[] = []

  if (message.pdf) {
    if (message.pdf.mediaType !== 'application/pdf') {
      throw new Error('Reference media must be a PDF')
    }
    parts.push({
      inlineData: {
        mimeType: 'application/pdf',
        data: message.pdf.base64,
      },
    })
  }

  if (message.text) {
    parts.push({ text: message.text })
  }

  return { role, parts }
}

function extractGeminiText(parts: Part[]): string {
  return parts
    .filter((part) => part.thought !== true && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('')
}

function getAnthropicMessageText(message: Anthropic.Messages.Message): string {
  const text = message.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
  if (!text.trim() && message.stop_reason !== 'max_tokens') {
    throw new Error('LLM did not return text content for app generation')
  }
  return text
}

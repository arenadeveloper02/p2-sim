import { GoogleGenAI } from '@google/genai'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import {
  isGeminiResourceExhaustedError,
  streamGoogleGenAiChatCompletion,
} from '@/local-copilot/lib/providers/gemini'
import {
  listLocalCopilotGeminiApiKeys,
  resolveLocalCopilotGeminiApiKey,
} from '@/local-copilot/lib/providers/gemini-keys'
import type {
  ChatCompletionRequest,
  LocalCopilotProvider,
} from '@/local-copilot/lib/providers/types'
import {
  createLocalCopilotVertexClient,
  getLocalCopilotVertexNotConfiguredMessage,
  isLocalCopilotVertexConfigured,
  listLocalCopilotVertexSlots,
  recreateLocalCopilotVertexClientWithoutRotation,
  resolveLocalCopilotVertexLocation,
  resolveLocalCopilotVertexProject,
} from '@/local-copilot/lib/providers/vertex-auth'
import type { LocalCopilotConfig } from '@/local-copilot/lib/types'

const logger = createLogger('LocalCopilotVertexProvider')

const VERTEX_EXHAUSTED_USER_MESSAGE =
  'Vertex capacity is fully exhausted right now (all accounts and Priority PayGo). Please wait a minute and try again, or switch to Gemini / Claude / Bedrock in the model picker.'

/**
 * Creates a Local Copilot provider backed by Vertex AI (Gemini on GCP).
 * Separate from the Google AI Studio / GenAI API-key path (`gemini` provider).
 *
 * On 429, each configured slot is tried as Standard then Priority:
 * `VERTEX_PROJECT` → Priority → `VERTEX_PROJECT_1` → Priority →
 * `VERTEX_PROJECT_2` → Priority. If every Vertex attempt still 429s, falls
 * back to Gemini API keys when configured — never surfaces the raw Vertex
 * 429 as a thrown failure.
 */
export function createVertexProvider(config: LocalCopilotConfig): LocalCopilotProvider {
  if (!isLocalCopilotVertexConfigured()) {
    throw new Error(getLocalCopilotVertexNotConfiguredMessage())
  }

  const project = resolveLocalCopilotVertexProject()
  const location = resolveLocalCopilotVertexLocation()
  const slotCount = listLocalCopilotVertexSlots().length
  /** Standard + Priority once per unique slot → attempts `0..slotCount*2-1`. */
  const maxOpenRetries = Math.max(1, slotCount * 2 - 1)
  logger.info('Vertex Local Copilot provider ready', { project, location, slotCount, maxOpenRetries })

  const refreshVertexClient = (options?: { priorityPayGo?: boolean; sameSlot?: boolean }) => {
    if (options?.sameSlot) {
      return recreateLocalCopilotVertexClientWithoutRotation({
        priorityPayGo: options.priorityPayGo,
      })
    }
    return createLocalCopilotVertexClient(
      options?.priorityPayGo ? { priorityPayGo: true } : undefined
    )
  }

  const buildGeminiFallbackClient = (): GoogleGenAI => {
    const apiKey = resolveLocalCopilotGeminiApiKey()
    if (!apiKey) {
      throw new Error(
        'Gemini API keys are not configured for Vertex fallback. Set GEMINI_API_KEY_1..3 (or GEMINI_API_KEY).'
      )
    }
    return new GoogleGenAI({ apiKey })
  }

  return {
    id: 'vertex',
    async *chatCompletionStream(request: ChatCompletionRequest) {
      try {
        yield* streamGoogleGenAiChatCompletion({
          ai: createLocalCopilotVertexClient(),
          refreshAi: refreshVertexClient,
          priorityPayGoOnRetry: true,
          maxOpenRetries,
          config,
          request,
          logLabel: 'Vertex',
          stripVertexPrefix: true,
        })
        return
      } catch (error) {
        if (!isGeminiResourceExhaustedError(error)) {
          throw error
        }

        if (listLocalCopilotGeminiApiKeys().length > 0) {
          logger.warn(
            'Vertex slot ladder exhausted; falling back to Gemini API keys (not throwing Vertex 429)',
            {
              model: request.model || config.model,
              error: getErrorMessage(error, 'resource exhausted'),
              geminiKeyCount: listLocalCopilotGeminiApiKeys().length,
            }
          )

          try {
            yield* streamGoogleGenAiChatCompletion({
              ai: buildGeminiFallbackClient(),
              refreshAi: buildGeminiFallbackClient,
              config,
              request,
              logLabel: 'Gemini (Vertex fallback)',
              stripVertexPrefix: true,
            })
            return
          } catch (geminiError) {
            if (!isGeminiResourceExhaustedError(geminiError)) {
              throw geminiError
            }
            logger.warn('Gemini fallback also exhausted; returning soft capacity message', {
              error: getErrorMessage(geminiError, 'resource exhausted'),
            })
          }
        } else {
          logger.warn(
            'Vertex slot ladder exhausted and no Gemini API keys configured; returning soft capacity message',
            { error: getErrorMessage(error, 'resource exhausted') }
          )
        }

        // Do not throw the Vertex 429 — leave a clear user-facing reply instead.
        yield { type: 'text', content: VERTEX_EXHAUSTED_USER_MESSAGE }
        yield { type: 'done', finishReason: 'stop' }
      }
    },
  }
}

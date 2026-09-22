import { createLogger } from '@sim/logger'
import { streamGoogleGenAiChatCompletion } from '@/local-copilot/lib/providers/gemini'
import type {
  ChatCompletionRequest,
  LocalCopilotProvider,
} from '@/local-copilot/lib/providers/types'
import {
  createLocalCopilotVertexClient,
  getLocalCopilotVertexNotConfiguredMessage,
  isLocalCopilotVertexConfigured,
  listLocalCopilotVertexSlots,
  resolveLocalCopilotVertexLocation,
  resolveLocalCopilotVertexProject,
} from '@/local-copilot/lib/providers/vertex-auth'
import type { LocalCopilotConfig } from '@/local-copilot/lib/types'

const logger = createLogger('LocalCopilotVertexProvider')

/**
 * Creates a Local Copilot provider backed by Vertex AI (Gemini on GCP).
 * Separate from the Google AI Studio / GenAI API-key path (`gemini` provider).
 *
 * Round-robins `VERTEX_PROJECT` / `_1` / `_2` with matching
 * `VERTEX_SERVICE_ACCOUNT_JSON*` and `VERTEX_LOCATION*` when set. On 429,
 * retries advance to the next slot and escalate to Vertex Priority PayGo
 * (`X-Vertex-AI-LLM-Request-Type: shared` +
 * `X-Vertex-AI-LLM-Shared-Request-Type: priority`).
 */
export function createVertexProvider(config: LocalCopilotConfig): LocalCopilotProvider {
  if (!isLocalCopilotVertexConfigured()) {
    throw new Error(getLocalCopilotVertexNotConfiguredMessage())
  }

  const project = resolveLocalCopilotVertexProject()
  const location = resolveLocalCopilotVertexLocation()
  const slotCount = listLocalCopilotVertexSlots().length
  logger.info('Vertex Local Copilot provider ready', { project, location, slotCount })

  return {
    id: 'vertex',
    async *chatCompletionStream(request: ChatCompletionRequest) {
      yield* streamGoogleGenAiChatCompletion({
        ai: createLocalCopilotVertexClient(),
        refreshAi: createLocalCopilotVertexClient,
        priorityPayGoOnRetry: true,
        config,
        request,
        logLabel: 'Vertex',
        stripVertexPrefix: true,
      })
    },
  }
}

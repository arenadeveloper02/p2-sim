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
  resolveLocalCopilotVertexLocation,
  resolveLocalCopilotVertexProject,
} from '@/local-copilot/lib/providers/vertex-auth'
import type { LocalCopilotConfig } from '@/local-copilot/lib/types'

const logger = createLogger('LocalCopilotVertexProvider')

/**
 * Creates a Local Copilot provider backed by Vertex AI (Gemini on GCP).
 * Separate from the Google AI Studio / GenAI API-key path (`gemini` provider).
 */
export function createVertexProvider(config: LocalCopilotConfig): LocalCopilotProvider {
  if (!isLocalCopilotVertexConfigured()) {
    throw new Error(getLocalCopilotVertexNotConfiguredMessage())
  }

  const project = resolveLocalCopilotVertexProject()
  const location = resolveLocalCopilotVertexLocation()
  logger.info('Vertex Local Copilot provider ready', { project, location })

  return {
    id: 'vertex',
    async *chatCompletionStream(request: ChatCompletionRequest) {
      const ai = createLocalCopilotVertexClient()
      yield* streamGoogleGenAiChatCompletion({
        ai,
        config,
        request,
        logLabel: 'Vertex',
        stripVertexPrefix: true,
      })
    },
  }
}

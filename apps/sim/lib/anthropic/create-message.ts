import type Anthropic from '@anthropic-ai/sdk'
import { getAnthropicAutomaticCacheControl } from '@/lib/anthropic/prompt-cache'

/** Anthropic SDK requires streaming when max_tokens exceeds this threshold. */
const ANTHROPIC_NON_STREAMING_MAX_TOKENS = 21333

type AnthropicMessageCreateParams = Anthropic.Messages.MessageCreateParamsNonStreaming & {
  cache_control?: ReturnType<typeof getAnthropicAutomaticCacheControl>
  output_config?: {
    format?: { type: 'json_schema'; schema: Record<string, unknown> }
    effort?: string
  }
}

/**
 * Creates an Anthropic message, using streaming internally when max_tokens exceeds
 * the SDK non-streaming limit. Enables automatic prompt caching by default.
 */
export async function createAnthropicMessage(
  anthropic: Anthropic,
  params: AnthropicMessageCreateParams
): Promise<Anthropic.Messages.Message> {
  const requestParams: AnthropicMessageCreateParams = {
    ...params,
    cache_control: params.cache_control ?? getAnthropicAutomaticCacheControl(),
  }

  if (requestParams.max_tokens > ANTHROPIC_NON_STREAMING_MAX_TOKENS) {
    const stream = anthropic.messages.stream(
      requestParams as Anthropic.Messages.MessageStreamParams
    )
    return stream.finalMessage()
  }
  return anthropic.messages.create(
    requestParams as Anthropic.Messages.MessageCreateParamsNonStreaming
  )
}

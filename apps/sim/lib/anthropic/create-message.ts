import type Anthropic from '@anthropic-ai/sdk'

/** Anthropic SDK requires streaming when max_tokens exceeds this threshold. */
const ANTHROPIC_NON_STREAMING_MAX_TOKENS = 21333

/**
 * Creates an Anthropic message, using streaming internally when max_tokens exceeds
 * the SDK non-streaming limit.
 */
export async function createAnthropicMessage(
  anthropic: Anthropic,
  params: Anthropic.Messages.MessageCreateParamsNonStreaming
): Promise<Anthropic.Messages.Message> {
  if (params.max_tokens > ANTHROPIC_NON_STREAMING_MAX_TOKENS) {
    const stream = anthropic.messages.stream(
      params as Anthropic.Messages.MessageStreamParams
    )
    return stream.finalMessage()
  }
  return anthropic.messages.create(params)
}

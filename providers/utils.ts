import { MODEL_TOOLS, ModelType } from '@/blocks/consts'
import { ProviderId } from './registry'

/**
 * Determines the provider ID based on the model name.
 * Uses the existing MODEL_TOOLS mapping and falls back to pattern matching if needed.
 *
 * @param model - The model name/identifier
 * @returns The corresponding provider ID
 */
export function getProviderFromModel(model: string): ProviderId {
  const normalizedModel = model.toLowerCase()

  // First try to match exactly from our MODEL_TOOLS mapping
  if (normalizedModel in MODEL_TOOLS) {
    const toolId = MODEL_TOOLS[normalizedModel as ModelType]
    // Extract provider ID from tool ID (e.g., 'openai_chat' -> 'openai')
    return toolId.split('_')[0] as ProviderId
  }

  // If no exact match, use pattern matching as fallback
  if (normalizedModel.startsWith('gpt') || normalizedModel.startsWith('o1')) {
    return 'openai'
  }

  if (normalizedModel.startsWith('claude')) {
    return 'anthropic'
  }

  if (normalizedModel.startsWith('gemini')) {
    return 'google'
  }

  if (normalizedModel.startsWith('grok')) {
    return 'xai'
  }

  // Default to deepseek for any other models
  return 'deepseek'
}

/**
 * AI Provider for Sim Copilot
 * Handles communication with different AI providers (OpenAI, Anthropic, xAI)
 */

import { createLogger } from '@sim/logger'

const logger = createLogger('SimCopilotAI')

export type AIProvider = 'openai' | 'anthropic' | 'xai'

export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: any[]
  tool_call_id?: string
}

export interface AIProviderConfig {
  provider: AIProvider
  model: string
  apiKey: string
  temperature?: number
  maxTokens?: number
}

export interface AIResponse {
  content: string
  toolCalls?: {
    id: string
    name: string
    arguments: string
  }[]
  finishReason?: string
}

/**
 * Get the default provider configuration from environment variables
 */
export function getDefaultProviderConfig(): AIProviderConfig {
  // Try providers in order of preference
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      apiKey: process.env.ANTHROPIC_API_KEY,
      temperature: 0.1,
      maxTokens: 4096,
    }
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: process.env.OPENAI_API_KEY,
      temperature: 0.1,
      maxTokens: 4096,
    }
  }

  if (process.env.XAI_API_KEY) {
    return {
      provider: 'xai',
      model: 'grok-2-latest',
      apiKey: process.env.XAI_API_KEY,
      temperature: 0.1,
      maxTokens: 4096,
    }
  }

  throw new Error('No AI provider API key found in environment variables')
}

/**
 * Call the AI provider with messages and tools
 */
export async function callAIProvider(
  config: AIProviderConfig,
  messages: AIMessage[],
  tools?: any[]
): Promise<AIResponse> {
  switch (config.provider) {
    case 'openai':
      return callOpenAI(config, messages, tools)
    case 'anthropic':
      return callAnthropic(config, messages, tools)
    case 'xai':
      return callXAI(config, messages, tools)
    default:
      throw new Error(`Unknown provider: ${config.provider}`)
  }
}

/**
 * Call OpenAI API
 */
async function callOpenAI(
  config: AIProviderConfig,
  messages: AIMessage[],
  tools?: any[]
): Promise<AIResponse> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      tools,
      temperature: config.temperature ?? 0.1,
      max_tokens: config.maxTokens ?? 4096,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    logger.error('OpenAI API error', { status: response.status, error })
    throw new Error(`OpenAI API error: ${response.status} - ${error}`)
  }

  const data = await response.json()
  const choice = data.choices[0]

  return {
    content: choice.message.content || '',
    toolCalls: choice.message.tool_calls?.map((tc: any) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    })),
    finishReason: choice.finish_reason,
  }
}

/**
 * Call Anthropic API
 */
async function callAnthropic(
  config: AIProviderConfig,
  messages: AIMessage[],
  tools?: any[]
): Promise<AIResponse> {
  // Convert OpenAI format to Anthropic format
  const systemMessage = messages.find(m => m.role === 'system')
  const nonSystemMessages = messages.filter(m => m.role !== 'system')

  const anthropicMessages = nonSystemMessages.map(m => {
    if (m.role === 'tool') {
      return {
        role: 'user' as const,
        content: [{
          type: 'tool_result' as const,
          tool_use_id: m.tool_call_id,
          content: m.content,
        }],
      }
    }
    if (m.tool_calls) {
      return {
        role: 'assistant' as const,
        content: m.tool_calls.map((tc: any) => ({
          type: 'tool_use' as const,
          id: tc.id,
          name: tc.function?.name || tc.name,
          input: JSON.parse(tc.function?.arguments || tc.arguments || '{}'),
        })),
      }
    }
    return {
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }
  })

  // Convert tools to Anthropic format
  const anthropicTools = tools?.map(t => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }))

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxTokens ?? 4096,
      system: systemMessage?.content,
      messages: anthropicMessages,
      tools: anthropicTools,
      temperature: config.temperature ?? 0.1,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    logger.error('Anthropic API error', { status: response.status, error })
    throw new Error(`Anthropic API error: ${response.status} - ${error}`)
  }

  const data = await response.json()

  // Extract text content and tool uses
  let textContent = ''
  const toolCalls: { id: string; name: string; arguments: string }[] = []

  for (const block of data.content) {
    if (block.type === 'text') {
      textContent += block.text
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        name: block.name,
        arguments: JSON.stringify(block.input),
      })
    }
  }

  return {
    content: textContent,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    finishReason: data.stop_reason,
  }
}

/**
 * Call xAI (Grok) API - uses OpenAI-compatible format
 */
async function callXAI(
  config: AIProviderConfig,
  messages: AIMessage[],
  tools?: any[]
): Promise<AIResponse> {
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      tools,
      temperature: config.temperature ?? 0.1,
      max_tokens: config.maxTokens ?? 4096,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    logger.error('xAI API error', { status: response.status, error })
    throw new Error(`xAI API error: ${response.status} - ${error}`)
  }

  const data = await response.json()
  const choice = data.choices[0]

  return {
    content: choice.message.content || '',
    toolCalls: choice.message.tool_calls?.map((tc: any) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    })),
    finishReason: choice.finish_reason,
  }
}

/**
 * Stream AI response (for real-time updates)
 */
export async function* streamAIProvider(
  config: AIProviderConfig,
  messages: AIMessage[],
  tools?: any[]
): AsyncGenerator<{ type: 'content' | 'tool_call' | 'done'; data?: any }> {
  // For now, use non-streaming and yield the full response
  // Can be enhanced to support true streaming later
  const response = await callAIProvider(config, messages, tools)

  if (response.content) {
    yield { type: 'content', data: response.content }
  }

  if (response.toolCalls) {
    for (const tc of response.toolCalls) {
      yield { type: 'tool_call', data: tc }
    }
  }

  yield { type: 'done' }
}

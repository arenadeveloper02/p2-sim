import { ProviderConfig, ProviderRequest, ProviderResponse, Message } from './types'
import { openaiProvider } from './openai'
import { anthropicProvider } from './anthropic'
import { ToolConfig } from '@/tools/types'
import { getTool, executeTool } from '@/tools'

// Register providers
const providers: Record<string, ProviderConfig> = {
  openai: openaiProvider,
  anthropic: anthropicProvider,
  // Add other providers here as they're implemented
}

export async function executeProviderRequest(
  providerId: string,
  request: ProviderRequest
): Promise<ProviderResponse> {
  const provider = providers[providerId]
  if (!provider) {
    throw new Error(`Provider not found: ${providerId}`)
  }

  // Only transform tools if they are provided and non-empty
  const functions = request.tools && request.tools.length > 0
    ? provider.transformToolsToFunctions(request.tools)
    : undefined

  // Base payload that's common across providers
  const basePayload = {
    model: request.model || provider.defaultModel,
    messages: [
      { role: 'system' as const, content: request.systemPrompt },
      ...(request.context ? [{ role: 'user' as const, content: request.context }] : [])
    ] as Message[],
    temperature: request.temperature,
    max_tokens: request.maxTokens
  }

  // Provider-specific payload adjustments
  let payload
  switch (providerId) {
    case 'openai':
      payload = {
        ...basePayload,
        ...(functions && { 
          functions,
          function_call: 'auto'
        })
      }
      break
    case 'anthropic':
      payload = {
        ...basePayload,
        system: request.systemPrompt,
        messages: request.context ? [{ role: 'user', content: request.context }] : [],
        ...(functions && {
          tools: functions
        })
      }
      break
    default:
      payload = {
        ...basePayload,
        ...(functions && { functions })
      }
  }

  // Make the API request through the proxy
  const response = await fetch('/api/proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      toolId: `${providerId}/chat`,
      params: {
        ...payload,
        apiKey: request.apiKey
      }
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Provider API error')
  }

  const { output: data } = await response.json()

  // Extract content and tokens based on provider
  let content = ''
  let tokens = undefined

  switch (providerId) {
    case 'anthropic':
      content = data.content?.[0]?.text || ''
      tokens = {
        prompt: data.usage?.input_tokens,
        completion: data.usage?.output_tokens,
        total: data.usage?.input_tokens + data.usage?.output_tokens
      }
      break
    default:
      content = data.choices?.[0]?.message?.content || ''
      tokens = data.usage && {
        prompt: data.usage.prompt_tokens,
        completion: data.usage.completion_tokens,
        total: data.usage.total_tokens
      }
  }

  // Check for function calls
    let toolCalls = []
    let toolResults = []
    let currentMessages = [...basePayload.messages]
    
    try {
      let currentResponse = data
      let hasMoreCalls = true

      while (hasMoreCalls) {
        const hasFunctionCall = 
          (providerId === 'openai' && currentResponse.choices?.[0]?.message?.function_call) ||
          (providerId === 'anthropic' && currentResponse.content?.some((item: any) => item.type === 'function_call'))

        if (!hasFunctionCall) {
          // No more function calls, use the content from the current response
          content = currentResponse.choices?.[0]?.message?.content || ''
          hasMoreCalls = false
          continue
        }

        const functionCall = provider.transformFunctionCallResponse(currentResponse, request.tools)
        if (!functionCall) {
          hasMoreCalls = false
          continue
        }

        // Execute the tool
        const tool = getTool(functionCall.name)
        if (!tool) {
          throw new Error(`Tool not found: ${functionCall.name}`)
        }

        const result = await executeTool(functionCall.name, functionCall.arguments)
        if (result.success) {
          toolResults.push(result.output)
          toolCalls.push(functionCall)

          // Add the assistant's function call and the function result to the message history
          currentMessages.push({
            role: 'assistant',
            content: null,
            function_call: {
              name: functionCall.name,
              arguments: JSON.stringify(functionCall.arguments)
            }
          })
          currentMessages.push({
            role: 'function',
            name: functionCall.name,
            content: JSON.stringify(result.output)
          })

          // Make the next call through the proxy
          const nextResponse = await fetch('/api/proxy', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              toolId: `${providerId}/chat`,
              params: {
                ...basePayload,
                messages: currentMessages,
                ...(functions && { functions, function_call: 'auto' }),
                apiKey: request.apiKey
              }
            })
          })

          if (!nextResponse.ok) {
            const error = await nextResponse.json()
            throw new Error(error.error || 'Provider API error')
          }

          const { output: nextData } = await nextResponse.json()
          currentResponse = nextData

          // Update tokens
          if (nextData.usage) {
            tokens = {
              prompt: (tokens?.prompt || 0) + nextData.usage.prompt_tokens,
              completion: (tokens?.completion || 0) + nextData.usage.completion_tokens,
              total: (tokens?.total || 0) + nextData.usage.total_tokens
            }
          }
        } else {
          hasMoreCalls = false
        }
      }
    } catch (error: any) {
      console.error('Error executing tool:', error)
      throw error
    }

    return {
      content,
      model: data.model,
      tokens,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      toolResults: toolResults.length > 0 ? toolResults : undefined
    }
} 


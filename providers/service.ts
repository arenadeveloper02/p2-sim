import { executeTool, getTool } from '@/tools'
import { getProvider } from './registry'
import { ProviderRequest, ProviderResponse, TokenInfo } from './types'

// Helper function to generate provider-specific structured output instructions
function generateStructuredOutputInstructions(responseFormat: any): string {
  if (!responseFormat?.fields) return ''

  const fields = responseFormat.fields
    .map((field: any) => {
      return `${field.name} (${field.type})${field.description ? `: ${field.description}` : ''}`
    })
    .join('\n')

  return `
Please provide your response in the following JSON format:
{
  ${responseFormat.fields.map((field: any) => `"${field.name}": "${field.type === 'string' ? 'value' : field.type === 'number' ? '0' : field.type === 'boolean' ? 'true/false' : '[]'}"`).join(',\n  ')}
}

Field descriptions:
${fields}

Your response MUST be valid JSON and include all the specified fields with their correct types.`
}

export async function executeProviderRequest(
  providerId: string,
  request: ProviderRequest
): Promise<ProviderResponse> {
  const provider = getProvider(providerId)
  if (!provider) {
    throw new Error(`Provider not found: ${providerId}`)
  }

  // If responseFormat is provided, modify the system prompt to enforce structured output
  if (request.responseFormat) {
    const structuredOutputInstructions = generateStructuredOutputInstructions(
      request.responseFormat
    )
    request.systemPrompt = `${request.systemPrompt}\n\n${structuredOutputInstructions}`
  }

  // Transform tools to provider-specific function format
  const functions =
    request.tools && request.tools.length > 0
      ? provider.transformToolsToFunctions(request.tools)
      : undefined

  // Transform the request using provider-specific logic
  const payload = provider.transformRequest(request, functions)

  // Make the initial API request through the proxy
  let currentResponse = await makeProxyRequest(providerId, payload, request.apiKey)
  let content = ''
  let tokens: TokenInfo | undefined = undefined
  let toolCalls = []
  let toolResults = []
  let currentMessages = [...(request.messages || [])]
  let iterationCount = 0
  const MAX_ITERATIONS = 10 // Prevent infinite loops

  try {
    while (iterationCount < MAX_ITERATIONS) {
      console.log(`Processing iteration ${iterationCount + 1}`)

      // Transform the response using provider-specific logic
      const transformedResponse = provider.transformResponse(currentResponse)
      content = transformedResponse.content

      // If responseFormat is specified and we have content (not a function call), validate and parse the response
      if (request.responseFormat && content && !provider.hasFunctionCall(currentResponse)) {
        try {
          // Try to parse the content as JSON
          const parsedContent = JSON.parse(content)

          // Validate that all required fields are present and have correct types
          const validationErrors = request.responseFormat.fields
            .map((field: any) => {
              if (!(field.name in parsedContent)) {
                return `Missing field: ${field.name}`
              }
              const value = parsedContent[field.name]
              const type = typeof value
              if (field.type === 'string' && type !== 'string') {
                return `Invalid type for ${field.name}: expected string, got ${type}`
              }
              if (field.type === 'number' && type !== 'number') {
                return `Invalid type for ${field.name}: expected number, got ${type}`
              }
              if (field.type === 'boolean' && type !== 'boolean') {
                return `Invalid type for ${field.name}: expected boolean, got ${type}`
              }
              if (field.type === 'array' && !Array.isArray(value)) {
                return `Invalid type for ${field.name}: expected array, got ${type}`
              }
              if (field.type === 'object' && (type !== 'object' || Array.isArray(value))) {
                return `Invalid type for ${field.name}: expected object, got ${type}`
              }
              return null
            })
            .filter(Boolean)

          if (validationErrors.length > 0) {
            throw new Error(`Response format validation failed:\n${validationErrors.join('\n')}`)
          }

          // Store the validated JSON response
          content = JSON.stringify(parsedContent)
        } catch (error: any) {
          console.error('Error parsing structured response:', error)
          throw new Error(`Failed to parse response as structured output: ${error.message}`)
        }
      }

      // Update tokens
      if (transformedResponse.tokens) {
        const newTokens: TokenInfo = {
          prompt: (tokens?.prompt ?? 0) + (transformedResponse.tokens?.prompt ?? 0),
          completion: (tokens?.completion ?? 0) + (transformedResponse.tokens?.completion ?? 0),
          total: (tokens?.total ?? 0) + (transformedResponse.tokens?.total ?? 0),
        }
        tokens = newTokens
      }

      // Check for function calls using provider-specific logic
      const hasFunctionCall = provider.hasFunctionCall(currentResponse)
      console.log('Has function call:', hasFunctionCall)

      // Break if we have content and no function call
      if (!hasFunctionCall) {
        console.log('No function call detected, breaking loop')
        break
      }

      // Safety check: if we have the same function call multiple times in a row
      // with the same arguments, break to prevent infinite loops
      let functionCall
      try {
        functionCall = provider.transformFunctionCallResponse(currentResponse, request.tools)

        // Check if this is a duplicate call
        const lastCall = toolCalls[toolCalls.length - 1]
        if (
          lastCall &&
          lastCall.name === functionCall.name &&
          JSON.stringify(lastCall.arguments) === JSON.stringify(functionCall.arguments)
        ) {
          console.log(
            'Detected duplicate function call, breaking loop to prevent infinite recursion'
          )
          break
        }
      } catch (error) {
        console.log('Error transforming function call:', error)
        break
      }

      if (!functionCall) {
        console.log('No function call after transformation, breaking loop')
        break
      }

      console.log('Function call:', functionCall.name)

      // Execute the tool
      const tool = getTool(functionCall.name)
      if (!tool) {
        console.log(`Tool not found: ${functionCall.name}`)
        break
      }

      const result = await executeTool(functionCall.name, functionCall.arguments)
      console.log('Tool execution result:', result.success)

      if (!result.success) {
        console.log('Tool execution failed')
        break
      }

      toolResults.push(result.output)
      toolCalls.push(functionCall)

      // Add the function call and result to messages
      currentMessages.push({
        role: 'assistant',
        content: null,
        function_call: {
          name: functionCall.name,
          arguments: JSON.stringify(functionCall.arguments),
        },
      })
      currentMessages.push({
        role: 'function',
        name: functionCall.name,
        content: JSON.stringify(result.output),
      })

      // Prepare the next request
      const nextPayload = provider.transformRequest(
        {
          ...request,
          messages: currentMessages,
        },
        functions
      )

      // Make the next request
      currentResponse = await makeProxyRequest(providerId, nextPayload, request.apiKey)
      iterationCount++
    }

    if (iterationCount >= MAX_ITERATIONS) {
      console.log('Max iterations reached, breaking loop')
    }
  } catch (error) {
    console.error('Error executing tool:', error)
    throw error
  }

  return {
    content,
    model: currentResponse.model,
    tokens,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    toolResults: toolResults.length > 0 ? toolResults : undefined,
  }
}

async function makeProxyRequest(providerId: string, payload: any, apiKey: string) {
  console.log('Making proxy request for provider:', providerId)

  const response = await fetch('/api/proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      toolId: `${providerId}/chat`,
      params: {
        ...payload,
        apiKey,
      },
    }),
  })

  const data = await response.json()

  if (!data.success) {
    throw new Error(data.error || 'Provider API error')
  }

  console.log('Proxy request completed')
  return data.output
}

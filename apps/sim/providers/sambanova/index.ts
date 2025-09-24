import OpenAI from 'openai'
import { createLogger } from '@/lib/logs/console/logger'
import type { StreamingExecution } from '@/executor/types'
import { getProviderDefaultModel, getProviderModels } from '@/providers/models'
import type {
  ProviderConfig,
  ProviderRequest,
  ProviderResponse,
  TimeSegment,
} from '@/providers/types'
import { executeTool } from '@/tools'

const logger = createLogger('SambaNovaProvider')

/**
 * SambaNova provider configuration
 */
export const sambanovaProvider: ProviderConfig = {
  id: 'sambanova',
  name: 'SambaNova',
  description: "SambaNova's AI models",
  version: '1.0.0',
  models: getProviderModels('sambanova'),
  defaultModel: getProviderDefaultModel('sambanova'),

  executeRequest: async (
    request: ProviderRequest
  ): Promise<ProviderResponse | ReadableStream | StreamingExecution> => {
    logger.info('Preparing SambaNova request', {
      model: request.model || 'Meta-Llama-3.1-70B-Instruct',
      hasSystemPrompt: !!request.systemPrompt,
      hasMessages: !!request.messages?.length,
      hasTools: !!request.tools?.length,
      toolCount: request.tools?.length || 0,
      hasResponseFormat: !!request.responseFormat,
      stream: !!request.stream,
    })

    // SambaNova uses OpenAI-compatible API
    const sambanova = new OpenAI({
      apiKey: request.apiKey,
      baseURL: 'https://api.sambanova.ai/v1',
    })

    // Start with an empty array for all messages
    const allMessages = []

    // Add system prompt if present
    if (request.systemPrompt) {
      allMessages.push({
        role: 'system',
        content: request.systemPrompt,
      })
    }

    // Add context if present
    if (request.context) {
      allMessages.push({
        role: 'user',
        content: request.context,
      })
    }

    // Add remaining messages
    if (request.messages) {
      allMessages.push(...request.messages)
    }

    // Transform tools to OpenAI format if provided
    const tools = request.tools?.length
      ? request.tools.map((tool) => ({
          type: 'function',
          function: {
            name: tool.id,
            description: tool.description,
            parameters: tool.parameters,
          },
        }))
      : undefined

    // Build the request payload
    const payload: any = {
      model: request.model || 'Meta-Llama-3.1-70B-Instruct',
      messages: allMessages,
    }

    // Add optional parameters
    if (request.temperature !== undefined) payload.temperature = request.temperature
    if (request.maxTokens !== undefined) payload.max_tokens = request.maxTokens
    if (request.stream !== undefined) payload.stream = request.stream

    // Add tools if provided
    if (tools && tools.length > 0) {
      payload.tools = tools
      payload.tool_choice = 'auto'
    }

    // Add response format if provided
    if (request.responseFormat) {
      payload.response_format = {
        type: 'json_schema',
        json_schema: {
          name: request.responseFormat.name,
          schema: request.responseFormat.schema,
          strict: request.responseFormat.strict || false,
        },
      }
    }

    logger.info('Sending request to SambaNova', {
      model: payload.model,
      messageCount: payload.messages.length,
      hasTools: !!payload.tools,
      toolCount: payload.tools?.length || 0,
      stream: payload.stream,
    })

    const startTime = Date.now()

    try {
      if (payload.stream) {
        // Handle streaming response
        const stream = await sambanova.chat.completions.create(payload)

        let fullContent = ''
        let usageData: any = null

        const readableStream = new ReadableStream({
          async start(controller) {
            try {
              for await (const chunk of stream as any) {
                // Check for usage data in the final chunk
                if (chunk.usage) {
                  usageData = chunk.usage
                }

                const content = chunk.choices[0]?.delta?.content || ''
                if (content) {
                  fullContent += content
                  controller.enqueue(new TextEncoder().encode(content))
                }
              }

              controller.close()
            } catch (error) {
              controller.error(error)
            }
          },
        })

        return readableStream
      }
      // Handle non-streaming response
      const response = await sambanova.chat.completions.create(payload)
      const endTime = Date.now()
      const duration = endTime - startTime

      const content = response.choices[0]?.message?.content || ''
      const usage = response.usage

      logger.info('Received response from SambaNova', {
        model: response.model,
        contentLength: content.length,
        usage: usage,
        duration,
      })

      // Handle tool calls if present
      const toolCalls = response.choices[0]?.message?.tool_calls
      const toolResults: any[] = []
      const timeSegments: TimeSegment[] = []

      if (toolCalls && toolCalls.length > 0) {
        logger.info('Processing tool calls', { toolCallCount: toolCalls.length })

        // Process each tool call
        for (const toolCall of toolCalls) {
          try {
            const toolName = toolCall.function.name
            const toolArgs = JSON.parse(toolCall.function.arguments)

            // Get the tool from the tools registry
            const tool = request.tools?.find((t) => t.id === toolName)
            if (!tool) continue

            // Execute the tool
            const toolCallStartTime = Date.now()
            const result = await executeTool(toolName, toolArgs, true)
            const toolCallEndTime = Date.now()
            const toolCallDuration = toolCallEndTime - toolCallStartTime

            // Add to time segments
            timeSegments.push({
              type: 'tool',
              name: toolName,
              startTime: toolCallStartTime,
              endTime: toolCallEndTime,
              duration: toolCallDuration,
            })

            // Prepare result content
            if (result.success) {
              toolResults.push(result.output)
            } else {
              toolResults.push({
                error: true,
                message: result.error || 'Tool execution failed',
                tool: toolName,
              })
            }
          } catch (error: any) {
            logger.error('Tool execution failed', {
              toolName: toolCall.function.name,
              error: error.message,
            })
            toolResults.push({
              error: true,
              message: error.message,
              tool: toolCall.function.name,
            })
          }
        }

        logger.info('Tool execution completed', {
          toolResultCount: toolResults.length,
          timeSegmentCount: timeSegments.length,
        })
      }

      return {
        content,
        model: response.model,
        tokens: usage
          ? {
              prompt: usage.prompt_tokens,
              completion: usage.completion_tokens,
              total: usage.total_tokens,
            }
          : undefined,
        toolCalls: toolCalls?.map((call) => ({
          name: call.function.name,
          arguments: JSON.parse(call.function.arguments),
        })),
        toolResults,
        timing: {
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
          duration,
          timeSegments,
        },
      }
    } catch (error: any) {
      logger.error('SambaNova request failed', {
        error: error.message,
        model: payload.model,
        messageCount: payload.messages.length,
      })

      throw new Error(`SambaNova request failed: ${error.message}`)
    }
  },
}

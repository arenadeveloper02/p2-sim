/**
 * Sim Copilot Chat API
 * Handles chat requests for the dynamic copilot
 */

import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import {
  generateSystemPrompt,
  COPILOT_TOOLS,
  executeServerTool,
  requiresClientExecution,
  getDefaultProviderConfig,
  callAIProvider,
  type AIMessage,
  type AIProviderConfig,
} from '@/lib/sim-copilot'

const logger = createLogger('SimCopilotChat')

const MAX_TOOL_ROUNDS = 10

const ChatRequestSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  workflowId: z.string().min(1, 'Workflow ID is required'),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system', 'tool']),
    content: z.string(),
    tool_calls: z.any().optional(),
    tool_call_id: z.string().optional(),
  })).optional().default([]),
  workflowState: z.any().optional(), // Current workflow state from client
  provider: z.enum(['openai', 'anthropic', 'xai']).optional(),
  model: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { message, workflowId, conversationHistory, workflowState, provider, model } = ChatRequestSchema.parse(body)

    logger.info('Sim Copilot chat request', {
      userId: session.user.id,
      workflowId,
      messageLength: message.length,
      historyLength: conversationHistory.length,
      provider,
    })

    // Get AI provider config
    let providerConfig: AIProviderConfig
    try {
      providerConfig = getDefaultProviderConfig()
      // Override with user preferences if provided
      if (provider) {
        const apiKeyMap: Record<string, string | undefined> = {
          openai: process.env.OPENAI_API_KEY,
          anthropic: process.env.ANTHROPIC_API_KEY,
          xai: process.env.XAI_API_KEY,
        }
        const apiKey = apiKeyMap[provider]
        if (apiKey) {
          providerConfig.provider = provider
          providerConfig.apiKey = apiKey
        }
      }
      if (model) {
        providerConfig.model = model
      }
    } catch (error) {
      logger.error('Failed to get AI provider config', { error })
      return NextResponse.json({ error: 'No AI provider configured' }, { status: 500 })
    }

    // Build messages array - sanitize and limit conversation history
    const systemPrompt = generateSystemPrompt()
    
    // Filter out messages with tool_calls that don't have corresponding tool results
    // This prevents the "tool_use without tool_result" error from Anthropic
    const sanitizedHistory: AIMessage[] = []
    for (let i = 0; i < conversationHistory.length; i++) {
      const msg = conversationHistory[i]
      
      // If this message has tool_calls, check if the next message is a tool result
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        const nextMsg = conversationHistory[i + 1]
        // Only include if there's a corresponding tool result
        if (nextMsg && nextMsg.role === 'tool' && nextMsg.tool_call_id) {
          sanitizedHistory.push(msg)
        }
        // Otherwise skip this message (incomplete tool call)
      } else {
        sanitizedHistory.push(msg)
      }
    }
    
    // Limit conversation history to prevent token limit exceeded
    // Keep only the last 20 messages (10 exchanges) to stay within token limits
    const limitedHistory = sanitizedHistory.slice(-20)
    
    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      ...limitedHistory,
      { role: 'user', content: message },
    ]

    // Run conversation loop with tool calling
    let currentMessages = messages
    let finalResponse = ''
    let toolResults: any[] = []
    let pendingClientTools: any[] = []

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await callAIProvider(providerConfig, currentMessages, COPILOT_TOOLS)

      if (response.content) {
        finalResponse = response.content
      }

      // Check for tool calls
      if (!response.toolCalls || response.toolCalls.length === 0) {
        // No more tool calls, we're done
        break
      }

      // Process tool calls
      const toolCallResults: AIMessage[] = []
      
      for (const toolCall of response.toolCalls) {
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(toolCall.arguments || '{}')
        } catch {
          args = {}
        }

        if (requiresClientExecution(toolCall.name)) {
          // This tool needs to be executed on the client
          pendingClientTools.push({
            id: toolCall.id,
            name: toolCall.name,
            arguments: args,
          })

          // For client tools, we need to return and let the client execute them
          // The client will call back with the results
          if (toolCall.name === 'get_workflow' && workflowState) {
            // If we have workflow state from client, use it
            const result = {
              success: true,
              data: workflowState,
            }
            toolCallResults.push({
              role: 'tool',
              content: JSON.stringify(result),
              tool_call_id: toolCall.id,
            })
            toolResults.push({ toolCallId: toolCall.id, name: toolCall.name, result })
          } else {
            // Need client to execute this tool
            return NextResponse.json({
              type: 'tool_execution_required',
              content: finalResponse,
              pendingTools: pendingClientTools,
              conversationState: currentMessages,
            })
          }
        } else {
          // Execute server-side tool
          const result = executeServerTool(toolCall.name, args)
          toolCallResults.push({
            role: 'tool',
            content: JSON.stringify(result),
            tool_call_id: toolCall.id,
          })
          toolResults.push({ toolCallId: toolCall.id, name: toolCall.name, result })
        }
      }

      // Add assistant message with tool calls and tool results to conversation
      currentMessages = [
        ...currentMessages,
        {
          role: 'assistant',
          content: response.content || '',
          tool_calls: response.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.arguments },
          })),
        },
        ...toolCallResults,
      ]
    }

    // Return final response
    return NextResponse.json({
      type: 'complete',
      content: finalResponse,
      toolResults,
      pendingTools: pendingClientTools.length > 0 ? pendingClientTools : undefined,
    })

  } catch (error) {
    logger.error('Sim Copilot chat error', { error })
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: error.errors }, { status: 400 })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/sim-copilot/chat/continue
 * Continue conversation after client executes tools
 */
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { conversationState, toolResults, provider, model } = body

    if (!conversationState || !toolResults) {
      return NextResponse.json({ error: 'Missing conversationState or toolResults' }, { status: 400 })
    }

    // Get AI provider config
    let providerConfig: AIProviderConfig
    try {
      providerConfig = getDefaultProviderConfig()
      if (provider) {
        const apiKeyMap: Record<string, string | undefined> = {
          openai: process.env.OPENAI_API_KEY,
          anthropic: process.env.ANTHROPIC_API_KEY,
          xai: process.env.XAI_API_KEY,
        }
        const apiKey = apiKeyMap[provider]
        if (apiKey) {
          providerConfig.provider = provider
          providerConfig.apiKey = apiKey
        }
      }
      if (model) {
        providerConfig.model = model
      }
    } catch (error) {
      return NextResponse.json({ error: 'No AI provider configured' }, { status: 500 })
    }

    // Add tool results to conversation
    const messages: AIMessage[] = [
      ...conversationState,
      ...toolResults.map((tr: any) => ({
        role: 'tool' as const,
        content: JSON.stringify(tr.result),
        tool_call_id: tr.toolCallId,
      })),
    ]

    // Continue the conversation
    const response = await callAIProvider(providerConfig, messages, COPILOT_TOOLS)

    return NextResponse.json({
      type: 'complete',
      content: response.content,
      toolCalls: response.toolCalls,
    })

  } catch (error) {
    logger.error('Sim Copilot continue error', { error })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

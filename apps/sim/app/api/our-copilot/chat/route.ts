/**
 * Our Copilot API - Chat Endpoint
 * Smart LLM-powered copilot with tool integration
 */

import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { OurCopilotAgent } from '@/lib/our-copilot/agent/core'
import { MemoryManager } from '@/lib/our-copilot/agent/memory'
import type { CopilotRequest, CopilotResponse } from '@/lib/our-copilot/agent/types'

const logger = createLogger('OurCopilotAPI')

// Request schema validation
const ChatRequestSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  workflowId: z.string().optional(),
  chatId: z.string().optional(),
  userMessageId: z.string().optional(),
  preferences: z.object({
    llmProvider: z.enum(['anthropic', 'openai']).default('anthropic'),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().min(1).max(8000).default(4000),
    responseStyle: z.enum(['concise', 'detailed', 'friendly', 'technical']).default('friendly'),
    autoExecuteTools: z.boolean().default(false),
    showReasoning: z.boolean().default(false),
  }).optional(),
  stream: z.boolean().default(false),
  context: z.object({
    workflow: z.any().optional(),
    blocks: z.array(z.any()).optional(),
    logs: z.array(z.any()).optional(),
    knowledge: z.array(z.any()).optional(),
  }).optional(),
})

// In-memory storage for conversations (in production, use database)
const conversations = new Map<string, any>()
const agentInstances = new Map<string, OurCopilotAgent>()
const memoryManagers = new Map<string, MemoryManager>()

/**
 * POST /api/our-copilot/chat
 * Main chat endpoint for our copilot agent
 */
export async function POST(req: NextRequest) {
  const requestId = generateRequestId()
  const startTime = Date.now()

  try {
    // Get user session
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const userId = session.user.id
    logger.info(`[${requestId}] Chat request started`, { userId })

    // Parse and validate request
    const body = await req.json()
    const validatedData = ChatRequestSchema.parse(body)

    const {
      message,
      workflowId,
      chatId,
      preferences,
      stream,
      context,
    } = validatedData

    // Get or create agent instance for this user
    let agent = agentInstances.get(userId)
    let memoryManager = memoryManagers.get(userId)

    if (!agent) {
      memoryManager = new MemoryManager(userId)
      agent = new OurCopilotAgent(
        {
          workflowId,
          chatHistory: [],
          userPreferences: preferences || {
            llmProvider: 'anthropic',
            temperature: 0.7,
            maxTokens: 4000,
          },
        },
        preferences?.llmProvider || 'anthropic'
      )

      agentInstances.set(userId, agent)
      memoryManagers.set(userId, memoryManager!)
    }

    // Update agent context with current workflow
    if (workflowId && context?.workflow) {
      memoryManager!.storeWorkflowContext({
        workflowId,
        name: context.workflow.name || 'Untitled Workflow',
        blocks: context.blocks || [],
        executions: [],
      })
    }

    // Store user message in memory
    memoryManager!.storeConversationMessage({
      id: generateId(),
      role: 'user',
      content: message,
      timestamp: new Date(),
    })

    // Process message with agent
    const agentResponse = await agent.processMessage(message)

    // Store assistant response in memory
    memoryManager!.storeConversationMessage({
      id: generateId(),
      role: 'assistant',
      content: agentResponse.message,
      timestamp: new Date(),
      toolCalls: agentResponse.toolCalls,
    })

    // Learn from tool usage
    agentResponse.toolCalls.forEach(toolCall => {
      memoryManager!.learnFromToolUsage(
        toolCall.toolName,
        toolCall.status === 'completed'
      )
    })

    // Update conversation history
    if (chatId) {
      const conversation = conversations.get(chatId) || {
        id: chatId,
        userId,
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      conversation.messages.push(
        {
          id: generateId(),
          role: 'user',
          content: message,
          timestamp: new Date(),
        },
        {
          id: generateId(),
          role: 'assistant',
          content: agentResponse.message,
          timestamp: new Date(),
          toolCalls: agentResponse.toolCalls,
        }
      )
      conversation.updatedAt = new Date()
      conversations.set(chatId, conversation)
    }

    const executionTime = Date.now() - startTime

    // Prepare response
    const response: CopilotResponse = {
      message: agentResponse.message,
      toolCalls: agentResponse.toolCalls,
      reasoning: preferences?.showReasoning ? agentResponse.reasoning : undefined,
      confidence: agentResponse.confidence,
      suggestions: generateSuggestions(agentResponse),
      followUpQuestions: generateFollowUpQuestions(agentResponse, message),
    }

    logger.info(`[${requestId}] Chat request completed`, {
      userId,
      executionTime,
      toolCallsCount: agentResponse.toolCalls.length,
      confidence: agentResponse.confidence,
    })

    // Handle streaming response
    if (stream) {
      return new Response(
        createStreamingResponse(response, requestId),
        {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        }
      )
    }

    return NextResponse.json({
      success: true,
      ...response,
      executionTime,
      requestId,
    })

  } catch (error) {
    logger.error(`[${requestId}] Chat request failed`, error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid request format',
          details: error.errors,
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/our-copilot/chat
 * Get conversation history and user profile
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const userId = session.user.id
    const { searchParams } = new URL(req.url)
    const chatId = searchParams.get('chatId')

    const memoryManager = memoryManagers.get(userId)
    const agent = agentInstances.get(userId)

    if (!memoryManager || !agent) {
      return NextResponse.json({
        success: true,
        conversations: [],
        userProfile: null,
        stats: null,
      })
    }

    const userProfile = memoryManager.getUserProfile()
    const stats = memoryManager.getStats()

    let conversations = []
    if (chatId) {
      const conversation = conversations.get(chatId)
      conversations = conversation ? [conversation] : []
    } else {
      conversations = Array.from(conversations.values())
        .filter(conv => conv.userId === userId)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    }

    return NextResponse.json({
      success: true,
      conversations,
      userProfile,
      stats,
    })

  } catch (error) {
    logger.error('GET chat request failed', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/our-copilot/chat
 * Clear conversation history or reset agent
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const userId = session.user.id
    const { searchParams } = new URL(req.url)
    const chatId = searchParams.get('chatId')
    const resetAgent = searchParams.get('resetAgent') === 'true'

    if (resetAgent) {
      // Reset agent and memory for this user
      agentInstances.delete(userId)
      memoryManagers.delete(userId)
      
      // Clear all conversations for this user
      const userConversations = Array.from(conversations.values())
        .filter(conv => conv.userId === userId)
      
      userConversations.forEach(conv => {
        conversations.delete(conv.id)
      })

      return NextResponse.json({
        success: true,
        message: 'Agent and conversation history reset successfully',
      })
    }

    if (chatId) {
      conversations.delete(chatId)
      return NextResponse.json({
        success: true,
        message: 'Conversation deleted successfully',
      })
    }

    return NextResponse.json(
      { error: 'Specify chatId or resetAgent=true' },
      { status: 400 }
    )

  } catch (error) {
    logger.error('DELETE chat request failed', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * Helper functions
 */

function generateRequestId(): string {
  return Math.random().toString(36).substr(2, 9)
}

function generateId(): string {
  return Math.random().toString(36).substr(2, 9)
}

function generateSuggestions(response: any): string[] {
  const suggestions = []

  if (response.toolCalls && response.toolCalls.length > 0) {
    suggestions.push('Would you like me to execute these tools automatically?')
    suggestions.push('Can I help you analyze the results from these tools?')
  }

  if (response.confidence && response.confidence < 0.7) {
    suggestions.push('Would you like me to try a different approach?')
    suggestions.push('Can you provide more details about what you need?')
  }

  return suggestions
}

function generateFollowUpQuestions(response: any, originalMessage: string): string[] {
  const questions = []

  // Based on tools used
  if (response.toolCalls) {
    const toolNames = response.toolCalls.map((tc: any) => tc.toolName)
    if (toolNames.includes('google_ads_query')) {
      questions.push('Would you like to see a comparison with previous periods?')
      questions.push('Do you want to analyze the performance by specific metrics?')
    }
    if (toolNames.includes('google_ads_v1_query')) {
      questions.push('Would you like me to help you create a monthly deck report?')
      questions.push('Do you need to filter the data by specific campaigns?')
    }
  }

  // Based on message content
  if (originalMessage.toLowerCase().includes('report')) {
    questions.push('Would you like this report in a specific format?')
    questions.push('Do you need to include charts or visualizations?')
  }

  if (originalMessage.toLowerCase().includes('compare')) {
    questions.push('Would you like me to visualize the comparison?')
    questions.push('Do you want to focus on specific metrics?')
  }

  return questions
}

function createStreamingResponse(response: CopilotResponse, requestId: string): ReadableStream {
  return new ReadableStream({
    start(controller) {
      // Send response in chunks
      const chunks = [
        { type: 'start', requestId },
        { type: 'message', content: response.message },
        { type: 'tool_calls', toolCalls: response.toolCalls },
        { type: 'reasoning', reasoning: response.reasoning },
        { type: 'suggestions', suggestions: response.suggestions },
        { type: 'follow_up', questions: response.followUpQuestions },
        { type: 'complete', confidence: response.confidence },
      ]

      let index = 0
      const interval = setInterval(() => {
        if (index < chunks.length) {
          const chunk = chunks[index]
          const data = `data: ${JSON.stringify(chunk)}\n\n`
          controller.enqueue(new TextEncoder().encode(data))
          index++
        } else {
          clearInterval(interval)
          controller.close()
        }
      }, 100) // Send chunks every 100ms
    },
  })
}

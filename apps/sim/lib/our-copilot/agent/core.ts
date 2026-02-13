/**
 * Our Own Copilot Agent - Core Engine
 * Smart LLM-powered agent with tool integration
 */

import { createLogger } from '@sim/logger'
import { tools } from '@/tools/registry'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('OurCopilotAgent')

export interface AgentMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  toolCalls?: ToolCall[]
}

export interface ToolCall {
  id: string
  toolName: string
  parameters: Record<string, any>
  result?: any
  status: 'pending' | 'completed' | 'failed'
  error?: string
}

export interface AgentContext {
  workflowId?: string
  chatHistory: AgentMessage[]
  availableTools: Record<string, ToolConfig>
  userPreferences: {
    model: 'anthropic' | 'openai'
    temperature: number
    maxTokens: number
  }
}

export interface AgentResponse {
  message: string
  toolCalls: ToolCall[]
  reasoning: string
  confidence: number
}

/**
 * Core Copilot Agent Class
 */
export class OurCopilotAgent {
  private context: AgentContext
  private llmProvider: 'anthropic' | 'openai'

  constructor(
    context: Partial<AgentContext> = {},
    llmProvider: 'anthropic' | 'openai' = 'anthropic'
  ) {
    this.context = {
      chatHistory: [],
      availableTools: tools,
      userPreferences: {
        model: llmProvider,
        temperature: 0.7,
        maxTokens: 4000,
      },
      ...context,
    }
    this.llmProvider = llmProvider
  }

  /**
   * Process user message and generate response
   */
  async processMessage(userMessage: string): Promise<AgentResponse> {
    logger.info('Processing user message', { 
      messageLength: userMessage.length,
      llmProvider: this.llmProvider 
    })

    try {
      // 1. Add user message to history
      this.addMessageToHistory({
        id: this.generateId(),
        role: 'user',
        content: userMessage,
        timestamp: new Date(),
      })

      // 2. Analyze intent and select tools
      const { intent, selectedTools, reasoning } = await this.analyzeIntent(userMessage)

      // 3. Execute tools if needed
      const executedToolCalls = await this.executeTools(selectedTools)

      // 4. Generate final response
      const response = await this.generateResponse(userMessage, executedToolCalls, reasoning)

      // 5. Add assistant message to history
      this.addMessageToHistory({
        id: this.generateId(),
        role: 'assistant',
        content: response.message,
        timestamp: new Date(),
        toolCalls: executedToolCalls,
      })

      logger.info('Successfully processed message', {
        toolCallsCount: executedToolCalls.length,
        responseLength: response.message.length,
      })

      return response

    } catch (error) {
      logger.error('Failed to process message', error)
      return {
        message: 'I apologize, but I encountered an error while processing your request. Please try again.',
        toolCalls: [],
        reasoning: 'Error occurred during processing',
        confidence: 0,
      }
    }
  }

  /**
   * Analyze user intent and select appropriate tools
   */
  private async analyzeIntent(message: string): Promise<{
    intent: string
    selectedTools: Array<{ tool: ToolConfig; parameters: Record<string, any> }>
    reasoning: string
  }> {
    // Create tool descriptions for LLM
    const toolDescriptions = Object.entries(this.context.availableTools).map(
      ([key, tool]) => ({
        key,
        name: tool.name,
        description: tool.description,
        params: tool.params,
      })
    )

    const prompt = `
You are an intelligent assistant that analyzes user requests and selects appropriate tools.

User Message: "${message}"

Available Tools:
${toolDescriptions.map(t => `- ${t.key}: ${t.description} (params: ${Object.keys(t.params || {}).join(', ')})`).join('\n')}

Analyze the user's intent and:
1. Identify what they want to accomplish
2. Select relevant tools (if any)
3. Extract parameters for those tools
4. Provide reasoning

Respond with JSON:
{
  "intent": "what the user wants to do",
  "selectedTools": [
    {
      "toolKey": "tool_name",
      "parameters": { "param1": "value1", "param2": "value2" }
    }
  ],
  "reasoning": "why you selected these tools and how they'll help"
}

If no tools are needed, return empty selectedTools array.
`

    const response = await this.callLLM(prompt, {
      temperature: 0.3,
      maxTokens: 2000,
    })

    try {
      const parsed = JSON.parse(response)
      const selectedTools = (parsed.selectedTools || []).map((selection: any) => ({
        tool: this.context.availableTools[selection.toolKey],
        parameters: selection.parameters || {},
      }))

      return {
        intent: parsed.intent || 'general inquiry',
        selectedTools: selectedTools.filter((st: any) => st.tool),
        reasoning: parsed.reasoning || 'Analyzed user request',
      }
    } catch (error) {
      logger.error('Failed to parse LLM response for intent analysis', error)
      return {
        intent: 'general inquiry',
        selectedTools: [],
        reasoning: 'Failed to analyze intent, treating as general conversation',
      }
    }
  }

  /**
   * Execute selected tools
   */
  private async executeTools(
    selectedTools: Array<{ tool: ToolConfig; parameters: Record<string, any> }>
  ): Promise<ToolCall[]> {
    const toolCalls: ToolCall[] = []

    for (const { tool, parameters } of selectedTools) {
      const toolCall: ToolCall = {
        id: this.generateId(),
        toolName: tool.name,
        parameters,
        status: 'pending',
      }

      try {
        logger.info('Executing tool', { toolName: tool.name, parameters })

        // Execute tool based on its configuration
        const result = await this.executeTool(tool, parameters)
        
        toolCall.result = result
        toolCall.status = 'completed'

        logger.info('Tool executed successfully', { toolName: tool.name })
      } catch (error) {
        toolCall.status = 'failed'
        toolCall.error = error instanceof Error ? error.message : 'Unknown error'
        
        logger.error('Tool execution failed', { 
          toolName: tool.name, 
          error: toolCall.error 
        })
      }

      toolCalls.push(toolCall)
    }

    return toolCalls
  }

  /**
   * Execute individual tool
   */
  private async executeTool(
    tool: ToolConfig, 
    parameters: Record<string, any>
  ): Promise<any> {
    // This is where we integrate with the existing tool system
    // For now, we'll simulate tool execution
    
    if (tool.request?.url) {
      const url = typeof tool.request.url === 'function' 
        ? tool.request.url() 
        : tool.request.url

      const body = tool.request?.body 
        ? tool.request.body(parameters)
        : parameters

      const response = await fetch(url, {
        method: (tool.request?.method || 'POST') as string,
        headers: {
          'Content-Type': 'application/json',
          ...tool.request?.headers,
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        throw new Error(`Tool request failed: ${response.status}`)
      }

      const result = await response.json()
      
      // Apply response transformation if available
      if (tool.transformResponse) {
        return await tool.transformResponse(response, parameters)
      }

      return result
    }

    throw new Error(`Tool ${tool.name} doesn't have a valid request configuration`)
  }

  /**
   * Generate final response using LLM
   */
  private async generateResponse(
    userMessage: string,
    toolCalls: ToolCall[],
    reasoning: string
  ): Promise<AgentResponse> {
    const toolResults = toolCalls
      .filter(tc => tc.status === 'completed')
      .map(tc => `${tc.toolName}: ${JSON.stringify(tc.result, null, 2)}`)
      .join('\n\n')

    const toolErrors = toolCalls
      .filter(tc => tc.status === 'failed')
      .map(tc => `${tc.toolName}: ${tc.error}`)
      .join('\n\n')

    const prompt = `
You are an intelligent assistant helping users with their workflow and tasks.

User Message: "${userMessage}"

My Analysis:
${reasoning}

Tool Results:
${toolResults || 'No tools were executed.'}

${toolErrors ? `\nTool Errors:\n${toolErrors}` : ''}

Chat History:
${this.context.chatHistory.slice(-5).map(msg => `${msg.role}: ${msg.content}`).join('\n')}

Based on the user's message, my analysis, and the tool results, provide a helpful and intelligent response. Be conversational, explain what you did, and provide actionable insights.

If there were errors, acknowledge them and suggest alternatives.
`

    const response = await this.callLLM(prompt, {
      temperature: this.context.userPreferences.temperature,
      maxTokens: this.context.userPreferences.maxTokens,
    })

    return {
      message: response,
      toolCalls,
      reasoning,
      confidence: toolCalls.some(tc => tc.status === 'completed') ? 0.8 : 0.6,
    }
  }

  /**
   * Call LLM (Anthropic or OpenAI)
   */
  private async callLLM(prompt: string, options: {
    temperature?: number
    maxTokens?: number
  }): Promise<string> {
    if (this.llmProvider === 'anthropic') {
      return this.callAnthropic(prompt, options)
    } else {
      return this.callOpenAI(prompt, options)
    }
  }

  /**
   * Call Anthropic API
   */
  private async callAnthropic(prompt: string, options: {
    temperature?: number
    maxTokens?: number
  }): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not found in environment')
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: options.maxTokens || 4000,
        temperature: options.temperature || 0.7,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    })

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`)
    }

    const data = await response.json()
    return data.content[0].text
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(prompt: string, options: {
    temperature?: number
    maxTokens?: number
  }): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not found in environment')
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: options.maxTokens || 4000,
        temperature: options.temperature || 0.7,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`)
    }

    const data = await response.json()
    return data.choices[0].message.content
  }

  /**
   * Add message to chat history
   */
  private addMessageToHistory(message: AgentMessage): void {
    this.context.chatHistory.push(message)
    
    // Keep only last 20 messages
    if (this.context.chatHistory.length > 20) {
      this.context.chatHistory = this.context.chatHistory.slice(-20)
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return Math.random().toString(36).substr(2, 9)
  }

  /**
   * Update context
   */
  updateContext(updates: Partial<AgentContext>): void {
    this.context = { ...this.context, ...updates }
  }

  /**
   * Get current context
   */
  getContext(): AgentContext {
    return { ...this.context }
  }
}

/**
 * Our Copilot Agent - Memory & Context Management
 * Handles conversation history, workflow context, and user preferences
 */

import { createLogger } from '@sim/logger'
import { AgentMessage, ToolCall } from './core'

const logger = createLogger('OurCopilotMemory')

export interface MemoryFragment {
  id: string
  type: 'conversation' | 'workflow' | 'tool_result' | 'user_preference'
  content: any
  timestamp: Date
  importance: number // 0-1, higher = more important
  tags: string[]
  expiresAt?: Date
}

export interface WorkflowContext {
  workflowId: string
  name: string
  blocks: Array<{
    id: string
    type: string
    config: any
    status: 'active' | 'inactive' | 'error'
  }>
  executions: Array<{
    id: string
    status: 'running' | 'completed' | 'failed'
    startTime: Date
    endTime?: Date
    results?: any
  }>
}

export interface UserProfile {
  userId: string
  preferences: {
    llmProvider: 'anthropic' | 'openai'
    temperature: number
    maxTokens: number
    responseStyle: 'concise' | 'detailed' | 'friendly'
    autoExecuteTools: boolean
  }
  skills: string[]
  frequentlyUsedTools: string[]
  learningHistory: Array<{
    toolName: string
    success: boolean
    timestamp: Date
  }>
}

/**
 * Memory Manager for Copilot Agent
 */
export class MemoryManager {
  private memories: Map<string, MemoryFragment> = new Map()
  private userProfile: UserProfile | null = null
  private workflowContexts: Map<string, WorkflowContext> = new Map()
  private maxMemories: number = 1000

  constructor(userId?: string) {
    if (userId) {
      this.loadUserProfile(userId)
    }
  }

  /**
   * Store a memory fragment
   */
  storeMemory(fragment: Omit<MemoryFragment, 'id' | 'timestamp'>): string {
    const id = this.generateId()
    const memory: MemoryFragment = {
      ...fragment,
      id,
      timestamp: new Date(),
    }

    this.memories.set(id, memory)
    
    // Cleanup old memories if we exceed limit
    this.cleanupMemories()

    logger.debug('Stored memory fragment', { 
      id, 
      type: fragment.type, 
      importance: fragment.importance 
    })

    return id
  }

  /**
   * Retrieve relevant memories
   */
  retrieveMemories(query: {
    type?: MemoryFragment['type']
    tags?: string[]
    timeRange?: { start: Date; end: Date }
    importance?: number
    limit?: number
  }): MemoryFragment[] {
    let memories = Array.from(this.memories.values())

    // Filter by type
    if (query.type) {
      memories = memories.filter(m => m.type === query.type)
    }

    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      memories = memories.filter(m => 
        query.tags!.some(tag => m.tags.includes(tag))
      )
    }

    // Filter by time range
    if (query.timeRange) {
      memories = memories.filter(m => 
        m.timestamp >= query.timeRange!.start && 
        m.timestamp <= query.timeRange!.end
      )
    }

    // Filter by importance threshold
    if (query.importance !== undefined) {
      memories = memories.filter(m => m.importance >= query.importance!)
    }

    // Sort by importance and timestamp
    memories.sort((a, b) => {
      if (a.importance !== b.importance) {
        return b.importance - a.importance
      }
      return b.timestamp.getTime() - a.timestamp.getTime()
    })

    // Apply limit
    if (query.limit) {
      memories = memories.slice(0, query.limit)
    }

    return memories
  }

  /**
   * Store conversation message
   */
  storeConversationMessage(message: AgentMessage): string {
    return this.storeMemory({
      type: 'conversation',
      content: {
        role: message.role,
        content: message.content,
        toolCalls: message.toolCalls,
      },
      importance: this.calculateMessageImportance(message),
      tags: ['conversation', message.role],
    })
  }

  /**
   * Store tool execution result
   */
  storeToolResult(toolCall: ToolCall): string {
    return this.storeMemory({
      type: 'tool_result',
      content: {
        toolName: toolCall.toolName,
        parameters: toolCall.parameters,
        result: toolCall.result,
        status: toolCall.status,
        error: toolCall.error,
      },
      importance: toolCall.status === 'completed' ? 0.7 : 0.3,
      tags: ['tool', toolCall.toolName, toolCall.status],
    })
  }

  /**
   * Store workflow context
   */
  storeWorkflowContext(context: WorkflowContext): void {
    this.workflowContexts.set(context.workflowId, context)
    
    this.storeMemory({
      type: 'workflow',
      content: context,
      importance: 0.8,
      tags: ['workflow', context.workflowId],
    })
  }

  /**
   * Get workflow context
   */
  getWorkflowContext(workflowId: string): WorkflowContext | null {
    return this.workflowContexts.get(workflowId) || null
  }

  /**
   * Update user profile
   */
  updateUserProfile(updates: Partial<UserProfile>): void {
    if (!this.userProfile) {
      this.userProfile = {
        userId: this.generateId(),
        preferences: {
          llmProvider: 'anthropic',
          temperature: 0.7,
          maxTokens: 4000,
          responseStyle: 'friendly',
          autoExecuteTools: false,
        },
        skills: [],
        frequentlyUsedTools: [],
        learningHistory: [],
      }
    }

    this.userProfile = { ...this.userProfile, ...updates }
    
    this.storeMemory({
      type: 'user_preference',
      content: this.userProfile,
      importance: 0.9,
      tags: ['user', 'profile'],
    })
  }

  /**
   * Get user profile
   */
  getUserProfile(): UserProfile | null {
    return this.userProfile
  }

  /**
   * Learn from tool usage
   */
  learnFromToolUsage(toolName: string, success: boolean): void {
    if (!this.userProfile) return

    // Update frequently used tools
    if (!this.userProfile.frequentlyUsedTools.includes(toolName)) {
      this.userProfile.frequentlyUsedTools.push(toolName)
      // Keep only top 10 frequently used tools
      this.userProfile.frequentlyUsedTools = 
        this.userProfile.frequentlyUsedTools.slice(-10)
    }

    // Add to learning history
    this.userProfile.learningHistory.push({
      toolName,
      success,
      timestamp: new Date(),
    })

    // Keep only last 50 learning events
    this.userProfile.learningHistory = 
      this.userProfile.learningHistory.slice(-50)

    this.updateUserProfile(this.userProfile)
  }

  /**
   * Get contextual memories for current conversation
   */
  getContextualMemories(workflowId?: string, limit: number = 10): MemoryFragment[] {
    const tags = ['conversation']
    if (workflowId) {
      tags.push('workflow', workflowId)
    }

    return this.retrieveMemories({
      tags,
      importance: 0.3,
      limit,
    })
  }

  /**
   * Search memories by content
   */
  searchMemories(searchQuery: string, limit: number = 20): MemoryFragment[] {
    const query = searchQuery.toLowerCase()
    const allMemories = Array.from(this.memories.values())

    const matches = allMemories.filter(memory => {
      const content = JSON.stringify(memory.content).toLowerCase()
      return content.includes(query) || 
             memory.tags.some(tag => tag.toLowerCase().includes(query))
    })

    // Sort by relevance (importance + recency)
    matches.sort((a, b) => {
      const scoreA = a.importance * 0.7 + (Date.now() - a.timestamp.getTime()) / (1000 * 60 * 60) * 0.3
      const scoreB = b.importance * 0.7 + (Date.now() - b.timestamp.getTime()) / (1000 * 60 * 60) * 0.3
      return scoreB - scoreA
    })

    return matches.slice(0, limit)
  }

  /**
   * Calculate message importance
   */
  private calculateMessageImportance(message: AgentMessage): number {
    let importance = 0.5 // base importance

    // User messages are slightly more important
    if (message.role === 'user') {
      importance += 0.1
    }

    // Messages with tool calls are more important
    if (message.toolCalls && message.toolCalls.length > 0) {
      importance += 0.2
    }

    // Longer messages might be more important
    if (message.content.length > 200) {
      importance += 0.1
    }

    // Messages with questions are important
    if (message.content.includes('?')) {
      importance += 0.1
    }

    return Math.min(importance, 1.0)
  }

  /**
   * Cleanup old memories
   */
  private cleanupMemories(): void {
    if (this.memories.size <= this.maxMemories) return

    const memories = Array.from(this.memories.entries())
    
    // Sort by importance and recency
    memories.sort(([, a], [, b]) => {
      const scoreA = a.importance * 0.7 + a.timestamp.getTime() * 0.3
      const scoreB = b.importance * 0.7 + b.timestamp.getTime() * 0.3
      return scoreB - scoreA
    })

    // Remove oldest/least important memories
    const toRemove = memories.slice(this.maxMemories)
    toRemove.forEach(([id]) => this.memories.delete(id))

    logger.debug(`Cleaned up ${toRemove.length} old memories`)
  }

  /**
   * Load user profile from storage (placeholder)
   */
  private loadUserProfile(userId: string): void {
    // In a real implementation, this would load from database
    // For now, we'll create a default profile
    this.userProfile = {
      userId,
      preferences: {
        llmProvider: 'anthropic',
        temperature: 0.7,
        maxTokens: 4000,
        responseStyle: 'friendly',
        autoExecuteTools: false,
      },
      skills: [],
      frequentlyUsedTools: [],
      learningHistory: [],
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return Math.random().toString(36).substr(2, 9)
  }

  /**
   * Get memory statistics
   */
  getStats(): {
    totalMemories: number
    memoriesByType: Record<string, number>
    averageImportance: number
    oldestMemory: Date | null
    newestMemory: Date | null
  } {
    const memories = Array.from(this.memories.values())
    
    const memoriesByType = memories.reduce((acc, memory) => {
      acc[memory.type] = (acc[memory.type] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const averageImportance = memories.reduce((sum, m) => sum + m.importance, 0) / memories.length

    const timestamps = memories.map(m => m.timestamp)
    const oldestMemory = timestamps.length > 0 ? new Date(Math.min(...timestamps.map(t => t.getTime()))) : null
    const newestMemory = timestamps.length > 0 ? new Date(Math.max(...timestamps.map(t => t.getTime()))) : null

    return {
      totalMemories: memories.length,
      memoriesByType,
      averageImportance,
      oldestMemory,
      newestMemory,
    }
  }
}

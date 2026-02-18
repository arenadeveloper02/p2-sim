import { db } from '@sim/db'
import { createLogger } from '@sim/logger'
import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { generateRequestId } from '@/lib/core/utils/request'
import { memoryService } from '@/executor/handlers/agent/memory'
import type { AgentInputs, Message } from '@/executor/handlers/agent/types'
import type { ExecutionContext } from '@/executor/types'
import { extractTextContent } from '@/providers/google/utils'

const logger = createLogger('IntentAnalyzer')

/**
 * Result returned by the intent analyzer.
 */
export interface IntentAnalyzerResult {
  /** Whether the workflow should RUN or be SKIPped */
  decision: 'RUN' | 'SKIP'
  /** Mem0 conversation search results (reusable for RUN path) */
  searchResults: Message[]
  /** Token-limited memory context string built from search results */
  memoryContext: string
  /** Generated LLM response when decision is SKIP */
  skipResponse?: string
}

/**
 * Result from fetching the latest conversation log entry.
 */
export interface LatestConversation {
  initialInput: string | null
  finalChatOutput: string | null
}

/**
 * Parameters for the intent analyzer.
 */
export interface IntentAnalyzerParams {
  ctx: ExecutionContext
  inputs: AgentInputs
  blockId: string
  userPrompt: string
  /** Model identifier used for token limit calculation */
  model?: string
  /** Whether to use Gemini 2.5 Pro instead of OpenAI GPT-4o for intent decision */
  useGemini?: boolean
  /** Fact memories from Mem0 search (optional, will be fetched if not provided) */
  factMemories?: Message[]
}

/**
 * Fetches the intent analyzer system prompt from the prompt_config table.
 * Returns null if unavailable (caller should use a fallback).
 */
async function fetchIntentAnalyzerPrompt(): Promise<string | null> {
  try {
    const { promptConfig } = await import('@sim/db/schema')
    const { PROMPT_CONFIG_KEYS } = await import('@sim/db/constants')

    const rows = await db
      .select({ prompt: promptConfig.prompt })
      .from(promptConfig)
      .where(eq(promptConfig.key, PROMPT_CONFIG_KEYS.INTENT_ANALYZER_SYSTEM_PROMPT))
      .limit(1)

    if (rows.length > 0 && rows[0].prompt) {
      return rows[0].prompt
    }
  } catch (error) {
    logger.warn('Failed to fetch intent analyzer prompt from prompt_config table', { error })
  }

  return null
}

/**
 * Searches Mem0 for conversation memories and builds a token-limited context string.
 * Combines results from searches with and without conversationId filter, sorts by score (ascending),
 * and builds memory context from the sorted combined results.
 */
async function searchAndBuildMemoryContext(
  params: IntentAnalyzerParams
): Promise<{ searchResults: Message[]; memoryContext: string }> {
  const { ctx, inputs, blockId, userPrompt, model } = params

  // Use the reusable function to get combined, deduplicated, and sorted results
  const searchResults = await combineAndSortSearchResults(ctx, inputs, blockId, userPrompt, model)

  logger.debug('Combined and sorted search results count:', searchResults.length)

  // Build token-limited memory context from sorted results
  const { getMemoryTokenLimit } = await import('@/executor/handlers/agent/memory-utils')
  const { getAccurateTokenCount } = await import('@/lib/tokenization/estimators')

  const tokenLimit = getMemoryTokenLimit(model)
  const baseTokens = getAccurateTokenCount(userPrompt, model)
  let currentTokenCount = baseTokens
  let memoryContext = ''

  for (const memory of searchResults) {
    const memoryText = `\nPrevious conversation:\n${memory.role === 'user' ? 'User' : 'Assistant'}: ${memory.content}`
    const memoryTokens = getAccurateTokenCount(memoryText, model)

    if (currentTokenCount + memoryTokens <= tokenLimit) {
      memoryContext += memoryText
      currentTokenCount += memoryTokens
    } else {
      logger.debug('Stopped adding memories due to token limit', {
        blockId,
        tokenLimit,
        currentTokens: currentTokenCount,
        memoryTokens,
      })
      break
    }
  }

  return { searchResults, memoryContext }
}

/**
 * Combines, deduplicates, and sorts raw search results by score (ascending).
 * Returns sorted Message[] array.
 */
export async function combineAndSortSearchResults(
  ctx: ExecutionContext,
  inputs: AgentInputs,
  blockId: string,
  userPrompt: string | undefined,
  model?: string
): Promise<Message[]> {
  // Get raw search results (before conversion to Messages) to access score field
  const rawResultsWithoutConversationId = await getRawSearchResults(
    ctx,
    inputs,
    blockId,
    userPrompt,
    true,
    false
  )

  const rawResultsWithConversationId = await getRawSearchResults(
    ctx,
    inputs,
    blockId,
    userPrompt,
    true,
    true
  )

  // Combine both result sets
  const allRawResults = [
    ...(rawResultsWithoutConversationId || []),
    ...(rawResultsWithConversationId || []),
  ]

  if (allRawResults.length === 0) {
    return []
  }

  // Remove duplicates by id (keep first occurrence)
  const uniqueResults = Array.from(new Map(allRawResults.map((item) => [item.id, item])).values())

  // Sort by score in increasing order (lower score = higher relevance in semantic search)
  const sortedResults = uniqueResults.sort((a, b) => {
    const scoreA = a.score ?? 1.0 // Default to 1.0 if score is missing
    const scoreB = b.score ?? 1.0
    return scoreA - scoreB
  })

  // Convert sorted raw results to Messages
  const searchResults: Message[] = sortedResults
    .map((result) => {
      if (result.memory && typeof result.memory === 'string' && result.role) {
        return {
          role: result.role as 'system' | 'user' | 'assistant',
          content: result.memory,
        }
      }
      return null
    })
    .filter((msg): msg is Message => msg !== null)

  return searchResults
}

/**
 * Gets raw search results from Mem0 API (before conversion to Messages) to access score field.
 */
async function getRawSearchResults(
  ctx: ExecutionContext,
  inputs: AgentInputs,
  blockId: string,
  userPrompt: string | undefined,
  isConversation: boolean,
  includeConversationId: boolean
): Promise<any[] | null> {
  // Only call Mem0 API for chat trigger type
  const triggerType = ctx.metadata?.triggerType
  if (triggerType !== 'chat') {
    return null
  }

  // Skip if userId is not available (required for search API)
  if (!ctx.userId) {
    return null
  }

  try {
    const query = userPrompt || ''

    // Build filters object
    const filters: Record<string, any> = {}

    if (includeConversationId && inputs.conversationId) {
      filters.conversation_id = inputs.conversationId
    }

    if (isConversation === true) {
      filters.memory_type = 'conversation'
    } else {
      filters.memory_type = 'fact'
    }

    const isDeployed = ctx.isDeployedContext ?? false
    const requestId = generateRequestId()

    // Dynamically import searchMemoryAPI to avoid circular dependencies
    const { searchMemoryAPI } = await import('@/app/api/chat/memory-api')

    // Call search API and get raw results
    const rawResults = await searchMemoryAPI(
      requestId,
      query,
      ctx.userId,
      Object.keys(filters).length > 0 ? filters : undefined,
      undefined, // runId
      undefined, // agentId
      isDeployed
    )

    if (!rawResults) {
      return null
    }

    // Extract results array from response
    let results: any[] = []
    if (Array.isArray(rawResults)) {
      results = rawResults
    } else if (rawResults.results && Array.isArray(rawResults.results)) {
      results = rawResults.results
    } else if (rawResults.memories && Array.isArray(rawResults.memories)) {
      results = rawResults.memories
    } else if (rawResults.data && Array.isArray(rawResults.data)) {
      results = rawResults.data
    }

    return results
  } catch (error) {
    logger.error('Failed to get raw search results:', error)
    return null
  }
}

/**
 * Calls GPT-4o or Gemini 2.5 Pro to decide whether the workflow should RUN or be SKIPped.
 */
async function callIntentDecision(
  systemPrompt: string,
  memoryContext: string,
  userPrompt: string,
  lastConversation: LatestConversation | null,
  useGemini = false
): Promise<'RUN' | 'SKIP'> {
  let lastConversationText = ''
  if (lastConversation) {
    const parts: string[] = []
    parts.push(`\LAST CONVERSATION:\n`)
    if (lastConversation.initialInput) {
      parts.push(`User: ${lastConversation.initialInput}`)
    }
    if (lastConversation.finalChatOutput) {
      parts.push(`Assistant: ${lastConversation.finalChatOutput}`)
    }
    if (parts.length > 0) {
      lastConversationText = parts.join('\n')
    }
  }

  // const controllerUserPrompt = `If the current request can be fulfilled using ONLY the information already present in the conversation history, treat it as SAME INTENT.\n${lastConversationText}\n\n. Previous conversation history related to the current user input:\n${memoryContext}\n\nCurrent User Input: ${userPrompt}`

  const controllerUserPrompt = `You are an intent analyzer.
Analyze the user's current request and decide whether to RUN the workflow or SKIP it.
Important:
- If the user question can be answered using the retrieved chat history below,
  return SKIP.
- If answering requires new workflow execution, return RUN.
--------------------------------------------
USER CURRENT MESSAGE
--------------------------------------------
${userPrompt}
--------------------------------------------
${lastConversationText}
--------------------------------------------
SEMANTICALLY RETRIEVED USER CHAT HISTORY
(across multiple chats, may be partial)
--------------------------------------------
${memoryContext}
--------------------------------------------
OUTPUT REQUIREMENT
--------------------------------------------
Return ONLY ONE WORD:
RUN
or
SKIP
`

  try {
    if (useGemini) {
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
      if (!apiKey) {
        logger.warn('GEMINI_API_KEY or GOOGLE_API_KEY not found, defaulting to RUN')
        return 'RUN'
      }

      const modelName = 'gemini-2.5-pro'
      const requestBody: any = {
        contents: [
          {
            parts: [
              {
                text: controllerUserPrompt,
              },
            ],
          },
        ],
        systemInstruction: {
          parts: [
            {
              text: systemPrompt,
            },
          ],
        },
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 50000, // Increased to ensure Gemini can generate "RUN" or "SKIP" response
        },
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        }
      )

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        const errorMessage = error.error?.message || JSON.stringify(error)
        logger.warn(`Failed to call Gemini for intent decision: ${errorMessage}, defaulting to RUN`)
        return 'RUN'
      }

      const data = await response.json()

      const candidate = data.candidates?.[0]
      if (!candidate) {
        logger.warn('No candidates in Gemini API response, defaulting to RUN', {
          responseData: JSON.stringify(data).substring(0, 500),
        })
        return 'RUN'
      }

      if (candidate.finishReason === 'SAFETY') {
        logger.warn('Gemini content was blocked by safety filters, defaulting to RUN')
        return 'RUN'
      }

      // Use the existing utility function to extract text (handles thought parts filtering)
      const decisionText = extractTextContent(candidate)

      // If MAX_TOKENS but we got some text, try to use it
      if (!decisionText && candidate.finishReason === 'MAX_TOKENS') {
        logger.warn(
          'Gemini hit MAX_TOKENS limit, but no text extracted. This may indicate the limit is too low.',
          {
            hasContent: !!candidate.content,
            hasParts: !!candidate.content?.parts,
            partsLength: candidate.content?.parts?.length,
          }
        )
        return 'RUN'
      }

      if (!decisionText) {
        logger.warn('Invalid response structure from Gemini API, defaulting to RUN', {
          finishReason: candidate.finishReason,
          hasContent: !!candidate.content,
          hasParts: !!candidate.content?.parts,
          partsLength: candidate.content?.parts?.length,
          candidateStructure: JSON.stringify(candidate).substring(0, 500),
        })
        return 'RUN'
      }

      const decision = decisionText.trim().toUpperCase()

      if (decision === 'SKIP') {
        logger.debug('Intent analyzer decided SKIP (Gemini)')
        return 'SKIP'
      }

      logger.info('Intent analyzer decided RUN (Gemini)', { decision })
      return 'RUN'
    }
    const { OpenAI } = await import('openai')
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: controllerUserPrompt },
      ],
      temperature: 0,
      max_tokens: 10,
    })

    const decision = completion.choices[0]?.message?.content?.trim().toUpperCase()

    if (decision === 'SKIP') {
      logger.debug('Intent analyzer decided SKIP')
      return 'SKIP'
    }

    logger.info('Intent analyzer decided RUN', { decision })
    return 'RUN'
  } catch (error) {
    const provider = useGemini ? 'Gemini' : 'OpenAI'
    logger.warn(`Failed to call ${provider} for intent decision, defaulting to RUN`, { error })
    return 'RUN'
  }
}

/**
 * Fetches the latest `initial_input` and `final_chat_output` from
 * `workflow_execution_logs` for a given conversationId. Returns null if none found.
 */
export async function fetchLatestConversation(
  conversationId: string
): Promise<LatestConversation | null> {
  try {
    const { workflowExecutionLogs } = await import('@sim/db/schema')

    const rows = await db
      .select({
        initialInput: workflowExecutionLogs.initialInput,
        finalChatOutput: workflowExecutionLogs.finalChatOutput,
      })
      .from(workflowExecutionLogs)
      .where(
        and(
          eq(workflowExecutionLogs.conversationId, conversationId),
          eq(workflowExecutionLogs.status, 'completed'),
          isNotNull(workflowExecutionLogs.finalChatOutput)
        )
      )
      .orderBy(desc(workflowExecutionLogs.startedAt))
      .limit(1)

    if (rows.length > 0 && rows[0].finalChatOutput) {
      return {
        initialInput: rows[0].initialInput,
        finalChatOutput: rows[0].finalChatOutput,
      }
    }
  } catch (error) {
    logger.warn('Failed to fetch latest conversation from workflow_execution_logs', { error })
  }

  return null
}

/**
 * Generates a response using GPT-4o when the workflow is SKIPped.
 * Combines: user prompt + last conversation + fact memories + Mem0 conversation context.
 */
async function generateSkipResponse(
  memoryContext: string,
  userPrompt: string,
  lastConversation: LatestConversation | null,
  factMemories: Message[] = []
): Promise<string> {
  try {
    const { OpenAI } = await import('openai')
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const systemPrompt = `You are a helpful assistant. Answer the user's question using the conversation history provided below. Prioritize information in this order:
1. LAST CONVERSATION (most recent in current thread) - highest priority
2. FACT MEMORIES (relevant facts from previous conversations)
3. SEMANTICALLY RETRIEVED CHAT HISTORY (from other chats) - use as secondary reference

Provide a direct, helpful answer based on the available context. Do not mention that you are using previous conversation data. If the information is not available in the provided context, you can go through internet to find the answer.`

    const contextParts: string[] = []

    // Add last conversation (highest priority)
    if (lastConversation) {
      const lastConvParts: string[] = []
      lastConvParts.push('LAST CONVERSATION (MOST RELEVANT):')
      if (lastConversation.initialInput) {
        lastConvParts.push(`User: ${lastConversation.initialInput}`)
      }
      if (lastConversation.finalChatOutput) {
        lastConvParts.push(`Assistant: ${lastConversation.finalChatOutput}`)
      }
      if (lastConvParts.length > 1) {
        contextParts.push(lastConvParts.join('\n'))
      }
    }

    // Add fact memories
    if (factMemories && factMemories.length > 0) {
      const factParts: string[] = []
      factParts.push('FACT MEMORIES (RELEVANT FACTS):')
      for (const fact of factMemories) {
        factParts.push(`${fact.role === 'user' ? 'User' : 'Assistant'}: ${fact.content}`)
      }
      contextParts.push(factParts.join('\n'))
    }

    // Add semantically retrieved chat history (secondary reference)
    if (memoryContext) {
      contextParts.push(`SEMANTICALLY RETRIEVED CHAT HISTORY (from other chats):\n${memoryContext}`)
    }

    const contextText =
      contextParts.length > 0
        ? contextParts.join('\n\n')
        : 'No previous conversation history available.'

    const userMessage = `Context Information:
${contextText}

User Question: ${userPrompt}

Please provide a helpful answer based on the context above.`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
    })

    const response = completion.choices[0]?.message?.content?.trim()

    if (response) {
      logger.debug('Generated SKIP response from conversation context', {
        hasLastConversation: !!lastConversation,
        factMemoriesCount: factMemories.length,
        hasMemoryContext: !!memoryContext,
      })
      return response
    }

    return 'I was unable to generate a response from the conversation history.'
  } catch (error) {
    logger.warn('Failed to generate SKIP response', { error })
    return 'I was unable to generate a response. Please try again.'
  }
}

/**
 * Analyzes user intent against Mem0 conversation history to decide
 * whether to RUN the workflow or SKIP it (answering from memory).
 *
 * Flow:
 * 1. Search Mem0 for conversation memories based on user input
 * 2. Build token-limited memory context from search results
 * 3. Call LLM to decide RUN or SKIP
 * 4. If SKIP: generate a response from memory context
 * 5. Return decision, search results (reusable for RUN path), and optional skip response
 */
export async function analyzeIntent(params: IntentAnalyzerParams): Promise<IntentAnalyzerResult> {
  const { ctx, userPrompt } = params

  logger.debug('Analyzing intent')
  // 1. Search Mem0 for conversation memories and build token-limited context
  const { searchResults, memoryContext } = await searchAndBuildMemoryContext(params)

  // 2. Fetch the intent analyzer system prompt from DB
  const dbPrompt = await fetchIntentAnalyzerPrompt()

  if (!dbPrompt) {
    logger.warn('No intent analyzer prompt configured in prompt_config table, defaulting to RUN')
    return {
      decision: 'RUN',
      searchResults,
      memoryContext,
    }
  }

  // 3. Fetch the latest conversation from workflow_execution_logs
  const conversationId = params.inputs.conversationId
  const lastConversation = conversationId ? await fetchLatestConversation(conversationId) : null

  // 4. Get fact memories (if not provided)
  const factMemories =
    params.factMemories !== undefined
      ? params.factMemories
      : params.inputs.memoryType
        ? await memoryService.searchMemories(
            ctx,
            params.inputs,
            params.blockId,
            userPrompt,
            false,
            false
          )
        : []

  logger.debug('Intent analyzer context', {
    conversationId,
    hasLastConversation: !!lastConversation,
    factMemoriesCount: factMemories.length,
    conversationMemoriesCount: searchResults.length,
  })

  // 5. Call LLM to decide RUN or SKIP (includes last conversation context)
  const decision = await callIntentDecision(
    dbPrompt,
    memoryContext,
    userPrompt,
    lastConversation,
    params.useGemini ?? false
  )

  logger.debug('Decision:', decision)

  // 6. If SKIP, generate a response using the already-fetched conversation context
  if (decision === 'SKIP') {
    const skipResponse = await generateSkipResponse(
      memoryContext,
      userPrompt,
      lastConversation,
      factMemories
    )
    return {
      decision: 'SKIP',
      searchResults,
      memoryContext,
      skipResponse,
    }
  }

  return {
    decision: 'RUN',
    searchResults,
    memoryContext,
  }
}

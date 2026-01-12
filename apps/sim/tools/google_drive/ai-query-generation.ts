'use server'

import { createLogger } from '@sim/logger'

const logger = createLogger('GoogleDriveAIQueryGeneration')

/**
 * Generates a Google Drive query string using AI intent recognition
 */
export async function buildDriveQueryWithAI(
  prompt: string,
  folderId?: string | null
): Promise<string> {
  const systemPrompt = `You are an expert at building Google Drive API query strings. Your task is to analyze a user's natural language search prompt and generate a valid Google Drive query string.

## Google Drive Query Syntax Rules:

1. **Base requirement**: Always include \`trashed=false\` to exclude trashed files

2. **MIME Type Filters**:
   - PDF: \`mimeType='application/pdf'\`
   - Google Docs: \`mimeType='application/vnd.google-apps.document'\`
   - Google Sheets: \`mimeType='application/vnd.google-apps.spreadsheet'\`
   - Google Slides: \`mimeType='application/vnd.google-apps.presentation'\`
   - Folders: \`mimeType='application/vnd.google-apps.folder'\`
   - Multiple types: Use OR: \`(mimeType='type1' or mimeType='type2')\`

3. **Time Filters** (RFC3339 format):
   - \`modifiedTime >= '2025-01-01T00:00:00Z'\` (files modified after date)
   - \`modifiedTime <= '2025-01-31T23:59:59Z'\` (files modified before date)
   - Parse relative dates:
     * "today" → start of today to now
     * "yesterday" → start of yesterday to end of yesterday
     * "last week" → 7 days ago to now
     * "last month" → 30 days ago to now
     * "last N days" → N days ago to now

4. **Folder Filter**:
   - If folderId is provided: \`'FOLDER_ID' in parents\`
   - Always use the exact folderId string provided

5. **Keyword Search** (CRITICAL - REQUIRED):
   - Google Drive API requires explicit search predicates - it CANNOT infer keywords automatically
   - You MUST ALWAYS extract keywords from the user's prompt and include them in the query
   - If the user mentions any search terms (like "menu", "restaurant", "invoice", "budget", etc.), you MUST add keyword search
   - Use: \`name contains 'keyword'\` or \`fullText contains 'keyword'\` for each meaningful keyword
   - \`fullText\` searches the Drive full-text index (works for Google Docs/Sheets/Slides and indexed text files)
   - \`name\` searches file names
   - For multiple keywords, combine them: \`((name contains 'keyword1' or fullText contains 'keyword1') and (name contains 'keyword2' or fullText contains 'keyword2')) or ((name contains 'keyword1 keyword2' or fullText contains 'keyword2 keyword1'))\`
   - Extract ALL meaningful keywords from the prompt (remove stop words like "find", "search", "show", "me", "the", "give", "of", etc.)
   - If the user says "menu of chef pillai restaurant", extract: "menu", "chef", "pillai", "restaurant"
   - NEVER return a query with only \`trashed=false\` if the user provided search terms

6. **Query Structure**:
   - Combine all conditions with \` and \`
   - Example: \`trashed=false and (mimeType='application/pdf' or mimeType='application/vnd.google-apps.document') and modifiedTime >= '2025-01-01T00:00:00Z' and (name contains 'invoice' or fullText contains 'invoice')\`

## Important Notes:
- The Drive API does NOT automatically infer keywords from natural language - you MUST explicitly add \`name contains\` or \`fullText contains\` predicates
- \`fullText\` only works on indexed content (Google Workspace files and some text-based files)
- **MANDATORY**: If the user's prompt contains ANY search terms, you MUST include keyword search predicates. A query with only \`trashed=false\` is INVALID if the user provided search terms.
- Extract keywords from phrases: "menu of chef pillai restaurant" → keywords: "menu", "chef", "pillai", "restaurant"
- Return ONLY the query string, no explanations or additional text

Now generate the query string for the user's prompt. Return ONLY the query string, nothing else.`

  const userMessage = folderId
    ? `User prompt: "${prompt}"\n\nFolder ID to search in: ${folderId}\n\nGenerate the Google Drive query string.`
    : `User prompt: "${prompt}"\n\nGenerate the Google Drive query string.`

  try {
    // Only run AI query generation on the server side
    if (typeof window !== 'undefined') {
      throw new Error('AI query generation is only available on the server side')
    }

    // Dynamic import to avoid bundling provider code in client components
    const { executeProviderRequest } = await import('@/providers')

    // Try to use Anthropic (Claude) first, fallback to other providers
    // @ts-expect-error - process.env is available in Node.js runtime
    const apiKey = process.env.ANTHROPIC_API_KEY
    // @ts-expect-error - process.env is available in Node.js runtime
    const openaiKey = process.env.OPENAI_API_KEY
    const provider = apiKey ? 'anthropic' : 'openai'
    const model = apiKey ? 'claude-sonnet-4-20250514' : 'gpt-4o'

    logger.info('Generating Drive query with AI', {
      provider,
      model,
      prompt,
      hasFolderId: !!folderId,
    })

    const aiResponse = await executeProviderRequest(provider, {
      model,
      systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
      apiKey: apiKey || openaiKey,
      temperature: 0.0, // Deterministic query generation
      maxTokens: 512, // Query strings are short
    })
    logger.info('AI Response', { aiResponse })
    // Extract text content from response
    let queryString = ''

    // Check for ReadableStream or StreamingExecution first (these don't have content)
    if (aiResponse instanceof ReadableStream) {
      throw new Error('Streaming responses are not supported for query generation')
    }

    if ('stream' in aiResponse && 'execution' in aiResponse) {
      throw new Error('StreamingExecution responses are not supported for query generation')
    }

    // Now we know it's either a string or ProviderResponse
    if (typeof aiResponse === 'string') {
      queryString = aiResponse
    } else if ('content' in aiResponse) {
      // ProviderResponse has content as string or array
      const response = aiResponse as { content: string | Array<{ type?: string; text?: string }> }
      if (typeof response.content === 'string') {
        queryString = response.content
      } else if (Array.isArray(response.content)) {
        // Some providers return content as array of blocks
        const textBlock = response.content.find(
          (block: any) => block.type === 'text' || typeof block === 'string'
        )
        if (textBlock) {
          queryString = typeof textBlock === 'string' ? textBlock : textBlock.text || ''
        }
      }
    }

    // Clean up the response - remove markdown code blocks if present
    queryString = queryString.trim()
    queryString = queryString.replace(/^```[\w]*\n?/g, '').replace(/\n?```$/g, '')
    queryString = queryString.trim()

    if (!queryString) {
      throw new Error('AI did not return a valid query string')
    }

    // Validate that keywords are included if the prompt contains search terms
    const hasSearchTerms = prompt
      .toLowerCase()
      .split(/\s+/)
      .some(
        (word) =>
          word.length > 2 &&
          ![
            'the',
            'and',
            'for',
            'are',
            'but',
            'not',
            'you',
            'all',
            'can',
            'her',
            'was',
            'one',
            'our',
            'out',
            'day',
            'get',
            'has',
            'him',
            'his',
            'how',
            'its',
            'may',
            'new',
            'now',
            'old',
            'see',
            'two',
            'way',
            'who',
            'boy',
            'did',
            'its',
            'let',
            'put',
            'say',
            'she',
            'too',
            'use',
            'give',
            'show',
            'find',
            'search',
          ].includes(word)
      )

    const hasKeywordSearch =
      queryString.includes('name contains') || queryString.includes('fullText contains')

    if (hasSearchTerms && !hasKeywordSearch && queryString === 'trashed=false') {
      logger.warn('AI query missing keywords, extracting and adding them', { prompt, queryString })

      // Extract keywords from prompt
      const stopWords = new Set([
        'find',
        'search',
        'show',
        'me',
        'my',
        'the',
        'a',
        'an',
        'of',
        'for',
        'from',
        'in',
        'on',
        'to',
        'with',
        'and',
        'or',
        'files',
        'file',
        'give',
        'get',
        'list',
        'lists',
        'which',
        'are',
        'is',
        'was',
        'were',
        'be',
        'been',
        'being',
        'have',
        'has',
        'had',
        'do',
        'does',
        'did',
        'available',
        'what',
        'where',
        'when',
        'who',
        'how',
      ])

      const tokens = prompt.match(/[A-Za-z0-9\-_]+/g) || []
      const keywords: string[] = []
      const seen = new Set<string>()

      for (const token of tokens) {
        const lower = token.toLowerCase()
        if (stopWords.has(lower)) continue
        if (token.length < 2) continue
        if (seen.has(lower)) continue

        keywords.push(token)
        seen.add(lower)

        if (keywords.length >= 10) break
      }

      if (keywords.length > 0) {
        const keywordConditions = keywords.map((kw) => {
          const safe = kw.replace(/'/g, "\\'")
          return `(name contains '${safe}' or fullText contains '${safe}')`
        })
        queryString = `trashed=false and ${keywordConditions.join(' and ')}`
        if (folderId) {
          queryString = `${queryString} and '${folderId}' in parents`
        }
        logger.info('Added missing keywords to query', { keywords, queryString })
      }
    }

    logger.info('Generated Drive query with AI', {
      prompt,
      query: queryString,
      folderId,
    })

    return queryString
  } catch (error) {
    logger.error('Failed to generate Drive query with AI', {
      error: error instanceof Error ? error.message : String(error),
      prompt,
      folderId,
    })

    // Fallback to basic query if AI fails
    const fallbackParts: string[] = ['trashed=false']
    if (folderId) {
      fallbackParts.push(`'${folderId}' in parents`)
    }
    const fallbackQuery = fallbackParts.join(' and ')
    logger.warn('Using fallback query', { fallbackQuery })
    return fallbackQuery
  }
}

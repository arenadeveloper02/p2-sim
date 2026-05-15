/**
 * Google Ads Analyzer API Route
 *
 * Consumes the `results` array from the google_ads_v1 block and produces
 * structured, data-grounded analysis (summary, key findings, recommendations,
 * anomalies, optional keyword suggestions, and pre-computed metrics).
 */

import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { generateRequestId } from '@/lib/core/utils/request'
import { executeProviderRequest } from '@/providers'
import { resolveAnalyzerAIProvider } from './ai-provider'
import { computeAggregateMetrics, normalizeInput } from './analyze-utils'
import { ANALYZER_SYSTEM_PROMPT } from './prompt'
import type { AnalyzerRequestBody, AnalyzerStructuredOutput } from './types'

const logger = createLogger('GoogleAdsAnalyzerAPI')

const MAX_ROWS_FOR_LLM = 200
const DEFAULT_DEPTH = 'detailed'
const DEFAULT_FOCUS = 'all'

function safeJsonParse(text: string): AnalyzerStructuredOutput | null {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim()

  try {
    return JSON.parse(stripped) as AnalyzerStructuredOutput
  } catch {
    const match = stripped.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[0]) as AnalyzerStructuredOutput
      } catch {
        return null
      }
    }
    return null
  }
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()
  const startTime = Date.now()

  try {
    const body = (await request.json()) as AnalyzerRequestBody
    const {
      results,
      query,
      query_type,
      tables_used,
      metrics_used,
      totals,
      date_range,
      account,
      depth = DEFAULT_DEPTH,
      focus = DEFAULT_FOCUS,
      question,
    } = body

    const rows = normalizeInput(results)
    if (!Array.isArray(rows)) {
      logger.error(`[${requestId}] results is not an array`, { type: typeof results })
      return NextResponse.json(
        {
          success: false,
          error:
            'Invalid input: `results` must be an array (or JSON string of an array) coming from the google_ads_v1 block.',
        },
        { status: 400 }
      )
    }

    logger.info(`[${requestId}] Analyzer request`, {
      row_count: rows.length,
      query_type,
      depth,
      focus,
      has_question: Boolean(question),
    })

    const computed = computeAggregateMetrics(rows)

    // Truncate rows that go to the LLM to keep token usage sane.
    const truncated = rows.length > MAX_ROWS_FOR_LLM
    const rowsForLlm = truncated ? rows.slice(0, MAX_ROWS_FOR_LLM) : rows

    const { provider, model, apiKey } = resolveAnalyzerAIProvider(logger)
    logger.info(`[${requestId}] Using AI provider`, { provider, model })

    const userPayload = {
      query: query ?? null,
      query_type: query_type ?? null,
      tables_used: tables_used ?? null,
      metrics_used: metrics_used ?? null,
      totals: totals ?? null,
      date_range: date_range ?? null,
      account: account ?? null,
      depth,
      focus,
      question: question ?? null,
      row_count: rows.length,
      truncated_for_llm: truncated,
      computed_metrics: computed,
      results: rowsForLlm,
    }

    const aiResponse = await executeProviderRequest(provider, {
      model,
      systemPrompt: ANALYZER_SYSTEM_PROMPT,
      context: `Analyze the following Google Ads query results and return STRICT JSON per the schema in the system prompt.`,
      messages: [
        {
          role: 'user',
          content: JSON.stringify(userPayload),
        },
      ],
      apiKey,
      temperature: 0.2,
      maxTokens: 4096,
    })

    const rawText =
      typeof aiResponse === 'string'
        ? aiResponse
        : ((aiResponse as { content?: string })?.content ?? JSON.stringify(aiResponse))

    const parsed = safeJsonParse(rawText)
    if (!parsed) {
      logger.error(`[${requestId}] Failed to parse LLM JSON output`)
      return NextResponse.json(
        {
          success: false,
          error: 'Analyzer LLM did not return valid JSON.',
          raw_llm_response: rawText,
        },
        { status: 502 }
      )
    }

    const executionTime = Date.now() - startTime

    return NextResponse.json({
      success: true,
      summary: parsed.summary ?? '',
      key_findings: parsed.key_findings ?? [],
      recommendations: parsed.recommendations ?? [],
      anomalies: parsed.anomalies ?? [],
      keyword_suggestions: parsed.keyword_suggestions ?? [],
      computed_metrics: {
        ...computed,
        ...(parsed.computed_metrics ?? {}),
      },
      row_count: rows.length,
      query_type: query_type ?? null,
      execution_time_ms: executionTime,
      raw_llm_response: rawText,
      question: question ?? null,
    })
  } catch (error) {
    const executionTime = Date.now() - startTime
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error(`[${requestId}] Analyzer failed`, { error: message, executionTime })
    return NextResponse.json(
      {
        success: false,
        error: message,
        details: 'Failed to analyze Google Ads results',
      },
      { status: 500 }
    )
  }
}

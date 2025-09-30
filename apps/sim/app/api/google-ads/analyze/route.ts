import { NextRequest, NextResponse } from 'next/server'
import { createLogger } from '@/lib/logs/console/logger'
import { GoogleAdsAIAnalyzer, isDeepAnalysisRequest } from '../helpers/ai-analysis'

const logger = createLogger('GoogleAdsAnalyzeAPI')

/**
 * POST /api/google-ads/analyze
 * 
 * Handles complex, multi-month analysis requests with AI-powered insights
 * 
 * Request body:
 * {
 *   "prompt": "Deep analysis request...",
 *   "accountId": "7284380454",
 *   "accountName": "AMI"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { prompt, accountId, accountName } = body

    logger.info('Received analysis request', {
      accountName,
      promptLength: prompt?.length
    })

    if (!prompt || !accountId) {
      return NextResponse.json(
        { error: 'Missing required fields: prompt, accountId' },
        { status: 400 }
      )
    }

    // Check if this is a deep analysis request
    if (!isDeepAnalysisRequest(prompt)) {
      return NextResponse.json(
        { 
          error: 'This endpoint is for deep analysis requests only',
          suggestion: 'Use /api/google-ads/query for simple queries'
        },
        { status: 400 }
      )
    }

    // Get OpenAI API key
    const openaiKey = process.env.OPENAI_API_KEY_1 || process.env.OPENAI_API_KEY
    if (!openaiKey) {
      throw new Error('OpenAI API key not configured')
    }

    // Initialize AI analyzer
    const analyzer = new GoogleAdsAIAnalyzer(openaiKey)

    // Generate analysis queries
    const result = await analyzer.analyzePerformance({
      prompt,
      accountId,
      accountName
    })

    logger.info('Analysis queries generated', {
      queryCount: result.queries.length
    })

    // Return the queries to be executed by the frontend/workflow
    return NextResponse.json({
      success: true,
      analysisType: 'deep_dive',
      queries: result.queries,
      accountId,
      accountName,
      message: 'Analysis queries generated. Execute these queries and send results back for insights.'
    })

  } catch (error) {
    logger.error('Analysis request failed', { error })
    
    return NextResponse.json(
      { 
        error: 'Analysis failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/google-ads/analyze/insights
 * 
 * Generate AI insights from collected data
 * 
 * Request body:
 * {
 *   "monthlyData": [...],
 *   "originalPrompt": "..."
 * }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { monthlyData, originalPrompt } = body

    logger.info('Generating insights', {
      monthCount: monthlyData?.length
    })

    if (!monthlyData || !originalPrompt) {
      return NextResponse.json(
        { error: 'Missing required fields: monthlyData, originalPrompt' },
        { status: 400 }
      )
    }

    // Get OpenAI API key
    const openaiKey = process.env.OPENAI_API_KEY_1 || process.env.OPENAI_API_KEY
    if (!openaiKey) {
      throw new Error('OpenAI API key not configured')
    }

    // Initialize AI analyzer
    const analyzer = new GoogleAdsAIAnalyzer(openaiKey)

    // Generate insights
    const insights = await analyzer.generateInsights(monthlyData, originalPrompt)

    logger.info('Insights generated successfully')

    return NextResponse.json({
      success: true,
      ...insights
    })

  } catch (error) {
    logger.error('Insights generation failed', { error })
    
    return NextResponse.json(
      { 
        error: 'Insights generation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

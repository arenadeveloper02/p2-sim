import { type NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/core/config/env'
import { getArenaTokenByWorkflowId } from '../utils/db-utils'
import { createLogger } from '@/lib/logs/console/logger'

const logger = createLogger('ArenaSaveSummaryAPI')

export async function POST(req: NextRequest) {
  try {
    logger.info('Save summary API called')
    const data = await req.json()
    logger.info('Request data received', { 
      hasWorkflowId: !!data.workflowId,
      hasClientId: !!data.clientId,
      hasSummary: !!data.summary,
      summaryLength: data.summary?.length,
    })
    
    const { workflowId, clientId, summary } = data

    if (!workflowId) {
      logger.warn('Missing workflowId')
      return NextResponse.json({ error: 'workflowId is required' }, { status: 400 })
    }
    if (!clientId) {
      logger.warn('Missing clientId')
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 })
    }
    if (!summary) {
      logger.warn('Missing summary')
      return NextResponse.json({ error: 'summary is required' }, { status: 400 })
    }

    logger.info('Fetching Arena token for workflow', { workflowId })
    const tokenObject = await getArenaTokenByWorkflowId(workflowId)
    if (tokenObject.found === false) {
      logger.error('Arena token not found', { reason: tokenObject.reason })
      return NextResponse.json(
        { error: 'Failed to save summary', details: tokenObject.reason },
        { status: 400 }
      )
    }
    const { arenaToken } = tokenObject
    logger.info('Arena token retrieved', { hasToken: !!arenaToken, tokenLength: arenaToken?.length })

    const arenaBackendBaseUrl = env.ARENA_BACKEND_BASE_URL
    const arenaUrl = `${arenaBackendBaseUrl}/sol/v1/agentic/save-summary`
    logger.info('Calling Arena backend', { 
      url: arenaUrl,
      clientId,
      summaryLength: summary.length,
    })

    const res = await fetch(arenaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorisation: arenaToken || '',
      },
      body: JSON.stringify({ clientId, summary }),
    })

    logger.info('Arena backend response received', { 
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
      contentType: res.headers.get('content-type'),
    })

    // Check content type before parsing
    const contentType = res.headers.get('content-type') || ''
    let responseData: any

    if (contentType.includes('application/json')) {
      try {
        responseData = await res.json()
        logger.info('Arena backend response data', { 
          hasError: !!responseData.error,
          hasMessage: !!responseData.message,
          responseKeys: Object.keys(responseData),
        })
      } catch (jsonError) {
        logger.error('Failed to parse JSON response', { error: jsonError })
        const textResponse = await res.text()
        logger.error('Response text', { text: textResponse.substring(0, 500) })
        return NextResponse.json(
          { 
            error: 'Failed to save summary', 
            details: `Invalid JSON response from Arena backend (${res.status} ${res.statusText})`,
            responsePreview: textResponse.substring(0, 200),
          },
          { status: res.status }
        )
      }
    } else {
      // Non-JSON response (likely HTML error page)
      const textResponse = await res.text()
      logger.error('Arena backend returned non-JSON response', { 
        status: res.status,
        contentType,
        responsePreview: textResponse.substring(0, 500),
      })
      return NextResponse.json(
        { 
          error: 'Failed to save summary', 
          details: `Arena backend returned ${res.status} ${res.statusText} (expected JSON, got ${contentType})`,
          responsePreview: textResponse.substring(0, 200),
        },
        { status: res.status }
      )
    }

    if (!res.ok) {
      logger.error('Arena backend returned error', { 
        status: res.status,
        error: responseData.error,
        message: responseData.message,
        details: responseData,
      })
      return NextResponse.json(
        { error: 'Failed to save summary', details: responseData.error || responseData.message || responseData },
        { status: res.status }
      )
    }

    logger.info('Save summary successful')
    return NextResponse.json(responseData, { status: res.status })
  } catch (error) {
    logger.error('Error saving summary to Arena', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json(
      { error: 'Failed to save summary', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}



/**
 * Sim Copilot System Prompt API
 * Returns the dynamically generated system prompt
 */

import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { generateSystemPrompt, getCondensedSystemPrompt } from '@/lib/sim-copilot'

const logger = createLogger('SimCopilotSystemPrompt')

/**
 * GET /api/sim-copilot/system-prompt
 * Get the system prompt for the copilot
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const condensed = searchParams.get('condensed') === 'true'

    const prompt = condensed ? getCondensedSystemPrompt() : generateSystemPrompt()

    return NextResponse.json({
      prompt,
      length: prompt.length,
      condensed,
    })

  } catch (error) {
    logger.error('Sim Copilot system prompt error', { error })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

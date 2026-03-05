/**
 * Sim Copilot Blocks API
 * Returns all available blocks for the copilot
 */

import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getAllBlocks, getBlockInfo, getBlockConfigDetails } from '@/lib/sim-copilot'

const logger = createLogger('SimCopilotBlocks')

/**
 * GET /api/sim-copilot/blocks
 * Get all available blocks
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const blockType = searchParams.get('type')
    const detailed = searchParams.get('detailed') === 'true'

    if (blockType) {
      // Get specific block info
      if (detailed) {
        const details = getBlockConfigDetails(blockType)
        return NextResponse.json({ block: details })
      }
      const block = getBlockInfo(blockType)
      if (!block) {
        return NextResponse.json({ error: `Block type "${blockType}" not found` }, { status: 404 })
      }
      return NextResponse.json({ block })
    }

    // Get all blocks
    const blocks = getAllBlocks()
    
    // Group by category
    const grouped = {
      triggers: blocks.filter(b => b.category === 'triggers'),
      blocks: blocks.filter(b => b.category === 'blocks'),
      tools: blocks.filter(b => b.category === 'tools'),
    }

    return NextResponse.json({
      total: blocks.length,
      grouped,
      blocks: detailed ? blocks : blocks.map(b => ({
        type: b.type,
        name: b.name,
        description: b.description,
        category: b.category,
      })),
    })

  } catch (error) {
    logger.error('Sim Copilot blocks error', { error })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

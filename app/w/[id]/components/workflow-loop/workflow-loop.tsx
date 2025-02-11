import { Loop } from '@/stores/workflow/types'

interface WorkflowLoopProps {
  loopId: string
  loop: Loop
  blocks: Record<string, any>
}

// Pure calculation function - no hooks
function calculateLoopBounds(loop: Loop, blocks: Record<string, any>) {
  // Get all blocks in this loop and filter out any undefined blocks
  const loopBlocks = loop.nodes
    .map((id) => blocks[id])
    .filter(
      (block): block is NonNullable<typeof block> =>
        block !== undefined && block.position !== undefined
    )

  if (!loopBlocks.length) return null

  // Calculate bounds of all blocks in loop
  const bound = loopBlocks.reduce(
    (acc, block) => {
      acc.minX = Math.min(acc.minX, block.position.x)
      acc.minY = Math.min(acc.minY, block.position.y)
      acc.maxX = Math.max(acc.maxX, block.position.x + (block.isWide ? 480 : 320))
      acc.maxY = Math.max(acc.maxY, block.position.y + 200)
      return acc
    },
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  )

  // Add padding around the group
  const PADDING = 50
  return {
    x: bound.minX - PADDING,
    y: bound.minY - PADDING,
    width: bound.maxX - bound.minX + PADDING * 2,
    height: bound.maxY - bound.minY + PADDING * 2,
  }
}

// Helper function to create loop node
export function createLoopNode({ loopId, loop, blocks }: WorkflowLoopProps) {
  const loopBounds = calculateLoopBounds(loop, blocks)
  if (!loopBounds) return null

  return {
    id: `loop-${loopId}`,
    type: 'group',
    position: { x: loopBounds.x, y: loopBounds.y },
    style: {
      backgroundColor: 'rgb(247, 247, 248)',
      border: '1px solid rgb(203, 213, 225)',
      borderRadius: '12px',
      width: loopBounds.width,
      height: loopBounds.height,
      pointerEvents: 'none',
      zIndex: -1,
      isolation: 'isolate',
    },
    data: {
      label: 'Loop',
    },
  }
}

// Helper function to calculate relative position for child blocks
export function getRelativeLoopPosition(
  blockPosition: { x: number; y: number },
  loopBounds: { x: number; y: number }
) {
  return {
    x: blockPosition.x - loopBounds.x,
    y: blockPosition.y - loopBounds.y,
  }
}

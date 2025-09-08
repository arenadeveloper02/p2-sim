import { createLogger } from '@/lib/logs/console/logger'
import type { BlockOutput } from '@/blocks/types'
import { BlockType } from '@/executor/consts'
import type { BlockHandler } from '@/executor/types'
import type { SerializedBlock } from '@/serializer/types'

const logger = createLogger('RespondToChatHandler')
export class respond_to_chatHandler implements BlockHandler {
  canHandle(block: SerializedBlock): boolean {
    return block.metadata?.id === BlockType.RESPONSE
  }

  async execute(block: SerializedBlock, inputs: Record<string, any>): Promise<BlockOutput> {
    logger.info(`Executing response block: ${block.id}`)
    return {
      data: inputs,
    }
  }
}

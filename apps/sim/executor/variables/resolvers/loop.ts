import { createLogger } from '@sim/logger'
import { isReference, normalizeName, parseReferencePath, REFERENCE } from '@/executor/constants'
import { extractBaseBlockId } from '@/executor/utils/subflow-utils'
import {
  navigatePath,
  type ResolutionContext,
  type Resolver,
} from '@/executor/variables/resolvers/reference'
import type { SerializedWorkflow } from '@/serializer/types'

const logger = createLogger('LoopResolver')

export class LoopResolver implements Resolver {
  private nameToLoopId: Map<string, string>

  constructor(private workflow: SerializedWorkflow) {
    // Build a map from normalized loop block names to loop IDs
    // This allows references like <Loop15678.currentItem> to work
    this.nameToLoopId = new Map()
    for (const block of workflow.blocks) {
      if (block.metadata?.id === 'loop' && block.metadata?.name) {
        const normalizedName = normalizeName(block.metadata.name)
        // The loop block's ID matches the loopId in the loops record
        if (workflow.loops?.[block.id]) {
          this.nameToLoopId.set(normalizedName, block.id)
        }
      }
    }
  }

  canResolve(reference: string): boolean {
    if (!isReference(reference)) {
      return false
    }
    const parts = parseReferencePath(reference)
    if (parts.length === 0) {
      return false
    }
    const [type] = parts
    // Support both "loop." prefix and block name-based references for loop blocks
    if (type === REFERENCE.PREFIX.LOOP) {
      return true
    }
    // Check if the first part is a loop block name
    return this.nameToLoopId.has(type)
  }

  resolve(reference: string, context: ResolutionContext): any {
    const parts = parseReferencePath(reference)
    if (parts.length < 2) {
      logger.warn('Invalid loop reference - missing property', { reference })
      return undefined
    }

    const [firstPart, property, ...pathParts] = parts
    let loopId: string | undefined
    let loopScope = context.loopScope

    // Check if this is a block name-based reference (e.g., <Loop15678.currentItem>)
    if (firstPart !== REFERENCE.PREFIX.LOOP) {
      loopId = this.nameToLoopId.get(firstPart)
      if (!loopId) {
        logger.warn('Loop block name not found', { reference, firstPart })
        return undefined
      }
      // Get the loop scope for this specific loop
      loopScope = context.executionContext.loopExecutions?.get(loopId)
    } else {
      // This is a "loop." prefix reference - use current loop scope or find innermost loop
      if (!loopScope) {
        loopId = this.findLoopForBlock(context.currentNodeId)
        if (loopId) {
          loopScope = context.executionContext.loopExecutions?.get(loopId)
        }
      }
    }

    // For 'results' property, we can still resolve from block output state even if loopScope is missing
    // (handles cases where the loop has completed and scope was cleared)
    if (property === 'results' && !loopScope && loopId) {
      const blockOutput = context.executionState.getBlockOutput(loopId, context.currentNodeId)
      if (blockOutput && 'results' in blockOutput) {
        const value = blockOutput.results
        // If there are additional path parts, navigate deeper
        if (pathParts.length > 0) {
          return navigatePath(value, pathParts)
        }
        return value
      }
    }

    if (!loopScope) {
      logger.warn('Loop scope not found', { reference, loopId, firstPart, property })
      return undefined
    }

    let value: any
    switch (property) {
      case 'iteration':
      case 'index':
        value = loopScope.iteration
        break
      case 'item':
      case 'currentItem':
        value = loopScope.item
        break
      case 'items':
        value = loopScope.items
        break
      case 'results':
        // Try to get results from the active loop scope first
        if (loopScope.allIterationOutputs) {
          value = loopScope.allIterationOutputs
        } else {
          // If loop scope doesn't have results, try getting from block output state
          // (this handles cases where the loop has completed and results were stored)
          const blockOutput = context.executionState.getBlockOutput(
            loopId || '',
            context.currentNodeId
          )
          if (blockOutput && 'results' in blockOutput) {
            value = blockOutput.results
          }
        }
        break
      default:
        logger.warn('Unknown loop property', { property })
        return undefined
    }

    // If there are additional path parts, navigate deeper
    if (pathParts.length > 0) {
      return navigatePath(value, pathParts)
    }

    return value
  }

  private findLoopForBlock(blockId: string): string | undefined {
    const baseId = extractBaseBlockId(blockId)
    for (const loopId of Object.keys(this.workflow.loops || {})) {
      const loopConfig = this.workflow.loops[loopId]
      if (loopConfig.nodes.includes(baseId)) {
        return loopId
      }
    }

    return undefined
  }
}

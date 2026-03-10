import { createLogger } from '@sim/logger'
import { isReference, normalizeName, parseReferencePath, REFERENCE } from '@/executor/constants'
import { InvalidFieldError } from '@/executor/utils/block-reference'
import {
  extractBranchIndex,
  findEffectiveContainerId,
  stripCloneSuffixes,
  stripOuterBranchSuffix,
} from '@/executor/utils/subflow-utils'
import {
  navigatePath,
  type ResolutionContext,
  type Resolver,
} from '@/executor/variables/resolvers/reference'
import type { SerializedParallel, SerializedWorkflow } from '@/serializer/types'

const logger = createLogger('ParallelResolver')

export class ParallelResolver implements Resolver {
<<<<<<< HEAD
  private nameToParallelId: Map<string, string>

  constructor(private workflow: SerializedWorkflow) {
    // Build a map from normalized parallel block names to parallel IDs
    // This allows references like <Batch.currentItem> to work
    this.nameToParallelId = new Map()
    for (const block of workflow.blocks) {
      if (block.metadata?.id === 'parallel' && block.metadata?.name) {
        const normalizedName = normalizeName(block.metadata.name)
        // The parallel block's ID matches the parallelId in the parallels record
        if (workflow.parallels?.[block.id]) {
          this.nameToParallelId.set(normalizedName, block.id)
        }
      }
    }
  }
=======
  private parallelNameToId: Map<string, string>
>>>>>>> 078dbda24ffd21ed264551c76e1a5ca5b2c2d5a6

  constructor(private workflow: SerializedWorkflow) {
    this.parallelNameToId = new Map()
    for (const block of workflow.blocks) {
      if (workflow.parallels?.[block.id] && block.metadata?.name) {
        this.parallelNameToId.set(normalizeName(block.metadata.name), block.id)
      }
    }
  }

  private static KNOWN_PROPERTIES = new Set(['index', 'currentItem', 'items'])

  canResolve(reference: string): boolean {
    if (!isReference(reference)) {
      return false
    }
    const parts = parseReferencePath(reference)
    if (parts.length === 0) {
      return false
    }
    const [type] = parts
<<<<<<< HEAD
    // Support both "parallel." prefix and block name-based references for parallel blocks
    if (type === REFERENCE.PREFIX.PARALLEL) {
      return true
    }
    // Check if the first part is a parallel block name
    return this.nameToParallelId.has(type)
=======
    return type === REFERENCE.PREFIX.PARALLEL || this.parallelNameToId.has(type)
>>>>>>> 078dbda24ffd21ed264551c76e1a5ca5b2c2d5a6
  }

  resolve(reference: string, context: ResolutionContext): any {
    const parts = parseReferencePath(reference)
    if (parts.length === 0) {
      logger.warn('Invalid parallel reference', { reference })
      return undefined
    }

<<<<<<< HEAD
    const [firstPart, property, ...pathParts] = parts
    let parallelId: string | undefined
    let parallelScope = context.executionContext.parallelExecutions?.get(context.currentNodeId)

    // Check if this is a block name-based reference (e.g., <Batch.currentItem>)
    if (firstPart !== REFERENCE.PREFIX.PARALLEL) {
      parallelId = this.nameToParallelId.get(firstPart)
      if (!parallelId) {
        logger.warn('Parallel block name not found', { reference, firstPart })
        return undefined
      }
      // Get the parallel scope for this specific parallel
      parallelScope = context.executionContext.parallelExecutions?.get(parallelId)
    } else {
      // This is a "parallel." prefix reference - find the parallel for current block
      parallelId = this.findParallelForBlock(context.currentNodeId)
      if (!parallelId) {
        return undefined
      }
      parallelScope = context.executionContext.parallelExecutions?.get(parallelId)
=======
    const [firstPart, ...rest] = parts
    const isGenericRef = firstPart === REFERENCE.PREFIX.PARALLEL

    // For named references, resolve to the specific parallel ID
    let targetParallelId: string | undefined
    if (isGenericRef) {
      targetParallelId = this.findInnermostParallelForBlock(context.currentNodeId)
    } else {
      targetParallelId = this.parallelNameToId.get(firstPart)
    }

    if (!targetParallelId) {
      return undefined
>>>>>>> 078dbda24ffd21ed264551c76e1a5ca5b2c2d5a6
    }

    // Resolve the effective (possibly cloned) parallel ID for scope lookups
    if (context.executionContext.parallelExecutions) {
      targetParallelId = findEffectiveContainerId(
        targetParallelId,
        context.currentNodeId,
        context.executionContext.parallelExecutions
      )
    }

    // Look up config using the original (non-cloned) ID
    const originalParallelId = stripOuterBranchSuffix(targetParallelId)
    const parallelConfig = this.workflow.parallels?.[originalParallelId]
    if (!parallelConfig) {
      logger.warn('Parallel config not found', { parallelId: targetParallelId })
      return undefined
    }

<<<<<<< HEAD
    // Special handling for 'results' - can be accessed from outside the parallel
    if (property === 'results') {
      const blockOutput = context.executionState.getBlockOutput(
        parallelId || '',
        context.currentNodeId
      )
      if (blockOutput && 'results' in blockOutput) {
        const value = blockOutput.results
        if (pathParts.length > 0) {
          return navigatePath(value, pathParts)
        }
        return value
      }
      return undefined
    }

    // For other properties, we need to be inside a parallel branch
=======
    if (!isGenericRef) {
      if (!this.isBlockInParallelOrDescendant(context.currentNodeId, originalParallelId)) {
        logger.warn('Block is not inside the referenced parallel', {
          reference,
          blockId: context.currentNodeId,
          parallelId: targetParallelId,
        })
        return undefined
      }
    }

>>>>>>> 078dbda24ffd21ed264551c76e1a5ca5b2c2d5a6
    const branchIndex = extractBranchIndex(context.currentNodeId)
    if (branchIndex === null) {
      return undefined
    }

<<<<<<< HEAD
    // First try to get items from the parallel scope (resolved at runtime)
    // This is the same pattern as LoopResolver reading from loopScope.items
=======
    const parallelScope = context.executionContext.parallelExecutions?.get(targetParallelId)
>>>>>>> 078dbda24ffd21ed264551c76e1a5ca5b2c2d5a6
    const distributionItems = parallelScope?.items ?? this.getDistributionItems(parallelConfig)

    const currentItem = this.resolveCurrentItem(distributionItems, branchIndex)

    if (rest.length === 0) {
      const result: Record<string, any> = { index: branchIndex }
      if (distributionItems !== undefined) {
        result.items = distributionItems
        result.currentItem = currentItem
      }
      return result
    }

<<<<<<< HEAD
    // property and pathParts are already destructured from parts at line 58
    if (!ParallelResolver.KNOWN_PROPERTIES.includes(property)) {
=======
    const property = rest[0]
    const pathParts = rest.slice(1)

    if (!ParallelResolver.KNOWN_PROPERTIES.has(property)) {
>>>>>>> 078dbda24ffd21ed264551c76e1a5ca5b2c2d5a6
      const isCollection = parallelConfig.parallelType === 'collection'
      const availableFields = isCollection ? ['index', 'currentItem', 'items'] : ['index']
      throw new InvalidFieldError(firstPart, property, availableFields)
    }

    let value: unknown
    switch (property) {
      case 'index':
        value = branchIndex
        break
      case 'currentItem':
        value = currentItem
        if (value === undefined) return undefined
        break
      case 'items':
        value = distributionItems
        break
    }

    if (pathParts.length > 0) {
      return navigatePath(value, pathParts)
    }

    return value
  }

  private findInnermostParallelForBlock(blockId: string): string | undefined {
    const baseId = stripCloneSuffixes(blockId)
    const parallels = this.workflow.parallels
    if (!parallels) return undefined

    const candidateIds = Object.keys(parallels).filter((parallelId) =>
      parallels[parallelId]?.nodes.includes(baseId)
    )
    if (candidateIds.length === 0) return undefined
    if (candidateIds.length === 1) return candidateIds[0]

    // Return the innermost: the parallel that is not an ancestor of any other candidate.
    // In a valid DAG, exactly one candidate will satisfy this (circular containment is impossible).
    return candidateIds.find((candidateId) =>
      candidateIds.every(
        (otherId) => otherId === candidateId || !parallels[candidateId]?.nodes.includes(otherId)
      )
    )
  }

  private isBlockInParallelOrDescendant(blockId: string, targetParallelId: string): boolean {
    const baseId = stripCloneSuffixes(blockId)
    const parallels = this.workflow.parallels
    if (!parallels) return false

    const targetConfig = parallels[targetParallelId]
    if (!targetConfig) return false

    if (targetConfig.nodes.includes(baseId)) return true

    const directParallelId = this.findInnermostParallelForBlock(blockId)
    if (!directParallelId) return false
    if (directParallelId === targetParallelId) return true

    return this.isParallelNestedInside(directParallelId, targetParallelId)
  }

  private isParallelNestedInside(
    childParallelId: string,
    ancestorParallelId: string,
    visited = new Set<string>()
  ): boolean {
    if (visited.has(ancestorParallelId)) return false
    visited.add(ancestorParallelId)

    const ancestorConfig = this.workflow.parallels?.[ancestorParallelId]
    if (!ancestorConfig) return false

    if (ancestorConfig.nodes.includes(childParallelId)) return true

    for (const nodeId of ancestorConfig.nodes) {
      if (this.workflow.parallels?.[nodeId]) {
        if (this.isParallelNestedInside(childParallelId, nodeId, visited)) {
          return true
        }
      }
    }
    return false
  }

  private resolveCurrentItem(
    distributionItems: unknown[] | undefined,
    branchIndex: number
  ): unknown {
    if (Array.isArray(distributionItems)) {
      return distributionItems[branchIndex]
    }
    if (typeof distributionItems === 'object' && distributionItems !== null) {
      const keys = Object.keys(distributionItems)
      const key = keys[branchIndex]
      return key !== undefined ? (distributionItems as Record<string, unknown>)[key] : undefined
    }
    return undefined
  }

  private getDistributionItems(parallelConfig: SerializedParallel): unknown[] {
    const rawItems = parallelConfig.distribution ?? []

    // Already an array - return as-is
    if (Array.isArray(rawItems)) {
      return rawItems
    }

    // Object - convert to entries array (consistent with loop forEach behavior)
    if (typeof rawItems === 'object' && rawItems !== null) {
      return Object.entries(rawItems)
    }

    // String handling
    if (typeof rawItems === 'string') {
      // Skip references - they should be resolved by the variable resolver
      if (rawItems.startsWith(REFERENCE.START)) {
        return []
      }

      // Try to parse as JSON
      try {
        const parsed = JSON.parse(rawItems.replace(/'/g, '"'))
        if (Array.isArray(parsed)) {
          return parsed
        }
        // Parsed to non-array (e.g. object) - convert to entries
        if (typeof parsed === 'object' && parsed !== null) {
          return Object.entries(parsed)
        }
        return []
      } catch (e) {
        logger.error('Failed to parse distribution items', { rawItems })
        return []
      }
    }

    return []
  }
}

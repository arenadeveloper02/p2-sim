import { createLogger } from '@sim/logger'
import { generateRequestId } from '@/lib/core/utils/request'
import { isExecutionCancelled, isRedisCancellationEnabled } from '@/lib/execution/cancellation'
import { executeInIsolatedVM } from '@/lib/execution/isolated-vm'
import { BlockType, buildLoopIndexCondition, DEFAULTS, EDGE } from '@/executor/constants'
import type { DAG } from '@/executor/dag/builder'
import type { EdgeManager } from '@/executor/execution/edge-manager'
import type { LoopScope } from '@/executor/execution/state'
import type { BlockStateController, ContextExtensions } from '@/executor/execution/types'
import type { ExecutionContext, NormalizedBlockOutput } from '@/executor/types'
import type { LoopConfigWithNodes } from '@/executor/types/loop'
import { replaceValidReferences } from '@/executor/utils/reference-validation'
import {
  addSubflowErrorLog,
  buildSentinelEndId,
  buildSentinelStartId,
  extractBaseBlockId,
  resolveArrayInput,
  validateMaxCount,
} from '@/executor/utils/subflow-utils'
import type { VariableResolver } from '@/executor/variables/resolver'
import type { SerializedLoop } from '@/serializer/types'

const logger = createLogger('LoopOrchestrator')

const LOOP_CONDITION_TIMEOUT_MS = 5000

export type LoopRoute = typeof EDGE.LOOP_CONTINUE | typeof EDGE.LOOP_EXIT

export interface LoopContinuationResult {
  shouldContinue: boolean
  shouldExit: boolean
  selectedRoute: LoopRoute
  aggregatedResults?: NormalizedBlockOutput[][]
}

export class LoopOrchestrator {
  private edgeManager: EdgeManager | null = null
  private contextExtensions: ContextExtensions | null = null

  constructor(
    private dag: DAG,
    private state: BlockStateController,
    private resolver: VariableResolver
  ) {}

  setContextExtensions(contextExtensions: ContextExtensions): void {
    this.contextExtensions = contextExtensions
  }

  setEdgeManager(edgeManager: EdgeManager): void {
    this.edgeManager = edgeManager
  }

  initializeLoopScope(ctx: ExecutionContext, loopId: string): LoopScope {
    const loopConfig = this.dag.loopConfigs.get(loopId) as SerializedLoop | undefined
    if (!loopConfig) {
      throw new Error(`Loop config not found: ${loopId}`)
    }
    const scope: LoopScope = {
      iteration: 0,
      currentIterationOutputs: new Map(),
      allIterationOutputs: [],
    }

    const loopType = loopConfig.loopType

    switch (loopType) {
      case 'for': {
        scope.loopType = 'for'
        const requestedIterations = loopConfig.iterations || DEFAULTS.MAX_LOOP_ITERATIONS

        const iterationError = validateMaxCount(
          requestedIterations,
          DEFAULTS.MAX_LOOP_ITERATIONS,
          'For loop iterations'
        )
        if (iterationError) {
          logger.error(iterationError, { loopId, requestedIterations })
          this.addLoopErrorLog(ctx, loopId, loopType, iterationError, {
            iterations: requestedIterations,
          })
          scope.maxIterations = 0
          scope.validationError = iterationError
          scope.condition = buildLoopIndexCondition(0)
          ctx.loopExecutions?.set(loopId, scope)
          throw new Error(iterationError)
        }

        scope.maxIterations = requestedIterations
        scope.condition = buildLoopIndexCondition(scope.maxIterations)
        break
      }

      case 'forEach': {
        scope.loopType = 'forEach'
        let items: any[]
        try {
          items = this.resolveForEachItems(ctx, loopConfig.forEachItems)
        } catch (error) {
          const errorMessage = `ForEach loop resolution failed: ${error instanceof Error ? error.message : String(error)}`
          logger.error(errorMessage, { loopId, forEachItems: loopConfig.forEachItems })
          this.addLoopErrorLog(ctx, loopId, loopType, errorMessage, {
            forEachItems: loopConfig.forEachItems,
          })
          scope.items = []
          scope.maxIterations = 0
          scope.validationError = errorMessage
          scope.condition = buildLoopIndexCondition(0)
          ctx.loopExecutions?.set(loopId, scope)
          throw new Error(errorMessage)
        }

        const sizeError = validateMaxCount(
          items.length,
          DEFAULTS.MAX_FOREACH_ITEMS,
          'ForEach loop collection size'
        )
        if (sizeError) {
          logger.error(sizeError, { loopId, collectionSize: items.length })
          this.addLoopErrorLog(ctx, loopId, loopType, sizeError, {
            forEachItems: loopConfig.forEachItems,
            collectionSize: items.length,
          })
          scope.items = []
          scope.maxIterations = 0
          scope.validationError = sizeError
          scope.condition = buildLoopIndexCondition(0)
          ctx.loopExecutions?.set(loopId, scope)
          throw new Error(sizeError)
        }

        scope.items = items
        scope.maxIterations = items.length
        scope.item = items[0]
        scope.condition = buildLoopIndexCondition(scope.maxIterations)
        break
      }

      case 'while':
        scope.loopType = 'while'
        scope.condition = loopConfig.whileCondition
        break

      case 'doWhile': {
        scope.loopType = 'doWhile'
        if (loopConfig.doWhileCondition) {
          scope.condition = loopConfig.doWhileCondition
        } else {
          const requestedIterations = loopConfig.iterations || DEFAULTS.MAX_LOOP_ITERATIONS

          const iterationError = validateMaxCount(
            requestedIterations,
            DEFAULTS.MAX_LOOP_ITERATIONS,
            'Do-While loop iterations'
          )
          if (iterationError) {
            logger.error(iterationError, { loopId, requestedIterations })
            this.addLoopErrorLog(ctx, loopId, loopType, iterationError, {
              iterations: requestedIterations,
            })
            scope.maxIterations = 0
            scope.validationError = iterationError
            scope.condition = buildLoopIndexCondition(0)
            ctx.loopExecutions?.set(loopId, scope)
            throw new Error(iterationError)
          }

          scope.maxIterations = requestedIterations
          scope.condition = buildLoopIndexCondition(scope.maxIterations)
        }
        break
      }

      default:
        throw new Error(`Unknown loop type: ${loopType}`)
    }

    if (!ctx.loopExecutions) {
      ctx.loopExecutions = new Map()
    }
    ctx.loopExecutions.set(loopId, scope)
    return scope
  }

  private addLoopErrorLog(
    ctx: ExecutionContext,
    loopId: string,
    loopType: string,
    errorMessage: string,
    inputData?: any
  ): void {
    addSubflowErrorLog(
      ctx,
      loopId,
      'loop',
      errorMessage,
      { loopType, ...inputData },
      this.contextExtensions
    )
  }

  storeLoopNodeOutput(
    ctx: ExecutionContext,
    loopId: string,
    nodeId: string,
    output: NormalizedBlockOutput
  ): void {
    const scope = ctx.loopExecutions?.get(loopId)
    if (!scope) {
      logger.warn('Loop scope not found for node output storage', { loopId, nodeId })
      return
    }

    const baseId = extractBaseBlockId(nodeId)
    scope.currentIterationOutputs.set(baseId, output)
  }

  async evaluateLoopContinuation(
    ctx: ExecutionContext,
    loopId: string
  ): Promise<LoopContinuationResult> {
    const scope = ctx.loopExecutions?.get(loopId)
    if (!scope) {
      logger.error('Loop scope not found during continuation evaluation', { loopId })
      return {
        shouldContinue: false,
        shouldExit: true,
        selectedRoute: EDGE.LOOP_EXIT,
      }
    }

    const useRedis = isRedisCancellationEnabled() && !!ctx.executionId
    let isCancelled = false
    if (useRedis) {
      isCancelled = await isExecutionCancelled(ctx.executionId!)
    } else {
      isCancelled = ctx.abortSignal?.aborted ?? false
    }
    if (isCancelled) {
      logger.info('Loop execution cancelled', { loopId, iteration: scope.iteration })
      return this.createExitResult(ctx, loopId, scope)
    }

    const iterationResults: NormalizedBlockOutput[] = []
    for (const blockOutput of scope.currentIterationOutputs.values()) {
      iterationResults.push(blockOutput)
    }

    if (iterationResults.length > 0) {
      scope.allIterationOutputs.push(iterationResults)
    }

    scope.currentIterationOutputs.clear()

    // Check if a Response block has executed inside this loop iteration
    // Response blocks are terminal and should stop all further execution
    if (this.hasResponseBlockExecuted(ctx, loopId)) {
      logger.info('Response block executed inside loop - stopping execution', { loopId })
      // Return a result that prevents continuation and exit
      // This will stop the loop from continuing to next iteration or exiting to downstream nodes
      return {
        shouldContinue: false,
        shouldExit: false,
        selectedRoute: EDGE.LOOP_EXIT,
      }
    }

    // Verify all nodes inside the loop have completed before allowing continuation
    // This is critical for nested loops - the outer loop should wait for inner loops to complete all iterations
    const allNodesCompleted = this.hasAllLoopNodesCompleted(ctx, loopId)
    if (!allNodesCompleted) {
      // Block continuation but don't exit - this will prevent the loop from continuing
      // until nested loops complete. The execution will wait for nested loops to finish.
      return {
        shouldContinue: false,
        shouldExit: false,
        selectedRoute: EDGE.LOOP_EXIT,
      }
    }

    if (!(await this.evaluateCondition(ctx, scope, scope.iteration + 1))) {
      return this.createExitResult(ctx, loopId, scope)
    }

    scope.iteration++

    if (scope.items && scope.iteration < scope.items.length) {
      scope.item = scope.items[scope.iteration]
    }

    // When an outer loop continues to a new iteration, reset all nested loop scopes
    // This ensures nested loops can execute again for the new outer loop iteration
    this.resetNestedLoopScopes(ctx, loopId)

    return {
      shouldContinue: true,
      shouldExit: false,
      selectedRoute: EDGE.LOOP_CONTINUE,
    }
  }

  private createExitResult(
    ctx: ExecutionContext,
    loopId: string,
    scope: LoopScope
  ): LoopContinuationResult {
    const results = scope.allIterationOutputs
    this.state.setBlockOutput(loopId, { results }, DEFAULTS.EXECUTION_TIME)

    // When a nested loop exits, check if any parent loop's sentinel end needs to be re-triggered
    this.checkAndTriggerParentLoopSentinelEnd(ctx, loopId)

    return {
      shouldContinue: false,
      shouldExit: true,
      selectedRoute: EDGE.LOOP_EXIT,
      aggregatedResults: results,
    }
  }

  /**
   * When a nested loop exits, check if any parent loop's sentinel end is waiting for it
   * and needs to be re-triggered. This ensures outer loops continue after inner loops complete.
   */
  private checkAndTriggerParentLoopSentinelEnd(ctx: ExecutionContext, nestedLoopId: string): void {
    // Find all loops that contain this nested loop
    for (const [parentLoopId, loopConfig] of this.dag.loopConfigs) {
      if (parentLoopId === nestedLoopId) continue // Skip self

      const parentLoopNodes = (loopConfig as LoopConfigWithNodes).nodes || []
      if (parentLoopNodes.includes(nestedLoopId)) {
        // This is a parent loop that contains the nested loop
        const parentSentinelEndId = buildSentinelEndId(parentLoopId)
        const parentSentinelEndExecuted = this.state.hasExecuted(parentSentinelEndId)

        if (parentSentinelEndExecuted) {
          // Parent loop's sentinel end has executed - check if it's waiting for nested loop
          const parentScope = ctx.loopExecutions?.get(parentLoopId)
          if (parentScope) {
            // Check if parent loop has more iterations to run
            const hasMoreIterations =
              (parentScope.loopType === 'for' &&
                parentScope.maxIterations !== undefined &&
                parentScope.allIterationOutputs.length < parentScope.maxIterations) ||
              (parentScope.loopType === 'forEach' &&
                parentScope.items &&
                parentScope.allIterationOutputs.length < parentScope.items.length) ||
              parentScope.loopType === 'while' ||
              parentScope.loopType === 'doWhile'

            if (hasMoreIterations) {
              // Parent loop has more iterations - check if nested loop has now completed
              const nestedLoopCompleted = this.hasNestedLoopCompleted(
                ctx,
                parentLoopId,
                nestedLoopId
              )

              if (nestedLoopCompleted) {
                // Nested loop has completed - re-trigger parent loop's sentinel end
                // Unmark the sentinel end so it can execute again
                this.state.unmarkExecuted(parentSentinelEndId)

                // Add to pending nodes to be re-executed
                if (!ctx.pendingDynamicNodes) {
                  ctx.pendingDynamicNodes = []
                }
                ctx.pendingDynamicNodes.push(parentSentinelEndId)
              }
            }
          }
        }
      }
    }
  }

  /**
   * When an outer loop continues to a new iteration, reset all nested loop scopes
   * so they can execute again for the new outer loop iteration
   */
  private resetNestedLoopScopes(ctx: ExecutionContext, outerLoopId: string): void {
    const loopConfig = this.dag.loopConfigs.get(outerLoopId) as LoopConfigWithNodes | undefined
    if (!loopConfig) return

    const loopNodes = loopConfig.nodes || []
    for (const nodeId of loopNodes) {
      // Check if this node is a nested loop
      if (this.dag.loopConfigs.has(nodeId)) {
        const nestedLoopId = nodeId
        const nestedScope = ctx.loopExecutions?.get(nestedLoopId)

        if (nestedScope) {
          // Clear execution state for all nodes in the nested loop
          this.clearLoopExecutionState(nestedLoopId)

          // Restore loop edges that may have been deactivated
          this.restoreLoopEdges(nestedLoopId)

          // For forEach loops, don't re-initialize here because block outputs
          // (e.g., <api.results>) may not be updated yet. The loop will be
          // re-initialized when its sentinel start node runs (after blocks have executed),
          // which ensures it gets fresh data from the current outer loop iteration.
          // For 'for' loops, re-initialize here as they don't depend on block outputs.
          if (nestedScope.loopType !== 'forEach') {
            // Re-initialize the loop scope with fresh state
            this.initializeLoopScope(ctx, nestedLoopId)
          }
          // For forEach loops, we leave the scope as-is and let the sentinel start
          // re-initialize it with fresh data when it runs. The execution state
          // has been cleared above, so the loop will reset properly.
        }
      }
    }
  }

  /**
   * Check if a nested loop has completed all its iterations
   */
  private hasNestedLoopCompleted(
    ctx: ExecutionContext,
    parentLoopId: string,
    nestedLoopId: string
  ): boolean {
    const nestedScope = ctx.loopExecutions?.get(nestedLoopId)
    if (!nestedScope) {
      // Check if sentinel end has exited
      const nestedSentinelEndId = buildSentinelEndId(nestedLoopId)
      const nestedSentinelEndExecuted = this.state.hasExecuted(nestedSentinelEndId)
      const nestedSentinelEndOutput = this.state.getBlockOutput(nestedSentinelEndId)
      return nestedSentinelEndExecuted && nestedSentinelEndOutput?.shouldExit === true
    }

    const nestedLoopConfig = this.dag.loopConfigs.get(nestedLoopId) as
      | LoopConfigWithNodes
      | undefined
    if (!nestedLoopConfig) return false

    const expectedIterations =
      nestedScope.loopType === 'for'
        ? nestedScope.maxIterations
        : nestedScope.loopType === 'forEach'
          ? nestedScope.items?.length
          : undefined

    if (expectedIterations !== undefined) {
      const completedIterations = nestedScope.allIterationOutputs.length
      const nestedSentinelEndId = buildSentinelEndId(nestedLoopId)
      const nestedSentinelEndExecuted = this.state.hasExecuted(nestedSentinelEndId)
      const nestedSentinelEndOutput = this.state.getBlockOutput(nestedSentinelEndId)

      return (
        completedIterations >= expectedIterations ||
        (nestedSentinelEndExecuted && nestedSentinelEndOutput?.shouldExit === true)
      )
    }

    return false
  }

  private async evaluateCondition(
    ctx: ExecutionContext,
    scope: LoopScope,
    iteration?: number
  ): Promise<boolean> {
    if (!scope.condition) {
      logger.warn('No condition defined for loop')
      return false
    }

    const currentIteration = scope.iteration
    if (iteration !== undefined) {
      scope.iteration = iteration
    }

    const result = await this.evaluateWhileCondition(ctx, scope.condition, scope)

    if (iteration !== undefined) {
      scope.iteration = currentIteration
    }

    return result
  }

  clearLoopExecutionState(loopId: string): void {
    const loopConfig = this.dag.loopConfigs.get(loopId) as LoopConfigWithNodes | undefined
    if (!loopConfig) {
      logger.warn('Loop config not found for state clearing', { loopId })
      return
    }

    const sentinelStartId = buildSentinelStartId(loopId)
    const sentinelEndId = buildSentinelEndId(loopId)
    const loopNodes = loopConfig.nodes

    this.state.unmarkExecuted(sentinelStartId)
    this.state.unmarkExecuted(sentinelEndId)
    for (const loopNodeId of loopNodes) {
      this.state.unmarkExecuted(loopNodeId)
    }
  }

  restoreLoopEdges(loopId: string): void {
    const loopConfig = this.dag.loopConfigs.get(loopId) as LoopConfigWithNodes | undefined
    if (!loopConfig) {
      logger.warn('Loop config not found for edge restoration', { loopId })
      return
    }

    const sentinelStartId = buildSentinelStartId(loopId)
    const sentinelEndId = buildSentinelEndId(loopId)
    const loopNodes = loopConfig.nodes
    const allLoopNodeIds = new Set([sentinelStartId, sentinelEndId, ...loopNodes])

    if (this.edgeManager) {
      this.edgeManager.clearDeactivatedEdgesForNodes(allLoopNodeIds)
    }

    for (const nodeId of allLoopNodeIds) {
      const nodeToRestore = this.dag.nodes.get(nodeId)
      if (!nodeToRestore) continue

      for (const [potentialSourceId, potentialSourceNode] of this.dag.nodes) {
        if (!allLoopNodeIds.has(potentialSourceId)) continue

        for (const [, edge] of potentialSourceNode.outgoingEdges) {
          if (edge.target === nodeId) {
            const isBackwardEdge =
              edge.sourceHandle === EDGE.LOOP_CONTINUE ||
              edge.sourceHandle === EDGE.LOOP_CONTINUE_ALT

            if (!isBackwardEdge) {
              nodeToRestore.incomingEdges.add(potentialSourceId)
            }
          }
        }
      }
    }
  }

  getLoopScope(ctx: ExecutionContext, loopId: string): LoopScope | undefined {
    return ctx.loopExecutions?.get(loopId)
  }

  /**
   * Evaluates the initial condition for loops at the sentinel start.
   * - For while loops, the condition must be checked BEFORE the first iteration.
   * - For forEach loops, skip if the items array is empty.
   * - For for loops, skip if maxIterations is 0.
   * - For doWhile loops, always execute at least once.
   *
   * @returns true if the loop should execute, false if it should be skipped
   */
  async evaluateInitialCondition(ctx: ExecutionContext, loopId: string): Promise<boolean> {
    const scope = ctx.loopExecutions?.get(loopId)
    if (!scope) {
      logger.warn('Loop scope not found for initial condition evaluation', { loopId })
      return true
    }

    // forEach: skip if items array is empty
    if (scope.loopType === 'forEach') {
      if (!scope.items || scope.items.length === 0) {
        logger.info('ForEach loop has empty items, skipping loop body', { loopId })
        return false
      }
      return true
    }

    // for: skip if maxIterations is 0
    if (scope.loopType === 'for') {
      if (scope.maxIterations === 0) {
        logger.info('For loop has 0 iterations, skipping loop body', { loopId })
        return false
      }
      return true
    }

    // doWhile: always execute at least once
    if (scope.loopType === 'doWhile') {
      return true
    }

    // while: check condition before first iteration
    if (scope.loopType === 'while') {
      if (!scope.condition) {
        logger.warn('No condition defined for while loop', { loopId })
        return false
      }

      const result = await this.evaluateWhileCondition(ctx, scope.condition, scope)
      logger.info('While loop initial condition evaluation', {
        loopId,
        condition: scope.condition,
        result,
      })

      return result
    }

    return true
  }

  shouldExecuteLoopNode(_ctx: ExecutionContext, _nodeId: string, _loopId: string): boolean {
    return true
  }

  private findLoopForNode(nodeId: string): string | undefined {
    for (const [loopId, config] of this.dag.loopConfigs) {
      const nodes = (config as any).nodes || []
      if (nodes.includes(nodeId)) {
        return loopId
      }
    }
    return undefined
  }

  private async evaluateWhileCondition(
    ctx: ExecutionContext,
    condition: string,
    scope: LoopScope
  ): Promise<boolean> {
    if (!condition) {
      return false
    }

    try {
      logger.info('Evaluating loop condition', {
        originalCondition: condition,
        iteration: scope.iteration,
        workflowVariables: ctx.workflowVariables,
      })

      const evaluatedCondition = replaceValidReferences(condition, (match) => {
        const resolved = this.resolver.resolveSingleReference(ctx, '', match, scope)
        logger.info('Resolved variable reference in loop condition', {
          reference: match,
          resolvedValue: resolved,
          resolvedType: typeof resolved,
        })
        if (resolved !== undefined) {
          if (typeof resolved === 'boolean' || typeof resolved === 'number') {
            return String(resolved)
          }
          if (typeof resolved === 'string') {
            const lower = resolved.toLowerCase().trim()
            if (lower === 'true' || lower === 'false') {
              return lower
            }
            return `"${resolved}"`
          }
          return JSON.stringify(resolved)
        }
        return match
      })

      const requestId = generateRequestId()
      const code = `return Boolean(${evaluatedCondition})`

      const vmResult = await executeInIsolatedVM({
        code,
        params: {},
        envVars: {},
        contextVariables: {},
        timeoutMs: LOOP_CONDITION_TIMEOUT_MS,
        requestId,
      })

      if (vmResult.error) {
        logger.error('Failed to evaluate loop condition', {
          condition,
          evaluatedCondition,
          error: vmResult.error,
        })
        return false
      }

      const result = Boolean(vmResult.result)

      logger.info('Loop condition evaluation result', {
        originalCondition: condition,
        evaluatedCondition,
        result,
      })

      return result
    } catch (error) {
      logger.error('Failed to evaluate loop condition', { condition, error })
      return false
    }
  }

  private resolveForEachItems(ctx: ExecutionContext, items: any): any[] {
    return resolveArrayInput(ctx, items, this.resolver)
  }

  /**
   * Checks if all nodes inside a loop have completed execution.
   * This includes checking nested loops - all nested loop sentinel end nodes must have completed.
   * Note: The sentinel end node itself is excluded from this check since we're evaluating
   * continuation from within the sentinel end node.
   *
   * For loops with conditional routing (conditions/routers), not all nodes will execute
   * because only one path is taken. In such cases, we check if at least one terminal node
   * has executed (terminal nodes have edges to the sentinel end, indicating a path completed).
   */
  private hasAllLoopNodesCompleted(ctx: ExecutionContext, loopId: string): boolean {
    const loopConfig = this.dag.loopConfigs.get(loopId) as LoopConfigWithNodes | undefined
    if (!loopConfig) {
      logger.warn('Loop config not found for completion check', { loopId })
      return true // If we can't find the config, assume complete to avoid blocking
    }

    const sentinelEndId = buildSentinelEndId(loopId)
    const loopNodes = loopConfig.nodes || []
    const nodesSet = new Set(loopNodes)

    // Find terminal nodes (nodes with edges to sentinel end) - these indicate path completion
    const terminalNodes: string[] = []
    for (const nodeId of loopNodes) {
      if (nodeId === sentinelEndId) continue

      const node = this.dag.nodes.get(nodeId)
      if (!node) continue

      // Check if this node has an edge to the sentinel end (it's a terminal node)
      const hasEdgeToSentinelEnd = Array.from(node.outgoingEdges.values()).some(
        (edge) => edge.target === sentinelEndId
      )

      if (hasEdgeToSentinelEnd) {
        terminalNodes.push(nodeId)
      }
    }

    // Check nested loops first - they must complete before the outer loop continues
    for (const nodeId of loopNodes) {
      if (nodeId === sentinelEndId) continue

      const isNestedLoopId = this.dag.loopConfigs.has(nodeId)
      if (isNestedLoopId) {
        const nestedLoopId = nodeId
        const nestedScope = ctx.loopExecutions?.get(nestedLoopId)

        if (nestedScope) {
          const nestedLoopConfig = this.dag.loopConfigs.get(nestedLoopId) as
            | LoopConfigWithNodes
            | undefined
          if (nestedLoopConfig) {
            const expectedIterations =
              nestedScope.loopType === 'for'
                ? nestedScope.maxIterations
                : nestedScope.loopType === 'forEach'
                  ? nestedScope.items?.length
                  : undefined

            if (expectedIterations !== undefined) {
              const completedIterations = nestedScope.allIterationOutputs.length
              const nestedSentinelEndId = buildSentinelEndId(nestedLoopId)
              const nestedSentinelEndExecuted = this.state.hasExecuted(nestedSentinelEndId)
              const nestedSentinelEndOutput = this.state.getBlockOutput(nestedSentinelEndId)

              const isComplete =
                completedIterations >= expectedIterations ||
                (nestedSentinelEndExecuted && nestedSentinelEndOutput?.shouldExit === true)

              if (!isComplete) {
                return false
              }
            }
          }
        } else {
          const nestedSentinelEndId = buildSentinelEndId(nestedLoopId)
          const nestedSentinelEndExecuted = this.state.hasExecuted(nestedSentinelEndId)
          const nestedSentinelEndOutput = this.state.getBlockOutput(nestedSentinelEndId)

          if (nestedSentinelEndExecuted && nestedSentinelEndOutput?.shouldExit === true) {
            // Loop has completed (exited) - allow continuation
          } else {
            // Loop hasn't started or hasn't completed yet - we should wait
            return false
          }
        }
      }
    }

    // For loops with conditional routing, check if at least one terminal node has executed
    // This handles cases where not all nodes execute due to condition/router branching
    if (terminalNodes.length > 0) {
      const hasTerminalNodeExecuted = terminalNodes.some((nodeId) => this.state.hasExecuted(nodeId))
      if (hasTerminalNodeExecuted) {
        // At least one terminal node has executed, meaning a path has completed
        return true
      }
    }

    // Fallback: If no terminal nodes found (or none executed), check all regular nodes
    // This handles simple loops without conditional routing
    for (const nodeId of loopNodes) {
      if (nodeId === sentinelEndId) continue
      if (this.dag.loopConfigs.has(nodeId)) continue // Nested loops already checked above

      if (!this.state.hasExecuted(nodeId)) {
        return false
      }
    }

    return true
  }

  /**
   * Checks if a Response block has executed inside the loop.
   * Response blocks are terminal and should stop all further execution,
   * including preventing loops from continuing or exiting to downstream nodes.
   */
  private hasResponseBlockExecuted(ctx: ExecutionContext, loopId: string): boolean {
    const loopConfig = this.dag.loopConfigs.get(loopId) as LoopConfigWithNodes | undefined
    if (!loopConfig) {
      return false
    }

    const loopNodes = loopConfig.nodes || []
    const sentinelEndId = buildSentinelEndId(loopId)

    for (const nodeId of loopNodes) {
      if (nodeId === sentinelEndId) continue

      const node = this.dag.nodes.get(nodeId)
      if (!node) continue

      // Check if this node is a Response block
      const blockType = node.block.metadata?.id
      if (blockType === BlockType.RESPONSE) {
        // Check if the Response block has executed
        if (this.state.hasExecuted(nodeId)) {
          const output = this.state.getBlockOutput(nodeId)
          // Response blocks have 'status' and 'data' in their output
          // Verify this is actually a Response block output
          if (output && 'status' in output && 'data' in output) {
            logger.info('Response block found in loop', {
              loopId,
              nodeId,
              blockId: node.block.id,
            })
            return true
          }
        }
      }

      // Also check nested loops for Response blocks
      if (this.dag.loopConfigs.has(nodeId)) {
        const nestedLoopId = nodeId
        if (this.hasResponseBlockExecuted(ctx, nestedLoopId)) {
          return true
        }
      }
    }

    return false
  }
}

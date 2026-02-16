import { createLogger } from '@sim/logger'
import { EDGE } from '@/executor/constants'
import type { DAG, DAGNode } from '@/executor/dag/builder'
import type { DAGEdge } from '@/executor/dag/types'
import type { ExecutionContext, NormalizedBlockOutput } from '@/executor/types'

const logger = createLogger('EdgeManager')

export class EdgeManager {
  private deactivatedEdges = new Set<string>()
  private nodesWithActivatedEdge = new Set<string>()

  constructor(private dag: DAG) {}

  processOutgoingEdges(
    node: DAGNode,
    output: NormalizedBlockOutput,
    skipBackwardsEdge = false,
    ctx?: ExecutionContext
  ): string[] {
    const readyNodes: string[] = []
    const activatedTargets: string[] = []
    const edgesToDeactivate: Array<{ target: string; handle?: string }> = []

    for (const [, edge] of node.outgoingEdges) {
      if (skipBackwardsEdge && this.isBackwardsEdge(edge.sourceHandle)) {
        continue
      }

      if (!this.shouldActivateEdge(edge, output, node, ctx)) {
        if (!this.isLoopEdge(edge.sourceHandle)) {
          edgesToDeactivate.push({ target: edge.target, handle: edge.sourceHandle })
        }
        continue
      }

      activatedTargets.push(edge.target)
    }

    // Track nodes that have received at least one activated edge
    for (const targetId of activatedTargets) {
      this.nodesWithActivatedEdge.add(targetId)
    }

    const cascadeTargets = new Set<string>()
    for (const { target, handle } of edgesToDeactivate) {
      this.deactivateEdgeAndDescendants(node.id, target, handle, cascadeTargets)
    }

    if (activatedTargets.length === 0) {
      for (const { target } of edgesToDeactivate) {
        if (this.isTerminalControlNode(target)) {
          cascadeTargets.add(target)
        }
      }
    }

    for (const targetId of activatedTargets) {
      const targetNode = this.dag.nodes.get(targetId)
      if (!targetNode) {
        logger.warn('Target node not found', { target: targetId })
        continue
      }
      targetNode.incomingEdges.delete(node.id)
    }

    for (const targetId of activatedTargets) {
      if (this.isTargetReady(targetId)) {
        readyNodes.push(targetId)
      }
    }

    for (const targetId of cascadeTargets) {
      if (!readyNodes.includes(targetId) && !activatedTargets.includes(targetId)) {
        if (this.isTargetReady(targetId)) {
          readyNodes.push(targetId)
        }
      }
    }

    // Check if any deactivation targets that previously received an activated edge are now ready
    for (const { target } of edgesToDeactivate) {
      if (
        !readyNodes.includes(target) &&
        !activatedTargets.includes(target) &&
        this.nodesWithActivatedEdge.has(target) &&
        this.isTargetReady(target)
      ) {
        readyNodes.push(target)
      }
    }

    return readyNodes
  }

  isNodeReady(node: DAGNode): boolean {
    return node.incomingEdges.size === 0 || this.countActiveIncomingEdges(node) === 0
  }

  restoreIncomingEdge(targetNodeId: string, sourceNodeId: string): void {
    const targetNode = this.dag.nodes.get(targetNodeId)
    if (!targetNode) {
      logger.warn('Cannot restore edge - target node not found', { targetNodeId })
      return
    }

    targetNode.incomingEdges.add(sourceNodeId)
  }

  clearDeactivatedEdges(): void {
    this.deactivatedEdges.clear()
    this.nodesWithActivatedEdge.clear()
  }

  /**
   * Clear deactivated edges for a set of nodes (used when restoring loop state for next iteration).
   */
  clearDeactivatedEdgesForNodes(nodeIds: Set<string>): void {
    const edgesToRemove: string[] = []
    for (const edgeKey of this.deactivatedEdges) {
      for (const nodeId of nodeIds) {
        if (edgeKey.startsWith(`${nodeId}-`) || edgeKey.includes(`-${nodeId}-`)) {
          edgesToRemove.push(edgeKey)
          break
        }
      }
    }
    for (const edgeKey of edgesToRemove) {
      this.deactivatedEdges.delete(edgeKey)
    }
    // Also clear activated edge tracking for these nodes
    for (const nodeId of nodeIds) {
      this.nodesWithActivatedEdge.delete(nodeId)
    }
  }

  private isTargetReady(targetId: string): boolean {
    const targetNode = this.dag.nodes.get(targetId)
    return targetNode ? this.isNodeReady(targetNode) : false
  }

  public isNodeSkipped(nodeId: string): boolean {
    const node = this.dag.nodes.get(nodeId)
    if (!node) return false

    // If node has already executed, it wasn't skipped
    // (Note: caller should verify execution state first if relevant, but this is safe)

    // If it has active incoming edges (count > 0, excluding deactivated), it's not skipped
    // If incomingEdges is empty, it's either a start node or already ready/executed
    if (node.incomingEdges.size === 0) return false

    // Check if ALL remaining incoming edges are deactivated
    // If even one is potential (not in deactivated set), the node is NOT skipped (yet)
    // Note: incomingEdges contains sourceNodeIds
    for (const sourceId of node.incomingEdges) {
      const sourceNode = this.dag.nodes.get(sourceId)
      if (!sourceNode) continue

      let allEdgesFromSourceDeactivated = true
      // We must check ALL edges from this source to this target
      for (const [, edge] of sourceNode.outgoingEdges) {
        if (edge.target === nodeId) {
          const edgeKey = this.createEdgeKey(sourceId, nodeId, edge.sourceHandle)
          if (!this.deactivatedEdges.has(edgeKey)) {
            allEdgesFromSourceDeactivated = false
            break
          }
        }
      }

      if (!allEdgesFromSourceDeactivated) {
        return false // Found a potential incoming edge
      }
    }

    // All incoming connections are deactivated
    return true
  }

  private isLoopEdge(handle?: string): boolean {
    return (
      handle === EDGE.LOOP_CONTINUE ||
      handle === EDGE.LOOP_CONTINUE_ALT ||
      handle === EDGE.LOOP_EXIT
    )
  }

  private isControlEdge(handle?: string): boolean {
    return (
      handle === EDGE.LOOP_CONTINUE ||
      handle === EDGE.LOOP_CONTINUE_ALT ||
      handle === EDGE.LOOP_EXIT ||
      handle === EDGE.PARALLEL_EXIT
    )
  }

  private isBackwardsEdge(sourceHandle?: string): boolean {
    return sourceHandle === EDGE.LOOP_CONTINUE || sourceHandle === EDGE.LOOP_CONTINUE_ALT
  }

  private isTerminalControlNode(nodeId: string): boolean {
    const node = this.dag.nodes.get(nodeId)
    if (!node || node.outgoingEdges.size === 0) return false

    for (const [, edge] of node.outgoingEdges) {
      if (!this.isControlEdge(edge.sourceHandle)) {
        return false
      }
    }
    return true
  }

  private shouldActivateEdge(
    edge: DAGEdge,
    output: NormalizedBlockOutput,
    sourceNode: DAGNode,
    ctx?: ExecutionContext
  ): boolean {
    const handle = edge.sourceHandle

    // CRITICAL: For LOOP_EXIT edges, only activate when shouldExit is explicitly true
    // This prevents blocks from executing prematurely when loops continue or wait for nested loops
    // Check handle first to catch all LOOP_EXIT edges regardless of selectedRoute value
    if (handle === EDGE.LOOP_EXIT) {
      // Only activate if both conditions are met:
      // 1. shouldExit is explicitly true (loop has actually exited)
      // 2. selectedRoute matches LOOP_EXIT (confirming this is an exit, not a continue)
      return output?.shouldExit === true && output?.selectedRoute === EDGE.LOOP_EXIT
    }

    // CRITICAL: For LOOP_CONTINUE edges, only activate when selectedRoute is LOOP_CONTINUE
    // This prevents LOOP_CONTINUE edges from activating when the loop is exiting
    // Check by handle first to explicitly block LOOP_CONTINUE edges when route is LOOP_EXIT
    if (handle === EDGE.LOOP_CONTINUE || handle === EDGE.LOOP_CONTINUE_ALT) {
      return output?.selectedRoute === EDGE.LOOP_CONTINUE
    }

    if (output.selectedRoute === EDGE.PARALLEL_EXIT) {
      return handle === EDGE.PARALLEL_EXIT
    }

    // CRITICAL: If sentinel start is exiting (shouldExit: true), deactivate all regular edges
    // to nodes inside the loop body. This prevents loop body nodes from executing when
    // the loop should be skipped (e.g., empty forEach collection).
    if (!handle) {
      // Check if source is a sentinel start that's exiting
      const isSentinelStartExiting =
        sourceNode.metadata.isSentinel &&
        sourceNode.metadata.sentinelType === 'start' &&
        output?.shouldExit === true &&
        output?.selectedRoute === EDGE.LOOP_EXIT

      if (isSentinelStartExiting) {
        // Check if target node is inside the loop (has the same loopId)
        const targetNode = this.dag.nodes.get(edge.target)
        const sourceLoopId = sourceNode.metadata.loopId
        const targetLoopId = targetNode?.metadata.loopId

        // If target is inside the loop, deactivate this edge
        if (sourceLoopId && targetLoopId === sourceLoopId) {
          return false
        }
      }

      return true
    }

    if (handle.startsWith(EDGE.CONDITION_PREFIX)) {
      const conditionValue = handle.substring(EDGE.CONDITION_PREFIX.length)
      return output.selectedOption === conditionValue
    }

    if (handle.startsWith(EDGE.ROUTER_PREFIX)) {
      const routeId = handle.substring(EDGE.ROUTER_PREFIX.length)
      return output.selectedRoute === routeId
    }

    switch (handle) {
      case EDGE.ERROR:
        return !!output.error

      case EDGE.SOURCE:
        return !output.error

      default:
        return true
    }
  }

  private deactivateEdgeAndDescendants(
    sourceId: string,
    targetId: string,
    sourceHandle?: string,
    cascadeTargets?: Set<string>,
    isCascade = false
  ): void {
    const edgeKey = this.createEdgeKey(sourceId, targetId, sourceHandle)
    if (this.deactivatedEdges.has(edgeKey)) {
      return
    }

    this.deactivatedEdges.add(edgeKey)

    const targetNode = this.dag.nodes.get(targetId)
    if (!targetNode) return

    if (isCascade && this.isTerminalControlNode(targetId)) {
      cascadeTargets?.add(targetId)
    }

    // Don't cascade if node has active incoming edges OR has received an activated edge
    if (
      this.hasActiveIncomingEdges(targetNode, edgeKey) ||
      this.nodesWithActivatedEdge.has(targetId)
    ) {
      return
    }

    for (const [, outgoingEdge] of targetNode.outgoingEdges) {
      if (!this.isControlEdge(outgoingEdge.sourceHandle)) {
        this.deactivateEdgeAndDescendants(
          targetId,
          outgoingEdge.target,
          outgoingEdge.sourceHandle,
          cascadeTargets,
          true
        )
      }
    }
  }

  /**
   * Checks if a node has any active incoming edges besides the one being excluded.
   */
  private hasActiveIncomingEdges(node: DAGNode, excludeEdgeKey: string): boolean {
    for (const incomingSourceId of node.incomingEdges) {
      const incomingNode = this.dag.nodes.get(incomingSourceId)
      if (!incomingNode) continue

      for (const [, incomingEdge] of incomingNode.outgoingEdges) {
        if (incomingEdge.target === node.id) {
          const incomingEdgeKey = this.createEdgeKey(
            incomingSourceId,
            node.id,
            incomingEdge.sourceHandle
          )
          if (incomingEdgeKey === excludeEdgeKey) continue
          if (!this.deactivatedEdges.has(incomingEdgeKey)) {
            return true
          }
        }
      }
    }

    return false
  }

  private countActiveIncomingEdges(node: DAGNode): number {
    let count = 0

    for (const sourceId of node.incomingEdges) {
      const sourceNode = this.dag.nodes.get(sourceId)
      if (!sourceNode) continue

      for (const [, edge] of sourceNode.outgoingEdges) {
        if (edge.target === node.id) {
          const edgeKey = this.createEdgeKey(sourceId, edge.target, edge.sourceHandle)
          if (!this.deactivatedEdges.has(edgeKey)) {
            count++
            break
          }
        }
      }
    }

    return count
  }

  private createEdgeKey(sourceId: string, targetId: string, sourceHandle?: string): string {
    return `${sourceId}-${targetId}-${sourceHandle ?? EDGE.DEFAULT}`
  }
}

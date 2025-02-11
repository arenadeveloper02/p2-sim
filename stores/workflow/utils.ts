import { Edge } from 'reactflow'

/**
 * Performs a depth-first search to detect cycles in the graph
 * @param edges - List of all edges in the graph
 * @param startNode - Starting node for cycle detection
 * @returns boolean indicating if a cycle was detected and the path of the cycle if found
 */
export function detectCycle(edges: Edge[], startNode: string): { hasCycle: boolean; path: string[] } {
  const visited = new Set<string>()
  const recursionStack = new Set<string>()
  const pathMap = new Map<string, string>()
  
  function dfs(node: string): boolean {
    // Add to both visited and recursion stack
    visited.add(node)
    recursionStack.add(node)
    
    // Get all neighbors of current node
    const neighbors = edges
      .filter(edge => edge.source === node)
      .map(edge => edge.target)
    
    for (const neighbor of neighbors) {
      // If not visited, explore that path
      if (!visited.has(neighbor)) {
        pathMap.set(neighbor, node)
        if (dfs(neighbor)) return true
      }
      // If the neighbor is in recursion stack, we found a cycle
      else if (recursionStack.has(neighbor)) {
        // Record the last edge of the cycle
        pathMap.set(neighbor, node)
        return true
      }
    }
    
    // Remove from recursion stack when backtracking
    recursionStack.delete(node)
    return false
  }
  
  // Perform DFS and construct cycle path if found
  const hasCycle = dfs(startNode)
  
  // If cycle found, construct the path and ensure no duplicates
  const cyclePath: string[] = []
  if (hasCycle) {
    let current = startNode
    const seenNodes = new Set<string>()
    
    do {
      // Only add node if we haven't seen it before
      if (!seenNodes.has(current)) {
        cyclePath.unshift(current)
        seenNodes.add(current)
      }
      current = pathMap.get(current)!
    } while (current !== startNode && current !== undefined)
    
    // Add starting node only if it's not already in the path
    if (current === startNode && !seenNodes.has(startNode)) {
      cyclePath.unshift(startNode)
    }
  }
  
  return { hasCycle, path: cyclePath }
} 
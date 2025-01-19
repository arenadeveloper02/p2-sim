import { BlockState } from '@/stores/workflow/types'
import { Edge } from 'reactflow'
import { Serializer } from '@/serializer'
import { Executor } from '@/executor'

export interface WorkflowExecutionResult {
  success: boolean
  data?: Record<string, any>
  error?: string
}

/**
 * Executes a workflow with the given blocks and edges
 * @param blocks - The blocks in the workflow
 * @param edges - The connections between blocks
 * @param workflowId - The ID of the workflow
 * @returns A promise that resolves to the workflow execution result
 */
export async function executeWorkflow(
  blocks: Record<string, BlockState>,
  edges: Edge[],
  workflowId: string
): Promise<WorkflowExecutionResult> {
  try {
    // 1. Serialize the workflow
    const serializer = new Serializer()
    const serializedWorkflow = serializer.serializeWorkflow(blocks, edges)

    // 2. Create executor and run workflow
    const executor = new Executor(serializedWorkflow)
    const result = await executor.execute(workflowId)

    // 3. Return result
    if (result.success) {
      console.log('Workflow executed successfully:', result.data)
      return {
        success: true,
        data: result.data
      }
    } else {
      console.error('Workflow execution failed:', result.error)
      return {
        success: false,
        error: result.error
      }
    }
  } catch (error: any) {
    console.error('Error executing workflow:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
} 
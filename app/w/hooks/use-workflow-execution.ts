import { useState } from 'react'
import { useWorkflowStore } from '@/stores/workflow/workflow-store'
import { useNotificationStore } from '@/stores/notifications/notifications-store'
import { executeWorkflow } from '@/lib/workflow'

export function useWorkflowExecution() {
  const [isExecuting, setIsExecuting] = useState(false)
  const [executionResult, setExecutionResult] = useState<any>(null)
  const { blocks, edges } = useWorkflowStore()
  const { addNotification } = useNotificationStore()

  const handleRunWorkflow = async () => {
    try {
      setIsExecuting(true)
      setExecutionResult(null)

      const result = await executeWorkflow(
        blocks,
        edges,
        window.location.pathname.split('/').pop() || 'workflow'
      )

      setExecutionResult(result)

      if (result.success) {
        addNotification('console', 'Workflow completed successfully')
      } else {
        addNotification('error', `Failed to execute workflow: ${result.error}`)
      }
    } catch (error: any) {
      console.error('Error executing workflow:', error)
      setExecutionResult({
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      })
      addNotification('error', `Failed to execute workflow: ${error.message}`)
    } finally {
      setIsExecuting(false)
    }
  }

  return {
    isExecuting,
    executionResult,
    handleRunWorkflow
  }
} 
import { useCallback, useState } from 'react'
import { useWorkflowStore } from '@/stores/workflow/workflow-store'
import { Serializer } from '@/serializer'
import { Executor } from '@/executor'
import { ExecutionResult } from '@/executor/types'
import { useNotificationStore } from '@/stores/notifications/notifications-store'

export function useWorkflowExecution() {
  const [isExecuting, setIsExecuting] = useState(false)
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null)
  const { blocks, edges } = useWorkflowStore()
  const { addNotification } = useNotificationStore()

  const handleRunWorkflow = useCallback(async () => {
    setIsExecuting(true)
    try {
      // Extract existing block states
      const currentBlockStates = Object.entries(blocks).reduce((acc, [id, block]) => {
        if (block.subBlocks?.response?.value !== undefined) {
          acc[id] = { response: block.subBlocks.response.value }
        }
        return acc
      }, {} as Record<string, any>)

      // Execute workflow
      const executor = new Executor(
        new Serializer().serializeWorkflow(blocks, edges),
        currentBlockStates
      )
      
      const result = await executor.execute(crypto.randomUUID())
      setExecutionResult(result)

      // Show execution result
      addNotification(
        result.success ? 'console' : 'error',
        result.success 
          ? 'Workflow completed successfully'
          : `Failed to execute workflow: ${result.error}`
      )

      // Log detailed result to console
      if (result.success) {
        console.group('Workflow Execution Result')
        console.log('Status: ✅ Success')
        console.log('Data:', result.data)
        if (result.metadata) {
          console.log('Duration:', result.metadata.duration + 'ms')
          console.log('Start Time:', new Date(result.metadata.startTime).toLocaleTimeString())
          console.log('End Time:', new Date(result.metadata.endTime).toLocaleTimeString())
        }
        console.groupEnd()
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setExecutionResult({
        success: false,
        data: {},
        error: errorMessage
      })
      addNotification('error', `Failed to execute workflow: ${errorMessage}`)
    } finally {
      setIsExecuting(false)
    }
  }, [blocks, edges, addNotification])

  return { isExecuting, executionResult, handleRunWorkflow }
} 
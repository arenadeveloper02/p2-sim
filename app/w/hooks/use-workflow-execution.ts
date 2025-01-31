import { useCallback, useState } from 'react'
import { useWorkflowStore } from '@/stores/workflow/store'
import { Serializer } from '@/serializer'
import { Executor } from '@/executor'
import { ExecutionResult } from '@/executor/types'
import { useNotificationStore } from '@/stores/notifications/store'
import { useWorkflowRegistry } from '@/stores/workflow/registry'

export function useWorkflowExecution() {
  const [isExecuting, setIsExecuting] = useState(false)
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null)
  const { blocks, edges } = useWorkflowStore()
  const { activeWorkflowId } = useWorkflowRegistry()
  const { addNotification } = useNotificationStore()

  const handleRunWorkflow = useCallback(async () => {
    setIsExecuting(true)
    try {
      // Extract existing block states
      const currentBlockStates = Object.entries(blocks).reduce((acc, [id, block]) => {
        const responseValue = block.subBlocks?.response?.value
        if (responseValue !== undefined) {
          acc[id] = { response: responseValue }
        }
        return acc
      }, {} as Record<string, any>)

      // Execute workflow
      const workflow = new Serializer().serializeWorkflow(blocks, edges)
      const executor = new Executor(workflow, currentBlockStates)
      
      const result = await executor.execute('my-run-id')
      setExecutionResult(result)

      if (result.logs) {
        console.group('Detailed Block Logs')
        result.logs.forEach((log) => {
          console.log(`Block ${log.blockTitle}: Success=${log.success}`, {
            output: log.output,
            error: log.error,
            durationMs: log.durationMs,
            startedAt: log.startedAt,
            endedAt: log.endedAt
          })
        })
        console.groupEnd()
      }

      // Show execution result with workflowId
      addNotification(
        result.success ? 'console' : 'error',
        result.success 
          ? 'Workflow completed successfully'
          : `Workflow execution failed: ${result.error}`,
        activeWorkflowId
      )

      // Also log final output info
      if (result.success) {
        console.group('Final Output')
        console.log('Status: ✅ Success')
        console.log('Output:', result.output)
        if (result.metadata) {
          console.log('Duration:', result.metadata.duration + 'ms')
          console.log('StartedAt:', new Date(result.metadata.startTime).toLocaleTimeString())
          console.log('EndedAt:', new Date(result.metadata.endTime).toLocaleTimeString())
        }
        console.groupEnd()
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setExecutionResult({
        success: false,
        output: { response: {} },
        error: errorMessage
      })
      addNotification('error', `Workflow execution failed: ${errorMessage}`, activeWorkflowId)
    } finally {
      setIsExecuting(false)
    }
  }, [blocks, edges, addNotification, activeWorkflowId])

  return { isExecuting, executionResult, handleRunWorkflow }
} 
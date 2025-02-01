import { useCallback, useState } from 'react'
import { useWorkflowStore } from '@/stores/workflow/store'
import { Serializer } from '@/serializer'
import { Executor } from '@/executor'
import { ExecutionResult } from '@/executor/types'
import { useNotificationStore } from '@/stores/notifications/store'
import { useWorkflowRegistry } from '@/stores/workflow/registry'
import { useConsoleStore } from '@/stores/console/store'

export function useWorkflowExecution() {
  const [isExecuting, setIsExecuting] = useState(false)
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null)
  const { blocks, edges } = useWorkflowStore()
  const { activeWorkflowId } = useWorkflowRegistry()
  const { addNotification } = useNotificationStore()
  const { addConsole } = useConsoleStore()

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

      // Add console entries for each block execution
      if (result.logs) {
        result.logs.forEach((log) => {
          addConsole({
            output: log.output,
            error: log.error,
            durationMs: log.durationMs,
            startedAt: log.startedAt,
            endedAt: log.endedAt,
            workflowId: activeWorkflowId,
            timestamp: log.startedAt,
            blockName: log.blockTitle,
            blockType: log.blockType
          })
        })
      }

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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setExecutionResult({
        success: false,
        output: { response: {} },
        error: errorMessage
      })

      // Add error entry to console
      addConsole({
        output: {},
        error: errorMessage,
        durationMs: -1,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        workflowId: activeWorkflowId,
        timestamp: new Date().toISOString(),
        blockName: 'Error'
      })

      addNotification('error', `Workflow execution failed: ${errorMessage}`, activeWorkflowId)
    } finally {
      setIsExecuting(false)
    }
  }, [blocks, edges, addNotification, activeWorkflowId, addConsole])

  return { isExecuting, executionResult, handleRunWorkflow }
} 
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import {
  extractOutputSchemaFromBlocks,
  outputSchemaFromWorkflowFields,
} from '@/lib/arena-generative-ui/from-workflow'
import type { ArenaGenerativeSchemaField } from '@/lib/arena-generative-ui/output-schema'
import type { ArenaGenerativeApiBinding } from '@/lib/arena-generative-ui/types'
import { loadDeployedWorkflowState } from '@/lib/workflows/persistence/utils'

const logger = createLogger('ArenaBindingSchemaRefresh')

/**
 * Replaces each workflow binding's `outputSchema` with the deployed Response /
 * Agent fields when those exist. HTTP bindings and workflows with no declared
 * output keep the stored schema (including a pasted sample).
 */
export async function refreshWorkflowBindingOutputSchemas(
  bindings: ArenaGenerativeApiBinding[]
): Promise<ArenaGenerativeApiBinding[]> {
  const workflowIds = [
    ...new Set(
      bindings
        .filter((binding) => binding.kind === 'workflow' && Boolean(binding.workflowId?.trim()))
        .map((binding) => binding.workflowId as string)
    ),
  ]
  if (workflowIds.length === 0) {
    return bindings
  }

  const deployedSchemas = new Map<string, ArenaGenerativeSchemaField[]>()
  await Promise.all(
    workflowIds.map(async (workflowId) => {
      const outputSchema = await loadOutputSchema(workflowId)
      if (outputSchema) {
        deployedSchemas.set(workflowId, outputSchema)
      }
    })
  )

  return bindings.map((binding) => {
    if (binding.kind !== 'workflow' || !binding.workflowId) {
      return binding
    }
    const outputSchema = deployedSchemas.get(binding.workflowId)
    if (!outputSchema) {
      return binding
    }
    return { ...binding, outputSchema }
  })
}

async function loadOutputSchema(workflowId: string) {
  try {
    const deployed = await loadDeployedWorkflowState(workflowId)
    return outputSchemaFromWorkflowFields(extractOutputSchemaFromBlocks(deployed.blocks))
  } catch (error) {
    logger.warn('Could not refresh outputSchema from deployed workflow', {
      workflowId,
      error: getErrorMessage(error),
    })
    return undefined
  }
}

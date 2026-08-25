import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import {
  declaredOutputSchemaNeedsLastRunFallback,
  extractOutputSchemaFromBlocks,
  outputSchemaFromWorkflowFields,
} from '@/lib/arena-generative-ui/from-workflow'
import { loadLastSuccessfulRunOutputSchema } from '@/lib/arena-generative-ui/last-run-output-schema'
import type { ArenaGenerativeSchemaField } from '@/lib/arena-generative-ui/output-schema'
import type { ArenaGenerativeApiBinding } from '@/lib/arena-generative-ui/types'
import { loadDeployedWorkflowState } from '@/lib/workflows/persistence/utils'

const logger = createLogger('ArenaBindingSchemaRefresh')

interface ResolvedWorkflowOutputSchema {
  fields: ArenaGenerativeSchemaField[]
  warnings: string[]
}

/**
 * Replaces each workflow binding's `outputSchema` with the deployed Response /
 * Agent fields when those exist. A stub or empty declaration falls back to the
 * last successful run. HTTP bindings, workflows with no schema at all, and
 * bindings whose schema came from Sample response keep the stored schema.
 */
export async function refreshWorkflowBindingOutputSchemas(
  bindings: ArenaGenerativeApiBinding[]
): Promise<ArenaGenerativeApiBinding[]> {
  const workflowIds = [
    ...new Set(
      bindings
        .filter(
          (binding) =>
            binding.kind === 'workflow' &&
            Boolean(binding.workflowId?.trim()) &&
            !hasSampleOutputSchema(binding)
        )
        .map((binding) => binding.workflowId as string)
    ),
  ]
  if (workflowIds.length === 0) {
    return bindings
  }

  const deployedSchemas = new Map<string, ResolvedWorkflowOutputSchema>()
  await Promise.all(
    workflowIds.map(async (workflowId) => {
      const resolved = await loadOutputSchema(workflowId)
      if (resolved) {
        deployedSchemas.set(workflowId, resolved)
      }
    })
  )

  return bindings.map((binding) => {
    if (binding.kind !== 'workflow' || !binding.workflowId || hasSampleOutputSchema(binding)) {
      return binding
    }
    const resolved = deployedSchemas.get(binding.workflowId)
    if (!resolved) {
      return binding
    }
    const { outputSchemaWarnings: _dropped, ...rest } = binding
    return {
      ...rest,
      outputSchema: resolved.fields,
      ...(resolved.warnings.length > 0 ? { outputSchemaWarnings: resolved.warnings } : {}),
    }
  })
}

function hasSampleOutputSchema(binding: ArenaGenerativeApiBinding): boolean {
  return binding.outputSchemaSource === 'sample' && (binding.outputSchema?.length ?? 0) > 0
}

async function loadOutputSchema(
  workflowId: string
): Promise<ResolvedWorkflowOutputSchema | undefined> {
  try {
    const deployed = await loadDeployedWorkflowState(workflowId)
    const declared =
      outputSchemaFromWorkflowFields(extractOutputSchemaFromBlocks(deployed.blocks)) ?? []
    if (!declaredOutputSchemaNeedsLastRunFallback(declared)) {
      return { fields: declared, warnings: [] }
    }
    return mergeDeclaredWithLastRun(workflowId, declared, deployed.deploymentVersionId)
  } catch (error) {
    logger.warn('Could not refresh outputSchema from deployed workflow', {
      workflowId,
      error: getErrorMessage(error),
    })
    return mergeDeclaredWithLastRun(workflowId, [], null)
  }
}

async function mergeDeclaredWithLastRun(
  workflowId: string,
  declared: ArenaGenerativeSchemaField[],
  activeDeploymentVersionId: string | null
): Promise<ResolvedWorkflowOutputSchema | undefined> {
  const lastRun = await loadLastSuccessfulRunOutputSchema(workflowId, {
    activeDeploymentVersionId,
  })
  if (lastRun.fields.length > 0) {
    return { fields: lastRun.fields, warnings: lastRun.warnings }
  }
  if (declared.length > 0) {
    return { fields: declared, warnings: lastRun.found ? lastRun.warnings : [] }
  }
  return undefined
}

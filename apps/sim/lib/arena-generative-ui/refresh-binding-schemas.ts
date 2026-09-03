import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { chatProtocolFromWorkflowFields } from '@/lib/arena-generative-ui/chat-protocol'
import {
  declaredOutputSchemaNeedsLastRunFallback,
  extractOutputSchemaFromBlocks,
  extractResponseOutputSchemaFromBlocks,
  outputSchemaFromWorkflowFields,
} from '@/lib/arena-generative-ui/from-workflow'
import { loadLastSuccessfulRunOutputSchema } from '@/lib/arena-generative-ui/last-run-output-schema'
import type { ArenaGenerativeSchemaField } from '@/lib/arena-generative-ui/output-schema'
import type { ArenaGenerativeApiBinding } from '@/lib/arena-generative-ui/types'
import { extractInputFieldsFromBlocks } from '@/lib/workflows/input-format'
import { loadDeployedWorkflowState } from '@/lib/workflows/persistence/utils'

const logger = createLogger('ArenaBindingSchemaRefresh')

interface ResolvedWorkflowOutputSchema {
  fields: ArenaGenerativeSchemaField[]
  warnings: string[]
  chatProtocol?: ArenaGenerativeApiBinding['chatProtocol']
}

/**
 * Replaces each workflow binding's `outputSchema` with a nested authored
 * Response body when that exists. Otherwise the last successful run wins over
 * Agent `responseFormat`. HTTP bindings and Sample pastes keep the stored schema.
 * `chatProtocol` is always refreshed from the deployed Start reserved fields.
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
    if (binding.kind !== 'workflow' || !binding.workflowId) {
      return binding
    }
    const resolved = deployedSchemas.get(binding.workflowId)
    if (!resolved) {
      return binding
    }
    const withProtocol = resolved.chatProtocol
      ? { ...binding, chatProtocol: resolved.chatProtocol }
      : binding
    if (hasSampleOutputSchema(withProtocol) || resolved.fields.length === 0) {
      return withProtocol
    }
    const { outputSchemaWarnings: _dropped, ...rest } = withProtocol
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
    const chatProtocol = chatProtocolFromWorkflowFields(
      extractInputFieldsFromBlocks(deployed.blocks)
    )
    const fromResponse = extractResponseOutputSchemaFromBlocks(deployed.blocks)
    const declared =
      outputSchemaFromWorkflowFields(extractOutputSchemaFromBlocks(deployed.blocks)) ?? []
    if (!declaredOutputSchemaNeedsLastRunFallback(fromResponse) && fromResponse.length > 0) {
      const fields = outputSchemaFromWorkflowFields(fromResponse) ?? fromResponse
      return { fields, warnings: [], ...(chatProtocol ? { chatProtocol } : {}) }
    }
    const merged = await mergeDeclaredWithLastRun(
      workflowId,
      declared,
      deployed.deploymentVersionId
    )
    if (!merged && !chatProtocol) return undefined
    return {
      fields: merged?.fields ?? [],
      warnings: merged?.warnings ?? [],
      ...(chatProtocol ? { chatProtocol } : {}),
    }
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

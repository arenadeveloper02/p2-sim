import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { chatProtocolFromWorkflowFields } from '@/lib/arena-generative-ui/chat-protocol'
import {
  extractOutputSchemaFromBlocks,
  outputSchemaFromWorkflowFields,
} from '@/lib/arena-generative-ui/from-workflow'
import { loadLastSuccessfulRunOutputSchema } from '@/lib/arena-generative-ui/last-run-output-schema'
import {
  type ArenaGenerativeSchemaField,
  effectiveOutputSchema,
  namedSchemaFields,
  unwrapHttpEnvelopeSchemaFields,
} from '@/lib/arena-generative-ui/output-schema'
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
 * Replaces each workflow binding's `outputSchema`. Sample pastes are re-walked
 * (Response envelopes unwrap) and then kept. Otherwise last successful run,
 * then deployed Response, then Agent `responseFormat`. `chatProtocol` always
 * refreshes from Start reserved fields.
 */
export async function refreshWorkflowBindingOutputSchemas(
  bindings: ArenaGenerativeApiBinding[]
): Promise<ArenaGenerativeApiBinding[]> {
  const withSamples = bindings.map((binding) => {
    if (binding.outputSchemaSource !== 'sample') {
      return binding
    }
    return { ...binding, outputSchema: effectiveOutputSchema(binding) }
  })
  const workflowIds = [
    ...new Set(
      withSamples
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
    return withSamples
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

  return withSamples.map((binding) => {
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
      outputSchema: unwrapHttpEnvelopeSchemaFields(namedSchemaFields(resolved.fields)),
      ...(resolved.warnings.length > 0 ? { outputSchemaWarnings: resolved.warnings } : {}),
    }
  })
}

function hasSampleOutputSchema(binding: ArenaGenerativeApiBinding): boolean {
  return binding.outputSchemaSource === 'sample'
}

async function loadOutputSchema(
  workflowId: string
): Promise<ResolvedWorkflowOutputSchema | undefined> {
  try {
    const deployed = await loadDeployedWorkflowState(workflowId)
    const chatProtocol = chatProtocolFromWorkflowFields(
      extractInputFieldsFromBlocks(deployed.blocks)
    )
    const declared =
      outputSchemaFromWorkflowFields(extractOutputSchemaFromBlocks(deployed.blocks)) ?? []
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

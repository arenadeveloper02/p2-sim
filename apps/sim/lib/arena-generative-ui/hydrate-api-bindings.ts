import { db } from '@sim/db'
import { workflow } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { eq } from 'drizzle-orm'
import { httpBindingFromCurl } from '@/lib/arena-generative-ui/from-curl'
import {
  extractOutputSchemaFromBlocks,
  workflowBindingFromSelection,
} from '@/lib/arena-generative-ui/from-workflow'
import { parseApiBindings, parseLooseJsonValue } from '@/lib/arena-generative-ui/parse-inputs'
import type { ArenaGenerativeApiBinding } from '@/lib/arena-generative-ui/types'
import { extractInputFieldsFromBlocks } from '@/lib/workflows/input-format'
import {
  loadDeployedWorkflowState,
  NoActiveDeploymentError,
} from '@/lib/workflows/persistence/utils'

const logger = createLogger('HydrateApiBindings')

export interface HydrateApiBindingsDeps {
  loadDeployedState?: (
    workflowId: string,
    workspaceId?: string
  ) => Promise<{ blocks: Record<string, unknown> }>
  lookupWorkflowWorkspace?: (workflowId: string) => Promise<string | undefined>
}

export interface HydrateApiBindingsResult {
  json: string
  warnings: string[]
}

/**
 * Turns Copilot stub `apiBindings` (workflow id or curl) into the same JSON
 * Add-an-API would write. Invalid JSON fails closed. Undeployed backends keep
 * a stub and warn — publish still refuses them.
 */
export async function hydrateApiBindingsForCopilot(
  raw: unknown,
  options: { workspaceId?: string },
  deps: HydrateApiBindingsDeps = {}
): Promise<HydrateApiBindingsResult> {
  if (raw == null || raw === '') {
    return { json: '', warnings: [] }
  }
  if (typeof raw === 'string' && raw.trim() === '') {
    return { json: '', warnings: [] }
  }

  let parsed: unknown
  try {
    parsed = parseLooseJsonValue(raw)
  } catch {
    throw new Error('apiBindings must be valid JSON')
  }
  if (parsed == null || (Array.isArray(parsed) && parsed.length === 0)) {
    return { json: '', warnings: [] }
  }
  if (!Array.isArray(parsed)) {
    throw new Error('apiBindings must be a JSON array')
  }

  const warnings: string[] = []
  const byKey = new Map<string, ArenaGenerativeApiBinding>()
  for (const [index, item] of parsed.entries()) {
    const hydrated = await hydrateOneBinding(item, index, options, deps, warnings)
    if (hydrated) {
      byKey.set(hydrated.key, hydrated)
    }
  }
  const bindings = [...byKey.values()]
  return {
    json: bindings.length === 0 ? '' : JSON.stringify(bindings, null, 2),
    warnings,
  }
}

const ARENA_GENERATIVE_UI_TYPE = 'arena_generative_ui'

interface CopilotEditOperation {
  operation_type?: string
  block_id?: string
  params?: Record<string, unknown>
}

/**
 * Hydrates `apiBindings` on add/edit ops for Arena Generative UI before the
 * sync edit-workflow engine runs. Mutates the operations in place.
 */
export async function hydrateArenaGenerativeUiApiBindingsInOperations(
  operations: CopilotEditOperation[],
  options: {
    workspaceId?: string
    existingBlocks?: Record<string, { type?: unknown }>
  },
  deps: HydrateApiBindingsDeps = {}
): Promise<{ warnings: string[] }> {
  const warnings: string[] = []
  for (const operation of operations) {
    if (
      operation.operation_type === 'delete' ||
      operation.operation_type === 'extract_from_subflow'
    ) {
      continue
    }
    const params = operation.params
    if (!params) continue
    const existingType = options.existingBlocks?.[operation.block_id ?? '']?.type
    const type = typeof params.type === 'string' ? params.type : existingType
    if (
      type === ARENA_GENERATIVE_UI_TYPE &&
      isRecord(params.inputs) &&
      'apiBindings' in params.inputs
    ) {
      const result = await hydrateApiBindingsForCopilot(
        params.inputs.apiBindings,
        { workspaceId: options.workspaceId },
        deps
      )
      params.inputs.apiBindings = result.json
      warnings.push(...result.warnings)
    }
    await hydrateNestedNodes(params.nestedNodes, options, deps, warnings)
  }
  return { warnings }
}

async function hydrateNestedNodes(
  nodes: unknown,
  options: {
    workspaceId?: string
    existingBlocks?: Record<string, { type?: unknown }>
  },
  deps: HydrateApiBindingsDeps,
  warnings: string[]
): Promise<void> {
  if (!isRecord(nodes)) return
  for (const child of Object.values(nodes)) {
    if (!isRecord(child)) continue
    if (
      child.type === ARENA_GENERATIVE_UI_TYPE &&
      isRecord(child.inputs) &&
      'apiBindings' in child.inputs
    ) {
      const result = await hydrateApiBindingsForCopilot(
        child.inputs.apiBindings,
        { workspaceId: options.workspaceId },
        deps
      )
      child.inputs.apiBindings = result.json
      warnings.push(...result.warnings)
    }
    await hydrateNestedNodes(child.nestedNodes, options, deps, warnings)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

async function hydrateOneBinding(
  item: unknown,
  index: number,
  options: { workspaceId?: string },
  deps: HydrateApiBindingsDeps,
  warnings: string[]
): Promise<ArenaGenerativeApiBinding | undefined> {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`apiBindings[${index}] must be an object`)
  }
  const record = item as Record<string, unknown>
  const key = typeof record.key === 'string' ? record.key.trim() : ''
  if (!key) {
    throw new Error(`apiBindings[${index}].key is required`)
  }
  const label = typeof record.label === 'string' && record.label.trim() ? record.label.trim() : key
  const stream = record.stream === true
  const outputSample =
    typeof record.outputSample === 'string' && record.outputSample.trim()
      ? record.outputSample
      : undefined
  const curl = typeof record.curl === 'string' ? record.curl.trim() : ''
  const kind = record.kind === 'http' ? 'http' : record.kind === 'workflow' ? 'workflow' : null

  if (curl && kind !== 'workflow') {
    const secretName =
      typeof record.headersSecretName === 'string' && record.headersSecretName.trim()
        ? record.headersSecretName.trim()
        : undefined
    try {
      const binding = httpBindingFromCurl({
        key,
        curl,
        stream,
        outputSample,
        ...(secretName ? { headersSecretName: secretName } : {}),
      })
      binding.label = label
      if (record.forwardEmailId === true) {
        binding.forwardEmailId = true
      }
      return binding
    } catch (error) {
      throw new Error(`apiBindings[${index}]: ${getErrorMessage(error, 'invalid curl')}`)
    }
  }

  if (kind === 'workflow' || (kind === null && typeof record.workflowId === 'string')) {
    const workflowId = typeof record.workflowId === 'string' ? record.workflowId.trim() : ''
    if (!workflowId) {
      throw new Error(`apiBindings[${index}].workflowId is required for workflow bindings`)
    }
    return hydrateWorkflowBinding({
      index,
      key,
      label,
      workflowId,
      stream,
      outputSample,
      workspaceId: options.workspaceId,
      deps,
      warnings,
    })
  }

  try {
    const [parsed] = parseApiBindings([record])
    return parsed
  } catch (error) {
    throw new Error(`apiBindings[${index}]: ${getErrorMessage(error, 'invalid binding')}`)
  }
}

async function hydrateWorkflowBinding(params: {
  index: number
  key: string
  label: string
  workflowId: string
  stream: boolean
  outputSample?: string
  workspaceId?: string
  deps: HydrateApiBindingsDeps
  warnings: string[]
}): Promise<ArenaGenerativeApiBinding> {
  const stub: ArenaGenerativeApiBinding = {
    key: params.key,
    label: params.label,
    kind: 'workflow',
    workflowId: params.workflowId,
    ...(params.stream ? { stream: true } : {}),
  }

  const lookup = params.deps.lookupWorkflowWorkspace ?? lookupWorkflowWorkspace
  const loadDeployed = params.deps.loadDeployedState ?? loadDeployedWorkflowState

  if (!params.workspaceId) {
    params.warnings.push(
      `API binding "${params.key}" was saved without Start fields because the canvas has no workspace.`
    )
    return stub
  }

  let ownerWorkspace: string | undefined
  try {
    ownerWorkspace = await lookup(params.workflowId)
  } catch (error) {
    logger.warn('Could not look up binding workflow workspace', {
      workflowId: params.workflowId,
      error: getErrorMessage(error),
    })
    params.warnings.push(
      `API binding "${params.key}" was saved without Start fields because workflow lookup failed.`
    )
    return stub
  }

  if (!ownerWorkspace) {
    throw new Error(`apiBindings[${params.index}].workflowId was not found`)
  }
  if (ownerWorkspace !== params.workspaceId) {
    throw new Error(`apiBindings[${params.index}].workflowId is not in this workspace`)
  }

  try {
    const deployed = await loadDeployed(params.workflowId, params.workspaceId)
    return workflowBindingFromSelection({
      key: params.key,
      workflowId: params.workflowId,
      label: params.label,
      stream: params.stream,
      outputSample: params.outputSample,
      inputFields: extractInputFieldsFromBlocks(deployed.blocks),
      outputFields: extractOutputSchemaFromBlocks(deployed.blocks),
    })
  } catch (error) {
    if (error instanceof NoActiveDeploymentError) {
      params.warnings.push(
        `API binding "${params.key}" was saved without Start fields because workflow "${params.workflowId}" is not deployed. Deploy it, then set apiBindings again.`
      )
      return stub
    }
    logger.warn('Could not hydrate workflow binding from deployed state', {
      workflowId: params.workflowId,
      error: getErrorMessage(error),
    })
    params.warnings.push(
      `API binding "${params.key}" was saved without Start fields because the deployed Start block could not be loaded.`
    )
    return stub
  }
}

async function lookupWorkflowWorkspace(workflowId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ workspaceId: workflow.workspaceId })
    .from(workflow)
    .where(eq(workflow.id, workflowId))
    .limit(1)
  return row?.workspaceId ?? undefined
}

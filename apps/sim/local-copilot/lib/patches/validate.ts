import { patchContainsSecrets } from '@/local-copilot/lib/security/sanitize'
import type {
  PatchValidationResult,
  WorkflowPatch,
  WorkflowPatchOperation,
} from '@/local-copilot/lib/types'
import type { WorkflowState } from '@sim/workflow-types/workflow'

export function validateWorkflowState(state: Partial<WorkflowState>): PatchValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  const blocks = state.blocks ?? {}
  const edges = state.edges ?? []
  const blockIds = new Set(Object.keys(blocks))

  if (Object.keys(blocks).length === 0) {
    warnings.push('Workflow has no blocks')
  }

  const idCounts = new Map<string, number>()
  for (const id of blockIds) {
    idCounts.set(id, (idCounts.get(id) ?? 0) + 1)
  }
  for (const [id, count] of idCounts) {
    if (count > 1) errors.push(`Duplicate block ID: ${id}`)
  }

  for (const edge of edges) {
    if (!blockIds.has(edge.source)) {
      errors.push(`Edge ${edge.id} references missing source block ${edge.source}`)
    }
    if (!blockIds.has(edge.target)) {
      errors.push(`Edge ${edge.id} references missing target block ${edge.target}`)
    }
  }

  const connectedTargets = new Set(edges.map((e) => e.target))
  const triggers = Object.values(blocks).filter((b) => b.triggerMode)
  if (triggers.length === 0 && Object.keys(blocks).length > 1) {
    warnings.push('No trigger block detected — workflow may not start automatically')
  }

  for (const block of Object.values(blocks)) {
    if (!block.type) errors.push(`Block ${block.id} missing type`)
    if (!block.name?.trim()) warnings.push(`Block ${block.id} has empty name`)
    if (!block.triggerMode && !connectedTargets.has(block.id) && triggers.length > 0) {
      warnings.push(`Block "${block.name}" (${block.id}) may be disconnected`)
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}

export function validateWorkflowPatch(
  patch: WorkflowPatch,
  currentWorkflow: Pick<WorkflowState, 'blocks' | 'edges' | 'loops' | 'parallels' | 'variables'>
): PatchValidationResult {
  const errors: string[] = []
  const warnings: string[] = [...(patch.warnings ?? [])]

  if (patch.type !== 'workflow_patch') {
    errors.push('Invalid patch type')
  }
  if (!patch.summary?.trim()) {
    errors.push('Patch summary is required')
  }
  if (!Array.isArray(patch.changes) || patch.changes.length === 0) {
    warnings.push('Patch has no changes')
  }

  const secretViolations = patchContainsSecrets(patch)
  errors.push(...secretViolations)

  const simulated = simulatePatch(currentWorkflow, patch.changes)
  const stateValidation = validateWorkflowState(simulated)
  errors.push(...stateValidation.errors)
  warnings.push(...stateValidation.warnings)

  return { valid: errors.length === 0, errors, warnings }
}

function simulatePatch(
  workflow: Pick<WorkflowState, 'blocks' | 'edges' | 'loops' | 'parallels' | 'variables'>,
  changes: WorkflowPatchOperation[]
): WorkflowState {
  const blocks = structuredClone(workflow.blocks ?? {})
  let edges = structuredClone(workflow.edges ?? [])
  const variables = structuredClone(workflow.variables ?? {})

  for (const change of changes) {
    switch (change.operation) {
      case 'add_block': {
        const block = change.block as { id: string }
        if (block.id) blocks[block.id] = change.block as WorkflowState['blocks'][string]
        break
      }
      case 'update_block': {
        const existing = blocks[change.blockId]
        if (existing) {
          blocks[change.blockId] = { ...existing, ...change.updates } as typeof existing
        }
        break
      }
      case 'remove_block': {
        delete blocks[change.blockId]
        edges = edges.filter((e) => e.source !== change.blockId && e.target !== change.blockId)
        break
      }
      case 'add_edge': {
        edges.push(change.edge as (typeof edges)[number])
        break
      }
      case 'remove_edge': {
        edges = edges.filter((e) => e.id !== change.edgeId)
        break
      }
      case 'add_variable': {
        const variable = change.variable as { id: string }
        if (variable.id) variables[variable.id] = change.variable as (typeof variables)[string]
        break
      }
      case 'update_variable': {
        const existing = variables[change.variableId]
        if (existing) {
          variables[change.variableId] = { ...existing, ...change.updates } as typeof existing
        }
        break
      }
      case 'remove_variable': {
        delete variables[change.variableId]
        break
      }
    }
  }

  return {
    blocks,
    edges,
    loops: workflow.loops ?? {},
    parallels: workflow.parallels ?? {},
    variables,
  }
}

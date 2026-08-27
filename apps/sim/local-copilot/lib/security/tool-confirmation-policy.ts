import { estimateLocalToolCost } from '@/local-copilot/lib/billing/preflight-cost'

export type LocalToolRiskCategory =
  | 'destructive'
  | 'production'
  | 'credential'
  | 'costly'
  | 'external_write'

export interface LocalToolConfirmationRequirement {
  category: LocalToolRiskCategory
  summary: string
  target?: string
  estimatedCostUsd?: number
  estimatedCostLabel?: string
}

export interface LocalWorkflowPatchTagData {
  patchId: string
  summary: string
  workflowId: string
}

const ALWAYS_DESTRUCTIVE_TOOLS = new Set(['delete_workflow'])
const PRODUCTION_TOOLS = new Set([
  'deploy_api',
  'deploy_chat',
  'deploy_mcp',
  'redeploy',
  'promote_to_live',
  'update_deployment_version',
])
const CREDENTIAL_TOOLS = new Set(['generate_api_key'])
const COSTLY_TOOLS = new Set(['generate_audio', 'generate_video'])
const DESTRUCTIVE_OPERATIONS = new Set(['archive', 'delete', 'remove', 'revoke', 'disconnect'])

function getString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function resolveTarget(args: Record<string, unknown>): string | undefined {
  for (const key of [
    'workflowId',
    'deploymentId',
    'credentialId',
    'fileId',
    'folderId',
    'tableId',
    'knowledgeBaseId',
    'toolId',
    'name',
  ]) {
    const value = getString(args, key)
    if (value) return value
  }
  return undefined
}

function requirement(
  toolName: string,
  args: Record<string, unknown>,
  category: LocalToolRiskCategory
): LocalToolConfirmationRequirement {
  const operation = getString(args, 'operation') ?? getString(args, 'action')
  const target = resolveTarget(args)
  const cost = category === 'costly' ? estimateLocalToolCost(toolName, args) : null
  return {
    category,
    summary: operation ? `${toolName}: ${operation}` : toolName,
    ...(target ? { target } : {}),
    ...(cost
      ? {
          estimatedCostUsd: cost.estimatedCostUsd,
          estimatedCostLabel: cost.estimatedCostLabel,
        }
      : {}),
  }
}

/**
 * Formats an application-authored confirmation control for the chat renderer.
 */
export function formatLocalToolConfirmationTag(
  toolCallId: string,
  toolName: string,
  requirement: LocalToolConfirmationRequirement
): string {
  return `<tool_confirmation>${JSON.stringify({
    toolCallId,
    toolName,
    category: requirement.category,
    summary: requirement.summary,
    ...(requirement.target ? { target: requirement.target } : {}),
    ...(requirement.estimatedCostUsd !== undefined
      ? { estimatedCostUsd: requirement.estimatedCostUsd }
      : {}),
    ...(requirement.estimatedCostLabel
      ? { estimatedCostLabel: requirement.estimatedCostLabel }
      : {}),
  })}</tool_confirmation>`
}

/**
 * Formats an application-authored workflow patch control for Apply/Reject UI.
 */
export function formatLocalWorkflowPatchTag(data: LocalWorkflowPatchTagData): string {
  return `<workflow_patch>${JSON.stringify({
    patchId: data.patchId,
    summary: data.summary,
    workflowId: data.workflowId,
  })}</workflow_patch>`
}

/**
 * Classifies Local Copilot tool calls that require explicit user approval.
 */
export function classifyLocalToolConfirmation(
  toolName: string,
  args: Record<string, unknown>
): LocalToolConfirmationRequirement | null {
  if (ALWAYS_DESTRUCTIVE_TOOLS.has(toolName)) {
    return requirement(toolName, args, 'destructive')
  }
  if (PRODUCTION_TOOLS.has(toolName)) {
    return requirement(toolName, args, 'production')
  }
  if (CREDENTIAL_TOOLS.has(toolName)) {
    return requirement(toolName, args, 'credential')
  }
  if (COSTLY_TOOLS.has(toolName)) {
    return requirement(toolName, args, 'costly')
  }

  const operation = (getString(args, 'operation') ?? getString(args, 'action') ?? '').toLowerCase()
  if (DESTRUCTIVE_OPERATIONS.has(operation)) {
    return requirement(
      toolName,
      args,
      toolName === 'manage_credential' ? 'credential' : 'destructive'
    )
  }

  if (toolName === 'manage_credential' && operation && operation !== 'list') {
    return requirement(toolName, args, 'credential')
  }

  // Integration invokes run immediately — no Approve step. Destructive/deploy/
  // credential/costly tools above still require confirmation.
  if (toolName === 'invoke_integration_tool') {
    return null
  }

  return null
}

const WORKFLOW_VALIDATE_MUTATIONS = new Set(['create_workflow', 'edit_workflow'])

const DEPLOY_STATUS_MUTATIONS = new Set([
  'deploy_api',
  'deploy_chat',
  'deploy_mcp',
  'redeploy',
  'promote_to_live',
  'update_deployment_version',
])

const VERIFIER_TOOLS = new Set(['validate_workflow', 'check_deployment_status'])

/**
 * Returns the verifier tool for a successful mutation, or null when none is required.
 */
export function getVerifierForMutation(toolName: string): string | null {
  if (WORKFLOW_VALIDATE_MUTATIONS.has(toolName)) return 'validate_workflow'
  if (DEPLOY_STATUS_MUTATIONS.has(toolName)) return 'check_deployment_status'
  return null
}

/**
 * Verifier tools are never re-verified.
 */
export function isVerifierTool(toolName: string): boolean {
  return VERIFIER_TOOLS.has(toolName)
}

/**
 * True when a successful tool execution should trigger app-owned verification.
 */
export function mutationRequiresVerification(toolName: string): boolean {
  return getVerifierForMutation(toolName) !== null
}

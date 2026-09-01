import type { ToolExecutionResult } from '@/local-copilot/lib/tools/executor'

const IDEMPOTENT_TOOLS = new Set([
  'create_workflow',
  'deploy_api',
  'deploy_chat',
  'deploy_mcp',
  'deploy_custom_block',
  'redeploy',
  'promote_to_live',
  'update_deployment_version',
  'invoke_integration_tool',
  'call_integration_tool',
])

/**
 * True when the tool should participate in turn-scoped idempotency.
 */
export function toolSupportsIdempotency(toolName: string): boolean {
  return IDEMPOTENT_TOOLS.has(toolName)
}

/**
 * Builds a stable idempotency key for a mutation.
 */
export function buildIdempotencyKey(
  toolName: string,
  args: Record<string, unknown>,
  toolCallId?: string
): string {
  const explicit = args.idempotencyKey
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim()
  if (toolCallId?.trim()) return `${toolName}:${toolCallId.trim()}`
  const fingerprint = JSON.stringify(args, Object.keys(args).sort())
  return `${toolName}:${fingerprint}`
}

export function getIdempotentResult(
  cache: Map<string, ToolExecutionResult> | undefined,
  key: string
): ToolExecutionResult | undefined {
  return cache?.get(key)
}

export function rememberIdempotentResult(
  cache: Map<string, ToolExecutionResult>,
  key: string,
  result: ToolExecutionResult
): void {
  cache.set(key, result)
}

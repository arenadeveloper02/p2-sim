import { sanitizeForLlm } from '@/local-copilot/lib/security/sanitize'

/**
 * Redacts tool arguments/results before durable persistence (tool_calls / audit).
 */
export function sanitizeToolIoForPersistence(params: {
  arguments: Record<string, unknown>
  result?: unknown
}): { arguments: Record<string, unknown>; result: unknown } {
  const sanitizedArgs = sanitizeForLlm(params.arguments)
  const argumentsRecord =
    sanitizedArgs && typeof sanitizedArgs === 'object' && !Array.isArray(sanitizedArgs)
      ? (sanitizedArgs as Record<string, unknown>)
      : {}

  return {
    arguments: argumentsRecord,
    result: params.result === undefined ? null : sanitizeForLlm(params.result),
  }
}

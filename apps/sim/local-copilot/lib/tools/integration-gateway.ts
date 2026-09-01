import type { ExposedIntegrationTool } from '@/lib/copilot/integration-tools'
import { stripVersionSuffix } from '@/tools/utils'

export const CALL_INTEGRATION_TOOL_NAME = 'call_integration_tool'
export const LOAD_INTEGRATION_TOOL_NAME = 'load_integration_tool'
export const SEARCH_INTEGRATION_TOOLS_NAME = 'search_integration_tools'

const DEFAULT_SEARCH_LIMIT = 5
const MAX_SEARCH_LIMIT = 10

export interface RankedIntegrationTool {
  id: string
  operation: string
  path: string
  name: string
  description: string
  service: string
  score: number
}

/**
 * Maps Cloud `call_integration_tool` arguments onto Arena `invoke_integration_tool`.
 */
export function remapCallIntegrationToolArgs(
  args: Record<string, unknown>
): Record<string, unknown> {
  const toolId =
    typeof args.toolId === 'string'
      ? args.toolId.trim()
      : typeof args.tool_id === 'string'
        ? args.tool_id.trim()
        : ''
  const cloudArguments =
    args.arguments && typeof args.arguments === 'object' && !Array.isArray(args.arguments)
      ? (args.arguments as Record<string, unknown>)
      : undefined
  const existingParams =
    args.params && typeof args.params === 'object' && !Array.isArray(args.params)
      ? (args.params as Record<string, unknown>)
      : undefined
  const params = { ...(cloudArguments ?? existingParams ?? {}) }
  const credentialId = typeof args.credentialId === 'string' ? args.credentialId.trim() : ''
  if (credentialId && params.credentialId === undefined) {
    params.credentialId = credentialId
  }
  return {
    toolId,
    params,
  }
}

function clampSearchLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_SEARCH_LIMIT
  return Math.min(MAX_SEARCH_LIMIT, Math.max(1, Math.trunc(value)))
}

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9_]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 1)
}

/**
 * Scores an exposed integration tool against a plain-language query.
 */
export function scoreIntegrationTool(tool: ExposedIntegrationTool, query: string): number {
  const tokens = tokenizeQuery(query)
  if (tokens.length === 0) return 0
  const id = tool.toolId.toLowerCase()
  const service = tool.service.toLowerCase()
  const operation = tool.operation.toLowerCase()
  const name = tool.config.name.toLowerCase()
  const description = tool.config.description.toLowerCase()
  let score = 0
  for (const token of tokens) {
    if (id === token || service === token || operation === token) score += 4
    else if (id.includes(token) || `${service}_${operation}`.includes(token)) score += 3
    else if (name.includes(token)) score += 2
    else if (description.includes(token)) score += 1
  }
  return score
}

function toRankedTool(tool: ExposedIntegrationTool, score: number): RankedIntegrationTool {
  return {
    id: tool.toolId,
    operation: tool.operation,
    path: `components/integrations/${tool.service}/${tool.operation}.json`,
    name: tool.config.name,
    description: tool.config.description,
    service: tool.service,
    score,
  }
}

/**
 * Ranks visible integration tools for Cloud `search_integration_tools`.
 */
export function rankIntegrationTools(params: {
  tools: ExposedIntegrationTool[]
  query: string
  service?: string
  limit?: unknown
}): { tools: RankedIntegrationTool[]; service?: string; availableServices: string[] } {
  const availableServices = [...new Set(params.tools.map((tool) => tool.service))].sort()
  const service = params.service?.trim()
    ? stripVersionSuffix(params.service.trim().toLowerCase())
    : undefined
  const scoped = service ? params.tools.filter((tool) => tool.service === service) : params.tools
  const limit = clampSearchLimit(params.limit)
  const scored = scoped
    .map((tool) => ({ tool, score: scoreIntegrationTool(tool, params.query) }))
    .sort((left, right) => right.score - left.score || left.tool.toolId.localeCompare(right.tool.toolId))

  const matched = service
    ? scored.slice(0, limit)
    : scored.filter((entry) => entry.score > 0).slice(0, limit)

  return {
    tools: matched.map((entry) => toRankedTool(entry.tool, entry.score)),
    ...(service ? { service } : {}),
    availableServices,
  }
}

export function parseLoadIntegrationToolIds(args: Record<string, unknown>): string[] {
  const raw = args.tool_ids ?? args.toolIds
  if (!Array.isArray(raw)) return []
  const ids: string[] = []
  for (const entry of raw) {
    if (typeof entry === 'string' && entry.trim()) ids.push(entry.trim())
  }
  return [...new Set(ids)]
}

import type { ComboboxOption } from '@sim/emcn'

const ACRONYMS = new Set(['API', 'BYOK', 'MCP', 'OAUTH'])

const DISPLAY_OVERRIDES: Record<string, string> = { OAUTH: 'OAuth' }

function formatResourceLabel(key: string): string {
  return key
    .split('_')
    .map((w) => {
      const upper = w.toUpperCase()
      if (ACRONYMS.has(upper)) return DISPLAY_OVERRIDES[upper] ?? upper
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    })
    .join(' ')
}

/**
 * Client-local copy of `@sim/audit` resource types. Importing `@sim/audit`
 * (or even `@sim/audit/types` through a mis-resolved barrel) pulls `log.ts` →
 * `@sim/db` → `postgres` into the webpack browser graph.
 */
const AUDIT_RESOURCE_TYPES = {
  API_KEY: 'api_key',
  BILLING: 'billing',
  BYOK_KEY: 'byok_key',
  CHAT: 'chat',
  CONNECTOR: 'connector',
  CREDENTIAL: 'credential',
  CREDENTIAL_GROUP: 'credential_group',
  CUSTOM_BLOCK: 'custom_block',
  CUSTOM_TOOL: 'custom_tool',
  DATA_DRAIN: 'data_drain',
  DOCUMENT: 'document',
  ENVIRONMENT: 'environment',
  FILE: 'file',
  FOLDER: 'folder',
  GENERATIVE_APP: 'generative_app',
  KNOWLEDGE_BASE: 'knowledge_base',
  MCP_SERVER: 'mcp_server',
  OAUTH: 'oauth',
  ORGANIZATION: 'organization',
  PASSWORD: 'password',
  PERMISSION_GROUP: 'permission_group',
  SCHEDULE: 'schedule',
  SKILL: 'skill',
  SUBSCRIPTION: 'subscription',
  TABLE: 'table',
  WEBHOOK: 'webhook',
  WORKFLOW: 'workflow',
  WORKSPACE: 'workspace',
} as const

export const RESOURCE_TYPE_OPTIONS: ComboboxOption[] = (
  Object.entries(AUDIT_RESOURCE_TYPES) as [string, string][]
)
  .map(([key, value]) => ({ label: formatResourceLabel(key), value }))
  .sort((a, b) => a.label.localeCompare(b.label))

import {
  domainSystemHint,
  isSpecialistDomain,
  LOCAL_COPILOT_CLOUD_SPECIALIST_DOMAINS,
  type LocalCopilotCloudSpecialistDomain,
} from '@/local-copilot/lib/agent/specialists/domains'
import type { LocalCopilotToolDefinition } from '@/local-copilot/lib/types'

type SpecialistArgKey = 'prompt' | 'request' | 'topic' | 'task' | 'context'

interface SpecialistToolSpec {
  domain: LocalCopilotCloudSpecialistDomain
  description: string
  properties: Record<string, { type: string; description: string }>
  required?: string[]
  briefKeys: SpecialistArgKey[]
}

const SPECIALIST_SPECS: SpecialistToolSpec[] = [
  {
    domain: 'workflow',
    description: 'Workflow Agent — build/edit workflows and related structure.',
    properties: {
      prompt: { type: 'string', description: 'Optional brief instruction to scope the task.' },
    },
    briefKeys: ['prompt'],
  },
  {
    domain: 'run',
    description: 'Run Agent — run workflows/blocks, inspect logs, debug executions.',
    properties: {
      request: { type: 'string', description: 'What to run or what logs to check.' },
      context: {
        type: 'string',
        description: 'Optional pre-gathered context: workflow state, block IDs, inputs.',
      },
    },
    required: ['request'],
    briefKeys: ['request', 'context'],
  },
  {
    domain: 'deploy',
    description: 'Deploy Agent — deploy chat/API/MCP, redeploy, promote, status.',
    properties: {
      request: { type: 'string', description: 'What deploy or promotion action is needed.' },
    },
    required: ['request'],
    briefKeys: ['request'],
  },
  {
    domain: 'auth',
    description: 'Auth Agent — credentials, OAuth links, and API keys.',
    properties: {
      request: { type: 'string', description: 'What authentication/credential action is needed.' },
    },
    required: ['request'],
    briefKeys: ['request'],
  },
  {
    domain: 'knowledge',
    description: 'Knowledge Agent — knowledge base query, create, and file ingest.',
    properties: {
      request: { type: 'string', description: 'What knowledge base action is needed.' },
    },
    required: ['request'],
    briefKeys: ['request'],
  },
  {
    domain: 'table',
    description: 'Table Agent — tables, rows, schemas, and enrichments.',
    properties: {
      request: { type: 'string', description: 'What table action is needed.' },
    },
    required: ['request'],
    briefKeys: ['request'],
  },
  {
    domain: 'scheduled_task',
    description: 'Scheduled Task Agent — create/list/update/complete scheduled tasks.',
    properties: {
      request: { type: 'string', description: 'What scheduled task action is needed.' },
    },
    required: ['request'],
    briefKeys: ['request'],
  },
  {
    domain: 'agent',
    description: 'Tools Agent — skills, custom tools, MCP configs, integration listing/invoke.',
    properties: {
      request: { type: 'string', description: 'What tool/skill/MCP action is needed.' },
    },
    required: ['request'],
    briefKeys: ['request'],
  },
  {
    domain: 'research',
    description: 'Research Agent — web/docs search and user memory.',
    properties: {
      topic: { type: 'string', description: 'The topic to research.' },
    },
    required: ['topic'],
    briefKeys: ['topic'],
  },
  {
    domain: 'media',
    description: 'Media Agent — image/audio/video generation and ffmpeg.',
    properties: {
      prompt: {
        type: 'string',
        description: 'Optional brief instruction to scope the media task.',
      },
    },
    briefKeys: ['prompt'],
  },
  {
    domain: 'file',
    description: 'File Agent — workspace VFS read/write and office file creation.',
    properties: {
      prompt: { type: 'string', description: 'Optional brief instruction to scope the file task.' },
    },
    briefKeys: ['prompt'],
  },
  {
    domain: 'superagent',
    description: 'Superagent — live integration actions (Gmail, Sheets, Slack, Drive, etc.).',
    properties: {
      task: {
        type: 'string',
        description: "A single sentence task, e.g. 'send the email we discussed'.",
      },
    },
    required: ['task'],
    briefKeys: ['task'],
  },
]

const SPEC_BY_DOMAIN = new Map(SPECIALIST_SPECS.map((spec) => [spec.domain, spec]))

export function getParentSpecialistToolDefinitions(): LocalCopilotToolDefinition[] {
  return SPECIALIST_SPECS.map((spec) => ({
    name: spec.domain,
    description: `${spec.description} ${domainSystemHint(spec.domain)}`,
    parameters: {
      type: 'object',
      properties: spec.properties,
      ...(spec.required?.length ? { required: spec.required } : {}),
      additionalProperties: false,
    },
  }))
}

export const LOCAL_COPILOT_SPECIALIST_TOOL_DEFINITIONS = getParentSpecialistToolDefinitions()

export function isSpecialistTool(name: string): name is LocalCopilotCloudSpecialistDomain {
  return isSpecialistDomain(name)
}

export function specialistDomainFromToolName(
  name: string
): LocalCopilotCloudSpecialistDomain | null {
  return isSpecialistDomain(name) ? name : null
}

export function resolveSpecialistBrief(
  domain: LocalCopilotCloudSpecialistDomain,
  args: Record<string, unknown>,
  lastUserMessage: string
): string {
  const spec = SPEC_BY_DOMAIN.get(domain)
  if (!spec) return lastUserMessage.trim()
  const parts: string[] = []
  for (const key of spec.briefKeys) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) parts.push(value.trim())
  }
  return parts.length > 0 ? parts.join('\n\n') : lastUserMessage.trim()
}

export function buildSpecialistUserMessage(
  domain: LocalCopilotCloudSpecialistDomain,
  args: Record<string, unknown>,
  fallbackUserMessage: string
): string {
  return resolveSpecialistBrief(domain, args, fallbackUserMessage)
}

export function assertParentCatalogComplete(tools: LocalCopilotToolDefinition[]): void {
  const names = new Set(tools.map((tool) => tool.name))
  for (const domain of LOCAL_COPILOT_CLOUD_SPECIALIST_DOMAINS) {
    if (!names.has(domain)) throw new Error(`Missing parent specialist tool: ${domain}`)
  }
  if (tools.length !== LOCAL_COPILOT_CLOUD_SPECIALIST_DOMAINS.length) {
    throw new Error(
      `Parent catalog size ${tools.length} !== ${LOCAL_COPILOT_CLOUD_SPECIALIST_DOMAINS.length}`
    )
  }
}

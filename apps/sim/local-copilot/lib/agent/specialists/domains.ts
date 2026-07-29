import type { LocalCopilotToolDefinition } from '@/local-copilot/lib/types'

/**
 * Cloud-aligned specialist domains for Local Copilot hybrid orchestration.
 * `general` is classifier-only (not a specialist tool).
 */
export const LOCAL_COPILOT_SPECIALIST_DOMAINS = [
  'general',
  'workflow',
  'run',
  'deploy',
  'auth',
  'knowledge',
  'table',
  'scheduled_task',
  'agent',
  'research',
  'media',
  'file',
  'superagent',
] as const

export type LocalCopilotSpecialistDomain = (typeof LOCAL_COPILOT_SPECIALIST_DOMAINS)[number]

export const LOCAL_COPILOT_CLOUD_SPECIALIST_DOMAINS = [
  'workflow',
  'run',
  'deploy',
  'auth',
  'knowledge',
  'table',
  'scheduled_task',
  'agent',
  'research',
  'media',
  'file',
  'superagent',
] as const

export type LocalCopilotCloudSpecialistDomain =
  (typeof LOCAL_COPILOT_CLOUD_SPECIALIST_DOMAINS)[number]

/** Pre-pass / parent parallel fan-out cap. */
export const MAX_PARALLEL_SUBAGENTS = 4

export const ALWAYS_ON_TOOL_NAMES = new Set<string>([
  'search_docs',
  'search_documentation',
  'get_workflow_context',
  'get_available_blocks',
  'get_available_integrations',
  'get_blocks_metadata',
  'list_integration_tools',
  'invoke_integration_tool',
  'open_resource',
  'get_platform_actions',
  'list_user_workspaces',
  'load_user_skill',
  'explain_error',
  'user_memory',
])

const WORKFLOW_TOOLS = [
  'create_workflow',
  'edit_workflow',
  'validate_workflow',
  'generate_workflow_patch',
  'propose_workflow_patch',
  'get_workflow_data',
  'get_block_upstream_references',
  'get_block_outputs',
  'rename_workflow',
  'move_workflow',
  'delete_workflow',
  'manage_folder',
  'set_block_enabled',
  'set_global_workflow_variables',
  'get_deployed_workflow_state',
  'diff_workflows',
  'restore_resource',
  'manage_skill',
  'manage_custom_tool',
  'manage_mcp_tool',
] as const

const RUN_TOOLS = [
  'get_workflow_run_options',
  'run_workflow',
  'run_workflow_until_block',
  'run_block',
  'run_from_block',
  'query_logs',
  'get_execution_logs',
  'explain_error',
  'validate_workflow',
  'get_workflow_data',
  'set_block_enabled',
] as const

const DEPLOY_TOOLS = [
  'deploy_chat',
  'deploy_api',
  'deploy_mcp',
  'redeploy',
  'load_deployment',
  'promote_to_live',
  'update_deployment_version',
  'get_deployment_log',
  'check_deployment_status',
  'diff_workflows',
  'get_block_outputs',
  'get_deployed_workflow_state',
  'list_workspace_mcp_servers',
  'create_workspace_mcp_server',
  'update_workspace_mcp_server',
  'delete_workspace_mcp_server',
] as const

const AUTH_TOOLS = [
  'manage_credential',
  'oauth_get_auth_link',
  'oauth_request_access',
  'generate_api_key',
  'get_available_integrations',
  'list_integration_tools',
] as const

const KNOWLEDGE_TOOLS = ['knowledge_base', 'materialize_file'] as const
const TABLE_TOOLS = ['user_table', 'enrichment_run', 'materialize_file'] as const

const SCHEDULED_TASK_TOOLS = [
  'manage_scheduled_task',
  'complete_scheduled_task',
  'update_scheduled_task_history',
  'get_scheduled_task_logs',
] as const

const AGENT_TOOLS = [
  'list_integration_tools',
  'invoke_integration_tool',
  'manage_mcp_tool',
  'manage_skill',
  'manage_custom_tool',
  'load_user_skill',
  'function_execute',
  'get_available_integrations',
  'get_platform_actions',
  'list_workspace_mcp_servers',
  'create_workspace_mcp_server',
  'update_workspace_mcp_server',
  'delete_workspace_mcp_server',
] as const

const RESEARCH_TOOLS = [
  'search_online',
  'search_docs',
  'search_documentation',
  'function_execute',
  'user_memory',
] as const

const MEDIA_TOOLS = ['generate_image', 'generate_audio', 'generate_video', 'ffmpeg'] as const

const FILE_TOOLS = [
  'read',
  'glob',
  'grep',
  'create_file',
  'create_file_folder',
  'workspace_file',
  'download_to_workspace_file',
  'materialize_file',
  'edit_content',
  'delete_file',
  'rename_file',
  'move_file',
  'list_file_folders',
  'rename_file_folder',
  'move_file_folder',
  'delete_file_folder',
  'restore_resource',
] as const

const SUPERAGENT_TOOLS = [...new Set([...AGENT_TOOLS, ...AUTH_TOOLS, 'read', 'glob'])] as const

export const DOMAIN_TOOL_NAMES: Record<LocalCopilotCloudSpecialistDomain, readonly string[]> = {
  workflow: WORKFLOW_TOOLS,
  run: RUN_TOOLS,
  deploy: DEPLOY_TOOLS,
  auth: AUTH_TOOLS,
  knowledge: KNOWLEDGE_TOOLS,
  table: TABLE_TOOLS,
  scheduled_task: SCHEDULED_TASK_TOOLS,
  agent: AGENT_TOOLS,
  research: RESEARCH_TOOLS,
  media: MEDIA_TOOLS,
  file: FILE_TOOLS,
  superagent: SUPERAGENT_TOOLS,
}

export const SPECIALIST_ENTRY_TOOL_NAMES = new Set<string>(LOCAL_COPILOT_CLOUD_SPECIALIST_DOMAINS)

export interface LocalCopilotIntent {
  primary: LocalCopilotSpecialistDomain
  secondary: LocalCopilotSpecialistDomain[]
  useFullCatalog: boolean
}

export function toolNamesForDomain(domain: LocalCopilotSpecialistDomain): Set<string> {
  if (domain === 'general') return new Set()
  return new Set([...ALWAYS_ON_TOOL_NAMES, ...DOMAIN_TOOL_NAMES[domain]])
}

export function toolNamesForIntent(intent: LocalCopilotIntent): Set<string> | null {
  if (intent.useFullCatalog || intent.primary === 'general') return null
  const names = toolNamesForDomain(intent.primary)
  for (const domain of intent.secondary) {
    if (domain === 'general') continue
    for (const name of toolNamesForDomain(domain)) names.add(name)
  }
  return names
}

export function filterToolsByNames(
  tools: LocalCopilotToolDefinition[],
  allowedNames: Set<string> | null
): LocalCopilotToolDefinition[] {
  if (!allowedNames) return tools
  return tools.filter((tool) => allowedNames.has(tool.name))
}

export function isSpecialistDomain(name: string): name is LocalCopilotCloudSpecialistDomain {
  return SPECIALIST_ENTRY_TOOL_NAMES.has(name)
}

export function domainSystemHint(domain: LocalCopilotSpecialistDomain): string {
  switch (domain) {
    case 'workflow':
      return 'Focus on building or editing workflows (create_workflow / edit_workflow / patches). Prefer existing workspaceWorkflows before creating new ones.'
    case 'run':
      return 'Focus on running and debugging workflows (get_workflow_run_options, run_workflow, run_block, run_from_block, query_logs).'
    case 'deploy':
      return 'Focus on deploying workflows (deploy_chat / deploy_api / redeploy / promotion) and verifying deployment status.'
    case 'auth':
      return 'Focus on credentials, OAuth links, and API keys.'
    case 'knowledge':
      return 'Focus on knowledge bases (query, ingest, create, connectors).'
    case 'table':
      return 'Focus on tables and enrichments (user_table, enrichment_run).'
    case 'scheduled_task':
      return 'Focus on scheduled tasks (create/list/update/complete/logs).'
    case 'agent':
      return 'Focus on integration tools, MCP tools, skills, and function_execute.'
    case 'research':
      return 'Focus on research (search_online, search_docs, search_documentation, user_memory).'
    case 'media':
      return 'Focus on image/audio/video generation and ffmpeg.'
    case 'file':
      return 'Focus on workspace files and VFS tools (read/glob/grep/create_file/edit_content).'
    case 'superagent':
      return 'Focus on third-party integration actions. Authenticate if needed, then invoke the right integration tool.'
    default:
      return 'Use whichever tools best answer the user. Prefer existing workflows before creating new ones.'
  }
}

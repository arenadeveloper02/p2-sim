import { TOOL_RUNTIME_SCHEMAS } from '@/lib/copilot/generated/tool-schemas-v1'
import type { LocalCopilotToolDefinition } from '@/local-copilot/lib/types'

const DELEGATED_TOOL_DESCRIPTIONS: Record<string, string> = {
  run_workflow:
    'Executes a workflow and returns block outputs, executionId, and status. Call get_workflow_run_options first when trigger inputs are unknown.',
  run_workflow_until_block:
    'Runs a workflow until a specific block completes, then returns partial outputs.',
  get_workflow_run_options:
    'Returns runnable triggers, input schemas, and mock payloads for a workflow before running it.',
  query_logs:
    'Lists or inspects workflow execution logs and block outputs. Use executionId from run_workflow.',
  get_workflow_data:
    'Loads workflow structure and metadata by workflowId (useful on home chat when no workflow is open).',
  list_integration_tools:
    'Lists available operations for a connected integration service (e.g. firecrawl, slack).',
  read: 'Reads a workspace file by canonical VFS path (from glob or workspaceFiles in context).',
  glob: 'Finds workspace files by glob pattern (e.g. files/**/*.csv).',
  grep: 'Searches file contents under a workspace path pattern.',
  create_file:
    'Creates a workspace file at a VFS path. For markdown/text/json/csv/html, ALWAYS pass `content` with the full file body in the same call. Without `content`, only an empty shell is created — you must then call workspace_file update + edit_content. Office formats (docx/pptx/pdf) cannot take inline content; use the empty shell + workspace_file + edit_content flow.',
  create_file_folder: 'Creates a folder under the workspace files tree.',
  workspace_file:
    'Reads, creates, appends, updates, or deletes workspace files by path or file id.',
  download_to_workspace_file: 'Downloads a URL into a workspace file.',
  user_table:
    'Creates, reads, and updates workspace tables — operations include create, get, get_schema, insert_row, batch_insert_rows, query_rows, update_row, add_column, import_file, create_from_file.',
  knowledge_base:
    'Manages knowledge bases — operations include create, get, list, query (semantic search), add_file (ingest document), update, delete, add_connector, sync_connector.',
  open_resource: 'Opens a workspace resource (workflow, file, table, knowledge base) in the UI.',
  materialize_file: 'Materializes chat-uploaded files into workspace files or table imports.',
  generate_image:
    'Generates an image from a text prompt (no workflow). Uses hosted/workspace keys automatically. Pass the user full request in `prompt`, including variation counts (e.g. "3 variations"). Optional outputs.files path to save under files/.',
  search_online:
    'Live web search (Exa when keys are configured). Use for current events and live data — no workflow required. REQUIRED: query (search string) and toolTitle (short UI label, e.g. "Tealium ads").',
  enrichment_run:
    'Runs a one-off table enrichment lookup inline (no table/workflow required).',
  function_execute:
    'Runs JavaScript, Python, or shell in a secure sandbox (E2B when enabled). Return values appear in `result`; printed output appears in `stdout`. Tool results also include `capturedOutput` — use that for the user-facing answer. Mount workspace files/tables via `inputs`; save files with `outputs.files` or `outputPath`. Python and shell require e2b.enabled in context. Prefer this over Daytona integration tools.',
  edit_content:
    'Writes or patches file content. For pptx/docx/pdf/xlsx, pairs with workspace file patch flows and compiles via E2B when e2b.docSandboxEnabled is true.',
  deploy_chat:
    'Deploys or undeploys a workflow as a shareable chat interface. Performs the full workflow deploy plus chat surface setup. REQUIRED on deploy: workflowId, identifier (URL slug), title, versionName, versionDescription. Call get_block_outputs for outputConfigs (agent content path). Call diff_workflows(ref1: "live", ref2: "draft") when unsure what changed. Returns chatUrl on success — share that with the user.',
  get_block_outputs:
    'Lists block output paths for a workflow (use before deploy_chat outputConfigs to pick agent blockId + path, usually content).',
  diff_workflows:
    'Diffs draft vs live (or two versions) to summarize changes. Use before deploy_chat when versionDescription is required.',
  check_deployment_status:
    'Returns whether a workflow is deployed and chat/API deployment status.',
}

/** Tools delegated to registered Mothership/copilot server handlers. */
export const MOTHERSHIP_DELEGATED_TOOL_NAMES = [
  'run_workflow',
  'run_workflow_until_block',
  'get_workflow_run_options',
  'query_logs',
  'get_workflow_data',
  'list_integration_tools',
  'read',
  'glob',
  'grep',
  'create_file',
  'create_file_folder',
  'workspace_file',
  'download_to_workspace_file',
  'user_table',
  'knowledge_base',
  'open_resource',
  'materialize_file',
  'generate_image',
  'search_online',
  'enrichment_run',
  'function_execute',
  'edit_content',
  'deploy_chat',
  'get_block_outputs',
  'diff_workflows',
  'check_deployment_status',
] as const

export type MothershipDelegatedToolName = (typeof MOTHERSHIP_DELEGATED_TOOL_NAMES)[number]

export const WORKFLOW_SCOPED_DELEGATED_TOOLS = new Set<MothershipDelegatedToolName>([
  'run_workflow',
  'run_workflow_until_block',
  'get_workflow_run_options',
  'get_workflow_data',
  'deploy_chat',
  'get_block_outputs',
  'diff_workflows',
  'check_deployment_status',
])

export function isWorkflowScopedDelegatedTool(toolName: string): boolean {
  return WORKFLOW_SCOPED_DELEGATED_TOOLS.has(toolName as MothershipDelegatedToolName)
}

export function isMothershipDelegatedTool(toolName: string): toolName is MothershipDelegatedToolName {
  return (MOTHERSHIP_DELEGATED_TOOL_NAMES as readonly string[]).includes(toolName)
}

/**
 * Builds LLM tool definitions from generated schemas only — does not import
 * server tool handlers or register-handlers (those load on first execution).
 */
export function buildMothershipDelegatedToolDefinitions(): LocalCopilotToolDefinition[] {
  return MOTHERSHIP_DELEGATED_TOOL_NAMES.map((name) => {
    const schema = TOOL_RUNTIME_SCHEMAS[name]?.parameters
    const baseParameters = (schema ?? {
      type: 'object',
      properties: {},
      additionalProperties: false,
    }) as Record<string, unknown>

    let parameters = baseParameters
    if (name === 'create_file' && baseParameters.type === 'object') {
      const properties = {
        ...((baseParameters.properties as Record<string, unknown>) ?? {}),
        content: {
          type: 'string',
          description:
            'Full file body for text files (.md, .txt, .json, .csv, .html). Required when creating markdown or text content — omitting this creates an empty shell only.',
        },
      }
      parameters = { ...baseParameters, properties }
    }

    return {
      name,
      description: DELEGATED_TOOL_DESCRIPTIONS[name] ?? name,
      parameters,
    }
  })
}

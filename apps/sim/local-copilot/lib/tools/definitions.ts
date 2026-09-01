import { TOOL_RUNTIME_SCHEMAS } from '@/lib/copilot/generated/tool-schemas-v1'
import {
  CALL_INTEGRATION_TOOL_NAME,
  LOAD_INTEGRATION_TOOL_NAME,
  SEARCH_INTEGRATION_TOOLS_NAME,
} from '@/local-copilot/lib/tools/integration-gateway'
import { buildMothershipDelegatedToolDefinitions } from '@/local-copilot/lib/tools/mothership-delegated-tool-defs'
import { buildLocalCopilotUserSkillTool } from '@/local-copilot/lib/tools/user-skills'
import type { LocalCopilotToolDefinition } from '@/local-copilot/lib/types'

function cloudToolParameters(name: string): Record<string, unknown> {
  return (TOOL_RUNTIME_SCHEMAS[name]?.parameters ?? {
    type: 'object',
    properties: {},
    additionalProperties: false,
  }) as Record<string, unknown>
}

const CORE_LOCAL_COPILOT_TOOLS: LocalCopilotToolDefinition[] = [
  {
    name: 'create_workflow',
    description:
      'Creates a new empty workflow. Call at most once per turn. After it succeeds, populate with edit_workflow — do not create again or call get_workflow_context.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Workflow name' },
        description: { type: 'string', description: 'Optional workflow description' },
        folderId: { type: 'string', description: 'Optional folder ID' },
        workspaceId: {
          type: 'string',
          description: 'Optional workspace ID (defaults to current workspace)',
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'edit_workflow',
    description:
      'Applies block operations to a workflow (add, edit, delete). Requires workflowId from create_workflow or an open workflow. CONNECTIONS: never add edges as separate operations or type "edge". Wire on the SOURCE (upstream) block via params.connections — e.g. { source: "<target-block-id>" } on the Start block to connect Start → Agent. Never put connections on the downstream block and never point connections at Start/trigger. To reverse a wire, put connections on the new source only. Call get_blocks_metadata ONCE with every block type you need before the first edit. After create_workflow this turn, do not create again or call get_workflow_context — edit immediately. Up to 5 sequential edit_workflow calls are OK for multi-agent graphs. Human review uses type human_in_the_loop. App-owned verification may run after success — do not claim verified yourself. Always pass operations as a non-empty array.',
    parameters: {
      type: 'object',
      properties: {
        workflowId: {
          type: 'string',
          description: 'Workflow to edit. Defaults to the workflow created in this conversation.',
        },
        operations: {
          type: 'array',
          description:
            'Edit operations. Example Start→Agent in one call: (1) add agent block with type, name, inputs; (2) edit start block (use startBlockId from create_workflow) with connections: { source: "<agent-block-id>" }.',
          items: {
            type: 'object',
            properties: {
              block_id: { type: 'string' },
              operation_type: {
                type: 'string',
                enum: ['add', 'edit', 'delete', 'insert_into_subflow', 'extract_from_subflow'],
              },
              params: {
                type: 'object',
                description:
                  'add/edit params: type, name, inputs (subblock values), connections (outgoing edges from this block). Agent inputs use messages (JSON array of {role, content}), model, tools — not systemPrompt/userPrompt.',
              },
            },
            required: ['operation_type', 'block_id'],
          },
        },
      },
      required: ['operations'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_blocks_metadata',
    description:
      'Returns exact subblock field names, types, and examples for block types. Call ONCE with every type you need (e.g. ["agent","start_trigger","gmail"]) before edit_workflow — do not re-fetch the same types in the same turn.',
    parameters: {
      type: 'object',
      properties: {
        blockIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Block type ids from get_available_blocks, e.g. ["agent","start_trigger"]',
        },
      },
      required: ['blockIds'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_workflow_context',
    description:
      'Returns the current workflow structure, variables, credentials metadata, and execution status. Omit workflowId when a workflow is open. For large (compact) workflows, pass blockNames or blockIds to load full subBlock values (prompts/messages) for those blocks before edit_workflow.',
    parameters: {
      type: 'object',
      properties: {
        workflowId: {
          type: 'string',
          description:
            'Optional. Defaults to the open workflow, the workflow created this turn, or the only workspace workflow.',
        },
        blockIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional block UUIDs to return with full subBlock values',
        },
        blockNames: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional block display names (e.g. ["Writer","Reviewer"]) to return with full subBlock values',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'load_copilot_artifact',
    description:
      'Loads a full tool result previously offloaded as an artifact (when the inline tool result included artifactId + truncated: true).',
    parameters: {
      type: 'object',
      properties: {
        artifactId: {
          type: 'string',
          description: 'Artifact id from a truncated tool result stub',
        },
      },
      required: ['artifactId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_available_blocks',
    description:
      'Lists all block types available in this Arena deployment with categories and descriptions.',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Optional category filter' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_available_integrations',
    description:
      'Lists integration categories, connected OAuth integrations, configured env key names, and hosted-key availability. Use list_integration_tools for operations within a specific service.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'invoke_integration_tool',
    description:
      'Runs a Arena integration tool directly (no workflow). Use list_integration_tools or search_integration_tools first to get the exact toolId (e.g. exa_search, exa_answer, firecrawl_scrape). Cloud alias: call_integration_tool (toolId + arguments). For live/current web data prefer exa_answer (factual Q&A with citations) or exa_search (result lists) — same as the Exa block. For E2B-backed web apps when e2b.enabled is true, use development_generate_app or development_edit_app. Workspace env keys, BYOK, and hosted keys are applied automatically.',
    parameters: {
      type: 'object',
      properties: {
        toolId: {
          type: 'string',
          description: 'Exact registry tool id from list_integration_tools, e.g. exa_search',
        },
        params: {
          type: 'object',
          description: 'Parameters for that tool (query, url, etc.)',
        },
      },
      required: ['toolId', 'params'],
      additionalProperties: false,
    },
  },
  {
    name: SEARCH_INTEGRATION_TOOLS_NAME,
    description:
      'Cloud-compatible search across integration operations. Pass query (what the operation must do) and optional service (gmail, slack, google_sheets). Then load_integration_tool or invoke_integration_tool / call_integration_tool with the returned id. Prefer list_integration_tools when you already know the service name.',
    parameters: cloudToolParameters(SEARCH_INTEGRATION_TOOLS_NAME),
  },
  {
    name: LOAD_INTEGRATION_TOOL_NAME,
    description:
      'Cloud-compatible preload for integration tool ids. Arena does not defer schemas — this records the ids and returns their params so you can call invoke_integration_tool or call_integration_tool next. REQUIRED: tool_ids from search_integration_tools or list_integration_tools.',
    parameters: cloudToolParameters(LOAD_INTEGRATION_TOOL_NAME),
  },
  {
    name: CALL_INTEGRATION_TOOL_NAME,
    description:
      'Cloud-compatible invoke. Same as invoke_integration_tool: pass toolId plus arguments (operation inputs). Optional credentialId. Use after search_integration_tools / list_integration_tools (and optional load_integration_tool).',
    parameters: cloudToolParameters(CALL_INTEGRATION_TOOL_NAME),
  },
  {
    name: 'validate_workflow',
    description:
      'Validates a workflow for structural issues. Prefer letting app-owned post-mutation verification run this automatically. On home chat, pass workflowId from workspaceWorkflows (or omit it when only one workflow exists). Call manually only when the user asks to validate or when repairing reported lint/errors.',
    parameters: {
      type: 'object',
      properties: {
        workflowId: {
          type: 'string',
          description:
            'Workflow to validate. Defaults to the open workflow, the workflow created this turn, or the only workspace workflow.',
        },
        workflowJson: { type: 'object', description: 'Optional workflow state override' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'generate_workflow_patch',
    description:
      'Generates a diff-based workflow patch plan from a user request. Never applies changes directly.',
    parameters: {
      type: 'object',
      properties: {
        userRequest: { type: 'string', description: 'What the user wants to change' },
        targetBlockId: { type: 'string', description: 'Optional block to anchor changes' },
      },
      required: ['userRequest'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_execution_logs',
    description: 'Fetches recent execution logs for debugging failed workflow runs.',
    parameters: {
      type: 'object',
      properties: {
        executionId: { type: 'string', description: 'Optional specific execution ID' },
        limit: { type: 'number', description: 'Max log entries (default 10)' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'explain_error',
    description: 'Analyzes an execution error with workflow context and suggests fixes.',
    parameters: {
      type: 'object',
      properties: {
        errorMessage: { type: 'string' },
        blockId: { type: 'string' },
        executionId: { type: 'string' },
      },
      required: ['errorMessage'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_docs',
    description: 'Searches Arena block and integration documentation for relevant guidance.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_workflow_patch',
    description:
      'Submits a structured workflow patch for user confirmation. Use after generating changes.',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        changes: {
          type: 'array',
          items: { type: 'object' },
        },
        warnings: { type: 'array', items: { type: 'string' } },
        recommendations: { type: 'array', items: { type: 'string' } },
      },
      required: ['summary', 'changes'],
      additionalProperties: false,
    },
  },
]

export const LOCAL_COPILOT_TOOLS: LocalCopilotToolDefinition[] = [
  ...CORE_LOCAL_COPILOT_TOOLS,
  ...buildMothershipDelegatedToolDefinitions(),
]

/**
 * Resolves the full tool list for a turn, including workspace user skills when present.
 */
export async function resolveLocalCopilotTools(
  workspaceId: string
): Promise<LocalCopilotToolDefinition[]> {
  const skillTool = await buildLocalCopilotUserSkillTool(workspaceId)
  return skillTool ? [...LOCAL_COPILOT_TOOLS, skillTool] : LOCAL_COPILOT_TOOLS
}

export function getToolDefinition(name: string): LocalCopilotToolDefinition | undefined {
  return LOCAL_COPILOT_TOOLS.find((tool) => tool.name === name)
}

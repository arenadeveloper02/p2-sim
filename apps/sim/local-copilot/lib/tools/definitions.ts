import { buildMothershipDelegatedToolDefinitions } from '@/local-copilot/lib/tools/mothership-delegated-tool-defs'
import { buildLocalCopilotUserSkillTool } from '@/local-copilot/lib/tools/user-skills'
import type { LocalCopilotToolDefinition } from '@/local-copilot/lib/types'

const CORE_LOCAL_COPILOT_TOOLS: LocalCopilotToolDefinition[] = [
  {
    name: 'create_workflow',
    description:
      'Creates a new empty workflow. ONLY when the user explicitly wants a brand-new workflow — never when an existing workspaceWorkflows entry can run or be edited instead. Pass confirmNewWorkflow: true.',
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
        confirmNewWorkflow: {
          type: 'boolean',
          description:
            'Required true when creating a workflow while other workflows already exist in the workspace.',
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'edit_workflow',
    description:
      'Applies block operations to a workflow (add, edit, delete). Requires workflowId from create_workflow or an open workflow. CONNECTIONS: never add edges as separate operations or type "edge". Wire on the SOURCE (upstream) block via params.connections — e.g. { source: "<target-block-id>" } on the Start block to connect Start → Agent. Never put connections on the downstream block and never point connections at Start/trigger. To reverse a wire, put connections on the new source only. Call get_blocks_metadata ONCE with every block type you need before the first edit. Prefer one edit_workflow for all adds + Start connections. App-owned verification may run after success — do not claim verified yourself. Always pass operations as a non-empty array.',
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
      'Returns the current workflow structure, variables, credentials metadata, and execution status. For large (compact) workflows, pass blockNames or blockIds to load full subBlock values (prompts/messages) for those blocks before edit_workflow.',
    parameters: {
      type: 'object',
      properties: {
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
      'Runs a Arena integration tool directly (no workflow). Use list_integration_tools first to get the exact toolId (e.g. exa_search, exa_answer, firecrawl_scrape). For live/current web data prefer exa_answer (factual Q&A with citations) or exa_search (result lists) — same as the Exa block. For E2B-backed web apps when e2b.enabled is true, use development_generate_app or development_edit_app. Workspace env keys, BYOK, and hosted keys are applied automatically.',
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

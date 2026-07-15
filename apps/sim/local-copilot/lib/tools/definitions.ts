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
      'Applies block operations to a workflow (add, edit, delete). Requires workflowId from create_workflow or an open workflow. CONNECTIONS: never add edges as separate operations or type "edge". Wire on the SOURCE block via params.connections — e.g. { source: "<target-block-id>" } on the Start block to connect Start → Agent. Branch blocks use handle keys from get_blocks_metadata. Pass subblock values under params.inputs (flat keys), not params.subBlocks. Call get_blocks_metadata(["agent","start_trigger"]) for exact field names before first edit.',
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
      'Returns exact subblock field names, types, and examples for block types (e.g. ["agent","start_trigger","exa"]). Call before edit_workflow when configuring blocks — avoids guessing field names like systemPrompt vs messages.',
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
      'Returns the current workflow structure, variables, credentials metadata, and execution status.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'get_available_blocks',
    description:
      'Lists all block types available in this Sim deployment with categories and descriptions.',
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
      'Runs a Sim integration tool directly (no workflow). Use list_integration_tools first to get the exact toolId (e.g. exa_search, firecrawl_scrape). For E2B-backed web apps when e2b.enabled is true, use development_generate_app or development_edit_app. Workspace env keys and hosted keys are applied automatically.',
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
      'Validates the current workflow JSON for structural issues, missing credentials, and disconnected blocks.',
    parameters: {
      type: 'object',
      properties: {
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
    description: 'Searches Sim block and integration documentation for relevant guidance.',
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

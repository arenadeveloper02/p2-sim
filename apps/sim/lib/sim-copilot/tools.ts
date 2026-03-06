/**
 * Copilot Tools for Sim Studio
 * Defines the tools available to the AI copilot for workflow manipulation
 */

import { getAllBlocks, getBlockInfo, getBlockConfigDetails } from './block-discovery'

// OpenAI function-calling tool schemas
export const COPILOT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_workflow',
      description:
        'Get the current workflow state including all blocks (nodes) on the canvas, their configurations, values, positions, and all connections (edges) between them. Call this first before making any edits.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_available_blocks',
      description:
        'Get all available block types that can be added to the workflow, including their descriptions, configurable fields (sub-blocks), and input/output ports.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_block_details',
      description:
        'Get detailed configuration information about a specific block type, including all its configurable fields, options, and defaults.',
      parameters: {
        type: 'object',
        properties: {
          block_type: {
            type: 'string',
            description: 'The type of block to get details for (e.g., "agent", "api", "function")',
          },
        },
        required: ['block_type'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'edit_workflow',
      description:
        'Edit the workflow by adding/removing blocks, adding/removing connections, or updating block configuration values. You can batch multiple operations in one call.',
      parameters: {
        type: 'object',
        properties: {
          operations: {
            type: 'array',
            description: 'List of operations to perform on the workflow',
            items: {
              type: 'object',
              properties: {
                action: {
                  type: 'string',
                  enum: [
                    'add_block',
                    'remove_block',
                    'add_connection',
                    'remove_connection',
                    'update_block',
                  ],
                },
                block_type: {
                  type: 'string',
                  description: 'Block type to add (for add_block). Use get_available_blocks to see valid types.',
                },
                position: {
                  type: 'object',
                  properties: {
                    x: { type: 'number' },
                    y: { type: 'number' },
                  },
                  description: 'Canvas position for the new block (for add_block)',
                },
                block_id: {
                  type: 'string',
                  description: 'ID of the block to remove or update',
                },
                source_id: {
                  type: 'string',
                  description: 'Source block ID (for add_connection)',
                },
                target_id: {
                  type: 'string',
                  description: 'Target block ID (for add_connection)',
                },
                source_handle: {
                  type: 'string',
                  description: 'Source output handle (for add_connection, defaults to "output")',
                },
                target_handle: {
                  type: 'string',
                  description: 'Target input handle (for add_connection, defaults to "input")',
                },
                connection_id: {
                  type: 'string',
                  description: 'Edge ID to remove (for remove_connection)',
                },
                values: {
                  type: 'object',
                  description:
                    'Key-value pairs to set on the block (for add_block or update_block). Keys are sub-block IDs.',
                },
              },
              required: ['action'],
            },
          },
        },
        required: ['operations'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_workflow',
      description:
        'Execute the current workflow. This will run all blocks in topological order, passing data between them via variable references.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'explain_block',
      description:
        'Get detailed information about a specific block on the canvas, including its type, configuration, current field values, and connections.',
      parameters: {
        type: 'object',
        properties: {
          block_id: {
            type: 'string',
            description: 'The ID of the block to explain',
          },
        },
        required: ['block_id'],
      },
    },
  },
]

// Tool result interface
export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

// Edit operation interface
export interface EditOperation {
  action: string
  block_type?: string
  position?: { x: number; y: number }
  block_id?: string
  source_id?: string
  target_id?: string
  source_handle?: string
  target_handle?: string
  connection_id?: string
  values?: Record<string, unknown>
}

/**
 * Execute a tool on the server side (for tools that don't need client state)
 */
export function executeServerTool(
  name: string,
  args: Record<string, unknown>
): ToolResult {
  switch (name) {
    case 'get_available_blocks':
      return executeGetAvailableBlocks()
    case 'get_block_details':
      return executeGetBlockDetails(args)
    default:
      return { success: false, error: `Tool "${name}" requires client-side execution` }
  }
}

function executeGetAvailableBlocks(): ToolResult {
  const blocks = getAllBlocks()
  
  // Return minimal info to save tokens - use get_block_details for full config
  const formatted = blocks.map(block => ({
    type: block.type,
    name: block.name,
    category: block.category,
  }))

  return { 
    success: true, 
    data: {
      blocks: formatted,
      hint: 'Use get_block_details(block_type) for full configuration of a specific block'
    }
  }
}

function executeGetBlockDetails(args: Record<string, unknown>): ToolResult {
  const blockType = args.block_type as string
  if (!blockType) {
    return { success: false, error: 'block_type is required' }
  }

  const details = getBlockConfigDetails(blockType)
  return { success: true, data: details }
}

/**
 * Check if a tool requires client-side execution
 */
export function requiresClientExecution(toolName: string): boolean {
  const clientTools = ['get_workflow', 'edit_workflow', 'run_workflow', 'explain_block']
  return clientTools.includes(toolName)
}

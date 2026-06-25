import type { StoredTool } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/components/tool-input/types'
import type { BlockConfig } from '@/blocks/types'
import { AGENT_TOOL_BLOCK_TYPES } from '@/blocks/utils'

/**
 * Returns whether a block should appear in the Agent block tool picker.
 */
export function isAgentToolPickerBlock(block: BlockConfig): boolean {
  return (
    !block.hideFromToolbar &&
    (block.category === 'tools' || AGENT_TOOL_BLOCK_TYPES.has(block.type)) &&
    block.type !== 'evaluator' &&
    block.type !== 'mcp' &&
    block.type !== 'file'
  )
}

/**
 * Checks if an MCP tool is already selected.
 */
export function isMcpToolAlreadySelected(selectedTools: StoredTool[], mcpToolId: string): boolean {
  return selectedTools.some((tool) => tool.type === 'mcp' && tool.toolId === mcpToolId)
}

/**
 * Checks if a custom tool is already selected.
 */
export function isCustomToolAlreadySelected(
  selectedTools: StoredTool[],
  customToolId: string
): boolean {
  return selectedTools.some(
    (tool) => tool.type === 'custom-tool' && tool.customToolId === customToolId
  )
}

/**
 * Checks if a workflow is already selected.
 */
export function isWorkflowAlreadySelected(
  selectedTools: StoredTool[],
  workflowId: string
): boolean {
  return selectedTools.some(
    (tool) => tool.type === 'workflow_input' && tool.params?.workflowId === workflowId
  )
}

import type { StoredTool } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/editor/components/sub-block/components/tool-input/types'
import type { BlockConfig } from '@/blocks/types'
import { AGENT_TOOL_BLOCK_TYPES } from '@/blocks/utils'
import { START_FILES_REF } from '@/executor/constants'
import type { ToolParameterConfig } from '@/tools/params'

/** Agent tools whose LLM-facing params should not be locked by block UI defaults on add. */
const AGENT_TOOLS_SKIP_LLM_DEFAULT_SEEDING = new Set(['image_generator_v2', 'storyboard'])

const CORE_AGENT_TOOL_TYPES = new Set([
  'api',
  'webhook_request',
  'workflow',
  'workflow_input',
  'knowledge',
  'function',
  'table',
  'file_v5',
])

/**
 * Builds initial StoredTool.params when a block is added to the Agent tool picker.
 * User-or-llm params on image generator skip block defaults so the agent can set them
 * unless the workflow author explicitly configures values afterward.
 */
export function buildInitialAgentToolParams(
  blockType: string,
  userInputParameters: ToolParameterConfig[]
): Record<string, unknown> {
  const skipLlmDefaultSeeding = AGENT_TOOLS_SKIP_LLM_DEFAULT_SEEDING.has(blockType)
  const initialParams: Record<string, unknown> = {}

  for (const param of userInputParameters) {
    if (skipLlmDefaultSeeding && param.visibility === 'user-or-llm' && param.id !== 'inputImage') {
      continue
    }
    if (param.uiComponent?.value && initialParams[param.id] === undefined) {
      const defaultValue =
        typeof param.uiComponent.value === 'function'
          ? param.uiComponent.value()
          : param.uiComponent.value
      initialParams[param.id] = defaultValue
    }
  }

  if (
    (blockType === 'image_generator_v2' || blockType === 'image_generator') &&
    initialParams.inputImage === undefined
  ) {
    initialParams.inputImage = START_FILES_REF
  }

  return initialParams
}

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
 * Checks whether a registered block should appear in the agent tool picker.
 */
export function isAgentToolBlock(
  block: Pick<BlockConfig, 'category' | 'hideFromToolbar' | 'type'>
): boolean {
  return (
    !block.hideFromToolbar &&
    (block.category === 'tools' ||
      CORE_AGENT_TOOL_TYPES.has(block.type) ||
      AGENT_TOOL_BLOCK_TYPES.has(block.type))
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

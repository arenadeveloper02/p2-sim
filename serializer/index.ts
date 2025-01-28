import { BlockState, SubBlockState } from '@/stores/workflow/types' 
import { Edge } from 'reactflow' 
import { SerializedBlock, SerializedConnection, SerializedWorkflow, BlockConfig, ParamType, OutputType } from './types' 
import { getBlock, getBlockTypeForTool } from '@/blocks' 
import { resolveOutputType } from '@/blocks/utils'

export class Serializer {
  serializeWorkflow(blocks: Record<string, BlockState>, edges: Edge[]): SerializedWorkflow {
    return {
      version: '1.0',
      blocks: Object.values(blocks).map(block => this.serializeBlock(block)),
      connections: edges.map(edge => ({
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle || undefined,
        targetHandle: edge.targetHandle || undefined
      }))
    } 
  }

  private serializeBlock(block: BlockState): SerializedBlock {
    const blockConfig = getBlock(block.type) 
    if (!blockConfig) {
      throw new Error(`Invalid block type: ${block.type}`) 
    }

    // Get tool ID from block config
    const toolId = blockConfig.tools.config?.tool
      ? blockConfig.tools.config.tool(this.extractParams(block))
      : blockConfig.tools.access[0]

    // Extract params from subBlocks
    const params = this.extractParams(block)

    // Get input interface from block config
    const inputs: Record<string, ParamType> = {}

    // Map inputs from block config
    if (blockConfig.workflow.inputs) {
      Object.entries(blockConfig.workflow.inputs).forEach(([key, config]) => {
        inputs[key] = config.type as ParamType
      })
    }

    // Use the block's actual output types
    const outputs = block.outputs

    return {
      id: block.id,
      position: block.position,
      config: {
        tool: toolId,
        params,
        interface: {
          inputs,
          outputs
        }
      },
      metadata: {
        title: block.name,
        description: blockConfig.toolbar.description,
        category: blockConfig.toolbar.category,
        color: blockConfig.toolbar.bgColor
      }
    } 
  }

  private extractParams(block: BlockState): Record<string, any> {
    const params: Record<string, any> = {}
    Object.entries(block.subBlocks).forEach(([id, subBlock]) => {
      params[id] = subBlock.value
    })
    return params
  }

  deserializeWorkflow(workflow: SerializedWorkflow): { blocks: Record<string, BlockState>, edges: Edge[] } {
    const blocks: Record<string, BlockState> = {}
    const edges: Edge[] = []

    // Deserialize blocks
    workflow.blocks.forEach(serializedBlock => {
      const block = this.deserializeBlock(serializedBlock)
      blocks[block.id] = block
    })

    // Deserialize connections
    workflow.connections.forEach(connection => {
      edges.push({
        id: crypto.randomUUID(),
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle
      })
    })

    return { blocks, edges }
  }

  private deserializeBlock(serializedBlock: SerializedBlock): BlockState {
    const blockType = getBlockTypeForTool(serializedBlock.config.tool)
    if (!blockType) {
      throw new Error(`Invalid tool ID: ${serializedBlock.config.tool}`)
    }

    const blockConfig = getBlock(blockType)
    if (!blockConfig) {
      throw new Error(`Invalid block type: ${blockType}`)
    }

    const subBlocks: Record<string, any> = {}
    blockConfig.workflow.subBlocks.forEach(subBlock => {
      subBlocks[subBlock.id] = {
        id: subBlock.id,
        type: subBlock.type,
        value: serializedBlock.config.params[subBlock.id] ?? null
      }
    })

    const outputs = resolveOutputType(blockConfig.workflow.outputs, subBlocks)

    return {
      id: serializedBlock.id,
      type: blockType,
      name: serializedBlock.metadata?.title || blockConfig.toolbar.title,
      position: serializedBlock.position,
      subBlocks,
      outputs
    }
  }
}
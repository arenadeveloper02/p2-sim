import { BlockState, SubBlockState } from '@/stores/workflow/types';
import { Edge } from 'reactflow';
import { SerializedBlock, SerializedConnection, SerializedWorkflow } from './types';
import { getBlock } from '@/blocks';
import { OutputType, SubBlockType } from '@/blocks/types';

export class Serializer {
  serializeWorkflow(blocks: Record<string, BlockState>, connections: Edge[]): SerializedWorkflow {
    return {
      version: '1.0',
      blocks: Object.values(blocks).map(block => this.serializeBlock(block)),
      connections: connections.map(conn => ({
        source: conn.source,
        target: conn.target,
        sourceHandle: conn.sourceHandle || undefined,
        targetHandle: conn.targetHandle || undefined
      }))
    };
  }

  private serializeBlock(block: BlockState): SerializedBlock {
    const blockConfig = getBlock(block.type);
    if (!blockConfig) {
      throw new Error(`Block configuration not found for type: ${block.type}`);
    }

    // Get the tool ID from the block's configuration
    const tools = blockConfig.workflow.tools;
    if (!tools?.access || tools.access.length === 0) {
      throw new Error(`No tools specified for block type: ${block.type}`);
    }

    // Get all values from subBlocks
    const params: Record<string, any> = {};
    Object.entries(block.subBlocks || {}).forEach(([id, subBlock]) => {
      if (subBlock?.value !== undefined) {
        params[id] = subBlock.value;
      }
    });

    // Get the tool ID from the block's configuration
    const toolId = tools.config?.tool?.(params) || params.tool || tools.access[0];
    if (!toolId || !tools.access.includes(toolId)) {
      throw new Error(`Invalid or unauthorized tool: ${toolId}`);
    }

    return {
      id: block.id,
      position: block.position,
      config: {
        tool: toolId,
        params: params,
        interface: {
          inputs: blockConfig.workflow.inputs || {},
          outputs: {
            output: block.outputType
          }
        }
      }
    };
  }

  deserializeWorkflow(serialized: SerializedWorkflow): {
    blocks: Record<string, BlockState>;
    connections: Edge[];
  } {
    const blocks: Record<string, BlockState> = {};
    serialized.blocks.forEach(block => {
      const deserialized = this.deserializeBlock(block);
      blocks[deserialized.id] = deserialized;
    });

    return {
      blocks,
      connections: serialized.connections.map(conn => ({
        id: `${conn.source}-${conn.target}`,
        source: conn.source,
        target: conn.target,
        sourceHandle: conn.sourceHandle || null,
        targetHandle: conn.targetHandle || null
      }))
    };
  }

  private deserializeBlock(serialized: SerializedBlock): BlockState {
    return {
      id: serialized.id,
      type: serialized.config.tool,
      name: `${serialized.config.tool} Block`,
      position: serialized.position,
      subBlocks: Object.entries(serialized.config.params).reduce((acc, [key, value]) => {
        acc[key] = {
          id: key,
          type: this.inferSubBlockType(value),
          value: value
        };
        return acc;
      }, {} as Record<string, SubBlockState>),
      outputType: serialized.config.interface.outputs.output as OutputType
    };
  }

  private inferSubBlockType(value: any): SubBlockType {
    if (Array.isArray(value) && Array.isArray(value[0])) {
      return 'table';
    }
    if (typeof value === 'string' && value.length > 100) {
      return 'long-input';
    }
    return 'short-input';
  }
}
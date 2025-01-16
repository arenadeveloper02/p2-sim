import { BlockConfig, SubBlockConfig, BlockType } from "@/blocks/types/block";
import { Connection, Node } from "reactflow";
import { SerializedBlock, SerializedConnection, SerializedWorkflow } from "./types";

export class Serializer {
  serializeWorkflow(blocks: Node<BlockConfig>[], connections: Connection[]): SerializedWorkflow {
    return {
      version: '1.0',
      blocks: blocks.map(block => this.serializeBlock(block)),
      connections: connections.map(conn => ({
        source: conn.source || '',
        target: conn.target || '',
        sourceHandle: conn.sourceHandle || undefined,
        targetHandle: conn.targetHandle || undefined
      }))
    };
  }

  private serializeBlock(block: Node<BlockConfig>): SerializedBlock {
    const values = this.extractSubBlockValues(block.data);

    return {
      id: block.id,
      type: block.data.type,
      position: {
        x: block.position.x,
        y: block.position.y
      },
      config: {
        ...values,
        inputs: block.data.workflow.inputs,
        outputs: block.data.workflow.outputs
      }
    };
  }

  private extractSubBlockValues(block: BlockConfig): Record<string, any> {
    return block.workflow.subBlocks.reduce((acc, subBlock: SubBlockConfig) => {
      const key = subBlock.title.toLowerCase().replace(/\s/g, '_');
      let value: any;

      switch (subBlock.type) {
        case 'long-input':
        case 'short-input':
          value = '';
          break;
        case 'dropdown':
          value = subBlock.options?.[0] || '';
          break;
        case 'slider':
          value = subBlock.min || 0;
          break;
        case 'code':
          value = '';
          break;
        default:
          value = null;
      }

      return {
        ...acc,
        [key]: value
      };
    }, {});
  }

  deserializeWorkflow(serialized: SerializedWorkflow): {
    blocks: Node<Partial<BlockConfig>>[];
    connections: Partial<Connection>[];
  } {
    return {
      blocks: serialized.blocks.map(block => this.deserializeBlock(block)),
      connections: serialized.connections.map(conn => ({
        id: `${conn.source}-${conn.target}`,
        source: conn.source,
        target: conn.target,
        sourceHandle: conn.sourceHandle || null,
        targetHandle: conn.targetHandle || null
      }))
    };
  }

  private deserializeBlock(serialized: SerializedBlock): Node<Partial<BlockConfig>> {
    return {
      id: serialized.id,
      type: 'custom', // or whatever node type you use in ReactFlow
      position: serialized.position,
      data: {
        type: serialized.type as BlockType,
        workflow: {
          inputs: serialized.config.inputs,
          outputs: serialized.config.outputs,
          subBlocks: []
        }
      }
    };
  }
}
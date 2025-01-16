import { Node, Edge } from "reactflow";
import { SerializedBlock, SerializedConnection, SerializedWorkflow } from "./types";

export class Serializer {
  serializeWorkflow(blocks: Node[], connections: Edge[]): SerializedWorkflow {
    return {
      version: '1.0',
      blocks: blocks.map(block => this.serializeBlock(block)),
      connections: connections.map(conn => ({
        source: conn.source,
        target: conn.target,
        sourceHandle: conn.sourceHandle || undefined,
        targetHandle: conn.targetHandle || undefined
      }))
    };
  }

  private serializeBlock(block: Node): SerializedBlock {
    const { data } = block;
    const serialized: SerializedBlock = {
      id: block.id,
      position: {
        x: block.position.x,
        y: block.position.y
      },
      config: {
        tool: data.tool,
        params: data.params || {},
        interface: {
          inputs: data.interface?.inputs || {},
          outputs: data.interface?.outputs || {}
        }
      }
    };

    const metadata = {
      title: data.title,
      description: data.description,
      category: data.category,
      icon: data.icon,
      color: data.color
    };

    if (Object.values(metadata).some(value => value !== undefined)) {
      serialized.metadata = metadata;
    }

    return serialized;
  }

  deserializeWorkflow(serialized: SerializedWorkflow): {
    blocks: Node[];
    connections: Edge[];
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

  private deserializeBlock(serialized: SerializedBlock): Node {
    return {
      id: serialized.id,
      type: 'custom',
      position: serialized.position,
      data: {
        tool: serialized.config.tool,
        params: serialized.config.params,
        interface: serialized.config.interface,
        ...(serialized.metadata || {})
      }
    };
  }
}
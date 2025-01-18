export interface SerializedWorkflow {
  version: string;
  blocks: SerializedBlock[];
  connections: SerializedConnection[];
}

export interface SerializedConnection {
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface Position {
  x: number;
  y: number;
}

export interface BlockConfig {
  tool: string;
  params: Record<string, any>;
  interface: {
    inputs: Record<string, string>;
    outputs: Record<string, string>;
  };
}

export interface SerializedBlock {
  id: string;
  position: Position;
  config: BlockConfig;
  metadata?: {
    title?: string;
    description?: string;
    category?: string;
    icon?: string;
    color?: string;
  };
}

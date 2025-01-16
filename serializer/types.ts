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

export interface SerializedBlock {
  id: string;
  position: Position;
  config: {
    // The tool this block uses
    tool: string;
    // Tool-specific parameters
    params: Record<string, any>;
    // Block's input/output interface
    interface: {
      inputs: Record<string, string>;
      outputs: Record<string, string>;
    };
  };
  // UI-specific metadata (optional)
  metadata?: {
    title?: string;
    description?: string;
    category?: string;
    icon?: string;
    color?: string;
  };
}

export interface SubBlockValue {
  title: string;
  type: 'long-input' | 'short-input' | 'dropdown' | 'slider' | 'code';
  value: string | number | boolean;
}

export interface BlockValues {
  [key: string]: string | number | boolean;
}

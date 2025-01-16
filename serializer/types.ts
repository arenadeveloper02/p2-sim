import { BlockConfig } from "@/blocks/types/block";

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
  type: string;
  position: Position;
  config: {
    inputs: Record<string, string>;
    outputs: Record<string, string>;
    [key: string]: any;
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

import { BlockConfig } from './types'

// Import blocks
import { AgentBlock } from './blocks/agent'
import { ApiBlock } from './blocks/api'
import { FunctionBlock } from './blocks/function'

// Export blocks for ease of use
export { AgentBlock, ApiBlock, FunctionBlock }

// Combined blocks registry
export const BLOCKS: BlockConfig[] = [
  AgentBlock,
  ApiBlock,
  FunctionBlock,
]

// Helper functions
export const getBlock = (type: string): BlockConfig | undefined =>
  BLOCKS.find(block => block.type === type)

export const getBlocksByCategory = (category: 'basic' | 'advanced'): BlockConfig[] =>
  BLOCKS.filter(block => block.toolbar.category === category)

export const getAllBlockTypes = (): string[] =>
  BLOCKS.map(block => block.type)

export const isValidBlockType = (type: string): type is string =>
  BLOCKS.some(block => block.type === type)